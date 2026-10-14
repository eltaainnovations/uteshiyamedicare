"""Read-only Product Catalogue backed directly by ERPNext — no local
storage, no caching. Every call here goes out to ERPNext live via the
catalogue-scoped token in erpnext_client.py.

Stock and price rollups are each computed by exactly one helper
(_stock_by_item_code / _lowest_selling_price_by_item_code) and reused by
both list_products and get_product_detail, so the two endpoints can never
disagree on how a number was derived.
"""

import asyncio
from typing import Any

from .erpnext_client import ERPNextNotFoundError, erpnext_get_doc, erpnext_get_list

# (erp_field, display label) for fields worth surfacing as "Specifications"
# when ERPNext actually has a value for them on a given item. Deliberately
# not a hardcoded per-product spec table — nothing here is item-specific,
# it's just "which standard Item fields count as a spec if populated".
_SPEC_FIELDS: list[tuple[str, str]] = [
    ("gst_hsn_code", "HS Code"),
    ("country_of_origin", "Country of Origin"),
    ("stock_uom", "Unit of Measure"),
    ("weight_per_unit", "Weight per Unit"),
    ("shelf_life_in_days", "Shelf Life (days)"),
]


def _extract_specifications(item: dict[str, Any]) -> list[dict[str, str]]:
    specs: list[dict[str, str]] = []
    for field, label in _SPEC_FIELDS:
        value = item.get(field)
        if value in (None, "", 0, 0.0):
            continue
        specs.append({"key": label, "value": str(value)})
    if item.get("has_batch_no"):
        specs.append({"key": "Batch Tracked", "value": "Yes"})
    if item.get("has_serial_no"):
        specs.append({"key": "Serial Tracked", "value": "Yes"})
    return specs


def _extract_attributes(item: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {"attribute": row["attribute"], "value": row.get("attribute_value") or ""}
        for row in item.get("attributes") or []
    ]


# Keeps `item_code in [...]` filters (JSON-encoded into the query string)
# well clear of nginx's request-URI length limit. Hit in practice at
# page_size=100+ once enough long item_codes piled into one "in" filter —
# ERPNext returned a bare 414 before it ever reached application code.
# Chunking trades one big request for several small ones run concurrently.
_BATCH_SIZE = 30


def _chunk(codes: list[str], size: int = _BATCH_SIZE) -> list[list[str]]:
    return [codes[i : i + size] for i in range(0, len(codes), size)]


async def _stock_by_item_code(item_codes: list[str], *, field: str = "actual_qty") -> dict[str, int]:
    """Sum a Bin quantity column across warehouses, per item_code.

    `field` defaults to actual_qty (on-hand, used by the Admin catalogue);
    the Distributor catalogue passes projected_qty (on-hand + inbound −
    reserved − outbound), the number a distributor actually cares about
    when deciding whether they can order.
    """
    if not item_codes:
        return {}
    totals: dict[str, int] = dict.fromkeys(item_codes, 0)
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Bin", filters=[["item_code", "in", chunk]], fields=["item_code", field], limit_page_length=0
            )
            for chunk in _chunk(item_codes)
        ]
    )
    for bins in batches:
        for row in bins:
            totals[row["item_code"]] = totals.get(row["item_code"], 0) + int(row.get(field) or 0)
    return totals


# A distributor-facing "Low Stock" cutoff. Deliberately a fixed constant,
# not configurable — a distributor-tunable alert threshold against real Bin
# data is a separate, scoped follow-up (same one the dashboard's dropped
# Inventory Value KPI is waiting on).
STOCK_LOW_THRESHOLD = 10


def stock_status(total: int) -> str:
    """`total` is a raw projected_qty sum and CAN be negative (ERPNext
    nets reserved / committed qty against on-hand) — anything <= 0 is
    simply Out of Stock to a distributor."""
    if total <= 0:
        return "out_of_stock"
    if total < STOCK_LOW_THRESHOLD:
        return "low_stock"
    return "in_stock"


