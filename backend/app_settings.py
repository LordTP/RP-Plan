"""Generic admin-managed app settings (key-value), including the emails kill switch."""
from typing import Dict, Optional
from sqlalchemy.orm import Session

from models import AppSetting


# Known keys — add new ones here as settings are introduced.
KEY_EMAILS_ENABLED = 'emails_enabled'

DEFAULTS: Dict[str, str] = {
    KEY_EMAILS_ENABLED: 'false',  # default OFF until explicitly turned on by an admin
}


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


def seed_defaults(db: Session) -> None:
    """Insert default rows for any missing keys. Call once on startup."""
    existing = {r.key for r in db.query(AppSetting).all()}
    for key, value in DEFAULTS.items():
        if key not in existing:
            db.add(AppSetting(key=key, value=value))
    db.commit()
