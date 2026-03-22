#!/bin/bash
# ================================================
#  VPN Agent — runs on each Contabo Ubuntu server
#  Syncs users with admin API + reports traffic
# ================================================

API_BASE="https://YOUR_ADMIN_DOMAIN/agent"
SERVER_ID="REPLACE_WITH_SERVER_UUID"
AGENT_SECRET="REPLACE_WITH_AGENT_SECRET"
MANAGER_SOCK="/var/run/shadowsocks-manager.sock"
SS_CONFIG="/etc/shadowsocks/config.json"
CYCLE_SECONDS=30
STATE_FILE="/tmp/ss_traffic_state.json"

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
    curl -sf "${API_BASE}${path}" \
        -H "X-Agent-ID: ${SERVER_ID}" \
        -H "X-Agent-Timestamp: ${ts}" \
        -H "X-Agent-Signature: ${sig}"
}

api_post() {
    local path="$1"
    local body="${2:-{}}"
    read -r ts sig <<< "$(sign_request "$body")"
    curl -sf -X POST "${API_BASE}${path}" \
        -H "Content-Type: application/json" \
        -H "X-Agent-ID: ${SERVER_ID}" \
        -H "X-Agent-Timestamp: ${ts}" \
        -H "X-Agent-Signature: ${sig}" \
        -d "$body"
}

# ── Manager socket helpers ────────────────────────
manager_cmd() {
    echo -n "$1" | nc -u -w1 -U "$MANAGER_SOCK" 2>/dev/null || true
}

get_stats() {
    manager_cmd "stat:" | grep -oP '\{.*\}' || echo "{}"
}

add_port() {
    local port="$1" pass="$2" method="$3"
    manager_cmd "add:{\"server_port\":${port},\"password\":\"${pass}\",\"method\":\"${method}\"}"
}

remove_port() {
    local port="$1"
    manager_cmd "remove:{\"server_port\":${port}}"
}

# ── Sync users from API ───────────────────────────
sync_users() {
    local config
    config=$(api_get "/config/${SERVER_ID}") || return 1

    # Get current active ports from manager
    local current_stats
    current_stats=$(get_stats)
    local current_ports
    current_ports=$(echo "$current_stats" | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(str(k) for k in d.keys()))" 2>/dev/null || echo "")

    # Parse desired config
    local desired_ports
    desired_ports=$(echo "$config" | python3 -c "
import sys, json
entries = json.load(sys.stdin)
for e in entries:
    print(e['port'], e['password'], e['method'])
" 2>/dev/null)

    local new_ports=""
    while IFS=' ' read -r port pass method; do
        [[ -z "$port" ]] && continue
        new_ports="$new_ports $port"
        if ! echo "$current_ports" | grep -qw "$port"; then
            add_port "$port" "$pass" "$method"
            echo "[sync] Added port $port"
        fi
    done <<< "$desired_ports"

    # Remove ports no longer in config
    for port in $current_ports; do
        if ! echo "$new_ports" | grep -qw "$port"; then
            remove_port "$port"
            echo "[sync] Removed port $port"
        fi
    done

    # Rewrite config file for persistence across restarts
    echo "$config" | python3 -c "
import sys, json
entries = json.load(sys.stdin)
cfg = {
    'server': '0.0.0.0',
    'server_port': entries[0]['port'] if entries else 443,
    'password': entries[0]['password'] if entries else '',
    'method': entries[0]['method'] if entries else 'chacha20-ietf-poly1305',
    'timeout': 300,
    'mode': 'tcp_and_udp',
    'fast_open': True,
    'ipv6_first': False
}
print(json.dumps(cfg, indent=4))
" > "$SS_CONFIG" 2>/dev/null

    api_post "/sync-ack/${SERVER_ID}" "{}"
    echo "[sync] Sync complete"
}

# ── Report traffic ────────────────────────────────
report_traffic() {
    local stats
    stats=$(get_stats)
    [[ "$stats" == "{}" ]] && return

    # Load previous state
    local prev="{}"
    [[ -f "$STATE_FILE" ]] && prev=$(cat "$STATE_FILE")

    # Calculate deltas and build payload
    local payload
    payload=$(python3 -c "
import sys, json
stats = json.loads('''$stats''')
prev = json.loads('''$prev''')
entries = []
for port, val in stats.items():
    prev_val = prev.get(port, 0)
    delta = max(0, val - prev_val)
    if delta > 0:
        entries.append({
            'user_server_id': port,  # placeholder; real mapping done server-side
            'upload_bytes': delta // 2,
            'download_bytes': delta // 2,
            'interval_sec': $CYCLE_SECONDS
        })
print(json.dumps(entries))
" 2>/dev/null)

    if [[ -n "$payload" && "$payload" != "[]" ]]; then
        api_post "/traffic/${SERVER_ID}" "$payload" > /dev/null
    fi

    # Save current state
    echo "$stats" > "$STATE_FILE"
}

# ── Main loop ─────────────────────────────────────
echo "[agent] Starting VPN agent for server ${SERVER_ID}"

while true; do
    # Heartbeat
    response=$(api_post "/heartbeat/${SERVER_ID}" "{}")
    sync_required=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sync_required', False))" 2>/dev/null)

    if [[ "$sync_required" == "True" ]]; then
        sync_users
    fi

    # Report traffic
    report_traffic

    sleep "$CYCLE_SECONDS"
done
