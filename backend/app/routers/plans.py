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


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    await db.delete(plan)
    await db.commit()
