import base64
import json
import yaml
from app.utils.base64_utils import build_ss_uri, encode_subscription


# China domains/IPs that should go DIRECT (not through VPN)
_CLASH_RULES = [
    "IP-CIDR,127.0.0.0/8,DIRECT",
    "IP-CIDR,192.168.0.0/16,DIRECT",
    "IP-CIDR,10.0.0.0/8,DIRECT",
    "IP-CIDR,172.16.0.0/12,DIRECT",
    "GEOIP,CN,DIRECT",
    "DOMAIN-SUFFIX,cn,DIRECT",
    "DOMAIN-SUFFIX,baidu.com,DIRECT",
    "DOMAIN-SUFFIX,qq.com,DIRECT",
    "DOMAIN-SUFFIX,weixin.qq.com,DIRECT",
    "DOMAIN-SUFFIX,wechat.com,DIRECT",
    "DOMAIN-SUFFIX,taobao.com,DIRECT",
    "DOMAIN-SUFFIX,tmall.com,DIRECT",
    "DOMAIN-SUFFIX,jd.com,DIRECT",
    "DOMAIN-SUFFIX,alipay.com,DIRECT",
    "DOMAIN-SUFFIX,aliyun.com,DIRECT",
    "DOMAIN-SUFFIX,alibaba.com,DIRECT",
    "DOMAIN-SUFFIX,bilibili.com,DIRECT",
    "DOMAIN-SUFFIX,iqiyi.com,DIRECT",
    "DOMAIN-SUFFIX,youku.com,DIRECT",
    "DOMAIN-SUFFIX,weibo.com,DIRECT",
    "DOMAIN-SUFFIX,zhihu.com,DIRECT",
    "DOMAIN-SUFFIX,douyin.com,DIRECT",
    "DOMAIN-SUFFIX,tiktok.com,DIRECT",
    "DOMAIN-SUFFIX,xiaomi.com,DIRECT",
    "DOMAIN-SUFFIX,huawei.com,DIRECT",
    "MATCH,VPN",
]

_SURGE_RULES = [
    "IP-CIDR,127.0.0.0/8,DIRECT",
    "IP-CIDR,192.168.0.0/16,DIRECT",
    "IP-CIDR,10.0.0.0/8,DIRECT",
    "IP-CIDR,172.16.0.0/12,DIRECT",
    "GEOIP,CN,DIRECT",
    "DOMAIN-SUFFIX,cn,DIRECT",
    "DOMAIN-SUFFIX,baidu.com,DIRECT",
    "DOMAIN-SUFFIX,qq.com,DIRECT",
    "DOMAIN-SUFFIX,wechat.com,DIRECT",
    "DOMAIN-SUFFIX,taobao.com,DIRECT",
    "DOMAIN-SUFFIX,jd.com,DIRECT",
    "DOMAIN-SUFFIX,bilibili.com,DIRECT",
    "DOMAIN-SUFFIX,weibo.com,DIRECT",
    "DOMAIN-SUFFIX,zhihu.com,DIRECT",
    "DOMAIN-SUFFIX,douyin.com,DIRECT",
    "FINAL,VPN",
]


_SINGBOX_DIRECT_SUFFIXES = [
    ".cn",
    "baidu.com",
    "qq.com",
    "weixin.qq.com",
    "wechat.com",
    "taobao.com",
    "tmall.com",
    "jd.com",
    "alipay.com",
    "aliyun.com",
    "alibaba.com",
    "bilibili.com",
    "iqiyi.com",
    "youku.com",
    "weibo.com",
    "zhihu.com",
    "douyin.com",
    "tiktok.com",
    "xiaomi.com",
    "huawei.com",
]


def _clash_vless_proxy(node: dict) -> dict:
    return {
        "name": node["name"],
        "type": "vless",
        "server": node["host"],
        "port": node["port"],
        "uuid": node["uuid"],
        "network": "tcp",
        "tls": True,
        "udp": True,
        "flow": "xtls-rprx-vision",
        "servername": node["sni"],
        "client-fingerprint": "chrome",
        "reality-opts": {
            "public-key": node["public_key"],
            "short-id": node["short_id"],
        },
    }


def _singbox_ss_outbound(slot: dict) -> dict:
    return {
        "type": "shadowsocks",
        "tag": slot["name"],
        "server": slot["host"],
        "server_port": slot["port"],
        "method": slot["method"],
        "password": slot["password"],
    }


