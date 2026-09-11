"""Distributor Portal endpoints — everything here is scoped to the caller's
own linked ERPNext Customer via get_current_distributor. The `customer`
passed into the orders/analytics service functions always comes from the
caller's JWT-derived scope, never from a request parameter, so there is no
path by which a distributor can read or act on another Customer's data.

No new ERPNext-calling logic lives here: the dashboard reuses
analytics_service / orders_service / distributors_service functions that
the Admin screens already use, and the catalogue reuses
products_service's shared page fetch — every endpoint just pins `customer`
to the scope. The Portal-specific additions are the draft-Sales-Order
approval queue + submit/cancel actions, and the customer-scoped
price / projected-stock resolution on the catalogue (both live in the
respective service modules, not here).
"""

import asyncio
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import (
    analytics_service,
    distributors_service,
    end_user_records_service,
    inventory_service,
    maruti_service,
    orders_service,
    products_service,
)
from ..auth_service import PortalUser
from ..deps import DistributorScope, get_current_distributor, get_current_user
from ..erpnext_client import ERPNextNotFoundError, ERPNextUnavailableError
from ..maruti_client import MarutiAuthError, MarutiUnavailableError
from ..schemas import (
    EndUserRecordCreate,
    EndUserRecordFeedbackUpdate,
    EndUserRecordListResponse,
    EndUserRecordOut,
    MessageResponse,
    OrderDetailOut,
    OrderListItem,
    OrderListResponse,
    PortalCompletedOrderItem,
    PortalCompletedOrdersResponse,
    PortalCompletedOrdersStats,
    PortalDashboardOut,
    PortalInventoryItem,
    PortalInventoryResponse,
    PortalKpis,
    PortalOrderActionResponse,
    PortalProductListItem,
    PortalProductListResponse,
    PortalProductVariantsOut,
    PortalReorderLine,
    PortalReorderResponse,
    PortalStatusSlice,
    PortalThresholdUpdate,
    PortalTopProduct,
    PortalTrendPoint,
    PortalWelcome,
    TrackShipmentOut,
)

router = APIRouter(prefix="/portal", tags=["portal"])

_DASHBOARD_TOP_PRODUCTS = 5


def _scoped_customer(scope: DistributorScope) -> str:
    """The single Customer id every call in this module is scoped to.

    Today a distributor has exactly one and a sales person's list also
    holds one (see auth_service TODO). Multi-distributor sales-person
    aggregation is a follow-up — until then the first id is the scope.
    """
    return scope.distributor_ids[0]


def _trailing_12_months() -> tuple[str, str]:
    today = date.today()
    start = today.replace(year=today.year - 1) + timedelta(days=1)
    return start.isoformat(), today.isoformat()


