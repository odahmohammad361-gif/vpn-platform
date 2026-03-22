import uuid
from datetime import datetime
from sqlalchemy import String, BigInteger, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_quota_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
