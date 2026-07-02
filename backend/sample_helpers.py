"""Shared helpers for sample status and business-day calculations."""
from datetime import timedelta


SAMPLE_PREFIXES_ORDER = ('fit_sample', 'strike_off', 'lab_dip', 'pps')
SAMPLE_PREFIXES_COMPONENT = ('fit_sample', 'strike_off', 'lab_dip', 'label')


def reconcile_sample_status(obj, prefixes, skip_prefixes=None):
    """Ensure invariant: if *_approved date is set, *_status must be APPROVED
    (unless status is NOT REQUIRED, which wins).

    If the caller just explicitly updated a status field, pass that prefix in
    skip_prefixes so the user's choice is respected (otherwise we'd clobber it).

    Mutates the object in place. Call before commit on any order/component save.
    """
    skip = set(skip_prefixes or ())
    for prefix in prefixes:
        if prefix in skip:
            continue
        approved = getattr(obj, f'{prefix}_approved', None)
        if not approved:
            continue
        status = (getattr(obj, f'{prefix}_status', '') or '').strip().upper()
        if status in ('APPROVED', 'NOT REQUIRED'):
            continue
        setattr(obj, f'{prefix}_status', 'APPROVED')


def is_sample_done(status_val, approved_date):
    """A sample is done if status=APPROVED or NOT REQUIRED, OR if an approved date exists"""
    s = (status_val or '').strip().upper()
    if s in ('APPROVED', 'NOT REQUIRED'):
        return True
    if approved_date:
        return True
    return False


def sample_needs_work(status_val, approved_date):
    """A sample needs work if it has a status set (not empty, not done)"""
    s = (status_val or '').strip().upper()
    if not s or s == '':
        return False
    return not is_sample_done(status_val, approved_date)


def business_days_between(start, end):
    """Count business days (Mon-Fri) from start to end, excluding weekends."""
    if not start or not end or end < start:
        return 0
    days = 0
    current = start.date() if hasattr(start, 'date') else start
    end_date = end.date() if hasattr(end, 'date') else end
    while current < end_date:
        if current.weekday() < 5:  # 0=Mon, 4=Fri
            days += 1
        current += timedelta(days=1)
    return days
