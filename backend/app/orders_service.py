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
from typing import Any

from .erpnext_client import ERPNextNotFoundError, ERPNextUnavailableError, erpnext_get_count, erpnext_get_doc, erpnext_get_list

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
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], int, list[str]]:
    filters: list[Any] = []
    if customer:
        filters.append(["customer", "=", customer])
    if status:
        filters.append(["status", "=", status])
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


async def get_order_detail(name: str) -> dict[str, Any]:
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
    invoice = await _find_linked_invoice(order["name"], order["customer"])

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
