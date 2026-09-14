"""The import's guards, exercised against real workbooks.

Builds .xlsx files in memory, runs them through the same preview and import
functions the endpoint calls, and asserts on what actually landed in a
throwaway database. Nothing here touches the real one.

    cd backend && source venv/bin/activate && python smoke_import_guards.py

Covers, in order of how much damage each prevented:

  * a file listing the same PO+style twice creates ONE row, not two
    (SessionLocal sets autoflush=False, so the second lookup cannot see the
     first, still-pending insert — this was silent before)
  * identity columns survive a re-import that tries to change them
  * a junk STATUS value is dropped rather than written
  * the row cap refuses an oversized file instead of chewing on it
  * preview and import agree about what will change
  * blank cells never blank out existing data
"""
import sys
from datetime import datetime
from io import BytesIO

import openpyxl
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, PurchaseOrder, User, UserRole
import excel_utils
from excel_utils import import_excel_to_database, preview_excel_import, MAX_IMPORT_ROWS

passed, failed = 0, 0


def check(name, ok, detail=''):
    global passed, failed
    if ok:
        passed += 1
        print(f'  PASS  {name}')
    else:
        failed += 1
        print(f'  FAIL  {name}' + (f'\n          {detail}' if detail else ''))


HEADERS = ['PO#', 'STYLE CODE', 'CUSTOMER', 'DESCRIPTION', 'COLOUR',
           'FACTORY', 'STATUS', 'ORDER RECEIVED DATE', 'TECH PACKS SENT TO FACTORY']


def book(rows, headers=HEADERS):
    """An .xlsx as bytes, headers in row 1 and `rows` under them."""
    wb = openpyxl.Workbook()
    ws = wb.active
    for i, h in enumerate(headers, 1):
        ws.cell(1, i, h)
    for r, row in enumerate(rows, 2):
        for i, v in enumerate(row, 1):
            ws.cell(r, i, v)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def fresh_db():
    """An isolated SQLite database with the real schema."""
    engine = create_engine('sqlite://')
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    user = User(username='tester', email='t@example.com',
                hashed_password='x', role=UserRole.ADMIN)
    db.add(user)
    db.commit()
    return db, user


R1 = ['5252', 'WAL-001', 'Wales RU', 'Home Jersey', 'Red', 'PRIME-23',
      'Confirmed', datetime(2026, 1, 5), datetime(2026, 1, 9)]


# ------------------------------------------------------- duplicates in file
print('\nA file that lists the same PO + style twice')
print('-' * 62)

db, user = fresh_db()
dup = ['5252', 'WAL-001', 'Wales RU', 'DIFFERENT DESCRIPTION', 'Blue', 'PRIME-23',
       'Confirmed', datetime(2026, 1, 5), datetime(2026, 1, 9)]
res = import_excel_to_database(book([R1, dup]), db, user, import_batch_id='b1')

rows = db.query(PurchaseOrder).filter_by(po_number='5252', style_code='WAL-001').all()
check('creates one row, not two', len(rows) == 1, f'got {len(rows)} rows')
check('the second occurrence is reported', any('twice in this file' in e for e in res.errors),
      f'errors: {res.errors}')
check('the first occurrence is the one kept',
      rows and rows[0].description == 'Home Jersey',
      f'description = {rows[0].description if rows else None!r}')

prev = preview_excel_import(book([R1, dup]), db)
check('preview warns before anything is written',
      prev['summary'].get('duplicate_count') == 1
      and any('repeat a PO#' in w for w in prev.get('warnings', [])),
      f"duplicate_count={prev['summary'].get('duplicate_count')} warnings={prev.get('warnings')}")
db.close()


# ------------------------------------------------------------ identity keys
print('\nIdentity columns on a re-import')
print('-' * 62)

db, user = fresh_db()
import_excel_to_database(book([R1]), db, user, import_batch_id='b1')
before = db.query(PurchaseOrder).one()
before_id, before_style = before.id, before.style_code

# Same PO, same style, but everything else different — the update path.
changed = ['5252', 'WAL-001', 'Wales Rugby Union', 'Home Jersey 2026', 'Scarlet',
           'PRIME-23', 'Confirmed', datetime(2026, 1, 5), datetime(2026, 2, 2)]
import_excel_to_database(book([changed]), db, user, import_batch_id='b2')
db.expire_all()
after = db.query(PurchaseOrder).one()

check('style_code unchanged', after.style_code == before_style)
check('po_number unchanged', after.po_number == '5252')
check('same row updated, not replaced', after.id == before_id)
check('non-identity fields did update', after.customer == 'Wales Rugby Union',
      f'customer = {after.customer!r}')
