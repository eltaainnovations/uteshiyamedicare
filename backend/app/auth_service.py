import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from . import email_service, settings_service, users_service
from .config import settings
from .erpnext_client import ERPNextAuthError, ERPNextUnavailableError, erpnext_login, erpnext_logout
from .schemas import Role
from .security import create_access_token, decrypt_sid, encrypt_sid, generate_otp, generate_token_id, verify_password

logger = logging.getLogger("auth")


@dataclass
class PortalUser:
    email: str
    name: str
    role: Role
    # Distributor data-scoping: set only for role == "distributor"
    # (single Customer) or "sales_person" (list of Customers), computed
    # once in authenticate_credentials and carried through to the JWT by
    # issue_session. See deps.get_current_distributor.
    distributor_id: str | None = None
    distributor_ids: list[str] | None = None


@dataclass
class PendingChallenge:
    user_email: str
    user_name: str
    role: Role
    distributor_id: str | None
    distributor_ids: list[str] | None
    code: str
    masked_email: str
    expires_at: datetime
    # None for a Distributor (local auth, no real ERPNext session — see
    # authenticate_credentials); always set for every other role.
    encrypted_sid: bytes | None


@dataclass
class SessionRecord:
    email: str
    name: str
    role: Role
    last_activity: datetime
    encrypted_sid: bytes | None
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


def _record_failed_attempt_and_maybe_alert(email_lower: str) -> None:
    """Shared by both auth paths in authenticate_credentials below, so the
    lockout policy can't drift between the local and ERPNext branches."""
    newly_locked_until = users_service.record_failed_login(email_lower)
    if newly_locked_until is not None and settings_service.get_security_config().lockout_email_alert:
        email_service.send_email(
            email_lower,
            "Your Portal account has been locked",
            f"Too many failed login attempts. Your account is locked until {newly_locked_until}. "
            "Contact your administrator if this wasn't you.",
        )


async def authenticate_credentials(email: str, password: str) -> tuple[PortalUser, str | None]:
    """Verify credentials and return the Portal user plus the plaintext
    ERPNext sid — None for a Distributor, who authenticates locally and
    has no ERPNext session at all; always set for every other role.

    The sid exists unencrypted only in this call chain, in memory, only
    briefly — the caller must encrypt it (see start_2fa_challenge) before
    it's held anywhere else.

    The Portal row is looked up FIRST, before anything ERPNext-related —
    an unknown or non-Active email is rejected immediately with the same
    generic message a wrong password gets, without ever touching ERPNext.
    (One side effect: an ERPNext account that exists but was never given
    Portal access now gets that same generic rejection too, rather than a
    distinct "not provisioned" error — it's rejected here before ERPNext
    is ever consulted, so there's no ERPNext session to distinguish that
    case with.) Login Attempt Policy (failed_attempts/locked_until) is
    enforced next, ahead of the actual credential check — for both auth
    paths below.
    """
    email_lower = email.lower()

    record = users_service.get_by_email(email_lower)
    if record is None or record.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    locked_until = users_service.get_lockout_status(email_lower)
    if locked_until is not None:
        raise HTTPException(
            status.HTTP_423_LOCKED,
            detail=f"Account locked due to too many failed attempts. Try again after {locked_until.isoformat()}.",
        )

    role: Role = record.portal_role
    sid: str | None
    full_name: str

    if role == "distributor":
        # No real ERPNext User exists for a Distributor — verify against
        # the locally stored bcrypt hash instead, under the exact same
        # lockout policy the ERPNext path below gets.
        if not verify_password(password, record.password_hash or ""):
            _record_failed_attempt_and_maybe_alert(email_lower)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        sid = None
        full_name = f"{record.first_name} {record.last_name}".strip() or record.email
    else:
        try:
            erpnext_session = await erpnext_login(email, password)
        except ERPNextAuthError:
            _record_failed_attempt_and_maybe_alert(email_lower)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        except ERPNextUnavailableError as exc:
            logger.error("ERPNext login unavailable for %s: %s", email, exc)
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable, please try again",
            )
        sid = erpnext_session.sid
        full_name = erpnext_session.full_name

    distributor_id: str | None = None
    distributor_ids: list[str] | None = None
    if role in ("distributor", "sales_person"):
        linked_customer = record.erpnext_customer_link
        if not linked_customer:
            if sid is not None:
                await erpnext_logout(sid)
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="No linked distributor is configured for this account. Contact your administrator.",
            )
        if role == "distributor":
            distributor_id = linked_customer
        else:
            # TODO: Sales Person is many-to-many with distributors via each
            # ERPNext Customer's embedded sales_team child table. Until the
            # real Sales Person workflow is built, this just wraps the
            # single Linked Distributor picked at Add User time — replace
            # with a real query against the ERPNext Sales Person doctype +
            # Customer.sales_team, and don't assume sales_person values
            # equal portal emails without checking a real record first.
            distributor_ids = [linked_customer]

    users_service.reset_failed_attempts(email_lower)
    user = PortalUser(
        email=email_lower,
        name=full_name,
        role=role,
        distributor_id=distributor_id,
        distributor_ids=distributor_ids,
    )
    return user, sid


