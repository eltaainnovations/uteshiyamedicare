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


async def _stock_by_item_code(item_codes: list[str]) -> dict[str, int]:
    """Sum Bin.actual_qty across warehouses, per item_code."""
    if not item_codes:
        return {}
    totals: dict[str, int] = dict.fromkeys(item_codes, 0)
    batches = await asyncio.gather(
        *[
            erpnext_get_list(
                "Bin", filters=[["item_code", "in", chunk]], fields=["item_code", "actual_qty"], limit_page_length=0
            )
            for chunk in _chunk(item_codes)
        ]
    )
    for bins in batches:
        for row in bins:
            totals[row["item_code"]] = totals.get(row["item_code"], 0) + int(row.get("actual_qty") or 0)
    return totals


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
            fields=["item_code", "item_name", "item_group", "has_variants"],
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
        return [], total, categories

    template_codes = [i["item_code"] for i in items if i.get("has_variants")]
    variants_by_template = await _variant_codes_by_template(template_codes)

    lookup_codes: set[str] = set()
    for item in items:
        code = item["item_code"]
        if item.get("has_variants"):
            lookup_codes.update(variants_by_template.get(code, []))
        else:
            lookup_codes.add(code)
    lookup_codes_list = list(lookup_codes)

    stock_map, price_map = await asyncio.gather(
        _stock_by_item_code(lookup_codes_list),
        _lowest_selling_price_by_item_code(lookup_codes_list),
    )

    results: list[dict[str, Any]] = []
    for item in items:
        code = item["item_code"]
        rollup_codes = variants_by_template.get(code, []) if item.get("has_variants") else [code]
        prices = [price_map[c] for c in rollup_codes if c in price_map]
        results.append(
            {
                "item_code": code,
                "item_name": item["item_name"],
                "item_group": item["item_group"],
                "has_variants": bool(item.get("has_variants")),
                "total_stock": sum(stock_map.get(c, 0) for c in rollup_codes),
                "from_price": min(prices) if prices else None,
            }
        )
    return results, total, categories


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
