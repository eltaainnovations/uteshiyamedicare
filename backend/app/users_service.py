"""Portal user provisioning: the Portal users table and the Draft ->
approval -> Active workflow built on top of ERPNext's User API.

Everything for this feature lives in this one module plus the token-auth
functions in erpnext_client.py — deliberately not split further.
"""

import json
import logging
import secrets
import sqlite3
import string
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, status

from . import email_service, settings_service
from .config import settings
from .erpnext_client import (
    ERPNextAuthError,
    ERPNextDuplicateUserError,
    ERPNextNotFoundError,
    ERPNextUnavailableError,
    erpnext_create_user,
    erpnext_get_doc,
    erpnext_login,
    erpnext_logout,
    erpnext_update_user,
)
from .schemas import PortalUserStatus, Role
from .security import check_password_policy, hash_password, verify_password

logger = logging.getLogger("users")

_DB_PATH = Path(__file__).resolve().parent.parent / settings.portal_db_path


@dataclass
class PortalUserRow:
    email: str
    first_name: str
    last_name: str
    portal_role: Role
    erpnext_customer_link: str | None
    status: PortalUserStatus
    failure_reason: str | None
    requested_by_email: str
    approval_token: str | None
    approval_token_expires_at: str | None
    onboarding_token: str | None
    onboarding_token_expires_at: str | None
    created_at: str
    updated_at: str
    failed_attempts: int
    locked_until: str | None
    password_history: str | None
    password_hash: str | None


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS portal_users (
                email                       TEXT PRIMARY KEY,
                first_name                  TEXT NOT NULL,
                last_name                   TEXT NOT NULL DEFAULT '',
                portal_role                 TEXT NOT NULL CHECK (portal_role IN ('admin','manager','distributor','sales_person')),
                erpnext_customer_link       TEXT,
                status                      TEXT NOT NULL CHECK (status IN ('draft','active','failed','disabled')) DEFAULT 'draft',
                failure_reason              TEXT,
                requested_by_email          TEXT NOT NULL,
                approval_token              TEXT,
                approval_token_expires_at   TEXT,
                onboarding_token            TEXT,
                onboarding_token_expires_at TEXT,
                created_at                  TEXT NOT NULL,
                updated_at                  TEXT NOT NULL
            )
            """
        )
        # Phase 2 additions — CREATE TABLE IF NOT EXISTS above won't retrofit
        # an already-existing table, so these are applied as a one-time,
        # idempotent migration (ALTER fails harmlessly once the column exists).
        for column_ddl in (
            "ALTER TABLE portal_users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE portal_users ADD COLUMN locked_until TEXT",
            "ALTER TABLE portal_users ADD COLUMN password_history TEXT",
            # Local (Portal-only) auth for Distributor accounts, which have
            # no real ERPNext User — see authenticate_credentials and
            # _apply_new_password. NULL for every other role; never
            # populated, never checked for admin/manager/sales_person.
            "ALTER TABLE portal_users ADD COLUMN password_hash TEXT",
        ):
            try:
                conn.execute(column_ddl)
            except sqlite3.OperationalError:
                pass  # column already exists


init_db()


def _row_to_record(row: sqlite3.Row) -> PortalUserRow:
    return PortalUserRow(**{key: row[key] for key in row.keys()})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _generate_temp_password() -> str:
    # Guarantee upper/lower/digit/special so ERPNext's password policy
    # never rejects it silently.
    required = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%"),
    ]
    filler = [secrets.choice(string.ascii_letters + string.digits) for _ in range(10)]
    chars = required + filler
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def _send_email(to: str, subject: str, body: str) -> None:
    email_service.send_email(to, subject, body)


def get_lockout_status(email: str) -> datetime | None:
    """Returns the active lockout expiry, or None if unlocked (including a
    lock whose expiry has already passed)."""
    with _get_conn() as conn:
        row = conn.execute("SELECT locked_until FROM portal_users WHERE email = ?", (email.lower(),)).fetchone()
    if row is None or row["locked_until"] is None:
        return None
    locked_until = datetime.fromisoformat(row["locked_until"])
    return locked_until if _now() < locked_until else None


def record_failed_login(email: str) -> str | None:
    """Increments failed_attempts; once it reaches the configured
    threshold, sets locked_until and resets the counter. Returns the new
    locked_until (ISO string) if this call just triggered a lockout, else
    None. No-ops for an email with no portal_users row — nothing local to
    track a lockout against."""
    email = email.lower()
    security = settings_service.get_security_config()
    with _get_conn() as conn:
        row = conn.execute("SELECT failed_attempts FROM portal_users WHERE email = ?", (email,)).fetchone()
        if row is None:
            return None
        attempts = row["failed_attempts"] + 1
        now = _now()
        if attempts >= security.max_failed_attempts:
            locked_until = _iso(now + timedelta(minutes=security.lockout_duration_minutes))
            conn.execute(
                "UPDATE portal_users SET failed_attempts = 0, locked_until = ?, updated_at = ? WHERE email = ?",
                (locked_until, _iso(now), email),
            )
            return locked_until
        conn.execute(
            "UPDATE portal_users SET failed_attempts = ?, updated_at = ? WHERE email = ?",
            (attempts, _iso(now), email),
        )
        return None


def reset_failed_attempts(email: str) -> None:
    with _get_conn() as conn:
        conn.execute(
            "UPDATE portal_users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE email = ?",
            (_iso(_now()), email.lower()),
        )


def get_role(email: str) -> Role | None:
    """Only Active portal users get a role — Draft/Failed/Disabled all
    fail the /auth/login provisioning check via this returning None."""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT portal_role FROM portal_users WHERE email = ? AND status = 'active'", (email.lower(),)
        ).fetchone()
    return row["portal_role"] if row else None


def get_by_email(email: str) -> PortalUserRow | None:
    with _get_conn() as conn:
        row = conn.execute("SELECT * FROM portal_users WHERE email = ?", (email.lower(),)).fetchone()
    return _row_to_record(row) if row else None


def list_users() -> list[PortalUserRow]:
    with _get_conn() as conn:
        rows = conn.execute("SELECT * FROM portal_users ORDER BY created_at DESC").fetchall()
    return [_row_to_record(row) for row in rows]


def create_draft(
    *,
    email: str,
    first_name: str,
    last_name: str,
    portal_role: Role,
    erpnext_customer_link: str | None,
    requested_by_email: str,
) -> PortalUserRow:
    email = email.lower()
    now = _now()
    approval_token = secrets.token_urlsafe(32)
    approval_expires = now + timedelta(hours=settings.approval_token_ttl_hours)

    with _get_conn() as conn:
        try:
            conn.execute(
                """
                INSERT INTO portal_users (
                    email, first_name, last_name, portal_role, erpnext_customer_link,
                    status, requested_by_email, approval_token, approval_token_expires_at,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
                """,
                (
                    email,
                    first_name,
                    last_name,
                    portal_role,
                    erpnext_customer_link,
                    requested_by_email,
                    approval_token,
                    _iso(approval_expires),
                    _iso(now),
                    _iso(now),
                ),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="A portal user with this email already exists")

    approve_url = f"{settings.backend_base_url}/users/approve/{approval_token}"
    _send_email(
        settings.admin_approval_email,
        f"Approve new Portal user: {email}",
        f"{first_name} {last_name} <{email}> requested as {portal_role}.\n\nApprove: {approve_url}\n"
        f"This link expires {_iso(approval_expires)}.",
    )

    record = get_by_email(email)
    assert record is not None
    return record


async def link_existing_user(
    *,
    email: str,
    portal_role: Role,
    erpnext_customer_link: str | None,
    requested_by_email: str,
) -> PortalUserRow:
    """Links an already-existing, enabled ERPNext User straight to an
    Active portal_users row — alternate to create_draft's Draft ->
    approval -> erpnext_create_user flow, for accounts (test or real)
    that predate the Portal. No ERPNext account is created and no
    onboarding token is issued: the person already has working ERPNext
    credentials, so there's no first-time password to set."""
    if portal_role == "distributor":
        # Distributor accounts use local Portal authentication and never
        # have a real ERPNext User (see authenticate_credentials) — there
        # is nothing for this flow to link to. Use "Add User" instead.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Distributor accounts don't use ERPNext accounts — use \"Add User\" instead of linking an existing one.",
        )

    email = email.lower()

    if get_by_email(email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="A portal user with this email already exists")

    try:
        doc = await erpnext_get_doc("User", email, use_user_token=True)
    except ERPNextNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No ERPNext user exists with this email")
    except ERPNextUnavailableError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Could not reach ERPNext. Please try again shortly.")

    if not doc.get("enabled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="This ERPNext user is disabled. Enable it in ERPNext first.")

    first_name = doc.get("first_name") or email.split("@")[0]
    last_name = doc.get("last_name") or ""

    # A user created directly in ERPNext (rather than via
    # erpnext_create_user, which always sets this) may be missing the
    # Customer role the Portal relies on.
    existing_roles = {r.get("role") for r in doc.get("roles", [])}
    if "Customer" not in existing_roles:
        await erpnext_update_user(email, {"roles": [{"role": "Customer"}]})

    now = _now()
    with _get_conn() as conn:
        try:
            conn.execute(
                """
                INSERT INTO portal_users (
                    email, first_name, last_name, portal_role, erpnext_customer_link,
                    status, requested_by_email, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
                """,
                (email, first_name, last_name, portal_role, erpnext_customer_link, requested_by_email, _iso(now), _iso(now)),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="A portal user with this email already exists")

    if settings_service.get_notification_rules().welcome_email:
        _send_email(
            email,
            "Your Uteshiya Medicare Portal access is ready",
            f"Your existing ERPNext account now has access to the Portal as {portal_role}. "
            f"Log in with your usual ERPNext email and password at {settings.frontend_base_url}/login.\n"
            'Use "Forgot password?" there if you\'d like to set a new one.',
        )

    record = get_by_email(email)
    assert record is not None
    return record


async def approve_and_provision(token: str) -> tuple[bool, str]:
    with _get_conn() as conn:
        row = conn.execute("SELECT * FROM portal_users WHERE approval_token = ?", (token,)).fetchone()

    if row is None:
        return False, "This approval link is invalid or was already used."

    record = _row_to_record(row)
    if record.status != "draft":
        return False, "This user has already been processed."

    expires_at = datetime.fromisoformat(record.approval_token_expires_at) if record.approval_token_expires_at else None
    if expires_at is not None and _now() > expires_at:
        return False, "This approval link has expired. Please ask the admin to re-submit the request."

    temp_password = _generate_temp_password()
    now = _now()

    if record.portal_role == "distributor":
        # Distributor accounts have no real ERPNext User and never will —
        # the temp password is hashed and stored locally instead of sent
        # to ERPNext, and gets overwritten for real at the onboarding step
        # below, same as the ERPNext-backed roles' temp password does.
        password_hash = hash_password(temp_password)
    else:
        password_hash = None
        try:
            await erpnext_create_user(
                email=record.email,
                first_name=record.first_name,
                last_name=record.last_name,
                new_password=temp_password,
                roles=["Customer"],
            )
        except ERPNextDuplicateUserError:
            _mark_failed(record.email, "ERPNext already has a user with this email (duplicate)")
            return False, "Provisioning failed: a user with this email already exists in ERPNext."
        except ERPNextUnavailableError as exc:
            _mark_failed(record.email, f"ERPNext error: {exc}")
            return False, "Provisioning failed due to an ERPNext error. Please contact the administrator."

    onboarding_token = secrets.token_urlsafe(32)
    onboarding_expires = now + timedelta(hours=settings.onboarding_token_ttl_hours)
    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE portal_users
            SET status = 'active', approval_token = NULL, approval_token_expires_at = NULL,
                onboarding_token = ?, onboarding_token_expires_at = ?, updated_at = ?,
                password_hash = COALESCE(?, password_hash)
            WHERE email = ?
            """,
            (onboarding_token, _iso(onboarding_expires), _iso(now), password_hash, record.email),
        )

    welcome_enabled = settings_service.get_notification_rules().welcome_email
    onboarding_url = f"{settings.backend_base_url}/users/onboarding/{onboarding_token}"
    if welcome_enabled:
        _send_email(
            record.email,
            "Welcome to the Uteshiya Medicare Portal",
            f"Your account has been created. Set your password: {onboarding_url}\n"
            f"This link expires {_iso(onboarding_expires)}.",
        )
    message = (
        "User approved and provisioned. An onboarding email has been sent."
        if welcome_enabled
        else f"User approved and provisioned. Welcome Email is disabled in Notification Rules — share this link manually: {onboarding_url}"
    )
    return True, message


def _mark_failed(email: str, reason: str) -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE portal_users
            SET status = 'failed', failure_reason = ?, approval_token = NULL,
                approval_token_expires_at = NULL, updated_at = ?
            WHERE email = ?
            """,
            (reason, _iso(_now()), email),
        )


