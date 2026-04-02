# CLAUDE.md — Codebase Guide for Claude

## Stack

- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (AWS RDS)
- **Frontend**: React + Vite + TailwindCSS (admin dashboard)
- **Portal**: React + Vite (user self-service)
- **Telegram**: Python bot
- **Proxy**: Shadowsocks-Rust (multi-port, per-user)
- **DNS**: AdGuard Home (optional, per-server)
- **Infra**: Docker Compose + nginx on AWS EC2 Ubuntu

## Key Directories

```
backend/app/
├── routers/        — API endpoints
│   ├── auth.py         — Admin JWT login
│   ├── users.py        — User CRUD + server assignment
│   ├── servers.py      — Server management
│   ├── agent.py        — VPN agent endpoints (heartbeat, traffic, config)
│   ├── subscription.py — Public sub URLs (/sub/<token>)
│   ├── portal.py       — User portal login/dashboard
│   ├── signup.py       — User self-registration
│   └── plans.py        — Subscription plans
├── models/
│   ├── user.py         — User, UserServer
│   ├── server.py       — Server
│   ├── traffic.py      — TrafficLog, DailyTraffic
│   ├── plan.py         — Plan
│   └── device.py       — Device (tracks sub fetch IPs)
├── services/
│   └── subscription.py — Builds Shadowrocket/Clash/v2rayNG/Surge configs
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

## Device Tracking

When a user fetches their subscription URL (`/sub/<token>`), their IP is stored in the `devices` table (upsert on `user_id + ip_address`). The admin Users page shows the count of unique device IPs per user.

## Port Allocation

Each user gets one port per server (same port number across all servers). Ports start at `server.port_range_start` and increment. Ports are never reused after deletion.

## Traffic Accounting

iptables chains `VPN_IN` / `VPN_OUT` count bytes per port. Agent reads with `iptables -xvnL`, resets with `iptables -Z` after reporting. Client IPs detected via `ss -tn state established` (local `parts[2]`, peer `parts[3]`).

## Environment Variables

See `.env.example` for all variables. Key ones:
- `DATABASE_URL` — asyncpg PostgreSQL URL
- `SECRET_KEY` — JWT signing key
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin login
- `SUBSCRIPTION_BASE_URL` — e.g. `https://saymy-vpn.com`
- `BRAND_NAME` — shown in subscription profile title

## Servers

| Name | IP | ID |
|------|----|----|
| eu-1 | 31.220.80.56 | d1305317-46cf-45fe-8c14-5faaf37b0bb2 |
| SG-FAST-1 | 147.93.158.82 | 94099c2a-e881-4bea-93d2-6212cd6eec2a |
| eu-2 | 213.199.39.77 | 5b6cd2db-a6a4-4cb7-83f2-a388b047f8ca |

## Common Issues

- **Agent not syncing**: check `journalctl -u vpn-agent -f`, verify `API_BASE` and credentials
- **502 Bad Gateway**: `docker compose restart nginx`
- **DB connection lost**: check `pool_pre_ping=True` in `database.py`
- **client_ip not reported**: verify `ss -tn state established` uses `parts[2]`/`parts[3]` (not `[3]`/`[4]`)
- **Subscription showing old IP**: check `SUBSCRIPTION_BASE_URL` in `.env`
