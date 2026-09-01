from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.responses import HTMLResponse

from .. import users_service
from ..auth_service import PortalUser
from ..deps import get_current_user, require_admin
from ..schemas import ChangePasswordRequest, CreatePortalUserRequest, MessageResponse, PortalUserOut

router = APIRouter(prefix="/users", tags=["users"])


def _to_user_out(record: users_service.PortalUserRow) -> PortalUserOut:
    return PortalUserOut(
        email=record.email,
        first_name=record.first_name,
        last_name=record.last_name,
        portal_role=record.portal_role,
        erpnext_customer_link=record.erpnext_customer_link,
        status=record.status,
        failure_reason=record.failure_reason,
        requested_by_email=record.requested_by_email,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.post("", response_model=PortalUserOut, status_code=201)
def create_user(payload: CreatePortalUserRequest, admin: PortalUser = Depends(require_admin)) -> PortalUserOut:
    record = users_service.create_draft(
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        portal_role=payload.portal_role,
        erpnext_customer_link=payload.erpnext_customer_link,
        requested_by_email=admin.email,
    )
    return _to_user_out(record)


@router.get("", response_model=list[PortalUserOut])
def list_all_users(admin: PortalUser = Depends(require_admin)) -> list[PortalUserOut]:
    return [_to_user_out(record) for record in users_service.list_users()]


@router.post("/me/change-password", response_model=MessageResponse)
async def change_own_password(
    payload: ChangePasswordRequest, current: tuple[PortalUser, str] = Depends(get_current_user)
) -> MessageResponse:
    user, _jti = current
    ok, message = await users_service.change_own_password(user.email, payload.current_password, payload.new_password)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=message)
    return MessageResponse(detail=message)


def _page(title: str, message: str) -> str:
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{title}</title>
<style>body{{font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#1a1a1a}}
h1{{font-size:20px}}p{{color:#444;line-height:1.5}}</style></head>
<body><h1>{title}</h1><p>{message}</p></body></html>"""


@router.get("/approve/{token}", response_class=HTMLResponse)
async def approve_user(token: str) -> HTMLResponse:
    ok, message = await users_service.approve_and_provision(token)
    title = "User approved" if ok else "Approval failed"
    return HTMLResponse(_page(title, message), status_code=200 if ok else 400)


def _onboarding_form(token: str, error: str | None = None) -> str:
    error_html = f'<p style="color:#c0392b">{error}</p>' if error else ""
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Set your password</title>
<style>body{{font-family:sans-serif;max-width:420px;margin:80px auto;padding:0 20px;color:#1a1a1a}}
h1{{font-size:20px}}input{{width:100%;padding:10px;margin:8px 0;box-sizing:border-box;font-size:14px}}
button{{width:100%;padding:10px;background:#147BA6;color:#fff;border:0;border-radius:6px;font-size:14px;cursor:pointer}}
</style></head>
<body><h1>Set your Portal password</h1>{error_html}
<form method="post" action="/users/onboarding/{token}">
<input type="password" name="password" placeholder="New password" minlength="8" required autofocus>
<input type="password" name="confirm_password" placeholder="Confirm password" minlength="8" required>
<button type="submit">Set password</button>
</form></body></html>"""


@router.get("/onboarding/{token}", response_class=HTMLResponse)
def onboarding_form(token: str) -> HTMLResponse:
    return HTMLResponse(_onboarding_form(token))


@router.post("/onboarding/{token}", response_class=HTMLResponse)
async def onboarding_submit(token: str, password: str = Form(...), confirm_password: str = Form(...)) -> HTMLResponse:
    if password != confirm_password:
        return HTMLResponse(_onboarding_form(token, "Passwords do not match."), status_code=400)

    ok, message = await users_service.set_password_via_onboarding(token, password)
    title = "Password set" if ok else "Could not set password"
    return HTMLResponse(_page(title, message), status_code=200 if ok else 400)


@router.post("/{email}/disable", response_model=PortalUserOut)
async def disable_user_route(email: str, admin: PortalUser = Depends(require_admin)) -> PortalUserOut:
    record = await users_service.disable_user(email)
    return _to_user_out(record)
