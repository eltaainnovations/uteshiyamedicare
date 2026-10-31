"""Real SMTP email delivery with channel separation:
- "info" channel: info@uteshiyamedicare.com (OTP, onboarding, password reset, account alerts)
- "orders" channel: placeorder@uteshiyamedicare.com (Order approvals, status confirmations)

Falls back to logging when SMTP isn't configured (no host/username set).
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
from .config import settings

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


# ==============================================================================
# OTP Verification Email Templates (Info Channel)
# ==============================================================================

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
                Support: <a href="mailto:info@uteshiyamedicare.com" style="color: #147BA6; text-decoration: none;">info@uteshiyamedicare.com</a> | Automated security notification
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
Support: info@uteshiyamedicare.com
"""


# ==============================================================================
# Order Approval Email Templates (Orders Channel)
# ==============================================================================

def generate_order_approval_email_html(
    order_name: str,
    distributor_name: str,
    sales_person_name: str,
    items: list[dict[str, Any]],
    grand_total: float,
    delivery_date: str,
    approval_url: str,
    logo_url: str | None = None,
) -> str:
    if logo_url is None:
        b64 = get_logo_base64()
        logo_url = f"data:image/png;base64,{b64}" if b64 else "cid:uteshiya_logo"

    # Build items table rows
    rows_html = ""
    for idx, item in enumerate(items):
        bg = "#ffffff" if idx % 2 == 0 else "#f8fafc"
        code = item.get("item_code") or ""
        qty = item.get("qty") or 0
        rate = float(item.get("rate") or 0.0)
        total_line = qty * rate
        rows_html += f"""
        <tr style="background-color: {bg}; border-bottom: 1px solid #eef2f6;">
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #1e293b;">{code}</td>
          <td style="padding: 10px 12px; font-size: 13px; text-align: center; color: #475569;">{qty}</td>
          <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #475569;">₹{rate:,.2f}</td>
          <td style="padding: 10px 12px; font-size: 13px; text-align: right; font-weight: 600; color: #0f172a;">₹{total_line:,.2f}</td>
        </tr>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Approval Required - {order_name}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Logo Header -->
          <tr>
            <td align="center" style="background-color: #ffffff; padding: 28px 32px 20px 32px; border-bottom: 1px solid #eef2f6;">
              <img src="{logo_url}" alt="Uteshiya Medicare" width="220" style="display: block; width: 220px; max-width: 220px; height: auto; border: 0;" />
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #147BA6 0%, #1F8A70 100%); padding: 16px 32px; text-align: center;">
              <p style="margin: 0; font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 0.8px; text-transform: uppercase;">
                Action Required: Order Approval
              </p>
              <p style="margin: 4px 0 0 0; font-size: 15px; font-weight: 600; color: #ffffff;">
                Order #{order_name}
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; color: #1e293b;">
              <p style="margin: 0 0 14px 0; font-size: 15px; color: #0f172a; font-weight: 600;">
                Hello {distributor_name},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                A new sales order has been created on your behalf by <strong>{sales_person_name}</strong>. Please review the order details below and approve it to initiate fulfillment.
              </p>

              <!-- Order Summary Meta Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; width: 50%;">
                    <strong>Order ID:</strong> <span style="color: #0f172a; font-family: monospace;">{order_name}</span><br>
                    <strong>Placed By:</strong> <span style="color: #0f172a;">{sales_person_name}</span>
                  </td>
                  <td style="padding: 12px 16px; font-size: 13px; color: #64748b; width: 50%;">
                    <strong>Expected Delivery:</strong> <span style="color: #0f172a;">{delivery_date}</span><br>
                    <strong>Status:</strong> <span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700;">AWAITING APPROVAL</span>
                  </td>
                </tr>
              </table>

              <!-- Items Table -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <thead>
                  <tr style="background-color: #0f172a; color: #ffffff;">
                    <th style="padding: 10px 12px; font-size: 12px; text-align: left; text-transform: uppercase;">Item / SKU</th>
                    <th style="padding: 10px 12px; font-size: 12px; text-align: center; text-transform: uppercase;">Qty</th>
                    <th style="padding: 10px 12px; font-size: 12px; text-align: right; text-transform: uppercase;">Rate</th>
                    <th style="padding: 10px 12px; font-size: 12px; text-align: right; text-transform: uppercase;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows_html}
                </tbody>
                <tfoot>
                  <tr style="background-color: #f0f7fb; border-top: 2px solid #147BA6;">
                    <td colspan="3" style="padding: 12px; font-size: 14px; font-weight: 700; color: #147BA6; text-align: right;">Grand Total:</td>
                    <td style="padding: 12px; font-size: 16px; font-weight: 800; color: #147BA6; text-align: right;">₹{grand_total:,.2f}</td>
                  </tr>
                </tfoot>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 20px 0;">
                <tr>
                  <td align="center">
                    <a href="{approval_url}" style="display: inline-block; background: linear-gradient(135deg, #147BA6 0%, #1F8A70 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(20, 123, 166, 0.25);">
                      Review &amp; Approve Order →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0 0 0; font-size: 12px; color: #94a3b8; text-align: center;">
                You can also approve or reject this order by logging in to the Distributor Portal under <strong>Pending Approvals</strong>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">
                <strong>Uteshiya Medicare Pvt. Ltd.</strong> · Orders &amp; Distribution Desk
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Inquiries: <a href="mailto:placeorder@uteshiyamedicare.com" style="color: #147BA6; text-decoration: none;">placeorder@uteshiyamedicare.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def generate_order_approval_email_text(
    order_name: str,
    distributor_name: str,
    sales_person_name: str,
    items: list[dict[str, Any]],
    grand_total: float,
    delivery_date: str,
    approval_url: str,
) -> str:
    item_lines = "\n".join(
        f"- {item.get('item_code')}: Qty {item.get('qty')} @ ₹{float(item.get('rate') or 0):,.2f}"
        for item in items
    )
    return f"""============================================================
           UTESHIYA MEDICARE — ORDER APPROVAL REQUIRED
