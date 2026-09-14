"""Seed the real PO 5252 and its components — Mimi and Charlotte's data.

Written for a freshly cleared production. Everything below was captured from
the working local copy after the files were imported and the components built
by hand, so it carries the real dates and sample states rather than a blank
shell.

    docker exec -it app-backend-1 python seed_real_po.py            # dry run
    docker exec -it app-backend-1 python seed_real_po.py --apply    # for real

Refuses to run if PO 5252 already exists, so it cannot double-insert. If you
need to redo it, clear that PO first.

Components are created the way the app creates them: one canonical per
add-event, with every style's instance pointing at it. That is what makes the
library group them together and the worklist show them as one card. Building
them any other way gives you nine unrelated entries.
"""
import json
import sys
from datetime import datetime

from database import SessionLocal
from models import PurchaseOrder, OrderComponent, Component, SampleSubmission
from sample_helpers import reconcile_sample_status, SAMPLE_PREFIXES_COMPONENT

PAYLOAD = json.loads(r'''
{
  "canonicals": [
    {
      "key": 2,
      "name": "AOP PRINT",
      "sample_type": "strike_off",
      "colour": "HIGH RISK RED",
      "description": "All-over print \u2014 no single placement",
      "position": null,
      "supplier_notes": null
    },
    {
      "key": 1,
      "name": "HIGH RISK RED",
      "sample_type": "lab_dip",
      "colour": "HIGH RISK RED",
      "description": "Wales babywear body colour",
      "position": null,
      "supplier_notes": null
    },
    {
      "key": 3,
      "name": "NECK LABEL PRINT",
      "sample_type": "strike_off",
      "colour": "WHITE",
      "description": "second strike off, deliberately outstanding",
      "position": null,
      "supplier_notes": null
    }
  ],
  "styles": [
    {
      "order": {
        "po_number": "5252",
        "system_po_number": "5069",
        "is_active": true,
        "customer": "LEVY MERCHANDISING",
        "china_orderbook_ref": "FAW BABY KIT",
        "customer_po_number": "POFAWSLEEPSUIT080626",
        "season": "AW26",
        "factory": "PRIME-23",
        "terms": "CIF MIDON",
        "sales_person": "FIONA",
        "style_code": "S004900B-0126-NRO",
        "customer_style_code": "FAW0375",
        "description": "NRO BABY WALES KIT SLEEPSUIT",
        "colour": "HIGH RISK RED",
        "gender": "008",
        "direct_repeat_new": "NEW",
        "size_2xs": 90,
        "size_xs": 60,
        "size_s": 63,
        "size_m": 60,
        "size_l": 45,
        "total_quantity": 318,
        "order_received_date": "2026-06-10T00:00:00",
        "order_sent_to_factory_date": "2026-06-10T00:00:00",
        "tech_packs_sent_to_factory": "2026-06-12T00:00:00",
        "factory_confirmed_ex_factory": "2026-10-30T00:00:00",
        "revised_po_ex_factory": "2026-10-30T00:00:00",
        "original_del_date_to_customer": "2026-09-01T00:00:00",
        "eta_to_uk": "2026-12-29T00:00:00",
        "eta_to_customer": "2027-01-03T00:00:00",
        "customer_po_open_month": "September",
        "expected_dispatch_arrive_uk_month": "January",
        "is_late": false,
        "date_notes": {
          "original_po_ex_factory": "ASAP"
        }
      },
      "components": [
        {
          "name": "AOP PRINT",
          "sample_type": "strike_off",
          "strike_off_status": "APPROVED",
          "strike_off_received": "2026-09-07T00:00:00",
          "strike_off_approved": "2026-09-10T00:00:00",
          "_canonical": 2
        },
        {
          "name": "HIGH RISK RED",
          "sample_type": "lab_dip",
          "lab_dip_status": "APPROVED",
          "lab_dip_received": "2026-08-24T00:00:00",
          "lab_dip_approved": "2026-09-03T00:00:00",
          "_canonical": 1
        },
        {
          "name": "NECK LABEL PRINT",
          "sample_type": "strike_off",
          "strike_off_status": "OUTSTANDING",
          "_canonical": 3
        }
      ]
    },
    {
      "order": {
        "po_number": "5252",
        "system_po_number": "5069",
        "is_active": true,
        "customer": "LEVY MERCHANDISING",
        "china_orderbook_ref": "FAW BABY KIT",
        "customer_po_number": "POFAWKITSET080626",
        "season": "AW26",
        "factory": "PRIME-23",
        "terms": "CIF MIDON",
        "sales_person": "FIONA",
        "style_code": "S004901B-0126-NRO",
        "customer_style_code": "FAW0376",
        "description": "NRO BABY WALES KIT T-SHIRT AND SHORT SET",
        "colour": "HIGH RISK RED",
        "gender": "008",
        "direct_repeat_new": "NEW",
        "size_xs": 50,
        "size_s": 42,
        "size_m": 42,
        "size_l": 46,
        "size_xl": 60,
        "total_quantity": 240,
        "order_received_date": "2026-06-10T00:00:00",
        "order_sent_to_factory_date": "2026-06-10T00:00:00",
        "tech_packs_sent_to_factory": "2026-06-12T00:00:00",
        "factory_confirmed_ex_factory": "2026-10-30T00:00:00",
        "revised_po_ex_factory": "2026-10-30T00:00:00",
        "original_del_date_to_customer": "2026-09-01T00:00:00",
        "eta_to_uk": "2026-12-29T00:00:00",
        "eta_to_customer": "2027-01-03T00:00:00",
        "customer_po_open_month": "September",
        "expected_dispatch_arrive_uk_month": "January",
        "is_late": false,
        "date_notes": {
          "original_po_ex_factory": "ASAP"
        }
      },
      "components": [
        {
          "name": "AOP PRINT",
          "sample_type": "strike_off",
          "strike_off_status": "APPROVED",
          "strike_off_received": "2026-09-07T00:00:00",
          "strike_off_approved": "2026-09-10T00:00:00",
          "_canonical": 2
        },
        {
          "name": "HIGH RISK RED",
          "sample_type": "lab_dip",
          "lab_dip_status": "APPROVED",
          "lab_dip_received": "2026-08-24T00:00:00",
          "lab_dip_approved": "2026-09-03T00:00:00",
          "_canonical": 1
        }
      ]
    },
    {
      "order": {
        "po_number": "5252",
        "system_po_number": "5069",
        "is_active": true,
        "customer": "LEVY MERCHANDISING",
        "china_orderbook_ref": "FAW BABY KIT",
        "customer_po_number": "POFAWKITSET080626",
        "season": "AW26",
        "factory": "PRIME-23",
        "terms": "CIF MIDON",
        "sales_person": "FIONA",
        "style_code": "S004901K-0126-NRO",
        "customer_style_code": "FAW0376",
        "description": "NRO KIDS WALES KIT T-SHIRT AND SHORT SET",
        "colour": "HIGH RISK RED",
        "gender": "004",
        "direct_repeat_new": "NEW",
        "size_2xs": 60,
        "total_quantity": 60,
        "order_received_date": "2026-06-10T00:00:00",
        "order_sent_to_factory_date": "2026-06-10T00:00:00",
        "tech_packs_sent_to_factory": "2026-06-12T00:00:00",
        "factory_confirmed_ex_factory": "2026-10-30T00:00:00",
        "revised_po_ex_factory": "2026-10-30T00:00:00",
        "original_del_date_to_customer": "2026-09-01T00:00:00",
        "eta_to_uk": "2026-12-29T00:00:00",
        "eta_to_customer": "2027-01-03T00:00:00",
        "customer_po_open_month": "September",
        "expected_dispatch_arrive_uk_month": "January",
        "is_late": false,
        "date_notes": {
          "original_po_ex_factory": "ASAP"
        }
      },
      "components": [
        {
          "name": "AOP PRINT",
          "sample_type": "strike_off",
          "strike_off_status": "APPROVED",
          "strike_off_received": "2026-09-07T00:00:00",
          "strike_off_approved": "2026-09-10T00:00:00",
          "_canonical": 2
        },
        {
          "name": "HIGH RISK RED",
          "sample_type": "lab_dip",
          "lab_dip_status": "APPROVED",
          "lab_dip_received": "2026-08-24T00:00:00",
          "lab_dip_approved": "2026-09-03T00:00:00",
          "_canonical": 1
        }
      ]
    },
    {
      "order": {
        "po_number": "5252",
        "system_po_number": "5069",
        "is_active": true,
        "customer": "LEVY MERCHANDISING",
        "china_orderbook_ref": "FAW BABY KIT",
        "customer_po_number": "POFAWTUTU080626",
        "season": "AW26",
        "factory": "PRIME-23",
        "terms": "CIF MIDON",
        "sales_person": "FIONA",
        "style_code": "S004902B-0126-NRO",
        "customer_style_code": "FAW0377",
        "description": "NRO BABY WALES KIT TUTU",
        "colour": "HIGH RISK RED",
        "gender": "008",
        "direct_repeat_new": "NEW",
        "size_2xs": 90,
        "size_xs": 60,
        "size_s": 63,
        "size_m": 60,
        "size_l": 45,
        "total_quantity": 318,
        "order_received_date": "2026-06-10T00:00:00",
        "order_sent_to_factory_date": "2026-06-10T00:00:00",
        "tech_packs_sent_to_factory": "2026-06-12T00:00:00",
        "factory_confirmed_ex_factory": "2026-10-30T00:00:00",
        "revised_po_ex_factory": "2026-10-30T00:00:00",
        "original_del_date_to_customer": "2026-09-01T00:00:00",
        "eta_to_uk": "2026-12-29T00:00:00",
        "eta_to_customer": "2027-01-03T00:00:00",
        "customer_po_open_month": "September",
        "expected_dispatch_arrive_uk_month": "January",
        "is_late": false,
        "date_notes": {
          "original_po_ex_factory": "ASAP"
        }
      },
      "components": [
        {
          "name": "AOP PRINT",
          "sample_type": "strike_off",
          "strike_off_status": "APPROVED",
          "strike_off_received": "2026-09-07T00:00:00",
          "_canonical": 2,
          "strike_off_approved": "2026-09-10T00:00:00"
        },
        {
          "name": "HIGH RISK RED",
          "sample_type": "lab_dip",
          "lab_dip_status": "APPROVED",
          "lab_dip_received": "2026-08-24T00:00:00",
          "lab_dip_approved": "2026-09-03T00:00:00",
          "_canonical": 1
        }
      ]
    }
  ],
  "submissions": [
    {
      "sample_type": "lab",
      "attempt_no": 1,
      "requested_at": "2026-06-10T00:00:00",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:56.979966",
      "outcome": "REJECTED",
      "reason": "COLOUR",
      "notes": "High Risk Red off standard",
      "_style": "S004900B-0126-NRO",
      "_component": [
        "S004900B-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    },
    {
      "sample_type": "lab",
      "attempt_no": 1,
      "requested_at": "2026-06-10T00:00:00",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:56.990599",
      "outcome": "REJECTED",
      "reason": "COLOUR",
      "notes": "High Risk Red off standard",
      "_style": "S004901B-0126-NRO",
      "_component": [
        "S004901B-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    },
    {
      "sample_type": "lab",
      "attempt_no": 1,
      "requested_at": "2026-06-10T00:00:00",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:57.000109",
      "outcome": "REJECTED",
      "reason": "COLOUR",
      "notes": "High Risk Red off standard",
      "_style": "S004901K-0126-NRO",
      "_component": [
        "S004901K-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    },
    {
      "sample_type": "lab",
      "attempt_no": 1,
      "requested_at": "2026-06-10T00:00:00",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:57.009170",
      "outcome": "REJECTED",
      "reason": "COLOUR",
      "notes": "High Risk Red off standard",
      "_style": "S004902B-0126-NRO",
      "_component": [
        "S004902B-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    },
    {
      "sample_type": "lab",
      "attempt_no": 2,
      "requested_at": "2026-09-11T16:05:56.979966",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:56.983884",
      "outcome": "APPROVED",
      "_style": "S004900B-0126-NRO",
      "_component": [
        "S004900B-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    },
    {
      "sample_type": "lab",
      "attempt_no": 2,
      "requested_at": "2026-09-11T16:05:56.990599",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:56.994058",
      "outcome": "APPROVED",
      "_style": "S004901B-0126-NRO",
      "_component": [
        "S004901B-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    },
    {
      "sample_type": "lab",
      "attempt_no": 2,
      "requested_at": "2026-09-11T16:05:57.000109",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:57.003193",
      "outcome": "APPROVED",
      "_style": "S004901K-0126-NRO",
      "_component": [
        "S004901K-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    },
    {
      "sample_type": "lab",
      "attempt_no": 2,
      "requested_at": "2026-09-11T16:05:57.009170",
      "submitted_at": "2026-08-24T00:00:00",
      "resolved_at": "2026-09-11T16:05:57.012161",
      "outcome": "APPROVED",
      "_style": "S004902B-0126-NRO",
      "_component": [
        "S004902B-0126-NRO",
        "HIGH RISK RED",
        "lab_dip"
      ]
    }
  ]
}
''')

