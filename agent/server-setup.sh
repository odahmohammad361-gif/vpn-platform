#!/bin/bash
# ================================================
#  VPN Server Full Setup
#  Installs shadowsocks-rust + Xray VLESS + AdGuard Home + agent
#  Usage: sudo bash server-setup.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>
#  Example: sudo bash server-setup.sh abc-uuid secret123 https://saymy-vpn.com
# ================================================

SERVER_ID="${1:-}"
AGENT_SECRET="${2:-}"
API_BASE="${3:-}"

if [[ -z "$SERVER_ID" || -z "$AGENT_SECRET" || -z "$API_BASE" ]]; then
    echo "Usage: sudo bash server-setup.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>"
    echo "Example: sudo bash server-setup.sh abc-uuid secret123 https://saymy-vpn.com"
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo "[ERROR] Run as root: sudo bash server-setup.sh ..."
    exit 1
fi

API_BASE="${API_BASE%/}"
API_BASE="${API_BASE%/agent}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SS_METHOD="chacha20-ietf-poly1305"
SS_VERSION="1.24.0"
SS_DIR="/etc/shadowsocks"
SS_BIN="/usr/local/bin/ssserver"
SS_LOG="/var/log/shadowsocks.log"
XRAY_CONFIG="/usr/local/etc/xray/config.json"
XRAY_CERT_DIR="/usr/local/etc/xray/certs"
AGH_VERSION="0.107.74"
AGH_DIR="/var/lib/adguardhome"
AGH_BIN="/usr/local/bin/AdGuardHome"
SS_PORT_RANGE="20000:29999"
VLESS_PORT_RANGE="30000:39999"
VPN_PORT_RANGE="20000:39999"

echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  VPN Server Full Setup${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# ── STEP 1 — System packages ─────────────────────
echo -e "${YELLOW}[1/10] Installing system packages...${NC}"
apt-get update -qq
apt-get install -y -qq curl wget tar xz-utils ufw openssl python3 jq ca-certificates certbot
# fail2ban requires python3-systemd on Ubuntu 22.04+ to register its systemd unit
apt-get install -y -qq python3-systemd fail2ban 2>/dev/null || apt-get install -y -qq fail2ban 2>/dev/null || true
# optional — ignore if unavailable
apt-get install -y python3-bcrypt 2>/dev/null || true
echo -e "${GREEN}      Done${NC}"

# File descriptor limits
echo "* soft nofile 51200
* hard nofile 51200
root soft nofile 51200
root hard nofile 51200" >> /etc/security/limits.conf

# ── STEP 2 — Download shadowsocks-rust ───────────
echo -e "${YELLOW}[2/10] Downloading shadowsocks-rust v${SS_VERSION}...${NC}"

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  SS_ARCH="x86_64-unknown-linux-musl" ;;
    aarch64) SS_ARCH="aarch64-unknown-linux-musl" ;;
    armv7l)  SS_ARCH="armv7-unknown-linux-musleabihf" ;;
    *)
        echo -e "${RED}[ERROR] Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

SS_URL="https://github.com/shadowsocks/shadowsocks-rust/releases/download/v${SS_VERSION}/shadowsocks-v${SS_VERSION}.${SS_ARCH}.tar.xz"
wget -q --show-progress "$SS_URL" -O /tmp/ss.tar.xz
tar -xf /tmp/ss.tar.xz -C /tmp/
cp /tmp/ssserver "$SS_BIN"
chmod +x "$SS_BIN"
rm -f /tmp/ss.tar.xz /tmp/ssserver /tmp/sslocal /tmp/ssurl /tmp/ssmanager 2>/dev/null || true
echo -e "${GREEN}      Installed: $SS_BIN${NC}"

# ── STEP 3 — Download Xray ───────────────────────
echo -e "${YELLOW}[3/10] Installing Xray for VLESS gRPC...${NC}"

if ! command -v xray >/dev/null 2>&1; then
    bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
fi
mkdir -p "$(dirname "$XRAY_CONFIG")" "$XRAY_CERT_DIR"
cat > "$XRAY_CONFIG" << 'EOF'
{
  "log": { "loglevel": "warning" },
  "inbounds": [],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ]
}
EOF
systemctl daemon-reload
systemctl enable xray > /dev/null 2>&1 || true
systemctl stop xray 2>/dev/null || true
echo -e "${GREEN}      Xray ready (agent starts it after VLESS sync)${NC}"

# ── STEP 4 — shadowsocks initial config ──────────
echo -e "${YELLOW}[4/10] Writing shadowsocks config...${NC}"

