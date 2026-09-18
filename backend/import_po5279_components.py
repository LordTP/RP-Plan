"""Backfill PO 5279's lab dips and strike offs from the STITCHD SS27 tracking sheet.

The sheet (Book2 TP 18.09.xlsx) records component progress as free text in two
columns, e.g. "SLEEVE PRINT received 2.9.26 approved 15.9.26 // 14.09 Back Print
& Front Chest print s/o's rec - 17.09 APPR BACK AND FRONT CHEST PRINTS". One
cell routinely describes two or three separate components on different dates, so
the split below was read by hand rather than parsed, and every judgement call is
recorded in NOTE so it can be argued with.

Decisions taken with Thomas, 18 Sep 2026:
  * Two entries written in the STRIKE OFFS column describe lab dips
    (S006030A "bulk fabric", S006499A "LAB DIP ... TOO DARK") -> created as lab dips.
  * Two sheet dates are impossible and were corrected: S006065A "received 2.9.27"
    (a year after its own approval) -> 2026-09-02, and S006060A "approved 15.6.26"
    (three months before it was sent) -> 2026-09-15.
  * "2nd submit" with no first date means an earlier attempt was rejected. Attempt 1
    is created as a rejection backdated RESUBMIT_GAP days before the second receipt.
    27 is the median gap between attempts in the existing sample_submissions, so the
    figure comes from this book's own history rather than being invented.
  * The 24.08 "Sent ..." entries are OUTSTANDING -- still waiting on PRIME-23.
    There is no "sent" column on a component, so that date is kept in the library
    entry's notes instead of being silently dropped.
  * A status with no date anywhere is dated today.
  * One library entry per component per style -- never shared. Two styles can carry
    the same name on the same spec and still be different things: BULK FABRIC on
    MC-V-09 is a lab dip for IRON on one style and CAMEO BROWN on the other, and
    FRONT CHEST PRINT on B-T-12 is a different design per colourway. The existing
    book agrees -- FLAT PRINT TO SLVE has four canonicals for five instances.
    Each entry carries the style's colour and the sheet's spec code.

    python import_po5279_components.py                  # report, writes nothing
    python import_po5279_components.py --apply          # write to local
    python import_po5279_components.py --apply --base https://... # against prod

DESTRUCTIVE only in the sense that it adds rows. It refuses to run if PO 5279
already has components, so a second --apply cannot silently double them up.
"""
import argparse
import datetime
import getpass
import os
import sys
from collections import defaultdict

import requests

PO = '5279'
TODAY = '2026-09-18'
RESUBMIT_GAP = 27          # median days between attempts in this book's history
DEFAULT_BASE = 'http://localhost:8004'
# The submissions API spells these 'strike' and 'lab', NOT the column names.
# Sending the column names returns 422 on every call, which the first run of
# this script did 37 times without noticing -- hence post() below.
SAMPLE_API = {'strike_off': 'strike', 'lab_dip': 'lab'}


def back(iso, days=RESUBMIT_GAP):
    """The date `days` before `iso` -- used to place an undated first rejection."""
    d = datetime.date.fromisoformat(iso) - datetime.timedelta(days=days)
    return d.isoformat()


# style, type, name, spec, attempts [(received, outcome, resolved)], status, note
# outcome None = nothing came back yet; the component sits OUTSTANDING.
R = lambda s: (None, 'REJECTED', s)

