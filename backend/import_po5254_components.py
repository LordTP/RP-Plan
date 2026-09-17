"""Load PO 5254's components out of the factory's own tracking sheet.

The sheet is Prime's MAN CITY AW2026 status workbook. Critical Path has the
14 styles on PO 5254 but no components at all, so every strike off and lab dip
the factory has already sent, chased and had signed off exists only in that
spreadsheet. This replays it into CP through the public API -- no SQL -- so it
behaves the same against local SQLite and production Postgres.

WHAT IT MATCHES ON
    The sheet keys a row by STYLE + GENDER + CLR (S004807 / W / FIG). CP keys a
    style by its full code (S004807A-0767-MCI). W -> A and G -> K, and the
    middle segment is the colour, which is what makes the join exact: all 14
    sheet rows resolve to one live style each, with none left over.

HOW IT GROUPS
    One library entry per (name, colour) -- NOT per (name, colour, dates).
    Those differ in exactly one place: FLAT PRINT TO SLVE / FIG sits on three
    styles, two of which went v1 rejected 22 Jul -> v2 approved 4 Sep while the
    third was rejected the same day and never came back. Splitting on dates
    would file that as two unrelated entries and the stalled style would stop
    looking stalled. Kept as one entry it lands OUT OF STEP, which is the whole
    point of that flag.

DATES
    The sheet writes dates six different ways -- '14-JUL', '10/07/2026',
    '2026-07-14 00:00:00', '18-AUG (2ND)' -- and encodes the attempt chain in
    two parallel comma-separated lists: sent '14-JUL, 18-AUG (2ND)' against
    approved 'rej 22-JUL, APPD 4-SEP' means v1 went out 14 Jul and was rejected
    22 Jul, v2 went out 18 Aug and was approved 4 Sep. No years anywhere, so
    2026 is assumed throughout (the PO ships Oct 2026 and every date falls
    Jun-Sep). Normalising is what lets two rows that wrote the same history
    differently -- 'rej 22-JUL, 4-SEP' vs 'rej 22-JUL, APPD 4-SEP' -- collapse
    into one add.

    Replaying needs backdating, which is why RejectRequest.rejected_at exists.
    Without it a July rejection records as today and every idle- and stale-days
    figure downstream is wrong.

DELIBERATELY NOT IMPORTED
    Two CAPPUCCINO styles (S004808A-0833, S004809A-0833) carry a lab dip named
    FIG FLEE with FIG's exact dates. A cappuccino garment signed off against a
    fig dip reads as a fill-down, not a fact, so those two are reported and
    skipped rather than guessed at.

    Photo / PP sample size+qty ('1 PC S', '3 PCS 10/11') has nowhere to live in
    CP yet. Fit Sample and Shipment Sample columns are empty across all 14 rows.

    python import_po5254_components.py                       # show the plan
    python import_po5254_components.py --apply               # write it
    python import_po5254_components.py --apply --base URL    # against prod
"""
import argparse
import os
import re
import sys
from collections import defaultdict

import requests

DEFAULT_SHEET = ('~/Downloads/MAN CITY AW2026 PO5254 STITCHD '
                 'BUBBLE COLLECTIVE DROP 3  4 STATUS ~ 2026.09.15.xlsx')
PO = '5254'
YEAR = 2026
FIRST_ROW, LAST_ROW = 6, 19

# Sheet columns (1-indexed), from the two header rows at 4 and 5.
C_STYLE, C_GENDER, C_COLOUR = 4, 5, 9
C_SO_REF, C_SO_SENT, C_SO_APPD = 19, 20, 21
C_LD_REF, C_LD_SENT, C_LD_APPD = 22, 23, 24

GENDER_SUFFIX = {'W': 'A', 'G': 'K'}
MONTHS = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
          'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}

# (name, colour) pairs the sheet asserts but that don't survive a sanity check.
SKIP = {('FIG FLEE', 'CAPPUCCINO')}

SAMPLE_API = {'strike_off': 'strike', 'lab_dip': 'lab', 'label': 'label'}


def norm_date(tok):
    """Any of the sheet's date spellings -> 'YYYY-MM-DD', or None."""
    t = (tok or '').strip().upper()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', t)
    if m:
        return f'{m.group(1)}-{m.group(2)}-{m.group(3)}'
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', t)          # 10/07/2026 = d/m/y
    if m:
        return f'{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}'
    m = re.search(r'(\d{1,2})[-/\s]([A-Z]{3})', t)            # 14-JUL, 4-SEP
    if m and m.group(2) in MONTHS:
        return f'{YEAR}-{MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}'
    return None


