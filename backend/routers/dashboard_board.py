"""Critical-path board — one row per live style, one column per gate.

The dashboard's top panel. Answers "where is everything stuck" in a shape you
read as a pattern rather than a list: a vertical run of amber down one column
says the whole book is jammed on that gate.

Deliberately its own endpoint rather than reusing the orders list: the board
needs six derived states and an ex-factory date per style, not 77 raw columns,
and the dashboard has no reason to pull the whole order payload. It shares
`active_order_clauses()` and the warning thresholds with the warnings centre so
the two can never disagree about what is late.
"""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, OrderComponent
from auth import get_current_user
from sample_helpers import is_sample_done, business_days_between, closure_days_between
from supplier_access import apply_supplier_filter
from dashboard_warnings import active_order_clauses
import app_settings

router = APIRouter()

# Order matters — this is left-to-right on the board, and it is the order work
# actually happens in.
GATES = [
    ('tech_packs', 'Tech packs'),
    ('specs', 'Specs'),
    ('lab_dip', 'Lab dip'),
    ('strike_off', 'Strike off'),
    ('fit', 'Fit'),
    ('pps', 'PPS'),
]

# A gate this far past its threshold stops being amber and goes red. Anything
# 50% over the number somebody chose in Settings is not "running late", it has
# been forgotten about.
CRIT_MULTIPLIER = 1.5


def _state(days, threshold):
    """Amber past the threshold, red at half again past it."""
    if days >= threshold * CRIT_MULTIPLIER:
        return 'crit'
    return 'late' if days >= threshold else 'idle'


def _sample_gate(objs, prefix, clock_start, threshold_for, now):
    """Resolve one sample gate across however many carriers it has.

    `objs` is the components for a component-level gate (lab dip, strike off)
    or a single-item list holding the order for an order-level one (fit, PPS).
    The worst carrier wins: if five strike offs are fine and one is 31 days
    late, the style is 31 days late.
    """
    if not objs:
        return {'state': 'na', 'days': None}

    worst = {'state': 'done', 'days': None}
    rank = {'done': 0, 'idle': 1, 'flight': 2, 'late': 3, 'crit': 4}
    every_done = True

    for obj in objs:
        status = getattr(obj, f'{prefix}_status', None)
        received = getattr(obj, f'{prefix}_received', None)
        approved = getattr(obj, f'{prefix}_approved', None)

        if is_sample_done(status, approved):
            continue
        every_done = False

        if received and not approved:
            # With us, not the factory — days since it landed on our desk.
            here = {'state': 'flight', 'days': business_days_between(received, now)}
        elif clock_start:
            days = business_days_between(clock_start, now)
            st = _state(days, threshold_for(obj))
            here = {'state': st, 'days': days if st != 'idle' else None}
        else:
            here = {'state': 'idle', 'days': None}

        if rank[here['state']] > rank[worst['state']]:
            worst = here

    if every_done:
        return {'state': 'done', 'days': None}
    return worst


