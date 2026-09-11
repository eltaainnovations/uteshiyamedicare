"""Read-only Orders screen backed directly by ERPNext's Sales Order (and,
where permitted, Sales Invoice) doctypes — no local storage, no caching.
Mirrors distributors_service.py's shape.

Uses the Users-scoped token (use_user_token=True), not the catalogue key —
per the API doc, this key's Sales Invoice read access is currently
blocked by an ERPNext-side Role Permissions Manager gap (confirmed via a
live 403: "portal@uteshiyamedicare.com does not have doctype access...
for document Sales Invoice"). That's flagged back to Uteshiya, not
worked around here — _find_linked_invoice degrades to None instead of
raising, so the rest of an order's detail still loads.
"""

import asyncio
from datetime import date
from typing import Any

from .erpnext_client import (
    ERPNextNotFoundError,
    ERPNextUnavailableError,
    erpnext_get_count,
    erpnext_get_doc,
    erpnext_get_list,
    erpnext_update_doc,
)

_LIST_FIELDS = ["name", "customer", "customer_name", "transaction_date", "delivery_date", "status", "grand_total"]

# Same fix as products_service._BATCH_SIZE: a big `name in [...]` filter,
# JSON-encoded into the query string, blows past the request-line length
# limit once enough order names pile in (hit in practice with 218 orders
# in a single report month — a bare 400 "Request Line is too large"
# before it ever reached application code). Chunking trades one big
# request for several small ones run concurrently.
_BATCH_SIZE = 30


def _chunk(names: list[str], size: int = _BATCH_SIZE) -> list[list[str]]:
    return [names[i : i + size] for i in range(0, len(names), size)]


async def distinct_statuses() -> list[str]:
    rows = await erpnext_get_list(
        "Sales Order", fields=["status"], group_by="status", limit_page_length=0, use_user_token=True
    )
    return sorted(row["status"] for row in rows if row.get("status"))


async def _item_counts(order_names: list[str]) -> dict[str, int]:
    """Row count per order via a joined child-table field — same
    technique as products_service._attributes_by_item_code, avoiding an
    erpnext_get_doc per order just to count line items."""
    if not order_names:
        return {}
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Sales Order",
                filters=[["name", "in", chunk]],
                fields=["name", "`tabSales Order Item`.name as item_row"],
                limit_page_length=0,
                use_user_token=True,
            )
            for chunk in _chunk(order_names)
        ]
    )
    counts: dict[str, int] = {}
    for rows in batches:
        for row in rows:
            counts[row["name"]] = counts.get(row["name"], 0) + 1
    return counts


def _shape_order_rows(orders: list[dict[str, Any]], counts: dict[str, int]) -> list[dict[str, Any]]:
    return [
        {
            "name": o["name"],
            "customer": o["customer"],
            "customer_name": o.get("customer_name"),
            "transaction_date": o.get("transaction_date"),
            "delivery_date": o.get("delivery_date"),
            "status": o["status"],
            "item_count": counts.get(o["name"], 0),
            "grand_total": float(o.get("grand_total") or 0),
        }
        for o in orders
    ]


async def list_orders(
    *,
    search: str | None = None,
    customer: str | None = None,
    status: str | None = None,
    statuses: list[str] | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], int, list[str]]:
    filters: list[Any] = []
    if customer:
        filters.append(["customer", "=", customer])
    if status:
        filters.append(["status", "=", status])
    if statuses:
        # e.g. the Distributor Portal's "Active" bucket — one filter, so the
        # list and count calls below stay in agreement.
        filters.append(["status", "in", statuses])
    if search:
        filters.append(["name", "like", f"%{search}%"])

    orders, total, statuses = await asyncio.gather(
        erpnext_get_list(
            "Sales Order",
            filters=filters,
            fields=_LIST_FIELDS,
            limit_page_length=page_size,
            limit_start=(page - 1) * page_size,
            order_by="transaction_date desc",
            use_user_token=True,
        ),
        erpnext_get_count("Sales Order", filters=filters, use_user_token=True),
        distinct_statuses(),
    )

    counts = await _item_counts([o["name"] for o in orders])
    return _shape_order_rows(orders, counts), total, statuses


def _date_range_filters(from_date: str, to_date: str, customer: str | None) -> list[Any]:
    filters: list[Any] = [["transaction_date", ">=", from_date], ["transaction_date", "<=", to_date]]
    if customer:
        filters.append(["customer", "=", customer])
    return filters


async def list_orders_in_range(from_date: str, to_date: str, *, customer: str | None = None) -> list[dict[str, Any]]:
    """Every Sales Order with transaction_date in [from_date, to_date],
    unpaginated — for report generation and analytics aggregation, not
    the paginated screen list."""
    orders = await erpnext_get_list(
        "Sales Order",
        filters=_date_range_filters(from_date, to_date, customer),
        fields=_LIST_FIELDS,
        limit_page_length=0,
        use_user_token=True,
    )
    counts = await _item_counts([o["name"] for o in orders])
    return _shape_order_rows(orders, counts)


