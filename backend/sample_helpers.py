"""Shared helpers for sample status and business-day calculations."""
import logging
import threading
from datetime import timedelta, datetime

logger = logging.getLogger(__name__)


SAMPLE_PREFIXES_ORDER = ('fit_sample', 'strike_off', 'lab_dip', 'pps')

# Fit deliberately absent. A fit sample is a whole-garment concern and lives
# against the order, never against a component — same as PPS. OrderComponent
# still carries fit_sample_status/received/approved columns from an earlier
# model, but nothing in the UI has ever rendered them and they are 100% null
# on prod (0 of 97 rows, 4 Sep snapshot).
#
# Columns left in place on purpose: dropping them needs a Postgres migration
# and they cost nothing sitting there nullable. Removing them from this tuple
# is what actually matters — it stops reconcile_sample_status writing to a
# field no surface reads.
SAMPLE_PREFIXES_COMPONENT = ('strike_off', 'lab_dip', 'label')


def reconcile_sample_status(obj, prefixes, skip_prefixes=None):
    """Keep sample status + date fields consistent:
      - If *_received date is set AND status is empty or OUTSTANDING → RECEIVED
      - If *_approved date is set AND status is anything but APPROVED / NOT REQUIRED → APPROVED

    Approved wins over received when both dates are set.

    If the caller just explicitly updated a status field, pass that prefix in
    skip_prefixes so the user's choice is respected (otherwise we'd clobber it).

    Mutates the object in place. Call before commit on any order/component save.
    """
    skip = set(skip_prefixes or ())
    for prefix in prefixes:
        if prefix in skip:
            continue
        approved = getattr(obj, f'{prefix}_approved', None)
        received = getattr(obj, f'{prefix}_received', None)
        status = (getattr(obj, f'{prefix}_status', '') or '').strip().upper()

        # Approved date wins — bump to APPROVED unless the user already
        # picked APPROVED or NOT REQUIRED.
        if approved and status not in ('APPROVED', 'NOT REQUIRED'):
            setattr(obj, f'{prefix}_status', 'APPROVED')
            continue

        # No approved date but received is set — bump OUTSTANDING/empty to
        # RECEIVED. Don't clobber REJECTED / LATE / P23 ADVISE UPDATE etc.
        if received and status in ('', 'OUTSTANDING'):
            setattr(obj, f'{prefix}_status', 'RECEIVED')


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


# ─────────────────────────────────────────────────────────────────────────
# Factory closure calendar (Chinese New Year and friends)
# ─────────────────────────────────────────────────────────────────────────
#
# business_days_between() is called in tight per-order, per-component loops —
# the warnings centre alone runs it thousands of times per request — so it
# must never touch the database itself. The closure dates are expanded once
# into a flat frozenset of dates and cached here.
#
# The TTL matters as much as the explicit invalidation: under more than one
# uvicorn worker, a save handled by worker A cannot reach worker B's memory,
# so without it the other workers would serve a stale calendar until restart.

_CLOSED_LOCK = threading.Lock()
_CLOSED_DATES = frozenset()
_CLOSED_LOADED_AT = None
_CLOSED_TTL_SECONDS = 60

# Sanity cap per closure. A mistyped year ("2099") would otherwise expand into
# tens of thousands of dates; the API validates the span too, but this keeps a
# bad row already in the table from bloating the cache.
_MAX_CLOSURE_DAYS = 400


def invalidate_closure_cache():
    """Drop the cached calendar so the next read reloads it. Call after any
    write to factory_closures."""
    global _CLOSED_LOADED_AT
    with _CLOSED_LOCK:
        _CLOSED_LOADED_AT = None


def _expand(rows):
    out = set()
    for r in rows:
        if not r.start_date or not r.end_date or r.end_date < r.start_date:
            continue
        day, count = r.start_date, 0
        while day <= r.end_date and count < _MAX_CLOSURE_DAYS:
            out.add(day)
            day += timedelta(days=1)
            count += 1
    return frozenset(out)


def closed_dates():
    """Every date covered by an active factory closure, as a frozenset.

    Returns an empty set rather than raising if the table is not there yet —
    a fresh database runs create_all() after the first import, and a warning
    calculation must not be what breaks startup.
    """
    global _CLOSED_DATES, _CLOSED_LOADED_AT
    now = datetime.utcnow()
    if (_CLOSED_LOADED_AT is not None
            and (now - _CLOSED_LOADED_AT).total_seconds() < _CLOSED_TTL_SECONDS):
        return _CLOSED_DATES

    from sqlalchemy import or_
    from database import SessionLocal
    from models import FactoryClosure
    db = SessionLocal()
    try:
        # Global closures only. The cache is one flat set of dates shared by
        # every caller, and business_days_between() takes no factory argument,
        # so a per-factory row loaded here would silently stop the clock for
        # every factory. FactoryClosure.factory exists for the day we thread a
        # factory through the counter; until then the API refuses to create
        # one, and this filter is the second lock on the same door.
        rows = db.query(FactoryClosure).filter(
            FactoryClosure.active.is_(True),
            or_(FactoryClosure.factory.is_(None), FactoryClosure.factory == ''),
        ).all()
        loaded = _expand(rows)
    except Exception:
        logger.warning("Could not load factory closures; treating as none", exc_info=True)
        loaded = frozenset()
    finally:
        db.close()

    with _CLOSED_LOCK:
        _CLOSED_DATES = loaded
        _CLOSED_LOADED_AT = now
    return loaded


def closure_days_between(start, end):
    """Calendar days in (start, end] that fall inside a factory closure.

    For the few counters that deliberately work in calendar days rather than
    business days — the PPS overdue window is "about 5-6 weeks including
    weekends" — so weekend days inside a shutdown count here too.
    """
    if not start or not end or end < start:
        return 0
    closed = closed_dates()
    if not closed:
        return 0
    day = start.date() if hasattr(start, 'date') else start
    end_date = end.date() if hasattr(end, 'date') else end
    n = 0
    while day < end_date:
        day += timedelta(days=1)
        if day in closed:
            n += 1
    return n


def business_days_between(start, end):
    """Business days (Mon-Fri, excluding factory closures) elapsed from `start` to `end`.

    Counts weekdays strictly after `start`, up to and including `end` — so
    the day something was sent is day 0, the next working day is day 1.
    Returns 0 for missing dates or a reversed range.

    This deliberately does NOT count the start day. The previous version
    counted weekdays in [start, end) instead, which agreed with this one
    everywhere except when exactly one endpoint fell on a weekend — there it
    reported a day too many. Sent Monday, viewed Saturday, it said 5 business
    days had passed when only 4 had (Tue/Wed/Thu/Fri), so every threshold in
    the warnings centre tripped a day early over the weekend. Chinese
    factories also work Saturdays, so weekend `received` dates are real and
    hit the same bug from the other end.

    Days inside an active FactoryClosure are skipped alongside weekends, so a
    Chinese New Year shutdown never counts towards any chase threshold.
    """
    if not start or not end or end < start:
        return 0
    closed = closed_dates()
    days = 0
    current = start.date() if hasattr(start, 'date') else start
    end_date = end.date() if hasattr(end, 'date') else end
    while current < end_date:
        current += timedelta(days=1)
        if current.weekday() < 5 and current not in closed:  # 0=Mon, 4=Fri
            days += 1
    return days
