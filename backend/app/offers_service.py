"""Portal-native promotional offers — the one module behind the /offers
router.

Offers are Portal data, stored in the same SQLite file as portal_users /
app_settings (settings.portal_db_path). They are NOT proxied from
ERPNext; the only outward call here is a single bulk Item-name lookup
used to label the stored item_codes for display, mirroring how the
Offers admin screen's chip picker calls GET /products.

Status (Active / Scheduled / Expired) is never stored — it's derived
from today's date vs. start_date / end_date on every read (see
compute_status), so an offer transitions on its own as dates pass with
nothing to keep in sync.
"""

import json
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import HTTPException, status

from .config import settings
from .erpnext_client import ERPNextUnavailableError, erpnext_get_list
from .schemas import OfferWrite

_DB_PATH = Path(__file__).resolve().parent.parent / settings.portal_db_path


@dataclass
class OfferRow:
    id: int
    title: str
    description: str
    discount_percent: float
    start_date: str  # 'YYYY-MM-DD'
    end_date: str
    applies_to_all: bool
    product_item_codes: list[str]
    created_at: str
    updated_at: str


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS offers (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                title              TEXT    NOT NULL,
                description        TEXT    NOT NULL DEFAULT '',
                discount_percent   REAL    NOT NULL DEFAULT 0,
                start_date         TEXT    NOT NULL,
                end_date           TEXT    NOT NULL,
                applies_to_all     INTEGER NOT NULL DEFAULT 0,
                product_item_codes TEXT    NOT NULL DEFAULT '[]',
                created_at         TEXT    NOT NULL,
                updated_at         TEXT    NOT NULL
            )
            """
        )


init_db()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_record(r: sqlite3.Row) -> OfferRow:
    return OfferRow(
        id=r["id"],
        title=r["title"],
        description=r["description"],
        discount_percent=r["discount_percent"],
        start_date=r["start_date"],
        end_date=r["end_date"],
        applies_to_all=bool(r["applies_to_all"]),
        product_item_codes=json.loads(r["product_item_codes"]),
        created_at=r["created_at"],
        updated_at=r["updated_at"],
    )


def compute_status(start_date: str, end_date: str, today: date | None = None) -> str:
    today = today or date.today()
    if today < date.fromisoformat(start_date):
        return "Scheduled"
    if today > date.fromisoformat(end_date):
        return "Expired"
    return "Active"


async def _resolve_names(item_codes: list[str]) -> dict[str, str]:
    """item_code -> item_name for chip / banner labels. One bulk
    catalogue call; on any ERPNext hiccup the code doubles as its own
    label so the Offers screen still renders."""
    codes = sorted(set(item_codes))
    if not codes:
        return {}
    try:
        rows = await erpnext_get_list(
            "Item",
            filters=[["item_code", "in", codes]],
            fields=["item_code", "item_name"],
            limit_page_length=0,
        )
    except ERPNextUnavailableError:
        return {c: c for c in codes}
    found = {row["item_code"]: (row.get("item_name") or row["item_code"]) for row in rows}
    return {c: found.get(c, c) for c in codes}


def _list_rows() -> list[OfferRow]:
    with _get_conn() as conn:
        rows = conn.execute("SELECT * FROM offers ORDER BY start_date DESC, id DESC").fetchall()
    return [_row_to_record(r) for r in rows]


def _get_row(offer_id: int) -> OfferRow:
    with _get_conn() as conn:
        r = conn.execute("SELECT * FROM offers WHERE id = ?", (offer_id,)).fetchone()
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Offer not found")
    return _row_to_record(r)


def _products(item_codes: list[str], names: dict[str, str]) -> list[dict]:
    return [{"item_code": c, "item_name": names.get(c, c)} for c in item_codes]


def _to_out(r: OfferRow, offer_status: str, names: dict[str, str]) -> dict:
    return {
        "id": r.id,
        "title": r.title,
        "description": r.description,
        "discount_percent": r.discount_percent,
        "start_date": r.start_date,
        "end_date": r.end_date,
        "applies_to_all": r.applies_to_all,
        "product_item_codes": r.product_item_codes,
        "products": _products(r.product_item_codes, names),
        "status": offer_status,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


async def _one_out(r: OfferRow) -> dict:
    names = await _resolve_names(r.product_item_codes)
    return _to_out(r, compute_status(r.start_date, r.end_date), names)


async def list_offers(status_filter: str | None = None) -> list[dict]:
    rows = _list_rows()
    today = date.today()
    names = await _resolve_names([c for r in rows for c in r.product_item_codes])
    out: list[dict] = []
    for r in rows:
        offer_status = compute_status(r.start_date, r.end_date, today)
        if status_filter and offer_status != status_filter:
            continue
        out.append(_to_out(r, offer_status, names))
    return out


async def list_active_offers() -> list[dict]:
    """Only offers where start_date <= today <= end_date — the shape the
    Distributor Portal will consume."""
    today = date.today()
    rows = [r for r in _list_rows() if compute_status(r.start_date, r.end_date, today) == "Active"]
    names = await _resolve_names([c for r in rows for c in r.product_item_codes])
    return [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "discount_percent": r.discount_percent,
            "end_date": r.end_date,
            "applies_to_all": r.applies_to_all,
            "product_item_codes": r.product_item_codes,
            "products": _products(r.product_item_codes, names),
        }
        for r in rows
    ]


def _codes_for(data: OfferWrite) -> str:
    return json.dumps([] if data.applies_to_all else data.product_item_codes)


async def create_offer(data: OfferWrite) -> dict:
    now = _now()
    with _get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO offers (
                title, description, discount_percent, start_date, end_date,
                applies_to_all, product_item_codes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.title.strip(),
                data.description,
                data.discount_percent,
                data.start_date.isoformat(),
                data.end_date.isoformat(),
                int(data.applies_to_all),
                _codes_for(data),
                now,
                now,
            ),
        )
        offer_id = cur.lastrowid
    return await _one_out(_get_row(offer_id))


async def update_offer(offer_id: int, data: OfferWrite) -> dict:
    _get_row(offer_id)  # 404 if missing
    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE offers
            SET title = ?, description = ?, discount_percent = ?, start_date = ?, end_date = ?,
                applies_to_all = ?, product_item_codes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                data.title.strip(),
                data.description,
                data.discount_percent,
                data.start_date.isoformat(),
                data.end_date.isoformat(),
                int(data.applies_to_all),
                _codes_for(data),
                _now(),
                offer_id,
            ),
        )
    return await _one_out(_get_row(offer_id))


def delete_offer(offer_id: int) -> None:
    with _get_conn() as conn:
        cur = conn.execute("DELETE FROM offers WHERE id = ?", (offer_id,))
    if cur.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Offer not found")