async def _item_names_by_order(order_names: list[str]) -> dict[str, list[str]]:
    """item_name list per order — one joined child-table query per chunk,
    same technique as _item_counts. Backs the Completed Orders screen's
    "search by item name" and its per-order item summary."""
    if not order_names:
        return {}
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Sales Order",
                filters=[["name", "in", chunk]],
                fields=["name", "`tabSales Order Item`.item_name", "`tabSales Order Item`.qty"],
                limit_page_length=0,
                use_user_token=True,
            )
            for chunk in _chunk(order_names)
        ]
    )
    by_order: dict[str, list[str]] = {}
    for rows in batches:
        for row in rows:
            name = row.get("item_name")
            if not name:
                continue
            qty = float(row.get("qty") or 0)
            label = f"{name} ×{qty:g}" if qty and qty != 1 else name
            by_order.setdefault(row["name"], []).append(label)
    return by_order


# The Distributor Portal's "Completed Orders" screen shows both of these
# terminal, submitted statuses — see the "Closed folds into Completed"
# decision. "Active" is the in-progress complement.
COMPLETED_SALES_ORDER_STATUSES = ("Completed", "Closed")
ACTIVE_SALES_ORDER_STATUSES = ("To Deliver", "To Bill", "To Deliver and Bill")


async def completed_orders_summary(
    from_date: str, to_date: str, *, customer: str
) -> dict[str, Any]:
    """Completed + Closed Sales Orders for one distributor in a date range,
    each with its real line-item list, plus KPI aggregates over the set.
    Reuses list_orders_in_range for the base fetch — no new ERPNext-calling
    logic beyond the item-name join."""
    rows = sorted(
        (
            o
            for o in await list_orders_in_range(from_date, to_date, customer=customer)
            if o["status"] in COMPLETED_SALES_ORDER_STATUSES
        ),
        key=lambda o: (o.get("delivery_date") or o.get("transaction_date") or ""),
        reverse=True,
    )
    names_by_order = await _item_names_by_order([o["name"] for o in rows])

    items = [{**o, "item_names": names_by_order.get(o["name"], [])} for o in rows]
    total_value = sum(o["grand_total"] for o in rows)
    return {
        "items": items,
        "stats": {
            "total_completed": len(rows),
            "total_value": total_value,
            "avg_order_value": round(total_value / len(rows)) if rows else 0.0,
        },
    }


async def item_rollup_in_range(
    from_date: str, to_date: str, *, customer: str | None = None
) -> list[dict[str, Any]]:
    """Line items across every Sales Order in range, aggregated by
    item_code (total qty, total revenue), sorted descending by revenue.
    One joined query — same child-table-join technique as _item_counts,
    just with more columns — no per-order doc fetches."""
    rows = await erpnext_get_list(
        "Sales Order",
        filters=_date_range_filters(from_date, to_date, customer),
        fields=[
            "name",
            "`tabSales Order Item`.item_code",
            "`tabSales Order Item`.item_name",
            "`tabSales Order Item`.qty",
            "`tabSales Order Item`.amount",
        ],
        limit_page_length=0,
        use_user_token=True,
    )

    agg: dict[str, dict[str, Any]] = {}
    for row in rows:
        code = row.get("item_code")
        if not code:
            continue
        entry = agg.setdefault(code, {"item_code": code, "item_name": row.get("item_name"), "qty": 0.0, "revenue": 0.0})
        entry["qty"] += float(row.get("qty") or 0)
        entry["revenue"] += float(row.get("amount") or 0)

    return sorted(agg.values(), key=lambda e: e["revenue"], reverse=True)


async def distributor_performance_in_range(
    from_date: str, to_date: str, *, customer: str | None = None
) -> list[dict[str, Any]]:
    """Order count + total value per distributor in range, sorted
    descending by value. Shared by the Reports xlsx builder and the
    Analytics distributor-performance/turnover endpoint — one place that
    defines what "distributor performance" means."""
    orders = await list_orders_in_range(from_date, to_date, customer=customer)
    agg: dict[str, dict[str, Any]] = {}
    for o in orders:
        key = o["customer"]
        entry = agg.setdefault(
            key, {"customer": key, "distributor": o["customer_name"] or key, "order_count": 0, "total_value": 0.0}
        )
        entry["order_count"] += 1
        entry["total_value"] += o["grand_total"]
    return sorted(agg.values(), key=lambda e: e["total_value"], reverse=True)


async def first_order_dates() -> dict[str, str]:
    """Earliest transaction_date per customer, across ALL time (not date-
    limited) — one grouped query, bounded by distinct-customer count
    (~332), not order count (~5,395). Used to classify new-vs-repeat
    distributors: a customer is "new" in a range if their first-ever
    order falls on/after the range start."""
    rows = await erpnext_get_list(
        "Sales Order",
        fields=["customer", "min(transaction_date) as first_date"],
        group_by="customer",
        limit_page_length=0,
        use_user_token=True,
    )
    return {row["customer"]: row["first_date"] for row in rows if row.get("first_date")}


