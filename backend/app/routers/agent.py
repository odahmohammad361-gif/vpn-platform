import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.server import Server
from app.models.user import User, UserServer
from app.models.traffic import TrafficLog
from app.utils.crypto import verify_agent_signature
from app.utils.port_policy import is_vless_port
from app.utils.short_codes import resolve_server_ref, short_secret

router = APIRouter(prefix="/agent", tags=["agent"])


async def authenticate_agent(
    request: Request,
    server_id: str,
    x_agent_timestamp: str = Header(...),
    x_agent_signature: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    server = await resolve_server_ref(db, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    body = (await request.body()).decode()
    secret8 = short_secret(server.agent_secret)
    valid = any(
        verify_agent_signature(sid, secret, x_agent_timestamp, body, x_agent_signature)
        for sid, secret in (
            (server_id, server.agent_secret),
            (server_id, secret8),
            (str(server.id), server.agent_secret),
            (str(server.id), secret8),
        )
    )
    if not valid:
        raise HTTPException(401, "Invalid agent signature")
    return server


@router.get("/config/{server_id}")
async def get_config(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    result = await db.execute(
        select(UserServer, User)
        .join(User, UserServer.user_id == User.id)
        .where(UserServer.server_id == server.id)
        .where(User.is_active == True)
    )
    rows = result.all()
    vless_enabled = bool(server.vless_sni and is_vless_port(server.vless_port))
    vless_is_reality = bool(server.vless_public_key and server.vless_short_id)
    vless_transport = "tcp" if vless_is_reality else "grpc"
    vless_security = "reality" if vless_is_reality else "tls"
    vless_service_name = None if vless_is_reality else (server.vless_short_id or "grpc")

    entries = []
    for us, user in rows:
        entry = {
            "user_server_id": str(us.id),
            "username": user.username,
            "port": us.port,
            "password": us.password,
            "method": server.method,
        }
        if vless_enabled and us.vless_uuid:
            entry.update({
                "vless_uuid": us.vless_uuid,
                "vless_port": server.vless_port,
                "vless_host": server.vless_host or server.host,
                "vless_sni": server.vless_sni,
                "vless_transport": vless_transport,
                "vless_security": vless_security,
                "vless_grpc_service_name": vless_service_name,
                "vless_packet_encoding": "xudp",
            })
        entries.append(entry)
    return entries


class TrafficEntry(BaseModel):
    user_server_id: uuid.UUID
    upload_bytes: int
    download_bytes: int
    interval_sec: int = 30
    client_ip: Optional[str] = None


@router.post("/traffic/{server_id}")
async def report_traffic(
    server_id: str,
    entries: list[TrafficEntry],
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    if len(entries) > 5000:
        raise HTTPException(400, "Too many traffic entries")
    now = datetime.now(timezone.utc)
    for entry in entries:
        log = TrafficLog(
            user_server_id=entry.user_server_id,
            upload_bytes=entry.upload_bytes,
            download_bytes=entry.download_bytes,
            agent_interval_sec=entry.interval_sec,
            client_ip=entry.client_ip,
        )
        db.add(log)
        if entry.client_ip:
            await db.execute(
                update(UserServer)
                .where(UserServer.id == entry.user_server_id)
                .values(last_client_ip=entry.client_ip, last_seen_at=now)
            )

    # bytes_used and quota enforcement handled by scheduler (process_traffic)
    await db.commit()
    return {"status": "ok"}


@router.post("/heartbeat/{server_id}")
async def heartbeat(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    server.last_seen_at = datetime.utcnow()
    await db.commit()

    # Check if there are unsynced slots
    result = await db.execute(
        select(UserServer).where(
            UserServer.server_id == server.id,
            UserServer.is_synced == False
        ).limit(1)
    )
    sync_required = server.force_sync or (result.scalar_one_or_none() is not None)
    return {"sync_required": sync_required, "adguard_enabled": server.adguard_enabled}


@router.post("/sync-ack/{server_id}")
async def sync_ack(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    await db.execute(
        update(UserServer)
        .where(UserServer.server_id == server.id)
        .values(is_synced=True)
    )
    server.force_sync = False
    await db.commit()
    return {"status": "synced"}
