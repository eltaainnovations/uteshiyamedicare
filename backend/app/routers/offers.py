from fastapi import APIRouter, Depends, Query

from .. import offers_service
from ..auth_service import PortalUser
from ..deps import get_current_user, require_admin
from ..schemas import ActiveOfferOut, MessageResponse, OfferOut, OfferStatus, OfferWrite

router = APIRouter(prefix="/offers", tags=["offers"])


@router.get("", response_model=list[OfferOut])
async def list_offers(
    status: OfferStatus | None = Query(default=None, description="Filter by computed status"),
    _admin: PortalUser = Depends(require_admin),
) -> list[OfferOut]:
    return await offers_service.list_offers(status)


@router.get("/active", response_model=list[ActiveOfferOut])
async def list_active_offers(
    _current: tuple[PortalUser, str] = Depends(get_current_user),
) -> list[ActiveOfferOut]:
    """Currently-active offers only — what the Distributor Portal will
    call. Any valid session, no admin role required."""
    return await offers_service.list_active_offers()


@router.post("", response_model=OfferOut, status_code=201)
async def create_offer(payload: OfferWrite, _admin: PortalUser = Depends(require_admin)) -> OfferOut:
    return await offers_service.create_offer(payload)


@router.put("/{offer_id}", response_model=OfferOut)
async def update_offer(
    offer_id: int, payload: OfferWrite, _admin: PortalUser = Depends(require_admin)
) -> OfferOut:
    return await offers_service.update_offer(offer_id, payload)


@router.delete("/{offer_id}", response_model=MessageResponse)
async def delete_offer(offer_id: int, _admin: PortalUser = Depends(require_admin)) -> MessageResponse:
    offers_service.delete_offer(offer_id)
    return MessageResponse(detail="Offer deleted")