mkdir -p "$SS_DIR"
cat > "$SS_DIR/config.json" << 'EOF'
{
    "servers": []
}
EOF
echo -e "${GREEN}      Done${NC}"

# ── STEP 5 — BBR + kernel tuning ─────────────────
echo -e "${YELLOW}[5/10] Enabling BBR + enhanced kernel tuning...${NC}"

sed -i '/net.core.default_qdisc/d
/net.ipv4.tcp_congestion_control/d
/net.core.rmem_max/d
/net.core.wmem_max/d
/net.ipv4.tcp_rmem/d
/net.ipv4.tcp_wmem/d
/net.ipv4.tcp_mtu_probing/d
/net.ipv4.tcp_ecn/d
/net.ipv4.tcp_fastopen/d
/net.core.netdev_max_backlog/d
/net.core.somaxconn/d
/net.ipv4.tcp_max_syn_backlog/d
/net.ipv4.ip_local_port_range/d
/net.ipv4.tcp_tw_reuse/d
/net.ipv4.tcp_fin_timeout/d
/net.ipv4.tcp_keepalive_time/d
/net.ipv4.tcp_keepalive_intvl/d
/net.ipv4.tcp_keepalive_probes/d' /etc/sysctl.conf

cat >> /etc/sysctl.conf << 'EOF'
# ── VPN server: BBR + high bandwidth + low latency ──
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
# Large socket buffers for high-throughput
net.core.rmem_max=134217728
net.core.wmem_max=134217728
net.ipv4.tcp_rmem=4096 87380 67108864
net.ipv4.tcp_wmem=4096 65536 67108864
net.ipv4.tcp_mtu_probing=1
# Disable ECN — causes handshake failures on China Mobile/Unicom networks
net.ipv4.tcp_ecn=0
# TCP fast open for both client and server
net.ipv4.tcp_fastopen=3
# Connection queue depth
net.core.netdev_max_backlog=250000
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
# Port reuse + faster connection teardown
net.ipv4.ip_local_port_range=1024 65535
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=10
# Keepalive tuning
net.ipv4.tcp_keepalive_time=60
net.ipv4.tcp_keepalive_intvl=10
net.ipv4.tcp_keepalive_probes=6
EOF

sysctl -p > /dev/null 2>&1
echo -e "${GREEN}      BBR: $(sysctl -n net.ipv4.tcp_congestion_control)${NC}"

# ── STEP 6 — AdGuard Home ────────────────────────
echo -e "${YELLOW}[6/10] Installing AdGuard Home v${AGH_VERSION}...${NC}"

case "$ARCH" in
    x86_64)  AGH_ARCH="amd64" ;;
    aarch64) AGH_ARCH="arm64" ;;
    armv7l)  AGH_ARCH="armv7" ;;
    *)       AGH_ARCH="amd64" ;;
esac

AGH_URL="https://github.com/AdguardTeam/AdGuardHome/releases/download/v${AGH_VERSION}/AdGuardHome_linux_${AGH_ARCH}.tar.gz"
wget -q --show-progress "$AGH_URL" -O /tmp/agh.tar.gz
tar -xzf /tmp/agh.tar.gz -C /tmp/
cp /tmp/AdGuardHome/AdGuardHome "$AGH_BIN"
chmod +x "$AGH_BIN"
rm -rf /tmp/agh.tar.gz /tmp/AdGuardHome
echo -e "${GREEN}      Installed: $AGH_BIN${NC}"

# Free port 53 from systemd-resolved stub listener
mkdir -p /etc/systemd/resolved.conf.d
cat > /etc/systemd/resolved.conf.d/no-stub.conf << 'EOF'
[Resolve]
DNSStubListener=no
EOF
systemctl restart systemd-resolved 2>/dev/null || true

# Generate AdGuard admin password
AGH_PASSWORD=$(openssl rand -base64 12)
# Use bcrypt if available, otherwise fall back to a fixed known hash (password shown below)
if python3 -c "import bcrypt" 2>/dev/null; then
    AGH_HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('${AGH_PASSWORD}'.encode(), bcrypt.gensalt(10)).decode())")
else
    # Pre-computed bcrypt hash of the literal string "vpnadmin" — user should change via UI
    AGH_PASSWORD="vpnadmin"
    AGH_HASH='$2a$10$YKvBDM6PdE/v3rJq8n8X4OjPH5g1VLT1ORrVt8VnVCg/pUqKhCh8m'
fi

