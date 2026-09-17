"""Two corrections to PO 5254, both coming back from Prime.

1. FLAT PRINT TO SLVE / FIG covers three styles. Two were rejected on 22 July,
   resubmitted on 18 August and signed off on 4 September. The third was
   rejected the same day and never came back, so the entry sits permanently
   OUT OF STEP on something nobody can action as a unit. Split the stalled
   style onto its own entry.

   This goes through /api/components/library/{id}/split, which only rewrites
   canonical_id. Doing it the obvious way -- remove the instance and add it
   again -- would cascade sample_submissions and take the 22 July rejection
   with it, which is the one thing worth keeping.

2. The lab dip on the two CAPPUCCINO styles was skipped on the original import
   because it was recorded against "FIG FLEE" with FIG's dates, and a
   cappuccino garment signed off against a fig dip reads as a fill-down.
   Prime have confirmed the dip is real and it is cappuccino -- only the label
   was wrong. So it goes in under its own name, with the dates the sheet gives.

Both are additive. Nothing is deleted and no existing row is rewritten except
the one canonical_id the split moves.

    python fix_po5254_after_prime.py                       # show the plan
    python fix_po5254_after_prime.py --apply               # do it
    python fix_po5254_after_prime.py --apply --base URL    # against prod

Prompts for the password. Set CP_PASSWORD for an unattended run; there is
deliberately no --password flag.
"""
import argparse
import getpass
import os
import sys

import requests

PO = '5254'

# The entry to split, and the style to move off it.
SPLIT_NAME = 'FLAT PRINT TO SLVE'
SPLIT_COLOUR = 'FIG'
SPLIT_OFF_STYLE = 'S004808A-0767-MCI'

# The lab dip Prime confirmed. Dates are the sheet's, unchanged.
DIP_NAME = 'CAPPUCCINO FLEECE'
DIP_COLOUR = 'CAPPUCCINO'
DIP_STYLES = ['S004808A-0833-MCI', 'S004809A-0833-MCI']
DIP_RECEIVED = '2026-06-26'
DIP_APPROVED = '2026-07-09'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--base', default='http://localhost:8004')
    ap.add_argument('--user', default='admin')
    args = ap.parse_args()
    base = args.base.rstrip('/')

    password = os.environ.get('CP_PASSWORD') or getpass.getpass(
        f'Password for {args.user} on {base}: ')
    tok = requests.post(f'{base}/api/auth/login',
                        json={'username': args.user, 'password': password}, timeout=30)
    tok.raise_for_status()
    H = {'Authorization': f"Bearer {tok.json()['access_token']}"}

    orders = requests.get(f'{base}/api/orders?page=1&page_size=5000&tab=all',
                          headers=H, timeout=120).json()['orders']
    by_style = {o['style_code']: o for o in orders if o['po_number'] == PO}
    print(f'\n{base}\nPO {PO}: {len(by_style)} live styles\n')

    # ---- 1. the split -------------------------------------------------
    target = by_style.get(SPLIT_OFF_STYLE)
    split_plan = None
    if target is None:
        print(f'  !! {SPLIT_OFF_STYLE} not found on PO {PO}')
    else:
        inst = next((c for c in (target.get('components') or [])
                     if c['name'] == SPLIT_NAME), None)
        if inst is None:
            print(f'  !! {SPLIT_NAME} not found on {SPLIT_OFF_STYLE}')
        else:
            cid = inst['canonical_id']
            detail = requests.get(f'{base}/api/components/library/{cid}',
                                  headers=H, timeout=60).json()
            siblings = detail.get('instances', [])
            if len(siblings) <= 1:
                print(f'  -- {SPLIT_NAME} / {SPLIT_COLOUR} already has only one style; nothing to split')
            else:
                split_plan = (cid, inst['id'], siblings)
                print(f'1. SPLIT  {SPLIT_NAME} / {SPLIT_COLOUR}  (library entry #{cid})')
                for s in siblings:
                    mark = '  -> moves to its own entry' if s['instance_id'] == inst['id'] else '     stays'
                    print(f'      {s.get("style_code", "?"):22} {mark}')

    # ---- 2. the cappuccino lab dip ------------------------------------
    dip_targets = []
    for code in DIP_STYLES:
        o = by_style.get(code)
        if o is None:
            print(f'  !! {code} not found on PO {PO}')
            continue
        already = [c for c in (o.get('components') or [])
                   if c['sample_type'] == 'lab_dip']
        if already:
            print(f'  -- {code} already has a lab dip ({already[0]["name"]}); skipping')
            continue
        dip_targets.append(o)

    if dip_targets:
        print(f'\n2. ADD    {DIP_NAME} / {DIP_COLOUR}  (Lab Dip)')
        print(f'      received {DIP_RECEIVED} -> approved {DIP_APPROVED}')
        for o in dip_targets:
            print(f'      {o["style_code"]:22} {(o.get("description") or "")[:38]}')

    if not split_plan and not dip_targets:
        print('\nNothing to do.\n')
        return 0

    if not args.apply:
        print('\nDRY RUN -- nothing written. Re-run with --apply.\n')
        return 0

    print('\nWriting...')

    if split_plan:
        cid, instance_id, _ = split_plan
        r = requests.post(f'{base}/api/components/library/{cid}/split', headers=H, timeout=60,
                          json={'instance_ids': [instance_id]})
        if r.ok:
            b = r.json()
            print(f'  split  -> new library entry #{b["new_canonical_id"]}, '
                  f'{b["moved"]} moved, {b["left_behind"]} left behind')
        else:
            print(f'  !! split failed {r.status_code} {r.text[:150]}')

    if dip_targets:
        r = requests.post(f'{base}/api/components/library', headers=H, timeout=60,
                          json={'name': DIP_NAME, 'sample_type': 'lab_dip', 'colour': DIP_COLOUR})
        if r.status_code not in (200, 201):
            print(f'  !! create failed {r.status_code} {r.text[:150]}')
        else:
            canonical_id = r.json()['id']
            r = requests.post(f'{base}/api/components/library/{canonical_id}/apply', headers=H,
                              timeout=120,
                              json={'order_ids': [o['id'] for o in dip_targets],
                                    'starting_state': 'blank'})
            if not r.ok:
                print(f'  !! apply failed {r.status_code} {r.text[:150]}')
            else:
                detail = requests.get(f'{base}/api/components/library/{canonical_id}',
                                      headers=H, timeout=60).json()
                for i in detail.get('instances', []):
                    requests.post(f'{base}/api/submissions/mark-received', headers=H, timeout=60,
                                  json={'order_id': i['order_id'], 'component_id': i['instance_id'],
                                        'sample_type': 'lab', 'received_at': DIP_RECEIVED,
                                        'apply_scope': 'single'})
                    requests.post(f'{base}/api/submissions/approve', headers=H, timeout=60,
                                  json={'order_id': i['order_id'], 'component_id': i['instance_id'],
                                        'sample_type': 'lab', 'approved_at': DIP_APPROVED,
                                        'apply_scope': 'single'})
                print(f'  dip    -> entry #{canonical_id} on {len(dip_targets)} styles, approved {DIP_APPROVED}')

    print('\nDONE\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
