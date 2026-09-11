"""Pre-deploy smoke suite for the component-seam branch.

Exercises every path the branch touched plus the surrounding flows that
must NOT have broken. Run against a local backend with the admin and
factory (PRIME-23) accounts present.

Each check prints PASS/FAIL with what it actually saw, so a failure tells
you what's wrong rather than just that something is.
"""
import sys
sys.path.insert(0, '/Users/thomaspaul/Desktop/Source Lab/RP App/backend')

import requests
from database import SessionLocal
from models import PurchaseOrder, OrderComponent, SampleSubmission, Component

B = 'http://127.0.0.1:8004'
results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}")


def login(u, p):
    r = requests.post(f'{B}/api/auth/login', json={'username': u, 'password': p})
    return {'Authorization': f"Bearer {r.json()['access_token']}", 'Content-Type': 'application/json'}


db = SessionLocal()
HA = login('admin', 'admin123')
HF = login('factory', 'factory123')

# ── Fixtures ──────────────────────────────────────────────────────────
# The suite used to read whatever happened to be in the DB, which meant it
# crashed outright on a freshly-wiped one: no second PO to prove cross-PO
# reach, no other factory to prove supplier scoping, no component-free order
# to exercise the order-level path. Seed exactly what's needed and remove it
# at the end, so a pass means the same thing on any database.
SMOKE_PO = 'SMOKE-PO-FIXTURE'


def _clear_fixtures():
    ids = [o.id for o in db.query(PurchaseOrder).filter(PurchaseOrder.po_number == SMOKE_PO).all()]
    if ids:
        db.query(SampleSubmission).filter(SampleSubmission.order_id.in_(ids)).delete(synchronize_session=False)
        db.query(OrderComponent).filter(OrderComponent.order_id.in_(ids)).delete(synchronize_session=False)
        db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(ids)).delete(synchronize_session=False)
        db.commit()


_clear_fixtures()
# Two styles on a second PO, under a factory that is NOT PRIME-23, carrying no
# components. One fixture covers all three gaps.
for i in (1, 2, 3):
    db.add(PurchaseOrder(
        po_number=SMOKE_PO, style_code=f'SMOKE-STYLE-{i}',
        customer='SMOKE CUSTOMER', factory='SMOKE-FACTORY',
        description=f'smoke fixture {i}', colour='SMOKE', total_quantity=10,
    ))
db.commit()

# Order 3 carries the component that sections C and D beat up. Without it the
# suite grabbed the first lab-dip component in the DB — i.e. real data — and
# left it rejected, re-approved and date-stamped by the test run.
_fix_orders = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == SMOKE_PO).order_by(PurchaseOrder.id).all()
_fix_target = _fix_orders[2]
FIXTURE_COMPONENT = OrderComponent(
    order_id=_fix_target.id, name='SMOKE LAB DIP', sample_type='lab_dip',
)
FIXTURE_STRIKE = OrderComponent(
    order_id=_fix_target.id, name='SMOKE STRIKE OFF', sample_type='strike_off',
)
db.add(FIXTURE_COMPONENT)
db.add(FIXTURE_STRIKE)
db.commit()
db.refresh(FIXTURE_COMPONENT)
db.refresh(FIXTURE_STRIKE)

# ── A. Core reads still work ──────────────────────────────────────────
print("\nA. CORE READS")
for label, url in [
    ('orders list', '/api/orders?page=1&page_size=200'),
    ('orders list big page', '/api/orders?page=1&page_size=5000'),
    ('component library', '/api/components/library'),
    ('statuses', '/api/statuses'),
    ('dashboard stats', '/api/stats/dashboard'),
    ('resubmissions overview', '/api/resubmissions/overview'),
    ('reject reasons', '/api/submissions/reject-reasons'),
]:
    r = requests.get(f'{B}{url}', headers=HA)
    check(label, r.status_code == 200, f'HTTP {r.status_code}')

# Comment counts survived the N+1 collapse
r = requests.get(f'{B}/api/orders?page=1&page_size=5000', headers=HA).json()
orders = r['orders']
nulls = [o['id'] for o in orders if o.get('comment_count') is None]
withc = sum(1 for o in orders if (o.get('comment_count') or 0) > 0)
# What this guards is the N+1 collapse: every row must carry a non-null
# comment_count. Requiring one to be NON-ZERO needs a seeded comment, which a
# clean DB won't have — so that half only asserts when there's data for it.
if withc == 0:
    check('comment counts present (no comments in this DB)', not nulls,
          f'{len(nulls)} nulls across {len(orders)} orders')
