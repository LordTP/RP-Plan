"""The board and the warnings centre must never disagree about what is late.

They share active_order_clauses() and the same thresholds, but they compute
gate state by different routes — this asserts the two actually land in the
same place, so a change to one surface can't silently desync the other.
"""
import asyncio, sys
from database import SessionLocal
from models import User
import dashboard_warnings
from routers import dashboard_board as B

db = SessionLocal()
me = db.query(User).filter(User.role == 'admin').first() or db.query(User).first()
run = lambda c: asyncio.get_event_loop().run_until_complete(c)

board = run(B.get_critical_path_board(limit=10000, current_user=me, db=db))
warns = run(dashboard_warnings.get_dashboard_warnings(current_user=me, db=db))

fails = []
def check(name, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  ' + detail if detail else ''}")
    if not ok:
        fails.append(name)

# Same population.
board_ids = {s['order_id'] for s in board['styles']}
check("board population matches active_order_clauses",
      len(board_ids) == board['total_styles'],
      f"{board['total_styles']} styles")

# Component-level overdue warnings must appear as late/crit on the board.
GATE_FOR = {
    'lab_dip_overdue': 'lab_dip',
    'strike_off_overdue': 'strike_off',
    'fit_sample_overdue': 'fit',
    'pps_received_overdue': 'pps',
}
by_id = {s['order_id']: s for s in board['styles']}
for w in warns['warnings']:
    gate = GATE_FOR.get(w['key'])
    if not gate:
        continue
    bad = []
    for item in w['items']:
        row = by_id.get(item['order_id'])
        if row is None:
            bad.append(f"order {item['order_id']} missing from board")
            continue
        if row['gates'][gate]['state'] not in ('late', 'crit'):
            bad.append(f"{item['po_number']}/{item.get('style_code')} "
                       f"{gate}={row['gates'][gate]['state']}")
    check(f"{w['key']} -> board gate '{gate}' is late",
          not bad, f"{len(w['items'])} items" + ('  ' + '; '.join(bad[:3]) if bad else ''))

# PO-level paperwork warnings must show on at least one style of that PO.
for key, gate in (('tech_packs_needed', 'tech_packs'), ('specs_needed', 'specs')):
    w = next((x for x in warns['warnings'] if x['key'] == key), None)
    if not w:
        continue
    bad = []
    for item in w['items']:
        rows = [s for s in board['styles'] if s['po_number'] == item['po_number']]
        if not any(r['gates'][gate]['state'] in ('late', 'crit') for r in rows):
            bad.append(item['po_number'])
    check(f"{key} -> some style on the PO is late at '{gate}'",
          not bad, f"{len(w['items'])} POs" + ('  ' + ', '.join(bad[:3]) if bad else ''))

# Totals must be internally consistent.
for key, t in board['totals'].items():
    states = [s['gates'][key]['state'] for s in board['styles']]
    check(f"totals[{key}] matches the rows",
          t['done'] == states.count('done')
          and t['late'] == states.count('late') + states.count('crit'))

# Bottleneck must name the gate with the most late styles.
if board['bottleneck']:
    worst = max(board['totals'].items(), key=lambda kv: kv[1]['late'])
    check("bottleneck names the worst gate",
          board['bottleneck']['gate'] == worst[0],
          f"{board['bottleneck']['label']} x{board['bottleneck']['count']}")

db.close()
print(f"\n{'all green' if not fails else str(len(fails)) + ' FAILED'}")
sys.exit(1 if fails else 0)
