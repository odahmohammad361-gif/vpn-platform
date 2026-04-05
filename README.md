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
├── x-ui / xray       — VLESS+Reality (optional, per-server)
├── AdGuard Home      — DNS ad blocking (optional)
└── vpn-agent.sh      — Syncs users, reports traffic every 30s
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
- User self-service portal
- Server traffic report (daily/weekly/monthly) in Statistics page

## Stack

- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (AWS RDS)
- **Frontend**: React + Vite + TailwindCSS (admin dashboard)
- **Portal**: React + Vite (user self-service)
- **Telegram**: Python bot
- **Proxy**: Shadowsocks-Rust (multi-port, per-user) + VLESS+Reality (via x-ui)
- **DNS**: AdGuard Home (optional, per-server)
- **Infra**: Docker Compose + nginx on AWS EC2 Ubuntu

## Key Directories

```
backend/app/
├── routers/
│   ├── auth.py         — Admin JWT login
│   ├── users.py        — User CRUD + server assignment + VLESS client management
│   ├── servers.py      — Server management + edit all fields
│   ├── agent.py        — VPN agent endpoints (heartbeat, traffic, config)
│   ├── subscription.py — Public sub URLs (/sub/<token>) — returns SS + VLESS URIs
│   ├── portal.py       — User portal login/dashboard
│   ├── signup.py       — User self-registration (30 user limit)
│   ├── stats.py        — Stats overview, traffic, top users, per-server report
│   └── plans.py        — Subscription plans
├── models/
│   ├── user.py         — User, UserServer (has vless_uuid field)
│   ├── server.py       — Server (xui_url, vless_port, vless_public_key, vless_short_id, vless_sni, vless_host)
│   ├── traffic.py      — TrafficLog, DailyTraffic
│   ├── plan.py         — Plan
│   └── device.py       — Device (tracks sub fetch IPs)
├── services/
│   ├── subscription.py — Builds Shadowrocket/Clash/v2rayNG/Surge configs
│   ├── xui.py          — x-ui API client (add/delete/enable/disable VLESS clients)
│   └── scheduler.py    — Background jobs: traffic aggregation, quota reset, VLESS traffic sync
├── utils/
│   └── base64_utils.py — build_ss_uri, build_vless_uri, encode_subscription
├── config.py           — Settings from .env
├── database.py         — Async SQLAlchemy engine
├── dependencies.py     — JWT auth dependency
└── limiter.py          — slowapi rate limiter

agent/
└── server-setup.sh     — Full VPN server setup + embedded vpn-agent.sh

frontend/src/pages/     — Admin dashboard pages
portal/src/pages/       — User portal pages
telegram/bot.py         — Telegram bot
```

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

Add a server in the admin dashboard, then SSH into the VPN server and run:

```bash
sudo bash agent/server-setup.sh <SERVER_ID> <AGENT_SECRET> https://yourdomain.com/agent
```

Get `SERVER_ID` and `AGENT_SECRET` from admin dashboard → Servers → info icon.

### 5. Configure VLESS+Reality (optional)

Install 3x-ui on the VPN server, create a VLESS+Reality inbound, then update the server via admin dashboard → Servers → edit (pencil icon). Fill in the x-ui and VLESS fields.

Or via DB:

```bash
docker compose exec backend python3 -c "
import asyncio
from app.database import engine
from sqlalchemy import text
async def run():
    async with engine.begin() as conn:
        await conn.execute(text('''UPDATE servers SET
            xui_url = 'https://yourserver:PORT/BASEPATH',
            xui_username = 'admin',
            xui_password = 'YOUR_PASSWORD',
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

## Environment Variables

See `.env.example` for all variables. Key ones:
- `DATABASE_URL` — asyncpg PostgreSQL URL
- `SECRET_KEY` — JWT signing key
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin login
- `SUBSCRIPTION_BASE_URL` — e.g. `https://yourdomain.com`
- `BRAND_NAME` — shown in subscription profile title

## DB Migrations

No Alembic — run raw SQL via backend container:

```bash
docker compose exec backend python3 -c "
import asyncio
from app.database import engine
from sqlalchemy import text
async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text('ALTER TABLE ...'))
asyncio.run(migrate())
"
```

## Agent Architecture

Each VPN server runs `/usr/local/bin/vpn-agent.sh` as a systemd service.

Every 30 seconds it:
1. POST `/agent/heartbeat/<server_id>` — gets `sync_required` flag
2. If sync needed: GET `/agent/config/<server_id>` → writes shadowsocks config → restarts shadowsocks
3. POST `/agent/traffic/<server_id>` — reports iptables byte counts + client IPs per port
4. Controls AdGuard Home based on `adguard_enabled` flag

Agent authentication: HMAC-SHA256 signature on `server_id:timestamp:body`.

## VLESS+Reality (x-ui)

Per-user VLESS clients are created automatically on server assignment and deleted/disabled on removal/quota.

- `vless_host` field: override the VLESS URI hostname (useful when SS uses a relay but VLESS connects direct)
- VLESS traffic synced from x-ui every 5 minutes into DailyTraffic
- x-ui panel URLs and credentials stored in `servers` DB table only

To add VLESS to a new server, set these columns via admin dashboard or DB:
- `xui_url`, `xui_username`, `xui_password`, `xui_inbound_id`
- `vless_port`, `vless_public_key`, `vless_short_id`, `vless_sni`
- `vless_host` (optional — only needed if SS goes through a relay)

## Port Allocation

Each user gets one port per server. Ports start at `server.port_range_start` and increment. Ports are never reused after deletion. If a server uses a different port range, users get a port within that server's range.

## Traffic Accounting

**Shadowsocks**: iptables chains `VPN_IN` / `VPN_OUT` count bytes per port. Agent reads with `iptables -xvnL`, resets with `iptables -Z` after reporting.

**VLESS**: scheduler polls x-ui `/panel/api/inbounds/<id>/clientStats` every 5 minutes, writes to DailyTraffic, resets x-ui counters after reading.

## Useful Commands

```bash
# Platform
docker compose logs -f backend
docker compose restart nginx
docker compose up -d --build
docker compose ps

# VPN Servers
journalctl -u vpn-agent -f
journalctl -u shadowsocks -f
systemctl status vpn-agent shadowsocks
fail2ban-client status shadowsocks
```

## Common Issues

- **Agent not syncing**: check `journalctl -u vpn-agent -f`, verify `API_BASE` ends with `/agent` (not `/api/agent`)
- **502 Bad Gateway**: `docker compose restart nginx`
- **DB connection lost**: check `pool_pre_ping=True` in `database.py`
- **Shadowsocks exits on empty config**: agent stops SS instead of restarting when 0 users assigned
- **VLESS client not created**: check backend logs for xui errors, verify xui_url/credentials in servers table
- **Remove server 500 error**: ensure `traffic_logs` FK has ON DELETE CASCADE
- **Port forwarding relay + VLESS**: set `vless_host` to a direct subdomain so VLESS bypasses the relay
