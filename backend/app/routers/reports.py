from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import reports_service
from ..auth_service import PortalUser
from ..deps import require_admin
from ..erpnext_client import ERPNextUnavailableError
from ..schemas import GenerateReportRequest

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/generate")
async def generate_report(payload: GenerateReportRequest, _admin: PortalUser = Depends(require_admin)) -> Response:
    try:
        content = await reports_service.generate_report(payload.report_type, payload.from_date, payload.to_date)
    except ERPNextUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    filename = f"{payload.report_type}_{payload.from_date}_to_{payload.to_date}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
