from fastapi import APIRouter, Depends

from .. import auth_service
from ..auth_service import PortalUser
from ..config import settings
from ..deps import get_current_user
from ..schemas import (
    LoginChallengeResponse,
    LoginRequest,
    MessageResponse,
    SessionResponse,
    TokenResponse,
    UserOut,
    Verify2FARequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_user_out(user: PortalUser) -> UserOut:
    return UserOut(id=user.email, email=user.email, name=user.name, role=user.role)


@router.post("/login", response_model=LoginChallengeResponse)
async def login(payload: LoginRequest) -> LoginChallengeResponse:
    user, sid = await auth_service.authenticate_credentials(payload.email, payload.password)
    challenge_id, challenge = auth_service.start_2fa_challenge(user, sid)
    return LoginChallengeResponse(
        challenge_id=challenge_id,
        masked_email=challenge.masked_email,
        expires_in_seconds=settings.otp_ttl_minutes * 60,
        dev_otp=challenge.code if settings.demo_mode else None,
    )


@router.post("/verify-2fa", response_model=TokenResponse)
def verify_2fa(payload: Verify2FARequest) -> TokenResponse:
    user, encrypted_sid = auth_service.verify_2fa_code(payload.challenge_id, payload.code)
    token, expires_in = auth_service.issue_session(user, encrypted_sid)
    return TokenResponse(access_token=token, expires_in_seconds=expires_in, user=_to_user_out(user))


@router.get("/session", response_model=SessionResponse)
def session_check(current: tuple[PortalUser, str] = Depends(get_current_user)) -> SessionResponse:
    user, _jti = current
    return SessionResponse(user=_to_user_out(user), expires_in_seconds=settings.session_timeout_minutes * 60)


@router.post("/logout", response_model=MessageResponse)
async def logout(current: tuple[PortalUser, str] = Depends(get_current_user)) -> MessageResponse:
    _user, jti = current
    await auth_service.revoke_session(jti)
    return MessageResponse(detail="Logged out")