PLAN = [
 # ── lab dips, from the LAB DIPS column ──
 ('S006036A-0779-MCI','lab_dip','BULK FABRIC','MC-V-09',
  [R(back('2026-09-14')), ('2026-09-14', None, None)], 'first attempt undated, backdated'),
 ('S006037A-0867-MCI','lab_dip','BULK FABRIC','MC-V-09',
  [R(back('2026-09-14')), ('2026-09-14', None, None)], 'first attempt undated, backdated'),
 ('S006032A-0779-MCI','lab_dip','BULK FABRIC','MC-T-13',
  [R(back('2026-09-14')), ('2026-09-14', None, None)], 'first attempt undated, backdated'),
 ('S006000K-0869-MCI','lab_dip','BULK FABRIC','B-T-12',
  [('2026-09-14', None, None)], None),
 ('S006001K-0869-MCI','lab_dip','BULK FABRIC','B-S-09',
  [('2026-09-14', None, None)], None),
 ('S006023K-0774-MCI','lab_dip','LAB DIP - OPTION C','G-T-10',
  [('2026-09-14', 'APPROVED', '2026-09-16')], None),
 ('S006021K-0869-MCI','lab_dip','LAB DIP','G-T-10',
  [('2026-09-14', None, None)], None),
 ('S006071K-0868-MCI','lab_dip','LAB DIP','B-T-12',
  [R('2026-08-24')], 'rejected 24.08, never received-dated'),
 # ── lab dips that were logged in the STRIKE OFFS column ──
 ('S006030A-0869-MCI','lab_dip','BULK FABRIC','MC-P-13',
  [('2026-09-11', None, None)], 'written under strike offs; it is fabric'),
 ('S006499A-0869-MCI','lab_dip','LAB DIP','',
  [('2026-09-14', 'REJECTED', '2026-09-16')], 'written under strike offs; too dark'),

 # ── strike offs ──
 ('S006368A-0868-MCI','strike_off','SUBLIMATION PRINT','MC-S-09',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006036A-0779-MCI','strike_off','BACK PRINT','MC-V-09',
  [('2026-09-02', 'APPROVED', '2026-09-15')], 'sent to cust 02.09, no separate received date'),
 ('S006036A-0779-MCI','strike_off','FRONT PRINT','MC-V-09',
  [('2026-09-02', 'APPROVED', '2026-09-15')], 'sent to cust 02.09, no separate received date'),
 ('S006159A-0212-MCI','strike_off','FRONT CHEST PRINT - REFLEX BLUE','MC-T-13',
  [], 'sent 24.08, nothing back'),
 ('S006159A-0212-MCI','strike_off','BACK PRINT - REFLEX BLUE','MC-T-13',
  [], 'sent 24.08, nothing back'),
 ('S006160A-0874-MCI','strike_off','FRONT CHEST','MC-T-13',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006160A-0874-MCI','strike_off','BACK EMB','MC-T-13',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006058A-0868-MCI','strike_off','BACK PRINT','L-T-38',
  [R(back('2026-09-14')), ('2026-09-14', 'APPROVED', '2026-09-17')], 'first attempt undated, backdated'),
 ('S006063A-0774-MCI','strike_off','SLEEVE PRINT','EL-SS-12',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006063A-0774-MCI','strike_off','BACK PRINT','EL-SS-12',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006063A-0774-MCI','strike_off','FRONT PRINT','EL-SS-12',
  [], 'waiting on approval, no dates at all'),
 ('S006059A-0717-MCI','strike_off','FRONT EMB','EL-T-31',
  [R(back('2026-09-14')), ('2026-09-14', 'APPROVED', '2026-09-17')], 'first attempt undated, backdated'),
 ('S006059A-0717-MCI','strike_off','FRONT PRINT','EL-T-31',
  [R(back('2026-09-14')), ('2026-09-14', None, None)], 'only the EMB was named approved'),
 ('S006064A-0870-MCI','strike_off','HIGH BUILD / FLAT PRINT','EL-H-24',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006064A-0870-MCI','strike_off','HIGH BUILD PRINT FRONT','EL-H-24',
  [('2026-09-07', 'APPROVED', '2026-09-15')], None),
 ('S006065A-0870-MCI','strike_off','HIGH BUILD PRINT','EL-FS-09',
  [('2026-09-02', 'APPROVED', '2026-09-15')], 'sheet read 2.9.27, after its own approval'),
 ('S006060A-0212-MCI','strike_off','BACK PRINT MULTI','L-T-38',
  [], 'sent 24.08, nothing back'),
 ('S006060A-0212-MCI','strike_off','WOVEN LABEL PRINT','L-T-38',
  [('2026-09-02', 'APPROVED', '2026-09-15')], 'sheet read approved 15.6.26, before it was sent'),
 ('S005997K-0866-MCI','strike_off','WOVEN BADGE','B-WS-02',
  [R('2026-09-07')], 'rejected in-house, no received date'),
 ('S006067K-0176-MCI','strike_off','SLEEVE PRINT','B-T-12',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006067K-0176-MCI','strike_off','BACK PRINT','B-T-12',
  [('2026-09-14', 'APPROVED', '2026-09-17')], None),
 ('S006067K-0176-MCI','strike_off','FRONT CHEST PRINT','B-T-12',
  [('2026-09-14', 'APPROVED', '2026-09-17')], None),
 ('S005999K-0176-MCI','strike_off','CHEST PRINT','B-T-12',
  [('2026-09-07', 'APPROVED', '2026-09-15')], None),
 ('S006023K-0774-MCI','strike_off','FRONT CHEST PRINT','G-T-10',
  [R(back('2026-09-14')), ('2026-09-14', None, None)], 'first attempt undated, backdated'),
 ('S006021K-0869-MCI','strike_off','CHEST PRINT','G-T-10',
  [('2026-09-02', 'APPROVED', '2026-09-15')], None),
 ('S006071K-0868-MCI','strike_off','SLEEVE CREST','B-T-12',
  [(None, 'APPROVED', TODAY)], 'approved with no date anywhere; dated today'),
 ('S006071K-0868-MCI','strike_off','FRONT CHEST PRINT','B-T-12',
  [R(back('2026-09-11')), ('2026-09-11', 'APPROVED', '2026-09-17')], 'first attempt undated, backdated'),
]