else:
    check('comment counts populated', not nulls and withc > 0,
          f'{withc} orders with comments, {len(nulls)} nulls')

# ── B. Security fixes still hold ──────────────────────────────────────
print("\nB. SUPPLIER SCOPING")
victim = db.query(PurchaseOrder).filter(PurchaseOrder.factory != 'PRIME-23').first()
own = db.query(PurchaseOrder).filter(PurchaseOrder.factory == 'PRIME-23').first()

r = requests.get(f'{B}/api/orders/{victim.id}/components', headers=HF)
check('cross-factory components blocked', r.status_code == 403, f'HTTP {r.status_code}')
r = requests.get(f'{B}/api/orders/{own.id}/components', headers=HF)
check('own components readable', r.status_code == 200, f'HTTP {r.status_code}')
r = requests.get(f'{B}/api/analytics/design', headers=HF)
check('design analytics blocked', r.status_code == 403, f'HTTP {r.status_code}')
r = requests.post(f'{B}/api/components/merge', headers=HF,
                  json={'from_names': ['X'], 'to_name': 'Y'})
check('merge blocked for supplier', r.status_code == 403, f'HTTP {r.status_code}')
r = requests.post(f'{B}/api/orders/batch-pending-changes', headers=HF,
                  json={'order_ids': [victim.id]})
check('cross-factory pending changes scoped',
      r.status_code == 200 and r.json().get('pending_changes') == {},
      f"HTTP {r.status_code}, {r.json().get('pending_changes')}")

# ── C. Rejection guards ───────────────────────────────────────────────
print("\nC. REJECTION GUARDS")
comp = FIXTURE_COMPONENT  # never real data — see the fixture block above
r = requests.put(f'{B}/api/components/{comp.id}', headers=HA,
                 json={'lab_dip_status': 'REJECTED'})
check('bare REJECTED via PUT rejected', r.status_code == 400, f'HTTP {r.status_code}')
r = requests.post(f'{B}/api/components/bulk-update', headers=HA,
                  json={'component_ids': [comp.id], 'field': 'lab_dip_status', 'value': 'REJECTED'})
check('bare REJECTED via bulk-update rejected', r.status_code == 400, f'HTTP {r.status_code}')
r = requests.post(f'{B}/api/components/bulk-update', headers=HA,
                  json={'component_ids': [comp.id], 'field': 'lab_dip_status', 'value': 'APPROVED'})
check('bulk-update APPROVED still works', r.status_code == 200, f'HTTP {r.status_code}')

# ── D. The seam: every approve path closes the attempt ────────────────
print("\nD. SEAM — approvals must close the open attempt")
oid, cid = comp.order_id, comp.id


def opens(component_id=None, order_id=None, st='lab'):
    db.expire_all()
    q = db.query(SampleSubmission).filter(
        SampleSubmission.sample_type == st, SampleSubmission.outcome.is_(None))
    if component_id is not None:
        q = q.filter(SampleSubmission.component_id == component_id)
    else:
        q = q.filter(SampleSubmission.order_id == order_id,
                     SampleSubmission.component_id.is_(None))
    return q.count()


def status_of(component_id):
    db.expire_all()
    return db.query(OrderComponent).filter(OrderComponent.id == component_id).first().lab_dip_status


def seed_reject():
    requests.post(f'{B}/api/submissions/reject', headers=HA,
                  json={'order_id': oid, 'component_id': cid, 'sample_type': 'lab',
                        'reason': 'COLOUR', 'notes': 'smoke'})


seed_reject()
check('reject opens an attempt', opens(cid) == 1 and status_of(cid) == 'OUTSTANDING',
      f'{opens(cid)} open, status {status_of(cid)}')

requests.put(f'{B}/api/components/{cid}', headers=HA, json={'lab_dip_approved': '2026-09-20'})
check('date-only approval closes it', opens(cid) == 0 and status_of(cid) == 'APPROVED',
      f'{opens(cid)} open, status {status_of(cid)}')

seed_reject()
requests.put(f'{B}/api/components/{cid}', headers=HA, json={'lab_dip_status': 'APPROVED'})
check('status approval closes it', opens(cid) == 0, f'{opens(cid)} open')

