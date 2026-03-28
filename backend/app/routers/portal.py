from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
import uuid

router = APIRouter(prefix="/portal", tags=["portal"])


async def get_portal_user(
    x_sub_token: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        token = uuid.UUID(x_sub_token)
    except ValueError:
        raise HTTPException(401, "Invalid token format")

    result = await db.execute(
        select(User).where(
            User.subscription_token == token,
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Invalid token")
    return user


@router.get("/me")
async def portal_me(user: User = Depends(get_portal_user)):
    return {
        "username": user.username,
        "is_active": user.is_active,
        "bytes_used": user.bytes_used,
        "quota_bytes": user.quota_bytes,
        "expires_at": user.expires_at.isoformat() if user.expires_at else None,
        "subscription_token": str(user.subscription_token),
    }
