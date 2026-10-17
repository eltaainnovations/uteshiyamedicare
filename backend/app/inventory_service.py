"""Distributor-owned inventory ledger — Portal-native, stored in portal.db
alongside offers / portal_users.

Stock only ever goes UP here, and only automatically: when one of a
distributor's Sales Orders reaches ERPNext status "Completed" (confirmed
live via GET /api/resource/Sales Order grouped by status — docstatus=1,
per_delivered=100, per_billed=100; the other terminal status "Closed" is
a manual close-out and is deliberately NOT credited), every line item's
qty is added to distributor_inventory and the order is recorded in
credited_orders so it can never be counted twice. There is no manual
"add stock" path. Stock goes DOWN only via the End User Record form
(separate task), never from here.

sync_inventory_credits is safe to call on every relevant page load: one
cheap ERPNext list call diffs completed orders against credited_orders,
and the DB is only touched when there is genuinely a new order to credit.
Each order is credited in its own transaction, and credited_orders'
UNIQUE(customer_id, sales_order_name) means two concurrent syncs can't
double-credit — the loser's INSERT raises IntegrityError inside the
transaction, so its quantity bumps roll back with it.
"""

import asyncio
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import products_service
from .config import settings
from .erpnext_client import ERPNextUnavailableError, erpnext_get_list

logger = logging.getLogger("inventory")

_DB_PATH = Path(__file__).resolve().parent.parent / settings.portal_db_path

# Confirmed live, not guessed — see module docstring.
COMPLETED_STATUS = "Completed"

# Same request-line-length guard as orders_service / products_service: a big
# `in [...]` filter JSON-encoded into the query string 400s past a certain
# size. Chunk and run concurrently.
_BATCH_SIZE = 30


def _chunk(items: list[str], size: int = _BATCH_SIZE) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS distributor_inventory (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id         TEXT    NOT NULL,
                item_code           TEXT    NOT NULL,
                quantity            INTEGER NOT NULL DEFAULT 0,
                low_stock_threshold INTEGER,
                created_at          TEXT    NOT NULL,
                updated_at          TEXT    NOT NULL,
                UNIQUE (customer_id, item_code)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS credited_orders (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id      TEXT NOT NULL,
                sales_order_name TEXT NOT NULL,
                credited_at      TEXT NOT NULL,
                UNIQUE (customer_id, sales_order_name)
            )
            """
        )


init_db()


async def _completed_order_names(customer_id: str) -> list[str]:
    rows = await erpnext_get_list(
        "Sales Order",
        filters=[["customer", "=", customer_id], ["status", "=", COMPLETED_STATUS]],
        fields=["name"],
        limit_page_length=0,
        use_user_token=True,
    )
    return [r["name"] for r in rows]


async def _line_items_for_orders(order_names: list[str]) -> dict[str, list[tuple[str, int]]]:
    """(item_code, qty) per Sales Order — one joined child-table query per
    chunk, same technique as orders_service._item_counts."""
    if not order_names:
        return {}
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Sales Order",
                filters=[["name", "in", chunk]],
                fields=["name", "`tabSales Order Item`.item_code", "`tabSales Order Item`.qty"],
                limit_page_length=0,
                use_user_token=True,
            )
            for chunk in _chunk(order_names)
        ]
    )
    out: dict[str, list[tuple[str, int]]] = {}
    for rows in batches:
        for row in rows:
            code = row.get("item_code")
            if not code:
                continue
            out.setdefault(row["name"], []).append((code, int(round(float(row.get("qty") or 0)))))
    return out


async def sync_inventory_credits(customer_id: str) -> None:
    """Credit this distributor's not-yet-credited Completed Sales Orders into
    distributor_inventory. Best-effort and idempotent — safe to call on every
    dashboard / orders / inventory load. Never raises: an ERPNext or SQLite
    hiccup just means new credits aren't picked up until the next call."""
    try:
        completed = await _completed_order_names(customer_id)
    except ERPNextUnavailableError:
        return

    try:
        with _get_conn() as conn:
            already = {
                r["sales_order_name"]
                for r in conn.execute(
                    "SELECT sales_order_name FROM credited_orders WHERE customer_id = ?", (customer_id,)
                )
            }
    except sqlite3.Error:
        logger.exception("inventory sync: could not read credited_orders for %s", customer_id)
        return

    new_names = [n for n in completed if n not in already]
    if not new_names:
        return

    try:
        lines_by_order = await _line_items_for_orders(new_names)
    except ERPNextUnavailableError:
        return

    for so_name in new_names:
        lines = lines_by_order.get(so_name, [])
        now = _now()
        conn = _get_conn()
        try:
            with conn:  # ── one transaction per Sales Order: all credits + the marker, or nothing ──
                for item_code, qty in lines:
                    conn.execute(
                        """
                        INSERT INTO distributor_inventory
                            (customer_id, item_code, quantity, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (customer_id, item_code) DO UPDATE SET
                            quantity   = quantity + excluded.quantity,
                            updated_at = excluded.updated_at
                        """,
                        (customer_id, item_code, qty, now, now),
                    )
                conn.execute(
                    "INSERT INTO credited_orders (customer_id, sales_order_name, credited_at) VALUES (?, ?, ?)",
                    (customer_id, so_name, now),
                )
        except sqlite3.IntegrityError:
            # A concurrent sync already credited this order — its UNIQUE
            # (customer_id, sales_order_name) rejected our marker INSERT, and
            # `with conn` rolled back the quantity bumps in the same
            # transaction. No double-credit. Nothing to do.
            pass
        except sqlite3.Error:
            logger.exception("inventory sync: failed to credit %s for %s", so_name, customer_id)
        finally:
            conn.close()


async def item_meta(item_codes: list[str]) -> dict[str, dict[str, Any]]:
    """item_code -> {item_name, item_group, stock_uom} via one bulk Item
    lookup (catalogue-scoped token, like the rest of products_service).
    Shared with end_user_records_service for its item_name resolution."""
    if not item_codes:
        return {}
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Item",
                filters=[["item_code", "in", chunk]],
                fields=["item_code", "item_name", "item_group", "stock_uom"],
                limit_page_length=0,
            )
            for chunk in _chunk(item_codes)
        ]
    )
    return {row["item_code"]: row for rows in batches for row in rows}