def _check_password_reuse(password_history_json: str | None, new_password: str, prevent_reuse_count: int) -> bool:
    """True if new_password matches one of the last N stored hashes.
    Shared by every place a password is actually set — onboarding, reset,
    and self-service change — so the rule can't drift between them."""
    if prevent_reuse_count <= 0:
        return False
    history: list[str] = json.loads(password_history_json) if password_history_json else []
    return any(verify_password(new_password, h) for h in history)


def _record_password_history(email: str, password_history_json: str | None, new_password: str, prevent_reuse_count: int) -> None:
    history: list[str] = json.loads(password_history_json) if password_history_json else []
    new_history = ([hash_password(new_password)] + history)[:prevent_reuse_count]
    with _get_conn() as conn:
        conn.execute(
            "UPDATE portal_users SET password_history = ?, updated_at = ? WHERE email = ?",
            (json.dumps(new_history), _iso(_now()), email),
        )


async def _apply_new_password(record: PortalUserRow, new_password: str) -> None:
    """Writes new_password wherever it actually lives for this role —
    the local hash for Distributor (no ERPNext User exists to update),
    ERPNext for everyone else. Shared by set_password_via_onboarding and
    change_own_password so the two can't drift on this. Raises
    ERPNextUnavailableError exactly as the old inline erpnext_update_user
    call did — that can only happen on the non-Distributor branch."""
    if record.portal_role == "distributor":
        with _get_conn() as conn:
            conn.execute(
                "UPDATE portal_users SET password_hash = ?, updated_at = ? WHERE email = ?",
                (hash_password(new_password), _iso(_now()), record.email),
            )
    else:
        await erpnext_update_user(record.email, {"new_password": new_password})


