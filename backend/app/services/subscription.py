import yaml
from app.utils.base64_utils import build_ss_uri, encode_subscription


def build_shadowrocket(slots: list[dict]) -> str:
    """Surge-compatible config for Shadowrocket — includes DNS so users don't need manual setup."""
    dns_servers = ", ".join(dict.fromkeys(s["host"] for s in slots))

    proxy_lines = []
    proxy_names = []
    for s in slots:
        name = s["name"]
        proxy_lines.append(
            f"{name} = ss, {s['host']}, {s['port']}, "
            f"encrypt-method={s['method']}, password={s['password']}, udp-relay=true"
        )
        proxy_names.append(name)

    group_members = ", ".join(proxy_names)

    config = f"""[General]
dns-server = {dns_servers}, 8.8.8.8, 1.1.1.1
bypass-system = true
skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local

[Proxy]
{chr(10).join(proxy_lines)}

[Proxy Group]
VPN = select, {group_members}

[Rule]
FINAL, VPN
"""
    return config


def build_clash(slots: list[dict]) -> str:
    """Clash Meta YAML subscription."""
    proxies = [
        {
            "name": s["name"],
            "type": "ss",
            "server": s["host"],
            "port": s["port"],
            "cipher": s["method"],
            "password": s["password"],
            "udp": True,
        }
        for s in slots
    ]
    proxy_names = [s["name"] for s in slots]
    # Use VPN server IPs as DNS — routes through AdGuard Home when enabled
    dns_servers = list(dict.fromkeys(s["host"] for s in slots))
    config = {
        "dns": {
            "enable": True,
            "ipv6": False,
            "nameserver": dns_servers,
            "fallback": ["8.8.8.8", "1.1.1.1"],
            "fallback-filter": {"geoip": True, "geoip-code": "CN"},
        },
        "proxies": proxies,
        "proxy-groups": [
            {"name": "VPN", "type": "select", "proxies": proxy_names}
        ],
        "rules": ["MATCH,VPN"],
    }
    return yaml.dump(config, allow_unicode=True, sort_keys=False)


def build_v2rayng(slots: list[dict]) -> str:
    """Base64-encoded ss:// URI list for v2rayNG."""
    uris = [
        build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"])
        for s in slots
    ]
    return encode_subscription(uris)
