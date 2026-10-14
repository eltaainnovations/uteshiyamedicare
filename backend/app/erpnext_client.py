"""Client for ERPNext's REST APIs used by the Portal.

Three distinct auth modes live here, never mixed in a single call:
- Cookie-based (erpnext_login/erpnext_logout) for the end-user login screen.
- Token-based (erpnext_create_user/erpnext_update_user), via
  Authorization: token <key>:<secret>, for server-to-server User
  provisioning. Scoped to User writes per the ERPNext API doc.
- Token-based, read-only (erpnext_get_list/erpnext_get_doc/erpnext_get_count)
  for Products and Distributors — catalogue-scoped key by default
  (settings.erpnext_catalogue_api_key/secret). Orders passes
  use_user_token=True to reuse the Users-scoped key instead (same key as
  erpnext_create_user/erpnext_update_user above) — never both in one call.
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


class ERPNextValidationError(Exception):
    """ERPNext rejected a document create/update (e.g. MandatoryError,
    ValidationError). The message is ERPNext's own text, extracted from
    the response body rather than reworded — callers that build a
    document from user input need to see exactly what ERPNext said, not
    a generic status-code message."""


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
    # _get_client() is one shared httpx.AsyncClient reused for every call,
    # for every user, for the life of the process — httpx auto-persists
    # Set-Cookie into its jar and resends matching cookies on every later
    # request to the same host. Every other call in this module
    # authenticates via an explicit Authorization header and never wants
    # this jar's cookies; left uncleared, this login's sid would silently
    # ride along on unrelated later requests (including ones meant to run
    # as the shared API key) and let ERPNext identify the caller as this
    # user instead. Clear it the instant we've read what we need from it.
    _get_client().cookies.clear()
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
    finally:
        # Same reasoning as erpnext_login: never let a session cookie
        # linger in the shared client's jar past the call that needed it.
        _get_client().cookies.clear()


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


async def erpnext_update_doc(
    doctype: str, name: str, fields: dict[str, Any], *, use_user_token: bool = True
) -> dict[str, Any]:
    """PUT /api/resource/{doctype}/{name} with only the fields being changed —
    same shape as erpnext_update_user, generalised. Used for Sales Order
    submit/cancel (docstatus 1/2) from the Distributor Portal's approval
    widget. Defaults to the Users-scoped token (the only write key the
    Portal holds); the catalogue key is read-only.

    NOTE: submit/cancel via this call needs the key's ERPNext user to hold
    submit + cancel permission on the doctype — see the Sales Invoice read
    gap already flagged in orders_service. If that permission is missing
    ERPNext answers non-200 and this raises ERPNextUnavailableError.
    """
    url = f"{settings.erpnext_base_url}/api/resource/{quote(doctype, safe='')}/{quote(name, safe='')}"
    headers = _token_auth_header() if use_user_token else _catalogue_auth_header()
    try:
        response = await _get_client().put(url, json=fields, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext PUT %s/%s failed: %s", doctype, name, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code == 404:
        raise ERPNextNotFoundError(f"{doctype} {name} not found")

    if response.status_code != 200:
        logger.warning(
            "ERPNext PUT %s/%s returned status %s: %s", doctype, name, response.status_code, response.text
        )
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")

    return response.json().get("data", {})


def _extract_erpnext_error(response: httpx.Response) -> str:
    """Pull ERPNext's own error text out of a failed response. Frappe's
    REST API puts the real, user-facing message(s) in `_server_messages`
    (a JSON-encoded list of JSON-encoded strings, each usually
    {"message": ..., "title": ...}); falls back to the `exception`
    field (a Python exception repr) or, failing that, the raw body."""
    try:
        body = response.json()
    except ValueError:
        return response.text.strip() or f"ERPNext returned status {response.status_code}"

    messages: list[str] = []
    raw_server_messages = body.get("_server_messages")
    if raw_server_messages:
        try:
            for entry in json.loads(raw_server_messages):
                try:
                    parsed = json.loads(entry)
                    messages.append(str(parsed["message"]) if isinstance(parsed, dict) and parsed.get("message") else str(parsed))
                except (ValueError, TypeError, KeyError):
                    messages.append(str(entry))
        except (ValueError, TypeError):
            pass

    if messages:
        return "; ".join(messages)

    for key in ("exception", "message", "exc"):
        value = body.get(key)
        if value:
            return str(value).strip().splitlines()[0]

    return response.text.strip() or f"ERPNext returned status {response.status_code}"


async def erpnext_create_doc(doctype: str, fields: dict[str, Any], *, use_user_token: bool = True) -> dict[str, Any]:
    """POST /api/resource/{doctype} — creates a new document. Same auth
    convention as erpnext_update_doc (Users-scoped token by default).

    Unlike every other helper in this module, a failure here is raised as
    ERPNextValidationError carrying ERPNext's own message (see
    _extract_erpnext_error) rather than collapsed into
    ERPNextUnavailableError's generic "returned status N" — a caller
    building a document from user input (e.g. Sales Order creation) needs
    the real field-level error, not just a status code.
    """
    url = f"{settings.erpnext_base_url}/api/resource/{quote(doctype, safe='')}"
    headers = _token_auth_header() if use_user_token else _catalogue_auth_header()
    try:
        response = await _get_client().post(url, json=fields, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext POST %s failed: %s", doctype, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code in (200, 201):
        return response.json().get("data", {})

    message = _extract_erpnext_error(response)
    logger.warning("ERPNext POST %s returned status %s: %s", doctype, response.status_code, response.text)
    raise ERPNextValidationError(message)


async def erpnext_delete_doc(doctype: str, name: str, *, use_user_token: bool = True) -> None:
    """DELETE /api/resource/{doctype}/{name} — permanently deletes a
    document. Only for documents ERPNext will actually allow deleted
    (a still-draft/docstatus=0 doc with nothing linked to it); anything
    else comes back as a real ERPNext error, surfaced via
    ERPNextValidationError the same way erpnext_create_doc does, not
    collapsed to a generic status code.
    """
    url = f"{settings.erpnext_base_url}/api/resource/{quote(doctype, safe='')}/{quote(name, safe='')}"
    headers = _token_auth_header() if use_user_token else _catalogue_auth_header()
    try:
        response = await _get_client().delete(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext DELETE %s/%s failed: %s", doctype, name, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code == 404:
        raise ERPNextNotFoundError(f"{doctype} {name} not found")
    if response.status_code in (200, 202, 204):
        return

    message = _extract_erpnext_error(response)
    logger.warning("ERPNext DELETE %s/%s returned status %s: %s", doctype, name, response.status_code, response.text)
    raise ERPNextValidationError(message)


async def erpnext_download_pdf(
    doctype: str, name: str, *, print_format: str = "Standard", use_user_token: bool = True
) -> bytes:
    """GET /api/method/frappe.utils.print_format.download_pdf — the raw
    PDF bytes for one document's default print format. Confirmed live
    (2026-09-29) against a real Sales Invoice: 200, application/pdf.
    Same proxy pattern as every other call here — the browser never gets
    ERPNext credentials; our backend fetches the PDF and streams it back.
    """
    url = f"{settings.erpnext_base_url}/api/method/frappe.utils.print_format.download_pdf"
    params = {"doctype": doctype, "name": name, "format": print_format, "no_letterhead": "0"}
    headers = _token_auth_header() if use_user_token else _catalogue_auth_header()
    try:
        response = await _get_client().get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext PDF download %s/%s failed: %s", doctype, name, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code == 404:
        raise ERPNextNotFoundError(f"{doctype} {name} not found")
    if response.status_code != 200 or "pdf" not in response.headers.get("content-type", "").lower():
        logger.warning(
            "ERPNext PDF download %s/%s returned status %s, content-type %s",
            doctype,
            name,
            response.status_code,
            response.headers.get("content-type"),
        )
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")

    return response.content


async def erpnext_get_list(
    doctype: str,
    *,
    filters: list[Any] | None = None,
    or_filters: list[Any] | None = None,
    fields: list[str] | None = None,
    limit_page_length: int | None = None,
    limit_start: int | None = None,
    group_by: str | None = None,
    order_by: str | None = None,
    use_user_token: bool = False,
) -> list[dict[str, Any]]:
    """GET /api/resource/{doctype}, read-only. Catalogue-scoped token unless
    use_user_token=True (Orders reuses the Users-scoped key).

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
    if order_by is not None:
        params["order_by"] = order_by

    headers = _token_auth_header() if use_user_token else _catalogue_auth_header()
    try:
        response = await _get_client().get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext GET %s failed: %s", doctype, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code != 200:
        logger.warning("ERPNext GET %s returned status %s: %s", doctype, response.status_code, response.text)
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")

    return response.json().get("data", [])


