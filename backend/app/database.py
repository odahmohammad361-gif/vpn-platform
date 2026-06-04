import ssl
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


def _database_connect_args() -> dict:
    mode = settings.DATABASE_SSL_MODE.strip().lower()
    try:
        host = (make_url(settings.DATABASE_URL).host or "").lower()
    except Exception:
        host = ""

    local_hosts = {"", "localhost", "127.0.0.1", "::1", "postgres"}
    if mode in {"disable", "false", "0", "off"} or (mode == "auto" and host in local_hosts):
        return {}
    if mode not in {"auto", "require", "true", "1", "on"}:
        raise ValueError("DATABASE_SSL_MODE must be auto, require, or disable")

    cert_path = Path("/app/certs/global-bundle.pem")
    ssl_ctx = ssl.create_default_context(cafile=str(cert_path) if cert_path.exists() else None)
    ssl_ctx.verify_mode = ssl.CERT_REQUIRED
    return {"ssl": ssl_ctx}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=_database_connect_args(),
    pool_pre_ping=True,
    pool_recycle=3600,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
