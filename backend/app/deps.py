import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import settings_service
from .auth_service import PortalUser, touch_session
from .config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> tuple[PortalUser, str]:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    jti = payload.get("jti")
    email = payload.get("sub")
    token_version = payload.get("tv")
    if not jti or not email or token_version is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Force Logout All Users bumps this — any token issued before the bump
    # fails here immediately, regardless of its own exp/session state.
    if token_version != settings_service.get_token_version():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session invalidated by administrator, please log in again")

    record = touch_session(jti)
    return PortalUser(email=record.email, name=record.name, role=record.role), jti


def require_admin(current: tuple[PortalUser, str] = Depends(get_current_user)) -> PortalUser:
    user, _jti = current
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