def start_2fa_challenge(user: PortalUser, sid: str | None) -> tuple[str, PendingChallenge]:
    challenge_id = generate_token_id()
    code = generate_otp()
    challenge = PendingChallenge(
        user_email=user.email,
        user_name=user.name,
        role=user.role,
        distributor_id=user.distributor_id,
        distributor_ids=user.distributor_ids,
        code=code,
        masked_email=_mask_email(user.email),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.otp_ttl_minutes),
        encrypted_sid=encrypt_sid(sid) if sid is not None else None,
    )
    _pending_challenges[challenge_id] = challenge
    _deliver_otp(user.email, code)
    return challenge_id, challenge


def verify_2fa_code(challenge_id: str, code: str) -> tuple[PortalUser, bytes | None]:
    challenge = _pending_challenges.get(challenge_id)
    if challenge is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="2FA challenge not found or already used")

    if datetime.now(timezone.utc) > challenge.expires_at:
        del _pending_challenges[challenge_id]
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="2FA code expired, please log in again")

    if code != challenge.code:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect 2FA code")

    del _pending_challenges[challenge_id]
    user = PortalUser(
        email=challenge.user_email,
        name=challenge.user_name,
        role=challenge.role,
        distributor_id=challenge.distributor_id,
        distributor_ids=challenge.distributor_ids,
    )
    return user, challenge.encrypted_sid


def issue_session(user: PortalUser, encrypted_sid: bytes | None) -> tuple[str, int]:
    jti = generate_token_id()
    token_version = settings_service.get_token_version()
    token, _hard_ceiling_seconds = create_access_token(
        subject=user.email,
        role=user.role,
        jti=jti,
        token_version=token_version,
        distributor_id=user.distributor_id,
        distributor_ids=user.distributor_ids,
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
    this user's behalf. Returns None if the session doesn't exist, the
    sid's own TTL has expired, or this is a Distributor session with no
    ERPNext sid at all (local auth — see authenticate_credentials)."""
    record = _active_sessions.get(jti)
    if record is None or record.encrypted_sid is None or datetime.now(timezone.utc) > record.sid_expires_at:
        return None
    return decrypt_sid(record.encrypted_sid)


async def revoke_session(jti: str) -> None:
    record = _active_sessions.pop(jti, None)
    if record is None:
        return

    if record.encrypted_sid is None:
        # Distributor session — no ERPNext sid was ever issued, so there's
        # nothing to log out of.
        return

    try:
        sid = decrypt_sid(record.encrypted_sid)
    except Exception:
        logger.exception("Could not decrypt stored sid for session %s; skipping ERPNext logout", jti)
        return

    await erpnext_logout(sid)
