import base64


def build_ss_uri(method: str, password: str, host: str, port: int, name: str) -> str:
    userinfo = base64.b64encode(f"{method}:{password}".encode()).decode()
    return f"ss://{userinfo}@{host}:{port}#{name}"


def encode_subscription(uris: list[str]) -> str:
    content = "\n".join(uris)
    return base64.b64encode(content.encode()).decode()
