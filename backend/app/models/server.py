import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Server(Base):
    __tablename__ = "servers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    api_port: Mapped[int] = mapped_column(Integer, default=8080)
    agent_secret: Mapped[str] = mapped_column(Text, nullable=False)
    port_range_start: Mapped[int] = mapped_column(Integer, default=20000)
    port_range_end: Mapped[int] = mapped_column(Integer, default=29999)
    method: Mapped[str] = mapped_column(String(64), default="chacha20-ietf-poly1305")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    adguard_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    force_sync: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    user_slots: Mapped[list["UserServer"]] = relationship("UserServer", back_populates="server", cascade="all, delete-orphan")
