"""Undo has to put every column back, on both database engines.

The old undo reverted by hand-kept field name lists. They covered 43 of the 61
fields an import can write; the other 18 fell through to a raw string setattr
and blew up at commit, which aborted the entire undo. Nothing caught it,
because the whole suite runs on SQLite and half the failures only happen there.

So this asserts two things the old code could not have passed:

  1. Round-trip. For EVERY column on PurchaseOrder — not a list someone
     maintains — take a representative value, stringify it the way the history
     writer does (`str(old_value)`), revert it, and assert we land back on the
     same value with the same type. A column added next year is covered the
     day it is added.

  2. Both dialects accept it. Run each reverted value through SQLAlchemy's
     bind processor for sqlite AND postgresql. This is the check that was
     missing: `DateTime <- str` passes on postgres (the driver hands the
     literal to PG, which casts it) and raises on sqlite, so production
     limped while local failed, and neither told us the code was wrong.

    cd backend && source venv/bin/activate && python smoke_import_undo.py

Writes nothing. No database connection — it works off the model metadata and
the dialects' own type machinery.
"""
import sys
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Date, Float, Integer, Numeric, String, Text, JSON, inspect
from sqlalchemy.dialects import postgresql, sqlite

from models import PurchaseOrder
from date_notes import DATE_NOTE_FIELDS
import import_revert
from import_revert import coerce_for_column, revert_field, UnrevertableField, NEVER_REVERT

passed, failed = 0, 0


def check(name, ok, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print(f'  PASS  {name}')
    else:
        failed += 1
        print(f'  FAIL  {name}' + (f'\n          {detail}' if detail else ''))


def sample_for(col_type):
    """A representative value for a column type, and the type we expect back."""
    if isinstance(col_type, Boolean):
        return False, bool
    if isinstance(col_type, Integer):
        return 1240, int
    if isinstance(col_type, (Float, Numeric)):
        return 12.5, float
    if isinstance(col_type, (DateTime, Date)):
        return datetime(2026, 3, 14, 9, 30, 0), datetime
    if isinstance(col_type, (String, Text)):
        return 'WALES-AW26-001', str
    return None, None


# ---------------------------------------------------------------- round trip
print('\nRound-trip: every column, str() then revert')
print('-' * 62)

cols = [c for c in inspect(PurchaseOrder).columns
        if c.key not in NEVER_REVERT and not isinstance(c.type, JSON)]
print(f'  ({len(cols)} columns under test)\n')

revertable = []
for col in cols:
    value, want_type = sample_for(col.type)
    if value is None:
        check(f'{col.key} — unhandled column type {type(col.type).__name__}', False,
              'sample_for() needs a case for this type')
        continue

    # Exactly what routers/excel.py writes into date_change_history.old_value.
    stored = str(value)

    try:
        back = coerce_for_column(PurchaseOrder, col.key, stored)
    except UnrevertableField as e:
        check(f'{col.key} — revertable', False, str(e))
        continue

    revertable.append(col.key)
    if col.key in DATE_NOTE_FIELDS:
        # These route through apply_date_field, which owns its own parsing.
        continue
    check(f'{col.key:38} {type(col.type).__name__:8} -> {type(back).__name__}',
          back == value and isinstance(back, want_type),
          f'expected {value!r} ({want_type.__name__}), got {back!r} ({type(back).__name__})')

check(f'every column revertable ({len(revertable)}/{len(cols)})', len(revertable) == len(cols))

# NULL must come back as NULL, not the string "None".
null_ok = all(coerce_for_column(PurchaseOrder, c.key, None) is None for c in cols)
check('a NULL history value reverts to None, not "None"', null_ok)


# ------------------------------------------------------------- both dialects
print('\nBind processors: sqlite AND postgresql accept every reverted value')
print('-' * 62)

for dialect, label in ((sqlite.dialect(), 'sqlite'), (postgresql.dialect(), 'postgresql')):
    bad = []
    for col in cols:
        value, _ = sample_for(col.type)
        if value is None:
            continue
        reverted = coerce_for_column(PurchaseOrder, col.key, str(value))
        impl = col.type.dialect_impl(dialect)
        proc = impl.bind_processor(dialect)
        if proc is None:
            continue  # passed through raw; the driver handles it
        try:
            proc(reverted)
        except Exception as e:
            bad.append(f'{col.key} ({type(col.type).__name__}): {type(e).__name__}: {e}')
    check(f'{label}: all {len(cols)} columns bind cleanly', not bad,
          '\n          '.join(bad[:6]))

# The regression itself: the OLD code's raw string must still be rejected, or
# this test proves nothing about what changed.
print('\nThe original bug, still reproducible with a raw string')
print('-' * 62)
for dialect, label in ((sqlite.dialect(), 'sqlite'), (postgresql.dialect(), 'postgresql')):
    for type_, raw in ((Boolean(), 'False'), (DateTime(), '2026-03-14 00:00:00')):
        proc = type_.dialect_impl(dialect).bind_processor(dialect)
        if proc is None:
            print(f'  note  {label}: {type(type_).__name__} <- str passes through '
                  f'(this is why production survived and local did not)')
            continue
        try:
            proc(raw)
            print(f'  note  {label}: {type(type_).__name__} <- str accepted')
        except Exception as e:
            print(f'  note  {label}: {type(type_).__name__} <- str '
                  f'{type(e).__name__} — the failure the old undo hit')


# ------------------------------------------------------------------ guards
print('\nGuards')
print('-' * 62)

for bad_field in ('id', 'created_at', 'updated_at', 'import_batch_id'):
    try:
        coerce_for_column(PurchaseOrder, bad_field, '1')
        check(f'{bad_field} refused', False, 'should have raised UnrevertableField')
    except UnrevertableField:
        check(f'{bad_field} refused', True)

try:
    coerce_for_column(PurchaseOrder, 'definitely_not_a_column', 'x')
    check('unknown field refused', False, 'should have raised UnrevertableField')
except UnrevertableField:
    check('unknown field refused', True)


class _Row:
    """Stand-in for a PurchaseOrder — revert_field only touches attributes."""
    __class__ = PurchaseOrder  # so revert_field resolves columns off the model

    def __init__(self):
        object.__setattr__(self, 'date_notes', None)


row = _Row()
revert_field(row, 'tech_packs_sent_to_factory', '2026-03-14 00:00:00')
check('revert_field writes a datetime, not a string',
      isinstance(row.tech_packs_sent_to_factory, datetime),
      f'got {row.tech_packs_sent_to_factory!r}')

revert_field(row, 'is_active', 'False')
check('revert_field writes a bool, not a string',
      row.is_active is False, f'got {row.is_active!r}')

# A note-eligible field carrying free text must come back as a note, not vanish.
revert_field(row, 'original_po_ex_factory', 'ASAP')
check('note-eligible field keeps free text as a note',
      (row.date_notes or {}).get('original_po_ex_factory') == 'ASAP'
      and row.original_po_ex_factory is None,
      f'date_notes={row.date_notes!r} col={row.original_po_ex_factory!r}')


print('\n' + '=' * 62)
print(f'{passed} passed, {failed} failed')
print('=' * 62 + '\n')
sys.exit(1 if failed else 0)
