import secrets
import string
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import bcrypt
import jwt
from cryptography.fernet import Fernet

from .config import settings
from .schemas import SecurityConfig


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def generate_token_id() -> str:
    return secrets.token_urlsafe(16)


def create_access_token(*, subject: str, role: str, jti: str, token_version: int) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    hard_ceiling = timedelta(minutes=settings.token_hard_ceiling_minutes)
    payload = {
        "sub": subject,
        "role": role,
        "jti": jti,
        "tv": token_version,
        "iat": now,
        "exp": now + hard_ceiling,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, int(hard_ceiling.total_seconds())


def check_password_policy(password: str, policy: SecurityConfig) -> list[str]:
    """Local policy check ahead of the ERPNext password write — see
    users_service.set_password_via_onboarding, the only place a password is
    actually set today."""
    violations = []
    if len(password) < policy.min_password_length:
        violations.append(f"Password must be at least {policy.min_password_length} characters long.")
    if policy.require_uppercase and not any(c.isupper() for c in password):
        violations.append("Password must include an uppercase letter.")
    if policy.require_number and not any(c.isdigit() for c in password):
        violations.append("Password must include a number.")
    if policy.require_special_char and password.isalnum():
        violations.append("Password must include a special character.")
    return violations


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    return Fernet(settings.sid_encryption_key.encode("utf-8"))


def encrypt_sid(sid: str) -> bytes:
    """Encrypt an ERPNext session id for server-side storage.

    The sid must never be stored, logged, or returned in plaintext — this
    is the only place it's held in memory unencrypted, and only briefly.
    """
    return _fernet().encrypt(sid.encode("utf-8"))


def decrypt_sid(token: bytes) -> str:
    return _fernet().decrypt(token).decode("utf-8")
