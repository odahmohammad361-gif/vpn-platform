import base64
from urllib.parse import quote


def build_ss_uri(method: str, password: str, host: str, port: int, name: str) -> str:
    userinfo = base64.b64encode(f"{method}:{password}".encode()).decode()
    return f"ss://{userinfo}@{host}:{port}#{name}"


def encode_subscription(uris: list[str]) -> str:
    content = "\n".join(uris)
    return base64.b64encode(content.encode()).decode()


def build_vless_uri(
    client_uuid: str,
    host: str,
    port: int,
    public_key: str,
    short_id: str,
    sni: str,
    name: str,
    spider_x: str = "/",
) -> str:
    params = (
        f"type=tcp&encryption=none&security=reality"
        f"&pbk={public_key}&fp=chrome&sni={sni}"
        f"&sid={short_id}&spx={quote(spider_x)}"
        f"&flow=xtls-rprx-vision"
    )
    return f"vless://{client_uuid}@{host}:{port}?{params}#{quote(name)}"


def build_vless_grpc_uri(
    client_uuid: str,
    host: str,
    port: int,
    sni: str,
    service_name: str,
    name: str,
) -> str:
    params = (
        f"type=grpc&encryption=none&security=tls"
        f"&serviceName={quote(service_name)}&mode=gun"
        f"&sni={quote(sni)}&alpn=h2"
        f"&packetEncoding=xudp"
    )
    return f"vless://{client_uuid}@{host}:{port}?{params}#{quote(name)}"