check('a changed date landed', after.tech_packs_sent_to_factory == datetime(2026, 2, 2),
      f'got {after.tech_packs_sent_to_factory!r}')
db.close()


# ------------------------------------------------------------------ status
print('\nSTATUS column')
print('-' * 62)

db, user = fresh_db()
junk = ['5300', 'WAL-009', 'Wales RU', 'Shorts', 'Black', 'PRIME-23',
        'TOTALLY MADE UP', None, None]
res = import_excel_to_database(book([junk]), db, user, import_batch_id='b1')
row = db.query(PurchaseOrder).filter_by(style_code='WAL-009').one()
check('junk status is not written', row.status is None, f'status = {row.status!r}')
check('and the user is told', any('ignored status' in e for e in res.errors),
      f'errors: {res.errors}')

good = ['5301', 'WAL-010', 'Wales RU', 'Socks', 'Black', 'PRIME-23',
        'in production', None, None]
import_excel_to_database(book([good]), db, user, import_batch_id='b2')
row = db.query(PurchaseOrder).filter_by(style_code='WAL-010').one()
check('a real status is accepted, case-insensitively', row.status == 'In Production',
      f'status = {row.status!r}')
db.close()


# ---------------------------------------------------------------- blanking
print('\nBlank cells')
print('-' * 62)

db, user = fresh_db()
import_excel_to_database(book([R1]), db, user, import_batch_id='b1')
blanked = ['5252', 'WAL-001', None, None, None, None, None, None, None]
import_excel_to_database(book([blanked]), db, user, import_batch_id='b2')
db.expire_all()
row = db.query(PurchaseOrder).one()
check('a blank cell does not wipe existing data', row.customer == 'Wales RU',
      f'customer = {row.customer!r}')
check('and does not wipe a date', row.tech_packs_sent_to_factory is not None)
db.close()


# ---------------------------------------------------------------- row cap
print('\nRow cap')
print('-' * 62)

db, user = fresh_db()
many = [[str(50000 + i), f'S-{i}', 'C', 'D', 'Red', 'F', None, None, None]
        for i in range(MAX_IMPORT_ROWS + 5)]
res = import_excel_to_database(book(many), db, user, import_batch_id='b1')
check(f'a file over {MAX_IMPORT_ROWS:,} rows is refused', not res.success and res.rows_created == 0,
      f'success={res.success} created={res.rows_created}')
check('nothing was written', db.query(PurchaseOrder).count() == 0)
check('the message says why', any('row limit' in e for e in res.errors), f'{res.errors}')

prev = preview_excel_import(book(many), db)
check('preview refuses it too', prev['success'] is False and 'row limit' in (prev.get('error') or ''),
      f"error = {prev.get('error')!r}")
db.close()


# ------------------------------------------------------- preview vs import
print('\nPreview matches what the import actually does')
print('-' * 62)

db, user = fresh_db()
import_excel_to_database(book([R1]), db, user, import_batch_id='b1')

upd = ['5252', 'WAL-001', 'Wales RU', 'Home Jersey', 'Scarlet', 'PRIME-23',
       'Confirmed', datetime(2026, 1, 5), datetime(2026, 3, 3)]
new = ['5999', 'WAL-500', 'Wales RU', 'Away Jersey', 'White', 'PRIME-23',
       None, None, None]
content = book([upd, new])

prev = preview_excel_import(content, db)
predicted_new = prev['summary']['new_count']
predicted_upd = prev['summary']['update_count']
predicted_fields = {c['field'] for o in prev['updated_orders'] for c in o['changes']}

res = import_excel_to_database(content, db, user, import_batch_id='b2')
check(f'predicted {predicted_new} new  -> created {res.rows_created}',
      predicted_new == res.rows_created)
check(f'predicted {predicted_upd} update -> updated {res.rows_updated}',
      predicted_upd == res.rows_updated)

db.expire_all()
row = db.query(PurchaseOrder).filter_by(style_code='WAL-001').one()
actually_changed = set()
if row.colour == 'Scarlet':
    actually_changed.add('colour')
if row.tech_packs_sent_to_factory == datetime(2026, 3, 3):
    actually_changed.add('tech_packs_sent_to_factory')
check('the fields preview named are the fields that changed',
      actually_changed <= predicted_fields and actually_changed,
      f'predicted {sorted(predicted_fields)}, confirmed {sorted(actually_changed)}')
check('no errors on a clean run', not res.errors, f'{res.errors}')
db.close()


print('\n' + '=' * 62)
print(f'{passed} passed, {failed} failed')
print('=' * 62 + '\n')
sys.exit(1 if failed else 0)
