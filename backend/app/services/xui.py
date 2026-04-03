"""
x-ui API client — manages VLESS+Reality clients per user.
All calls are fire-and-forget style; errors are logged but not raised
so that Shadowsocks assignment still succeeds even if x-ui is down.
"""
import uuid
import logging
import httpx

logger = logging.getLogger(__name__)


async def _login(client: httpx.AsyncClient, xui_url: str, username: str, password: str) -> bool:
    try:
        r = await client.post(f"{xui_url}/login", data={"username": username, "password": password})
        return r.status_code == 200 and r.json().get("success")
    except Exception as e:
        logger.error(f"[xui] login failed: {e}")
        return False


async def add_vless_client(
    xui_url: str,
    xui_username: str,
    xui_password: str,
    inbound_id: int,
    client_uuid: str,
    email: str,
) -> bool:
    """Add a VLESS client to an x-ui inbound. Returns True on success."""
    async with httpx.AsyncClient(verify=False, timeout=10) as client:
        if not await _login(client, xui_url, xui_username, xui_password):
            return False
        try:
            payload = {
                "id": inbound_id,
                "settings": f'{{"clients": [{{"id": "{client_uuid}", "flow": "xtls-rprx-vision", "email": "{email}", "limitIpCount": 0, "totalGB": 0, "expiryTime": 0, "enable": true, "tgId": "", "subId": ""}}]}}',
            }
            r = await client.post(f"{xui_url}/xui/API/inbounds/addClient", json=payload)
            success = r.status_code == 200 and r.json().get("success")
            if not success:
                logger.error(f"[xui] addClient failed: {r.text}")
            return success
        except Exception as e:
            logger.error(f"[xui] addClient error: {e}")
            return False


async def delete_vless_client(
    xui_url: str,
    xui_username: str,
    xui_password: str,
    inbound_id: int,
    client_uuid: str,
) -> bool:
    """Delete a VLESS client from an x-ui inbound. Returns True on success."""
    async with httpx.AsyncClient(verify=False, timeout=10) as client:
        if not await _login(client, xui_url, xui_username, xui_password):
            return False
        try:
            r = await client.post(f"{xui_url}/xui/API/inbounds/{inbound_id}/delClient/{client_uuid}")
            success = r.status_code == 200 and r.json().get("success")
            if not success:
                logger.error(f"[xui] delClient failed: {r.text}")
            return success
        except Exception as e:
            logger.error(f"[xui] delClient error: {e}")
            return False


async def set_vless_client_enabled(
    xui_url: str,
    xui_username: str,
    xui_password: str,
    inbound_id: int,
    client_uuid: str,
    email: str,
    enabled: bool,
) -> bool:
    """Enable or disable a VLESS client."""
    async with httpx.AsyncClient(verify=False, timeout=10) as client:
        if not await _login(client, xui_url, xui_username, xui_password):
            return False
        try:
            payload = {
                "id": inbound_id,
                "settings": f'{{"clients": [{{"id": "{client_uuid}", "flow": "xtls-rprx-vision", "email": "{email}", "limitIpCount": 0, "totalGB": 0, "expiryTime": 0, "enable": {str(enabled).lower()}, "tgId": "", "subId": ""}}]}}',
            }
            r = await client.post(f"{xui_url}/xui/API/inbounds/updateClient/{client_uuid}", json=payload)
            success = r.status_code == 200 and r.json().get("success")
            if not success:
                logger.error(f"[xui] updateClient failed: {r.text}")
            return success
        except Exception as e:
            logger.error(f"[xui] updateClient error: {e}")
            return False
