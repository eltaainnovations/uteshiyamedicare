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

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

import logging
from .. import (
    analytics_service,
    distributors_service,
    email_service,
    end_user_records_service,
    inventory_service,
    maruti_service,
    orders_service,
    products_service,
    users_service,
)

logger = logging.getLogger("portal")
from ..auth_service import PortalUser
from ..deps import DistributorScope, get_current_distributor, get_current_user
from ..erpnext_client import (
    ERPNextNotFoundError,
    ERPNextUnavailableError,
    ERPNextValidationError,
    erpnext_create_doc,
    erpnext_download_pdf,
    erpnext_get_doc,
)
from ..maruti_client import MarutiAuthError, MarutiUnavailableError
from ..schemas import (
    DistributorDetailOut,
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
    PortalCustomerListItem,
    PortalCustomerListResponse,
    PortalDashboardOut,
    PortalInventoryItem,
    PortalInventoryResponse,
    PortalInvoiceItem,
    PortalInvoicesResponse,
    PortalInvoiceStats,
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
    SalesApprovalOrderOut,
    SalesApprovalsOut,
    SalesDashboardOut,
    SalesOrderCreateIn,
    SalesOrderCreateOut,
    SalesOrderHistoryDistributorOut,
    SalesOrderHistoryItemOut,
    SalesOrderHistoryOut,
    SalesOrderHistoryStats,
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


@router.get("/sales/dashboard", response_model=SalesDashboardOut)
async def sales_dashboard(scope: DistributorScope = Depends(get_current_distributor)) -> SalesDashboardOut:
    """Sales Person Dashboard — counts and recent orders for the caller's
    linked distributor(s). No revenue/analytics here (that's the
    distributor-facing /dashboard above); this is just the plain order
    counts the Sales Person screen needs, via the same scoped orders_service
    calls the Orders/Pending-Approvals screens already use."""
    customer = _scoped_customer(scope)
    try:
        (orders, total, _), pending = await asyncio.gather(
            orders_service.list_orders(customer=customer, page=1, page_size=5),
            orders_service.list_pending_approval_orders(customer),
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return SalesDashboardOut(
        distributor_count=len(scope.distributor_ids),
        orders_created=total,
        pending_approvals=len(pending),
        recent_orders=[OrderListItem(**row) for row in orders],
    )


@router.post("/sales-orders", response_model=SalesOrderCreateOut, status_code=201)
async def create_sales_order(
    payload: SalesOrderCreateIn, scope: DistributorScope = Depends(get_current_distributor)
) -> SalesOrderCreateOut:
    """Sales Person's Create Order submit — a draft (docstatus 0) Sales
    Order for their linked distributor, which then shows up in that
    distributor's existing Pending Approvals queue unchanged.

    Distributor self-order-creation is a separate, not-yet-scoped
    feature — rejected here rather than silently creating an order a
    distributor didn't mean to route through their own approval queue.

    Rates are always resolved server-side via the same customer-scoped
    Item Price lookup the catalogue/reorder use — never trusted from the
    request — so a Sales Person can't submit an arbitrary price.
    """
    if scope.role != "sales_person":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Only a Sales Person can create an order here; distributor self-order creation is not yet supported.",
        )

    customer = _scoped_customer(scope)
    item_codes = [item.item_code for item in payload.items]
    try:
        prices = await products_service._scoped_prices_by_item_code(item_codes, customer=customer)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    order_items = []
    for item in payload.items:
        rate = prices.get(item.item_code, {}).get("price")
        if rate is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"No price found for item {item.item_code}"
            )
        order_items.append({"item_code": item.item_code, "qty": item.qty, "rate": rate})

    # ERPNext makes Sales Team mandatory on Sales Order (confirmed via a
    # live MandatoryError when it was omitted) — pulled from the Customer's
    # own stored default and forwarded as-is, never edited or fabricated
    # here. No Sales Person identity is inserted into it: this is a
    # straight copy of whatever Uteshiya has configured on that Customer
    # record, per the Customer<->Sales Person relationship doc.
    try:
        customer_doc = await erpnext_get_doc("Customer", customer, fields=["name", "customer_name", "email_id", "sales_team"], use_user_token=True)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    sales_team = customer_doc.get("sales_team") or []
    if not sales_team:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This distributor has no Sales Team configured in ERPNext — contact your administrator.",
        )

    doc = {
        "customer": customer,
        "branch": "CTM",
        "transaction_date": payload.transaction_date.isoformat(),
        "delivery_date": payload.delivery_date.isoformat(),
        "items": order_items,
        "sales_team": sales_team,
    }
    try:
        created = await erpnext_create_doc("Sales Order", doc)
    except ERPNextValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Notify linked distributor(s) that an order is awaiting approval
    try:
        dist_emails = users_service.get_distributor_emails_for_customer(customer)
        if not dist_emails and customer_doc.get("email_id"):
            dist_emails = [customer_doc["email_id"]]

        grand_total = sum(item["qty"] * item["rate"] for item in order_items)
        dist_name = customer_doc.get("customer_name") or customer
        sp_name = scope.user_name or scope.user_email or "Sales Representative"

        for dist_email in dist_emails:
            email_service.send_order_approval_request_email(
                to=dist_email,
                order_name=created["name"],
                distributor_name=dist_name,
                sales_person_name=sp_name,
                items=order_items,
                grand_total=grand_total,
                delivery_date=payload.delivery_date.isoformat(),
            )
    except Exception as exc:
        logger.warning("Could not send order approval request email for %s: %s", created["name"], exc)

    return SalesOrderCreateOut(name=created["name"], status=created.get("status", "Draft"))


