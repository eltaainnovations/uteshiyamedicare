import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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
    if not jti or not email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    record = touch_session(jti)
    return PortalUser(email=record.email, name=record.name, role=record.role), jti


def require_admin(current: tuple[PortalUser, str] = Depends(get_current_user)) -> PortalUser:
    user, _jti = current
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
