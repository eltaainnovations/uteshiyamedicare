"""Client for the Shree Maruti (innofulfill) Client Booking API v6 — the
one outward dependency behind the Track Shipment screen.

Read-only: this module only logs in and tracks a manually-entered docket.
No booking creation, no order linkage, no bulk tracking.

Auth model (per the API doc):
- POST /login with headers `clientcode` + `secretkey` and an empty body
  `{"data": {}}` returns an `AuthToken` valid until `TokenExpiredOn`
  (daily, 23:59:59 IST). We cache that token process-wide.
- Every other call sends headers `clientcode` + `token` (the AuthToken) —
  NEVER the secretkey.
- Every response is HTTP 200 regardless of outcome; the body's `success`
  field ("0" / "1") is the only thing to branch on.
- A stale/invalid token comes back as `success: "0"`, message
  "Authentication Failed." — on that we drop the cache, re-login once,
  and retry the original call.

Same shape as erpnext_client.py: a module-level shared httpx client, a
cached credential, and errors mapped onto a small exception set.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from .config import settings

logger = logging.getLogger("maruti")

# IST is a fixed UTC+5:30 with no DST, so a static offset is exact and
# needs no system tz database.
_IST = timezone(timedelta(hours=5, minutes=30))
_AUTH_FAILED_MESSAGE = "Authentication Failed."


class MarutiAuthError(Exception):
    """Shree Maruti rejected clientcode/secretkey — a config problem, not
    something a retry or a different docket fixes."""


class MarutiUnavailableError(Exception):
    """Shree Maruti could not be reached or returned something unparseable."""


# --- shared client (mirrors erpnext_client._get_client) ------------------

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=20.0,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
    return _client


async def aclose_client() -> None:
    """Close the shared Maruti HTTP client. Call once on app shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


# --- token cache --------------------------------------------------------

_token: str | None = None
_token_expires_at: datetime | None = None  # tz-aware, IST
# One in-flight login at a time — a burst of tracking calls right after a
# restart should trigger exactly one /login, not one per request.
_login_lock = asyncio.Lock()


def _parse_expiry(raw: str | None) -> datetime:
    """`TokenExpiredOn` -> tz-aware IST datetime. The doc says 'daily,
    23:59:59 IST' but not the string format, so try the likely ones and
    fall back to end-of-today IST. The auth-failure retry in _request is
    the real backstop if this is ever wrong."""
    end_of_today_ist = datetime.now(_IST).replace(hour=23, minute=59, second=59, microsecond=0)
    if not raw:
        return end_of_today_ist
    for fmt in ("%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(raw.strip(), fmt).replace(tzinfo=_IST)
        except ValueError:
            continue
    logger.warning("maruti: could not parse TokenExpiredOn %r, using end-of-day IST", raw)
    return end_of_today_ist


async def _login() -> str:
    """POST /login, cache the AuthToken, return it. Never logs the
    secretkey."""
    global _token, _token_expires_at

    if not settings.maruti_secret_key:
        raise MarutiAuthError("Shree Maruti secret key is not configured (MARUTI_SECRET_KEY)")

    url = f"{settings.maruti_base_url}/login"
    headers = {"clientcode": settings.maruti_client_code, "secretkey": settings.maruti_secret_key}
    try:
        response = await _get_client().post(url, headers=headers, json={"data": {}})
    except httpx.HTTPError as exc:
        logger.warning("maruti login request failed: %s", exc)
        raise MarutiUnavailableError("Could not reach Shree Maruti") from exc

    try:
        body = response.json()
    except ValueError as exc:
        raise MarutiUnavailableError(f"Shree Maruti login returned non-JSON (HTTP {response.status_code})") from exc

    if str(body.get("success")) != "1":
        # "Authentication Failed." here means the credentials themselves
        # are wrong — nothing to retry.
        raise MarutiAuthError(body.get("message") or "Shree Maruti login failed")

    # Confirmed against a live Beta response: AuthToken / TokenExpiredOn are
    # top-level (the nested `data` object only carries account metadata).
    token = body.get("AuthToken")
    if not token:
        raise MarutiUnavailableError("Shree Maruti login succeeded but returned no AuthToken")

    _token = token
    _token_expires_at = _parse_expiry(body.get("TokenExpiredOn"))
    logger.info("maruti: logged in, token valid until %s", _token_expires_at)
    return token


async def _valid_token(*, force: bool = False) -> str:
    """Return a usable token, logging in if the cache is empty, expired,
    or `force`d. Serialised so concurrent callers share one login."""
    global _token
    async with _login_lock:
        if not force and _token and _token_expires_at and datetime.now(_IST) < _token_expires_at:
            return _token
        return await _login()


async def _request(path: str, data: dict) -> dict:
    """POST {BASE}/{path} with the token header, retrying once through a
    fresh login if the response is 'Authentication Failed.'"""
    url = f"{settings.maruti_base_url}/{path}"

    async def _call(token: str) -> dict:
        try:
            response = await _get_client().post(
                url,
                headers={"clientcode": settings.maruti_client_code, "token": token},
                json={"data": data},
            )
        except httpx.HTTPError as exc:
            logger.warning("maruti %s request failed: %s", path, exc)
            raise MarutiUnavailableError("Could not reach Shree Maruti") from exc
        try:
            return response.json()
        except ValueError as exc:
            raise MarutiUnavailableError(
                f"Shree Maruti {path} returned non-JSON (HTTP {response.status_code})"
            ) from exc

    body = await _call(await _valid_token())
    if str(body.get("success")) != "1" and body.get("message") == _AUTH_FAILED_MESSAGE:
        logger.info("maruti: token rejected, re-logging in and retrying %s", path)
        body = await _call(await _valid_token(force=True))
    return body


async def track(awb: str) -> dict:
    """Raw parsed body of POST /client_tracking_all for one docket.

    Uses the `AWB` field (not `DocumentNoRef`) — the doc's guidance for a
    docket a user typed in by hand. The caller branches on `body['success']`
    and `body['message']` (never the HTTP status) to decide found / pending
    / error.
    """
    return await _request("client_tracking_all", {"AWB": awb.strip()})
