import uuid
from datetime import datetime, date
from sqlalchemy import BigInteger, Integer, DateTime, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TrafficLog(Base):
    __tablename__ = "traffic_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_server_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_servers.id", ondelete="CASCADE"))
    upload_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    download_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    agent_interval_sec: Mapped[int] = mapped_column(Integer, default=30)


class DailyTraffic(Base):
    __tablename__ = "daily_traffic"
    __table_args__ = (UniqueConstraint("user_id", "server_id", "date"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    server_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("servers.id"))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    upload_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    download_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