_SALES_APPROVAL_STATUS_MAP = {"Draft": "Awaiting Approval", "Cancelled": "Rejected"}


def _approval_status(erp_status: str) -> str:
    return _SALES_APPROVAL_STATUS_MAP.get(erp_status, "Approved")


@router.get("/sales/approvals", response_model=SalesApprovalsOut)
async def sales_approvals(scope: DistributorScope = Depends(get_current_distributor)) -> SalesApprovalsOut:
    """A Sales Person's own order-status tracker: every order for their
    linked distributor(s), all-time, bucketed from ERPNext's own status
    field (Draft -> Awaiting Approval, Cancelled -> Rejected, anything
    submitted -> Approved) — reuses orders_service.list_orders exactly as
    Dashboard/My Customers do, no new list logic. Same known limitation
    as those two: this is every order for the customer, not only ones
    this Sales Person personally created — no such attribution exists in
    ERPNext yet (see the sales_team TODO in auth_service.py)."""
    if scope.role != "sales_person":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only a Sales Person has an approvals tracker here.")

    try:
        pages = await asyncio.gather(
            *[orders_service.list_orders(customer=cid, page=1, page_size=200) for cid in scope.distributor_ids]
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    items = [
        SalesApprovalOrderOut(
            name=row["name"],
            customer=row["customer"],
            customer_name=row["customer_name"],
            item_count=row["item_count"],
            grand_total=row["grand_total"],
            transaction_date=row["transaction_date"],
            status=_approval_status(row["status"]),
        )
        for rows, _total, _statuses in pages
        for row in rows
    ]
    return SalesApprovalsOut(
        items=items,
        awaiting=sum(1 for i in items if i.status == "Awaiting Approval"),
        approved=sum(1 for i in items if i.status == "Approved"),
        rejected=sum(1 for i in items if i.status == "Rejected"),
    )


_ORDER_HISTORY_STATUS_MAP = {"Draft": "Awaiting Approval", "Cancelled": "Rejected"}


def _order_history_status(erp_status: str) -> str:
    # Unlike _approval_status above, a submitted order keeps its real
    # ERPNext status text here (To Deliver / To Bill / Completed / ...)
    # instead of being collapsed into one generic "Approved" label.
    return _ORDER_HISTORY_STATUS_MAP.get(erp_status, erp_status)


@router.get("/sales/orders", response_model=SalesOrderHistoryOut)
async def sales_order_history(
    search: str | None = Query(default=None, description="Matches order name"),
    status_: str | None = Query(default=None, alias="status", description="Exact ERPNext status text"),
    customer: str | None = Query(default=None, description="Must be one of the caller's own linked distributors"),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    scope: DistributorScope = Depends(get_current_distributor),
) -> SalesOrderHistoryOut:
    """A Sales Person's all-time order list — real pagination, real
    date-range filter — reuses orders_service.list_orders exactly as
    Pending Approvals/Dashboard do, just without the docstatus=0-only
    scoping those use (this is every order regardless of status). Same
    "every order for the customer, not just ones this Sales Person
    personally created" limitation as those two endpoints.

    The mini-stats (total/pending/approved & converted) reflect the
    active search/date-range/customer filters but NOT the status filter
    itself — they're a breakdown of the filtered data, not of whatever
    single status the table is currently narrowed to.
    """
    if scope.role != "sales_person":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only a Sales Person has an order history here.")

    if customer is not None and customer not in scope.distributor_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Customer not found")
    cust = customer or scope.distributor_ids[0]
    from_iso = from_date.isoformat() if from_date else None
    to_iso = to_date.isoformat() if to_date else None

    try:
        (rows, total, _), (_, stats_total, _), (_, pending, _), (_, rejected, _), distributor_rows = (
            await asyncio.gather(
                orders_service.list_orders(
                    search=search,
                    customer=cust,
                    status=status_,
                    from_date=from_iso,
                    to_date=to_iso,
                    page=page,
                    page_size=page_size,
                ),
                orders_service.list_orders(search=search, customer=cust, from_date=from_iso, to_date=to_iso, page_size=1),
                orders_service.list_orders(
                    search=search, customer=cust, from_date=from_iso, to_date=to_iso, status="Draft", page_size=1
                ),
                orders_service.list_orders(
                    search=search, customer=cust, from_date=from_iso, to_date=to_iso, status="Cancelled", page_size=1
                ),
                distributors_service.list_customers_by_ids(scope.distributor_ids),
            )
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    items = [
        SalesOrderHistoryItemOut(
            name=row["name"],
            customer=row["customer"],
            customer_name=row["customer_name"],
            item_count=row["item_count"],
            grand_total=row["grand_total"],
            transaction_date=row["transaction_date"],
            status=_order_history_status(row["status"]),
        )
        for row in rows
    ]
    return SalesOrderHistoryOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        distributors=[
            SalesOrderHistoryDistributorOut(name=d["name"], customer_name=d["customer_name"]) for d in distributor_rows
        ],
        stats=SalesOrderHistoryStats(
            total=stats_total, pending=pending, approved_and_converted=stats_total - pending - rejected
        ),
    )


@router.get("/customers", response_model=PortalCustomerListResponse)
async def list_my_customers(scope: DistributorScope = Depends(get_current_distributor)) -> PortalCustomerListResponse:
    """A Sales Person's own linked distributors, each with an all-time
    order count/last-order-date — reuses distributors_service (Customer
    summary rows) and orders_service (order aggregation) exactly as
    Admin's Distributors screen and the Portal dashboard already do,
    just scoped to this caller's own distributor_ids instead of every
    Customer or a single one. One row today, per the one-distributor
    simplification — built to hold more once that changes."""
    if scope.role != "sales_person":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only a Sales Person has a customer list here.")

    try:
        customers, stats = await asyncio.gather(
            distributors_service.list_customers_by_ids(scope.distributor_ids),
            orders_service.order_stats_by_customer(scope.distributor_ids),
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return PortalCustomerListResponse(
        items=[
            PortalCustomerListItem(
                name=c["name"],
                customer_name=c["customer_name"],
                territory=c["territory"],
                disabled=c["disabled"],
                last_order_date=stats.get(c["name"], {}).get("last_order_date"),
                total_orders=stats.get(c["name"], {}).get("total_orders", 0),
            )
            for c in customers
        ]
    )


@router.get("/customers/{name:path}", response_model=DistributorDetailOut)
async def get_my_customer(
    name: str, scope: DistributorScope = Depends(get_current_distributor)
) -> DistributorDetailOut:
    """Same Customer + Address + Contact detail Admin's Distributors
    screen already shows, reusing get_distributor_detail verbatim —
    scoped here by checking `name` against this Sales Person's full
    distributor_ids list (not _scoped_customer's first-id-only shortcut,
    which would wrongly reject every id but the first once a Sales
    Person has more than one linked distributor)."""
    if name not in scope.distributor_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Customer not found")
    try:
        data = await distributors_service.get_distributor_detail(name)
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Customer not found") from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return DistributorDetailOut(**data)


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


@router.get("/invoices", response_model=PortalInvoicesResponse)
async def list_my_invoices(scope: DistributorScope = Depends(get_current_distributor)) -> PortalInvoicesResponse:
    """This distributor's Sales Invoices — reuses orders_service.list_invoices,
    the same joined-query technique the Completed Orders invoice-link fix
    established, just read in the other direction (invoice -> order).

    KPI buckets are computed from outstanding_amount, not a hardcoded
    status string: this ERPNext instance's real Sales Invoice statuses
    are Draft / Overdue / Cancelled / Return today (confirmed live) —
    there's no "Pending"/"Unpaid" value to match against, so "pending"
    here means "still owed, but not (yet) flagged Overdue".
    """
    try:
        rows = await orders_service.list_invoices(_scoped_customer(scope))
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    total_invoiced = sum(r["grand_total"] for r in rows if r["status"] != "Cancelled")
    overdue = sum(r["outstanding_amount"] for r in rows if r["status"] == "Overdue")
    pending = sum(r["outstanding_amount"] for r in rows if r["outstanding_amount"] > 0 and r["status"] != "Overdue")

    return PortalInvoicesResponse(
        items=[PortalInvoiceItem(**row) for row in rows],
        stats=PortalInvoiceStats(total_invoiced=total_invoiced, pending=pending, overdue=overdue),
    )


@router.get("/orders/{name:path}/invoice-pdf")
async def download_invoice_pdf(name: str, scope: DistributorScope = Depends(get_current_distributor)) -> Response:
    """Proxies the linked Sales Invoice's PDF through our backend — the
    browser never sees ERPNext credentials, same as every other call in
    this module. 404s if the order isn't the caller's own, or if it has
    no linked invoice yet (a Completed order can, in principle, still be
    un-invoiced)."""
    data = await _scoped_order_detail(name, scope)
    invoice = await orders_service._find_linked_invoice(name, data["customer"])
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No invoice available for this order yet.")

    try:
        pdf_bytes = await erpnext_download_pdf("Sales Invoice", invoice["name"])
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    filename = f"{invoice['name']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
    res = await _set_docstatus(name, 1, scope, "approved")

    # Notify sales person that the order has been approved
    try:
        customer = _scoped_customer(scope)
        sp_emails = users_service.get_sales_person_emails_for_customer(customer)
        dist_name = scope.user_name or customer
        for sp_email in sp_emails:
            email_service.send_order_status_update_email(
                to=sp_email,
                order_name=name,
                distributor_name=dist_name,
                status_verb="approved",
            )
    except Exception as exc:
        logger.warning("Could not send order approved email for %s: %s", name, exc)

    return res


@router.put("/orders/{name:path}/reject", response_model=PortalOrderActionResponse)
async def reject_order(
    name: str, scope: DistributorScope = Depends(get_current_distributor)
) -> PortalOrderActionResponse:
    """Reject a still-draft Sales Order awaiting approval — a real delete,
    not a docstatus change. ERPNext's docstatus lifecycle has no path from
    Draft straight to Cancelled (confirmed live: DocstatusTransitionError),
    so unlike approve_order/cancel_order above, this can't go through
    _set_docstatus — see orders_service.delete_draft_order."""
    customer = _scoped_customer(scope)
    try:
        await orders_service.delete_draft_order(name, expected_customer=customer)
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Order not found") from exc
    except ERPNextValidationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Notify sales person that the order has been rejected
    try:
        sp_emails = users_service.get_sales_person_emails_for_customer(customer)
        dist_name = scope.user_name or customer
        for sp_email in sp_emails:
            email_service.send_order_status_update_email(
                to=sp_email,
                order_name=name,
                distributor_name=dist_name,
                status_verb="rejected",
            )
    except Exception as exc:
        logger.warning("Could not send order rejected email for %s: %s", name, exc)

    return PortalOrderActionResponse(name=name, docstatus=2, detail="Order rejected")


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
