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
        'mtu': 1400
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

dl = read_chain('VPN_IN',  'dpt')
ul = read_chain('VPN_OUT', 'spt')

entries = []
for port, uid in port_map.items():
    d = dl.get(port, 0)
    u = ul.get(port, 0)
    if d > 0 or u > 0:
        entries.append({
            'user_server_id': uid,
            'upload_bytes': u,
            'download_bytes': d,
            'interval_sec': $CYCLE_SECONDS
        })
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
