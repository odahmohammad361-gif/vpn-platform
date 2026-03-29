import uuid
from datetime import datetime
from sqlalchemy import String, BigInteger, Integer, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_quota_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    price_rmb: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    price_usdt: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