async def set_password_via_onboarding(token: str, new_password: str) -> tuple[bool, str]:
    """Sets a password given a valid token from the onboarding_token
    column. Serves both first-time onboarding (approve_and_provision) and
    password-reset (request_password_reset) — same mechanism, same
    column, different email copy at the point the token is issued."""
    with _get_conn() as conn:
        row = conn.execute("SELECT * FROM portal_users WHERE onboarding_token = ?", (token,)).fetchone()

    if row is None:
        return False, "This link is invalid or was already used."

    record = _row_to_record(row)
    expires_at = (
        datetime.fromisoformat(record.onboarding_token_expires_at) if record.onboarding_token_expires_at else None
    )
    if expires_at is not None and _now() > expires_at:
        return False, "This link has expired. Please contact your administrator for a new invite."

    # Covers the case where the account was disabled after this token was
    # issued (request_password_reset already refuses to issue one to a
    # non-active account, but that doesn't retroactively invalidate a link
    # sent while the account was still active).
    if record.status == "disabled":
        return False, "This account is disabled. Contact your administrator."

    security = settings_service.get_security_config()
    violations = check_password_policy(new_password, security)
    if violations:
        return False, " ".join(violations)

    if _check_password_reuse(record.password_history, new_password, security.prevent_reuse_count):
        return False, f"You can't reuse any of your last {security.prevent_reuse_count} password(s). Choose a different one."

    try:
        await _apply_new_password(record, new_password)
    except ERPNextUnavailableError:
        return False, "Could not update your password right now. Please try again shortly."

    with _get_conn() as conn:
        conn.execute(
            "UPDATE portal_users SET onboarding_token = NULL, onboarding_token_expires_at = NULL, updated_at = ? WHERE email = ?",
            (_iso(_now()), record.email),
        )
    _record_password_history(record.email, record.password_history, new_password, security.prevent_reuse_count)
    return True, "Your password has been set. You can now log in to the Portal."


