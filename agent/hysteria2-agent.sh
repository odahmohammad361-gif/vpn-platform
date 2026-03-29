#!/bin/bash
# ================================================
#  Hysteria2 Agent — runs on each Hysteria2 VPN server
#  Syncs users, reports traffic via nftables
#  Same API as shadowsocks agent — backend unchanged
# ================================================

API_BASE="REPLACE_WITH_API_BASE"
SERVER_ID="REPLACE_WITH_SERVER_UUID"
AGENT_SECRET="REPLACE_WITH_AGENT_SECRET"
HY2_CONFIG="/etc/hysteria/config.yaml"
HY2_BIN="/usr/local/bin/hysteria"
USER_MAP="/tmp/hysteria_user_map.json"   # username -> user_server_id
CYCLE_SECONDS=30
HY2_PORT=443   # single UDP port for all users

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

# ── nftables accounting per user (by mark) ────────
# Each user gets a unique fwmark = index in user list
setup_accounting() {
    nft flush table inet hy2_acct 2>/dev/null || true
    nft add table inet hy2_acct 2>/dev/null || true
    nft add chain inet hy2_acct input  '{ type filter hook input priority 0; }' 2>/dev/null || true
    nft add chain inet hy2_acct output '{ type filter hook output priority 0; }' 2>/dev/null || true
    echo "[acct] nftables accounting ready"
}

report_traffic() {
    [[ ! -f "$USER_MAP" ]] && return
    local user_map
    user_map=$(cat "$USER_MAP")
    [[ "$user_map" == "{}" || -z "$user_map" ]] && return

    # Read traffic from hysteria2 stats API (runs on 127.0.0.1:9999 by default)
    local stats
    stats=$(curl -sf http://127.0.0.1:9999/traffic 2>/dev/null) || return

    local payload
    payload=$(python3 - << PYEOF
import json, sys

user_map = json.loads('''$user_map''')
stats_raw = '''$stats'''

try:
    stats = json.loads(stats_raw)
except:
    stats = {}

entries = []
# stats format: {"username": {"tx": bytes, "rx": bytes}, ...}
for username, uid in user_map.items():
    user_stats = stats.get(username, {})
    tx = user_stats.get('tx', 0)  # upload (server→client)
    rx = user_stats.get('rx', 0)  # download (client→server)
    if tx > 0 or rx > 0:
        entries.append({
            'user_server_id': uid,
            'upload_bytes': rx,
            'download_bytes': tx,
            'interval_sec': $CYCLE_SECONDS
        })

print(json.dumps(entries))
PYEOF
)

    if [[ -n "$payload" && "$payload" != "[]" ]]; then
        api_post "/traffic/${SERVER_ID}" "$payload" > /dev/null
        # Reset hysteria2 traffic counters
        curl -sf -X POST http://127.0.0.1:9999/traffic/reset > /dev/null 2>&1 || true
        echo "[traffic] Reported: $payload"
    fi
}

# ── Sync users — write hysteria2 config ───────────
sync_users() {
    local config
    config=$(api_get "/config/${SERVER_ID}") || { echo "[sync] Failed to fetch config"; return 1; }

    # Write hysteria2 YAML config
    python3 - << PYEOF
import sys, json, yaml, os

entries = json.loads('''$config''')

# Build user list for hysteria2
users = []
user_map = {}
for e in entries:
    # Use user_server_id as username (unique per user per server)
    uname = str(e['user_server_id'])
    users.append({'username': uname, 'password': e['password']})
    user_map[uname] = uname  # user_server_id -> user_server_id

hy2_config = {
    'listen': ':$HY2_PORT',
    'tls': {
        'cert': '/etc/hysteria/server.crt',
        'key':  '/etc/hysteria/server.key',
    },
    'auth': {
        'type': 'userpass',
        'userpass': {u['username']: u['password'] for u in users}
    },
    'masquerade': {
        'type': 'proxy',
        'proxy': {
            'url': 'https://bing.com',
            'rewriteHost': True
        }
    },
    'bandwidth': {
        'up':   '1 gbps',
        'down': '1 gbps',
    },
    'trafficStats': {
        'listen': '127.0.0.1:9999'
    },
    'quic': {
        'initStreamReceiveWindow':     26843545,
        'maxStreamReceiveWindow':      26843545,
        'initConnReceiveWindow':       67108864,
        'maxConnReceiveWindow':        67108864,
        'maxIdleTimeout':              '60s',
        'keepAlivePeriod':             '10s',
        'disablePathMTUDiscovery':     False,
    }
}

with open('$HY2_CONFIG', 'w') as f:
    yaml.dump(hy2_config, f, default_flow_style=False)

# Save user_server_id map for traffic reporting
with open('$USER_MAP', 'w') as f:
    json.dump(user_map, f)

print(f"[sync] Config written with {len(users)} user(s)")
PYEOF

    # Restart hysteria2
    systemctl restart hysteria-server
    sleep 1
    echo "[sync] Sync complete"

    api_post "/sync-ack/${SERVER_ID}" "{}"
}

# ── Watchdog ──────────────────────────────────────
watchdog() {
    if ! systemctl is-active --quiet hysteria-server; then
        echo "[watchdog] Hysteria2 is down — restarting"
        report_traffic
        systemctl restart hysteria-server
        sleep 2
        echo "[watchdog] Hysteria2 restarted"
    fi
}

# ── Main loop ─────────────────────────────────────
echo "[agent] Starting Hysteria2 agent for server ${SERVER_ID}"
setup_accounting
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
