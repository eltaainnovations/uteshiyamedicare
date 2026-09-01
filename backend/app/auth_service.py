import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from . import email_service, portal_users, settings_service, users_service
from .config import settings
from .erpnext_client import ERPNextAuthError, ERPNextUnavailableError, erpnext_login, erpnext_logout
from .schemas import Role
from .security import create_access_token, decrypt_sid, encrypt_sid, generate_otp, generate_token_id

logger = logging.getLogger("auth")


@dataclass
class PortalUser:
    email: str
    name: str
    role: Role


@dataclass
class PendingChallenge:
    user_email: str
    user_name: str
    role: Role
    code: str
    masked_email: str
    expires_at: datetime
    encrypted_sid: bytes


@dataclass
class SessionRecord:
    email: str
    name: str
    role: Role
    last_activity: datetime
    encrypted_sid: bytes
    sid_expires_at: datetime


# In-memory for now — fine for a single dev/demo process. Swapping to a
# shared store (Redis) is a follow-up once this runs behind more than one
# backend worker.
_pending_challenges: dict[str, PendingChallenge] = {}
_active_sessions: dict[str, SessionRecord] = {}


def _mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    if len(name) <= 2:
        masked = name[0] + "*"
    else:
        masked = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked}@{domain}"


def _deliver_otp(email: str, code: str) -> None:
    email_service.send_email(email, "Your Uteshiya Medicare Portal login code", f"Your 2FA code is: {code}")


async def authenticate_credentials(email: str, password: str) -> tuple[PortalUser, str]:
    """Verify credentials against ERPNext and return the Portal user plus
    the plaintext ERPNext sid.

    The sid exists unencrypted only in this call chain, in memory, only
    briefly — the caller must encrypt it (see start_2fa_challenge) before
    it's held anywhere else.

    Login Attempt Policy is enforced here, ahead of the ERPNext call:
    locked_until (from a prior lockout) blocks the attempt outright; a bad
    password increments failed_attempts and may trigger a new lockout.
    Both are tracked on the portal_users row, so an email with no row here
    (never provisioned) simply isn't tracked.
    """
    email_lower = email.lower()
    locked_until = users_service.get_lockout_status(email_lower)
    if locked_until is not None:
        raise HTTPException(
            status.HTTP_423_LOCKED,
            detail=f"Account locked due to too many failed attempts. Try again after {locked_until.isoformat()}.",
        )

    try:
        erpnext_session = await erpnext_login(email, password)
    except ERPNextAuthError:
        newly_locked_until = users_service.record_failed_login(email_lower)
        if newly_locked_until is not None and settings_service.get_security_config().lockout_email_alert:
            email_service.send_email(
                email_lower,
                "Your Portal account has been locked",
                f"Too many failed login attempts. Your account is locked until {newly_locked_until}. "
                "Contact your administrator if this wasn't you.",
            )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    except ERPNextUnavailableError as exc:
        logger.error("ERPNext login unavailable for %s: %s", email, exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable, please try again",
        )

    role = portal_users.get_role(email)
    if role is None:
        await erpnext_logout(erpnext_session.sid)  # don't leave an orphaned ERPNext session
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Account not provisioned for portal access")

    users_service.reset_failed_attempts(email_lower)
    user = PortalUser(email=email_lower, name=erpnext_session.full_name, role=role)
    return user, erpnext_session.sid


def start_2fa_challenge(user: PortalUser, sid: str) -> tuple[str, PendingChallenge]:
    challenge_id = generate_token_id()
    code = generate_otp()
    challenge = PendingChallenge(
        user_email=user.email,
        user_name=user.name,
        role=user.role,
        code=code,
        masked_email=_mask_email(user.email),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.otp_ttl_minutes),
        encrypted_sid=encrypt_sid(sid),
    )
    _pending_challenges[challenge_id] = challenge
    _deliver_otp(user.email, code)
    return challenge_id, challenge


def verify_2fa_code(challenge_id: str, code: str) -> tuple[PortalUser, bytes]:
    challenge = _pending_challenges.get(challenge_id)
    if challenge is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="2FA challenge not found or already used")

    if datetime.now(timezone.utc) > challenge.expires_at:
        del _pending_challenges[challenge_id]
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="2FA code expired, please log in again")

    if code != challenge.code:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect 2FA code")

    del _pending_challenges[challenge_id]
    user = PortalUser(email=challenge.user_email, name=challenge.user_name, role=challenge.role)
    return user, challenge.encrypted_sid


def issue_session(user: PortalUser, encrypted_sid: bytes) -> tuple[str, int]:
    jti = generate_token_id()
    token_version = settings_service.get_token_version()
    token, _hard_ceiling_seconds = create_access_token(
        subject=user.email, role=user.role, jti=jti, token_version=token_version
    )
    now = datetime.now(timezone.utc)
    _active_sessions[jti] = SessionRecord(
        email=user.email,
        name=user.name,
        role=user.role,
        last_activity=now,
        encrypted_sid=encrypted_sid,
        sid_expires_at=now + timedelta(minutes=settings.erpnext_sid_ttl_minutes),
    )
    return token, settings_service.get_security_config().session_timeout_minutes * 60


def touch_session(jti: str) -> SessionRecord:
    record = _active_sessions.get(jti)
    if record is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session not found, please log in again")

    timeout_minutes = settings_service.get_security_config().session_timeout_minutes
    now = datetime.now(timezone.utc)
    if now - record.last_activity > timedelta(minutes=timeout_minutes):
        del _active_sessions[jti]
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session expired due to inactivity")

    record.last_activity = now
    return record


def clear_active_sessions() -> None:
    """Used by the Force Logout All Users action. Not strictly required for
    that action to work — bumping token_version alone invalidates every
    outstanding JWT on next request via deps.get_current_user — but this
    also drops the in-memory session records immediately rather than
    leaving them to expire naturally."""
    _active_sessions.clear()


def get_erpnext_sid(jti: str) -> str | None:
    """Decrypt the stored ERPNext sid for backend-to-ERPNext calls made on
    this user's behalf. Returns None if the session, or the sid's own TTL,
    has expired."""
    record = _active_sessions.get(jti)
    if record is None or datetime.now(timezone.utc) > record.sid_expires_at:
        return None
    return decrypt_sid(record.encrypted_sid)


async def revoke_session(jti: str) -> None:
    record = _active_sessions.pop(jti, None)
    if record is None:
        return

    try:
        sid = decrypt_sid(record.encrypted_sid)
    except Exception:
        logger.exception("Could not decrypt stored sid for session %s; skipping ERPNext logout", jti)
        return

    await erpnext_logout(sid)