async def _scoped_prices_by_item_code(
    item_codes: list[str], *, customer: str
) -> dict[str, dict[str, float | None]]:
    """Per item_code: {"price": customer-specific lowest selling rate or None,
    "list_price": general (no-customer) lowest selling rate or None}.

    This is the one genuinely new pricing rule for the Distributor
    Portal — an ERPNext-native customer-specific Item Price wins, with the
    general price-list rate as the fallback the frontend also shows struck
    through. (On this ERPNext instance no customer-specific Item Price rows
    exist yet, so `price` currently always falls back to `list_price`; the
    lookup is still wired so it just works if Uteshiya adds them.)
    """
    if not item_codes:
        return {}
    general: dict[str, float] = {}
    scoped: dict[str, float] = {}

    def _absorb(target: dict[str, float], rows: list[dict[str, Any]]) -> None:
        for row in rows:
            code = row["item_code"]
            rate = float(row.get("price_list_rate") or 0)
            if code not in target or rate < target[code]:
                target[code] = rate

    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Item Price",
                filters=[["item_code", "in", chunk], ["selling", "=", 1], ["customer", "is", "not set"]],
                fields=["item_code", "price_list_rate"],
                limit_page_length=0,
            )
            for chunk in _chunk(item_codes)
        ],
        *[
            erpnext_get_list(
                "Item Price",
                filters=[["item_code", "in", chunk], ["selling", "=", 1], ["customer", "=", customer]],
                fields=["item_code", "price_list_rate"],
                limit_page_length=0,
            )
            for chunk in _chunk(item_codes)
        ],
    )
    half = len(batches) // 2
    for rows in batches[:half]:
        _absorb(general, rows)
    for rows in batches[half:]:
        _absorb(scoped, rows)

    return {
        code: {"price": scoped.get(code, general.get(code)), "list_price": general.get(code)}
        for code in item_codes
    }


async def _lowest_selling_price_by_item_code(item_codes: list[str]) -> dict[str, float]:
    """Lowest active selling Item Price, per item_code."""
    if not item_codes:
        return {}
    lowest: dict[str, float] = {}
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Item Price",
                filters=[["item_code", "in", chunk], ["selling", "=", 1]],
                fields=["item_code", "price_list_rate"],
                limit_page_length=0,
            )
            for chunk in _chunk(item_codes)
        ]
    )
    for prices in batches:
        for row in prices:
            code = row["item_code"]
            rate = float(row.get("price_list_rate") or 0)
            if code not in lowest or rate < lowest[code]:
                lowest[code] = rate
    return lowest


async def _attributes_by_item_code(item_codes: list[str]) -> dict[str, list[dict[str, str]]]:
    """Bulk variant attributes, per item_code, in a single call.

    Frappe's REST API refuses to list the "Item Variant Attribute" child
    doctype directly for more than one parent at a time (its
    check_parent_permission rejects an `in` filter on `parent`). Joining
    the child table onto the Item list endpoint via a raw `` `tab...`.field ``
    field name sidesteps that and returns every variant's attributes in one
    round trip instead of one erpnext_get_doc call per variant.
    """
    if not item_codes:
        return {}
    by_code: dict[str, list[dict[str, str]]] = {}
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Item",
                filters=[["item_code", "in", chunk]],
                fields=[
                    "item_code",
                    "`tabItem Variant Attribute`.attribute",
                    "`tabItem Variant Attribute`.attribute_value",
                ],
                limit_page_length=0,
            )
            for chunk in _chunk(item_codes)
        ]
    )
    for rows in batches:
        for row in rows:
            attribute = row.get("attribute")
            if not attribute:
                continue
            by_code.setdefault(row["item_code"], []).append(
                {"attribute": attribute, "value": row.get("attribute_value") or ""}
            )
    return by_code


async def _variant_codes_by_template(template_codes: list[str]) -> dict[str, list[str]]:
    if not template_codes:
        return {}
    by_template: dict[str, list[str]] = {}
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Item",
                filters=[["variant_of", "in", chunk]],
                fields=["item_code", "variant_of"],
                limit_page_length=0,
            )
            for chunk in _chunk(template_codes)
        ]
    )
    for rows in batches:
        for row in rows:
            by_template.setdefault(row["variant_of"], []).append(row["item_code"])
    return by_template


async def _all_categories() -> list[str]:
    """Distinct item_group values across every top-level item — deliberately
    unscoped by the current search/category filter, so the pill list stays
    complete and stable no matter what page or filter is active. With 8,256
    products behind pagination, deriving this from "whatever's on the
    current page" (the original approach) would show only a handful of the
    ~19 real categories.
    """
    rows = await erpnext_get_list(
        "Item",
        filters=[["variant_of", "is", "not set"]],
        fields=["item_group"],
        group_by="item_group",
        limit_page_length=0,
    )
    return sorted(row["item_group"] for row in rows if row.get("item_group"))


def _rollup_codes(item: dict[str, Any], variants_by_template: dict[str, list[str]]) -> list[str]:
    """The item_codes that carry the real stock/price for a listing row: a
    template's variant codes, or a standalone item's own code."""
    if item.get("has_variants"):
        return variants_by_template.get(item["item_code"], [])
    return [item["item_code"]]


