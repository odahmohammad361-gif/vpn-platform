# Deployment Guide

## Your Infrastructure

```
Amazon Windows Server (AWS)
├── Docker Desktop (WSL2)
│   ├── backend  (FastAPI)
│   ├── frontend (React)
│   └── nginx    (reverse proxy :8080/:8443)
└── Aurora RDS PostgreSQL (external DB)

Contabo Ubuntu Server 1  (VPN Server SG-01)
├── shadowsocks-rust
├── AdGuard Home
└── vpn-agent.sh

Contabo Ubuntu Server 2  (VPN Server SG-02)
├── shadowsocks-rust
├── AdGuard Home
└── vpn-agent.sh
```

---

## Step 1 — Aurora RDS Setup (AWS Console)

1. Go to **RDS → Create Database**
2. Engine: **PostgreSQL**
3. Template: **Serverless v2** or **Dev/Test**
4. DB cluster identifier: `vpn-cluster`
5. Master username: `vpnadmin`
6. Master password: (save this)
7. VPC: **same VPC as your Windows Server EC2**
8. Public access: **Yes** (or use VPC peering if private)
9. After creation, note the **Endpoint** URL

Then create the database:
```sql
CREATE DATABASE vpndb;
```

---

## Step 2 — Windows Server Setup (AWS EC2)

### Install Docker Desktop
1. Download Docker Desktop for Windows
2. Enable WSL2 backend
3. Start Docker Desktop

### Clone and configure
```powershell
# In PowerShell on Windows Server
cd C:\
git clone <your-repo> vpn-platform
cd vpn-platform

# Copy and edit env
copy .env.example .env
notepad .env
```

Fill in `.env`:
```
DATABASE_URL=postgresql+asyncpg://vpnadmin:YOUR_PASSWORD@YOUR_AURORA_ENDPOINT:5432/vpndb
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YOUR_STRONG_PASSWORD
```

### AWS Security Group — Windows Server
Open these ports:
| Port | Protocol | Source |
|------|----------|--------|
| 80   | TCP | 0.0.0.0/0 |
| 443  | TCP | 0.0.0.0/0 |
| 3389 | TCP | Your IP only (RDP) |

### Aurora RDS Security Group
Allow inbound port `5432` from Windows Server EC2 security group.

### Run the platform
```powershell
docker-compose up -d --build
```

### Run DB migration
```powershell
docker-compose exec backend alembic upgrade head
```

### Verify
```powershell
docker-compose ps
# All 3 services should show "running"
```

---

## Step 3 — Contabo VPN Server 1 Setup

SSH into your first Contabo server, then:

```bash
# Run the full setup script first (if not already done)
sudo bash setup_shadowsocks.sh

# Then install the agent
# Get SERVER_ID and AGENT_SECRET after adding server in admin dashboard
sudo bash agent-install.sh \
    <SERVER_UUID_FROM_DASHBOARD> \
    <AGENT_SECRET_FROM_DASHBOARD> \
    https://YOUR_WINDOWS_SERVER_IP
```

Repeat for **Server 2**.

---

## Step 4 — Add Servers in Admin Dashboard

1. Open `https://YOUR_WINDOWS_SERVER_IP` in browser
2. Login with your admin credentials
3. Go to **Servers → Add Server**
   - Name: `SG-Contabo-01`
   - Host: `<Contabo Server 1 IP>`
4. Copy the generated `SERVER_UUID` and `AGENT_SECRET`
5. Run `agent-install.sh` on Contabo Server 1 with those values
6. Repeat for Server 2

---

## Step 5 — Add Users

1. Go to **Users → Add User**
2. Set username, quota (bytes), expiry
3. Assign to both servers
4. Copy the subscription URL → share with user

### Subscription URL formats
```
# Shadowrocket (iPhone)
https://YOUR_DOMAIN/sub/USER_TOKEN

# Clash Meta (Android)
https://YOUR_DOMAIN/sub/USER_TOKEN?format=clash

# v2rayNG (Android)
https://YOUR_DOMAIN/sub/USER_TOKEN?format=v2rayng
```

---

## Useful Commands

```powershell
# Windows Server
docker-compose logs -f backend      # API logs
docker-compose restart backend      # Restart API
docker-compose exec backend alembic upgrade head  # Run migrations
```

```bash
# Contabo VPN Servers
systemctl status shadowsocks vpn-agent AdGuardHome
journalctl -u vpn-agent -f          # Agent logs
tail -f /var/log/shadowsocks.log    # SS logs
fail2ban-client status shadowsocks  # Banned IPs
```
