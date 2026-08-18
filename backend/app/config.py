from cryptography.fernet import Fernet
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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

    # No SMTP integration yet, see PROJECT_CONTEXT.md admin "Email
    # Management". While true, the 2FA code is logged and echoed back in
    # the login response instead of emailed.
    demo_mode: bool = True

    cors_origins: list[str] = ["http://localhost:5173"]

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

    # SQLite file holding the Portal users table — the only thing in this
    # backend that needs to survive a restart (unlike the in-memory OTP/
    # session stores in auth_service.py).
    portal_db_path: str = "portal.db"

    # Public base URL of this backend, used to build the approve/onboarding
    # links embedded in emails.
    backend_base_url: str = "http://localhost:8000"


settings = Settings()
