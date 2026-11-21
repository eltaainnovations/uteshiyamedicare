from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import end_user_records_service
from ..auth_service import PortalUser
from ..deps import require_admin
from ..erpnext_client import ERPNextUnavailableError
from ..schemas import EndUserRecordListResponse, EndUserRecordOut

router = APIRouter(prefix="/end-user-records", tags=["end-user-records"])


@router.get("", response_model=EndUserRecordListResponse)
async def list_all_end_user_records(
    search: str | None = Query(default=None, description="doctor / hospital / batch / EUR-id / item"),
    customer_id: str | None = Query(default=None, description="Filter by distributor customer ID"),
    rating: str | None = Query(default=None, description='"5" or "complications"'),
    _admin: PortalUser = Depends(require_admin),
) -> EndUserRecordListResponse:
    try:
        data = await end_user_records_service.list_records(
            customer_id=customer_id, search=search, rating=rating, is_admin=True
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return EndUserRecordListResponse(**data)


@router.get("/{record_id}", response_model=EndUserRecordOut)
async def get_end_user_record_detail(
    record_id: int,
    _admin: PortalUser = Depends(require_admin),
) -> EndUserRecordOut:
    try:
        data = await end_user_records_service.get_record(customer_id=None, record_id=record_id)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Record not found")
    return EndUserRecordOut(**data)

