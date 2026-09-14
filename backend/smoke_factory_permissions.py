"""What a factory login can and cannot do — proven, not assumed.

smoke_supplier_scope.py already sweeps the component endpoints. This covers
everything else a factory touches: orders, shipping drafts, comments, export,
and the internal-only endpoints they must never reach.

Two halves, because a factory guide needs both answers:

  CANNOT — aimed at another factory's data (ACME-99) from a PRIME-23 login.
           Anything not blocked, or any row that leaks, is a finding.

  CAN    — aimed at their OWN order. This half is not a security test; it
           produces the field-by-field table the guide has to state correctly:
           editable / read-only / gated / needs approval. A guide that gets
           this wrong is worse than no guide.

Run against a local backend with admin + factory accounts present. It builds
and removes its own fixture and leaves real data alone.

    cd backend && source venv/bin/activate && python smoke_factory_permissions.py
"""
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests

from database import SessionLocal
from models import PurchaseOrder, OrderComponent, Comment, PendingDateChange

B = 'http://127.0.0.1:8004'
PO = 'PERMFIX'
db = SessionLocal()


def login(u, p):
    r = requests.post(f'{B}/api/auth/login', json={'username': u, 'password': p})
    return {'Authorization': f"Bearer {r.json()['access_token']}"}


A = login('admin', 'admin123')
F = login('factory1', 'factory123')

findings, oks, capability = [], [], []


def clean():
    ids = [o.id for o in db.query(PurchaseOrder).filter(PurchaseOrder.po_number == PO).all()]
    if ids:
        db.query(PendingDateChange).filter(PendingDateChange.order_id.in_(ids)).delete(synchronize_session=False)
        db.query(Comment).filter(Comment.po_id.in_(ids)).delete(synchronize_session=False)
        db.query(OrderComponent).filter(OrderComponent.order_id.in_(ids)).delete(synchronize_session=False)
        db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(ids)).delete(synchronize_session=False)
    db.commit()


clean()
BASE = datetime(2026, 8, 3)
theirs = PurchaseOrder(po_number=PO, style_code='ACME-THEIRS', factory='ACME-99',
                       customer='Other Customer', total_quantity=500, trade_price=4.25,
                       total_order_value=2125.0)
# Their order, fully open — so a block can only be about scoping, never the gate.
mine = PurchaseOrder(po_number=PO, style_code='PRIME-MINE', factory='PRIME-23',
                     customer='My Customer', total_quantity=500,
                     order_sent_to_factory_date=BASE,
                     tech_packs_sent_to_factory=BASE + timedelta(days=2),
                     specs_sent_to_factory=BASE + timedelta(days=3),
                     revised_po_ex_factory=BASE + timedelta(days=60),
                     trade_price=3.10, total_order_value=1550.0)
# Same factory, but gate closed — isolates "gated" from "not allowed".
locked = PurchaseOrder(po_number=PO, style_code='PRIME-LOCKED', factory='PRIME-23',
                       customer='My Customer', total_quantity=100)
db.add_all([theirs, mine, locked])
db.commit()
for o in (theirs, mine, locked):
    db.refresh(o)


def cannot(name, resp, leak=None):
    """Assert a request aimed at another factory is refused or returns nothing."""
    code = resp.status_code
    blocked = code in (400, 403, 404)
    if not blocked and leak is not None:
        try:
            leaked = leak(resp.json())
        except Exception:
            leaked = False
        if leaked:
            findings.append(f'{name}: HTTP {code} AND leaked their data')
            print(f'  FINDING  {name}: HTTP {code} — leaked')
            return
        oks.append(name)
        print(f'  ok       {name}: HTTP {code}, nothing leaked')
        return
    if blocked:
        oks.append(name)
        print(f'  ok       {name}: HTTP {code}')
    else:
        findings.append(f'{name}: HTTP {code} — allowed when it should not be')
        print(f'  FINDING  {name}: HTTP {code} — ALLOWED')


print('\nCANNOT — a PRIME-23 login aimed at ACME-99')
print('-' * 74)