============================================================

Hello {distributor_name},

A new order ({order_name}) has been placed on your behalf by {sales_person_name}.
Please review and approve this order:

Order ID: {order_name}
Delivery Date: {delivery_date}
Placed By: {sales_person_name}

Items:
{item_lines}

Grand Total: ₹{grand_total:,.2f}

To review and approve/reject this order, visit:
{approval_url}

------------------------------------------------------------
Uteshiya Medicare Pvt. Ltd.
Orders Desk: placeorder@uteshiyamedicare.com
"""


def generate_order_status_email_html(
    order_name: str,
    distributor_name: str,
    status_verb: str,  # "approved" or "rejected"
    grand_total: float | None = None,
    order_url: str | None = None,
    logo_url: str | None = None,
) -> str:
    if logo_url is None:
        b64 = get_logo_base64()
        logo_url = f"data:image/png;base64,{b64}" if b64 else "cid:uteshiya_logo"

    is_approved = status_verb.lower() == "approved"
    header_color = "#1F8A70" if is_approved else "#dc2626"
    badge_title = "ORDER APPROVED" if is_approved else "ORDER REJECTED"
    badge_bg = "#e6f5f1" if is_approved else "#fee2e2"
    badge_fg = "#1F8A70" if is_approved else "#b91c1c"
    action_text = (
        f"Order <strong>{order_name}</strong> has been <strong>approved</strong> by {distributor_name} and submitted for processing."
        if is_approved
        else f"Order <strong>{order_name}</strong> was <strong>rejected</strong> by {distributor_name}."
    )

    total_display = f"<p style='margin: 8px 0 0 0; font-size: 14px; color: #475569;'>Order Value: <strong>₹{grand_total:,.2f}</strong></p>" if grand_total else ""
    url_btn = ""
    if order_url and is_approved:
        url_btn = f"""
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0 10px 0;">
          <tr>
            <td align="center">
              <a href="{order_url}" style="display: inline-block; background-color: #147BA6; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 8px;">
                View Order Details
              </a>
            </td>
          </tr>
        </table>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order {badge_title} - {order_name}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Header Logo -->
          <tr>
            <td align="center" style="background-color: #ffffff; padding: 28px 32px 20px 32px; border-bottom: 1px solid #eef2f6;">
              <img src="{logo_url}" alt="Uteshiya Medicare" width="220" style="display: block; width: 220px; max-width: 220px; height: auto; border: 0;" />
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="background-color: {header_color}; padding: 14px 32px; text-align: center;">
              <p style="margin: 0; font-size: 14px; font-weight: 700; color: #ffffff; letter-spacing: 0.8px; text-transform: uppercase;">
                {badge_title}: {order_name}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; color: #1e293b;">
              <div style="display: inline-block; background-color: {badge_bg}; color: {badge_fg}; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 12px; margin-bottom: 16px;">
                {badge_title}
              </div>
              <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                {action_text}
              </p>
              {total_display}
              {url_btn}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Uteshiya Medicare Pvt. Ltd. · Orders Desk: <a href="mailto:placeorder@uteshiyamedicare.com" style="color: #147BA6; text-decoration: none;">placeorder@uteshiyamedicare.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def generate_order_status_email_text(
    order_name: str,
    distributor_name: str,
    status_verb: str,
    grand_total: float | None = None,
    order_url: str | None = None,
) -> str:
    total_str = f"\nOrder Value: ₹{grand_total:,.2f}" if grand_total else ""
    url_str = f"\nOrder Link: {order_url}" if order_url else ""
    return f"""============================================================
           UTESHIYA MEDICARE — ORDER {status_verb.upper()}
============================================================

Order {order_name} has been {status_verb} by {distributor_name}.{total_str}{url_str}

------------------------------------------------------------
Uteshiya Medicare Pvt. Ltd.
Orders Desk: placeorder@uteshiyamedicare.com
"""


