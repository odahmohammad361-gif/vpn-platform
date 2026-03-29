import base64
import yaml
from urllib.parse import quote
from app.utils.base64_utils import build_ss_uri, encode_subscription

REALITY_SNI = "www.microsoft.com"


def _is_vless(slot: dict) -> bool:
    return slot.get("protocol", "shadowsocks") == "vless"


def _build_vless_uri(slot: dict) -> str:
    """vless://UUID@host:443?security=reality&sni=...&pbk=...&sid=...&type=tcp&flow=#name"""
    name = quote(slot["name"])
    pbk = slot.get("reality_public_key", "")
    sid = slot.get("reality_short_id", "")
    return (
        f"vless://{slot['password']}@{slot['host']}:443"
        f"?security=reality&sni={REALITY_SNI}&fp=chrome"
        f"&pbk={pbk}&sid={sid}&type=tcp&flow=xtls-rprx-vision"
        f"#{name}"
    )


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


def build_shadowrocket(slots: list[dict]) -> str:
    uris = []
    for s in slots:
        if _is_vless(s):
            uris.append(_build_vless_uri(s))
        else:
            uris.append(build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"]))
    return encode_subscription(uris)


def build_clash(slots: list[dict]) -> str:
    proxies = []
    for s in slots:
        if _is_vless(s):
            proxies.append({
                "name": s["name"],
                "type": "vless",
                "server": s["host"],
                "port": 443,
                "uuid": s["password"],
                "network": "tcp",
                "tls": True,
                "flow": "xtls-rprx-vision",
                "servername": REALITY_SNI,
                "reality-opts": {
                    "public-key": s.get("reality_public_key", ""),
                    "short-id": s.get("reality_short_id", ""),
                },
                "client-fingerprint": "chrome",
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
    uris = []
    for s in slots:
        if _is_vless(s):
            uris.append(_build_vless_uri(s))
        else:
            uris.append(build_ss_uri(s["method"], s["password"], s["host"], s["port"], s["name"]))
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
        if _is_vless(s):
            pbk = s.get("reality_public_key", "")
            sid = s.get("reality_short_id", "")
            lines.append(
                f"{name} = vless, {s['host']}, 443, username={s['password']}, "
                f"tls=true, reality-public-key={pbk}, reality-short-id={sid}, "
                f"sni={REALITY_SNI}, skip-cert-verify=false"
            )
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
