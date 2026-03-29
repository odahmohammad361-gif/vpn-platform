"""
Public signup + USDT payment flow.
POST /signup          — create inactive user, return payment instructions
GET  /signup/plans    — list plans (public)
GET  /signup/status/{user_id} — check payment status
POST /signup/confirm/{user_id} — admin manual confirm (fallback)
"""
import secrets
import hashlib
import hmac
import time
import httpx
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, field_validator
from typing import Optional
import calendar
import bcrypt as _bcrypt

def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()

def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode(), hashed.encode())

from app.database import get_db
from app.models.user import User, UserServer
from app.models.plan import Plan
from app.models.server import Server
from app.config import settings
from app.dependencies import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/signup", tags=["signup"])


def _add_months(dt: datetime, months: int) -> datetime:
    month = (dt.month - 1 + months) % 12 + 1
    year = dt.year + (dt.month - 1 + months) // 12
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


class SignupRequest(BaseModel):
    username: str
    email: str
    password: str
    plan_id: str
    telegram_username: Optional[str] = None

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[a-zA-Z0-9_]{3,32}$", v):
            raise ValueError("Username must be 3–32 characters, letters/numbers/underscore only")
        return v

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.get("/plans")
async def public_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan).order_by(Plan.duration_months))
    plans = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "duration_months": p.duration_months,
            "monthly_quota_bytes": p.monthly_quota_bytes,
            "price_usdt": float(p.price_usdt),
            "price_rmb": float(p.price_rmb),
        }
        for p in plans
    ]


@router.post("")
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    import uuid as _uuid

    # Validate plan
    try:
        plan_uuid = _uuid.UUID(body.plan_id)
    except ValueError:
        raise HTTPException(400, "Invalid plan_id")

    plan = await db.get(Plan, plan_uuid)
    if not plan:
        raise HTTPException(404, "Plan not found")

    # Check username taken
    existing = await db.execute(
        select(User).where(User.username == body.username, User.deleted_at.is_(None))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Username already taken · 用户名已被使用")

    # Check email taken (including soft-deleted — email column has unique constraint)
    email_existing = await db.execute(
        select(User).where(User.email == body.email)
    )
    if email_existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered · 邮箱已注册")

    # Generate unique payment reference = exact USDT amount with random cents
    rand_cents = secrets.randbelow(90) + 1  # 01–90
    price_usdt = float(plan.price_usdt)
    exact_amount = f"{price_usdt:.0f}.{rand_cents:02d}"

    # Create inactive user
    user = User(
        username=body.username,
        email=body.email,
        hashed_password=_hash_password(body.password),
        is_active=False,
        disabled_reason="pending_payment",
        payment_status="pending_payment",
        payment_ref=exact_amount,
        plan_id=plan.id,
        notes=body.telegram_username or None,
    )
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Email or username already registered · 邮箱或用户名已注册")

    return {
        "user_id": str(user.id),
        "username": user.username,
        "plan": plan.name,
        "wallet": settings.USDT_WALLET,
        "network": "TRC20 (TRON)",
        "amount_usdt": exact_amount,
        "amount_rmb": float(plan.price_rmb),
        "note": "Send EXACTLY this amount so we can identify your payment automatically.",
        "expires_in_hours": 24,
    }


@router.get("/status/{user_id}")
async def payment_status(user_id: str, db: AsyncSession = Depends(get_db)):
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user_id")

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(404, "Not found")

    return {
        "user_id": str(user.id),
        "username": user.username,
        "payment_status": user.payment_status,
        "is_active": user.is_active,
        "subscription_token": str(user.subscription_token) if user.is_active else None,
    }


async def _activate_user(user: User, db: AsyncSession):
    """Activate user: assign plan dates + all servers."""
    plan = await db.get(Plan, user.plan_id)
    if not plan:
        return

    now = datetime.now(timezone.utc)
    user.is_active = True
    user.disabled_reason = None
    user.payment_status = "paid"
    user.plan_started_at = now
    user.quota_bytes = plan.monthly_quota_bytes
    user.bytes_used = 0
    user.expires_at = _add_months(now, plan.duration_months)
    user.next_reset_at = _add_months(now, 1)

    # Assign all active servers
    all_servers_result = await db.execute(select(Server).where(Server.is_active == True))
    all_servers = all_servers_result.scalars().all()

    existing_result = await db.execute(
        select(UserServer.server_id).where(UserServer.user_id == user.id)
    )
    already_assigned = set(existing_result.scalars().all())

    shared_password = secrets.token_hex(16)

    for server in all_servers:
        if server.id in already_assigned:
            continue

        taken_result = await db.execute(
            select(UserServer.port).where(UserServer.server_id == server.id)
        )
        taken = set(taken_result.scalars().all())

        max_port_result = await db.execute(
            select(func.max(UserServer.port)).where(UserServer.server_id == server.id)
        )
        max_port = max_port_result.scalar() or (server.port_range_start - 1)
        free_port = max_port + 1

        if free_port > server.port_range_end:
            continue

        db.add(UserServer(
            user_id=user.id,
            server_id=server.id,
            port=free_port,
            password=shared_password,
        ))

    await db.commit()
    await db.refresh(user)

    # Notify via Telegram if bot token configured
    await _notify_telegram(user, plan)


async def _notify_telegram(user: User, plan):
    token = settings.TELEGRAM_BOT_TOKEN
    admin_ids = [int(x) for x in settings.TELEGRAM_ADMIN_IDS.split(",") if x.strip()]
    if not token:
        return

    base = settings.SUBSCRIPTION_BASE_URL.rstrip("/")
    sub_token = str(user.subscription_token)

    user_msg = (
        f"✅ Payment confirmed! Your account is active.\n\n"
        f"Username: {user.username}\n"
        f"Plan: {plan.name}\n"
        f"Expires: {user.expires_at.strftime('%d/%m/%Y')}\n\n"
        f"Your subscription token:\n{sub_token}\n\n"
        f"Open your portal: {base.replace(':8080', '')}\n"
        f"Or use /login {sub_token} in our Telegram bot."
    )

    admin_msg = (
        f"💰 New payment confirmed!\n"
        f"User: {user.username}\n"
        f"Plan: {plan.name}\n"
        f"Amount: {user.payment_ref} USDT"
    )

    async with httpx.AsyncClient() as client:
        # Notify user if they have telegram linked
        if user.telegram_id:
            await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": user.telegram_id, "text": user_msg},
            )
        # Notify admins
        for admin_id in admin_ids:
            await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": admin_id, "text": admin_msg},
            )


