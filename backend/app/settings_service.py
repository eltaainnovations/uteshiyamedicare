"""Company Profile / Branding config storage plus live ERPNext connection
status for the two scoped API keys in config.py.

Settings are a single JSON row per category in SQLite (portal_db_path,
same file as portal_users) — current values only, overwritten on save, no
history. ERP status is never cached: every GET/POST does a fresh
authenticated ping, matching the rest of this backend's live-proxy
architecture (see erpnext_client.py's module docstring) rather than
implying a sync/cache layer that doesn't exist.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import settings
from .erpnext_client import ERPNextUnavailableError, erpnext_get_count
from .schemas import (
    BrandingConfig,
    CompanyProfileConfig,
    EmailConfig,
    EmailConfigUpdate,
    ErpConnectionStatus,
    NotificationRulesConfig,
    SecurityConfig,
)

_DB_PATH = Path(__file__).resolve().parent.parent / settings.portal_db_path

# Seeded with the same placeholder company data the frontend previously
# hardcoded, so a fresh install's first GET renders real-looking values
# instead of empty/invalid fields (support_email is a required EmailStr).
_DEFAULTS: dict[str, dict[str, Any]] = {
    "company_profile": {
        "logo_url": None,
        "company_name": "Uteshiya Medicare Pvt. Ltd.",
        "legal_name": "Uteshiya Medicare Private Limited",
        "industry": "Medical Devices",
        "year_incorporated": "2008",
        "registered_address": "Plot No. 42, GIDC Industrial Estate, Phase II",
        "city": "Surat",
        "state": "Gujarat",
        "pincode": "395010",
        "country": "India",
        "billing_same_as_registered": True,
        "phone": "+91 98765 43210",
        "support_email": "support@uteshiya.com",
        "website": "https://www.uteshiya.com",
        "customer_care": "1800-XXX-XXXX",
    },
    "branding": {
        "primary_logo_url": None,
        "email_header_logo_url": None,
        "favicon_url": None,
        "email_footer_text": "© 2025 Uteshiya Medicare Pvt. Ltd. · Plot No. 42, GIDC Industrial Estate, Surat, Gujarat",
        "email_accent_color": "#147BA6",
    },
    "security": {
        "min_password_length": 8,
        "password_expiry_days": 90,
        "require_uppercase": True,
        "require_number": True,
        "require_special_char": False,
        "prevent_reuse_count": 5,
        "session_timeout_minutes": 10,
        "max_concurrent_sessions": 1,
        "max_failed_attempts": 5,
        "lockout_duration_minutes": 15,
        "lockout_email_alert": True,
    },
    "email_config": {
        "smtp_host": "",
        "smtp_port": 587,
        "encryption": "TLS",
        "smtp_username": "",
        "smtp_password": "",
        "from_name": "",
        "from_email": "",
        "reply_to_email": None,
        "reply_to_name": None,
    },
    "notification_rules": {
        "welcome_email": True,
        "password_reset_email": True,
        "account_status_change_email": True,
    },
    # Kept in its own category (not folded into "security") specifically so
    # a normal Security-page save — which round-trips only SecurityConfig's
    # fields — can never clobber it by omission.
    "auth_state": {
        "token_version": 0,
    },
}


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_drop_category_check(conn: sqlite3.Connection) -> None:
    """Phase 1 created app_settings with CHECK (category IN
    ('company_profile','branding')). Phase 2 adds new categories, so that
    constraint has to go — SQLite can't ALTER a CHECK away, so this rebuilds
    the table (data-preserving) the one time it finds the old constraint."""
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='app_settings'").fetchone()
    if row is None or row["sql"] is None or "CHECK" not in row["sql"]:
        return
    conn.executescript(
        """
        CREATE TABLE app_settings_new (
            category   TEXT PRIMARY KEY,
            data       TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        INSERT INTO app_settings_new SELECT * FROM app_settings;
        DROP TABLE app_settings;
        ALTER TABLE app_settings_new RENAME TO app_settings;
        """
    )


def init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                category   TEXT PRIMARY KEY,
                data       TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        _migrate_drop_category_check(conn)


init_db()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_category(category: str) -> dict[str, Any]:
    with _get_conn() as conn:
        row = conn.execute("SELECT data FROM app_settings WHERE category = ?", (category,)).fetchone()
    return json.loads(row["data"]) if row else _DEFAULTS[category]


def _put_category(category: str, data: dict[str, Any]) -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO app_settings (category, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(category) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
            """,
            (category, json.dumps(data), _now()),
        )


