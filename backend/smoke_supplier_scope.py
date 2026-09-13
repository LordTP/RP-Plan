"""Supplier permission sweep over the component surface.

Factories add components themselves, so every component endpoint that takes
get_current_user has to scope in its own body. This builds a fixture where
ONE canonical spans two factories, then hits each of those endpoints as a
PRIME-23 factory user aimed at ACME-99's data. Anything answering 2xx that
shouldn't is a finding, and read endpoints are checked for leaked rows rather
than just status codes.

It also asserts the legitimate paths still work — a supplier renaming a
canonical that is entirely their own — so a fix here can't be "block
everything".

Run it against a local backend with the admin and factory (PRIME-23)
accounts present. It creates and removes its own fixture, and leaves real
data untouched.

    python smoke_supplier_scope.py
"""
import sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import requests
from database import SessionLocal
from models import PurchaseOrder, OrderComponent, Component, SampleSubmission

B = 'http://127.0.0.1:8004'
PO = 'SWEEP-FIXTURE'
db = SessionLocal()
A = {'Authorization': f"Bearer {requests.post(f'{B}/api/auth/login', json={'username':'admin','password':'admin123'}).json()['access_token']}"}
F = {'Authorization': f"Bearer {requests.post(f'{B}/api/auth/login', json={'username':'factory','password':'factory123'}).json()['access_token']}"}

findings, oks = [], []


def clean():
    ids = [o.id for o in db.query(PurchaseOrder).filter(PurchaseOrder.po_number == PO).all()]
    if ids:
        db.query(SampleSubmission).filter(SampleSubmission.order_id.in_(ids)).delete(synchronize_session=False)
        db.query(OrderComponent).filter(OrderComponent.order_id.in_(ids)).delete(synchronize_session=False)
        db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(ids)).delete(synchronize_session=False)
    db.query(Component).filter(Component.name.like('SWEEP %')).delete(synchronize_session=False)
    db.commit()


clean()
theirs = PurchaseOrder(po_number=PO, style_code='THEIRS-1', factory='ACME-99', customer='Other', total_quantity=1)
mine = PurchaseOrder(po_number=PO, style_code='MINE-1', factory='PRIME-23', customer='Mine', total_quantity=1)
db.add_all([theirs, mine]); db.commit(); db.refresh(theirs); db.refresh(mine)

_r = requests.post(f'{B}/api/components/library', headers=A,
                   json={'name': 'SWEEP SHARED', 'sample_type': 'strike_off', 'colour': 'RED'})
if _r.status_code not in (200, 201) or 'id' not in _r.json():
    # Usually means the backend was mid-reload, or a previous run left a
    # fixture behind. Say so rather than dying on a KeyError.
    print(f'FIXTURE SETUP FAILED: HTTP {_r.status_code} {_r.text[:200]}')
    clean()
    sys.exit(2)
canon = _r.json()['id']
requests.post(f'{B}/api/components/library/{canon}/apply', headers=A,
              json={'order_ids': [theirs.id, mine.id], 'starting_state': 'blank'})
db.expire_all()
their_inst = db.query(OrderComponent).filter(OrderComponent.canonical_id == canon,
                                             OrderComponent.order_id == theirs.id).first()
my_inst = db.query(OrderComponent).filter(OrderComponent.canonical_id == canon,
                                          OrderComponent.order_id == mine.id).first()


def probe(name, resp, *, want_block=True, leak_check=None):
    code = resp.status_code
    blocked = code in (400, 403, 404)
    if leak_check is not None:
        leaked = leak_check(resp)
        if leaked:
            findings.append(f'{name}: HTTP {code} but LEAKED {leaked}')
        else:
            oks.append(f'{name}: HTTP {code}, nothing leaked')
        return
    if want_block and not blocked:
        findings.append(f'{name}: HTTP {code} — expected a block')
    else:
        oks.append(f'{name}: HTTP {code}')


print('Probing as PRIME-23 factory user, targeting ACME-99 data\n')

probe('GET  order components (theirs)',
      requests.get(f'{B}/api/orders/{theirs.id}/components', headers=F))
probe('POST create component on their order',
      requests.post(f'{B}/api/orders/{theirs.id}/components', headers=F,
                    json={'name': 'SNEAK', 'sample_type': 'strike_off'}))
probe('PUT  update their instance',
      requests.put(f'{B}/api/components/{their_inst.id}', headers=F,
                   json={'strike_off_received': '2026-02-02'}))
probe('POST bulk-update their instance',
      requests.post(f'{B}/api/components/bulk-update', headers=F,
                    json={'component_ids': [their_inst.id], 'field': 'strike_off_status', 'value': 'APPROVED'}))