async def list_pending_approval_orders(customer: str) -> list[dict[str, Any]]:
    """Draft (docstatus=0) Sales Orders for one Customer — the distributor-
    approval queue. Same row shape as list_orders; `customer` is always the
    caller's own scoped id (see routers.portal), never a request value.

    Empty until Sales Person draft-order creation exists — that's expected,
    not an error state.
    """
    orders = await erpnext_get_list(
        "Sales Order",
        filters=[["customer", "=", customer], ["docstatus", "=", 0]],
        fields=_LIST_FIELDS,
        limit_page_length=0,
        order_by="transaction_date desc",
        use_user_token=True,
    )
    counts = await _item_counts([o["name"] for o in orders])
    return _shape_order_rows(orders, counts)


async def set_order_docstatus(name: str, docstatus: int, *, expected_customer: str) -> None:
    """Submit (docstatus=1) or cancel (docstatus=2) a Sales Order after
    verifying it belongs to `expected_customer` — defence in depth so a
    distributor can't act on another Customer's order by guessing its name.
    Raises ERPNextNotFoundError if it's missing or not theirs.
    """
    order = await erpnext_get_doc("Sales Order", name, use_user_token=True)
    if order.get("customer") != expected_customer:
        raise ERPNextNotFoundError(f"Sales Order {name} not found")
    await erpnext_update_doc("Sales Order", name, {"docstatus": docstatus}, use_user_token=True)


async def outstanding_for_customer(customer: str) -> dict[str, Any]:
    """Total unpaid Sales Invoice value + overdue count for one Customer.

    KNOWN GAP: the Users-scoped key currently has no Sales Invoice read
    permission at all (see module docstring), so this degrades to zeros
    with available=False rather than raising — the KPI card shows
    "unavailable" until Uteshiya grants the permission.
    """
    try:
        invoices = await erpnext_get_list(
            "Sales Invoice",
            filters=[["customer", "=", customer], ["outstanding_amount", ">", 0]],
            fields=["name", "outstanding_amount", "due_date", "status"],
            limit_page_length=0,
            use_user_token=True,
        )
    except ERPNextUnavailableError:
        return {"outstanding": 0.0, "overdue_count": 0, "available": False}

    today = date.today().isoformat()
    outstanding = sum(float(inv.get("outstanding_amount") or 0) for inv in invoices)
    overdue_count = sum(
        1
        for inv in invoices
        if inv.get("status") == "Overdue" or (inv.get("due_date") and inv["due_date"] < today)
    )
    return {"outstanding": outstanding, "overdue_count": overdue_count, "available": True}


async def _find_linked_invoice(order_name: str, customer: str) -> dict[str, Any] | None:
    """Best-effort match against Sales Invoice.items[].sales_order (the
    standard ERPNext child-row link back to the originating order) —
    unverified against real data, since the Users-scoped key currently
    has no Sales Invoice read permission at all. Any failure here
    (permission or otherwise) degrades to None rather than failing the
    whole order detail."""
    try:
        invoices = await erpnext_get_list(
            "Sales Invoice",
            filters=[["customer", "=", customer]],
            fields=["name", "status", "grand_total"],
            limit_page_length=0,
            use_user_token=True,
        )
    except ERPNextUnavailableError:
        return None

    for inv in invoices:
        try:
            inv_doc = await erpnext_get_doc("Sales Invoice", inv["name"], use_user_token=True)
        except ERPNextUnavailableError:
            continue
        if any(row.get("sales_order") == order_name for row in inv_doc.get("items", [])):
            return {
                "name": inv["name"],
                "status": inv["status"],
                "grand_total": float(inv.get("grand_total") or 0),
            }
    return None


async def get_order_detail(name: str, *, include_invoice: bool = True) -> dict[str, Any]:
    try:
        order = await erpnext_get_doc("Sales Order", name, use_user_token=True)
    except ERPNextNotFoundError:
        raise

    items = [
        {
            "item_code": row["item_code"],
            "item_name": row.get("item_name"),
            "qty": float(row.get("qty") or 0),
            "rate": float(row.get("rate") or 0),
            "amount": float(row.get("amount") or 0),
        }
        for row in order.get("items", [])
    ]
    sales_team = [
        {
            "sales_person": row["sales_person"],
            "allocated_percentage": float(row.get("allocated_percentage") or 0),
        }
        for row in order.get("sales_team", [])
    ]
    # The Distributor Portal skips this — the Users-scoped key can't read
    # Sales Invoice anyway (permission gap), and the screen shows the
    # invoice column as "Unavailable" statically.
    invoice = await _find_linked_invoice(order["name"], order["customer"]) if include_invoice else None

    return {
        "name": order["name"],
        "customer": order["customer"],
        "customer_name": order.get("customer_name"),
        "transaction_date": order.get("transaction_date"),
        "delivery_date": order.get("delivery_date"),
        "status": order["status"],
        "items": items,
        "sales_team": sales_team,
        "invoice": invoice,
    }
