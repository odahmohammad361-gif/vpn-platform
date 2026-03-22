import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, BigInteger, Text, DateTime, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    subscription_token: Mapped[uuid.UUID] = mapped_column(unique=True, default=uuid.uuid4)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    disabled_reason: Mapped[str | None] = mapped_column(String(64))
    quota_bytes: Mapped[int] = mapped_column(BigInteger, default=0)  # 0 = unlimited
    bytes_used: Mapped[int] = mapped_column(BigInteger, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    servers: Mapped[list["UserServer"]] = relationship("UserServer", back_populates="user", cascade="all, delete-orphan")


class UserServer(Base):
    __tablename__ = "user_servers"
    __table_args__ = (
        UniqueConstraint("server_id", "port"),
        UniqueConstraint("user_id", "server_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    server_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("servers.id", ondelete="CASCADE"))
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    password: Mapped[str] = mapped_column(Text, nullable=False)
    is_synced: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="servers")
    server: Mapped["Server"] = relationship("Server", back_populates="user_slots")
