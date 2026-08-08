"""Minimal client for ERPNext's cookie-based login/logout endpoints.

Deliberately narrow: only what the Portal login screen needs. Do not add
token-based (Authorization: token <key>:<secret>) auth here — that's a
separate concern for server-to-server ERPNext calls elsewhere.
"""

import logging
from dataclasses import dataclass

import httpx

from .config import settings

logger = logging.getLogger("erpnext")


class ERPNextAuthError(Exception):
    """ERPNext rejected the supplied credentials."""


class ERPNextUnavailableError(Exception):
    """ERPNext could not be reached or returned something unexpected."""


@dataclass
class ERPNextSession:
    sid: str
    full_name: str


async def erpnext_login(usr: str, pwd: str) -> ERPNextSession:
    """POST /api/method/login and return the sid from ERPNext's session cookie.

    Never logs the password. The caller owns storing the returned sid
    server-side only.
    """
    url = f"{settings.erpnext_base_url}/api/method/login"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json={"usr": usr, "pwd": pwd})
    except httpx.HTTPError as exc:
        logger.warning("ERPNext login request failed: %s", exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code in (401, 403):
        raise ERPNextAuthError("ERPNext rejected the credentials")

    if response.status_code != 200:
        logger.warning("ERPNext login returned unexpected status %s", response.status_code)
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")

    body = response.json()
    if body.get("message") != "Logged In":
        raise ERPNextAuthError("ERPNext did not confirm login")

    sid = response.cookies.get("sid")
    if not sid or sid == "Guest":
        raise ERPNextUnavailableError("ERPNext login succeeded but returned no session id")

    return ERPNextSession(sid=sid, full_name=body.get("full_name") or usr)


async def erpnext_logout(sid: str) -> None:
    """POST /api/method/logout using the stored sid.

    Best-effort: failures are logged, never raised. The Portal session
    must end locally regardless of ERPNext's state.
    """
    url = f"{settings.erpnext_base_url}/api/method/logout"
    try:
        async with httpx.AsyncClient(timeout=10.0, cookies={"sid": sid}) as client:
            response = await client.post(url)
        if response.status_code != 200:
            logger.warning("ERPNext logout returned status %s", response.status_code)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext logout request failed: %s", exc)