async def list_inventory(customer_id: str) -> list[dict[str, Any]]:
    """Runs the credit sync, then returns this distributor's ledger enriched
    with item name / category / unit and a per-distributor stock value."""
    await sync_inventory_credits(customer_id)

    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT item_code, quantity, low_stock_threshold, updated_at
            FROM distributor_inventory
            WHERE customer_id = ?
            ORDER BY item_code
            """,
            (customer_id,),
        ).fetchall()
    if not rows:
        return []

    codes = [r["item_code"] for r in rows]
    meta, price_map = await asyncio.gather(
        item_meta(codes),
        # Same customer-first Item Price resolution the Product Catalogue uses.
        products_service._scoped_prices_by_item_code(codes, customer=customer_id),
    )

    out: list[dict[str, Any]] = []
    for r in rows:
        code = r["item_code"]
        m = meta.get(code, {})
        qty = r["quantity"]
        threshold = r["low_stock_threshold"]
        price = price_map.get(code, {}).get("price")
        out.append(
            {
                "item_code": code,
                "item_name": m.get("item_name") or code,
                "category": m.get("item_group"),
                "unit": m.get("stock_uom"),
                "quantity": qty,
                "low_stock_threshold": threshold,
                "low_stock": threshold is not None and qty <= threshold,
                "value": round(qty * price, 2) if price is not None else None,
                "updated_at": r["updated_at"],
            }
        )
    return out


def set_threshold(customer_id: str, item_code: str, threshold: int | None) -> None:
    """Set (or clear, with None) the low-stock threshold for one item,
    creating a zero-quantity row if the distributor has never received it —
    they may want the reorder alert configured ahead of the first order."""
    now = _now()
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO distributor_inventory
                (customer_id, item_code, quantity, low_stock_threshold, created_at, updated_at)
            VALUES (?, ?, 0, ?, ?, ?)
            ON CONFLICT (customer_id, item_code) DO UPDATE SET
                low_stock_threshold = excluded.low_stock_threshold,
                updated_at          = excluded.updated_at
            """,
            (customer_id, item_code, threshold, now, now),
        )
