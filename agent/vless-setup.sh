#!/bin/bash
# ================================================
#  VLESS + Reality Setup
#  Installs Xray-core + VPN agent
#  Usage: sudo bash vless-setup.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>
#  Example: sudo bash vless-setup.sh abc-uuid secret123 https://52.77.235.166:8443
# ================================================

SERVER_ID="$1"
AGENT_SECRET="$2"
API_BASE="$3"

if [[ -z "$SERVER_ID" || -z "$AGENT_SECRET" || -z "$API_BASE" ]]; then
    echo "Usage: sudo bash vless-setup.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>"
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo "[ERROR] Run as root: sudo bash vless-setup.sh ..."
    exit 1
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

XRAY_DIR="/etc/xray"
XRAY_BIN="/usr/local/bin/xray"
REALITY_SNI="addons.mozilla.org"

echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  VLESS + Reality Server Setup${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# ── STEP 1 — System packages + kernel tuning ─────
echo -e "${YELLOW}[1/7] Installing system packages...${NC}"
apt-get update -qq
apt-get install -y -qq curl wget tar xz-utils ufw openssl python3 jq unzip

# Kernel tuning
sed -i '/net.core.default_qdisc/d
/net.ipv4.tcp_congestion_control/d
/net.core.rmem_max/d
/net.core.wmem_max/d
/net.ipv4.tcp_rmem/d
/net.ipv4.tcp_wmem/d
/net.ipv4.tcp_mtu_probing/d
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
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.core.rmem_max=134217728
net.core.wmem_max=134217728
net.ipv4.tcp_rmem=4096 87380 67108864
net.ipv4.tcp_wmem=4096 65536 67108864
net.ipv4.tcp_mtu_probing=1
net.ipv4.tcp_ecn=0
net.ipv4.tcp_fastopen=3
net.core.netdev_max_backlog=250000
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
net.ipv4.ip_local_port_range=1024 65535
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=10
net.ipv4.tcp_keepalive_time=60
net.ipv4.tcp_keepalive_intvl=10
net.ipv4.tcp_keepalive_probes=6
net.ipv4.tcp_slow_start_after_idle=0
EOF
sysctl -p > /dev/null 2>&1
echo "* soft nofile 51200
* hard nofile 51200
root soft nofile 51200
root hard nofile 51200" >> /etc/security/limits.conf
echo -e "${GREEN}      Done${NC}"

# ── STEP 2 — Install Xray-core ───────────────────
echo -e "${YELLOW}[2/7] Installing Xray-core...${NC}"

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  XRAY_ARCH="64" ;;
    aarch64) XRAY_ARCH="arm64-v8a" ;;
    armv7l)  XRAY_ARCH="arm32-v7a" ;;
    *)
        echo -e "${RED}[ERROR] Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

XRAY_VERSION=$(curl -sfk https://api.github.com/repos/XTLS/Xray-core/releases/latest | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null || echo "v26.2.4")
XRAY_URL="https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/Xray-linux-${XRAY_ARCH}.zip"

wget -q --show-progress "$XRAY_URL" -O /tmp/xray.zip
unzip -q /tmp/xray.zip -d /tmp/xray/
cp /tmp/xray/xray "$XRAY_BIN"
chmod +x "$XRAY_BIN"
rm -rf /tmp/xray.zip /tmp/xray/
echo -e "${GREEN}      Installed: $XRAY_BIN ($XRAY_VERSION)${NC}"

# ── STEP 3 — Generate Reality keys ───────────────
echo -e "${YELLOW}[3/7] Generating Reality keys...${NC}"

mkdir -p "$XRAY_DIR"
REALITY_KEYS=$("$XRAY_BIN" x25519)
REALITY_PRIVATE=$(echo "$REALITY_KEYS" | grep -i "private" | awk '{print $NF}')
REALITY_PUBLIC=$(echo "$REALITY_KEYS" | grep -i "public" | awk '{print $NF}')
REALITY_SHORT_ID=$(openssl rand -hex 8)

echo "REALITY_PRIVATE=${REALITY_PRIVATE}" > "$XRAY_DIR/reality.env"
echo "REALITY_PUBLIC=${REALITY_PUBLIC}"   >> "$XRAY_DIR/reality.env"
echo "REALITY_SHORT_ID=${REALITY_SHORT_ID}" >> "$XRAY_DIR/reality.env"
chmod 600 "$XRAY_DIR/reality.env"

echo -e "${GREEN}      Public key : ${REALITY_PUBLIC}${NC}"
echo -e "${GREEN}      Short ID   : ${REALITY_SHORT_ID}${NC}"

# ── STEP 4 — Write initial Xray config ───────────
echo -e "${YELLOW}[4/7] Writing Xray config...${NC}"

cat > "$XRAY_DIR/config.json" << EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "tag": "vless-in",
      "settings": {
        "clients": [],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "${REALITY_SNI}:443",
          "xver": 0,
          "serverNames": ["${REALITY_SNI}"],
          "privateKey": "${REALITY_PRIVATE}",
          "shortIds": ["${REALITY_SHORT_ID}"]
        }
      },
      "sniffing": { "enabled": false }
    },
    {
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "tag": "api",
      "settings": { "address": "127.0.0.1" }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ],
  "policy": {
    "levels": { "0": { "statsUserUplink": true, "statsUserDownlink": true } },
    "system": { "statsInboundUplink": true, "statsInboundDownlink": true }
  },
  "stats": {},
  "api": {
    "tag": "api",
    "services": ["StatsService"]
  },
  "routing": {
    "rules": [
      { "inboundTag": ["api"], "outboundTag": "api", "type": "field" }
    ]
  }
}
EOF
echo -e "${GREEN}      Done${NC}"