def get_company_profile() -> CompanyProfileConfig:
    return CompanyProfileConfig(**_get_category("company_profile"))


def put_company_profile(config: CompanyProfileConfig) -> CompanyProfileConfig:
    _put_category("company_profile", config.model_dump())
    return config


def get_branding() -> BrandingConfig:
    return BrandingConfig(**_get_category("branding"))


def put_branding(config: BrandingConfig) -> BrandingConfig:
    _put_category("branding", config.model_dump())
    return config


def get_security_config() -> SecurityConfig:
    return SecurityConfig(**_get_category("security"))


def put_security_config(config: SecurityConfig) -> SecurityConfig:
    _put_category("security", config.model_dump())
    return config


def get_token_version() -> int:
    return _get_category("auth_state")["token_version"]


def bump_token_version() -> int:
    data = _get_category("auth_state")
    data["token_version"] = data.get("token_version", 0) + 1
    _put_category("auth_state", data)
    return data["token_version"]


def get_email_config() -> EmailConfig:
    data = _get_category("email_config")
    return EmailConfig(
        smtp_host=data["smtp_host"],
        smtp_port=data["smtp_port"],
        encryption=data["encryption"],
        smtp_username=data["smtp_username"],
        has_password=bool(data.get("smtp_password")),
        from_name=data["from_name"],
        from_email=data["from_email"],
        reply_to_email=data.get("reply_to_email"),
        reply_to_name=data.get("reply_to_name"),
    )


def put_email_config(update: EmailConfigUpdate) -> EmailConfig:
    existing = _get_category("email_config")
    merged = {
        "smtp_host": update.smtp_host,
        "smtp_port": update.smtp_port,
        "encryption": update.encryption,
        "smtp_username": update.smtp_username,
        "smtp_password": update.smtp_password if update.smtp_password is not None else existing.get("smtp_password", ""),
        "from_name": update.from_name,
        "from_email": update.from_email,
        "reply_to_email": update.reply_to_email,
        "reply_to_name": update.reply_to_name,
    }
    _put_category("email_config", merged)
    return get_email_config()


def get_email_config_internal() -> dict[str, Any]:
    """Raw config including the plaintext smtp_password — for
    email_service's own use when actually connecting to SMTP. Never
    exposed through the API; get_email_config() above is the public view."""
    return _get_category("email_config")


def get_notification_rules() -> NotificationRulesConfig:
    return NotificationRulesConfig(**_get_category("notification_rules"))


def put_notification_rules(config: NotificationRulesConfig) -> NotificationRulesConfig:
    _put_category("notification_rules", config.model_dump())
    return config


# label -> (configured key, whether it uses the Users-scoped token, the
# doctype that key actually has permission to read) — mirrors the two auth
# modes erpnext_client.py already exposes, so this reuses erpnext_get_count
# exactly as Products/Orders do rather than adding a new ERPNext call path.
_ERP_KEYS: dict[str, tuple[str, bool, str]] = {
    "Users": (settings.erpnext_user_api_key, True, "User"),
    "Catalogue": (settings.erpnext_catalogue_api_key, False, "Item"),
}


def _mask_key(key: str) -> str:
    if len(key) <= 4:
        return "•" * len(key)
    return "•" * (len(key) - 4) + key[-4:]


async def _check_connection(label: str) -> ErpConnectionStatus | None:
    key, use_user_token, doctype = _ERP_KEYS[label]
    if not key:
        return None

    error: str | None = None
    connected = False
    try:
        await erpnext_get_count(doctype, use_user_token=use_user_token)
        connected = True
    except ERPNextUnavailableError as exc:
        error = str(exc)

    return ErpConnectionStatus(label=label, masked_key=_mask_key(key), connected=connected, last_tested=_now(), error=error)


async def get_erp_status() -> list[ErpConnectionStatus]:
    results = []
    for label in _ERP_KEYS:
        status_ = await _check_connection(label)
        if status_ is not None:
            results.append(status_)
    return results


async def test_erp_connection(key_label: str) -> ErpConnectionStatus:
    label = next((lbl for lbl in _ERP_KEYS if lbl.lower() == key_label.lower()), None)
    if label is None:
        raise KeyError(f"Unknown ERP key label: {key_label}")
    status_ = await _check_connection(label)
    if status_ is None:
        raise KeyError(f"No API key configured for {label}")
    return status_