def split_attempts(sent_cell, appd_cell):
    """The two cells are parallel lists, one entry per attempt.

    Returns [(sent_date, outcome, outcome_date), ...] with outcome one of
    APPROVED / REJECTED / OPEN. Commas inside brackets ('18-AUG (2ND)') are
    not separators.
    """
    def items(cell):
        return [p for p in re.split(r',(?![^(]*\))', cell) if p.strip()] if cell else []
    sents, appds = items(sent_cell), items(appd_cell)
    out = []
    for n in range(max(len(sents), len(appds))):
        sent = norm_date(sents[n]) if n < len(sents) else None
        raw = appds[n] if n < len(appds) else ''
        done = norm_date(raw)
        if 'REJ' in raw.upper():
            outcome = 'REJECTED'
        elif done:
            outcome = 'APPROVED'
        else:
            outcome = 'OPEN'
        out.append((sent, outcome, done))
    return out


def read_sheet(path):
    """-> {(name, colour, sample_type): {sheet_key: [attempts]}}"""
    import openpyxl
    ws = openpyxl.load_workbook(os.path.expanduser(path), data_only=True)['Sheet1']

    def cell(r, c):
        v = ws.cell(r, c).value
        return '' if v is None else str(v).strip()

    def stacked(r, c):
        """A cell can hold two components stacked with a newline."""
        v = cell(r, c)
        return [s.strip() for s in v.split('\n') if s.strip()] if v else []

    groups = defaultdict(dict)
    for r in range(FIRST_ROW, LAST_ROW + 1):
        base, gender, colour = cell(r, C_STYLE), cell(r, C_GENDER), cell(r, C_COLOUR).upper()
        key = (base, gender, colour)

        refs, sents, appds = (stacked(r, C_SO_REF), stacked(r, C_SO_SENT),
                              stacked(r, C_SO_APPD))
        for n, ref in enumerate(refs):
            # One ref with one date pair means the pair belongs to it.
            sent = sents[n] if n < len(sents) else (sents[0] if len(sents) == 1 else '')
            appd = appds[n] if n < len(appds) else (appds[0] if len(appds) == 1 else '')
            groups[(ref.upper(), colour, 'strike_off')][key] = split_attempts(sent, appd)

        ref = cell(r, C_LD_REF)
        if ref:
            groups[(ref.upper(), colour, 'lab_dip')][key] = split_attempts(
                cell(r, C_LD_SENT), cell(r, C_LD_APPD))
    return groups


