"""Fill a LOCAL database with believable component and sample data for a demo.

LOCAL ONLY. It talks to http://localhost:8004 and refuses to run against
anything else. It writes a lot of components and rejections, which is exactly
what you do not want on production.

Everything goes through the real API rather than INSERTs, so the result is
indistinguishable from data somebody entered by hand: canonicals land in the
library, instances carry proper statuses, and a rejection genuinely closes v1
and opens v2 with a reason — sample_submissions rows are created lazily on
first rejection, so hand-written SQL would have produced a shape the app never
makes.

Dates copy the rhythm of the one real PO on the system (5252): tech packs go
out, lab dips come back about ten weeks later and are signed off a week after
that, strike offs follow and are signed off within a few days, and all of it
lands roughly seven weeks before ex-factory. Each PO is then placed against
its OWN ex-factory date, so an order shipping in October is finished while one
shipping in December is still waiting.

Six POs are deliberately left with no components at all, so the "Not started"
panel has something to show.

    python seed_demo_components.py            # show the plan
    python seed_demo_components.py --apply    # do it
"""
import sys
from datetime import datetime, timedelta

import requests

BASE = 'http://localhost:8004'
TODAY = datetime(2026, 9, 15)

# A component set per PO, chosen to match what the styles actually are — the
# ELLE POs are ladies' activewear, the MCI ones are men's jersey, 5278 is
# headwear. Nonsense names would make the demo read as fake.
#
# state:
#   'done'        every sample approved, comfortably before ex-factory
#   'progress'    a mix: some approved, some back and awaiting sign-off,
#                 some still out
#   'rework'      a rejection that closed v1 and opened v2
#   'outstanding' components added, nothing back yet
PLAN = [
    {
        'po': '5278', 'state': 'done',
        'components': [
            ('EMBROIDERED CREST', 'strike_off', 'BIRCH'),
            ('WOVEN BRAND LABEL', 'label', None),
            ('BIRCH', 'lab_dip', 'BIRCH'),
        ],
    },
    {
        'po': '5260', 'state': 'done',
        'components': [
            ('MAIN FABRIC', 'lab_dip', 'JET BLACK'),
            ('CARE LABEL', 'label', None),
            ('HEAT TRANSFER LOGO', 'strike_off', 'JET BLACK'),
        ],
    },
    {
        'po': '5261', 'state': 'progress',
        'components': [
            ('MAIN FABRIC', 'lab_dip', 'IRON'),
            ('CARE LABEL', 'label', None),
            ('HEAT TRANSFER LOGO', 'strike_off', 'IRON'),
        ],
    },
    {
        'po': '5265', 'state': 'progress',
        'components': [
            ('MAIN FABRIC', 'lab_dip', 'JET BLACK'),
            ('WAISTBAND ELASTIC', 'strike_off', 'JET BLACK'),
        ],
    },
    {
        'po': '5254', 'state': 'progress',
        'components': [
            ('CHEST PRINT', 'strike_off', 'FIG'),
            ('RIB FABRIC', 'lab_dip', 'FIG'),
            ('WOVEN NECK LABEL', 'label', None),
        ],
    },
    {
        'po': '5279', 'state': 'rework',
        'components': [
            ('AOP PRINT', 'strike_off', 'FLOATY BLUE'),
            ('EMBROIDERED LOGO', 'strike_off', 'EGRET'),
            ('FLOATY BLUE', 'lab_dip', 'FLOATY BLUE'),
        ],
        'reject': {
            'component': 'AOP PRINT', 'sample_type': 'strike',
            'reason': 'PLACEMENT',
            'notes': 'Panel repeat sitting 3cm low on the front — raise to match the spec drawing.',
        },
    },
    {
        'po': '5282', 'state': 'rework',
        'components': [
            ('PANEL FABRIC', 'lab_dip', 'JET BLACK'),
            ('REFLECTIVE TRIM', 'strike_off', 'JET BLACK'),
            ('CARE LABEL', 'label', None),
        ],
        'reject': {
            'component': 'PANEL FABRIC', 'sample_type': 'lab',
            'reason': 'COLOUR',
            'notes': 'Reading green under store light. Please re-dye against the approved swatch.',
        },
    },
    {
        'po': '5280', 'state': 'outstanding',
        'components': [
            ('GRAPHIC PRINT', 'strike_off', 'SNOW WHITE'),
            ('MAIN JERSEY', 'lab_dip', 'CLOUDBURST'),
        ],
    },
    {
        'po': '5283', 'state': 'outstanding',
        'components': [
            ('PANEL FABRIC', 'lab_dip', 'ILLUSION BLUE'),
            ('REFLECTIVE TRIM', 'strike_off', 'JET BLACK'),
        ],
    },
]

# Untouched on purpose. 5252 is the only real data on the system; the rest give
# the "Not started" panel something to list.
LEAVE_BLANK = ['5269', '5284', '5285', '5286', '5287', '5288']
LEAVE_ALONE = ['5252']

TYPE_TO_SAMPLE = {'strike_off': 'strike', 'lab_dip': 'lab', 'label': 'label'}


def die(msg):
    print(f'\n{msg}\n')
    sys.exit(1)


def business_days_before(d, n):
    out = d
    for _ in range(n):
        out -= timedelta(days=1)
        while out.weekday() >= 5:
            out -= timedelta(days=1)
    return out


def business_days_after(d, n):
    out = d
    for _ in range(n):
        out += timedelta(days=1)
        while out.weekday() >= 5:
            out += timedelta(days=1)
    return out