# ── STEP 5 — Xray systemd service ────────────────
echo -e "${YELLOW}[5/7] Creating Xray service...${NC}"

cat > /etc/systemd/system/xray.service << EOF
[Unit]
Description=Xray Service
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=${XRAY_BIN} run -c ${XRAY_DIR}/config.json
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable xray > /dev/null 2>&1
systemctl restart xray
sleep 2
XRAY_STATUS=$(systemctl is-active xray)
echo -e "${GREEN}      Xray: $XRAY_STATUS${NC}"

# ── STEP 6 — Firewall ────────────────────────────
echo -e "${YELLOW}[6/7] Configuring firewall...${NC}"
ufw allow ssh       > /dev/null 2>&1 || true
ufw allow 80/tcp    > /dev/null 2>&1 || true
ufw allow 443/tcp   > /dev/null 2>&1 || true
echo "y" | ufw enable > /dev/null 2>&1 || true
echo -e "${GREEN}      Done${NC}"

# ── STEP 7 — Install VLESS agent ─────────────────
echo -e "${YELLOW}[7/7] Installing VLESS agent...${NC}"

cat > /usr/local/bin/vless-agent.sh << 'AGENT_EOF'
#!/bin/bash
# ================================================
#  VLESS Agent — runs on each VLESS/Reality server
#  Syncs users, reports traffic via Xray stats API
# ================================================

API_BASE="REPLACE_WITH_API_BASE/api/agent"
SERVER_ID="REPLACE_WITH_SERVER_UUID"
AGENT_SECRET="REPLACE_WITH_AGENT_SECRET"
XRAY_CONFIG="/etc/xray/config.json"
USER_MAP="/tmp/vless_user_map.json"
CYCLE_SECONDS=30

# Load Reality keys
source /etc/xray/reality.env

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
        -H "X-Agent-ID: ${SERVER_ID}" \
        -H "X-Agent-Timestamp: ${ts}" \
        -H "X-Agent-Signature: ${sig}"
}

api_post() {
    local path="$1"
    local body="${2:-}"
    read -r ts sig <<< "$(sign_request "$body")"
    curl -sfk -X POST "${API_BASE}${path}" \
        -H "Content-Type: application/json" \
        -H "X-Agent-ID: ${SERVER_ID}" \
        -H "X-Agent-Timestamp: ${ts}" \
        -H "X-Agent-Signature: ${sig}" \
        -d "$body"
}

sync_users() {
    local config
    config=$(api_get "/config/${SERVER_ID}") || { echo "[sync] Failed to fetch config"; return 1; }

    python3 - << PYEOF
import sys, json

entries = json.loads('''$config''')

# Build Xray VLESS clients list
clients = []
user_map = {}
for e in entries:
    uid = str(e['user_server_id'])
    # password field holds the UUID for VLESS
    clients.append({
        "id": e['password'],
        "flow": "xtls-rprx-vision",
        "email": uid
    })
    user_map[uid] = uid

with open('$XRAY_CONFIG', 'r') as f:
    xray_cfg = json.load(f)

xray_cfg['inbounds'][0]['settings']['clients'] = clients

with open('$XRAY_CONFIG', 'w') as f:
    json.dump(xray_cfg, f, indent=2)

with open('$USER_MAP', 'w') as f:
    json.dump(user_map, f)

print(f"[sync] Config written with {len(clients)} user(s)")
PYEOF

    systemctl restart xray
    sleep 1
    echo "[sync] Sync complete"
    api_post "/sync-ack/${SERVER_ID}" "{}"
}