# ==============================================================================
# Core Sender with Channel Support
# ==============================================================================

def send_email(
    to: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    inline_images: dict[str, tuple[bytes, str, str]] | None = None,
    channel: str = "info",  # "info" or "orders"
    from_email: str | None = None,
    from_name: str | None = None,
    reply_to_email: str | None = None,
    reply_to_name: str | None = None,
) -> tuple[bool, str | None]:
    """Returns (success, error_detail). error_detail is always None on success.

    Channel routing:
    - "info": Uses info@uteshiyamedicare.com as From / Reply-To (Auth/OTP/Password reset)
    - "orders": Uses placeorder@uteshiyamedicare.com as From / Reply-To (Approvals/Orders)
    The underlying SMTP transport authenticates with configured credentials.
    """
    config: dict[str, Any] = settings_service.get_email_config_internal()

    # Resolve transport and sender credentials based on channel
    if channel == "orders":
        smtp_host = getattr(settings, "smtp_orders_host", None) or config.get("smtp_host") or settings.smtp_host
        smtp_port = int(getattr(settings, "smtp_orders_port", None) or config.get("smtp_port") or settings.smtp_port or 2525)
        smtp_username = getattr(settings, "smtp_orders_username", None) or config.get("smtp_username") or settings.smtp_username
        smtp_password = (getattr(settings, "smtp_orders_password", None) or config.get("smtp_password") or settings.smtp_password or "").strip().replace(" ", "")
        encryption = (getattr(settings, "smtp_orders_encryption", None) or config.get("encryption") or settings.smtp_encryption or "TLS").upper()
        resolved_from_email = from_email or getattr(settings, "smtp_orders_email", None) or "placeorder@uteshiyamedicare.com"
        resolved_from_name = from_name or getattr(settings, "smtp_orders_name", None) or "Uteshiya Medicare Orders"
        resolved_reply_to_email = reply_to_email or getattr(settings, "smtp_orders_email", None) or "placeorder@uteshiyamedicare.com"
        resolved_reply_to_name = reply_to_name or getattr(settings, "smtp_orders_name", None) or "Uteshiya Medicare Orders"
    else:  # "info" channel (default)
        smtp_host = getattr(settings, "smtp_info_host", None) or config.get("smtp_host") or settings.smtp_host
        smtp_port = int(getattr(settings, "smtp_info_port", None) or config.get("smtp_port") or settings.smtp_port or 2525)
        smtp_username = getattr(settings, "smtp_info_username", None) or config.get("smtp_username") or settings.smtp_username
        smtp_password = (getattr(settings, "smtp_info_password", None) or config.get("smtp_password") or settings.smtp_password or "").strip().replace(" ", "")
        encryption = (getattr(settings, "smtp_info_encryption", None) or config.get("encryption") or settings.smtp_encryption or "TLS").upper()
        resolved_from_email = from_email or getattr(settings, "smtp_info_email", None) or "info@uteshiyamedicare.com"
        resolved_from_name = from_name or getattr(settings, "smtp_info_name", None) or "Uteshiya Medicare"
        resolved_reply_to_email = reply_to_email or getattr(settings, "smtp_info_email", None) or "info@uteshiyamedicare.com"
        resolved_reply_to_name = reply_to_name or getattr(settings, "smtp_info_name", None) or "Uteshiya Medicare"

    if not smtp_host or not smtp_username or not smtp_password:
        logger.info("Email to %s [%s channel] (dev fallback): %s\n%s", to, channel, subject, body)
        return True, None

    sender_header = f"{resolved_from_name} <{resolved_from_email}>" if resolved_from_name else resolved_from_email
    reply_to_header = (
        f"{resolved_reply_to_name} <{resolved_reply_to_email}>"
        if resolved_reply_to_name and resolved_reply_to_email
        else resolved_reply_to_email
    )

    if html_body:
        if inline_images:
            msg = MIMEMultipart("related")
            msg["Subject"] = subject
            msg["From"] = sender_header
            msg["To"] = to
            if reply_to_header:
                msg["Reply-To"] = reply_to_header

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
            msg["From"] = sender_header
            msg["To"] = to
            if reply_to_header:
                msg["Reply-To"] = reply_to_header
            msg.attach(MIMEText(body, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))
    else:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = sender_header
        msg["To"] = to
        if reply_to_header:
            msg["Reply-To"] = reply_to_header

    # Envelope sender: smtp_username if provider restricts envelope matching
    envelope_sender = smtp_username or resolved_from_email

    try:
        if encryption == "SSL" or smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=12) as server:
                server.login(smtp_username, smtp_password)
                server.sendmail(envelope_sender, [to], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.sendmail(envelope_sender, [to], msg.as_string())
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("SMTP send to %s [%s] failed: %s", to, channel, exc)
        return False, str(exc)

    return True, None


def send_otp_email(
    to: str,
    code: str,
    user_name: str | None = None,
    expires_in_minutes: int = 5,
) -> tuple[bool, str | None]:
    """Sends 2FA verification OTP email via info@ channel."""
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

    return send_email(to, subject, text_body, html_body=html_body, inline_images=inline_images, channel="info")


def send_order_approval_request_email(
    to: str,
    order_name: str,
    distributor_name: str,
    sales_person_name: str,
    items: list[dict[str, Any]],
    grand_total: float,
    delivery_date: str,
    approval_url: str | None = None,
) -> tuple[bool, str | None]:
    """Sends Order Awaiting Approval request to the Distributor via placeorder@ channel."""
    if not approval_url:
        approval_url = f"{settings.frontend_base_url}/distributor/pending-approvals"

    subject = f"[Uteshiya Medicare] Action Required: Order Approval #{order_name}"
    text_body = generate_order_approval_email_text(
        order_name=order_name,
        distributor_name=distributor_name,
        sales_person_name=sales_person_name,
        items=items,
        grand_total=grand_total,
        delivery_date=delivery_date,
        approval_url=approval_url,
    )
    logo_bytes = get_logo_bytes()
    inline_images: dict[str, tuple[bytes, str, str]] | None = None
    if logo_bytes:
        inline_images = {"uteshiya_logo": (logo_bytes, "png", "uteshiyamedicare.png")}
        html_body = generate_order_approval_email_html(
            order_name=order_name,
            distributor_name=distributor_name,
            sales_person_name=sales_person_name,
            items=items,
            grand_total=grand_total,
            delivery_date=delivery_date,
            approval_url=approval_url,
            logo_url="cid:uteshiya_logo",
        )
    else:
        html_body = generate_order_approval_email_html(
            order_name=order_name,
            distributor_name=distributor_name,
            sales_person_name=sales_person_name,
            items=items,
            grand_total=grand_total,
            delivery_date=delivery_date,
            approval_url=approval_url,
        )

    return send_email(to, subject, text_body, html_body=html_body, inline_images=inline_images, channel="orders")


def send_order_status_update_email(
    to: str,
    order_name: str,
    distributor_name: str,
    status_verb: str,  # "approved" or "rejected"
    grand_total: float | None = None,
    order_url: str | None = None,
) -> tuple[bool, str | None]:
    """Sends Order Approved / Rejected notification to the Sales Person via placeorder@ channel."""
    if not order_url:
        order_url = f"{settings.frontend_base_url}/sales/pending-approvals"

    status_cap = status_verb.capitalize()
    subject = f"[Uteshiya Medicare] Order #{order_name} {status_cap}"
    text_body = generate_order_status_email_text(
        order_name=order_name,
        distributor_name=distributor_name,
        status_verb=status_verb,
        grand_total=grand_total,
        order_url=order_url,
    )
    logo_bytes = get_logo_bytes()
    inline_images: dict[str, tuple[bytes, str, str]] | None = None
    if logo_bytes:
        inline_images = {"uteshiya_logo": (logo_bytes, "png", "uteshiyamedicare.png")}
        html_body = generate_order_status_email_html(
            order_name=order_name,
            distributor_name=distributor_name,
            status_verb=status_verb,
            grand_total=grand_total,
            order_url=order_url,
            logo_url="cid:uteshiya_logo",
        )
    else:
        html_body = generate_order_status_email_html(
            order_name=order_name,
            distributor_name=distributor_name,
            status_verb=status_verb,
            grand_total=grand_total,
            order_url=order_url,
        )

    return send_email(to, subject, text_body, html_body=html_body, inline_images=inline_images, channel="orders")
