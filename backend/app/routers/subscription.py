from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends
from app.database import get_db
from app.models.user import User, UserServer
from app.models.server import Server
from app.services.subscription import build_shadowrocket, build_clash, build_v2rayng, build_singbox, build_surge_conf
from app.utils.base64_utils import build_vless_uri, build_vless_grpc_uri
from app.utils.port_policy import is_vless_port
from app.utils.short_codes import resolve_user_token
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


def _respond(
    slots: list[dict],
    format: str,
    user: User | None = None,
    vless_uris: list[str] | None = None,
    vless_nodes: list[dict] | None = None,
):
    vless_uris = vless_uris or []
    vless_nodes = vless_nodes or []
    if format == "clash":
        resp = Response(content=build_clash(slots, vless_nodes), media_type="text/yaml")
    elif format == "v2rayng":
        resp = PlainTextResponse(build_v2rayng(slots, vless_uris))
    elif format == "singbox":
        resp = Response(content=build_singbox(slots, vless_nodes), media_type="application/json")
    elif format == "surge":
        resp = PlainTextResponse(build_surge_conf(slots), media_type="text/plain")
    else:
        resp = PlainTextResponse(build_shadowrocket(slots, vless_uris))
    if user:
        resp.headers["Subscription-Userinfo"] = _userinfo_header(user)
        resp.headers["profile-title"] = settings.BRAND_NAME
        resp.headers["profile-update-interval"] = "24"
    return resp


def _vless_node(us: UserServer, server: Server) -> tuple[dict, str] | None:
    if not us.vless_uuid or not is_vless_port(server.vless_port) or not server.vless_sni:
        return None

    host = server.vless_host or server.host
    name = f"{server.name}-VLESS"

    if server.vless_public_key and server.vless_short_id:
        node = {
            "name": name,
            "host": host,
            "port": server.vless_port,
            "uuid": us.vless_uuid,
            "security": "reality",
            "transport": "tcp",
            "flow": "xtls-rprx-vision",
            "public_key": server.vless_public_key,
            "short_id": server.vless_short_id,
            "sni": server.vless_sni,
            "packet_encoding": "xudp",
        }
        uri = build_vless_uri(
            client_uuid=us.vless_uuid,
            host=host,
            port=server.vless_port,
            public_key=server.vless_public_key,
            short_id=server.vless_short_id,
            sni=server.vless_sni,
            name=name,
        )
        return node, uri

    service_name = server.vless_short_id or "grpc"
    node = {
        "name": name,
        "host": host,
        "port": server.vless_port,
        "uuid": us.vless_uuid,
        "security": "tls",
        "transport": "grpc",
        "grpc_service_name": service_name,
        "sni": server.vless_sni,
        "alpn": "h2",
        "packet_encoding": "xudp",
    }
    uri = build_vless_grpc_uri(
        client_uuid=us.vless_uuid,
        host=host,
        port=server.vless_port,
        sni=server.vless_sni,
        service_name=service_name,
        name=name,
    )
    return node, uri


@router.get("/{token}")
async def get_subscription(
    token: str,
    request: Request,
    format: str = "shadowrocket",
    db: AsyncSession = Depends(get_db),
):
    user = await resolve_user_token(db, token)

    if not user:
        raise HTTPException(403, "Subscription not available")

    # Device tracking is intentionally disabled; subscriptions can be used on unlimited devices.

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
    vless_nodes = []
    for us, server in rows:
        slots.append({
            "name": server.name,
            "host": server.host,
            "port": us.port,
            "password": us.password,
            "method": server.method,
        })
        node = _vless_node(us, server)
        if node:
            vless_node, vless_uri = node
            vless_nodes.append(vless_node)
            vless_uris.append(vless_uri)

    if not slots:
        raise HTTPException(404, "No active servers assigned")

    return _respond(slots, format, user, vless_uris, vless_nodes)