def load_live(base, headers):
    """-> {(base_style, gender, colour): order} for this PO."""
    r = requests.get(f'{base}/api/orders?page=1&page_size=5000&tab=all',
                     headers=headers, timeout=120)
    r.raise_for_status()
    live = {}
    for o in r.json()['orders']:
        if o['po_number'] != PO:
            continue
        code = o['style_code'] or ''
        m = re.match(r'^(S\d+)([A-Z])-', code)
        if not m:
            continue
        gender = next((g for g, suf in GENDER_SUFFIX.items() if suf == m.group(2)), None)
        live[(m.group(1), gender, (o['colour'] or '').upper())] = o
    return live


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--sheet', default=DEFAULT_SHEET)
    ap.add_argument('--force', action='store_true',
                    help='add even though the PO already has components (see the guard below)')
    ap.add_argument('--base', default='http://localhost:8004')
    ap.add_argument('--user', default='admin')
    ap.add_argument('--password', default='admin123')
    args = ap.parse_args()
    base = args.base.rstrip('/')

    tok = requests.post(f'{base}/api/auth/login',
                        json={'username': args.user, 'password': args.password}, timeout=30)
    tok.raise_for_status()
    H = {'Authorization': f"Bearer {tok.json()['access_token']}"}

    live = load_live(base, H)
    groups = read_sheet(args.sheet)
    print(f'\n{base}\nPO {PO}: {len(live)} live styles\n')

    # Every add mints a FRESH library entry by design, so this script is not
    # idempotent: running it twice gives you two of everything rather than
    # updating what is there. Proven, not assumed -- a second --apply against a
    # loaded production dump took PO 5254 from 23 instances to 46 and left six
    # canonicals named FLAT PRINT TO SLVE instead of three. The realistic way
    # that happens on production is a retry after a partial failure, so refuse
    # up front unless the operator has explicitly said they mean it.
    existing = sum(len(o.get('components') or []) for o in live.values())
    if existing and not args.force:
        print(f'  REFUSING: PO {PO} already has {existing} component instances.\n'
              f'  This script only ever adds -- it will not update or de-duplicate them.\n'
              f'  Remove those entries first, or pass --force if you genuinely want more.\n')
        return 1

    plan, unmatched, skipped = [], [], []
    for (name, colour, stype), per_style in sorted(groups.items()):
        if (name, colour) in SKIP:
            skipped.append((name, colour, len(per_style)))
            continue
        targets = []
        for key, attempts in per_style.items():
            o = live.get(key)
            if o is None:
                unmatched.append((name, colour, key))
                continue
            targets.append((o, attempts))
        if targets:
            plan.append((name, colour, stype, targets))

    print(f'{"type":4} {"name":26} {"colour":13} {"sty":>3}  outcome')
    print('-' * 96)
    instances = 0
    for name, colour, stype, targets in sorted(plan, key=lambda p: (-len(p[3]), p[0])):
        instances += len(targets)
        states = {tuple(a) for _, a in targets}
        label = 'SO' if stype == 'strike_off' else ('LD' if stype == 'lab_dip' else 'LB')
        if len(states) == 1:
            chain = ' -> '.join(f'v{i+1} {o}{" " + d if d else ""}'
                                for i, (_s, o, d) in enumerate(targets[0][1]))
            print(f'{label:4} {name[:26]:26} {colour[:13]:13} {len(targets):>3}  {chain}')
        else:
            print(f'{label:4} {name[:26]:26} {colour[:13]:13} {len(targets):>3}  ** OUT OF STEP **')
            for o, att in targets:
                chain = ' -> '.join(f'v{i+1} {oc}{" " + d if d else ""}'
                                    for i, (_s, oc, d) in enumerate(att))
                print(f'{"":48} {o["style_code"]:20} {chain}')

    print(f'\n  {len(plan)} library entries -> {instances} instances')
    if skipped:
        print('\n  SKIPPED (colour mismatch -- check with Prime):')
        for name, colour, n in skipped:
            print(f'    {name} on {n} {colour} styles')
    if unmatched:
        print('\n  NO LIVE STYLE:')
        for name, colour, key in unmatched:
            print(f'    {name} {colour} <- sheet row {key}')

    if not args.apply:
        print('\nDRY RUN -- nothing written. Re-run with --apply.\n')
        return 0

    print('\nWriting...')
    made = 0
    for name, colour, stype, targets in plan:
        body = {'name': name, 'sample_type': stype}
        if colour:
            body['colour'] = colour
        r = requests.post(f'{base}/api/components/library', headers=H, json=body, timeout=60)
        if r.status_code not in (200, 201):
            print(f'  !! {name} / {colour}: create failed {r.status_code} {r.text[:120]}')
            continue
        canonical_id = r.json()['id']

        r = requests.post(f'{base}/api/components/library/{canonical_id}/apply', headers=H,
                          json={'order_ids': [o['id'] for o, _ in targets],
                                'starting_state': 'blank'}, timeout=120)
        if not r.ok:
            print(f'  !! {name} / {colour}: apply failed {r.status_code} {r.text[:120]}')
            continue

        detail = requests.get(f'{base}/api/components/library/{canonical_id}',
                              headers=H, timeout=60).json()
        by_order = {i['order_id']: i['instance_id'] for i in detail.get('instances', [])}
        api_type = SAMPLE_API[stype]

        for o, attempts in targets:
            iid = by_order.get(o['id'])
            if iid is None:
                continue
            made += 1
            # Replay the chain in order. Each attempt: it was sent (received),
            # then it was either turned down or signed off.
            for sent, outcome, done in attempts:
                if sent:
                    requests.post(f'{base}/api/submissions/mark-received', headers=H, timeout=60,
                                  json={'order_id': o['id'], 'component_id': iid,
                                        'sample_type': api_type, 'received_at': sent,
                                        'apply_scope': 'single'})
                if outcome == 'REJECTED':
                    requests.post(f'{base}/api/submissions/reject', headers=H, timeout=60,
                                  json={'order_id': o['id'], 'component_id': iid,
                                        'sample_type': api_type, 'reason': 'OTHER',
                                        'notes': f'Backfilled from Prime tracking sheet ({name})',
                                        'rejected_at': done, 'apply_scope': 'single'})
                elif outcome == 'APPROVED':
                    requests.post(f'{base}/api/submissions/approve', headers=H, timeout=60,
                                  json={'order_id': o['id'], 'component_id': iid,
                                        'sample_type': api_type, 'approved_at': done,
                                        'apply_scope': 'single'})
        print(f'  {name[:28]:28} {colour[:13]:13} {len(targets):>3} styles')

    print(f'\nDONE -- {len(plan)} entries, {made} instances.\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
