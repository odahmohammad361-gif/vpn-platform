#!/bin/bash
# ================================================
#  VPN Server Full Setup
#  Installs shadowsocks-rust + agent in one shot
#  Usage: sudo bash server-setup.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>
#  Example: sudo bash server-setup.sh abc-uuid secret123 https://52.77.235.166:8443
# ================================================

set -e

SERVER_ID="$1"
AGENT_SECRET="$2"
API_BASE="$3"

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

SS_PORT=443
SS_METHOD="chacha20-ietf-poly1305"
SS_VERSION="1.21.2"
SS_DIR="/etc/shadowsocks"
SS_BIN="/usr/local/bin/ssserver"
SS_LOG="/var/log/shadowsocks.log"
MANAGER_SOCK="/var/run/shadowsocks-manager.sock"

echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  VPN Server Full Setup${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# ── STEP 1 — System packages ─────────────────────
echo -e "${YELLOW}[1/7] Installing system packages...${NC}"
apt-get update -qq
apt-get install -y -qq curl wget tar xz-utils ufw fail2ban netcat-openbsd openssl python3 jq
echo -e "${GREEN}      Done${NC}"

# ── STEP 2 — Download shadowsocks-rust ───────────
echo -e "${YELLOW}[2/7] Downloading shadowsocks-rust v${SS_VERSION}...${NC}"

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

# ── STEP 3 — shadowsocks config (manager mode) ───
echo -e "${YELLOW}[3/7] Writing shadowsocks config...${NC}"

mkdir -p "$SS_DIR"
cat > "$SS_DIR/config.json" << EOF
{
    "server": "0.0.0.0",
    "server_port": $SS_PORT,
    "password": "placeholder",
    "method": "$SS_METHOD",
    "timeout": 300,
    "mode": "tcp_only",
    "fast_open": true,
    "ipv6_first": false,
    "dns": "8.8.8.8"
}
EOF
echo -e "${GREEN}      Done${NC}"

# ── STEP 4 — BBR + kernel tuning ─────────────────
echo -e "${YELLOW}[4/7] Enabling BBR + kernel tuning...${NC}"

sed -i '/net.core.default_qdisc/d;/net.ipv4.tcp_congestion_control/d;/net.core.rmem_max/d;/net.core.wmem_max/d;/net.ipv4.tcp_rmem/d;/net.ipv4.tcp_wmem/d;/net.ipv4.tcp_mtu_probing/d;/net.ipv4.tcp_fastopen/d' /etc/sysctl.conf

cat >> /etc/sysctl.conf << EOF
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.core.rmem_max=134217728
net.core.wmem_max=134217728
net.ipv4.tcp_rmem=4096 87380 67108864
net.ipv4.tcp_wmem=4096 65536 67108864
net.ipv4.tcp_mtu_probing=1
net.ipv4.tcp_fastopen=3
EOF

sysctl -p > /dev/null 2>&1
echo -e "${GREEN}      BBR: $(sysctl -n net.ipv4.tcp_congestion_control)${NC}"

# ── STEP 5 — UFW firewall ─────────────────────────
echo -e "${YELLOW}[5/7] Configuring firewall...${NC}"
ufw allow ssh    > /dev/null 2>&1
ufw allow 80/tcp > /dev/null 2>&1
ufw allow "$SS_PORT"/tcp > /dev/null 2>&1
echo "y" | ufw enable > /dev/null 2>&1
echo -e "${GREEN}      Port $SS_PORT/TCP open${NC}"

# ── STEP 6 — shadowsocks systemd (manager socket) ─
echo -e "${YELLOW}[6/7] Creating shadowsocks service (manager mode)...${NC}"

touch "$SS_LOG"

cat > /etc/systemd/system/shadowsocks.service << EOF
[Unit]
Description=Shadowsocks-Rust Server
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=$SS_BIN -c $SS_DIR/config.json --manager-address $MANAGER_SOCK
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
systemctl restart shadowsocks
sleep 2

SS_STATUS=$(systemctl is-active shadowsocks)
echo -e "${GREEN}      Shadowsocks: $SS_STATUS${NC}"

# ── STEP 7 — Install VPN agent ────────────────────
echo -e "${YELLOW}[7/7] Installing VPN agent...${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/vpn-agent.sh" /usr/local/bin/vpn-agent.sh
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
systemctl start vpn-agent
sleep 2

AGENT_STATUS=$(systemctl is-active vpn-agent)
echo -e "${GREEN}      Agent: $AGENT_STATUS${NC}"

# ── fail2ban ──────────────────────────────────────
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

# ── Summary ───────────────────────────────────────
echo ""
echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}  SETUP COMPLETE${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""
echo -e "  Server ID  : ${GREEN}$SERVER_ID${NC}"
echo -e "  API Base   : ${GREEN}$API_BASE${NC}"
echo -e "  Shadowsocks: ${GREEN}$SS_STATUS${NC}"
echo -e "  Agent      : ${GREEN}$AGENT_STATUS${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    journalctl -u vpn-agent -f       # Agent logs"
echo -e "    journalctl -u shadowsocks -f     # SS logs"
echo -e "    systemctl status vpn-agent"
echo ""
