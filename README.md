# VPN Platform

A self-hosted VPN management platform built with FastAPI, React, and Shadowsocks-Rust.

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
├── shadowsocks-rust  — Multi-port proxy
├── AdGuard Home      — DNS ad blocking
└── vpn-agent.sh      — Syncs users, reports traffic
```

## Features

- Multi-server Shadowsocks management
- Per-user traffic quota and expiry
- Subscription URLs (Shadowrocket, Clash, v2rayNG, Surge)
- Auto quota reset via monthly plans
- Device tracking per user
- AdGuard Home DNS filtering (per-server toggle)
- Telegram bot for user notifications
- User self-service portal with USDT payment

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

## Subscription URL Formats

```
Shadowrocket:  https://yourdomain.com/sub/<token>
Clash:         https://yourdomain.com/sub/<token>?format=clash
v2rayNG:       https://yourdomain.com/sub/<token>?format=v2rayng
Surge:         https://yourdomain.com/sub/<token>?format=surge
```

## Useful Commands

```bash
# Platform
docker compose logs -f backend
docker compose restart backend
docker compose ps

# VPN Servers
journalctl -u vpn-agent -f
journalctl -u shadowsocks -f
systemctl status vpn-agent shadowsocks adguardhome
fail2ban-client status shadowsocks
```
