#!/bin/bash
# ================================================
#  Hysteria2 Server Setup
#  Run once on a fresh Ubuntu 22.04 server
#  Usage: bash hysteria2-setup.sh <API_BASE> <SERVER_ID> <AGENT_SECRET>
# ================================================
set -e

API_BASE="${1:-REPLACE_WITH_API_BASE}"
SERVER_ID="${2:-REPLACE_WITH_SERVER_UUID}"
AGENT_SECRET="${3:-REPLACE_WITH_AGENT_SECRET}"
HY2_PORT=443

echo "======================================"
echo " Hysteria2 Server Setup"
echo "======================================"

# ── 1. System tuning ──────────────────────────────
echo "[1/7] Tuning kernel..."
cat >> /etc/sysctl.conf << 'EOF'
# Hysteria2 / QUIC tuning
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.udp_mem = 8388608 12582912 16777216
EOF
sysctl -p

# Disable ECN (helps with some ISPs in China)
sysctl -w net.ipv4.tcp_ecn=0

# ── 2. Install Hysteria2 ──────────────────────────
echo "[2/7] Installing Hysteria2..."
curl -fsSL https://get.hy2.sh/ | bash
systemctl enable hysteria-server

# ── 3. TLS certificate (self-signed) ─────────────
echo "[3/7] Generating self-signed TLS cert..."
mkdir -p /etc/hysteria
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
    -keyout /etc/hysteria/server.key \
    -out /etc/hysteria/server.crt \
    -days 3650 -nodes \
    -subj "/CN=bing.com"
chmod 600 /etc/hysteria/server.key

# ── 4. Write initial empty config ─────────────────
echo "[4/7] Writing initial config..."
cat > /etc/hysteria/config.yaml << EOF
listen: ":${HY2_PORT}"
tls:
  cert: /etc/hysteria/server.crt
  key: /etc/hysteria/server.key
auth:
  type: userpass
  userpass: {}
masquerade:
  type: proxy
  proxy:
    url: https://bing.com
    rewriteHost: true
trafficStats:
  listen: 127.0.0.1:9999
EOF

# ── 5. Install python3-yaml for agent ─────────────
echo "[5/7] Installing dependencies..."
apt-get install -y python3-yaml curl openssl nftables
systemctl enable nftables

# ── 6. Install agent ──────────────────────────────
echo "[6/7] Installing Hysteria2 agent..."
cat > /usr/local/bin/hysteria2-agent.sh << AGENT
$(sed "s|REPLACE_WITH_API_BASE|${API_BASE}|g; s|REPLACE_WITH_SERVER_UUID|${SERVER_ID}|g; s|REPLACE_WITH_AGENT_SECRET|${AGENT_SECRET}|g" \
  /tmp/hysteria2-agent.sh 2>/dev/null || \
  curl -sfk "${API_BASE%/api/agent}/hysteria2-agent.sh" 2>/dev/null || echo "# Download agent manually")
AGENT
chmod +x /usr/local/bin/hysteria2-agent.sh

# ── 7. Systemd service for agent ──────────────────
echo "[7/7] Creating agent systemd service..."
cat > /etc/systemd/system/hysteria2-agent.service << EOF
[Unit]
Description=Hysteria2 VPN Agent
After=network.target hysteria-server.service
Requires=hysteria-server.service

[Service]
ExecStart=/usr/local/bin/hysteria2-agent.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable hysteria2-agent
systemctl start hysteria2-agent

# ── Firewall: open UDP 443 ─────────────────────────
ufw allow 443/udp 2>/dev/null || iptables -I INPUT -p udp --dport 443 -j ACCEPT

echo ""
echo "======================================"
echo " Setup complete!"
echo " Hysteria2 listening on UDP :${HY2_PORT}"
echo " Agent reporting to: ${API_BASE}"
echo " Server ID: ${SERVER_ID}"
echo ""
echo " Check status:"
echo "   systemctl status hysteria-server"
echo "   systemctl status hysteria2-agent"
echo "   journalctl -fu hysteria2-agent"
echo "======================================"
