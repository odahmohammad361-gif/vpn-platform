import uuid
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends
from app.database import get_db
from app.models.user import User, UserServer
from app.models.server import Server
from app.services.subscription import build_shadowrocket, build_clash, build_v2rayng

router = APIRouter(prefix="/sub", tags=["subscription"])


@router.get("/{token}")
async def get_subscription(
    token: uuid.UUID,
    format: str = "shadowrocket",
    db: AsyncSession = Depends(get_db),
):
    # Find user by token
    result = await db.execute(select(User).where(User.subscription_token == token))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(403, "Subscription not available")

    # Get all synced server slots
    result = await db.execute(
        select(UserServer, Server)
        .join(Server, UserServer.server_id == Server.id)
        .where(UserServer.user_id == user.id)
        .where(UserServer.is_synced == True)
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

    if format == "clash":
        content = build_clash(slots)
        return Response(content=content, media_type="text/yaml")

    if format == "v2rayng":
        content = build_v2rayng(slots)
        return PlainTextResponse(content)

    # Default: shadowrocket (base64)
    content = build_shadowrocket(slots)
    return PlainTextResponse(content)
