"""Minimal SQLAlchemy models for the Telegram bot — mirrors backend models."""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, BigInteger, Text, DateTime, Integer, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    subscription_token: Mapped[uuid.UUID] = mapped_column(unique=True, default=uuid.uuid4)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    disabled_reason: Mapped[str | None] = mapped_column(String(64))
    quota_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    bytes_used: Mapped[int] = mapped_column(BigInteger, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
