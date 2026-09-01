from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import analytics_service
from ..auth_service import PortalUser
from ..deps import require_admin
from ..erpnext_client import ERPNextUnavailableError
from ..schemas import (
    AnalyticsCohortOut,
    AnalyticsDistributorPerformanceOut,
    AnalyticsFulfillmentOut,
    AnalyticsRevenueTrendOut,
    AnalyticsTopProductsOut,
    Granularity,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/revenue-trend", response_model=AnalyticsRevenueTrendOut)
async def revenue_trend(
    from_date: date,
    to_date: date,
    customer: str | None = Query(default=None),
    granularity: Granularity = Query(default="monthly"),
    _admin: PortalUser = Depends(require_admin),
) -> AnalyticsRevenueTrendOut:
    try:
        data = await analytics_service.revenue_trend(str(from_date), str(to_date), customer, granularity)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AnalyticsRevenueTrendOut(**data)


@router.get("/distributor-performance", response_model=AnalyticsDistributorPerformanceOut)
async def distributor_performance(
    from_date: date,
    to_date: date,
    customer: str | None = Query(default=None),
    _admin: PortalUser = Depends(require_admin),
) -> AnalyticsDistributorPerformanceOut:
    try:
        data = await analytics_service.distributor_performance(str(from_date), str(to_date), customer)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AnalyticsDistributorPerformanceOut(**data)


@router.get("/top-products", response_model=AnalyticsTopProductsOut)
async def top_products(
    from_date: date,
    to_date: date,
    customer: str | None = Query(default=None),
    _admin: PortalUser = Depends(require_admin),
) -> AnalyticsTopProductsOut:
    try:
        data = await analytics_service.top_products(str(from_date), str(to_date), customer)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AnalyticsTopProductsOut(**data)


@router.get("/order-fulfillment", response_model=AnalyticsFulfillmentOut)
async def order_fulfillment(
    from_date: date,
    to_date: date,
    customer: str | None = Query(default=None),
    granularity: Granularity = Query(default="monthly"),
    _admin: PortalUser = Depends(require_admin),
) -> AnalyticsFulfillmentOut:
    try:
        data = await analytics_service.order_fulfillment(str(from_date), str(to_date), customer, granularity)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AnalyticsFulfillmentOut(**data)


@router.get("/distributor-cohort", response_model=AnalyticsCohortOut)
async def distributor_cohort(
    from_date: date,
    to_date: date,
    customer: str | None = Query(default=None),
    _admin: PortalUser = Depends(require_admin),
) -> AnalyticsCohortOut:
    try:
        data = await analytics_service.distributor_cohort(str(from_date), str(to_date), customer)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AnalyticsCohortOut(**data)
