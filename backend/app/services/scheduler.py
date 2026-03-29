from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
import calendar
from datetime import datetime, date, timezone
from app.database import SessionLocal
from app.models.user import User
from app.models.traffic import TrafficLog, DailyTraffic

scheduler = AsyncIOScheduler()


async def process_traffic():
    """Aggregate traffic logs → update user bytes + daily_traffic table."""
    async with SessionLocal() as db:
        # Get unprocessed logs
        result = await db.execute(select(TrafficLog).order_by(TrafficLog.id))
        logs = result.scalars().all()
        if not logs:
            return

        # Accumulate per user_server
        from app.models.user import UserServer
        totals: dict = {}
        for log in logs:
            key = log.user_server_id
            totals[key] = totals.get(key, {"up": 0, "down": 0})
            totals[key]["up"]   += log.upload_bytes
            totals[key]["down"] += log.download_bytes

        today = date.today()
        for user_server_id, data in totals.items():
            total = data["up"] + data["down"]

            # Get user_server → user
            slot = await db.get(UserServer, user_server_id)
            if not slot:
                continue
            user = await db.get(User, slot.user_id)
            if not user:
                continue

            user.bytes_used += total

            # Auto-disable on quota exceeded
            if user.quota_bytes > 0 and user.bytes_used >= user.quota_bytes:
                user.is_active = False
                user.disabled_reason = "quota_exceeded"

            # Auto-disable on expiry
            if user.expires_at and user.expires_at < datetime.now(timezone.utc):
                user.is_active = False
                user.disabled_reason = "expired"

            # Upsert daily_traffic
            stmt = insert(DailyTraffic).values(
                user_id=user.id,
                server_id=slot.server_id,
                date=today,
                upload_bytes=data["up"],
                download_bytes=data["down"],
            ).on_conflict_do_update(
                index_elements=["user_id", "server_id", "date"],
                set_={
                    "upload_bytes":   DailyTraffic.upload_bytes   + data["up"],
                    "download_bytes": DailyTraffic.download_bytes + data["down"],
                }
            )
            await db.execute(stmt)

        # Delete processed logs
        log_ids = [l.id for l in logs]
        from sqlalchemy import delete
        await db.execute(delete(TrafficLog).where(TrafficLog.id.in_(log_ids)))
        await db.commit()


def _add_one_month(dt: datetime) -> datetime:
    month = dt.month % 12 + 1
    year = dt.year + (dt.month // 12)
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


async def reset_monthly_quotas():
    """Reset bytes_used for plan users whose monthly period has rolled over."""
    now = datetime.now(timezone.utc)
    async with SessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.plan_id.is_not(None),
                User.next_reset_at.is_not(None),
                User.next_reset_at <= now,
                User.expires_at > now,
            )
        )
        users = result.scalars().all()
        for user in users:
            user.bytes_used = 0
            if user.disabled_reason == "quota_exceeded":
                user.is_active = True
                user.disabled_reason = None
            user.next_reset_at = _add_one_month(user.next_reset_at)
        if users:
            await db.commit()


async def check_payments():
    """Check Binance for incoming USDT deposits and activate matching pending users."""
    from app.routers.signup import check_binance_deposits
    async with SessionLocal() as db:
        await check_binance_deposits(db)


def start_scheduler():
    scheduler.add_job(process_traffic, "interval", seconds=60, id="process_traffic")
    scheduler.add_job(reset_monthly_quotas, "interval", minutes=10, id="reset_monthly_quotas")
    scheduler.add_job(check_payments, "interval", minutes=2, id="check_payments")
    scheduler.start()
