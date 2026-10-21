"""Real SMTP email delivery, config-driven via settings_service's
email_config category.

Falls back to logging when SMTP isn't configured (no host/username set) —
the same dev-mode behavior every email send in this backend had before
this module existed, kept as a fallback rather than removed, so the OTP/
approval/onboarding flows stay testable without SMTP creds.
"""

import base64
import logging
from pathlib import Path
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from . import settings_service

logger = logging.getLogger("email")

# Primary path explicitly configured for Uteshiya Medicare branding, with reliable fallback paths
PRIMARY_LOGO_PATH = Path(r"C:\xampp\htdocs\uteshiyamedicare\dist\assets\uteshiyamedicare-BUiiNn6e.png")
FALLBACK_LOGO_PATHS = [
    Path(__file__).resolve().parent / "assets" / "uteshiyamedicare.png",
    Path(__file__).resolve().parents[2] / "src" / "assets" / "uteshiyamedicare.png",
    Path(__file__).resolve().parents[2] / "dist" / "assets" / "uteshiyamedicare-BUiiNn6e.png",
]


def get_logo_path() -> Path | None:
    """Returns the logo Path, checking the primary path first, then fallbacks."""
    if PRIMARY_LOGO_PATH.is_file():
        return PRIMARY_LOGO_PATH
    for path in FALLBACK_LOGO_PATHS:
        if path.is_file():
            return path
    return None


def get_logo_bytes() -> bytes | None:
    """Reads raw logo bytes if file exists."""
    path = get_logo_path()
    if path and path.is_file():
        try:
            return path.read_bytes()
        except OSError as exc:
            logger.warning("Could not read logo from %s: %s", path, exc)
    return None


def get_logo_base64() -> str | None:
    """Returns base64 encoded string of the logo PNG."""
    data = get_logo_bytes()
    if data:
        return base64.b64encode(data).decode("ascii")
    return None


def generate_otp_email_html(
    code: str,
    user_name: str | None = None,
    expires_in_minutes: int = 5,
    logo_url: str | None = None,
) -> str:
    name_display = f" {user_name}" if user_name and user_name.strip() else ""
    if logo_url is None:
        b64 = get_logo_base64()
        logo_url = f"data:image/png;base64,{b64}" if b64 else "cid:uteshiya_logo"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Brand Logo Header -->
          <tr>
            <td align="center" style="background-color: #ffffff; padding: 32px 32px 24px 32px; border-bottom: 1px solid #eef2f6;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center">
                    <img src="{logo_url}" alt="Uteshiya Medicare" width="220" style="display: block; width: 220px; max-width: 220px; height: auto; border: 0; outline: none; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 20px; font-weight: 700; color: #147BA6;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security Accent Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #147BA6 0%, #0d5c7d 100%); padding: 16px 32px; text-align: center;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <p style="margin: 0; font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 0.8px; text-transform: uppercase;">
                      Two-Factor Authentication
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #d0eaf5; letter-spacing: 0.3px;">
                      Distributor &amp; Administration Portal
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px 28px 32px; color: #1e293b;">
              <h2 style="margin: 0 0 12px 0; font-size: 19px; font-weight: 600; color: #0f172a;">
                Login Verification Code
              </h2>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Hello{name_display},<br>
                You recently requested to sign in to your Uteshiya Medicare account. Please use the verification code below to complete your authentication:
              </p>

              <!-- OTP Block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0 24px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #f0f7fb; border: 2px dashed #147BA6; border-radius: 12px; padding: 18px 36px; text-align: center;">
                      <span style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #147BA6; display: block; margin-left: 10px;">
                        {code}
                      </span>
                    </div>
                    <p style="margin: 12px 0 0 0; font-size: 13px; color: #64748b; font-weight: 500;">
                      ⏱ Valid for the next <strong>{expires_in_minutes} minutes</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Security Advisory Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef8ee; border-left: 4px solid #f59e0b; border-radius: 6px; margin: 24px 0 20px 0;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #92400e;">
                      <strong>Security Note:</strong> Never share this code with anyone. Uteshiya Medicare team members will never ask for your verification code. If you did not initiate this login request, please contact your administrator or change your password immediately.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                Regards,<br>
                <strong style="color: #334155;">Uteshiya Medicare Security Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 22px 32px; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; line-height: 1.4;">
                <strong>Uteshiya Medicare Pvt. Ltd.</strong> · Plot No. 42, GIDC Industrial Estate, Phase II, Surat, Gujarat 395010
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Support: <a href="mailto:support@uteshiya.com" style="color: #147BA6; text-decoration: none;">support@uteshiya.com</a> | Automated security notification
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def generate_otp_email_text(
    code: str,
    user_name: str | None = None,
    expires_in_minutes: int = 5,
) -> str:
    name_display = f" {user_name}" if user_name and user_name.strip() else ""
    return f"""============================================================
              UTESHIYA MEDICARE PORTAL
============================================================

Hello{name_display},

You requested to sign in to your Uteshiya Medicare Portal account.
Your 6-digit login verification code is:

                     >>> {code} <<<

This code is valid for {expires_in_minutes} minutes.

SECURITY NOTE:
Never share this code with anyone. Uteshiya Medicare will never
ask for this code. If you did not request this, please contact
your administrator or change your password immediately.

------------------------------------------------------------
Uteshiya Medicare Pvt. Ltd.
Plot No. 42, GIDC Industrial Estate, Phase II, Surat, Gujarat 395010
Support: support@uteshiya.com
"""


