import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.server import Server
from app.models.traffic import DailyTraffic
from app.utils.port_policy import (
    SHADOWSOCKS_PORT_MAX,
    SHADOWSOCKS_PORT_MIN,
    validate_shadowsocks_range,
    validate_vless_port,
)
from app.utils.short_codes import short_secret, short_uuid

router = APIRouter(prefix="/servers", tags=["servers"], dependencies=[Depends(get_current_admin)])

_AGENT_SYNC_FIELDS = {
    "host",
    "port_range_start",
    "port_range_end",
    "method",
    "vless_host",
    "vless_port",
    "vless_public_key",
    "vless_short_id",
    "vless_sni",
}


def _server_payload(server: Server) -> dict:
    return {
        **{c.key: getattr(server, c.key) for c in server.__table__.columns},
        "server_code": short_uuid(server.id),
        "agent_secret_short": short_secret(server.agent_secret),
    }


class ServerCreate(BaseModel):
    name: str
    host: str
    api_port: int = 8080
    port_range_start: int = SHADOWSOCKS_PORT_MIN
    port_range_end: int = SHADOWSOCKS_PORT_MAX
    method: str = "chacha20-ietf-poly1305"

    @field_validator("port_range_start", "port_range_end")
    @classmethod
    def valid_port(cls, v: int) -> int:
        if not (SHADOWSOCKS_PORT_MIN <= v <= SHADOWSOCKS_PORT_MAX):
            raise ValueError(f"Shadowsocks ports must be between {SHADOWSOCKS_PORT_MIN} and {SHADOWSOCKS_PORT_MAX}")
        return v

    @model_validator(mode="after")
    def range_order(self) -> "ServerCreate":
        validate_shadowsocks_range(self.port_range_start, self.port_range_end)
        return self


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    is_active: Optional[bool] = None
    port_range_start: Optional[int] = None
    port_range_end: Optional[int] = None
    method: Optional[str] = None
    adguard_password: Optional[str] = None
    xui_url: Optional[str] = None
    xui_username: Optional[str] = None
    xui_password: Optional[str] = None
    xui_inbound_id: Optional[int] = None
    vless_host: Optional[str] = None
    vless_port: Optional[int] = None
    vless_public_key: Optional[str] = None
    vless_short_id: Optional[str] = None
    vless_sni: Optional[str] = None

    @field_validator("port_range_start", "port_range_end")
    @classmethod
    def valid_shadow_port(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (SHADOWSOCKS_PORT_MIN <= v <= SHADOWSOCKS_PORT_MAX):
            raise ValueError(f"Shadowsocks ports must be between {SHADOWSOCKS_PORT_MIN} and {SHADOWSOCKS_PORT_MAX}")
        return v

    @field_validator("vless_port")
    @classmethod
    def valid_vless_port(cls, v: Optional[int]) -> Optional[int]:
        validate_vless_port(v)
        return v

    @model_validator(mode="after")
    def range_order(self) -> "ServerUpdate":
        if self.port_range_start is not None and self.port_range_end is not None:
            validate_shadowsocks_range(self.port_range_start, self.port_range_end)
        return self


@router.get("")
async def list_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server))
    return [_server_payload(server) for server in result.scalars().all()]


@router.post("", status_code=201)
async def create_server(body: ServerCreate, db: AsyncSession = Depends(get_db)):
    server = Server(**body.model_dump(), agent_secret=secrets.token_hex(32))
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return _server_payload(server)


@router.get("/{server_id}")
async def get_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    return _server_payload(server)


@router.patch("/{server_id}")
async def update_server(server_id: uuid.UUID, body: ServerUpdate, db: AsyncSession = Depends(get_db)):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    data = body.model_dump(exclude_unset=True)
    start = data.get("port_range_start", server.port_range_start)
    end = data.get("port_range_end", server.port_range_end)
    try:
        validate_shadowsocks_range(start, end)
        validate_vless_port(data.get("vless_port", server.vless_port))
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    for k, v in data.items():
        setattr(server, k, v)
    if _AGENT_SYNC_FIELDS.intersection(data):
        server.force_sync = True
    await db.commit()
    await db.refresh(server)
    return _server_payload(server)


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    await db.execute(delete(DailyTraffic).where(DailyTraffic.server_id == server_id))
    await db.delete(server)
    await db.commit()


@router.post("/{server_id}/adguard")
async def toggle_adguard(server_id: uuid.UUID, enabled: bool, db: AsyncSession = Depends(get_db)):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    server.adguard_enabled = enabled
    await db.commit()
    return {"adguard_enabled": server.adguard_enabled}
