"""Aggregations for the Analytics screen. No ERPNext calls live here —
every data fetch reuses orders_service.py's existing functions (same
reuse pattern as reports_service.py). This module's job is bucketing,
ranking, and period-comparison math on top of already-fetched rows.
"""

import asyncio
from datetime import date, timedelta
from typing import Any

from . import orders_service

_TOP_DISTRIBUTORS_LIMIT = 20
_TOP_PRODUCTS_LIMIT = 20


def _bucket_key(iso_date: str, granularity: str) -> str:
    d = date.fromisoformat(iso_date)
    if granularity == "daily":
        return iso_date
    if granularity == "weekly":
        monday = d - timedelta(days=d.weekday())
        return monday.isoformat()
    return f"{d.year:04d}-{d.month:02d}"  # monthly


async def revenue_trend(from_date: str, to_date: str, customer: str | None, granularity: str) -> dict[str, Any]:
    orders = await orders_service.list_orders_in_range(from_date, to_date, customer=customer)

    buckets: dict[str, dict[str, Any]] = {}
    for o in orders:
        key = _bucket_key(o["transaction_date"], granularity)
        entry = buckets.setdefault(key, {"bucket": key, "revenue": 0.0, "order_count": 0})
        entry["revenue"] += o["grand_total"]
        entry["order_count"] += 1
    points = sorted(buckets.values(), key=lambda e: e["bucket"])
    current_total = sum(o["grand_total"] for o in orders)

    # Equivalent immediately-preceding period, same length, for the
    # period-over-period comparison badge.
    f, t = date.fromisoformat(from_date), date.fromisoformat(to_date)
    length_days = (t - f).days + 1
    prev_to = f - timedelta(days=1)
    prev_from = prev_to - timedelta(days=length_days - 1)
    prev_orders = await orders_service.list_orders_in_range(
        prev_from.isoformat(), prev_to.isoformat(), customer=customer
    )
    previous_total = sum(o["grand_total"] for o in prev_orders)

    change_pct = round((current_total - previous_total) / previous_total * 100, 1) if previous_total > 0 else None

    return {
        "granularity": granularity,
        "points": points,
        "current_total": current_total,
        "previous_total": previous_total,
        "change_pct": change_pct,
    }


async def distributor_performance(from_date: str, to_date: str, customer: str | None) -> dict[str, Any]:
    """Backs both the Top 10 Distributors bar chart and the Turnover
    treemap — same ranked dataset, the frontend just renders it two ways.
    Capped at the top 20 individually plus one "Others" bucket, so the
    treemap stays legible with 300+ real distributors in the data."""
    ranked = await orders_service.distributor_performance_in_range(from_date, to_date, customer=customer)
    total_value = sum(r["total_value"] for r in ranked)

    def _share(value: float) -> float:
        return round(value / total_value * 100, 1) if total_value else 0.0

    top = ranked[:_TOP_DISTRIBUTORS_LIMIT]
    rest = ranked[_TOP_DISTRIBUTORS_LIMIT:]

    items = [
        {
            "distributor": r["distributor"],
            "customer": r["customer"],
            "order_count": r["order_count"],
            "total_value": r["total_value"],
            "revenue_share_pct": _share(r["total_value"]),
        }
        for r in top
    ]
    if rest:
        rest_value = sum(r["total_value"] for r in rest)
        items.append(
            {
                "distributor": "Others",
                "customer": None,
                "order_count": sum(r["order_count"] for r in rest),
                "total_value": rest_value,
                "revenue_share_pct": _share(rest_value),
            }
        )

    return {"items": items, "total_value": total_value}


async def top_products(from_date: str, to_date: str, customer: str | None) -> dict[str, Any]:
    """Top 20 by revenue, unioned with top 20 by qty (deduplicated) — not
    truncated to a flat top 10, so the frontend's revenue/qty toggle is
    correct either way without a second round trip. A real range can have
    thousands of distinct items ordered (3,283 in one 3-month check), so
    returning the full rollup would ship ~100x more than either toggle
    view ever shows; this keeps the payload small without limiting either
    ranking to a single metric's top slice."""
    rollup = await orders_service.item_rollup_in_range(from_date, to_date, customer=customer)
    by_qty = sorted(rollup, key=lambda e: e["qty"], reverse=True)[:_TOP_PRODUCTS_LIMIT]
    by_revenue = rollup[:_TOP_PRODUCTS_LIMIT]  # already sorted by revenue desc

    merged: dict[str, dict[str, Any]] = {e["item_code"]: e for e in by_revenue}
    for e in by_qty:
        merged.setdefault(e["item_code"], e)

    items = sorted(merged.values(), key=lambda e: e["revenue"], reverse=True)
    return {"items": items}


async def order_fulfillment(from_date: str, to_date: str, customer: str | None, granularity: str) -> dict[str, Any]:
    orders, statuses = await asyncio.gather(
        orders_service.list_orders_in_range(from_date, to_date, customer=customer),
        orders_service.distinct_statuses(),
    )

    totals: dict[str, int] = dict.fromkeys(statuses, 0)
    buckets: dict[str, dict[str, int]] = {}
    for o in orders:
        s = o["status"]
        totals[s] = totals.get(s, 0) + 1
        key = _bucket_key(o["transaction_date"], granularity)
        bucket = buckets.setdefault(key, dict.fromkeys(statuses, 0))
        bucket[s] = bucket.get(s, 0) + 1

    trend = [{"bucket": key, **counts} for key, counts in sorted(buckets.items())]
    totals_list = [{"status": s, "count": c} for s, c in totals.items()]

    # Mean (delivery_date - transaction_date) in days, over orders with
    # both dates set — reuses the same `orders` already fetched above, no
    # extra ERPNext call. "Planned" because we have no real delivery-
    # completion timestamp, only the two dates ERPNext records on the order.
    lead_times = [
        (date.fromisoformat(o["delivery_date"]) - date.fromisoformat(o["transaction_date"])).days
        for o in orders
        if o.get("delivery_date") and o.get("transaction_date")
    ]
    avg_lead_time_days = round(sum(lead_times) / len(lead_times), 1) if lead_times else None

    return {
        "totals": totals_list,
        "granularity": granularity,
        "trend": trend,
        "avg_lead_time_days": avg_lead_time_days,
    }


async def distributor_cohort(from_date: str, to_date: str, customer: str | None) -> dict[str, Any]:
    """A distributor is "new" in this range if their earliest-ever order
    (any range) falls on/after this range's start date; otherwise
    they're a repeat customer this period."""
    orders, first_dates = await asyncio.gather(
        orders_service.list_orders_in_range(from_date, to_date, customer=customer),
        orders_service.first_order_dates(),
    )
    active_customers = {o["customer"] for o in orders}

    new_count = 0
    repeat_count = 0
    for cust in active_customers:
        first = first_dates.get(cust)
        if first is not None and first >= from_date:
            new_count += 1
        else:
            repeat_count += 1

    return {"new_count": new_count, "repeat_count": repeat_count}