def schedule(ex_factory, state, idx):
    """Received and approved dates for one component on a PO.

    Anchored to that PO's ex-factory date, mirroring 5252: samples resolve
    about seven weeks out, and each component in a set is staggered a few days
    so a PO does not look like everything landed on one afternoon.
    """
    anchor = business_days_before(ex_factory, 35 - idx * 4)
    if state == 'done':
        received = anchor
        approved = business_days_after(received, 4)
        return received, approved
    if state == 'progress':
        # Rotate: approved / back but unsigned / still out.
        slot = idx % 3
        if slot == 0:
            received = anchor
            return received, business_days_after(received, 5)
        if slot == 1:
            return anchor, None                            # waiting on us
        return None, None                                  # waiting on them
    return None, None                                      # outstanding, rework v2


def main():
    apply = '--apply' in sys.argv
    if not BASE.startswith('http://localhost') and not BASE.startswith('http://127.'):
        die(f'REFUSING: {BASE} is not local.')

    try:
        tok = requests.post(f'{BASE}/api/auth/login',
                            json={'username': 'admin', 'password': 'admin123'}, timeout=15)
        tok.raise_for_status()
    except Exception as e:
        die(f'Could not reach the local backend at {BASE}: {e}')
    H = {'Authorization': f"Bearer {tok.json()['access_token']}"}

    orders = requests.get(f'{BASE}/api/orders?page=1&page_size=5000&tab=all',
                          headers=H, timeout=60).json()['orders']
    by_po = {}
    for o in orders:
        by_po.setdefault(o['po_number'], []).append(o)

    print(f'\n{len(orders)} orders across {len(by_po)} POs on this database\n')
    print(f'{"PO":7} {"styles":>6} {"ex-factory":11} {"state":12} components')
    print('-' * 78)
    total_instances = 0
    for row in PLAN:
        styles = by_po.get(row['po'], [])
        if not styles:
            print(f'{row["po"]:7} {"(missing)":>6}')
            continue
        ex = max((s.get('revised_po_ex_factory') or s.get('original_po_ex_factory') or '')
                 for s in styles)[:10] or '—'
        names = ', '.join(n for n, _t, _c in row['components'])
        total_instances += len(styles) * len(row['components'])
        print(f'{row["po"]:7} {len(styles):>6} {ex:11} {row["state"]:12} {names}')

    blank = sum(len(by_po.get(p, [])) for p in LEAVE_BLANK)
    print(f'\n  {total_instances} component instances to create')
    print(f'  {blank} styles across {len(LEAVE_BLANK)} POs left with none (for "Not started")')
    print(f'  PO {", ".join(LEAVE_ALONE)} untouched (real data)')

    if not apply:
        print('\nDRY RUN — nothing written. Re-run with --apply.\n')
        return 0

    print('\nWriting…')
    made = 0
    for row in PLAN:
        styles = by_po.get(row['po'], [])
        if not styles:
            continue
        order_ids = [s['id'] for s in styles]
        ex_raw = max((s.get('revised_po_ex_factory') or s.get('original_po_ex_factory') or '')
                     for s in styles)
        ex = datetime.fromisoformat(ex_raw[:19]) if ex_raw else TODAY + timedelta(days=60)

        for idx, (name, stype, colour) in enumerate(row['components']):
            body = {'name': name, 'sample_type': stype}
            if colour:
                body['colour'] = colour
            r = requests.post(f'{BASE}/api/components/library', headers=H, json=body, timeout=30)
            if r.status_code not in (200, 201):
                print(f'  !! {row["po"]} {name}: create failed {r.status_code} {r.text[:90]}')
                continue
            canonical_id = r.json()['id']

            r = requests.post(f'{BASE}/api/components/library/{canonical_id}/apply', headers=H,
                              json={'order_ids': order_ids, 'starting_state': 'blank'}, timeout=60)
            if not r.ok:
                print(f'  !! {row["po"]} {name}: apply failed {r.status_code} {r.text[:90]}')
                continue

            detail = requests.get(f'{BASE}/api/components/library/{canonical_id}',
                                  headers=H, timeout=30).json()
            # The library detail calls them instance_id, not id.
            instances = detail.get('instances', [])
            inst_ids = [i['instance_id'] for i in instances]
            made += len(inst_ids)

            received, approved = schedule(ex, row['state'], idx)
            if received or approved:
                payload = {'instance_ids': inst_ids}
                if received:
                    payload['received'] = received.strftime('%Y-%m-%d')
                if approved:
                    payload['approved'] = approved.strftime('%Y-%m-%d')
                payload['status'] = 'APPROVED' if approved else 'RECEIVED'
                requests.post(f'{BASE}/api/components/library/instances/bulk-edit',
                              headers=H, json=payload, timeout=60)

            # A real rejection: closes v1, opens v2 OUTSTANDING with a reason.
            rj = row.get('reject')
            if rj and rj['component'] == name and inst_ids:
                first = instances[0]
                r = requests.post(f'{BASE}/api/submissions/reject', headers=H, timeout=60, json={
                    'order_id': first['order_id'],
                    'component_id': first['instance_id'],
                    'sample_type': rj['sample_type'],
                    'reason': rj['reason'],
                    'notes': rj['notes'],
                    'apply_scope': 'all_on_po',
                })
                print(f'  {row["po"]} {name}: rejected ({rj["reason"]}) -> v2 '
                      f'[{r.status_code}]')

        print(f'  {row["po"]:7} {row["state"]:12} {len(row["components"])} components '
              f'x {len(order_ids)} styles')

    print(f'\nDONE — {made} instances created.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