def send_email(
    to: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    inline_images: dict[str, tuple[bytes, str, str]] | None = None,
) -> tuple[bool, str | None]:
    """Returns (success, error_detail). error_detail is always None on
    success — whether that's a real SMTP send or the dev-mode log line.

    If inline_images is provided, attaches images with Content-ID (CID)
    for rich HTML email rendering without external URL blocking.
    Format: {cid: (bytes, subtype, filename)}
    """
    config: dict[str, Any] = settings_service.get_email_config_internal()
    smtp_host = config.get("smtp_host")
    smtp_username = config.get("smtp_username")
    smtp_password = (config.get("smtp_password") or "").strip().replace(" ", "")

    if not smtp_host or not smtp_username or not smtp_password:
        logger.info("Email to %s (dev fallback): %s\n%s", to, subject, body)
        return True, None

    from_email = config.get("from_email") or smtp_username
    from_name = config.get("from_name") or "Uteshiya Medicare"
    smtp_port = int(config.get("smtp_port") or 587)
    encryption = (config.get("encryption") or "TLS").upper()

    if html_body:
        if inline_images:
            msg = MIMEMultipart("related")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
            msg["To"] = to
            reply_to_email = config.get("reply_to_email")
            if reply_to_email:
                reply_to_name = config.get("reply_to_name") or ""
                msg["Reply-To"] = f"{reply_to_name} <{reply_to_email}>" if reply_to_name else reply_to_email

            alt_part = MIMEMultipart("alternative")
            alt_part.attach(MIMEText(body, "plain", "utf-8"))
            alt_part.attach(MIMEText(html_body, "html", "utf-8"))
            msg.attach(alt_part)

            for cid, (img_bytes, subtype, filename) in inline_images.items():
                img_part = MIMEImage(img_bytes, _subtype=subtype)
                img_part.add_header("Content-ID", f"<{cid}>")
                img_part.add_header("Content-Disposition", "inline", filename=filename)
                msg.attach(img_part)
        else:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
            msg["To"] = to
            reply_to_email = config.get("reply_to_email")
            if reply_to_email:
                reply_to_name = config.get("reply_to_name") or ""
                msg["Reply-To"] = f"{reply_to_name} <{reply_to_email}>" if reply_to_name else reply_to_email
            msg.attach(MIMEText(body, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))
    else:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
        msg["To"] = to
        reply_to_email = config.get("reply_to_email")
        if reply_to_email:
            reply_to_name = config.get("reply_to_name") or ""
            msg["Reply-To"] = f"{reply_to_name} <{reply_to_email}>" if reply_to_name else reply_to_email

    try:
        if encryption == "SSL" or smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=12) as server:
                server.login(smtp_username, smtp_password)
                server.sendmail(from_email, [to], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.sendmail(from_email, [to], msg.as_string())
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("SMTP send to %s failed: %s", to, exc)
        return False, str(exc)

    return True, None


def send_otp_email(
    to: str,
    code: str,
    user_name: str | None = None,
    expires_in_minutes: int = 5,
) -> tuple[bool, str | None]:
    """Sends a formatted 2FA OTP verification code email with HTML & plain text."""
    subject = f"Your Uteshiya Medicare Login Code: {code}"
    text_body = generate_otp_email_text(code, user_name, expires_in_minutes)
    logo_bytes = get_logo_bytes()
    inline_images: dict[str, tuple[bytes, str, str]] | None = None
    if logo_bytes:
        inline_images = {"uteshiya_logo": (logo_bytes, "png", "uteshiyamedicare.png")}
        html_body = generate_otp_email_html(
            code,
            user_name=user_name,
            expires_in_minutes=expires_in_minutes,
            logo_url="cid:uteshiya_logo",
        )
    else:
        html_body = generate_otp_email_html(
            code,
            user_name=user_name,
            expires_in_minutes=expires_in_minutes,
        )

    return send_email(to, subject, text_body, html_body=html_body, inline_images=inline_images)
