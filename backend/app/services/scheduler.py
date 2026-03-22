from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
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


def start_scheduler():
    scheduler.add_job(process_traffic, "interval", seconds=60, id="process_traffic")
    scheduler.start()
