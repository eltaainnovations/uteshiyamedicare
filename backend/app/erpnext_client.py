"""Client for ERPNext's REST APIs used by the Portal.

Three distinct auth modes live here, never mixed in a single call:
- Cookie-based (erpnext_login/erpnext_logout) for the end-user login screen.
- Token-based (erpnext_create_user/erpnext_update_user), via
  Authorization: token <key>:<secret>, for server-to-server User
  provisioning. Scoped to User writes per the ERPNext API doc.
- Token-based, read-only (erpnext_get_list/erpnext_get_doc) for the
  Product Catalogue. Uses its own catalogue-scoped key
  (settings.erpnext_catalogue_api_key/secret) — never the User-write key
  above, even though both are "Authorization: token" headers.
"""

import json
import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from .config import settings

logger = logging.getLogger("erpnext")


class ERPNextAuthError(Exception):
    """ERPNext rejected the supplied credentials."""


class ERPNextUnavailableError(Exception):
    """ERPNext could not be reached or returned something unexpected."""


class ERPNextDuplicateUserError(Exception):
    """ERPNext already has a User with this email (409 Duplicate Entry)."""


class ERPNextNotFoundError(Exception):
    """ERPNext returned 404 for a single-document lookup."""


def _token_auth_header() -> dict[str, str]:
    return {"Authorization": f"token {settings.erpnext_user_api_key}:{settings.erpnext_user_api_secret}"}


def _catalogue_auth_header() -> dict[str, str]:
    return {"Authorization": f"token {settings.erpnext_catalogue_api_key}:{settings.erpnext_catalogue_api_secret}"}


# Shared, connection-pooled client reused across every call in this module.
# Opening a fresh httpx.AsyncClient per request means a fresh TCP+TLS
# handshake to the remote ERPNext host every single time — measured at
# ~1s/call to test.uteshiyamedicare.com, vs ~0.2s/call once the connection
# is kept alive and reused. The Product Catalogue's list/detail endpoints
# make 3-5 ERPNext calls each, so this was most of their latency.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=15.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=40),
        )
    return _client


async def aclose_client() -> None:
    """Close the shared ERPNext HTTP client. Call once on app shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


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
        response = await _get_client().post(url, json={"usr": usr, "pwd": pwd})
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
        response = await _get_client().post(url, cookies={"sid": sid})
        if response.status_code != 200:
            logger.warning("ERPNext logout returned status %s", response.status_code)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext logout request failed: %s", exc)


async def erpnext_create_user(
    *, email: str, first_name: str, last_name: str, new_password: str, roles: list[str]
) -> None:
    """POST /api/resource/User. Never logs new_password.

    Raises ERPNextDuplicateUserError on 409 (email already exists),
    ERPNextUnavailableError for anything else (network, permissions, etc).
    """
    url = f"{settings.erpnext_base_url}/api/resource/User"
    payload = {
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "send_welcome_email": 0,
        "new_password": new_password,
        "roles": [{"role": role} for role in roles],
    }
    try:
        response = await _get_client().post(url, json=payload, headers=_token_auth_header())
    except httpx.HTTPError as exc:
        logger.warning("ERPNext create-user request failed for %s: %s", email, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code == 409:
        raise ERPNextDuplicateUserError(f"ERPNext already has a User with email {email}")

    if response.status_code not in (200, 201):
        logger.warning(
            "ERPNext create-user for %s returned status %s: %s", email, response.status_code, response.text
        )
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")


async def erpnext_update_user(email: str, fields: dict[str, Any]) -> None:
    """PUT /api/resource/User/{email} with only the fields being changed."""
    url = f"{settings.erpnext_base_url}/api/resource/User/{quote(email, safe='')}"
    try:
        response = await _get_client().put(url, json=fields, headers=_token_auth_header())
    except httpx.HTTPError as exc:
        logger.warning("ERPNext update-user request failed for %s: %s", email, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code != 200:
        logger.warning(
            "ERPNext update-user for %s returned status %s: %s", email, response.status_code, response.text
        )
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")


async def erpnext_get_list(
    doctype: str,
    *,
    filters: list[Any] | None = None,
    or_filters: list[Any] | None = None,
    fields: list[str] | None = None,
    limit_page_length: int | None = None,
    limit_start: int | None = None,
    group_by: str | None = None,
) -> list[dict[str, Any]]:
    """GET /api/resource/{doctype}, catalogue-scoped token, read-only.

    limit_page_length=0 means "fetch all" (ERPNext treats 0 as no limit) —
    pass it explicitly for internal aggregation reads (Bin, Item Price,
    variant rows) where a silently-truncated page would corrupt a stock or
    price rollup. limit_start is the page offset for genuinely paginated
    reads (the top-level product listing) — leaving both unset falls back
    to ERPNext's own default page size (20), which is exactly what caused
    /products to silently show only 20 of 8,256 products before pagination
    was wired up.
    """
    url = f"{settings.erpnext_base_url}/api/resource/{quote(doctype, safe='')}"
    params: dict[str, str] = {}
    if filters is not None:
        params["filters"] = json.dumps(filters)
    if or_filters is not None:
        params["or_filters"] = json.dumps(or_filters)
    if fields is not None:
        params["fields"] = json.dumps(fields)
    if limit_page_length is not None:
        params["limit_page_length"] = str(limit_page_length)
    if limit_start is not None:
        params["limit_start"] = str(limit_start)
    if group_by is not None:
        params["group_by"] = group_by

    try:
        response = await _get_client().get(url, params=params, headers=_catalogue_auth_header())
    except httpx.HTTPError as exc:
        logger.warning("ERPNext GET %s failed: %s", doctype, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code != 200:
        logger.warning("ERPNext GET %s returned status %s: %s", doctype, response.status_code, response.text)
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")

    return response.json().get("data", [])


async def erpnext_get_doc(doctype: str, name: str) -> dict[str, Any]:
    """GET /api/resource/{doctype}/{name}, catalogue-scoped token, read-only."""
    url = f"{settings.erpnext_base_url}/api/resource/{quote(doctype, safe='')}/{quote(name, safe='')}"
    try:
        response = await _get_client().get(url, headers=_catalogue_auth_header())
    except httpx.HTTPError as exc:
        logger.warning("ERPNext GET %s/%s failed: %s", doctype, name, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code == 404:
        raise ERPNextNotFoundError(f"{doctype} {name} not found")

    if response.status_code != 200:
        logger.warning(
            "ERPNext GET %s/%s returned status %s: %s", doctype, name, response.status_code, response.text
        )
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")

    return response.json().get("data", {})