DATE_FIELDS_HINT = ('_date', '_at', '_received', '_approved', '_factory',
                    '_customer', '_uk', '_sent', '_etd', '_eta')


def coerce(model, field, value):
    """JSON gives us strings; SQLAlchemy wants datetimes for date columns."""
    col = model.__table__.columns.get(field)
    if col is None:
        return None, False
    t = str(col.type).upper()
    if ('DATETIME' in t or 'DATE' in t) and isinstance(value, str):
        try:
            return datetime.fromisoformat(value), True
        except ValueError:
            return value, True
    return value, True


def main():
    apply_changes = '--apply' in sys.argv
    db = SessionLocal()
    po = PAYLOAD['styles'][0]['order']['po_number']

    existing = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po).count()
    if existing:
        print(f'\nPO {po} already has {existing} styles. Refusing to run.\n')
        db.close()
        return 1

    print(f'\nWILL CREATE')
    print('-' * 62)
    print(f'  PO {po} · {PAYLOAD["styles"][0]["order"].get("customer")} · '
          f'{PAYLOAD["styles"][0]["order"].get("factory")}')
    for s in PAYLOAD['styles']:
        o = s['order']
        print(f'    {o.get("style_code"):<22} {str(o.get("description"))[:34]:<34} '
              f'{o.get("colour")}  qty {o.get("total_quantity")}')
        for c in s['components']:
            state = c.get('strike_off_status') or c.get('lab_dip_status') or c.get('label_status') or '-'
            print(f'      - {c.get("name"):<20} {c.get("sample_type"):<12} {state}')
    subs = PAYLOAD.get('submissions', [])
    rejects = [x for x in subs if x.get('outcome') == 'REJECTED']
    if subs:
        print('\n  sample history')
        for x in subs:
            who = x['_component'][1] if x.get('_component') else 'order-level'
            note = ''
            if x.get('reason'):
                note = ' - ' + x['reason'] + (f" ({x['notes']})" if x.get('notes') else '')
            print(f'    {x["_style"]:<22} {who:<18} v{x["attempt_no"]}  {x["outcome"]}{note}')
    print(f'\n  {len(PAYLOAD["canonicals"])} library entries, '
          f'{len(PAYLOAD["styles"])} styles, '
          f'{sum(len(s["components"]) for s in PAYLOAD["styles"])} component instances, '
          f'{len(subs)} sample attempts ({len(rejects)} rejected)')

    if not apply_changes:
        print('\nDRY RUN - nothing written. Re-run with --apply.\n')
        db.close()
        return 0

    try:
        # One canonical per add-event, minted first so every instance can point
        # at it. This is the bit that makes them group in the library.
        canon_ids = {}
        for c in PAYLOAD['canonicals']:
            row = Component(
                name=(c['name'] or '').strip().upper(),
                sample_type=c['sample_type'],
                colour=c.get('colour') or '',
                description=c.get('description'),
                position=c.get('position'),
                supplier_notes=c.get('supplier_notes'),
            )
            db.add(row)
            db.flush()
            canon_ids[c['key']] = row.id

        made_orders = made_comps = 0
        for s in PAYLOAD['styles']:
            o = PurchaseOrder()
            for f, v in s['order'].items():
                val, ok = coerce(PurchaseOrder, f, v)
                if ok:
                    setattr(o, f, val)
            db.add(o)
            db.flush()
            made_orders += 1

            for c in s['components']:
                inst = OrderComponent(order_id=o.id,
                                      canonical_id=canon_ids.get(c.get('_canonical')))
                for f, v in c.items():
                    if f == '_canonical':
                        continue
                    val, ok = coerce(OrderComponent, f, v)
                    if ok:
                        setattr(inst, f, val)
                # Same reconcile the API runs on every save, so status and
                # dates cannot land inconsistent with each other.
                reconcile_sample_status(inst, SAMPLE_PREFIXES_COMPONENT)
                db.add(inst)
                made_comps += 1

        # Sample history last. Attempt numbers and rejection counts are DERIVED
        # from these rows at read time rather than stored on the component, so
        # without them the attempt badges and the whole rejection trail are
        # missing even though every status looks right.
        db.flush()
        style_ids = {o.style_code: o.id for o in
                     db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po).all()}
        comp_ids = {}
        for inst in db.query(OrderComponent).filter(
                OrderComponent.order_id.in_(list(style_ids.values()))).all():
            sc = next(k for k, v in style_ids.items() if v == inst.order_id)
            comp_ids[(sc, inst.name, inst.sample_type)] = inst.id

        made_subs = 0
        for x in PAYLOAD.get('submissions', []):
            sub = SampleSubmission(order_id=style_ids[x['_style']])
            if x.get('_component'):
                sub.component_id = comp_ids.get(tuple(x['_component']))
            for f, v in x.items():
                if f.startswith('_'):
                    continue
                val, ok = coerce(SampleSubmission, f, v)
                if ok:
                    setattr(sub, f, val)
            db.add(sub)
            made_subs += 1

        db.commit()
    except Exception as e:
        db.rollback()
        print(f'\nFAILED - rolled back, nothing created.\n  {e}\n')
        db.close()
        return 1

    print(f'\nDONE')
    print('-' * 62)
    print(f'  library entries   {len(canon_ids)}')
    print(f'  styles            {made_orders}')
    print(f'  components        {made_comps}')
    print(f'  sample attempts   {made_subs}')
    print(f'\n  PO {po} now has '
          f'{db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po).count()} styles.\n')
    db.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