async def change_own_password(email: str, current_password: str, new_password: str) -> tuple[bool, str]:
    """Self-service password change for an already-logged-in user. Never
    trusts the client-supplied current_password — verifies it the same
    way a real login does (local hash for Distributor, ERPNext for
    everyone else — see authenticate_credentials), then applies the
    exact same policy/reuse checks and password write as onboarding
    above."""
    email = email.lower()
    record = get_by_email(email)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Portal user not found")

    if record.portal_role == "distributor":
        if not verify_password(current_password, record.password_hash or ""):
            return False, "Current password is incorrect."
    else:
        try:
            session = await erpnext_login(email, current_password)
        except ERPNextAuthError:
            return False, "Current password is incorrect."
        except ERPNextUnavailableError:
            return False, "Could not verify your current password right now. Please try again shortly."
        else:
            # Verification-only login — this sid is never stored, so it
            # must be closed immediately rather than left as an orphaned
            # ERPNext session (same reasoning as
            # auth_service.authenticate_credentials when a login succeeds
            # but the caller can't proceed).
            await erpnext_logout(session.sid)

    security = settings_service.get_security_config()
    violations = check_password_policy(new_password, security)
    if violations:
        return False, " ".join(violations)

    if _check_password_reuse(record.password_history, new_password, security.prevent_reuse_count):
        return False, f"You can't reuse any of your last {security.prevent_reuse_count} password(s). Choose a different one."

    try:
        await _apply_new_password(record, new_password)
    except ERPNextUnavailableError:
        return False, "Could not change your password right now. Please try again shortly."

    _record_password_history(record.email, record.password_history, new_password, security.prevent_reuse_count)
    return True, "Your password has been changed."


