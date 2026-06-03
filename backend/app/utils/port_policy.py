from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.server import Server
from app.models.user import UserServer

SHADOWSOCKS_PORT_MIN = 20000
SHADOWSOCKS_PORT_MAX = 29999
VLESS_PORT_MIN = 30000
VLESS_PORT_MAX = 39999


def is_shadowsocks_port(port: int | None) -> bool:
    return port is not None and SHADOWSOCKS_PORT_MIN <= port <= SHADOWSOCKS_PORT_MAX


def is_vless_port(port: int | None) -> bool:
    return port is not None and VLESS_PORT_MIN <= port <= VLESS_PORT_MAX


def validate_shadowsocks_range(start: int, end: int) -> None:
    if not (is_shadowsocks_port(start) and is_shadowsocks_port(end)):
        raise ValueError(
            f"Shadowsocks ports must stay between {SHADOWSOCKS_PORT_MIN} and {SHADOWSOCKS_PORT_MAX}"
        )
    if start >= end:
        raise ValueError("port_range_start must be less than port_range_end")


def validate_vless_port(port: int | None) -> None:
    if port is None:
        return
    if not is_vless_port(port):
        raise ValueError(f"VLESS port must stay between {VLESS_PORT_MIN} and {VLESS_PORT_MAX}")


async def next_shadowsocks_port(
    db: AsyncSession,
    server: Server,
    preferred_port: int | None = None,
    *,
    lock: bool = False,
) -> int | None:
    validate_shadowsocks_range(server.port_range_start, server.port_range_end)

    used_query = select(UserServer.port).where(UserServer.server_id == server.id)
    if lock:
        used_query = used_query.with_for_update()
    used = set((await db.execute(used_query)).scalars().all())

    if (
        preferred_port is not None
        and server.port_range_start <= preferred_port <= server.port_range_end
        and preferred_port not in used
    ):
        return preferred_port

    max_port = (await db.execute(
        select(func.max(UserServer.port)).where(
            UserServer.server_id == server.id,
            UserServer.port >= server.port_range_start,
            UserServer.port <= server.port_range_end,
        )
    )).scalar() or (server.port_range_start - 1)
    free_port = max_port + 1
    if free_port > server.port_range_end:
        return None
    return free_port