def _singbox_vless_outbound(node: dict) -> dict:
    return {
        "type": "vless",
        "tag": node["name"],
        "server": node["host"],
        "server_port": node["port"],
        "uuid": node["uuid"],
        "flow": "xtls-rprx-vision",
        "network": "tcp",
        "tls": {
            "enabled": True,
            "server_name": node["sni"],
            "utls": {
                "enabled": True,
                "fingerprint": "chrome",
            },
            "reality": {
                "enabled": True,
                "public_key": node["public_key"],
                "short_id": node["short_id"],
            },
        },
    }


def build_shadowrocket(slots: list[dict], vless_uris: list[str] | None = None) -> str:
    uris = [build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"]) for s in slots]
    uris += (vless_uris or [])
    return encode_subscription(uris)


def build_clash(slots: list[dict], vless_nodes: list[dict] | None = None) -> str:
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
    proxies += [_clash_vless_proxy(v) for v in (vless_nodes or [])]
    proxy_names = [p["name"] for p in proxies]
    dns_servers = list(dict.fromkeys(s["host"] for s in slots))
    config = {
        "dns": {
            "enable": True,
            "ipv6": False,
            "nameserver": ["114.114.114.114", "223.5.5.5"],
            "fallback": dns_servers,
            "fallback-filter": {"geoip": True, "geoip-code": "CN"},
        },
        "proxies": proxies,
        "proxy-groups": [
            {
                "name": "VPN",
                "type": "select",
                "proxies": ["DIRECT"] + proxy_names,
                "url": "http://www.gstatic.com/generate_204",
                "interval": 300,
            }
        ],
        "rules": _CLASH_RULES,
    }
    return yaml.dump(config, allow_unicode=True, sort_keys=False)


def build_singbox(slots: list[dict], vless_nodes: list[dict] | None = None) -> str:
    proxy_outbounds = [_singbox_ss_outbound(s) for s in slots]
    proxy_outbounds += [_singbox_vless_outbound(v) for v in (vless_nodes or [])]
    proxy_names = [p["tag"] for p in proxy_outbounds]
    default_proxy = next((p["tag"] for p in proxy_outbounds if p["type"] == "vless"), proxy_names[0])

    config = {
        "log": {
            "level": "warn",
            "timestamp": True,
        },
        "dns": {
            "servers": [
                {"type": "udp", "tag": "local", "server": "223.5.5.5"},
                {"type": "udp", "tag": "remote", "server": "1.1.1.1", "detour": "VPN"},
            ],
            "rules": [
                {
                    "domain_suffix": _SINGBOX_DIRECT_SUFFIXES,
                    "action": "route",
                    "server": "local",
                }
            ],
            "final": "remote",
            "strategy": "ipv4_only",
        },
        "inbounds": [
            {
                "type": "tun",
                "tag": "tun-in",
                "address": ["172.19.0.1/30"],
                "auto_route": True,
                "strict_route": False,
            }
        ],
        "outbounds": [
            {
                "type": "selector",
                "tag": "VPN",
                "outbounds": proxy_names,
                "default": default_proxy,
            },
            *proxy_outbounds,
            {"type": "direct", "tag": "direct"},
            {"type": "block", "tag": "block"},
        ],
        "route": {
            "rules": [
                {
                    "ip_is_private": True,
                    "action": "route",
                    "outbound": "direct",
                },
                {
                    "domain_suffix": _SINGBOX_DIRECT_SUFFIXES,
                    "action": "route",
                    "outbound": "direct",
                },
            ],
            "auto_detect_interface": True,
            "default_domain_resolver": "local",
            "final": "VPN",
        },
    }
    return json.dumps(config, ensure_ascii=False, indent=2)


def build_v2rayng(slots: list[dict], vless_uris: list[str] | None = None) -> str:
    uris = [build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"]) for s in slots]
    uris += (vless_uris or [])
    return encode_subscription(uris)


def build_surge_conf(slots: list[dict]) -> str:
    dns_servers = list(dict.fromkeys(s["host"] for s in slots))
    dns_str = "114.114.114.114, 223.5.5.5, " + ", ".join(dns_servers) + ", system"

    lines = [
        "[General]",
        f"dns-server = {dns_str}",
        "bypass-system = true",
        "skip-proxy = 127.0.0.0/8, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local",
        "ipv6 = false",
        "",
        "[Proxy]",
        "DIRECT = direct",
    ]

    proxy_names = []
    for s in slots:
        name = s["name"]
        proxy_names.append(name)
        lines.append(f"{name} = ss, {s['host']}, {s['port']}, {s['method']}, {s['password']}")

    lines += [
        "",
        "[Proxy Group]",
        f"VPN = select, DIRECT, {', '.join(proxy_names)}",
        "",
        "[Rule]",
    ]
    lines += _SURGE_RULES

    return "\n".join(lines)