cannot('GET  their order by id',
       requests.get(f'{B}/api/orders/{theirs.id}', headers=F),
       leak=lambda j: j.get('factory') == 'ACME-99')
cannot('PUT  edit their order',
       requests.put(f'{B}/api/orders/{theirs.id}', headers=F, json={'colour': 'HACKED'}))
cannot('DEL  delete their order',
       requests.delete(f'{B}/api/orders/{theirs.id}', headers=F))
cannot('GET  their comments',
       requests.get(f'{B}/api/orders/{theirs.id}/comments', headers=F),
       leak=lambda j: bool(j if isinstance(j, list) else j.get('comments')))
# Correct payload shape (CommentCreate wants comment_text) — a 422 here would
# be schema validation, not an authorisation decision, and would prove nothing.
cannot('POST comment on their order',
       requests.post(f'{B}/api/orders/{theirs.id}/comments', headers=F,
                     json={'comment_text': 'should not land'}))
cannot('GET  their pending changes',
       requests.get(f'{B}/api/orders/{theirs.id}/pending-changes', headers=F),
       leak=lambda j: bool(j if isinstance(j, list) else j.get('changes')))

lst = requests.get(f'{B}/api/orders?page=1&page_size=200&tab=all', headers=F)
rows = lst.json().get('orders', []) if lst.ok else []
others = [o for o in rows if o.get('factory') and o['factory'] != 'PRIME-23']
if others:
    findings.append(f'order list leaked {len(others)} rows from other factories')
    print(f'  FINDING  GET  order list: {len(others)} rows from another factory')
else:
    oks.append('order list scoped')
    print(f'  ok       GET  order list: {len(rows)} rows, all PRIME-23')

priced = [o for o in rows if o.get('trade_price') is not None or o.get('total_order_value') is not None]
if priced:
    findings.append(f'order list exposed pricing on {len(priced)} rows')
    print(f'  FINDING  pricing visible on {len(priced)} rows')
else:
    oks.append('no pricing in payload')
    print('  ok       no trade_price / total_order_value in the payload')

print('\nCANNOT — internal-only endpoints')
print('-' * 74)
cannot('GET  bulk-edit field registry', requests.get(f'{B}/api/bulk-edit/fields', headers=F))
cannot('POST bulk-edit apply',
       requests.post(f'{B}/api/bulk-edit/apply', headers=F,
                     json={'order_ids': [mine.id], 'field_name': 'season', 'new_value': 'X', 'apply': True}))
cannot('POST excel import', requests.post(f'{B}/api/excel/import', headers=F, files={'file': ('x.xlsx', b'x')}))
cannot('POST excel preview', requests.post(f'{B}/api/excel/preview', headers=F, files={'file': ('x.xlsx', b'x')}))
cannot('POST excel undo', requests.post(f'{B}/api/excel/undo', headers=F))
cannot('GET  all users', requests.get(f'{B}/api/users', headers=F),
       leak=lambda j: len(j if isinstance(j, list) else j.get('users', [])) > 0)
cannot('GET  settings warning thresholds', requests.get(f'{B}/api/settings/warning-thresholds', headers=F))
cannot('POST approve a date change',
       requests.post(f'{B}/api/approvals/1/approve', headers=F, json={}))

print('\nCAN — their OWN order, gate open (what the guide must state)')
print('-' * 74)

FIELDS = [
    ('revised_po_ex_factory', (BASE + timedelta(days=70)).isoformat(), 'date'),
    ('factory_confirmed_ex_factory', (BASE + timedelta(days=58)).isoformat(), 'date'),
    ('vessel_name', 'EVER GIVEN', 'text'),
    ('vessel_etd', (BASE + timedelta(days=65)).isoformat(), 'date'),
    ('vessel_eta_to_port', (BASE + timedelta(days=90)).isoformat(), 'date'),
    ('fcl_lcl', 'LCL', 'text'),
    ('revised_vessel_eta_to_port', (BASE + timedelta(days=95)).isoformat(), 'date'),
    ('gender', '001-MENS/ADULTS', 'text'),
    ('colour', 'NAVY', 'text'),
    ('description', 'CHANGED BY FACTORY', 'text'),
    ('customer', 'CHANGED BY FACTORY', 'text'),
    ('season', 'AW99', 'text'),
    ('total_quantity', 999, 'number'),
    ('trade_price', 9.99, 'number'),
    ('strike_off_status', 'APPROVED', 'text'),
    ('fit_sample_status', 'APPROVED', 'text'),
    ('pps_approved', (BASE + timedelta(days=40)).isoformat(), 'date'),
    ('tracking_reference', 'P123456', 'text'),
    ('po_number', 'RENAMED', 'text'),
    ('style_code', 'RENAMED', 'text'),
]