async def request_password_reset(email: str) -> None:
    """Issues a fresh onboarding_token for an active user and emails a
    reset link — the router always returns a generic response regardless
    of outcome, so this silently no-ops for unknown/non-active emails
    rather than let the caller distinguish (no account enumeration)."""
    record = get_by_email(email.lower())
    if record is None or record.status != "active":
        return

    now = _now()
    reset_token = secrets.token_urlsafe(32)
    reset_expires = now + timedelta(hours=settings.onboarding_token_ttl_hours)
    with _get_conn() as conn:
        conn.execute(
            "UPDATE portal_users SET onboarding_token = ?, onboarding_token_expires_at = ?, updated_at = ? WHERE email = ?",
            (reset_token, _iso(reset_expires), _iso(now), record.email),
        )

    if settings_service.get_notification_rules().password_reset_email:
        reset_url = f"{settings.frontend_base_url}/reset-password?token={reset_token}"
        _send_email(
            record.email,
            "Reset your Portal password",
            f"A password reset was requested for your account. Set a new password: {reset_url}\n"
            f"This link expires {_iso(reset_expires)}. If you didn't request this, you can ignore this email.",
        )


async def disable_user(email: str) -> PortalUserRow:
    record = get_by_email(email)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Portal user not found")

    # Local status flips first and unconditionally — this alone blocks
    # /auth/login regardless of what happens to the ERPNext call below.
    with _get_conn() as conn:
        conn.execute(
            "UPDATE portal_users SET status = 'disabled', updated_at = ? WHERE email = ?",
            (_iso(_now()), record.email),
        )

    if record.portal_role != "distributor":
        try:
            await erpnext_update_user(record.email, {"enabled": 0})
        except ERPNextUnavailableError as exc:
            logger.warning("ERPNext disable failed for %s (local disable already applied): %s", record.email, exc)

    if settings_service.get_notification_rules().account_status_change_email:
        _send_email(
            record.email,
            "Your Portal account status has changed",
            f"Your account ({record.email}) has been disabled. Contact your administrator if this wasn't expected.",
        )

    updated = get_by_email(email)
    assert updated is not None
    return updated
