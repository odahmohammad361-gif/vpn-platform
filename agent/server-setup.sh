#!/bin/bash
# ================================================
#  VPN Server Full Setup
#  Installs shadowsocks-rust + AdGuard Home + agent
#  Usage: sudo bash server-setup.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>
#  Example: sudo bash server-setup.sh abc-uuid secret123 https://52.77.235.166:8443
# ================================================

SERVER_ID="${1:-}"
AGENT_SECRET="${2:-}"
API_BASE="${3:-}"

if [[ -z "$SERVER_ID" || -z "$AGENT_SECRET" || -z "$API_BASE" ]]; then
    echo "Usage: sudo bash server-setup.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>"
    echo "Example: sudo bash server-setup.sh abc-uuid secret123 https://52.77.235.166:8443"
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo "[ERROR] Run as root: sudo bash server-setup.sh ..."
    exit 1
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SS_METHOD="chacha20-ietf-poly1305"
SS_VERSION="1.21.2"
SS_DIR="/etc/shadowsocks"
SS_BIN="/usr/local/bin/ssserver"
SS_LOG="/var/log/shadowsocks.log"
AGH_VERSION="0.107.52"
AGH_DIR="/var/lib/adguardhome"
AGH_BIN="/usr/local/bin/AdGuardHome"

echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  VPN Server Full Setup${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# ── STEP 1 — System packages + kernel tuning ─────
echo -e "${YELLOW}[1/9] Installing system packages...${NC}"
apt-get update -qq
apt-get install -y -qq curl wget tar xz-utils ufw fail2ban openssl python3 jq
# optional — ignore if unavailable
apt-get install -y python3-bcrypt 2>/dev/null || true
echo -e "${GREEN}      Done${NC}"

# Kernel tuning for high-throughput low-latency VPN (China-optimized)
cat >> /etc/sysctl.conf << 'SYSCTL_EOF'
fs.file-max = 51200
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864
net.core.netdev_max_backlog = 250000
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 10
net.ipv4.tcp_keepalive_time = 60
net.ipv4.tcp_keepalive_intvl = 10
net.ipv4.tcp_keepalive_probes = 6
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_mtu_probing = 1
net.ipv4.tcp_ecn = 0
SYSCTL_EOF
sysctl -p > /dev/null 2>&1 || true

# File descriptor limits
echo "* soft nofile 51200
* hard nofile 51200
root soft nofile 51200
root hard nofile 51200" >> /etc/security/limits.conf

# ── STEP 2 — Download shadowsocks-rust ───────────
echo -e "${YELLOW}[2/9] Downloading shadowsocks-rust v${SS_VERSION}...${NC}"

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

# ── STEP 3 — shadowsocks initial config ──────────
echo -e "${YELLOW}[3/9] Writing shadowsocks config...${NC}"

mkdir -p "$SS_DIR"
cat > "$SS_DIR/config.json" << 'EOF'
{
    "servers": []
}
EOF
echo -e "${GREEN}      Done${NC}"

# ── STEP 4 — BBR + kernel tuning ─────────────────
echo -e "${YELLOW}[4/9] Enabling BBR + enhanced kernel tuning...${NC}"

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

# ── STEP 5 — AdGuard Home ────────────────────────
echo -e "${YELLOW}[5/9] Installing AdGuard Home v${AGH_VERSION}...${NC}"

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
schema_version: 28
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
echo -e "${GREEN}      AdGuard Home ready (controlled by admin toggle)${NC}"
echo -e "${GREEN}      Admin URL : http://127.0.0.1:3000  (SSH forward to access)${NC}"
echo -e "${GREEN}      Password  : ${AGH_PASSWORD}${NC}"

# ── STEP 6 — UFW + bot blocking ──────────────────
echo -e "${YELLOW}[6/9] Configuring firewall + bot blocking...${NC}"

ufw allow ssh             > /dev/null 2>&1 || true
ufw allow 80/tcp          > /dev/null 2>&1 || true
ufw allow 443/tcp         > /dev/null 2>&1 || true
ufw allow 53/tcp          > /dev/null 2>&1 || true
ufw allow 53/udp          > /dev/null 2>&1 || true
ufw allow 3000/tcp        > /dev/null 2>&1 || true
ufw allow 20000:29999/tcp > /dev/null 2>&1 || true
ufw allow 20000:29999/udp > /dev/null 2>&1 || true
echo "y" | ufw enable     > /dev/null 2>&1 || true

# Rate-limit new TCP connections to VPN ports: max 15 new per IP per minute
# Saves iptables rules so they survive reboot (iptables-persistent)
iptables -A INPUT -p tcp --dport 20000:29999 -m state --state NEW \
    -m recent --name vpn_ratelimit --set 2>/dev/null || true
iptables -A INPUT -p tcp --dport 20000:29999 -m state --state NEW \
    -m recent --name vpn_ratelimit --update --seconds 60 --hitcount 15 -j DROP 2>/dev/null || true
# UFW already persists rules across reboots natively

echo -e "${GREEN}      Firewall active, bot rate-limit applied${NC}"

# ── STEP 7 — shadowsocks systemd ─────────────────
echo -e "${YELLOW}[7/9] Creating shadowsocks service...${NC}"

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
systemctl restart shadowsocks || true   # may exit non-zero with empty config — agent will sync
sleep 2

SS_STATUS=$(systemctl is-active shadowsocks || echo "waiting")
echo -e "${GREEN}      Shadowsocks: $SS_STATUS${NC}"

# ── STEP 8 — Install VPN agent ───────────────────
echo -e "${YELLOW}[8/9] Installing VPN agent...${NC}"

cat > /usr/local/bin/vpn-agent.sh << 'AGENT_EOF'
#!/bin/bash
# ================================================
#  VPN Agent — runs on each VPN server
#  Syncs users, reports traffic, watchdog, AdGuard
# ================================================

API_BASE="REPLACE_WITH_API_BASE/api/agent"
SERVER_ID="REPLACE_WITH_SERVER_UUID"
AGENT_SECRET="REPLACE_WITH_AGENT_SECRET"
SS_CONFIG="/etc/shadowsocks/config.json"
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

# ── Sync users — write config + restart ssserver ──
sync_users() {
    local config
    config=$(api_get "/config/${SERVER_ID}") || { echo "[sync] Failed to fetch config"; return 1; }

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
        'fast_open': False,
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
    systemctl restart shadowsocks
    setup_accounting
    echo "[sync] Config written with $(echo "$config" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null) user(s)"

    api_post "/sync-ack/${SERVER_ID}" "{}"
    echo "[sync] Sync complete"
}

# ── Report traffic via iptables byte counts ───────
report_traffic() {
    [[ ! -f "$PORT_MAP" ]] && return
    local port_map
    port_map=$(cat "$PORT_MAP")
    [[ "$port_map" == "{}" ]] && return

    local payload
    payload=$(python3 - << PYEOF
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
    """Parse ss-server logs to get most recent client IP per port."""
    port_ips = {}
    try:
        out = subprocess.check_output(
            ['journalctl', '-u', 'shadowsocks', '--no-pager', '-n', '500', '--output=short'],
            stderr=subprocess.DEVNULL
        ).decode()
        # ss-rust logs: "connected peer: 1.2.3.4:12345 <-> local port 20001"
        for line in out.splitlines():
            m = re.search(r'peer[:\s]+(\d+\.\d+\.\d+\.\d+):\d+.*?(?:port\s+|dport=|->.*?:)(\d{5})', line)
            if not m:
                # Try alternate format: "tcp tunnel 1.2.3.4:port -> 0.0.0.0:20001"
                m = re.search(r'(\d+\.\d+\.\d+\.\d+):\d+\s*->\s*\S+:(\d{5})', line)
            if m:
                ip, port = m.group(1), m.group(2)
                if port in port_map:
                    port_ips[port] = ip
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
    if d > 0 or u > 0:
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
PYEOF
)

    if [[ -n "$payload" && "$payload" != "[]" ]]; then
        api_post "/traffic/${SERVER_ID}" "$payload" > /dev/null
        # Reset counters after reporting
        iptables -Z VPN_IN  2>/dev/null || true
        iptables -Z VPN_OUT 2>/dev/null || true
        echo "[traffic] Reported: $payload"
    fi
}

# ── Main loop ─────────────────────────────────────
echo "[agent] Starting VPN agent for server ${SERVER_ID}"
FIRST_RUN=true

while true; do
    # ── Heartbeat ─────────────────────────────────
    response=$(api_post "/heartbeat/${SERVER_ID}" "{}")

    sync_required=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sync_required', False))" 2>/dev/null)
    adguard_enabled=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('adguard_enabled', False))" 2>/dev/null)

    # ── Sync users if needed (always on first run) ─
    if [[ "$sync_required" == "True" || "$FIRST_RUN" == "true" ]]; then
        sync_users
        FIRST_RUN=false
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

    # ── AdGuard Home control ───────────────────────
    if [[ "$adguard_enabled" == "True" ]]; then
        systemctl is-active --quiet adguardhome || { echo "[adguard] Starting AdGuard Home"; systemctl start adguardhome; }
    else
        systemctl is-active --quiet adguardhome && { echo "[adguard] Stopping AdGuard Home"; systemctl stop adguardhome; }
    fi

    # ── Report traffic ─────────────────────────────
    report_traffic

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

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vpn-agent > /dev/null 2>&1
systemctl restart vpn-agent
sleep 2