STYLE_COLOUR = {
    'S005996K-0866-MCI': 'NAVY PEONY',
    'S005997K-0866-MCI': 'NAVY PEONY',
    'S005998K-0866-MCI': 'NAVY PEONY',
    'S005999K-0176-MCI': 'EGRET',
    'S006000K-0869-MCI': 'SURF SPRAY',
    'S006001K-0869-MCI': 'SURF SPRAY',
    'S006004K-0868-MCI': 'FLOATY BLUE',
    'S006021K-0869-MCI': 'SURF SPRAY',
    'S006023K-0774-MCI': 'BARELY PINK',
    'S006028A-0868-MCI': 'FLOATY BLUE',
    'S006029A-0176-MCI': 'EGRET',
    'S006030A-0869-MCI': 'SURF SPRAY',
    'S006031A-0869-MCI': 'SURF SPRAY',
    'S006032A-0779-MCI': 'IRON',
    'S006034A-0176-MCI': 'EGRET',
    'S006036A-0779-MCI': 'IRON',
    'S006037A-0867-MCI': 'CAMEO BROWN',
    'S006058A-0868-MCI': 'FLOATY BLUE',
    'S006059A-0717-MCI': 'ROSEWATER',
    'S006060A-0212-MCI': 'SNOW WHITE',
    'S006061A-0220-MCI': 'GLACIER MARL',
    'S006062A-0212-MCI': 'SNOW WHITE',
    'S006062A-0868-MCI': 'FLOATY BLUE',
    'S006063A-0774-MCI': 'BARELY PINK',
    'S006064A-0870-MCI': 'PERSIAN JEWEL',
    'S006065A-0870-MCI': 'PERSIAN JEWEL',
    'S006067K-0176-MCI': 'EGRET',
    'S006071K-0868-MCI': 'FLOATY BLUE',
    'S006159A-0212-MCI': 'SNOW WHITE',
    'S006160A-0874-MCI': 'CEMENT',
    'S006185A-0176-MCI': 'EGRET',
    'S006367A-0868-MCI': 'FLOATY BLUE',
    'S006368A-0868-MCI': 'FLOATY BLUE',
    'S006499A-0869-MCI': 'SURF SPRAY',
}

# Where a "sent" date exists but the model has nowhere to put it, keep it in words.
SENT_NOTE = {
    ('S006159A-0212-MCI', 'FRONT CHEST PRINT - REFLEX BLUE'): 'Sent 24.08.26, nothing back',
    ('S006159A-0212-MCI', 'BACK PRINT - REFLEX BLUE'): 'Sent 24.08.26, nothing back',
    ('S006060A-0212-MCI', 'BACK PRINT MULTI'): 'Sent 24.08.26, nothing back',
}


