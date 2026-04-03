# VPN Platform

A self-hosted VPN management platform built with FastAPI, React, Shadowsocks-Rust, and VLESS+Reality.

## Architecture

```
AWS EC2 (Ubuntu)
├── Docker Compose
│   ├── backend   — FastAPI REST API
│   ├── frontend  — React admin dashboard
│   ├── portal    — React user portal
│   ├── telegram  — Telegram bot
│   └── nginx     — Reverse proxy (HTTPS :443)
└── AWS RDS PostgreSQL (external)

VPN Servers (Ubuntu)
├── shadowsocks-rust  — Multi-port proxy (per-user port)
├── x-ui / xray       — VLESS+Reality (SG server only)
├── AdGuard Home      — DNS ad blocking (optional)
└── vpn-agent.sh      — Syncs users, reports traffic
```

## Features

- Multi-server Shadowsocks management
- VLESS+Reality support (per-user, auto-managed via x-ui API)
- Per-user traffic quota and expiry (enforced on both SS and VLESS)
- Subscription URLs (Shadowrocket, Clash, v2rayNG, Surge) — includes SS + VLESS
- Auto quota reset via monthly plans
- Device tracking per user (via subscription URL fetch IP)
- AdGuard Home DNS filtering (per-server toggle)
- Telegram bot for user notifications
- User self-service portal with USDT / WeChat / Alipay payment
- Server traffic report per protocol in Statistics page

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 2. Run the platform

```bash
docker compose up -d --build
```

### 3. Run DB migrations

```bash
docker compose exec backend python3 -c "
import asyncio
from app.database import engine, Base
import app.models.user, app.models.server, app.models.traffic, app.models.plan, app.models.device
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(init())
"
```

### 4. Set up a VPN server

```bash
sudo bash agent/server-setup.sh <SERVER_ID> <AGENT_SECRET> https://yourdomain.com
```

Get `SERVER_ID` and `AGENT_SECRET` from the admin dashboard after adding a server.

### 5. Configure VLESS+Reality on a server (optional)

Install 3x-ui on the VPN server, create a VLESS+Reality inbound, then update the server in the DB:

```bash
docker compose exec backend python3 -c "
import asyncio
from app.database import engine
from sqlalchemy import text
async def run():
    async with engine.begin() as conn:
        await conn.execute(text('''UPDATE servers SET
            xui_url = 'https://yourserver:6689/basepath',
            xui_username = 'admin',
            xui_password = 'password',
            xui_inbound_id = 1,
            vless_port = 55710,
            vless_public_key = 'YOUR_PUBLIC_KEY',
            vless_short_id = 'YOUR_SHORT_ID',
            vless_sni = 'www.microsoft.com'
            WHERE name = 'YOUR_SERVER_NAME' '''))
asyncio.run(run())
"
```

## Subscription URL Formats

```
Shadowrocket:  https://yourdomain.com/sub/<token>
Clash:         https://yourdomain.com/sub/<token>?format=clash
v2rayNG:       https://yourdomain.com/sub/<token>?format=v2rayng
Surge:         https://yourdomain.com/sub/<token>?format=surge
```

Each subscription includes both Shadowsocks and VLESS+Reality servers automatically.

## Useful Commands

```bash
# Platform
docker compose logs -f backend
docker compose restart backend
docker compose up -d --build
docker compose ps

# VPN Servers
journalctl -u vpn-agent -f
journalctl -u shadowsocks -f
systemctl status vpn-agent shadowsocks
fail2ban-client status shadowsocks
```
