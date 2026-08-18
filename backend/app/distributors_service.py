"""Read-only Distributors screen backed directly by ERPNext's Customer /
Address / Contact doctypes — no local storage, no caching. Mirrors
products_service.py's shape: one module wrapping the ERPNext calls a
list view and a detail view need.
"""

import asyncio
from typing import Any

from .erpnext_client import ERPNextNotFoundError, erpnext_get_doc, erpnext_get_list

_LIST_FIELDS = ["name", "customer_name", "customer_group", "territory", "disabled"]


async def _distinct(doctype: str, field: str) -> list[str]:
    """Distinct values for `field`, unscoped by any current filter — same
    pattern as products_service._all_categories, so filter dropdowns stay
    fully populated regardless of what's on the current result page."""
    rows = await erpnext_get_list(doctype, fields=[field], group_by=field)
    return sorted(row[field] for row in rows if row.get(field))


async def list_distributors(
    *, search: str | None = None, customer_group: str | None = None, territory: str | None = None
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    filters: list[Any] = []
    if customer_group:
        filters.append(["customer_group", "=", customer_group])
    if territory:
        filters.append(["territory", "=", territory])

    or_filters: list[Any] | None = None
    if search:
        or_filters = [["customer_name", "like", f"%{search}%"]]

    items, groups, territories = await asyncio.gather(
        erpnext_get_list("Customer", filters=filters, or_filters=or_filters, fields=_LIST_FIELDS),
        _distinct("Customer", "customer_group"),
        _distinct("Customer", "territory"),
    )
    results = [
        {
            "name": row["name"],
            "customer_name": row["customer_name"],
            "customer_group": row.get("customer_group"),
            "territory": row.get("territory"),
            "disabled": bool(row.get("disabled")),
        }
        for row in items
    ]
    return results, groups, territories


async def get_distributor_detail(name: str) -> dict[str, Any]:
    try:
        customer = await erpnext_get_doc("Customer", name)
    except ERPNextNotFoundError:
        raise

    dynamic_link_filter = [
        ["Dynamic Link", "link_doctype", "=", "Customer"],
        ["Dynamic Link", "link_name", "=", name],
    ]

    address_rows, contact_rows = await asyncio.gather(
        erpnext_get_list(
            "Address",
            filters=dynamic_link_filter,
            fields=[
                "name",
                "address_type",
                "address_line1",
                "address_line2",
                "city",
                "state",
                "country",
                "pincode",
                "is_primary_address",
                "is_shipping_address",
            ],
        ),
        erpnext_get_list(
            "Contact",
            filters=dynamic_link_filter,
            fields=["name", "first_name", "last_name", "email_id", "phone", "mobile_no"],
        ),
    )

    addresses = [
        {
            "name": row["name"],
            "address_type": row.get("address_type"),
            "address_line1": row.get("address_line1"),
            "address_line2": row.get("address_line2"),
            "city": row.get("city"),
            "state": row.get("state"),
            "country": row.get("country"),
            "pincode": row.get("pincode"),
            "is_primary_address": bool(row.get("is_primary_address")),
            "is_shipping_address": bool(row.get("is_shipping_address")),
        }
        for row in address_rows
    ]
    contacts = [
        {
            "name": row["name"],
            "first_name": row.get("first_name"),
            "last_name": row.get("last_name"),
            "email_id": row.get("email_id"),
            "phone": row.get("phone"),
            "mobile_no": row.get("mobile_no"),
        }
        for row in contact_rows
    ]

    return {
        "name": customer["name"],
        "customer_name": customer.get("customer_name"),
        "customer_group": customer.get("customer_group"),
        "territory": customer.get("territory"),
        "customer_type": customer.get("customer_type"),
        "disabled": bool(customer.get("disabled")),
        "addresses": addresses,
        "contacts": contacts,
    }
