"""Turns a raw Shree Maruti /client_tracking_all response into the shape
the Track Shipment screen renders. No outward calls here — that's
maruti_client; this is pure mapping (like analytics_service on top of
orders_service).

The success:"1" field names below are taken from the API doc's
description (statuses array of label / description / location / timestamp
/ category; pod present only once DELIVERED). They MUST be re-checked
against a real success:"1" body — every reader here falls back gracefully
if a key is named differently, so a wrong guess degrades to blank text
rather than a crash.
"""

from datetime import datetime
from typing import Any

from . import maruti_client
from .config import settings

_PENDING_MESSAGE = "No tracking information found."

# candidate keys, in priority order, for each field of a status event
_EVENT_KEYS: dict[str, tuple[str, ...]] = {
    "label": ("label", "status", "Status", "StatusName", "activity"),
    "description": ("description", "remarks", "Remarks", "message", "StatusDescription"),
    "location": ("location", "Location", "city", "City", "branch", "Branch"),
    "timestamp": ("timestamp", "datetime", "DateTime", "scan_date", "StatusDateTime", "date"),
    "category": ("category", "Category", "type", "ScanType", "stage"),
}
_STATUSES_KEYS = ("statuses", "Statuses", "scans", "Scan", "tracking", "TrackingData", "history")
_POD_KEYS = ("pod", "POD", "pod_images", "PodImage", "pod_image", "proof_of_delivery")
_LATEST_KEYS = ("latest", "Latest", "current_status", "CurrentStatus", "last_status")

_TS_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%d-%m-%Y %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
    "%d-%b-%Y %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%d-%m-%Y %H:%M",
)


def _first(d: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def _parse_ts(raw: str) -> datetime | None:
    for fmt in _TS_FORMATS:
        try:
            return datetime.strptime(raw.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


def _event(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "label": str(_first(raw, _EVENT_KEYS["label"]) or ""),
        "description": str(_first(raw, _EVENT_KEYS["description"]) or ""),
        "location": str(_first(raw, _EVENT_KEYS["location"]) or ""),
        "timestamp": str(_first(raw, _EVENT_KEYS["timestamp"]) or ""),
        "category": str(_first(raw, _EVENT_KEYS["category"]) or "").lower(),
    }


def _pod_images(data: dict[str, Any]) -> list[str]:
    pod = _first(data, _POD_KEYS)
    if not pod:
        return []
    if isinstance(pod, str):
        return [pod]
    if isinstance(pod, list):
        return [str(p) for p in pod if p]
    if isinstance(pod, dict):
        return [str(v) for v in pod.values() if v]
    return []


def _tracking_url(docket: str) -> str:
    # Confirmed from the live tracking.shreemaruti.com SPA source: it reads
    # the docket from `?d=<docket>` (falling back to `?shipmentNo=`).
    from urllib.parse import quote

    base = settings.maruti_public_tracking_url.rstrip("/")
    return f"{base}/?d={quote(docket, safe='')}"


async def track_shipment(docket: str) -> dict[str, Any]:
    body = await maruti_client.track(docket)
    success = str(body.get("success"))
    message = body.get("message")

    if success != "1":
        state = "pending" if message == _PENDING_MESSAGE else "error"
        return {
            "docket": docket,
            "state": state,
            "message": message,
            "latest": None,
            "events": [],
            "pod_images": [],
            "tracking_url": _tracking_url(docket),
        }

    data = body.get("data") or {}
    if not isinstance(data, dict):
        data = {}

    raw_list = _first(data, _STATUSES_KEYS) or []
    if not isinstance(raw_list, list):
        raw_list = []
    events = [_event(r) for r in raw_list if isinstance(r, dict)]

    # Sort by real timestamp; keep original order for anything unparseable.
    indexed = list(enumerate(events))
    indexed.sort(key=lambda pair: (_parse_ts(pair[1]["timestamp"]) or datetime.min, pair[0]))
    events = [e for _, e in indexed]

    for i, e in enumerate(events):
        e["current"] = i == len(events) - 1
        e["done"] = i < len(events) - 1

    latest = events[-1] if events else None
    # If the API also hands back an explicit "latest" and we somehow have no
    # array, surface it as a single event.
    if latest is None:
        explicit = _first(data, _LATEST_KEYS)
        if isinstance(explicit, dict):
            latest = {**_event(explicit), "current": True, "done": False}
            events = [latest]

    return {
        "docket": docket,
        "state": "found",
        "message": message or (latest["label"] if latest else None),
        "latest": latest,
        "events": events,
        "pod_images": _pod_images(data),
        "tracking_url": _tracking_url(docket),
    }