mkdir -p "$AGH_DIR"
cat > "$AGH_DIR/AdGuardHome.yaml" << 'YAML_EOF'
http:
  address: 0.0.0.0:3000
users:
  - name: admin
    password: "HASH_PLACEHOLDER"
dns:
  bind_hosts:
    - 0.0.0.0
  port: 53
  upstream_dns:
    - https://dns.google/dns-query
    - https://cloudflare-dns.com/dns-query
  bootstrap_dns:
    - 8.8.8.8
    - 1.1.1.1
  filtering_enabled: true
  filters_update_interval: 24
filters:
  - enabled: true
    url: https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt
    name: AdGuard DNS filter
    id: 1
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_9.txt
    name: Malware & Phishing
    id: 2
querylog:
  enabled: false
  file_enabled: false
  interval: 1h
  ignored: []
statistics:
  enabled: false
  interval: 1h
  ignored: []
schema_version: 29
YAML_EOF

sed -i "s|HASH_PLACEHOLDER|${AGH_HASH}|" "$AGH_DIR/AdGuardHome.yaml"

cat > /etc/systemd/system/adguardhome.service << EOF
[Unit]
Description=AdGuard Home DNS
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=${AGH_BIN} --no-check-update -c ${AGH_DIR}/AdGuardHome.yaml --work-dir ${AGH_DIR}
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
# NOT enabled or started — agent controls it based on adguard_enabled flag

# Purge AdGuard query log and stats files daily — they eat disk even when logging is "disabled"
echo "0 3 * * * root find ${AGH_DIR} -name 'querylog.json*' -o -name 'stats.db' | xargs rm -f 2>/dev/null" \
    > /etc/cron.d/adguardhome-cleanup
chmod 644 /etc/cron.d/adguardhome-cleanup

echo -e "${GREEN}      AdGuard Home ready (controlled by admin toggle)${NC}"
echo -e "${GREEN}      Admin URL : http://127.0.0.1:3000  (SSH forward to access)${NC}"
echo -e "${GREEN}      Password  : ${AGH_PASSWORD}${NC}"

# ── STEP 7 — UFW + bot blocking ──────────────────
echo -e "${YELLOW}[7/10] Configuring firewall + bot blocking...${NC}"

ufw allow ssh             > /dev/null 2>&1 || true
ufw allow 80/tcp          > /dev/null 2>&1 || true
ufw allow 443/tcp         > /dev/null 2>&1 || true
ufw allow 53/tcp          > /dev/null 2>&1 || true
ufw allow 53/udp          > /dev/null 2>&1 || true
ufw allow 3000/tcp        > /dev/null 2>&1 || true
ufw allow ${SS_PORT_RANGE}/tcp    > /dev/null 2>&1 || true
ufw allow ${SS_PORT_RANGE}/udp    > /dev/null 2>&1 || true
ufw allow ${VLESS_PORT_RANGE}/tcp > /dev/null 2>&1 || true
echo "y" | ufw enable     > /dev/null 2>&1 || true

# Remove stale duplicate rate-limit rules from previous installs
for n in $(iptables -L INPUT --line-numbers -n 2>/dev/null | awk '/vpn_ratelimit/ {print $1}' | sort -rn); do
    iptables -D INPUT "$n" 2>/dev/null || true
done

# Rate-limit new TCP connections to VPN ports: max 15 new per IP per minute
iptables -A INPUT -p tcp --dport "$VPN_PORT_RANGE" -m state --state NEW \
    -m recent --name vpn_ratelimit --set 2>/dev/null || true
iptables -A INPUT -p tcp --dport "$VPN_PORT_RANGE" -m state --state NEW \
    -m recent --name vpn_ratelimit --update --seconds 60 --hitcount 15 -j DROP 2>/dev/null || true
# UFW already persists rules across reboots natively

echo -e "${GREEN}      Firewall active, bot rate-limit applied${NC}"

# Persist raw iptables rules so they survive reboots
iptables-save > /etc/iptables.rules 2>/dev/null || true
echo "@reboot root iptables-restore < /etc/iptables.rules" > /etc/cron.d/iptables-restore
chmod 644 /etc/cron.d/iptables-restore

# ── STEP 8 — shadowsocks systemd ─────────────────
echo -e "${YELLOW}[8/10] Creating shadowsocks service...${NC}"

touch "$SS_LOG"