FAILURES = []


def post(url, H, payload, what, method='post'):
    """Call and complain. The submissions endpoints answer 422 for a bad
    sample_type and the run otherwise looks like a success."""
    fn = requests.put if method == 'put' else requests.post
    r = fn(url, headers=H, json=payload, timeout=60)
    if not r.ok:
        FAILURES.append(f'{what}: {r.status_code} {r.text[:160]}')
    return r.ok


def login(base, email, password):
    r = requests.post(f'{base}/api/auth/login', timeout=60,
                      json={'username': email, 'password': password})
    r.raise_for_status()
    return {'Authorization': f'Bearer {r.json()["access_token"]}'}


def load_live(base, headers):
    r = requests.get(f'{base}/api/orders?page=1&page_size=5000&tab=all',
                     headers=headers, timeout=120)
    r.raise_for_status()
    return {o['style_code']: o for o in r.json()['orders'] if o['po_number'] == PO}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--base', default=DEFAULT_BASE)
    ap.add_argument('--email', default='admin')
    ap.add_argument('--force', action='store_true',
                    help='add even though PO 5279 already has components')
    args = ap.parse_args()
    base = args.base.rstrip('/')

    password = os.environ.get('CP_PASSWORD') or getpass.getpass(f'password for {args.email}: ')
    H = login(base, args.email, password)
    live = load_live(base, H)
    print(f'\nPO {PO}: {len(live)} live styles on {base}\n')

    missing = sorted({s for s, *_ in PLAN} - set(live))
    if missing:
        print('  NO LIVE STYLE for:', ', '.join(missing), '\n')

    # Existing components are the guard: this script adds, it never updates.
    existing = 0
    for o in live.values():
        r = requests.get(f'{base}/api/orders/{o["id"]}/components', headers=H, timeout=60)
        if r.ok:
            existing += len(r.json() if isinstance(r.json(), list) else r.json().get('components', []))
    if existing and not args.force:
        print(f'  REFUSING: PO {PO} already has {existing} component instances.\n'
              f'  This script adds rather than updates, so running it now would double them.\n'
              f'  Remove those first, or pass --force if you genuinely want more.\n')
        return 1

    # One library entry per component per style -- never shared. Two styles can
    # carry the same name on the same spec and still be different things: BULK
    # FABRIC on MC-V-09 is a lab dip for IRON on one style and CAMEO BROWN on the
    # other, and FRONT CHEST PRINT on B-T-12 is a different design per colourway.
    # It also matches the existing book, where FLAT PRINT TO SLVE has four
    # canonicals for five instances.
    groups = defaultdict(list)
    for style, stype, name, spec, attempts, note in PLAN:
        if style in live:
            groups[(name, stype, spec, style)].append((style, attempts, note))

    print(f'{"":4} {"component":32} {"spec":9} {"colour":13} history')
    print('-' * 112)
    inst = 0
    for (name, stype, spec, _st), rows in sorted(groups.items(), key=lambda g: (g[0][1], g[0][0], g[0][3])):
        label = 'LD' if stype == 'lab_dip' else 'SO'
        for style, attempts, note in rows:
            inst += 1
            if attempts:
                chain = ' -> '.join(
                    f'v{i+1} ' + (oc or 'awaiting') + (f' {res or rec}' if (res or rec) else '')
                    for i, (rec, oc, res) in enumerate(attempts))
            else:
                chain = 'OUTSTANDING - nothing received'
            print(f'{label:4} {name[:32]:32} {spec[:9]:9} '
                  f'{STYLE_COLOUR.get(style, "")[:13]:13} {style}  {chain}')
            if note:
                print(f'{"":52} note: {note}')

    print(f'\n  {len(groups)} library entries -> {inst} instances across '
          f'{len({s for s, *_ in PLAN if s in live})} styles')
    dupes = defaultdict(list)
    for (name, stype, spec, st) in groups:
        dupes[(name, stype, spec)].append(st)
    same = {k: v for k, v in dupes.items() if len(v) > 1}
    if same:
        print('\n  SAME NAME + SPEC, kept as separate entries (different colours):')
        for (name, _t, spec), styles in same.items():
            print(f'    {name} [{spec}] -> ' +
                  ', '.join(f'{s} {STYLE_COLOUR.get(s, "")}' for s in styles))

    if not args.apply:
        print('\nDRY RUN -- nothing written. Re-run with --apply.\n')
        return 0

    print('\nWriting...')
    made = 0
    for (name, stype, spec, _st), rows in groups.items():
        body = {'name': name, 'sample_type': stype}
        colour = STYLE_COLOUR.get(rows[0][0])
        if colour:
            body['colour'] = colour
        if spec:
            body['spec_url'] = spec          # the field the UI labels "Spec"
        notes = {SENT_NOTE[(s, name)] for s, _, _ in rows if (s, name) in SENT_NOTE}
        if notes:
            body['supplier_notes'] = ' / '.join(sorted(notes))
        r = requests.post(f'{base}/api/components/library', headers=H, json=body, timeout=60)
        if r.status_code not in (200, 201):
            print(f'  !! {name}: create failed {r.status_code} {r.text[:120]}')
            continue
        cid = r.json()['id']

        order_ids = [live[s]['id'] for s, _, _ in rows]
        r = requests.post(f'{base}/api/components/library/{cid}/apply', headers=H, timeout=120,
                          json={'order_ids': order_ids, 'starting_state': 'blank'})
        if not r.ok:
            print(f'  !! {name}: apply failed {r.status_code} {r.text[:120]}')
            continue

        detail = requests.get(f'{base}/api/components/library/{cid}', headers=H, timeout=60).json()
        by_order = {i['order_id']: i['instance_id'] for i in detail.get('instances', [])}
        api_type = SAMPLE_API[stype]

        for style, attempts, _note in rows:
            oid = live[style]['id']
            iid = by_order.get(oid)
            if iid is None:
                continue
            made += 1
            # No attempts at all means nothing has come back: the sheet's
            # "Sent 24.08 ..." rows and S006063A's front print. Nothing in the
            # replay below sets a status, so say it explicitly -- otherwise they
            # land blank rather than OUTSTANDING and drop out of the worklist.
            if not attempts:
                post(f'{base}/api/components/{iid}', H,
                     {f'{stype}_status': 'OUTSTANDING'},
                     f'{style} {name} -> OUTSTANDING', method='put')
            for rec, outcome, res in attempts:
                if rec:
                    post(f'{base}/api/submissions/mark-received', H,
                         {'order_id': oid, 'component_id': iid, 'sample_type': api_type,
                          'received_at': rec, 'apply_scope': 'single'},
                         f'{style} {name} received {rec}')
                if outcome == 'REJECTED':
                    post(f'{base}/api/submissions/reject', H,
                         {'order_id': oid, 'component_id': iid, 'sample_type': api_type,
                          'reason': 'OTHER',
                          'notes': f'Backfilled from STITCHD SS27 sheet ({name})',
                          'rejected_at': res, 'apply_scope': 'single'},
                         f'{style} {name} rejected {res}')
                elif outcome == 'APPROVED':
                    post(f'{base}/api/submissions/approve', H,
                         {'order_id': oid, 'component_id': iid, 'sample_type': api_type,
                          'approved_at': res, 'apply_scope': 'single'},
                         f'{style} {name} approved {res}')
        print(f'  {name[:34]:34} {spec[:9]:9} {len(rows):>3} styles')

    if FAILURES:
        print(f'\n  {len(FAILURES)} CALLS FAILED -- components exist but dates/status may be missing:')
        for f in FAILURES[:20]:
            print(f'    {f}')
        if len(FAILURES) > 20:
            print(f'    ... and {len(FAILURES) - 20} more')
        print(f'\nFINISHED WITH ERRORS -- {len(groups)} entries, {made} instances.\n')
        return 1

    print(f'\nDONE -- {len(groups)} entries, {made} instances, no failed calls.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
