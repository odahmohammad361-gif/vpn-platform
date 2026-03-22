#!/bin/bash
# ================================================
#  One-liner installer for VPN agent
#  Run on each new Contabo Ubuntu VPN server
#  Usage: sudo bash agent-install.sh <SERVER_ID> <AGENT_SECRET> <API_BASE>
# ================================================

SERVER_ID="$1"
AGENT_SECRET="$2"
API_BASE="${3:-https://YOUR_ADMIN_DOMAIN}"

if [[ -z "$SERVER_ID" || -z "$AGENT_SECRET" ]]; then
    echo "Usage: sudo bash agent-install.sh <SERVER_ID> <AGENT_SECRET> [API_BASE]"
    exit 1
fi

echo "[install] Installing VPN agent..."

# Install dependencies
apt-get install -y -qq netcat-openbsd openssl curl python3 jq

# Copy agent script
cp vpn-agent.sh /usr/local/bin/vpn-agent.sh
chmod +x /usr/local/bin/vpn-agent.sh

# Inject config
sed -i "s|REPLACE_WITH_SERVER_UUID|${SERVER_ID}|g" /usr/local/bin/vpn-agent.sh
sed -i "s|REPLACE_WITH_AGENT_SECRET|${AGENT_SECRET}|g" /usr/local/bin/vpn-agent.sh
sed -i "s|REPLACE_WITH_API_BASE|${API_BASE}|g" /usr/local/bin/vpn-agent.sh

# Create systemd service
cat > /etc/systemd/system/vpn-agent.service << EOF
[Unit]
Description=VPN Agent
After=network.target shadowsocks.service

[Service]
Type=simple
ExecStart=/usr/local/bin/vpn-agent.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Update shadowsocks to use manager socket
sed -i 's|ExecStart=.*|ExecStart=/usr/local/bin/ssserver -c /etc/shadowsocks/config.json --manager-address /var/run/shadowsocks-manager.sock|' \
    /etc/systemd/system/shadowsocks.service

systemctl daemon-reload
systemctl enable vpn-agent
systemctl restart shadowsocks
systemctl start vpn-agent

echo "[install] Done. Agent is running."
echo "[install] Check status: systemctl status vpn-agent"