async def erpnext_get_count(doctype: str, *, filters: list[Any] | None = None, use_user_token: bool = False) -> int:
    """GET /api/method/frappe.client.get_count, read-only. Catalogue-scoped
    token unless use_user_token=True.

    Unlike erpnext_get_list, this has no or_filters parameter — callers
    that need an OR'd search term must fold it into a single `filters`
    list (e.g. one "like" clause) so the exact same filters can be reused
    for both the list call and this count, keeping them impossible to
    disagree.
    """
    url = f"{settings.erpnext_base_url}/api/method/frappe.client.get_count"
    params: dict[str, str] = {"doctype": doctype}
    if filters is not None:
        params["filters"] = json.dumps(filters)

    headers = _token_auth_header() if use_user_token else _catalogue_auth_header()
    try:
        response = await _get_client().get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("ERPNext get_count %s failed: %s", doctype, exc)
        raise ERPNextUnavailableError("Could not reach ERPNext") from exc

    if response.status_code != 200:
        logger.warning("ERPNext get_count %s returned status %s: %s", doctype, response.status_code, response.text)
        raise ERPNextUnavailableError(f"ERPNext returned status {response.status_code}")

    return int(response.json().get("message", 0))


async def erpnext_get_doc(
    doctype: str, name: str, *, fields: list[str] | None = None, use_user_token: bool = False
) -> dict[str, Any]:
    """GET /api/resource/{doctype}/{name}, read-only. Catalogue-scoped
    token unless use_user_token=True. `fields` narrows the response to
    just those top-level keys (child tables included by name) — omit it
    to get the whole document, as every existing caller does."""
    url = f"{settings.erpnext_base_url}/api/resource/{quote(doctype, safe='')}/{quote(name, safe='')}"
    params = {"fields": json.dumps(fields)} if fields is not None else None
    headers = _token_auth_header() if use_user_token else _catalogue_auth_header()
    try:
        response = await _get_client().get(url, params=params, headers=headers)
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