cat > /etc/systemd/system/shadowsocks.service << EOF
[Unit]
Description=Shadowsocks-Rust Server
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=$SS_BIN -c $SS_DIR/config.json
Restart=always
RestartSec=3
LimitNOFILE=65536
StandardOutput=append:$SS_LOG
StandardError=append:$SS_LOG

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable shadowsocks > /dev/null 2>&1
# Do NOT start yet — ssserver exits with code 64 on empty config
# The agent will start it after the first user sync
SS_STATUS="waiting for agent sync"
echo -e "${GREEN}      Shadowsocks: $SS_STATUS${NC}"

# ── STEP 9 — Install VPN agent ───────────────────
echo -e "${YELLOW}[9/10] Installing VPN agent...${NC}"

cat > /usr/local/bin/vpn-agent.sh << 'AGENT_EOF'
#!/bin/bash
# ================================================
#  VPN Agent — runs on each VPN server
#  Syncs users, reports traffic, watchdog, AdGuard
# ================================================

API_BASE="REPLACE_WITH_API_BASE/agent"
SERVER_ID="REPLACE_WITH_SERVER_UUID"
AGENT_SECRET="REPLACE_WITH_AGENT_SECRET"
SS_CONFIG="/etc/shadowsocks/config.json"
XRAY_CONFIG="/usr/local/etc/xray/config.json"
XRAY_CERT_DIR="/usr/local/etc/xray/certs"
XRAY_STATS_PORT="10086"
PORT_MAP="/tmp/vpn_port_map.json"
CYCLE_SECONDS=30

# ── HMAC signature ────────────────────────────────
sign_request() {
    local body="${1:-}"
    local ts=$(date +%s)
    local sig=$(echo -n "${SERVER_ID}:${ts}:${body}" | openssl dgst -sha256 -hmac "$AGENT_SECRET" | awk '{print $2}')
    echo "$ts $sig"
}

api_get() {
    local path="$1"
    read -r ts sig <<< "$(sign_request "")"
    curl -sfk "${API_BASE}${path}" \
        --connect-timeout 10 \
        --max-time 30 \
        -H "X-Agent-ID: ${SERVER_ID}" \
        -H "X-Agent-Timestamp: ${ts}" \
        -H "X-Agent-Signature: ${sig}"
}

api_post() {
    local path="$1"
    local body="${2:-}"
    read -r ts sig <<< "$(sign_request "$body")"
    curl -sfk -X POST "${API_BASE}${path}" \
        --connect-timeout 10 \
        --max-time 30 \
        -H "Content-Type: application/json" \
        -H "X-Agent-ID: ${SERVER_ID}" \
        -H "X-Agent-Timestamp: ${ts}" \
        -H "X-Agent-Signature: ${sig}" \
        -d "$body"
}

# ── iptables accounting per port ──────────────────
setup_accounting() {
    iptables -N VPN_IN  2>/dev/null || iptables -F VPN_IN
    iptables -N VPN_OUT 2>/dev/null || iptables -F VPN_OUT
    iptables -C INPUT  -j VPN_IN  2>/dev/null || iptables -I INPUT  -j VPN_IN
    iptables -C OUTPUT -j VPN_OUT 2>/dev/null || iptables -I OUTPUT -j VPN_OUT

    while IFS= read -r port; do
        [[ -z "$port" ]] && continue
        iptables -A VPN_IN  -p tcp --dport "$port"
        iptables -A VPN_IN  -p udp --dport "$port"
        iptables -A VPN_OUT -p tcp --sport "$port"
        iptables -A VPN_OUT -p udp --sport "$port"
    done < <(python3 -c "import json,sys; [print(p) for p in json.load(open('$PORT_MAP')).keys()]" 2>/dev/null)
}

ensure_xray_cert() {
    local domain="$1"
    [[ -z "$domain" ]] && { echo "[vless] Missing TLS domain"; return 1; }

    mkdir -p "$XRAY_CERT_DIR"
    if [[ -s "$XRAY_CERT_DIR/fullchain.pem" && -s "$XRAY_CERT_DIR/privkey.pem" ]] \
        && openssl x509 -in "$XRAY_CERT_DIR/fullchain.pem" -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:${domain}"; then
        return 0
    fi

    if [[ ! -s "/etc/letsencrypt/live/${domain}/fullchain.pem" || ! -s "/etc/letsencrypt/live/${domain}/privkey.pem" ]]; then
        echo "[vless] Requesting Let's Encrypt cert for ${domain}"
        systemctl stop xray 2>/dev/null || true
        certbot certonly --standalone \
            -d "$domain" \
            --agree-tos \
            --register-unsafely-without-email \
            --non-interactive || return 1
    fi

    cp "/etc/letsencrypt/live/${domain}/fullchain.pem" "$XRAY_CERT_DIR/fullchain.pem"
    cp "/etc/letsencrypt/live/${domain}/privkey.pem" "$XRAY_CERT_DIR/privkey.pem"

    local xray_user xray_group
    xray_user=$(systemctl cat xray 2>/dev/null | awk -F= '/^User=/ {print $2; exit}')
    xray_user="${xray_user:-nobody}"
    xray_group=$(id -gn "$xray_user" 2>/dev/null || echo nogroup)
    chown "$xray_user:$xray_group" "$XRAY_CERT_DIR/fullchain.pem" "$XRAY_CERT_DIR/privkey.pem" 2>/dev/null || true
    chmod 644 "$XRAY_CERT_DIR/fullchain.pem"
    chmod 600 "$XRAY_CERT_DIR/privkey.pem"
}

