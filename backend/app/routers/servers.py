import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.server import Server

router = APIRouter(prefix="/servers", tags=["servers"], dependencies=[Depends(get_current_admin)])


class ServerCreate(BaseModel):
    name: str
    host: str
    api_port: int = 8080
    port_range_start: int = 20000
    port_range_end: int = 29999
    method: str = "chacha20-ietf-poly1305"


class ServerUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_servers(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Server))
    return result.scalars().all()


@router.post("", status_code=201)
async def create_server(body: ServerCreate, db: AsyncSession = Depends(get_db)):
    server = Server(**body.model_dump(), agent_secret=secrets.token_hex(32))
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server


@router.get("/{server_id}")
async def get_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    return server


@router.patch("/{server_id}")
async def update_server(server_id: uuid.UUID, body: ServerUpdate, db: AsyncSession = Depends(get_db)):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(server, k, v)
    await db.commit()
    await db.refresh(server)
    return server


@router.delete("/{server_id}", status_code=204)
async def delete_server(server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    await db.delete(server)
    await db.commit()