probe('POST apply-to-po from their instance',
      requests.post(f'{B}/api/components/{their_inst.id}/apply-to-po', headers=F,
                    json={'strike_off_status': 'APPROVED'}))
probe('POST library apply, copy from their instance',
      requests.post(f'{B}/api/components/library/{canon}/apply', headers=F,
                    json={'order_ids': [mine.id], 'starting_state': 'copy', 'peer_instance_id': their_inst.id}))
probe('POST bulk-edit their instance',
      requests.post(f'{B}/api/components/library/instances/bulk-edit', headers=F,
                    json={'instance_ids': [their_inst.id], 'status': 'APPROVED'}))
probe('PATCH rename shared canonical',
      requests.patch(f'{B}/api/components/library/{canon}', headers=F, json={'name': 'SWEEP HIJACKED'}))

# The legitimate case must still work: a canonical entirely on their own POs.
own = requests.post(f'{B}/api/components/library', headers=F,
                    json={'name': 'SWEEP OWN', 'sample_type': 'strike_off', 'colour': 'BLUE'}).json()['id']
requests.post(f'{B}/api/components/library/{own}/apply', headers=F,
              json={'order_ids': [mine.id], 'starting_state': 'blank'})
r = requests.patch(f'{B}/api/components/library/{own}', headers=F, json={'name': 'SWEEP OWN RENAMED'})
if r.status_code == 200:
    oks.append(f'PATCH rename OWN canonical: HTTP 200 (allowed, correct)')
else:
    findings.append(f'PATCH rename OWN canonical: HTTP {r.status_code} — should be allowed')
probe('DELETE their instance',
      requests.delete(f'{B}/api/components/{their_inst.id}', headers=F))
probe('DELETE shared canonical',
      requests.delete(f'{B}/api/components/library/{canon}', headers=F))
probe('POST merge (rename across factories)',
      requests.post(f'{B}/api/components/merge', headers=F,
                    json={'from_names': ['SWEEP SHARED'], 'to_name': 'SWEEP MERGED'}))

# Read endpoints: a 200 is fine, leaking the other factory's rows is not.
probe('GET  library detail (shared canonical)',
      requests.get(f'{B}/api/components/library/{canon}', headers=F),
      leak_check=lambda r: [i.get('style_code') for i in (r.json().get('instances') or [])
                            if (i.get('style_code') or '').startswith('THEIRS')] if r.status_code == 200 else None)
probe('GET  styles-with-canonical',
      requests.get(f'{B}/api/components/styles-with-canonical', headers=F, params={'canonical_id': canon}),
      leak_check=lambda r: [s.get('style_code') for s in (r.json().get('styles') or [])
                            if (s.get('style_code') or '').startswith('THEIRS')] if r.status_code == 200 else None)
probe('GET  styles-with-component',
      requests.get(f'{B}/api/components/styles-with-component', headers=F,
                   params={'po_number': PO, 'component_name': 'SWEEP SHARED'}),
      leak_check=lambda r: [s.get('style_code') for s in (r.json().get('styles') or [])
                            if (s.get('style_code') or '').startswith('THEIRS')] if r.status_code == 200 else None)
probe('GET  submissions for their order',
      requests.get(f'{B}/api/submissions/order/{theirs.id}', headers=F))
probe('POST reject on their instance',
      requests.post(f'{B}/api/submissions/reject', headers=F,
                    json={'order_id': theirs.id, 'component_id': their_inst.id,
                          'sample_type': 'strike', 'reason': 'PRINT', 'notes': 'x'}))
probe('POST approve on their instance',
      requests.post(f'{B}/api/submissions/approve', headers=F,
                    json={'order_id': theirs.id, 'component_id': their_inst.id, 'sample_type': 'strike'}))

db.expire_all()
still = db.query(OrderComponent).filter(OrderComponent.id == their_inst.id).first()
name_now = db.query(Component).filter(Component.id == canon).first()
print('\nState of ACME-99 data after every probe:')
print(f'   their instance exists : {still is not None}')
print(f'   their strike status   : {getattr(still, "strike_off_status", None)!r}   (None wanted)')
print(f'   their received date   : {str(getattr(still, "strike_off_received", None))[:10]!r}   (None wanted)')
print(f'   canonical name        : {getattr(name_now, "name", None)!r}   (SWEEP SHARED wanted)')

print(f'\n--- {len(oks)} correctly blocked / clean ---')
for o in oks: print('  OK   ' + o)
if findings:
    print(f'\n--- {len(findings)} FINDINGS ---')
    for f in findings: print('  !!   ' + f)
else:
    print('\nno findings')
clean()
print(f'\ncleaned up · orders {db.query(PurchaseOrder).count()} · canonicals {db.query(Component).count()}')
sys.exit(1 if findings else 0)