@router.get("/api/dashboard/board")
async def get_critical_path_board(
    limit: int = 40,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Per-style gate states, worst first, plus per-gate totals."""
    T = {t['key']: app_settings.get_threshold(db, t['key'])
         for t in app_settings.WARNING_THRESHOLDS}
    now = datetime.utcnow()

    q = db.query(PurchaseOrder).filter(*active_order_clauses())
    q = apply_supplier_filter(q, current_user)
    orders = q.all()

    # One query for every component rather than one per order — the old
    # warnings code does it per-order and pays for it on a full book.
    comps_by_order = {}
    if orders:
        for c in db.query(OrderComponent).filter(
            OrderComponent.order_id.in_([o.id for o in orders])
        ).all():
            comps_by_order.setdefault(c.order_id, []).append(c)

    def strike_threshold(comp):
        name = (getattr(comp, 'name', '') or '').lower()
        if 'badge' in name or 'woven label' in name or 'woven tape' in name:
            return T['warn_strike_off_slow_days']
        return T['warn_strike_off_days']

    rows = []
    for o in orders:
        comps = comps_by_order.get(o.id, [])
        tp_clock = o.tech_packs_sent_to_factory
        gates = {}

        # Paperwork we owe the factory — the clock starts when the order went over.
        for key, field, thr in (
            ('tech_packs', 'tech_packs_sent_to_factory', T['warn_tech_packs_days']),
            ('specs', 'specs_sent_to_factory', T['warn_specs_days']),
        ):
            if getattr(o, field):
                gates[key] = {'state': 'done', 'days': None}
            elif o.order_sent_to_factory_date:
                days = business_days_between(o.order_sent_to_factory_date, now)
                st = _state(days, thr)
                gates[key] = {'state': st, 'days': days if st != 'idle' else None}
            else:
                gates[key] = {'state': 'idle', 'days': None}

        gates['lab_dip'] = _sample_gate(
            [c for c in comps if c.sample_type == 'lab_dip'],
            'lab_dip', tp_clock, lambda _c: T['warn_lab_dip_days'], now)
        gates['strike_off'] = _sample_gate(
            [c for c in comps if c.sample_type == 'strike_off'],
            'strike_off', tp_clock, strike_threshold, now)

        # Fit is a whole-garment concern and lives on the order, never a
        # component — same as PPS. An explicit N means it was never wanted.
        fit_carriers = [] if (o.fit_sample_required or '').strip().upper() == 'N' else [o]
        gates['fit'] = _sample_gate(
            fit_carriers, 'fit_sample', tp_clock, lambda _o: T['warn_fit_sample_days'], now)

        gates['pps'] = _pps_gate(o, comps, T, now)

        ex_factory = (o.revised_po_ex_factory or o.factory_confirmed_ex_factory
                      or o.original_po_ex_factory)
        worst = max((g['days'] or 0) for g in gates.values())
        rows.append({
            'order_id': o.id,
            'po_number': o.po_number,
            'style_code': o.style_code,
            'description': o.description,
            'colour': o.colour,
            'customer': o.customer,
            'factory': o.factory,
            'gates': gates,
            'ex_factory': ex_factory.isoformat() if ex_factory else None,
            'days_to_ex_factory': (ex_factory.date() - now.date()).days if ex_factory else None,
            'risk': worst,
        })

    rows.sort(key=lambda r: r['risk'], reverse=True)

    totals = {}
    for key, label in GATES:
        states = [r['gates'][key]['state'] for r in rows]
        totals[key] = {
            'label': label,
            'done': states.count('done'),
            'late': states.count('late') + states.count('crit'),
        }

    # The single most useful sentence on the page: which gate is holding up the
    # most styles, and who has them.
    bottleneck = None
    worst_gate = max(GATES, key=lambda g: totals[g[0]]['late'])
    if totals[worst_gate[0]]['late'] > 0:
        key = worst_gate[0]
        stuck = [r for r in rows if r['gates'][key]['state'] in ('late', 'crit')]
        bottleneck = {
            'gate': key,
            'label': worst_gate[1],
            'count': len(stuck),
            'worst_days': max((r['gates'][key]['days'] or 0) for r in stuck),
            'factories': sorted({r['factory'] for r in stuck if r['factory']}),
        }

    return {
        'gates': [{'key': k, 'label': l} for k, l in GATES],
        'styles': rows[:limit],
        'total_styles': len(rows),
        'totals': totals,
        'bottleneck': bottleneck,
    }


def _pps_gate(o, comps, T, now):
    """PPS, which runs on calendar days rather than business days.

    Mimi's spec is "5/6 weeks including weekends" from the latest Lab Dip or
    Strike Off approval, so the clock is calendar-based — which makes it the
    one gate a factory closure hides completely. Subtract the closed days.
    """
    if is_sample_done(o.pps_status, o.pps_approved):
        return {'state': 'done', 'days': None}
    if o.pps_sent_to_customer and not o.pps_approved:
        return {'state': 'flight',
                'days': business_days_between(o.pps_sent_to_customer, now)}
    if o.pps_received:
        return {'state': 'flight', 'days': None}

    candidates = []
    if comps:
        for c in comps:
            if c.lab_dip_approved:
                candidates.append(c.lab_dip_approved)
            if c.strike_off_approved:
                candidates.append(c.strike_off_approved)
    else:
        if o.lab_dip_approved:
            candidates.append(o.lab_dip_approved)
        if o.strike_off_approved:
            candidates.append(o.strike_off_approved)
    if not candidates:
        return {'state': 'idle', 'days': None}

    latest = max(candidates)
    days = (now - latest).days - closure_days_between(latest, now)
    st = _state(days, T['warn_pps_received_days'])
    return {'state': st, 'days': days if st != 'idle' else None}
