"""Generic admin-managed app settings (key-value), including the emails kill switch
and per-automation email toggles."""
from typing import Dict, List, Optional, TypedDict
from sqlalchemy.orm import Session

from models import AppSetting


# Known generic keys
KEY_EMAILS_ENABLED = 'emails_enabled'
KEY_RESEND_API_KEY = 'resend_api_key'


class EmailAutomation(TypedDict):
    key: str
    label: str
    description: str


# Registry of individual email automations. Each one has its own toggle so
# admins can enable the master switch but selectively mute types.
# Add new automations here as they're built.
EMAIL_AUTOMATIONS: List[EmailAutomation] = [
    {
        'key': 'email_mention',
        'label': 'Comment @mentions',
        'description': 'Email a user when someone @mentions them in a comment.',
    },
]


def automation_setting_key(automation_key: str) -> str:
    """The app_setting key where this automation's on/off state lives."""
    return f'{automation_key}_enabled'


DEFAULTS: Dict[str, str] = {
    KEY_EMAILS_ENABLED: 'false',  # master kill switch — default OFF
    KEY_RESEND_API_KEY: '',       # admin pastes this via Settings → Notifications
}
# Seed a default entry for each registered automation (default OFF — opt-in).
for _a in EMAIL_AUTOMATIONS:
    DEFAULTS[automation_setting_key(_a['key'])] = 'false'

# Keys that must never be returned in plaintext via GET /api/settings/app.
SECRET_KEYS = {KEY_RESEND_API_KEY}


def get_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else DEFAULTS.get(key)


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        row = AppSetting(key=key, value=value)
        db.add(row)
    db.commit()


def get_bool(db: Session, key: str) -> bool:
    v = (get_setting(db, key) or '').strip().lower()
    return v in ('true', '1', 'yes', 'on')


def emails_enabled(db: Session) -> bool:
    """The global kill switch. Any email-sending code must gate on this."""
    return get_bool(db, KEY_EMAILS_ENABLED)


def is_automation_enabled(db: Session, automation_key: str) -> bool:
    """Return True only if BOTH the master kill switch and the specific
    automation's toggle are on."""
    if not emails_enabled(db):
        return False
    return get_bool(db, automation_setting_key(automation_key))


def seed_defaults(db: Session) -> None:
    """Insert default rows for any missing keys. Call once on startup."""
    existing = {r.key for r in db.query(AppSetting).all()}
    for key, value in DEFAULTS.items():
        if key not in existing:
            db.add(AppSetting(key=key, value=value))
    db.commit()
