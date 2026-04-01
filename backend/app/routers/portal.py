from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.limiter import limiter
from pydantic import BaseModel
import uuid
import bcrypt as _bcrypt

router = APIRouter(prefix="/portal", tags=["portal"])

_DUMMY_HASH = _bcrypt.hashpw(b"dummy", _bcrypt.gensalt()).decode()


class PortalLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
@limiter.limit("10/minute")
async def portal_login(request: Request, body: PortalLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(
            User.email == body.email.strip().lower(),
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()

    # Always run bcrypt to prevent timing-based email enumeration
    hash_to_check = user.hashed_password if (user and user.hashed_password) else _DUMMY_HASH
    valid = _bcrypt.checkpw(body.password.encode(), hash_to_check.encode())

    if not user or not user.hashed_password or not valid:
        raise HTTPException(401, "Invalid email or password")
    if user.payment_status == "pending_payment":
        raise HTTPException(403, "payment_pending")
    if not user.is_active:
        raise HTTPException(403, f"Account disabled: {user.disabled_reason or 'contact support'}")
    return {
        "subscription_token": str(user.subscription_token),
        "username": user.username,
    }


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
