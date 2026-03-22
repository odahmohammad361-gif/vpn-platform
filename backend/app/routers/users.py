import uuid
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.user import User, UserServer
from app.models.server import Server

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(get_current_admin)])


class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    quota_bytes: int = 0
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None


class UserUpdate(BaseModel):
    quota_bytes: Optional[int] = None
    expires_at: Optional[datetime] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_users(
    active: Optional[bool] = None,
    page: int = 1,
    limit: int = 50,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(User)
    if active is not None:
        q = q.where(User.is_active == active)
    if search:
        q = q.where(User.username.ilike(f"%{search}%"))
    q = q.offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", status_code=201)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    user = User(**body.model_dump())
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}")
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.patch("/{user_id}")
async def update_user(user_id: uuid.UUID, body: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    await db.delete(user)
    await db.commit()


@router.post("/{user_id}/enable")
async def enable_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = True
    user.disabled_reason = None
    await db.commit()
    return {"status": "enabled"}


@router.post("/{user_id}/disable")
async def disable_user(user_id: uuid.UUID, reason: str = "manual", db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = False
    user.disabled_reason = reason
    await db.commit()
    return {"status": "disabled"}


@router.post("/{user_id}/reset-quota")
async def reset_quota(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.bytes_used = 0
    await db.commit()
    return {"status": "quota reset"}


@router.post("/{user_id}/servers/{server_id}", status_code=201)
async def assign_server(user_id: uuid.UUID, server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    server = await db.get(Server, server_id)
    if not user or not server:
        raise HTTPException(404, "User or Server not found")

    # Allocate next free port
    used_ports = await db.execute(
        select(UserServer.port).where(UserServer.server_id == server_id)
    )
    taken = set(used_ports.scalars().all())
    free_port = next(
        (p for p in range(server.port_range_start, server.port_range_end + 1) if p not in taken),
        None
    )
    if free_port is None:
        raise HTTPException(409, "No free ports on this server")

    slot = UserServer(
        user_id=user_id,
        server_id=server_id,
        port=free_port,
        password=secrets.token_hex(16),
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)
    return slot


@router.delete("/{user_id}/servers/{server_id}", status_code=204)
async def remove_server(user_id: uuid.UUID, server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserServer).where(
            UserServer.user_id == user_id,
            UserServer.server_id == server_id
        )
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(404, "Assignment not found")
    await db.delete(slot)
    await db.commit()


@router.get("/{user_id}/subscription")
async def get_subscription_urls(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    base = "https://52.77.235.166:8443"
    token = user.subscription_token
    return {
        "shadowrocket": f"{base}/sub/{token}",
        "clash": f"{base}/sub/{token}?format=clash",
        "v2rayng": f"{base}/sub/{token}?format=v2rayng",
    }
