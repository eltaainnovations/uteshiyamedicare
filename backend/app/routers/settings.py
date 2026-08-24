from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from .. import auth_service, email_service, settings_service
from ..auth_service import PortalUser
from ..deps import require_admin
from ..schemas import (
    BrandingConfig,
    CompanyProfileConfig,
    EmailConfig,
    EmailConfigUpdate,
    ErpConnectionStatus,
    ErpStatusResponse,
    ForceLogoutResult,
    LogoUploadOut,
    NotificationRulesConfig,
    SecurityConfig,
    TestEmailRequest,
    TestEmailResult,
)

router = APIRouter(prefix="/settings", tags=["settings"])

# Local-disk storage, served back out via the /uploads static mount in
# main.py — this project has no other file storage yet, so nothing more
# elaborate is warranted for logo assets alone.
_UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "logos"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
_ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".svg"}


@router.get("/company-profile", response_model=CompanyProfileConfig)
async def get_company_profile(_admin: PortalUser = Depends(require_admin)) -> CompanyProfileConfig:
    return settings_service.get_company_profile()


@router.put("/company-profile", response_model=CompanyProfileConfig)
async def put_company_profile(
    body: CompanyProfileConfig, _admin: PortalUser = Depends(require_admin)
) -> CompanyProfileConfig:
    return settings_service.put_company_profile(body)


@router.get("/branding", response_model=BrandingConfig)
async def get_branding(_admin: PortalUser = Depends(require_admin)) -> BrandingConfig:
    return settings_service.get_branding()


@router.put("/branding", response_model=BrandingConfig)
async def put_branding(body: BrandingConfig, _admin: PortalUser = Depends(require_admin)) -> BrandingConfig:
    return settings_service.put_branding(body)


@router.post("/logo", response_model=LogoUploadOut)
async def upload_logo(file: UploadFile = File(...), _admin: PortalUser = Depends(require_admin)) -> LogoUploadOut:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Logo must be a PNG, JPG, or SVG file")
    dest = _UPLOAD_DIR / f"{uuid4().hex}{ext}"
    dest.write_bytes(await file.read())
    return LogoUploadOut(url=f"/uploads/logos/{dest.name}")


@router.get("/erp-status", response_model=ErpStatusResponse)
async def get_erp_status(_admin: PortalUser = Depends(require_admin)) -> ErpStatusResponse:
    return ErpStatusResponse(connections=await settings_service.get_erp_status())


@router.post("/erp-status/test/{key_label}", response_model=ErpConnectionStatus)
async def test_erp_connection(key_label: str, _admin: PortalUser = Depends(require_admin)) -> ErpConnectionStatus:
    try:
        return await settings_service.test_erp_connection(key_label)
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/security", response_model=SecurityConfig)
async def get_security_config(_admin: PortalUser = Depends(require_admin)) -> SecurityConfig:
    return settings_service.get_security_config()


@router.put("/security", response_model=SecurityConfig)
async def put_security_config(body: SecurityConfig, _admin: PortalUser = Depends(require_admin)) -> SecurityConfig:
    return settings_service.put_security_config(body)


@router.post("/security/force-logout", response_model=ForceLogoutResult)
async def force_logout_all(_admin: PortalUser = Depends(require_admin)) -> ForceLogoutResult:
    new_version = settings_service.bump_token_version()
    auth_service.clear_active_sessions()
    return ForceLogoutResult(token_version=new_version)


@router.get("/email-config", response_model=EmailConfig)
async def get_email_config(_admin: PortalUser = Depends(require_admin)) -> EmailConfig:
    return settings_service.get_email_config()


@router.put("/email-config", response_model=EmailConfig)
async def put_email_config(body: EmailConfigUpdate, _admin: PortalUser = Depends(require_admin)) -> EmailConfig:
    return settings_service.put_email_config(body)


@router.post("/email-config/test", response_model=TestEmailResult)
async def test_email_config(body: TestEmailRequest, _admin: PortalUser = Depends(require_admin)) -> TestEmailResult:
    success, error = email_service.send_email(
        body.to,
        "Uteshiya Medicare Portal — Test Email",
        "This is a test email sent from the Portal's Email Configuration settings.",
    )
    return TestEmailResult(
        success=success, detail="Test email sent successfully." if success else (error or "Could not send test email.")
    )


@router.get("/notification-rules", response_model=NotificationRulesConfig)
async def get_notification_rules(_admin: PortalUser = Depends(require_admin)) -> NotificationRulesConfig:
    return settings_service.get_notification_rules()


@router.put("/notification-rules", response_model=NotificationRulesConfig)
async def put_notification_rules(
    body: NotificationRulesConfig, _admin: PortalUser = Depends(require_admin)
) -> NotificationRulesConfig:
    return settings_service.put_notification_rules(body)
