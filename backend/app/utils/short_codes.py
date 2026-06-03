import uuid
from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.server import Server
from app.models.user import User

SHORT_CODE_LENGTH = 8


def short_uuid(value: uuid.UUID | str) -> str:
    return str(value).split("-", 1)[0][:SHORT_CODE_LENGTH].lower()


def short_secret(value: str) -> str:
    return value[:SHORT_CODE_LENGTH]


async def resolve_server_ref(db: AsyncSession, ref: str) -> Server | None:
    try:
        server = await db.get(Server, uuid.UUID(ref))
        if server:
            return server
    except ValueError:
        pass

    prefix = ref.strip().lower()
    if len(prefix) < SHORT_CODE_LENGTH:
        return None

    rows = await db.execute(
        select(Server).where(cast(Server.id, String).ilike(f"{prefix}%"))
    )
    matches = rows.scalars().all()
    return matches[0] if len(matches) == 1 else None


async def resolve_user_token(db: AsyncSession, token: str) -> User | None:
    try:
        result = await db.execute(
            select(User).where(
                User.subscription_token == uuid.UUID(token),
                User.deleted_at.is_(None),
            )
        )
        return result.scalar_one_or_none()
    except ValueError:
        pass

    prefix = token.strip().lower()
    if len(prefix) < SHORT_CODE_LENGTH:
        return None

    result = await db.execute(
        select(User).where(
            cast(User.subscription_token, String).ilike(f"{prefix}%"),
            User.deleted_at.is_(None),
        )
    )
    matches = result.scalars().all()
    return matches[0] if len(matches) == 1 else None
