import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends
from app.database import get_db
from app.models.user import User, UserServer
from app.models.server import Server
from app.services.subscription import build_shadowrocket, build_clash, build_v2rayng, build_surge_conf

router = APIRouter(prefix="/sub", tags=["subscription"])


_DISABLED_LABELS = {
    "quota_exceeded": "Quota Exceeded - Contact Support",
    "expired": "Account Expired - Contact Support",
}
_DISABLED_FALLBACK = "Account Disabled - Contact Support"

# 192.0.2.x is RFC 5737 documentation range — guaranteed unroutable, causes timeout
_DEAD_HOST = "192.0.2.1"
_DEAD_PORT = 443
_DEAD_METHOD = "chacha20-ietf-poly1305"
_DEAD_PASSWORD = "disabled"


def _disabled_slots(reason: str | None) -> list[dict]:
    label = _DISABLED_LABELS.get(reason or "", _DISABLED_FALLBACK)
    return [{"name": label, "host": _DEAD_HOST, "port": _DEAD_PORT,
             "password": _DEAD_PASSWORD, "method": _DEAD_METHOD}]


def _userinfo_header(user: User) -> str:
    """Build Subscription-Userinfo header for Shadowrocket/Clash to display."""
    parts = [
        f"upload=0",
        f"download={user.bytes_used}",
    ]
    if user.quota_bytes > 0:
        parts.append(f"total={user.quota_bytes}")
    if user.expires_at:
        parts.append(f"expire={int(user.expires_at.timestamp())}")
    return "; ".join(parts)


def _respond(slots: list[dict], format: str, user: User | None = None):
    if format == "clash":
        resp = Response(content=build_clash(slots), media_type="text/yaml")
    elif format == "v2rayng":
        resp = PlainTextResponse(build_v2rayng(slots))
    elif format == "surge":
        resp = PlainTextResponse(build_surge_conf(slots), media_type="text/plain")
    else:
        resp = PlainTextResponse(build_shadowrocket(slots))
    if user:
        resp.headers["Subscription-Userinfo"] = _userinfo_header(user)
    return resp


@router.get("/{token}")
async def get_subscription(
    token: uuid.UUID,
    format: str = "shadowrocket",
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.subscription_token == token))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(403, "Subscription not available")

    # Disabled / quota exceeded → return a dead server so Shadowrocket shows timeout
    if not user.is_active:
        return _respond(_disabled_slots(user.disabled_reason), format, user)

    # Get all synced server slots
    result = await db.execute(
        select(UserServer, Server)
        .join(Server, UserServer.server_id == Server.id)
        .where(UserServer.user_id == user.id)
        .where(Server.is_active == True)
    )
    rows = result.all()

    slots = [
        {
            "name": server.name,
            "host": server.host,
            "port": us.port,
            "password": us.password,
            "method": server.method,
        }
        for us, server in rows
    ]

    if not slots:
        raise HTTPException(404, "No active servers assigned")

    return _respond(slots, format, user)
