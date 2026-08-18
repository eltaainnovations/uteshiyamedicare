from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import products_service
from ..auth_service import PortalUser
from ..deps import require_admin
from ..erpnext_client import ERPNextNotFoundError, ERPNextUnavailableError
from ..schemas import ProductDetailOut, ProductListItem, ProductListResponse

router = APIRouter(prefix="/products", tags=["products"])

ALLOWED_PAGE_SIZES = (20, 50, 100, 200)


@router.get("", response_model=ProductListResponse)
async def list_products(
    search: str | None = Query(default=None, description="Matches item_code or item_name"),
    category: str | None = Query(default=None, description="item_group to filter by"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20),
    _admin: PortalUser = Depends(require_admin),
) -> ProductListResponse:
    if page_size not in ALLOWED_PAGE_SIZES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"page_size must be one of {ALLOWED_PAGE_SIZES}",
        )
    try:
        rows, total, categories = await products_service.list_products(
            search=search, category=category, page=page, page_size=page_size
        )
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return ProductListResponse(
        items=[ProductListItem(**row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        categories=categories,
    )


@router.get("/{item_code:path}", response_model=ProductDetailOut)
async def get_product(item_code: str, _admin: PortalUser = Depends(require_admin)) -> ProductDetailOut:
    try:
        data = await products_service.get_product_detail(item_code)
    except ERPNextNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Product not found") from exc
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return ProductDetailOut(**data)