async def _fetch_top_level_page(
    *,
    search: str | None,
    category: str | None,
    active_only: bool,
    page: int,
    page_size: int,
    extra_fields: tuple[str, ...] = (),
) -> tuple[list[dict[str, Any]], int, list[str], dict[str, list[str]]]:
    """Shared page fetch for both the Admin and Distributor catalogues:
    top-level Item rows + total + full category list + each template's
    variant codes. The only thing the two callers do differently is how
    they resolve stock and price on top of this."""
    filters: list[Any] = [["variant_of", "is", "not set"]]
    if category:
        filters.append(["item_group", "=", category])
    if active_only:
        filters.append(["disabled", "=", 0])

    or_filters: list[Any] | None = None
    if search:
        or_filters = [["item_code", "like", f"%{search}%"], ["item_name", "like", f"%{search}%"]]

    items, count_rows, categories = await asyncio.gather(
        erpnext_get_list(
            "Item",
            filters=filters,
            or_filters=or_filters,
            fields=["item_code", "item_name", "item_group", "has_variants", *extra_fields],
            limit_page_length=page_size,
            limit_start=(page - 1) * page_size,
        ),
        erpnext_get_list(
            "Item",
            filters=filters,
            or_filters=or_filters,
            fields=["count(name) as total_count"],
        ),
        _all_categories(),
    )
    total = count_rows[0]["total_count"] if count_rows else 0
    if not items:
        return [], total, categories, {}

    template_codes = [i["item_code"] for i in items if i.get("has_variants")]
    variants_by_template = await _variant_codes_by_template(template_codes)
    return items, total, categories, variants_by_template


