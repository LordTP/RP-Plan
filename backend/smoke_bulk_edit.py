"""Guardrails on bulk field editing.

The import once overwrote the style code on every row. Bulk edit is the same
mechanism with a nicer front end, so these are the assertions that stop it
becoming the same incident: an unknown field is refused rather than reflected
onto the model, identity columns need explicit confirmation and can never be
blanked, and a preview never writes.
"""
import asyncio, sys
from fastapi import HTTPException
from database import SessionLocal
from models import User, PurchaseOrder
from routers import bulk_edit as BE

db = SessionLocal()
me = db.query(User).filter(User.role == 'admin').first() or db.query(User).first()
run = lambda c: asyncio.get_event_loop().run_until_complete(c)
ids = [o.id for o in db.query(PurchaseOrder).limit(4).all()]
fails = []

def expect_reject(name, body):
    try:
        run(BE.bulk_edit_field(body, me, db))
        print(f"  FAIL  {name} — was accepted")
        fails.append(name)
    except HTTPException as e:
        print(f"  PASS  {name} -> {e.detail[:70]}")

def expect_ok(name, body):
    try:
        r = run(BE.bulk_edit_field(body, me, db))
        print(f"  PASS  {name}")
        return r
    except HTTPException as e:
        print(f"  FAIL  {name} -> {e.detail}")
        fails.append(name)
        return None

if not ids:
    print("no orders in the database — nothing to probe")
    sys.exit(0)

expect_reject("unknown field is refused", {"order_ids": ids, "field_name": "secret_column", "new_value": "x"})
expect_reject("costing stays out", {"order_ids": ids, "field_name": "trade_price", "new_value": "5"})
expect_reject("sample status stays out", {"order_ids": ids, "field_name": "pps_status", "new_value": "APPROVED"})
expect_reject("tracking ref stays out", {"order_ids": ids, "field_name": "tracking_reference", "new_value": "X"})
expect_reject("quantity stays out", {"order_ids": ids, "field_name": "total_quantity", "new_value": "10"})
expect_reject("identity needs confirmation", {"order_ids": ids, "field_name": "po_number", "new_value": "9999"})
expect_reject("identity can't be blanked", {"order_ids": ids, "field_name": "style_code", "new_value": "", "confirm_identity": True})
expect_reject("dates are validated", {"order_ids": ids, "field_name": "eta_to_uk", "new_value": "ASAP"})
expect_reject("choices are validated", {"order_ids": ids, "field_name": "fit_sample_required", "new_value": "MAYBE"})
expect_reject("row cap holds", {"order_ids": list(range(1, 600)), "field_name": "colour", "new_value": "RED"})
expect_reject("empty selection", {"order_ids": [], "field_name": "colour", "new_value": "RED"})

r = expect_ok("preview returns a diff", {"order_ids": ids, "field_name": "colour", "new_value": "SMOKE TEST COLOUR"})
if r is not None:
    if r.get('applied'):
        print("  FAIL  preview reported applied=True"); fails.append("preview applied")
    else:
        print(f"  PASS  preview did not apply  ({r['will_change']} would change, {r['overwriting']} overwrite)")
    db.expire_all()
    rows = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(ids)).all()
    if any((o.colour or '') == 'SMOKE TEST COLOUR' for o in rows):
        print("  FAIL  preview wrote to the database"); fails.append("preview wrote")
    else:
        print("  PASS  database untouched by preview")

# --- current values, which is what the editor shows before anything is typed ---
multi = []
for po in [r[0] for r in db.query(PurchaseOrder.po_number).distinct().limit(3)]:
    multi += [o.id for o in db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po).limit(2)]

def current(name, body, check):
    try:
        r = run(BE.current_values(body, me, db))
    except HTTPException as e:
        print(f"  FAIL  {name} -> {e.detail}"); fails.append(name); return None
    ok, detail = check(r)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}  {detail}")
    if not ok: fails.append(name)
    return r

current("current values refuses an unknown field is handled",
        {"order_ids": ids, "field_name": "colour"},
        lambda r: (r['total'] == len(ids), f"{r['total']} styles, {r['po_count']} PO(s)"))

if len(multi) > 2:
    current("multi-PO selection groups by PO",
            {"order_ids": multi, "field_name": "colour"},
            lambda r: (r['po_count'] == len(r['by_po']) and r['po_count'] > 1,
                       f"{r['po_count']} POs, {len(r['distinct'])} distinct values"))
    current("tally counts add up to the selection",
            {"order_ids": multi, "field_name": "colour"},
            lambda r: (sum(d['count'] for d in r['distinct']) == r['total'],
                       f"sum={sum(d['count'] for d in r['distinct'])} total={r['total']}"))
    current("every selected style appears exactly once",
            {"order_ids": multi, "field_name": "customer"},
            lambda r: (sorted(x['order_id'] for g in r['by_po'] for x in g['rows']) == sorted(multi),
                       "rows match the selection"))

try:
    run(BE.current_values({"order_ids": ids, "field_name": "trade_price"}, me, db))
    print("  FAIL  current values honours the allowlist"); fails.append("current allowlist")
except HTTPException as e:
    print(f"  PASS  current values honours the allowlist -> {e.detail[:50]}")

db.rollback()
db.close()
print(f"\n{'all green' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