for field, value, _kind in FIELDS:
    r = requests.put(f'{B}/api/orders/{mine.id}', headers=F,
                     json={field: value, 'change_reason': 'permissions audit'})
    db.expire_all()
    row = db.query(PurchaseOrder).filter(PurchaseOrder.id == mine.id).first()
    pending = db.query(PendingDateChange).filter(
        PendingDateChange.order_id == mine.id,
        PendingDateChange.field_name == field,
        PendingDateChange.status == 'pending').first()

    if r.status_code == 403:
        verdict = 'read-only (403)'
    elif pending:
        verdict = 'NEEDS APPROVAL'
    elif r.ok:
        actual = getattr(row, field, None)
        landed = str(actual)[:10] == str(value)[:10]
        verdict = 'EDITABLE' if landed else f'accepted but did NOT change (still {actual!r})'
    else:
        verdict = f'HTTP {r.status_code}'
    capability.append((field, verdict))
    print(f'  {field:32} {verdict}')

# Lock in the split. Vessel data is the shipping draft's; the order endpoint
# must refuse it, or the drawer grows an inline pencil again and the same
# column starts behaving two different ways for the same user.
print('\nVessel fields belong to the Shipping page, not the order form')
print('-' * 74)
VESSEL = ['vessel_name', 'vessel_etd', 'vessel_eta_to_port', 'fcl_lcl']
verdicts = dict(capability)
for f in VESSEL:
    v = verdicts.get(f, '(not probed)')
    ok = v.startswith('read-only')
    (oks if ok else findings).append(f'{f} via order endpoint: {v}')
    print(f'  {"ok      " if ok else "FINDING "} {f:24} {v}')
if any(not verdicts.get(f, "").startswith("read-only") for f in VESSEL):
    print('  -> a factory can now set vessel data two ways with different rules.')
    print('     Shipping draft writes instantly; the order endpoint queues an approval.')

print('\nCAN — same factory, gate CLOSED (no sent/tech-pack/spec dates)')
print('-' * 74)
r = requests.put(f'{B}/api/orders/{locked.id}', headers=F, json={'vessel_name': 'X'})
gated = r.status_code == 403
print(f'  edit a gated order: HTTP {r.status_code} {"— blocked, as designed" if gated else "— NOT BLOCKED"}')
if gated:
    oks.append('three-date gate enforced')
    print(f'  message the factory sees: "{r.json().get("detail","")}"')
else:
    findings.append('three-date edit gate not enforced')

print('\nCAN — shipping')
print('-' * 74)
for name, resp in [
    ('GET  shipment drafts', requests.get(f'{B}/api/shipment-drafts', headers=F)),
    # Real payload — a 422 here would be schema validation, not permission.
    ('POST create a draft', requests.post(f'{B}/api/shipment-drafts', headers=F,
                                          json={'factory': 'PRIME-23', 'name': 'PERMFIX DRAFT'})),
]:
    print(f'  {name:28} HTTP {resp.status_code}')

# Remove the probe draft so repeat runs don't accumulate them.
try:
    for d in requests.get(f'{B}/api/shipment-drafts', headers=F).json().get('drafts', []):
        if d.get('name') == 'PERMFIX DRAFT':
            requests.delete(f"{B}/api/shipment-drafts/{d['id']}", headers=F)
except Exception:
    pass

print('\n' + '=' * 74)
print(f'{len(oks)} correctly enforced · {len(findings)} findings')
for f in findings:
    print(f'  ! {f}')
print('=' * 74 + '\n')

clean()
db.close()
sys.exit(1 if findings else 0)
