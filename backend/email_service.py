"""Resend-backed email service. All sends gate on the admin kill switch
(app_settings.emails_enabled). The Resend API key is stored in the DB and
managed via Settings → Notifications in the UI. When unset, sends are
logged instead of actually transmitted — useful for dev.
"""
import logging
from pathlib import Path
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

import app_settings


logger = logging.getLogger(__name__)

# Non-secret constants (rarely change; if you need to change them edit here).
FROM_EMAIL = "Source Lab - Critical Path <noreply@truepathgroup.co.uk>"
APP_BASE_URL = "https://sourcelab.truepathgroup.co.uk"

_TEMPLATES_DIR = Path(__file__).parent / "email_templates"
_jinja = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _resend_client(db: Session):
    """Return a Resend module configured with the api_key from the DB, or
    None if unset. The admin sets this via Settings → Notifications."""
    key = (app_settings.get_setting(db, app_settings.KEY_RESEND_API_KEY) or '').strip()
    if not key:
        return None
    import resend
    resend.api_key = key
    return resend


def render(template_name: str, **context) -> str:
    """Render a Jinja template to HTML."""
    tmpl = _jinja.get_template(template_name)
    return tmpl.render(app_base_url=APP_BASE_URL, **context)


def send_email(
    db: Session,
    to: str,
    subject: str,
    html: str,
    text_fallback: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Low-level send. Checks only the master kill switch. Prefer
    `send_automation_email` for anything tied to a registered automation."""
    if not app_settings.emails_enabled(db):
        logger.info("Email skipped (kill switch off): to=%s subject=%r", to, subject)
        return False

    if not to:
        logger.warning("Email skipped (no recipient): subject=%r", subject)
        return False

    client = _resend_client(db)
    if client is None:
        # Dev mode: no API key configured. Log the payload so we can verify.
        logger.info(
            "[DEV EMAIL — no RESEND_API_KEY]\n  To: %s\n  Subject: %s\n  HTML length: %d",
            to, subject, len(html),
        )
        return False

    payload = {
        "from": FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text_fallback:
        payload["text"] = text_fallback
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        result = client.Emails.send(payload)
        logger.info("Email sent: to=%s subject=%r id=%s", to, subject, result.get("id") if isinstance(result, dict) else result)
        return True
    except Exception as e:
        # Never let email failures block the request that triggered them.
        logger.exception("Email send failed: to=%s subject=%r err=%s", to, subject, e)
        return False


def send_automation_email(
    db: Session,
    automation_key: str,
    to: str,
    subject: str,
    html: str,
    text_fallback: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> bool:
    """Send an email tied to a named automation. Gates on both the master
    kill switch and the specific automation's toggle."""
    if not app_settings.is_automation_enabled(db, automation_key):
        logger.info(
            "Automation email skipped (%s off): to=%s subject=%r",
            automation_key, to, subject,
        )
        return False
    return send_email(db, to=to, subject=subject, html=html,
                      text_fallback=text_fallback, reply_to=reply_to)
