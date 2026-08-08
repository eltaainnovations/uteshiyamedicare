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


settings = Settings()
