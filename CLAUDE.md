# CLAUDE.md — Codebase Guide for Claude

## Stack

- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (AWS RDS)
- **Frontend**: React + Vite + TailwindCSS (admin dashboard)
- **Portal**: React + Vite (user self-service)
- **Telegram**: Python bot
- **Proxy**: Shadowsocks-Rust (multi-port, per-user) + VLESS+Reality (via x-ui, SG + EU1 + JP1)
- **DNS**: AdGuard Home (optional, per-server)
- **Infra**: Docker Compose + nginx on AWS EC2 Ubuntu

## Key Directories

```
backend/app/
├── routers/        — API endpoints
│   ├── auth.py         — Admin JWT login
│   ├── users.py        — User CRUD + server assignment + VLESS client management
│   ├── servers.py      — Server management
│   ├── agent.py        — VPN agent endpoints (heartbeat, traffic, config)
│   ├── subscription.py — Public sub URLs (/sub/<token>) — returns SS + VLESS URIs
│   ├── portal.py       — User portal login/dashboard
│   ├── signup.py       — User self-registration
│   ├── stats.py        — Stats overview, traffic, top users, per-server report
│   └── plans.py        — Subscription plans
├── models/
│   ├── user.py         — User, UserServer (has vless_uuid field)
│   ├── server.py       — Server (has xui_url, xui_inbound_id, vless_port, vless_public_key, vless_short_id, vless_sni)
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

SG-FAST-1, EU1, and JP1 have VLESS+Reality enabled via 3x-ui panel.

| Server | Host | Port | SNI |
|--------|------|------|-----|
| SG-FAST-1 | sg.saymy-vpn.com | 55710 | www.sony.com |
| EU1 | eu1.saymy-vpn.com | 55710 | www.apple.com |
| JP1 | jp1.saymy-vpn.com | 55710 | www.apple.com |

- x-ui panel URLs and credentials are stored in the `servers` DB table (not in code)
- Inbound ID: 1 on all servers
- Per-user VLESS clients are created automatically on server assignment
- VLESS traffic is synced from x-ui every 5 minutes into DailyTraffic
- VLESS clients are disabled automatically on quota exceeded / expiry

When a user is assigned to SG, `users.py` calls `services/xui.py → add_vless_client()`.
When removed/disabled, it calls `delete_vless_client()` or `set_vless_client_enabled(False)`.

To add VLESS to a new server, set these columns in the `servers` table:
- `xui_url`, `xui_username`, `xui_password`, `xui_inbound_id`
- `vless_port`, `vless_public_key`, `vless_short_id`, `vless_sni`

## Device Tracking

When a user fetches their subscription URL (`/sub/<token>`), their IP is stored in the `devices` table (upsert on `user_id + ip_address`). The admin Users page shows the count of unique device IPs per user.

## Port Allocation

Each user gets one port per server (same port number across all servers). Ports start at `server.port_range_start` and increment. Ports are never reused after deletion.

## Traffic Accounting

**Shadowsocks**: iptables chains `VPN_IN` / `VPN_OUT` count bytes per port. Agent reads with `iptables -xvnL`, resets with `iptables -Z` after reporting. Client IPs detected via `ss -tn state established` (local `parts[2]`, peer `parts[3]`).

**VLESS**: scheduler polls x-ui `/panel/api/inbounds/<id>/clientStats` every 5 minutes, writes to DailyTraffic, resets x-ui counters after reading.

## Environment Variables

See `.env.example` for all variables. Key ones:
- `DATABASE_URL` — asyncpg PostgreSQL URL
- `SECRET_KEY` — JWT signing key
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin login
- `SUBSCRIPTION_BASE_URL` — e.g. `https://saymy-vpn.com`
- `BRAND_NAME` — shown in subscription profile title

## Servers

| Name | Host |
|------|------|
| eu-1 | eu1.saymy-vpn.com |
| SG-FAST-1 | sg.saymy-vpn.com |
| jp1 | jp1.saymy-vpn.com |
| HK-FAST-1 | (AWS HK relay) |

Server IDs and secrets are stored in the database only.

## Common Issues

- **Agent not syncing**: check `journalctl -u vpn-agent -f`, verify `API_BASE` and credentials
- **502 Bad Gateway**: `docker compose restart nginx`
- **DB connection lost**: check `pool_pre_ping=True` in `database.py`
- **client_ip not reported**: verify `ss -tn state established` uses `parts[2]`/`parts[3]` (not `[3]`/`[4]`)
- **Subscription showing old IP**: check `SUBSCRIPTION_BASE_URL` in `.env`
- **VLESS client not created**: check backend logs for xui errors, verify xui_url/credentials in servers table
- **Remove server 500 error**: ensure `traffic_logs` FK has ON DELETE CASCADE — run: `ALTER TABLE traffic_logs DROP CONSTRAINT traffic_logs_user_server_id_fkey, ADD CONSTRAINT traffic_logs_user_server_id_fkey FOREIGN KEY (user_server_id) REFERENCES user_servers(id) ON DELETE CASCADE`
