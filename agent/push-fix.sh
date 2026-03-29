#!/bin/bash
# Push MTU + fast_open fix to all VPN servers
# Usage: bash push-fix.sh

SERVERS=(
    "root@52.77.235.166"   # server 1 (already done — skip or re-run, safe)
    # "root@YOUR_SERVER_2_IP"
    # "root@YOUR_SERVER_3_IP"
)

FIX='
set -e
AGENT=/usr/local/bin/vpn-agent.sh

echo "[*] Patching $AGENT ..."
sed -i "s/'\''fast_open'\'': True/'\''fast_open'\'': False/" "$AGENT"
grep -q "'\''mtu'\'': 1400" "$AGENT" || \
    sed -i "s/'\''no_delay'\'': True$/'\''no_delay'\'': True,\n        '\''mtu'\'': 1400/" "$AGENT"

echo "[*] Verifying ..."
grep -E "fast_open|mtu" "$AGENT"

echo "[*] Restarting shadowsocks ..."
systemctl restart shadowsocks

echo "[*] Restarting vpn-agent ..."
systemctl restart vpn-agent

echo "[OK] Done on $(hostname)"
'

for SERVER in "${SERVERS[@]}"; do
    echo ""
    echo "=========================================="
    echo "  Applying fix to $SERVER"
    echo "=========================================="
    ssh -o StrictHostKeyChecking=no "$SERVER" "$FIX"
done

echo ""
echo "All servers updated."