report_traffic() {
    [[ ! -f "$USER_MAP" ]] && return
    local user_map
    user_map=$(cat "$USER_MAP")
    [[ "$user_map" == "{}" || -z "$user_map" ]] && return

    # Query Xray stats API via gRPC (xray API command)
    local stats_output
    stats_output=$(/usr/local/bin/xray api statsquery --server=127.0.0.1:10085 2>/dev/null) || return

    local payload
    payload=$(python3 - << PYEOF
import json, sys

user_map = json.loads('''$user_map''')
stats_raw = '''$stats_output'''

ul_map = {}
dl_map = {}

try:
    data = json.loads(stats_raw)
    for stat in data.get('stat', []):
        name = stat.get('name', '')
        val  = int(stat.get('value', 0))
        parts = name.split('>>>')
        if len(parts) == 4 and parts[0] == 'user':
            uid = parts[1]
            direction = parts[3]
            if direction == 'uplink':
                ul_map[uid] = ul_map.get(uid, 0) + val
            elif direction == 'downlink':
                dl_map[uid] = dl_map.get(uid, 0) + val
except Exception as e:
    print(f'[]', flush=True)
    raise SystemExit(0)

entries = []
for uid in user_map:
    ul = ul_map.get(uid, 0)
    dl = dl_map.get(uid, 0)
    if ul > 0 or dl > 0:
        entries.append({
            'user_server_id': uid,
            'upload_bytes': ul,
            'download_bytes': dl,
            'interval_sec': $CYCLE_SECONDS
        })

print(json.dumps(entries))
PYEOF
)

    if [[ -n "$payload" && "$payload" != "[]" ]]; then
        api_post "/traffic/${SERVER_ID}" "$payload" > /dev/null
        # Reset Xray stats counters
        /usr/local/bin/xray api statsquery --server=127.0.0.1:10085 --reset 2>/dev/null || true
        echo "[traffic] Reported: $payload"
    fi
}

watchdog() {
    if ! systemctl is-active --quiet xray; then
        echo "[watchdog] Xray is down — restarting"
        report_traffic
        systemctl restart xray
        sleep 2
        echo "[watchdog] Xray restarted"
    fi
}

echo "[agent] Starting VLESS agent for server ${SERVER_ID}"
FIRST_RUN=true

while true; do
    response=$(api_post "/heartbeat/${SERVER_ID}" "{}")
    sync_required=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sync_required', False))" 2>/dev/null)

    if [[ "$sync_required" == "True" || "$FIRST_RUN" == "true" ]]; then
        sync_users
        FIRST_RUN=false
    fi

    watchdog
    report_traffic
    sleep "$CYCLE_SECONDS"
done
AGENT_EOF

chmod +x /usr/local/bin/vless-agent.sh
sed -i "s|REPLACE_WITH_SERVER_UUID|${SERVER_ID}|g"   /usr/local/bin/vless-agent.sh
sed -i "s|REPLACE_WITH_AGENT_SECRET|${AGENT_SECRET}|g" /usr/local/bin/vless-agent.sh
sed -i "s|REPLACE_WITH_API_BASE|${API_BASE}|g"        /usr/local/bin/vless-agent.sh

cat > /etc/systemd/system/vless-agent.service << EOF
[Unit]
Description=VLESS VPN Agent
After=network.target xray.service

[Service]
Type=simple
ExecStart=/usr/local/bin/vless-agent.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vless-agent > /dev/null 2>&1
systemctl restart vless-agent
sleep 2
AGENT_STATUS=$(systemctl is-active vless-agent)
echo -e "${GREEN}      Agent: $AGENT_STATUS${NC}"

# ── Summary ──────────────────────────────────────
echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  SETUP COMPLETE${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
echo -e "  Server ID      : ${GREEN}$SERVER_ID${NC}"
echo -e "  API Base       : ${GREEN}$API_BASE${NC}"
echo -e "  Xray           : ${GREEN}$XRAY_STATUS${NC}"
echo -e "  Agent          : ${GREEN}$AGENT_STATUS${NC}"
echo -e "  Protocol       : ${GREEN}VLESS + Reality${NC}"
echo -e "  SNI Target     : ${GREEN}${REALITY_SNI}${NC}"
echo -e "  Reality PubKey : ${GREEN}${REALITY_PUBLIC}${NC}"
echo -e "  Short ID       : ${GREEN}${REALITY_SHORT_ID}${NC}"
echo ""
echo -e "  ${YELLOW}IMPORTANT: Save the Reality Public Key and Short ID${NC}"
echo -e "  ${YELLOW}You need them for the subscription config${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    journalctl -u vless-agent -f    # Agent logs"
echo -e "    journalctl -u xray -f           # Xray logs"
echo -e "    systemctl status vless-agent"
echo ""
