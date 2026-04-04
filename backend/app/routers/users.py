import uuid
import secrets
import calendar
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, delete, update, func, distinct
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.user import User, UserServer
from app.models.server import Server
from app.models.traffic import DailyTraffic, TrafficLog
from app.models.plan import Plan
from app.models.device import Device
from app.config import settings
from app.services.xui import add_vless_client, delete_vless_client, set_vless_client_enabled


def _add_months(dt: datetime, months: int) -> datetime:
    month = (dt.month - 1 + months) % 12 + 1
    year = dt.year + (dt.month - 1 + months) // 12
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)

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


async def _device_counts(db: AsyncSession, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Return number of unique IPs that have fetched this user's subscription."""
    if not user_ids:
        return {}
    rows = await db.execute(
        select(Device.user_id, func.count(Device.ip_address))
        .where(Device.user_id.in_(user_ids))
        .group_by(Device.user_id)
    )
    return {row[0]: row[1] for row in rows.all()}


@router.get("")
async def list_users(
    active: Optional[bool] = None,
    page: int = 1,
    limit: int = 50,  # capped below
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    limit = min(limit, 100)
    page = max(page, 1)
    q = select(User).where(User.deleted_at == None)
    if active is not None:
        q = q.where(User.is_active == active)
    if search:
        q = q.where(User.username.ilike(f"%{search}%"))
    q = q.offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    users = result.scalars().all()

    device_counts = await _device_counts(db, [u.id for u in users])

    return [
        {
            **{c.key: getattr(u, c.key) for c in u.__table__.columns},
            "active_devices": device_counts.get(u.id, 0),
        }
        for u in users
    ]


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
    if not user or user.deleted_at is not None:
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
    # Soft delete — keep all traffic data, just hide the user and remove from servers
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    user.disabled_reason = "deleted"
    # Remove UserServer rows so ports are freed and agent stops serving this user
    affected = await db.execute(select(UserServer.server_id).where(UserServer.user_id == user_id))
    server_ids = affected.scalars().all()
    await db.execute(delete(UserServer).where(UserServer.user_id == user_id))
    if server_ids:
        await db.execute(
            update(Server).where(Server.id.in_(server_ids)).values(force_sync=True)
        )
    await db.commit()


@router.post("/{user_id}/enable")
async def enable_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = True
    user.disabled_reason = None
    await db.commit()
    # Re-enable VLESS clients
    rows = await db.execute(
        select(UserServer, Server).join(Server, UserServer.server_id == Server.id)
        .where(UserServer.user_id == user_id)
    )
    for slot, server in rows.all():
        if slot.vless_uuid and server.xui_url and server.xui_inbound_id:
            await set_vless_client_enabled(
                server.xui_url, server.xui_username, server.xui_password,
                server.xui_inbound_id, slot.vless_uuid, user.username, True,
            )
    return {"status": "enabled"}


@router.post("/{user_id}/disable")
async def disable_user(user_id: uuid.UUID, reason: str = "manual", db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = False
    user.disabled_reason = reason
    # Force re-sync so agent removes this user's port from shadowsocks
    rows = await db.execute(
        select(UserServer, Server).join(Server, UserServer.server_id == Server.id)
        .where(UserServer.user_id == user_id)
    )
    server_ids = []
    for slot, server in rows.all():
        server_ids.append(server.id)
        if slot.vless_uuid and server.xui_url and server.xui_inbound_id:
            await set_vless_client_enabled(
                server.xui_url, server.xui_username, server.xui_password,
                server.xui_inbound_id, slot.vless_uuid, user.username, False,
            )
    if server_ids:
        await db.execute(
            update(Server).where(Server.id.in_(server_ids)).values(force_sync=True)
        )
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

    # Lock port rows to prevent race conditions
    used_ports = await db.execute(
        select(UserServer.port).where(UserServer.server_id == server_id).with_for_update()
    )
    taken = set(used_ports.scalars().all())

    # Use the same port+password this user already has on another server
    existing_slot_result = await db.execute(
        select(UserServer.port, UserServer.password).where(UserServer.user_id == user_id).limit(1)
    )
    existing_slot = existing_slot_result.first()
    preferred_port = existing_slot.port if existing_slot else None
    shared_password = existing_slot.password if existing_slot else str(uuid.uuid4())

    if (preferred_port
            and preferred_port not in taken
            and server.port_range_start <= preferred_port <= server.port_range_end):
        free_port = preferred_port
    else:
        # Always use max+1 — never reuse a port that was previously assigned
        max_port_result = await db.execute(
            select(func.max(UserServer.port)).where(UserServer.server_id == server_id)
        )
        max_port = max_port_result.scalar() or (server.port_range_start - 1)
        free_port = max_port + 1
        if free_port > server.port_range_end:
            raise HTTPException(409, "No free ports on this server")

    vless_uuid = str(uuid.uuid4())
    slot = UserServer(
        user_id=user_id,
        server_id=server_id,
        port=free_port,
        password=shared_password,
        vless_uuid=vless_uuid,
    )
    db.add(slot)
    await db.commit()
    await db.refresh(slot)

    # Create VLESS client in x-ui if this server has x-ui configured
    if server.xui_url and server.xui_inbound_id:
        await add_vless_client(
            server.xui_url, server.xui_username, server.xui_password,
            server.xui_inbound_id, vless_uuid, user.username,
        )

    return slot


@router.get("/{user_id}/servers")
async def list_user_servers(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UserServer).where(UserServer.user_id == user_id))
    return result.scalars().all()


@router.delete("/{user_id}/servers/{server_id}", status_code=204)
async def remove_server(user_id: uuid.UUID, server_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserServer, Server)
        .join(Server, UserServer.server_id == Server.id)
        .where(UserServer.user_id == user_id, UserServer.server_id == server_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(404, "Assignment not found")
    slot, server = row
    if slot.vless_uuid and server.xui_url and server.xui_inbound_id:
        await delete_vless_client(
            server.xui_url, server.xui_username, server.xui_password,
            server.xui_inbound_id, slot.vless_uuid,
        )
    await db.delete(slot)
    await db.commit()


@router.get("/{user_id}/subscription")
async def get_subscription_urls(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    base = settings.SUBSCRIPTION_BASE_URL
    token = user.subscription_token
    return {
        "shadowrocket": f"{base}/sub/{token}",
        "clash": f"{base}/sub/{token}?format=clash",
        "v2rayng": f"{base}/sub/{token}?format=v2rayng",
        "surge": f"{base}/sub/{token}?format=surge",
    }


@router.post("/{user_id}/assign-plan")
async def assign_plan(user_id: uuid.UUID, plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")

    now = datetime.now(timezone.utc)
    user.plan_id = plan.id
    user.plan_started_at = now
    user.quota_bytes = plan.monthly_quota_bytes
    user.bytes_used = 0
    user.expires_at = _add_months(now, plan.duration_months)
    user.next_reset_at = _add_months(now, 1)
    user.is_active = True
    user.disabled_reason = None

    # Auto-assign ALL active servers that are not already assigned
    all_servers_result = await db.execute(select(Server).where(Server.is_active == True))
    all_servers = all_servers_result.scalars().all()

    existing_result = await db.execute(
        select(UserServer.server_id).where(UserServer.user_id == user_id)
    )
    already_assigned = set(existing_result.scalars().all())

    for server in all_servers:
        if server.id in already_assigned:
            continue
        # Reuse existing port/password if user has them on another server
        existing_slot_result = await db.execute(
            select(UserServer.port, UserServer.password).where(UserServer.user_id == user_id).limit(1)
        )
        existing_slot = existing_slot_result.first()
        shared_password = existing_slot.password if existing_slot else str(uuid.uuid4())

        max_port_result = await db.execute(
            select(func.max(UserServer.port)).where(UserServer.server_id == server.id)
        )
        max_port = max_port_result.scalar() or (server.port_range_start - 1)

        if existing_slot and existing_slot.port not in set(
            (await db.execute(select(UserServer.port).where(UserServer.server_id == server.id))).scalars().all()
        ):
            free_port = existing_slot.port
        else:
            free_port = max_port + 1

        if free_port > server.port_range_end:
            continue  # Skip if no free ports on this server

        vless_uuid = str(uuid.uuid4())
        slot = UserServer(
            user_id=user_id,
            server_id=server.id,
            port=free_port,
            password=shared_password,
            vless_uuid=vless_uuid,
        )
        db.add(slot)

        if server.xui_url and server.xui_inbound_id:
            await add_vless_client(
                server.xui_url, server.xui_username, server.xui_password,
                server.xui_inbound_id, vless_uuid, user.username,
            )

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/extend-quota")
async def extend_quota(user_id: uuid.UUID, extra_gb: float, db: AsyncSession = Depends(get_db)):
    """Add extra GB to a user's quota without resetting plan or bytes_used."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if extra_gb <= 0:
        raise HTTPException(400, "extra_gb must be positive")
    user.quota_bytes += int(extra_gb * 1e9)
    user.is_active = True
    user.disabled_reason = None
    await db.commit()
    await db.refresh(user)
    return {"quota_bytes": user.quota_bytes, "added_bytes": int(extra_gb * 1e9)}


@router.post("/{user_id}/remove-plan")
async def remove_plan(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.plan_id = None
    user.plan_started_at = None
    user.next_reset_at = None
    await db.commit()
    return {"status": "plan removed"}