@router.post("/confirm/{user_id}", dependencies=[Depends(get_current_admin)])
async def manual_confirm(user_id: str, db: AsyncSession = Depends(get_db)):
    """Admin endpoint to manually confirm a payment."""
    import uuid as _uuid
    try:
        uid = _uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user_id")

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(404, "User not found")
    if user.payment_status == "paid":
        raise HTTPException(409, "Already confirmed")

    await _activate_user(user, db)
    return {"status": "activated", "username": user.username}


class NotifyPaidRequest(BaseModel):
    user_id: str
    method: str  # "alipay" | "wechat"


@router.post("/notify-paid")
async def notify_paid(body: NotifyPaidRequest, db: AsyncSession = Depends(get_db)):
    """User calls this after paying via Alipay/WeChat — sends admin a Telegram ping."""
    import uuid as _uuid
    try:
        uid = _uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(400, "Invalid user_id")

    user = await db.get(User, uid)
    if not user:
        raise HTTPException(404, "User not found")
    if user.payment_status == "paid":
        return {"status": "already_paid"}

    token = settings.TELEGRAM_BOT_TOKEN
    admin_ids = [int(x) for x in settings.TELEGRAM_ADMIN_IDS.split(",") if x.strip()]
    method_label = "Alipay · 支付宝" if body.method == "alipay" else "WeChat Pay · 微信支付"

    admin_msg = (
        f"📲 Payment notification from user!\n\n"
        f"User: {user.username}\n"
        f"Email: {user.email}\n"
        f"Method: {method_label}\n"
        f"User ID: {str(user.id)}\n\n"
        f"⚡ Confirm with admin button or:\n"
        f"/confirm_payment {str(user.id)}"
    )

    if token:
        async with httpx.AsyncClient() as client:
            for admin_id in admin_ids:
                await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": admin_id, "text": admin_msg},
                )

    return {"status": "notified"}


# ── Binance TRC20 deposit checker (called by scheduler) ──────────────────────
async def check_binance_deposits(db: AsyncSession):
    """Poll Binance for TRC20 USDT deposits and match to pending users."""
    if not settings.BINANCE_API_KEY:
        return

    # Find all pending users with payment_ref set
    result = await db.execute(
        select(User).where(
            User.payment_status == "pending_payment",
            User.payment_ref.is_not(None),
            User.deleted_at.is_(None),
        )
    )
    pending_users = result.scalars().all()
    if not pending_users:
        return

    # Fetch recent TRC20 USDT deposits from Binance
    try:
        deposits = await _binance_trc20_deposits()
    except Exception as e:
        logger.warning(f"Binance deposit check failed: {e}")
        return

    # Build lookup: amount string → deposit
    deposit_amounts = {d["amount"]: d for d in deposits}

    for user in pending_users:
        if user.payment_ref in deposit_amounts:
            logger.info(f"Payment matched for user {user.username}: {user.payment_ref} USDT")
            await _activate_user(user, db)


async def _binance_trc20_deposits() -> list[dict]:
    """Fetch TRC20 USDT deposit history from Binance API."""
    api_key = settings.BINANCE_API_KEY
    api_secret = settings.BINANCE_API_SECRET

    params = {
        "coin": "USDT",
        "network": "TRX",
        "status": 1,  # success
        "limit": 50,
        "timestamp": int(time.time() * 1000),
    }

    query = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    signature = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
    query += f"&signature={signature}"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.binance.com/sapi/v1/capital/deposit/hisrec?{query}",
            headers={"X-MBX-APIKEY": api_key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

    # Return list of {amount, txId, insertTime}
    return [
        {"amount": d["amount"], "txId": d["txId"], "time": d["insertTime"]}
        for d in data
        if d.get("coin") == "USDT"
    ]
