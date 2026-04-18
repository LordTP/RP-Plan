"""Shared helpers for sample status and business-day calculations."""
from datetime import timedelta


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
