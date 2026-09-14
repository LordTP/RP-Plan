"""Turning a history row back into a value its column will accept.

`date_change_history` stores every value as text — `str(old_value)`, or NULL
for "was empty". Undoing an import means reversing that, and the old undo did
it by listing field names by hand: one list of size columns, one of prices, one
of ten date fields, and `else: setattr(po, field, the_raw_string)`.

An import can change 61 fields. Those lists covered 43 of them. The other 18
were date columns — every sample date, both spec/tech-pack dates, all three
vessel dates — plus `is_active`, and each one fell through to the `else` and
tried to put a string into a typed column:

    SQLite   DateTime <- str  TypeError: SQLite DateTime type only accepts
                              Python datetime and date objects as input
    SQLite   Boolean  <- str  TypeError: Not a boolean value: 'False'
    Postgres DateTime <- str  passes through; PG casts the literal, so it
                              happened to work on production and only ever
                              failed locally
    Postgres Boolean  <- str  TypeError: Not a boolean value: 'False'

Because the undo commits once at the end, one bad field aborted the whole
thing: rollback, HTTP 500, `is_undone` left unset, and the import you were
trying to reverse still standing.

So don't enumerate fields. Ask the model what the column is and coerce to that
— a new column is then covered the day it's added, which is the property the
hand-written lists could never have.
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, Date, Float, Integer, Numeric, inspect

from date_notes import DATE_NOTE_FIELDS, apply_date_field


class UnrevertableField(Exception):
    """The history row names something that isn't a writable column."""


# Written by the app, never by a caller, but the undo loop does
# `setattr(order, history_row.field_name, ...)` — so anything that ever writes
# a history row gets to name an attribute here. Refuse the ones that would be
# damaging to set even so.
NEVER_REVERT = frozenset({'id', 'import_batch_id', 'created_at', 'updated_at'})


def _to_bool(raw: str) -> Optional[bool]:
    v = raw.strip().lower()
    if v in ('true', '1', 'yes', 'y', 't'):
        return True
    if v in ('false', '0', 'no', 'n', 'f'):
        return False
    return None


def _to_datetime(raw: str) -> Optional[datetime]:
    v = raw.strip()
    if not v:
        return None
    # str(datetime) — what the history writer produces — round-trips through
    # fromisoformat on 3.7+, with or without microseconds.
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        pass
    for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d',
                '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None


def coerce_for_column(model, field_name: str, raw: Optional[str]) -> Any:
    """The stored string, as the type `model.field_name` actually holds.

    Raises UnrevertableField for a name that isn't a column on the model, so a
    malformed history row is a caught error on one field rather than an
    AttributeError that takes the request down.
    """
    if field_name in NEVER_REVERT:
        raise UnrevertableField(f"{field_name} is not revertable")

    col = inspect(model).columns.get(field_name)
    if col is None:
        raise UnrevertableField(f"{field_name} is not a column on {model.__name__}")

    if raw is None:
        return None

    t = col.type
    # Boolean before Integer: SQLAlchemy's Boolean is its own type, but the
    # ordering is load-bearing if anyone ever swaps it for a 0/1 Integer.
    if isinstance(t, Boolean):
        return _to_bool(raw)
    if isinstance(t, Integer):
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            return None
    if isinstance(t, (Float, Numeric)):
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None
    if isinstance(t, (DateTime, Date)):
        parsed = _to_datetime(raw)
        if parsed is not None and isinstance(t, Date) and not isinstance(t, DateTime):
            return parsed.date()
        return parsed
    # String, Text, and anything else: the column holds text, so the stored
    # text is already the right shape.
    return raw


def revert_field(order, field_name: str, raw: Optional[str]) -> None:
    """Put `order.field_name` back to what the history row says it was.

    Note-eligible fields go through apply_date_field so a value like "ASAP"
    returns as a note rather than parsing to None and silently vanishing.
    """
    if field_name in DATE_NOTE_FIELDS:
        # Still type-check the name first — apply_date_field would happily
        # setattr an attribute that isn't a column.
        coerce_for_column(order.__class__, field_name, raw)
        apply_date_field(order, field_name, raw)
        return

    setattr(order, field_name, coerce_for_column(order.__class__, field_name, raw))