sync_vless() {
    local config="$1"
    local vless_count vless_sni public_port listen_addr listen_port tls_mode

    vless_count=$(echo "$config" | jq '[.[] | select(.vless_uuid and .vless_port and .vless_sni and (.vless_transport == "grpc"))] | length' 2>/dev/null || echo 0)
    if [[ "$vless_count" -eq 0 ]]; then
        systemctl stop xray 2>/dev/null || true
        echo "[vless] No agent-managed VLESS users; Xray stopped"
        return 0
    fi

    vless_sni=$(echo "$config" | jq -r '[.[] | select(.vless_uuid and .vless_port and .vless_sni and (.vless_transport == "grpc"))][0].vless_sni // empty')
    public_port=$(echo "$config" | jq -r '[.[] | select(.vless_uuid and .vless_port and .vless_sni and (.vless_transport == "grpc"))][0].vless_port // empty')
    if ! [[ "$public_port" =~ ^[0-9]+$ ]] || [[ "$public_port" != "443" && ( "$public_port" -lt 30000 || "$public_port" -gt 39999 ) ]]; then
        systemctl stop xray 2>/dev/null || true
        echo "[vless] Invalid VLESS port ${public_port}; use 443 for Cloudflare or 30000-39999 for direct mode"
        return 1
    fi

    listen_addr="0.0.0.0"
    listen_port="$public_port"
    tls_mode="direct"

    if [[ "$public_port" == "443" ]] && ss -ltnp 2>/dev/null | awk '$4 ~ /:443$/ && $0 !~ /xray/ {found=1} END {exit !found}'; then
        listen_addr="127.0.0.1"
        listen_port="10085"
        tls_mode="proxy"
        echo "[vless] Port 443 is already in use; using local gRPC proxy mode on 127.0.0.1:10085"
    else
        ensure_xray_cert "$vless_sni" || { echo "[vless] TLS cert failed for ${vless_sni}"; return 1; }
    fi

    echo "$config" | XRAY_CERT_DIR="$XRAY_CERT_DIR" XRAY_LISTEN_ADDR="$listen_addr" XRAY_LISTEN_PORT="$listen_port" XRAY_TLS_MODE="$tls_mode" XRAY_STATS_PORT="$XRAY_STATS_PORT" python3 -c '
import json, os, sys

entries = [
    e for e in json.load(sys.stdin)
    if e.get("vless_uuid") and e.get("vless_port") and e.get("vless_sni") and e.get("vless_transport") == "grpc"
]
first = entries[0]
cert_dir = os.environ["XRAY_CERT_DIR"]
listen_addr = os.environ["XRAY_LISTEN_ADDR"]
listen_port = int(os.environ["XRAY_LISTEN_PORT"])
tls_mode = os.environ["XRAY_TLS_MODE"]
stats_port = int(os.environ["XRAY_STATS_PORT"])
clients = []
seen = set()
for e in entries:
    uid = e["vless_uuid"]
    if uid in seen:
        continue
    seen.add(uid)
    clients.append({
        "id": uid,
        "email": e.get("user_server_id") or uid,
    })

stream_settings = {
    "network": "grpc",
    "security": "none",
    "grpcSettings": {
        "serviceName": first.get("vless_grpc_service_name") or "grpc",
        "multiMode": False,
    },
}
if tls_mode == "direct":
    stream_settings["security"] = "tls"
    stream_settings["tlsSettings"] = {
        "serverName": first["vless_sni"],
        "alpn": ["h2"],
        "certificates": [
            {
                "certificateFile": f"{cert_dir}/fullchain.pem",
                "keyFile": f"{cert_dir}/privkey.pem",
            }
        ],
    }

cfg = {
    "log": {"loglevel": "warning"},
    "policy": {
        "levels": {
            "0": {
                "statsUserUplink": True,
                "statsUserDownlink": True,
            }
        }
    },
    "stats": {},
    "api": {
        "tag": "api",
        "services": ["StatsService"],
    },
    "inbounds": [
        {
            "tag": "vless-grpc-tls",
            "listen": listen_addr,
            "port": listen_port,
            "protocol": "vless",
            "settings": {
                "clients": clients,
                "decryption": "none",
            },
            "streamSettings": stream_settings,
            "sniffing": {
                "enabled": True,
                "destOverride": ["http", "tls", "quic"],
            },
        },
        {
            "tag": "api",
            "listen": "127.0.0.1",
            "port": stats_port,
            "protocol": "dokodemo-door",
            "settings": {
                "address": "127.0.0.1",
            },
        }
    ],
    "outbounds": [
        {"protocol": "freedom", "tag": "direct"},
        {"protocol": "blackhole", "tag": "block"},
    ],
    "routing": {
        "rules": [
            {
                "type": "field",
                "inboundTag": ["api"],
                "outboundTag": "api",
            }
        ]
    },
}
print(json.dumps(cfg, indent=2))
' > "$XRAY_CONFIG" || return 1

    if ! xray run -test -config "$XRAY_CONFIG" >/dev/null; then
        echo "[vless] Xray config test failed"
        return 1
    fi

    systemctl restart xray
    echo "[vless] Xray synced with ${vless_count} client(s) for ${vless_sni} (${listen_addr}:${listen_port}, ${tls_mode})"
}