@router.get("/dashboard", response_model=PortalDashboardOut)
async def dashboard(
    scope: DistributorScope = Depends(get_current_distributor),
    current: tuple[PortalUser, str] = Depends(get_current_user),
) -> PortalDashboardOut:
    customer = _scoped_customer(scope)
    await inventory_service.sync_inventory_credits(customer)
    from_date, to_date = _trailing_12_months()

    try:
        revenue, fulfillment, top_products, pending_value, outstanding, company = await asyncio.gather(
            analytics_service.revenue_trend(from_date, to_date, customer, "monthly"),
            analytics_service.order_fulfillment(from_date, to_date, customer, "monthly"),
            analytics_service.top_products(from_date, to_date, customer),
            analytics_service.pending_order_value(from_date, to_date, customer),
            orders_service.outstanding_for_customer(customer),
            distributors_service.get_customer_name(customer),
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    totals = {row["status"]: row["count"] for row in fulfillment["totals"]}
    graded_total = sum(totals.values())
    completed = totals.get("Completed", 0)
    pending = sum(totals.get(s, 0) for s in analytics_service.PENDING_STATUSES)

    kpis = PortalKpis(
        total_orders=sum(p["order_count"] for p in revenue["points"]),
        pending_orders=pending,
        pending_value=pending_value,
        completed_orders=completed,
        fulfillment_pct=round(completed / graded_total * 100, 1) if graded_total else None,
        total_purchase_value=revenue["current_total"],
        outstanding_amount=outstanding["outstanding"],
        overdue_invoice_count=outstanding["overdue_count"],
        outstanding_available=outstanding["available"],
    )

    return PortalDashboardOut(
        welcome=PortalWelcome(name=current[0].name, company=company, customer_id=customer),
        kpis=kpis,
        monthly_trend=[
            PortalTrendPoint(bucket=p["bucket"], value=p["revenue"], orders=p["order_count"])
            for p in revenue["points"]
        ],
        order_status=[PortalStatusSlice(status=row["status"], count=row["count"]) for row in fulfillment["totals"]],
        top_products=[
            PortalTopProduct(
                item_code=p["item_code"], item_name=p["item_name"], qty=p["qty"], revenue=p["revenue"]
            )
            for p in top_products["items"][:_DASHBOARD_TOP_PRODUCTS]
        ],
    )


@router.get("/profile", response_model=PortalWelcome)
async def profile(
    scope: DistributorScope = Depends(get_current_distributor),
    current: tuple[PortalUser, str] = Depends(get_current_user),
) -> PortalWelcome:
    """Display-only identity for the Distributor Profile screen — same
    {name, company, customer_id} shape /portal/dashboard already builds,
    reusing the same distributors_service lookup, just without the
    dashboard's KPI/chart calls."""
    customer = _scoped_customer(scope)
    try:
        company = await distributors_service.get_customer_name(customer)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return PortalWelcome(name=current[0].name, company=company, customer_id=customer)


@router.get("/orders", response_model=OrderListResponse)
async def list_orders(
    search: str | None = Query(default=None, description="Matches order name"),
    status_: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    scope: DistributorScope = Depends(get_current_distributor),
) -> OrderListResponse:
    """Scoped Sales Order list — reuses orders_service.list_orders with
    `customer` pinned to the caller's scope. Backs the dashboard's Recent
    Orders section and (later) the Active/Completed Orders screens."""
    customer = _scoped_customer(scope)
    await inventory_service.sync_inventory_credits(customer)
    try:
        rows, total, statuses = await orders_service.list_orders(
            search=search, customer=customer, status=status_, page=page, page_size=page_size
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return OrderListResponse(
        items=[OrderListItem(**row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        statuses=statuses,
    )


@router.get("/orders/pending-approval", response_model=list[OrderListItem])
async def pending_approval(
    scope: DistributorScope = Depends(get_current_distributor),
) -> list[OrderListItem]:
    """Draft Sales Orders (docstatus=0) awaiting this distributor's
    approval. Empty until Sales Person draft-order creation is built —
    expected, not an error."""
    try:
        rows = await orders_service.list_pending_approval_orders(_scoped_customer(scope))
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return [OrderListItem(**row) for row in rows]


@router.get("/orders/active", response_model=OrderListResponse)
async def active_orders(
    search: str | None = Query(default=None, description="Matches order name"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    scope: DistributorScope = Depends(get_current_distributor),
) -> OrderListResponse:
    """Submitted, in-progress Sales Orders (To Deliver / To Bill / To
    Deliver and Bill) — reuses orders_service.list_orders with the
    `statuses` bucket filter."""
    try:
        rows, total, statuses = await orders_service.list_orders(
            search=search,
            customer=_scoped_customer(scope),
            statuses=list(orders_service.ACTIVE_SALES_ORDER_STATUSES),
            page=page,
            page_size=page_size,
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return OrderListResponse(
        items=[OrderListItem(**row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        statuses=statuses,
    )


@router.get("/orders/completed", response_model=PortalCompletedOrdersResponse)
async def completed_orders(
    from_date: date,
    to_date: date,
    scope: DistributorScope = Depends(get_current_distributor),
) -> PortalCompletedOrdersResponse:
    """Completed + Closed Sales Orders in the date range, each with its
    real line-item list, plus KPI aggregates over the set. Same
    from_date/to_date param pattern as the Analytics endpoints."""
    try:
        data = await orders_service.completed_orders_summary(
            str(from_date), str(to_date), customer=_scoped_customer(scope)
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return PortalCompletedOrdersResponse(
        items=[PortalCompletedOrderItem(**row) for row in data["items"]],
        stats=PortalCompletedOrdersStats(**data["stats"]),
    )


async def _scoped_order_detail(name: str, scope: DistributorScope) -> dict:
    """get_order_detail + the same customer-ownership check set_order_docstatus
    does — a distributor can only ever open their own orders."""
    try:
        data = await orders_service.get_order_detail(name, include_invoice=False)
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Order not found") from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if data["customer"] != _scoped_customer(scope):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Order not found")
    return data


async def _set_docstatus(name: str, docstatus: int, scope: DistributorScope, verb: str) -> PortalOrderActionResponse:
    try:
        await orders_service.set_order_docstatus(name, docstatus, expected_customer=_scoped_customer(scope))
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Order not found") from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return PortalOrderActionResponse(name=name, docstatus=docstatus, detail=f"Order {verb}")


@router.put("/orders/{name:path}/approve", response_model=PortalOrderActionResponse)
async def approve_order(
    name: str, scope: DistributorScope = Depends(get_current_distributor)
) -> PortalOrderActionResponse:
    """Submit the draft Sales Order (docstatus 0 -> 1)."""
    return await _set_docstatus(name, 1, scope, "approved")


@router.put("/orders/{name:path}/reject", response_model=PortalOrderActionResponse)
async def reject_order(
    name: str, scope: DistributorScope = Depends(get_current_distributor)
) -> PortalOrderActionResponse:
    """Cancel the draft Sales Order (docstatus -> 2)."""
    return await _set_docstatus(name, 2, scope, "rejected")


@router.put("/orders/{name:path}/cancel", response_model=PortalOrderActionResponse)
async def cancel_order(
    name: str, scope: DistributorScope = Depends(get_current_distributor)
) -> PortalOrderActionResponse:
    """Cancel a submitted, in-progress Sales Order (docstatus 1 -> 2) —
    the exact set_order_docstatus PUT the Dashboard's Reject uses. ERPNext
    rejects the cancel (502 with its message) if the order has linked
    submitted Delivery Notes / Invoices."""
    return await _set_docstatus(name, 2, scope, "cancelled")


@router.get("/orders/{name:path}/reorder", response_model=PortalReorderResponse)
async def reorder_items(
    name: str, scope: DistributorScope = Depends(get_current_distributor)
) -> PortalReorderResponse:
    """This order's real line items with their CURRENT customer-resolved
    catalogue price — the frontend adds these to the existing cart."""
    customer = _scoped_customer(scope)
    data = await _scoped_order_detail(name, scope)
    codes = [i["item_code"] for i in data["items"]]
    try:
        price_map = await products_service._scoped_prices_by_item_code(codes, customer=customer)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return PortalReorderResponse(
        order_name=data["name"],
        items=[
            PortalReorderLine(
                item_code=i["item_code"],
                item_name=i["item_name"],
                quantity=i["qty"],
                price=price_map.get(i["item_code"], {}).get("price"),
            )
            for i in data["items"]
        ],
    )


@router.get("/orders/{name:path}", response_model=OrderDetailOut)
async def order_detail(
    name: str, scope: DistributorScope = Depends(get_current_distributor)
) -> OrderDetailOut:
    """Full detail for one of this distributor's orders — backs both the
    Active Orders and Completed Orders detail views."""
    return OrderDetailOut(**await _scoped_order_detail(name, scope))


# --- Distributor Product Catalogue --------------------------------------

_CATALOGUE_PAGE_SIZES = (20, 50, 100, 200)


@router.get("/products", response_model=PortalProductListResponse)
async def list_products(
    search: str | None = Query(default=None, description="Matches item_code or item_name"),
    category: str | None = Query(default=None, description="item_group to filter by"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20),
    scope: DistributorScope = Depends(get_current_distributor),
) -> PortalProductListResponse:
    """Distributor-facing catalogue: top-level products (reusing
    products_service's shared page fetch) with price resolved customer-first
    and stock summed from Bin.projected_qty. Sort is client-side in the
    frontend (price isn't an Item column, so it can't be an ERPNext
    order_by anyway)."""
    if page_size not in _CATALOGUE_PAGE_SIZES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"page_size must be one of {_CATALOGUE_PAGE_SIZES}"
        )
    try:
        rows, total, categories = await products_service.list_distributor_products(
            customer=_scoped_customer(scope), search=search, category=category, page=page, page_size=page_size
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return PortalProductListResponse(
        items=[PortalProductListItem(**row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        categories=categories,
    )


@router.get("/products/{item_code:path}/variants", response_model=PortalProductVariantsOut)
async def product_variants(
    item_code: str, scope: DistributorScope = Depends(get_current_distributor)
) -> PortalProductVariantsOut:
    """Per-variant rows for one catalogue product, with the same
    customer-scoped price / projected-stock resolution as /portal/products."""
    try:
        data = await products_service.list_distributor_variants(item_code, customer=_scoped_customer(scope))
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found") from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return PortalProductVariantsOut(**data)


# --- Distributor Inventory Ledger --------------------------------------

@router.get("/inventory", response_model=PortalInventoryResponse)
async def inventory(scope: DistributorScope = Depends(get_current_distributor)) -> PortalInventoryResponse:
    """This distributor's stock ledger. Runs the order-credit sync first
    (see inventory_service), then returns each item enriched with name /
    category / unit and a per-distributor stock value. Stock is only ever
    credited automatically from Completed Sales Orders — there is no manual
    add path."""
    try:
        rows = await inventory_service.list_inventory(_scoped_customer(scope))
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return PortalInventoryResponse(items=[PortalInventoryItem(**row) for row in rows])


@router.put("/inventory/{item_code:path}/threshold", response_model=MessageResponse)
async def set_inventory_threshold(
    item_code: str,
    payload: PortalThresholdUpdate,
    scope: DistributorScope = Depends(get_current_distributor),
) -> MessageResponse:
    """Set (or clear, with null) this item's low-stock threshold. Creates a
    zero-quantity ledger row if the distributor has never received the item."""
    inventory_service.set_threshold(_scoped_customer(scope), item_code, payload.low_stock_threshold)
    return MessageResponse(detail="Threshold updated")


# --- End-User / Implant Records ---------------------------------------

@router.get("/end-user-records", response_model=EndUserRecordListResponse)
async def list_end_user_records(
    search: str | None = Query(default=None, description="doctor / hospital / batch / EUR-id"),
    rating: str | None = Query(default=None, description='"5" or "complications"'),
    scope: DistributorScope = Depends(get_current_distributor),
) -> EndUserRecordListResponse:
    try:
        data = await end_user_records_service.list_records(
            _scoped_customer(scope), search=search, rating=rating
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return EndUserRecordListResponse(**data)


@router.post("/end-user-records", response_model=EndUserRecordOut, status_code=201)
async def create_end_user_record(
    payload: EndUserRecordCreate, scope: DistributorScope = Depends(get_current_distributor)
) -> EndUserRecordOut:
    """Records an implant usage and decrements this distributor's inventory
    for the item in one transaction. 409 if quantity exceeds stock on hand."""
    customer = _scoped_customer(scope)
    try:
        record_id = end_user_records_service.create_record(
            customer,
            item_code=payload.item_code,
            quantity=payload.quantity,
            doctor_name=payload.doctor_name,
            hospital_name=payload.hospital_name,
            location=payload.location,
            batch_id=payload.batch_id,
            implantation_date=payload.implantation_date,
            feedback_notes=payload.feedback_notes,
            satisfaction_rating=payload.satisfaction_rating,
            complication=payload.complication,
        )
    except end_user_records_service.InsufficientInventoryError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    created = await end_user_records_service.get_record(customer, record_id)
    if created is None:  # unreachable in practice
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Record created but not found")
    return EndUserRecordOut(**created)


@router.patch("/end-user-records/{record_id}", response_model=MessageResponse)
async def update_end_user_record_feedback(
    record_id: int,
    payload: EndUserRecordFeedbackUpdate,
    scope: DistributorScope = Depends(get_current_distributor),
) -> MessageResponse:
    """Updates only feedback_notes / satisfaction_rating / complication."""
    ok = end_user_records_service.update_feedback(
        _scoped_customer(scope),
        record_id,
        feedback_notes=payload.feedback_notes,
        satisfaction_rating=payload.satisfaction_rating,
        complication=payload.complication,
    )
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Record not found")
    return MessageResponse(detail="Feedback updated")


# --- Track Shipment (Shree Maruti, manual docket) ---------------------

@router.get("/track-shipment", response_model=TrackShipmentOut)
async def track_shipment(
    docket: str = Query(min_length=1, description="Docket / AWB number the user typed in"),
    _current: tuple[PortalUser, str] = Depends(get_current_user),
) -> TrackShipmentOut:
    """Track a manually-entered docket via Shree Maruti. Any authenticated
    role — a docket is self-contained, not tied to a distributor's data.

    The `state` field distinguishes found / pending (no events yet — could
    be an unknown docket or a not-yet-confirmed booking) / error; callers
    render `pending` as neutral, not a failure.
    """
    try:
        data = await maruti_service.track_shipment(docket.strip())
    except MarutiAuthError as exc:
        # Bad/missing credentials — a server config problem, not the user's.
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Tracking unavailable: {exc}") from exc
    except MarutiUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return TrackShipmentOut(**data)
