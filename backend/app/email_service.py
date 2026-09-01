"""Real SMTP email delivery, config-driven via settings_service's
email_config category.

Falls back to logging when SMTP isn't configured (no host/username set) —
the same dev-mode behavior every email send in this backend had before
this module existed, kept as a fallback rather than removed, so the OTP/
approval/onboarding flows stay testable without SMTP creds.
"""

import logging
import smtplib
from email.mime.text import MIMEText

from . import settings_service

logger = logging.getLogger("email")


def send_email(to: str, subject: str, body: str) -> tuple[bool, str | None]:
    """Returns (success, error_detail). error_detail is always None on
    success — whether that's a real SMTP send or the dev-mode log line."""
    config = settings_service.get_email_config_internal()
    if not config.get("smtp_host") or not config.get("smtp_username"):
        logger.info("Email to %s: %s\n%s", to, subject, body)
        return True, None

    from_email = config.get("from_email") or config["smtp_username"]
    from_name = config.get("from_name") or ""

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = to
    reply_to_email = config.get("reply_to_email")
    if reply_to_email:
        reply_to_name = config.get("reply_to_name") or ""
        msg["Reply-To"] = f"{reply_to_name} <{reply_to_email}>" if reply_to_name else reply_to_email

    try:
        if config["encryption"] == "SSL":
            with smtplib.SMTP_SSL(config["smtp_host"], config["smtp_port"], timeout=10) as server:
                server.login(config["smtp_username"], config["smtp_password"])
                server.sendmail(from_email, [to], msg.as_string())
        else:
            with smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=10) as server:
                server.starttls()
                server.login(config["smtp_username"], config["smtp_password"])
                server.sendmail(from_email, [to], msg.as_string())
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("SMTP send to %s failed: %s", to, exc)
        return False, str(exc)

    return True, None
