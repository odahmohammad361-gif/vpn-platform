from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.user import User, UserServer
from app.models.server import Server
from app.models.traffic import DailyTraffic

router = APIRouter(prefix="/stats", tags=["stats"], dependencies=[Depends(get_current_admin)])


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    total_users = (await db.execute(select(func.count(User.id)).where(User.deleted_at == None))).scalar()
    active_users = (await db.execute(select(func.count(User.id)).where(User.is_active == True, User.deleted_at == None))).scalar()
    total_servers = (await db.execute(select(func.count(Server.id)))).scalar()

    today = datetime.utcnow().date()
    traffic_today = (await db.execute(
        select(func.sum(DailyTraffic.upload_bytes + DailyTraffic.download_bytes))
        .where(DailyTraffic.date == today)
    )).scalar() or 0

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_servers": total_servers,
        "traffic_today_bytes": traffic_today,
    }


@router.get("/traffic")
async def traffic(days: int = 30, db: AsyncSession = Depends(get_db)):
    since = datetime.utcnow().date() - timedelta(days=days)
    result = await db.execute(
        select(
            DailyTraffic.date,
            func.sum(DailyTraffic.upload_bytes).label("upload"),
            func.sum(DailyTraffic.download_bytes).label("download"),
        )
        .where(DailyTraffic.date >= since)
        .group_by(DailyTraffic.date)
        .order_by(DailyTraffic.date)
    )
    return [{"date": str(r.date), "upload": r.upload, "download": r.download} for r in result]


@router.get("/top-users")
async def top_users(limit: int = 10, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User.username, User.bytes_used)
        .order_by(User.bytes_used.desc())
        .limit(limit)
    )
    return [{"username": r.username, "bytes_used": r.bytes_used} for r in result]


@router.get("/servers")
async def server_stats(db: AsyncSession = Depends(get_db)):
    servers = (await db.execute(select(Server))).scalars().all()
    today = datetime.utcnow().date()
    since_30 = today - timedelta(days=30)
    result = []
    for s in servers:
        user_count = (await db.execute(
            select(func.count(UserServer.id)).where(UserServer.server_id == s.id)
        )).scalar() or 0
        traffic_today = (await db.execute(
            select(func.sum(DailyTraffic.upload_bytes + DailyTraffic.download_bytes))
            .join(UserServer, DailyTraffic.user_server_id == UserServer.id)
            .where(UserServer.server_id == s.id, DailyTraffic.date == today)
        )).scalar() or 0
        traffic_30d = (await db.execute(
            select(func.sum(DailyTraffic.upload_bytes + DailyTraffic.download_bytes))
            .join(UserServer, DailyTraffic.user_server_id == UserServer.id)
            .where(UserServer.server_id == s.id, DailyTraffic.date >= since_30)
        )).scalar() or 0
        result.append({
            "id": s.id,
            "name": s.name,
            "host": s.host,
            "is_active": s.is_active,
            "last_seen_at": s.last_seen_at,
            "user_count": user_count,
            "traffic_today_bytes": traffic_today,
            "traffic_30d_bytes": traffic_30d,
            "vless_port": s.vless_port,
        })
    return result
