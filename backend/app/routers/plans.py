import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.plan import Plan

router = APIRouter(prefix="/plans", tags=["plans"], dependencies=[Depends(get_current_admin)])


class PlanCreate(BaseModel):
    name: str
    duration_months: int
    monthly_quota_bytes: int
    price_rmb: float = 0


@router.get("")
async def list_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan).order_by(Plan.duration_months))
    return result.scalars().all()


@router.post("", status_code=201)
async def create_plan(body: PlanCreate, db: AsyncSession = Depends(get_db)):
    plan = Plan(**body.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.post("/seed", status_code=201)
async def seed_default_plans(db: AsyncSession = Depends(get_db)):
    """Seed the 3 default subscription plans if they don't exist."""
    defaults = [
        {"name": "1 Month", "duration_months": 1, "monthly_quota_bytes": 500_000_000_000, "price_rmb": 250.0},
        {"name": "3 Months", "duration_months": 3, "monthly_quota_bytes": 500_000_000_000, "price_rmb": 250.0},
        {"name": "6 Months", "duration_months": 6, "monthly_quota_bytes": 500_000_000_000, "price_rmb": 250.0},
    ]
    created = []
    for d in defaults:
        existing = await db.execute(select(Plan).where(Plan.name == d["name"]))
        if existing.scalar_one_or_none():
            continue
        plan = Plan(**d)
        db.add(plan)
        created.append(d["name"])
    await db.commit()
    return {"seeded": created}


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    await db.delete(plan)
    await db.commit()