seed_reject()
requests.post(f'{B}/api/components/{cid}/apply-to-po', headers=HA,
              json={'lab_dip_status': 'APPROVED'})
check('apply-to-po closes it', opens(cid) == 0, f'{opens(cid)} open')

seed_reject()
requests.post(f'{B}/api/components/library/instances/bulk-edit', headers=HA,
              json={'instance_ids': [cid], 'status': 'APPROVED'})
check('bulk-edit-instances closes it', opens(cid) == 0, f'{opens(cid)} open')

# Order-level path via bulk-update-date
o2 = _fix_orders[0]  # fixture order, deliberately component-free
requests.post(f'{B}/api/submissions/reject', headers=HA,
                  json={'order_id': o2.id, 'sample_type': 'pps', 'reason': 'SPEC', 'notes': 's'})
before = opens(order_id=o2.id, st='pps')
requests.post(f'{B}/api/orders/bulk-update-date', headers=HA,
              json={'po_number': o2.po_number, 'field_name': 'pps_status',
                    'new_value': 'APPROVED', 'order_ids': [o2.id]})
check('bulk-update-date closes it',
      before == 1 and opens(order_id=o2.id, st='pps') == 0,
      f'{before} -> {opens(order_id=o2.id, st="pps")}')

# ── E. The link: cross-PO apply from any caller shape ─────────────────
print("\nE. LINK RESOLUTION")
pos = [r[0] for r in db.query(PurchaseOrder.po_number).distinct().limit(2).all()]
t = (db.query(PurchaseOrder).filter(PurchaseOrder.po_number == pos[0]).limit(2).all()
     + db.query(PurchaseOrder).filter(PurchaseOrder.po_number == pos[1]).limit(1).all())
canon = requests.post(f'{B}/api/components/library', headers=HA,
                      json={'name': 'SMOKE LINK', 'sample_type': 'strike_off',
                            'colour': 'Smoke'}).json()['id']
requests.post(f'{B}/api/components/library/{canon}/apply', headers=HA,
              json={'order_ids': [o.id for o in t], 'starting_state': 'blank'})
db.expire_all()
insts = db.query(OrderComponent).filter(OrderComponent.canonical_id == canon).all()
check('add links all styles', len(insts) == 3, f'{len(insts)} instances')

sib = requests.get(f'{B}/api/components/styles-with-canonical?canonical_id={canon}',
                   headers=HA).json()['styles']
check('sibling lookup spans POs', len({s['po_number'] for s in sib}) == 2,
      f"POs {sorted({s['po_number'] for s in sib})}")

requests.post(f'{B}/api/components/{insts[0].id}/apply-to-po', headers=HA,
              json={'strike_off_received': '2026-09-25'})
db.expire_all()
n = sum(1 for i in db.query(OrderComponent).filter(OrderComponent.canonical_id == canon).all()
        if i.strike_off_received is not None)
check('drawer-shape apply reaches all linked', n == 3, f'{n} of 3')

# ── F. Library CRUD ───────────────────────────────────────────────────
print("\nF. LIBRARY CRUD")
r = requests.patch(f'{B}/api/components/library/{canon}', headers=HA,
                   json={'colour': 'Repainted'})
check('patch identity', r.status_code == 200, f'HTTP {r.status_code}')

# The rename bug: renaming the library entry has to carry every linked
# instance with it, or /components and the order drawer disagree forever.
r = requests.patch(f'{B}/api/components/library/{canon}', headers=HA,
                   json={'name': 'SMOKE RENAMED'})
db.expire_all()
names = {i.name for i in
         db.query(OrderComponent).filter(OrderComponent.canonical_id == canon).all()}
lib_name = db.query(Component).filter(Component.id == canon).first().name
check('rename propagates to every instance',
      r.status_code == 200 and names == {'SMOKE RENAMED'} and lib_name == 'SMOKE RENAMED',
      f'library {lib_name!r}, instances {sorted(names)}')

# The three paths that used to write an instance name on their own. The first
# two are closed outright; merge stays open (it's the duplicate-collapse tool)
# but has to rename the canonical too.
inst_id = db.query(OrderComponent).filter(OrderComponent.canonical_id == canon).first().id
r = requests.put(f'{B}/api/components/{inst_id}', headers=HA, json={'name': 'SIDE DOOR'})
check('PUT component rejects name', r.status_code == 400, f'HTTP {r.status_code}')
r = requests.post(f'{B}/api/components/{inst_id}/apply-to-po', headers=HA,
                  json={'name': 'SIDE DOOR'})