# ── Sync users — write config + restart ssserver ──
sync_users() {
    local config
    config=$(api_get "/config/${SERVER_ID}") || { echo "[sync] Failed to fetch config"; return 1; }
    [[ -z "$config" ]] && { echo "[sync] Empty config response — skipping"; return 1; }

    # Write shadowsocks multi-port config with low-latency options
    echo "$config" | python3 -c "
import sys, json
entries = json.load(sys.stdin)
servers = []
for e in entries:
    servers.append({
        'server': '0.0.0.0',
        'server_port': e['port'],
        'password': e['password'],
        'method': e['method'],
        'mode': 'tcp_and_udp',
        'fast_open': True,
        'no_delay': True,
        'mtu': 1360
    })
print(json.dumps({'servers': servers}, indent=4))
" > "$SS_CONFIG"

    # Save port → user_server_id map for traffic reporting
    echo "$config" | python3 -c "
import sys, json
entries = json.load(sys.stdin)
print(json.dumps({str(e['port']): str(e['user_server_id']) for e in entries}))
" > "$PORT_MAP"

    # Flush accumulated traffic before resetting iptables chains
    report_traffic
    report_vless_traffic
    user_count=$(echo "$config" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    if [[ "$user_count" -gt 0 ]]; then
        systemctl restart shadowsocks
    else
        systemctl stop shadowsocks 2>/dev/null || true
    fi
    setup_accounting
    echo "[sync] Config written with $(echo "$config" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null) user(s)"

    sync_vless "$config" || return 1

    api_post "/sync-ack/${SERVER_ID}" "{}"
    echo "[sync] Sync complete"
}

# ── Report traffic via iptables byte counts ───────
report_traffic() {
    [[ ! -f "$PORT_MAP" ]] && return
    local port_map
    port_map=$(cat "$PORT_MAP")
    [[ -z "$port_map" || "$port_map" == "{}" ]] && return

    local payload
    payload=$(python3 -c "
import subprocess, json, re

with open('$PORT_MAP') as _f:
    port_map = json.load(_f)

def read_chain(chain, field):
    try:
        out = subprocess.check_output(['iptables', '-xvnL', chain], stderr=subprocess.DEVNULL).decode()
    except:
        return {}
    result = {}
    for line in out.splitlines():
        m = re.search(r'^\s*\d+\s+(\d+)\s+.*?' + field + r':(\d+)', line)
        if m:
            result[m.group(2)] = result.get(m.group(2), 0) + int(m.group(1))
    return result

def get_client_ips_by_port():
    port_ips = {}
    try:
        out = subprocess.check_output(
            ['ss', '-tn', 'state', 'established'],
            stderr=subprocess.DEVNULL
        ).decode()
        for line in out.splitlines():
            parts = line.split()
            if len(parts) < 4:
                continue
            lm = re.search(r':(\d+)$', parts[2])
            pm = re.search(r'^(\d+\.\d+\.\d+\.\d+)', parts[3])
            if lm and pm and lm.group(1) in port_map:
                port_ips[lm.group(1)] = pm.group(1)
    except Exception:
        pass
    return port_ips

dl = read_chain('VPN_IN',  'dpt')
ul = read_chain('VPN_OUT', 'spt')
client_ips = get_client_ips_by_port()

entries = []
for port, uid in port_map.items():
    d = dl.get(port, 0)
    u = ul.get(port, 0)
    if d > 0 or u > 0 or port in client_ips:
        entry = {
            'user_server_id': uid,
            'upload_bytes': u,
            'download_bytes': d,
            'interval_sec': $CYCLE_SECONDS
        }
        if port in client_ips:
            entry['client_ip'] = client_ips[port]
        entries.append(entry)
print(json.dumps(entries))
")

    if [[ -n "$payload" && "$payload" != "[]" ]]; then
        if api_post "/traffic/${SERVER_ID}" "$payload" > /dev/null; then
            # Reset counters only after the API accepts the report.
            iptables -Z VPN_IN  2>/dev/null || true
            iptables -Z VPN_OUT 2>/dev/null || true
            echo "[traffic] Reported: $payload"
        else
            echo "[traffic] Failed to report — preserving counters"
        fi
    fi
}

# ── Report VLESS traffic via Xray per-user stats ─
report_vless_traffic() {
    [[ ! -s "$XRAY_CONFIG" ]] && return
    systemctl is-active --quiet xray || return
    command -v xray >/dev/null 2>&1 || return

    local raw payload
    raw=$(xray api statsquery --server "127.0.0.1:${XRAY_STATS_PORT}" -pattern "user>>>" 2>/dev/null || true)
    [[ -z "$raw" ]] && return

    payload=$(printf '%s\n' "$raw" | python3 -c "
import json, re, sys

data = sys.stdin.read()
totals = {}
for name, value in re.findall(r'name:\\s*\"([^\"]+)\".*?value:\\s*(\\d+)', data, re.S):
    match = re.match(r'user>>>([^>]+)>>>traffic>>>(uplink|downlink)$', name)
    if not match:
        continue
    user_server_id, direction = match.groups()
    slot = totals.setdefault(user_server_id, {'upload_bytes': 0, 'download_bytes': 0})
    if direction == 'uplink':
        slot['upload_bytes'] += int(value)
    else:
        slot['download_bytes'] += int(value)

entries = []
for user_server_id, values in totals.items():
    if values['upload_bytes'] <= 0 and values['download_bytes'] <= 0:
        continue
    entries.append({
        'user_server_id': user_server_id,
        'upload_bytes': values['upload_bytes'],
        'download_bytes': values['download_bytes'],
        'interval_sec': $CYCLE_SECONDS,
    })
print(json.dumps(entries))
")

    if [[ -n "$payload" && "$payload" != "[]" ]]; then
        if api_post "/traffic/${SERVER_ID}" "$payload" > /dev/null; then
            xray api statsquery --server "127.0.0.1:${XRAY_STATS_PORT}" -pattern "user>>>" -reset >/dev/null 2>&1 || true
            echo "[vless-traffic] Reported: $payload"
        else
            echo "[vless-traffic] Failed to report — preserving Xray counters"
        fi
    fi
}

# ── Main loop ─────────────────────────────────────
echo "[agent] Starting VPN agent for server ${SERVER_ID}"
FIRST_RUN=true

while true; do
    # ── Heartbeat ─────────────────────────────────
    response=$(api_post "/heartbeat/${SERVER_ID}" "{}")

    if [[ -z "$response" ]]; then
        echo "[heartbeat] No response from API — will retry"
        sleep "$CYCLE_SECONDS"
        continue
    fi

    sync_required=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sync_required', False))" 2>/dev/null || echo "False")
    adguard_enabled=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('adguard_enabled', False))" 2>/dev/null || echo "False")

    # ── Sync users if needed (always on first run) ─
    if [[ "$sync_required" == "True" || "$FIRST_RUN" == "true" ]]; then
        if sync_users; then
            FIRST_RUN=false
        else
            echo "[sync] Will retry next cycle"
        fi
    fi

    # ── Watchdog: restart shadowsocks if down ──────
    # Skip if config has no servers — nothing to run yet
    server_count=$(python3 -c "import json; d=json.load(open('$SS_CONFIG')); print(len(d.get('servers', [])))" 2>/dev/null || echo 0)
    if [[ "$server_count" -gt 0 ]] && ! systemctl is-active --quiet shadowsocks; then
        echo "[watchdog] Shadowsocks is down — restarting"
        report_traffic
        systemctl restart shadowsocks
        sleep 2
        setup_accounting
        echo "[watchdog] Shadowsocks restarted"
    fi

    vless_inbounds=$(python3 -c "import json; d=json.load(open('$XRAY_CONFIG')); print(len(d.get('inbounds', [])))" 2>/dev/null || echo 0)
    if [[ "$vless_inbounds" -gt 0 ]] && ! systemctl is-active --quiet xray; then
        echo "[watchdog] Xray is down — restarting"
        systemctl restart xray
        echo "[watchdog] Xray restarted"
    fi

    # ── AdGuard Home control ───────────────────────
    if [[ "$adguard_enabled" == "True" ]]; then
        systemctl is-active --quiet adguardhome || { echo "[adguard] Starting AdGuard Home"; systemctl start adguardhome; }
    else
        systemctl is-active --quiet adguardhome && { echo "[adguard] Stopping AdGuard Home"; systemctl stop adguardhome; }
    fi

    # ── Report traffic ─────────────────────────────
    report_traffic
    report_vless_traffic

    sleep "$CYCLE_SECONDS"
done
AGENT_EOF

chmod +x /usr/local/bin/vpn-agent.sh

sed -i "s|REPLACE_WITH_SERVER_UUID|${SERVER_ID}|g" /usr/local/bin/vpn-agent.sh
sed -i "s|REPLACE_WITH_AGENT_SECRET|${AGENT_SECRET}|g" /usr/local/bin/vpn-agent.sh
sed -i "s|REPLACE_WITH_API_BASE|${API_BASE}|g" /usr/local/bin/vpn-agent.sh

cat > /etc/systemd/system/vpn-agent.service << EOF
[Unit]
Description=VPN Agent
After=network.target shadowsocks.service
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=/usr/local/bin/vpn-agent.sh
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vpn-agent > /dev/null 2>&1
systemctl restart vpn-agent
sleep 2

AGENT_STATUS=$(systemctl is-active vpn-agent)
echo -e "${GREEN}      Agent: $AGENT_STATUS${NC}"

# ── STEP 10 — fail2ban ───────────────────────────
echo -e "${YELLOW}[10/10] Configuring fail2ban...${NC}"

mkdir -p /etc/fail2ban/filter.d /etc/fail2ban/jail.d

cat > /etc/fail2ban/filter.d/shadowsocks.conf << 'EOF'
[Definition]
failregex = (?:tcp tunnel handshake failed|handshake failed|connect error).* peer: <HOST>:
ignoreregex =
EOF

cat > /etc/fail2ban/jail.d/shadowsocks.conf << EOF
[shadowsocks]
enabled  = true
filter   = shadowsocks
logpath  = $SS_LOG
maxretry = 3
findtime = 60
bantime  = 3600
action   = iptables-allports
EOF

systemctl enable fail2ban > /dev/null 2>&1 || true
systemctl restart fail2ban 2>/dev/null || true
F2B_STATUS=$(systemctl is-active fail2ban 2>/dev/null || echo "not installed")
echo -e "${GREEN}      fail2ban: $F2B_STATUS${NC}"

# ── Summary ──────────────────────────────────────
echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  SETUP COMPLETE${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
echo -e "  Server Code  : ${GREEN}$SERVER_ID${NC}"
echo -e "  API Base     : ${GREEN}$API_BASE${NC}"
echo -e "  Shadowsocks  : ${GREEN}$SS_STATUS${NC} (will activate once agent syncs users)"
echo -e "  VLESS gRPC   : ${GREEN}Xray installed${NC} (will activate when server VLESS fields are set)"
echo -e "  Agent        : ${GREEN}$AGENT_STATUS${NC}"
echo -e "  fail2ban     : ${GREEN}$F2B_STATUS${NC}"
echo -e "  AdGuard Home : ${YELLOW}Installed (enable via admin toggle)${NC}"
echo -e "  AdGuard URL  : ${YELLOW}http://127.0.0.1:3000 (SSH forward)${NC}"
echo -e "  AdGuard Pass : ${YELLOW}${AGH_PASSWORD}${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    journalctl -u vpn-agent -f         # Agent logs"
echo -e "    journalctl -u shadowsocks -f       # SS logs"
echo -e "    journalctl -u xray -f              # VLESS/Xray logs"
echo -e "    journalctl -u adguardhome -f       # AdGuard logs"
echo -e "    systemctl status vpn-agent"
echo -e "    # SSH forward for AdGuard UI:"
echo -e "    ssh -L 3000:127.0.0.1:3000 root@<server-ip>"
echo ""
