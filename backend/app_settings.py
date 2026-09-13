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
    {
        'key': 'new_po_needs_components',
        'label': 'New PO needs components',
        'description': 'When a PO has all three sent-to-factory dates (Order / Tech packs / Specs) and still has zero components, notify the configured recipients. A single reminder fires 2 business days later if still empty.',
    },
]


class WarningThreshold(TypedDict):
    key: str
    label: str
    description: str
    unit: str
    default: int
    min: int
    max: int
    group: str


# Registry of the chase thresholds behind the warnings centre.
#
# These were literals scattered through dashboard_warnings.py — "days_since >= 3",
# "if days_since < 15" — so changing how long Source Lab waits before chasing
# meant a code change and a deploy. They're operational policy, not logic, and
# the people who set that policy aren't the people who deploy.
#
# `default` is the value the code used before this registry existed, so an
# untouched install behaves exactly as it did.
WARNING_THRESHOLDS: List[WarningThreshold] = [
    {
        'key': 'warn_tech_packs_days', 'group': 'Getting started',
        'label': 'Tech packs chase', 'unit': 'business days',
        'description': 'How long after an order goes to the factory before a missing tech pack is flagged.',
        'default': 3, 'min': 1, 'max': 30,
    },
    {
        'key': 'warn_specs_days', 'group': 'Getting started',
        'label': 'Specs chase', 'unit': 'business days',
        'description': 'How long after an order goes to the factory before missing specs are flagged.',
        'default': 3, 'min': 1, 'max': 30,
    },
    {
        'key': 'warn_fit_sample_days', 'group': 'Waiting on the factory',
        'label': 'Fit sample overdue', 'unit': 'business days',
        'description': 'How long after tech packs are sent before a fit sample that has not arrived is flagged.',
        'default': 15, 'min': 1, 'max': 90,
    },
    {
        'key': 'warn_lab_dip_days', 'group': 'Waiting on the factory',
        'label': 'Lab dip overdue', 'unit': 'business days',
        'description': 'How long after tech packs are sent before a lab dip that has not arrived is flagged.',
        'default': 15, 'min': 1, 'max': 90,
    },
    {
        'key': 'warn_strike_off_days', 'group': 'Waiting on the factory',
        'label': 'Strike off overdue', 'unit': 'business days',
        'description': 'How long after tech packs are sent before a strike off that has not arrived is flagged.',
        'default': 20, 'min': 1, 'max': 90,
    },
    {
        'key': 'warn_strike_off_slow_days', 'group': 'Waiting on the factory',
        'label': 'Strike off overdue — slow items', 'unit': 'business days',
        'description': 'The longer allowance for badges, woven labels and woven tape, which take longer to produce than a print.',
        'default': 25, 'min': 1, 'max': 90,
    },
    {
        'key': 'warn_lab_dip_approval_days', 'group': 'Waiting on Source Lab',
        'label': 'Lab dip awaiting approval', 'unit': 'business days',
        'description': 'How long a received lab dip can sit un-approved before it is flagged. This one is on us, not the factory.',
        'default': 5, 'min': 1, 'max': 30,
    },
    {
        'key': 'warn_strike_off_approval_days', 'group': 'Waiting on Source Lab',
        'label': 'Strike off awaiting approval', 'unit': 'business days',
        'description': 'How long a received strike off can sit un-approved before it is flagged.',
        'default': 5, 'min': 1, 'max': 30,
    },
    {
        'key': 'warn_pps_received_days', 'group': 'Pre-production',
        'label': 'PPS overdue', 'unit': 'calendar days',
        'description': 'How long after the last lab dip or strike off approval before a missing PPS is flagged. Calendar days, not business days — this one spans production time.',
        'default': 40, 'min': 1, 'max': 180,
    },
    {
        'key': 'warn_pps_approval_days', 'group': 'Pre-production',
        'label': 'PPS awaiting customer approval', 'unit': 'business days',
        'description': 'How long after a PPS goes to the customer before chasing their sign-off.',
        'default': 7, 'min': 1, 'max': 60,
    },
]

WARNING_THRESHOLD_BY_KEY: Dict[str, WarningThreshold] = {t['key']: t for t in WARNING_THRESHOLDS}


def get_threshold(db: Session, key: str) -> int:
    """A threshold's current value, falling back to its registered default.

    Deliberately tolerant: a malformed stored value returns the default rather
    than raising, because a bad row here would otherwise break the whole
    warnings centre rather than one warning.
    """
    spec = WARNING_THRESHOLD_BY_KEY.get(key)
    if spec is None:
        raise KeyError(f'Unknown warning threshold: {key}')
    raw = get_setting(db, key)
    if raw is None or not str(raw).strip():
        return spec['default']
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return spec['default']


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
# ...and for each warning threshold, so an untouched install reads exactly the
# numbers that were hardcoded before.
for _t in WARNING_THRESHOLDS:
    DEFAULTS[_t['key']] = str(_t['default'])

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
