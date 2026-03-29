import base64
import yaml
from app.utils.base64_utils import build_ss_uri, encode_subscription


def _build_hy2_uri(slot: dict) -> str:
    """hysteria2://password@host:port?insecure=1#name"""
    from urllib.parse import quote
    name = quote(slot["name"])
    return f"hysteria2://{slot['password']}@{slot['host']}:{slot['port']}?insecure=1&sni=bing.com#{name}"


def _is_hy2(slot: dict) -> bool:
    return slot.get("protocol", "shadowsocks") == "hysteria2"

# China domains/IPs that should go DIRECT (not through VPN)
# Proxy only blocked/foreign traffic → avoids CAPTCHA from shared IP
_CLASH_RULES = [
    # Local network — always direct
    "IP-CIDR,127.0.0.0/8,DIRECT",
    "IP-CIDR,192.168.0.0/16,DIRECT",
    "IP-CIDR,10.0.0.0/8,DIRECT",
    "IP-CIDR,172.16.0.0/12,DIRECT",
    # China IPs — direct (avoids CAPTCHA on Baidu, WeChat, etc.)
    "GEOIP,CN,DIRECT",
    # Chinese domains — direct
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
    # Everything else → VPN
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


def build_shadowrocket(slots: list[dict]) -> str:
    """Base64-encoded URI list for Shadowrocket — supports ss:// and hysteria2://."""
    uris = []
    for s in slots:
        if _is_hy2(s):
            uris.append(_build_hy2_uri(s))
        else:
            uris.append(build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"]))
    return encode_subscription(uris)


def build_clash(slots: list[dict]) -> str:
    """Clash Meta YAML subscription with China-direct routing rules."""
    proxies = []
    for s in slots:
        if _is_hy2(s):
            proxies.append({
                "name": s["name"],
                "type": "hysteria2",
                "server": s["host"],
                "port": s["port"],
                "password": s["password"],
                "skip-cert-verify": True,
                "sni": "bing.com",
                "up": "1000 mbps",
                "down": "1000 mbps",
            })
        else:
            proxies.append({
                "name": s["name"],
                "type": "ss",
                "server": s["host"],
                "port": s["port"],
                "cipher": s["method"],
                "password": s["password"],
                "udp": True,
            })
    proxy_names = [s["name"] for s in slots]
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


def build_v2rayng(slots: list[dict]) -> str:
    """Base64-encoded URI list for v2rayNG — supports ss:// and hysteria2://."""
    uris = []
    for s in slots:
        if _is_hy2(s):
            uris.append(_build_hy2_uri(s))
        else:
            uris.append(build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"]))
    return encode_subscription(uris)


def build_surge_conf(slots: list[dict]) -> str:
    """Shadowrocket/Surge conf with China-direct routing rules."""
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
        if _is_hy2(s):
            lines.append(f"{name} = hysteria2, {s['host']}, {s['port']}, password={s['password']}, skip-cert-verify=true, sni=bing.com")
        else:
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
