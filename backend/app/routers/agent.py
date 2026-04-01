import uuid
import json
from datetime import datetime
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

router = APIRouter(prefix="/agent", tags=["agent"])


async def authenticate_agent(
    request: Request,
    server_id: uuid.UUID,
    x_agent_timestamp: str = Header(...),
    x_agent_signature: str = Header(...),
    db: AsyncSession = Depends(get_db),
):
    server = await db.get(Server, server_id)
    if not server:
        raise HTTPException(404, "Server not found")
    body = (await request.body()).decode()
    if not verify_agent_signature(str(server_id), server.agent_secret, x_agent_timestamp, body, x_agent_signature):
        raise HTTPException(401, "Invalid agent signature")
    return server


@router.get("/config/{server_id}")
async def get_config(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    result = await db.execute(
        select(UserServer, User)
        .join(User, UserServer.user_id == User.id)
        .where(UserServer.server_id == server_id)
        .where(User.is_active == True)
    )
    rows = result.all()
    return [
        {
            "user_server_id": str(us.id),
            "port": us.port,
            "password": us.password,
            "method": server.method,
        }
        for us, user in rows
    ]


class TrafficEntry(BaseModel):
    user_server_id: uuid.UUID
    upload_bytes: int
    download_bytes: int
    interval_sec: int = 30


@router.post("/traffic/{server_id}")
async def report_traffic(
    server_id: uuid.UUID,
    entries: list[TrafficEntry],
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    if len(entries) > 5000:
        raise HTTPException(400, "Too many traffic entries")
    for entry in entries:
        log = TrafficLog(
            user_server_id=entry.user_server_id,
            upload_bytes=entry.upload_bytes,
            download_bytes=entry.download_bytes,
            agent_interval_sec=entry.interval_sec,
        )
        db.add(log)

    # bytes_used and quota enforcement handled by scheduler (process_traffic)
    await db.commit()
    return {"status": "ok"}


@router.post("/heartbeat/{server_id}")
async def heartbeat(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    server.last_seen_at = datetime.utcnow()
    await db.commit()

    # Check if there are unsynced slots
    result = await db.execute(
        select(UserServer).where(
            UserServer.server_id == server_id,
            UserServer.is_synced == False
        )
    )
    sync_required = server.force_sync or (result.scalar_one_or_none() is not None)
    return {"sync_required": sync_required, "adguard_enabled": server.adguard_enabled}


@router.post("/sync-ack/{server_id}")
async def sync_ack(
    server_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    server: Server = Depends(authenticate_agent),
):
    await db.execute(
        update(UserServer)
        .where(UserServer.server_id == server_id)
        .values(is_synced=True)
    )
    server.force_sync = False
    await db.commit()
    return {"status": "synced"}
