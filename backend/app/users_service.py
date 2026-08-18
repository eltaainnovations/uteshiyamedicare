"""Portal user provisioning: the Portal users table and the Draft ->
approval -> Active workflow built on top of ERPNext's User API.

Everything for this feature lives in this one module plus the token-auth
functions in erpnext_client.py — deliberately not split further.
"""

import logging
import secrets
import sqlite3
import string
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, status

from .config import settings
from .erpnext_client import ERPNextDuplicateUserError, ERPNextUnavailableError, erpnext_create_user, erpnext_update_user
from .schemas import PortalUserStatus, Role

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
    # TODO(follow-up): send via real SMTP once email infra exists — same
    # gap as OTP delivery in auth_service.py. Logged for now.
    logger.info("Email to %s: %s\n%s", to, subject, body)


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
                onboarding_token = ?, onboarding_token_expires_at = ?, updated_at = ?
            WHERE email = ?
            """,
            (onboarding_token, _iso(onboarding_expires), _iso(now), record.email),
        )

    onboarding_url = f"{settings.backend_base_url}/users/onboarding/{onboarding_token}"
    _send_email(
        record.email,
        "Welcome to the Uteshiya Medicare Portal",
        f"Your account has been created. Set your password: {onboarding_url}\n"
        f"This link expires {_iso(onboarding_expires)}.",
    )
    return True, "User approved and provisioned. An onboarding email has been sent."


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


async def set_password_via_onboarding(token: str, new_password: str) -> tuple[bool, str]:
    if len(new_password) < 8:
        return False, "Password must be at least 8 characters."

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

    try:
        await erpnext_update_user(record.email, {"new_password": new_password})
    except ERPNextUnavailableError:
        return False, "Could not update your password right now. Please try again shortly."

    with _get_conn() as conn:
        conn.execute(
            "UPDATE portal_users SET onboarding_token = NULL, onboarding_token_expires_at = NULL, updated_at = ? "
            "WHERE email = ?",
            (_iso(_now()), record.email),
        )
    return True, "Your password has been set. You can now log in to the Portal."


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

    try:
        await erpnext_update_user(record.email, {"enabled": 0})
    except ERPNextUnavailableError as exc:
        logger.warning("ERPNext disable failed for %s (local disable already applied): %s", record.email, exc)

    updated = get_by_email(email)
    assert updated is not None
    return updated
