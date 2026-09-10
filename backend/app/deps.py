from dataclasses import dataclass
from typing import Literal

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
    return (
        PortalUser(
            email=record.email,
            name=record.name,
            role=record.role,
            # Re-derived from the JWT claims on every request — never from
            # SessionRecord/DB — so a distributor's scope can't drift from
            # what they were actually issued at login.
            distributor_id=payload.get("distributor_id"),
            distributor_ids=payload.get("distributor_ids"),
        ),
        jti,
    )


def require_admin(current: tuple[PortalUser, str] = Depends(get_current_user)) -> PortalUser:
    user, _jti = current
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


@dataclass
class DistributorScope:
    role: Literal["distributor", "sales_person"]
    distributor_ids: list[str]  # 1 item for "distributor", N for "sales_person"


def get_current_distributor(current: tuple[PortalUser, str] = Depends(get_current_user)) -> DistributorScope:
    """Every distributor-facing endpoint depends on this instead of trusting
    a distributor id from the request. The scope always comes from the
    caller's own JWT claims (see security.create_access_token /
    auth_service.authenticate_credentials) — there is no code path by which
    a distributor or sales person can pass a different id and see someone
    else's data."""
    user, _jti = current
    if user.role == "distributor":
        ids = [user.distributor_id] if user.distributor_id else []
    elif user.role == "sales_person":
        ids = user.distributor_ids or []
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Distributor or Sales Person access required")

    if not ids:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="No linked distributor found for this account")

    return DistributorScope(role=user.role, distributor_ids=ids)