check('apply-to-po rejects name', r.status_code == 400, f'HTTP {r.status_code}')
r = requests.post(f'{B}/api/components/merge', headers=HA,
                  json={'from_names': ['SMOKE RENAMED'], 'to_name': 'SMOKE MERGED'})
db.expire_all()
names = {i.name for i in
         db.query(OrderComponent).filter(OrderComponent.canonical_id == canon).all()}
lib_name = db.query(Component).filter(Component.id == canon).first().name
check('merge renames canonical and instances together',
      r.status_code == 200 and names == {'SMOKE MERGED'} and lib_name == 'SMOKE MERGED',
      f'library {lib_name!r}, instances {sorted(names)}')

r = requests.delete(f'{B}/api/components/library/{canon}', headers=HA)
db.expire_all()
left = db.query(OrderComponent).filter(OrderComponent.canonical_id == canon).count()
gone = db.query(Component).filter(Component.id == canon).count()
check('delete removes canonical + instances',
      r.status_code == 200 and left == 0 and gone == 0,
      f'HTTP {r.status_code}, {left} instances left, canonical rows {gone}')

# ── G. Removed endpoints are gone ─────────────────────────────────────
print("\nG. REMOVED ENDPOINTS")
for path in ['/api/components/names', '/api/components/cross-po-add']:
    r = requests.get(f'{B}{path}', headers=HA)
    check(f'{path} gone', r.status_code in (404, 405), f'HTTP {r.status_code}')

# ── H. Export ─────────────────────────────────────────────────────────
print("\nH. EXPORT")
r = requests.get(f'{B}/api/excel/export', headers=HA)
check('excel export', r.status_code == 200 and len(r.content) > 5000,
      f'HTTP {r.status_code}, {len(r.content)} bytes')
ids = [o['id'] for o in orders[:3]]
r = requests.get(f'{B}/api/excel/export', headers=HA,
                 params=[('order_ids', i) for i in ids])
check('export selection', r.status_code == 200, f'HTTP {r.status_code}')

# ── I. Resubmissions page actions ─────────────────────────────────────
print("\nI. RESUBMISSIONS ACTIONS")
comp2 = FIXTURE_STRIKE  # never real data — see the fixture block above
requests.post(f'{B}/api/submissions/reject', headers=HA,
              json={'order_id': comp2.order_id, 'component_id': comp2.id,
                    'sample_type': 'strike', 'reason': 'PRINT', 'notes': 'smoke'})
r = requests.post(f'{B}/api/submissions/mark-received', headers=HA,
                  json={'order_id': comp2.order_id, 'component_id': comp2.id,
                        'sample_type': 'strike'})
check('mark-received', r.status_code == 200, f'HTTP {r.status_code}')
r = requests.post(f'{B}/api/submissions/approve', headers=HA,
                  json={'order_id': comp2.order_id, 'component_id': comp2.id,
                        'sample_type': 'strike'})
db.expire_all()
still_open = db.query(SampleSubmission).filter(
    SampleSubmission.component_id == comp2.id,
    SampleSubmission.sample_type == 'strike',
    SampleSubmission.outcome.is_(None)).count()
check('approve closes the attempt', r.status_code == 200 and still_open == 0,
      f'HTTP {r.status_code}, {still_open} open')
r = requests.get(f'{B}/api/submissions/order/{comp2.order_id}', headers=HA)
check('per-order submissions', r.status_code == 200, f'HTTP {r.status_code}')
r = requests.get(f'{B}/api/submissions/siblings',
                 params={'order_id': comp2.order_id, 'component_id': comp2.id,
                         'sample_type': 'strike'}, headers=HA)
check('siblings lookup', r.status_code == 200, f'HTTP {r.status_code}')

_clear_fixtures()

# ── Summary ───────────────────────────────────────────────────────────
db.close()
passed = sum(1 for _, ok, _ in results if ok)
failed = [n for n, ok, _ in results if not ok]
print("\n" + "=" * 62)
print(f"{passed}/{len(results)} passed")
if failed:
    print("\nFAILED:")
    for f in failed:
        print(f"  - {f}")
    sys.exit(1)
print("all green")
