import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from fastapi import Depends
from app.database import get_db
from app.models.user import User, UserServer
from app.models.server import Server
from app.models.device import Device
from app.services.subscription import build_shadowrocket, build_clash, build_v2rayng, build_surge_conf
from app.utils.base64_utils import build_vless_uri
from app.config import settings

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
    total = user.quota_bytes if user.quota_bytes > 0 else 1099511627776  # 1 TiB for unlimited
    parts = [
        f"upload=0",
        f"download={user.bytes_used}",
        f"total={total}",
    ]
    if user.expires_at:
        parts.append(f"expire={int(user.expires_at.timestamp())}")
    return "; ".join(parts)


def _respond(slots: list[dict], format: str, user: User | None = None, vless_uris: list[str] | None = None):
    vless_uris = vless_uris or []
    if format == "clash":
        resp = Response(content=build_clash(slots, vless_uris), media_type="text/yaml")
    elif format == "v2rayng":
        resp = PlainTextResponse(build_v2rayng(slots, vless_uris))
    elif format == "surge":
        resp = PlainTextResponse(build_surge_conf(slots), media_type="text/plain")
    else:
        resp = PlainTextResponse(build_shadowrocket(slots, vless_uris))
    if user:
        resp.headers["Subscription-Userinfo"] = _userinfo_header(user)
        resp.headers["profile-title"] = settings.BRAND_NAME
        resp.headers["profile-update-interval"] = "24"
    return resp


@router.get("/{token}")
async def get_subscription(
    token: uuid.UUID,
    request: Request,
    format: str = "shadowrocket",
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.subscription_token == token))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(403, "Subscription not available")

    # Record device IP (upsert — update last_seen_at if already known)
    client_ip = request.headers.get("X-Forwarded-For", request.client.host).split(",")[0].strip()
    now = datetime.now(timezone.utc)
    await db.execute(
        pg_insert(Device)
        .values(user_id=user.id, ip_address=client_ip, first_seen_at=now, last_seen_at=now)
        .on_conflict_do_update(
            index_elements=["user_id", "ip_address"],
            set_={"last_seen_at": now},
        )
    )
    await db.commit()

    # Real-time expiry check (don't wait for scheduler)
    if user.expires_at and user.expires_at < datetime.now(timezone.utc):
        if user.is_active:
            user.is_active = False
            user.disabled_reason = "expired"
            await db.commit()
        return _respond(_disabled_slots("expired"), format, user)

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

    slots = []
    vless_uris = []
    for us, server in rows:
        slots.append({
            "name": server.name,
            "host": server.host,
            "port": us.port,
            "password": us.password,
            "method": server.method,
        })
        if (us.vless_uuid and server.vless_port and server.vless_public_key
                and server.vless_short_id and server.vless_sni):
            vless_uris.append(build_vless_uri(
                client_uuid=us.vless_uuid,
                host=server.vless_host or server.host,
                port=server.vless_port,
                public_key=server.vless_public_key,
                short_id=server.vless_short_id,
                sni=server.vless_sni,
                name=f"{server.name}-VLESS",
            ))

    if not slots:
        raise HTTPException(404, "No active servers assigned")

    return _respond(slots, format, user, vless_uris)
