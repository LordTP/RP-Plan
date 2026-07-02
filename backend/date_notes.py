"""
Helper for routing incoming values on the small set of date fields that
also accept free text like "ASAP". Kept minimal on purpose — this is not
a general-purpose "text or date" abstraction; it's scoped to the four
fields customers/factories hand-write, so nowhere else in the app needs
to know about it.

Usage:
    if apply_date_field(order, field_name, incoming_value):
        # order was mutated — call site should carry on
        ...

The helper always writes both the date column and the date_notes dict so
they can never disagree. It's a no-op if the field isn't in the
allowlist — the caller just uses its normal date-parsing path.
"""

from datetime import datetime
from typing import Optional


# Fields where ASAP-style text is plausible. Kept narrow — expanding
# this to every date field creates a lot of display sprawl and most
# other date fields are historical facts where free text makes no sense.
DATE_NOTE_FIELDS = {
    'original_del_date_to_customer',
    'original_po_ex_factory',
    'revised_po_ex_factory',
    'factory_confirmed_ex_factory',
}


def _try_parse_date(value: str) -> Optional[datetime]:
    """Best-effort parse of a user string as a date. Returns None if it
    doesn't look like a date at all — the caller then treats the value
    as free text."""
    v = value.strip()
    if not v:
        return None
    # Prefer ISO; fall back to common human formats. Any ValueError just
    # means "not a date" — we return None and let the caller store it as
    # a note.
    for fmt in (None, '%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d %b %Y', '%d %B %Y'):
        try:
            if fmt is None:
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            return datetime.strptime(v, fmt)
        except (ValueError, TypeError):
            continue
    return None


def apply_date_field(order, field_name: str, incoming) -> bool:
    """Route an incoming value for a note-eligible date field. Writes
    both `order.<field_name>` and `order.date_notes[field_name]`, keeping
    them consistent (at most one is set at a time).

    Returns True if the field is note-eligible AND the caller should
    consider it handled — False if this helper isn't the right path (the
    field isn't in the allowlist, so use the normal date parse).
    """
    if field_name not in DATE_NOTE_FIELDS:
        return False

    notes = dict(order.date_notes or {})

    # Empty / null → clear both.
    if incoming is None or (isinstance(incoming, str) and not incoming.strip()):
        setattr(order, field_name, None)
        notes.pop(field_name, None)
        order.date_notes = notes or None
        return True

    # Already a datetime — no parsing needed.
    if isinstance(incoming, datetime):
        setattr(order, field_name, incoming)
        notes.pop(field_name, None)
        order.date_notes = notes or None
        return True

    # String path — try date parse first, fall back to note text.
    text = str(incoming).strip()
    parsed = _try_parse_date(text)
    if parsed is not None:
        setattr(order, field_name, parsed)
        notes.pop(field_name, None)
    else:
        setattr(order, field_name, None)
        notes[field_name] = text
    order.date_notes = notes or None
    return True
