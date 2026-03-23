import yaml
from app.utils.base64_utils import build_ss_uri, encode_subscription


def build_shadowrocket(slots: list[dict]) -> str:
    """Base64-encoded ss:// URI list for Shadowrocket."""
    uris = [
        build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"])
        for s in slots
    ]
    return encode_subscription(uris)


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
