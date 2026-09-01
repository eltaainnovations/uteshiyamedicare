from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import orders_service
from ..auth_service import PortalUser
from ..deps import require_admin
from ..erpnext_client import ERPNextNotFoundError, ERPNextUnavailableError
from ..schemas import OrderDetailOut, OrderListItem, OrderListResponse

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=OrderListResponse)
async def list_orders(
    search: str | None = Query(default=None, description="Matches order name"),
    customer: str | None = Query(default=None, description="ERPNext Customer docname"),
    status_: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    _admin: PortalUser = Depends(require_admin),
) -> OrderListResponse:
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


@router.get("/{name:path}", response_model=OrderDetailOut)
async def get_order(name: str, _admin: PortalUser = Depends(require_admin)) -> OrderDetailOut:
    try:
        data = await orders_service.get_order_detail(name)
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Order not found") from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return OrderDetailOut(**data)