async def list_products(
    *,
    search: str | None = None,
    category: str | None = None,
    active_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Top-level items only (templates + standalone items) — variant rows
    never appear directly in this list. Returns (items, total_matching,
    categories) — total_matching is scoped to the same search/category/
    active_only filters as the page itself, so pagination stays correct as
    filters change; categories is always the full unscoped list (see
    _all_categories). active_only is used by the Admin Dashboard's
    "Active Products" KPI (page_size=20, items discarded, just .total).
    """
    items, total, categories, variants_by_template = await _fetch_top_level_page(
        search=search, category=category, active_only=active_only, page=page, page_size=page_size
    )
    if not items:
        return [], total, categories

    lookup_codes_list = list({c for item in items for c in _rollup_codes(item, variants_by_template)})
    stock_map, price_map = await asyncio.gather(
        _stock_by_item_code(lookup_codes_list),
        _lowest_selling_price_by_item_code(lookup_codes_list),
    )

    results: list[dict[str, Any]] = []
    for item in items:
        rollup_codes = _rollup_codes(item, variants_by_template)
        prices = [price_map[c] for c in rollup_codes if c in price_map]
        results.append(
            {
                "item_code": item["item_code"],
                "item_name": item["item_name"],
                "item_group": item["item_group"],
                "has_variants": bool(item.get("has_variants")),
                "total_stock": sum(stock_map.get(c, 0) for c in rollup_codes),
                "from_price": min(prices) if prices else None,
            }
        )
    return results, total, categories


async def list_distributor_products(
    *,
    customer: str,
    search: str | None = None,
    category: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict[str, Any]], int, list[str]]:
    """Distributor-facing catalogue page. Same top-level Item fetch as
    list_products (via _fetch_top_level_page), but stock is Bin.projected_qty
    and price is resolved customer-first (see _scoped_prices_by_item_code).
    `price`/`list_price` on a template row are the lowest across its
    variants — the "from" price the card shows."""
    items, total, categories, variants_by_template = await _fetch_top_level_page(
        search=search, category=category, active_only=False, page=page, page_size=page_size, extra_fields=("image",)
    )
    if not items:
        return [], total, categories

    lookup_codes_list = list({c for item in items for c in _rollup_codes(item, variants_by_template)})
    stock_map, price_map = await asyncio.gather(
        _stock_by_item_code(lookup_codes_list, field="projected_qty"),
        _scoped_prices_by_item_code(lookup_codes_list, customer=customer),
    )

    results: list[dict[str, Any]] = []
    for item in items:
        rollup_codes = _rollup_codes(item, variants_by_template)
        prices = [price_map[c]["price"] for c in rollup_codes if price_map.get(c, {}).get("price") is not None]
        list_prices = [
            price_map[c]["list_price"] for c in rollup_codes if price_map.get(c, {}).get("list_price") is not None
        ]
        raw_stock = sum(stock_map.get(c, 0) for c in rollup_codes)
        results.append(
            {
                "item_code": item["item_code"],
                "item_name": item["item_name"],
                "item_group": item["item_group"],
                "has_variants": bool(item.get("has_variants")),
                "image": item.get("image") or None,
                "total_stock": max(0, raw_stock),  # negative projected_qty reads as 0 to a shopper
                "stock_status": stock_status(raw_stock),
                "price": min(prices) if prices else None,
                "list_price": min(list_prices) if list_prices else None,
            }
        )
    return results, total, categories


async def list_distributor_variants(item_code: str, *, customer: str) -> dict[str, Any]:
    """Per-variant rows for one template (or the single row for a standalone
    item), with the same projected-stock + customer-scoped price resolution
    as list_distributor_products. Reuses the same variant_of lookup and
    bulk-attributes join get_product_detail uses."""
    item = await erpnext_get_doc("Item", item_code)

    variant_rows: list[dict[str, Any]] = []
    if item.get("has_variants"):
        variant_rows = await erpnext_get_list(
            "Item",
            filters=[["variant_of", "=", item_code]],
            fields=["item_code", "item_name"],
            limit_page_length=0,
        )
    variant_codes = [v["item_code"] for v in variant_rows] if variant_rows else [item_code]

    stock_map, price_map, attrs_map = await asyncio.gather(
        _stock_by_item_code(variant_codes, field="projected_qty"),
        _scoped_prices_by_item_code(variant_codes, customer=customer),
        _attributes_by_item_code(variant_codes) if variant_rows else asyncio.sleep(0, result={}),
    )

    source = variant_rows or [{"item_code": item_code, "item_name": item.get("item_name")}]
    variants: list[dict[str, Any]] = []
    for row in source:
        code = row["item_code"]
        raw_stock = stock_map.get(code, 0)
        p = price_map.get(code, {"price": None, "list_price": None})
        variants.append(
            {
                "item_code": code,
                "item_name": row["item_name"],
                "total_stock": max(0, raw_stock),
                "stock_status": stock_status(raw_stock),
                "price": p["price"],
                "list_price": p["list_price"],
                "attributes": attrs_map.get(code) or ([] if variant_rows else _extract_attributes(item)),
            }
        )

    return {
        "item_code": item["item_code"],
        "item_name": item.get("item_name"),
        "has_variants": bool(item.get("has_variants")),
        "image": item.get("image") or None,
        "variants": variants,
    }


async def get_product_detail(item_code: str) -> dict[str, Any]:
    try:
        item = await erpnext_get_doc("Item", item_code)
    except ERPNextNotFoundError:
        raise

    variant_rows: list[dict[str, Any]] = []
    if item.get("has_variants"):
        variant_rows = await erpnext_get_list(
            "Item",
            filters=[["variant_of", "=", item_code]],
            fields=["item_code", "item_name"],
            limit_page_length=0,
        )

    # A template has no stock/price of its own — its variants carry both.
    # A standalone item (no variants) is treated as its own single variant.
    variant_codes = [v["item_code"] for v in variant_rows] if variant_rows else [item_code]

    # Independent bulk lookups — run concurrently rather than one
    # erpnext_get_doc round trip per variant (that was the ~20s-for-5-
    # variants slowdown: N sequential full-document fetches just to read
    # each variant's attributes).
    stock_map, price_map, attrs_map = await asyncio.gather(
        _stock_by_item_code(variant_codes),
        _lowest_selling_price_by_item_code(variant_codes),
        _attributes_by_item_code(variant_codes) if variant_rows else asyncio.sleep(0, result={}),
    )

    variants: list[dict[str, Any]] = []
    if variant_rows:
        for row in variant_rows:
            code = row["item_code"]
            variants.append(
                {
                    "item_code": code,
                    "item_name": row["item_name"],
                    "stock": stock_map.get(code, 0),
                    "price": price_map.get(code),
                    "attributes": attrs_map.get(code, []),
                }
            )
    else:
        variants.append(
            {
                "item_code": item_code,
                "item_name": item.get("item_name"),
                "stock": stock_map.get(item_code, 0),
                "price": price_map.get(item_code),
                "attributes": _extract_attributes(item),
            }
        )

    return {
        "item_code": item["item_code"],
        "item_name": item.get("item_name"),
        "item_group": item.get("item_group"),
        "description": item.get("description"),
        "image": item.get("image"),
        "has_variants": bool(item.get("has_variants")),
        "variants": variants,
        "specifications": _extract_specifications(item),
    }