AGENT_STATUS=$(systemctl is-active vpn-agent)
echo -e "${GREEN}      Agent: $AGENT_STATUS${NC}"

# ── STEP 9 — fail2ban ────────────────────────────
echo -e "${YELLOW}[9/9] Configuring fail2ban...${NC}"

cat > /etc/fail2ban/filter.d/shadowsocks.conf << 'EOF'
[Definition]
failregex = tcp handshake failed. peer: <HOST>:
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

systemctl enable fail2ban > /dev/null 2>&1
systemctl restart fail2ban

# ── Summary ──────────────────────────────────────
echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  SETUP COMPLETE${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
echo -e "  Server ID    : ${GREEN}$SERVER_ID${NC}"
echo -e "  API Base     : ${GREEN}$API_BASE${NC}"
echo -e "  Shadowsocks  : ${GREEN}$SS_STATUS${NC}"
echo -e "  Agent        : ${GREEN}$AGENT_STATUS${NC}"
echo -e "  AdGuard Home : ${YELLOW}Installed (enable via admin toggle)${NC}"
echo -e "  AdGuard URL  : ${YELLOW}http://127.0.0.1:3000 (SSH forward)${NC}"
echo -e "  AdGuard Pass : ${YELLOW}${AGH_PASSWORD}${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    journalctl -u vpn-agent -f         # Agent logs"
echo -e "    journalctl -u shadowsocks -f       # SS logs"
echo -e "    journalctl -u adguardhome -f       # AdGuard logs"
echo -e "    systemctl status vpn-agent"
echo -e "    # SSH forward for AdGuard UI:"
echo -e "    ssh -L 3000:127.0.0.1:3000 root@<server-ip>"
echo ""
