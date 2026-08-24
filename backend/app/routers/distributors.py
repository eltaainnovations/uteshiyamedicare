from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import distributors_service
from ..auth_service import PortalUser
from ..deps import require_admin
from ..erpnext_client import ERPNextNotFoundError, ERPNextUnavailableError
from ..schemas import DistributorDetailOut, DistributorListItem, DistributorListResponse

router = APIRouter(prefix="/distributors", tags=["distributors"])


@router.get("", response_model=DistributorListResponse)
async def list_distributors(
    search: str | None = Query(default=None, description="Matches customer_name"),
    customer_group: str | None = Query(default=None),
    territory: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    _admin: PortalUser = Depends(require_admin),
) -> DistributorListResponse:
    try:
        rows, total, groups, territories = await distributors_service.list_distributors(
            search=search, customer_group=customer_group, territory=territory, page=page, page_size=page_size
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return DistributorListResponse(
        items=[DistributorListItem(**row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        customer_groups=groups,
        territories=territories,
    )


@router.get("/{name:path}", response_model=DistributorDetailOut)
async def get_distributor(name: str, _admin: PortalUser = Depends(require_admin)) -> DistributorDetailOut:
    try:
        data = await distributors_service.get_distributor_detail(name)
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Distributor not found") from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return DistributorDetailOut(**data)
