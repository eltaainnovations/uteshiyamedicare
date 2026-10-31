from pathlib import Path
from cryptography.fernet import Fernet
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(Path(__file__).resolve().parent.parent / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"

    # ERPNext instance this Portal authenticates against, via ERPNext's
    # cookie-based /api/method/login and /api/method/logout only — not
    # the token-based auth used for server-to-server ERPNext calls.
    erpnext_base_url: str = "https://test.uteshiyamedicare.com"

    # How long the encrypted ERPNext sid is kept server-side. ERPNext's
    # own sid cookie doesn't reliably expose a usable Max-Age, so this is
    # config-driven — set it to match your ERPNext instance's
    # "session_expiry" system setting rather than relying on the cookie.
    erpnext_sid_ttl_minutes: int = 480

    # Key used to encrypt the ERPNext sid at rest in the server-side
    # session store. Not set in .env -> a fresh random key is generated
    # per process start, which is fine since sessions are in-memory only
    # (see auth_service.py) and never survive a restart anyway. Set this
    # explicitly once sessions move to persistent storage.
    sid_encryption_key: str = Field(default_factory=lambda: Fernet.generate_key().decode("utf-8"))

    @field_validator("sid_encryption_key", mode="before")
    @classmethod
    def _generate_if_blank(cls, value: str | None) -> str:
        # An empty SID_ENCRYPTION_KEY in .env (e.g. left blank from the
        # .env.example template) counts as "set" to pydantic-settings, so
        # it would otherwise bypass default_factory above and reach
        # Fernet() as an invalid empty key.
        return value or Fernet.generate_key().decode("utf-8")

    # Rolling inactivity window (PROJECT_CONTEXT.md: "session timeout after
    # 10 min inactivity"). Enforced server-side in auth_service.touch_session,
    # not just via JWT exp.
    session_timeout_minutes: int = 10

    # Hard ceiling on the JWT itself, independent of activity — a safety net
    # so a token can never be replayed indefinitely even if session state
    # were somehow lost.
    token_hard_ceiling_minutes: int = 60

    otp_ttl_minutes: int = 5
    otp_resend_cooldown_seconds: int = 30

    # When true, /auth/login echoes the 2FA code back in the response (dev_otp)
    # and logs it, instead of emailing it. Set to False now that real SMTP is active.
    demo_mode: bool = False

    # Default SMTP configuration for email delivery
    smtp_host: str = "smtp-relay.brevo.com"
    smtp_port: int = 2525
    smtp_encryption: str = "TLS"
    smtp_username: str = "c0ab63001@smtp-brevo.com"
    smtp_password: str = ""
    smtp_from_name: str = "Uteshiya Medicare"
    smtp_from_email: str = "info@uteshiyamedicare.com"

    # Info Channel Credentials (OTP, Welcome, Reset Password, Account Alerts)
    smtp_info_host: str = "smtp-relay.brevo.com"
    smtp_info_port: int = 2525
    smtp_info_encryption: str = "TLS"
    smtp_info_username: str = "c0ab63001@smtp-brevo.com"
    smtp_info_password: str = ""
    smtp_info_name: str = "Uteshiya Medicare"
    smtp_info_email: str = "info@uteshiyamedicare.com"

    # Orders Channel Credentials (Order Approvals, Order Status Notifications)
    smtp_orders_host: str = "smtp-relay.brevo.com"
    smtp_orders_port: int = 2525
    smtp_orders_encryption: str = "TLS"
    smtp_orders_username: str = "c0a4b1001@smtp-brevo.com"
    smtp_orders_password: str = ""
    smtp_orders_name: str = "Uteshiya Medicare Orders"
    smtp_orders_email: str = "placeorder@uteshiyamedicare.com"

    cors_origins: list[str] = ["http://localhost:5173"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: object) -> list[str]:
        # Resilient parser: prevents 502 startup crashes if .env has unquoted or malformed arrays
        if isinstance(value, list):
            return [str(v).strip() for v in value if v]
        if isinstance(value, str):
            v_str = value.strip()
            if v_str.startswith("[") and v_str.endswith("]"):
                try:
                    import json
                    parsed = json.loads(v_str)
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed if x]
                except Exception:
                    v_str = v_str[1:-1]
            return [s.strip().strip("'"") for s in v_str.split(",") if s.strip()]
        return ["http://localhost:5173"]

    # Token-based ERPNext auth for server-to-server User provisioning
    # (Authorization: token <key>:<secret>). Separate from the cookie-based
    # sid flow in erpnext_client.erpnext_login/erpnext_logout — never mix
    # the two. This key is scoped to User writes per the API doc; never
    # send it to the frontend, never log it.
    erpnext_user_api_key: str = ""
    erpnext_user_api_secret: str = ""

    # Token-based ERPNext auth for the read-only Product Catalogue
    # (Authorization: token <key>:<secret>). Deliberately a separate,
    # read-only-scoped key from erpnext_user_api_key/secret above — the
    # catalogue feature never creates/updates/deletes, so it must not be
    # able to even if the ERPNext role permissions changed.
    erpnext_catalogue_api_key: str = ""
    erpnext_catalogue_api_secret: str = ""

    # Where the "approve this new user" email goes.
    admin_approval_email: str = "jaliapoojan@gmail.com"

    approval_token_ttl_hours: int = 72
    onboarding_token_ttl_hours: int = 168

    # Shree Maruti (innofulfill) Client Booking API — used only for
    # read-only shipment tracking by manually-entered docket (see
    # maruti_client.py). Beta base URL by default. clientcode + secretkey
    # are backend-only; secretkey is used solely for the daily /login and
    # must never reach the frontend.
    maruti_base_url: str = "https://bookingapis.innofulfill.com/shipment/clientbookingbeta_v6"
    maruti_client_code: str = "148874"
    maruti_secret_key: str = "NOj4wz9LSHCJ"
    # Public, user-facing tracking page — linked from the Track Shipment
    # screen. The live SPA reads the docket from `?d=<docket>`
    # (maruti_service._tracking_url builds the full link).
    maruti_public_tracking_url: str = "https://tracking.shreemaruti.com"

    # SQLite file holding the Portal users table — the only thing in this
    # backend that needs to survive a restart (unlike the in-memory OTP/
    # session stores in auth_service.py).
    portal_db_path: str = "portal.db"

    # Public base URL of this backend, used to build the approve/onboarding
    # links embedded in emails.
    backend_base_url: str = "http://localhost:8000"

    # Public base URL of the React app. Only the password-reset email link
    # points here (users_service.request_password_reset) — the first-time
    # onboarding welcome-email link still points at backend_base_url's
    # plain HTML form above, since that flow wasn't rebuilt as a React page.
    frontend_base_url: str = "http://localhost:5173"


settings = Settings()
