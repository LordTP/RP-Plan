"""Order status, worked out from the fields rather than picked from a dropdown.

Agreed with Mimi, 18 Sep 2026. Seven statuses; a style's status is whatever the
furthest-reached condition says, and a PO shows the LEAST advanced of its styles
-- a PO is only as far along as its slowest line.

Two things are worth spelling out because they look like inconsistencies and are
not:

  * "IN PRODUCTION only when every style's PPS is approved" needs no special
    case. Take the least advanced style and it falls out: nine approved styles
    sit in IN PRODUCTION, the tenth drags the PO back to IN DEVELOPMENT.

  * The component rule is the one genuine exception, and it runs the other way.
    ANY component on ANY style pulls EVERY style on that PO up to at least
    IN DEVELOPMENT. Without it, PO 5279 (22 of 34 styles carrying components)
    would read CONFIRMED EX-FACTORY DATE, which understates a PO that is
    demonstrably under way.

EX FACTORY is gated behind IN PRODUCTION on purpose. It is the only status the
calendar sets rather than a person, so left ungated it leapfrogs: PO 5278 has an
ex-factory date of 9 Oct 2026 and has not had its specs sent, and would have
flipped from NEW ORDER straight to EX FACTORY on that date, claiming goods had
left a factory that was never told what to make.

It also means "the planned date passed", not "the goods went". Those differ
whenever the factory runs late, and the 10-day ship-by agreement with Prime is
measured from the wrong moment when they do. An actual_ex_factory_date field
would fix it; STAGE_EX_FACTORY is the only line that would need to change.
"""
from datetime import date, datetime

from sample_helpers import is_sample_done

# Ordered worst-to-best. Position in this list IS the comparison, so a PO's
# status is just the minimum index across its styles.
NEW_ORDER = 'NEW ORDER'
CONFIRMED_EX_FACTORY = 'CONFIRMED EX-FACTORY DATE'
IN_DEVELOPMENT = 'IN DEVELOPMENT'
IN_PRODUCTION = 'IN PRODUCTION'
EX_FACTORY = 'EX FACTORY'
BOOKED = 'BOOKED'
SHIPPED = 'SHIPPED'

STATUS_ORDER = [
    NEW_ORDER,
    CONFIRMED_EX_FACTORY,
    IN_DEVELOPMENT,
    IN_PRODUCTION,
    EX_FACTORY,
    BOOKED,
    SHIPPED,
]
RANK = {s: i for i, s in enumerate(STATUS_ORDER)}


def _set(v):
    """Truthy for a real value. Empty strings count as unset, which matters
    because the Excel import writes '' rather than NULL for a blank cell."""
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() != ''
    return True


def _as_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str) and v.strip():
        try:
            return datetime.fromisoformat(v.strip()[:19]).date()
        except ValueError:
            try:
                return date.fromisoformat(v.strip()[:10])
            except ValueError:
                return None
    return None


def style_status(order, po_has_component, today=None):
    """One style's status. `po_has_component` is a fact about the whole PO, not
    this style -- see the component rule in the module docstring."""
    today = today or date.today()

    status = NEW_ORDER
    if _set(getattr(order, 'factory_confirmed_ex_factory', None)):
        status = CONFIRMED_EX_FACTORY

    if po_has_component:
        status = IN_DEVELOPMENT

    # NOT REQUIRED counts as done here, which is what stops a single
    # no-sample-needed style holding its whole PO out of production forever.
    if is_sample_done(getattr(order, 'pps_status', None),
                      getattr(order, 'pps_approved', None)):
        status = IN_PRODUCTION

        ex_fac = _as_date(getattr(order, 'revised_po_ex_factory', None)
                          or getattr(order, 'original_po_ex_factory', None))
        if ex_fac and ex_fac <= today:
            status = EX_FACTORY

    # Vessel details and a P number are things a person actively entered, so
    # unlike the date rule they are allowed to speak for themselves.
    if (_set(getattr(order, 'vessel_name', None))
            and _set(getattr(order, 'vessel_etd', None))
            and _set(getattr(order, 'vessel_eta_to_port', None))):
        status = BOOKED

    if _set(getattr(order, 'tracking_reference', None)):
        status = SHIPPED

    return status


def po_status(style_statuses):
    """A PO is only as far along as its slowest style."""
    ranked = [RANK[s] for s in style_statuses if s in RANK]
    if not ranked:
        return NEW_ORDER
    return STATUS_ORDER[min(ranked)]


def compute_for_orders(orders, component_counts, today=None):
    """-> {order_id: status} for a batch.

    `component_counts` maps order_id -> number of components on that style.
    Grouping happens here rather than per row so the PO-wide component rule
    only needs one pass.
    """
    today = today or date.today()

    with_components = set()
    for o in orders:
        if component_counts.get(o.id, 0) > 0:
            with_components.add(o.po_number)

    return {
        o.id: style_status(o, o.po_number in with_components, today)
        for o in orders
    }


# ─────────────────────────────────────────────────────────────────────────
# Persisting it
#
# The status is derived, so the only way it can be wrong is by being stale.
# Recomputing the whole book on every write costs one query over ~110 rows and
# removes the entire class of "this order is showing the wrong status because
# the code path that changed it forgot to recalculate" bugs. Scale that becomes
# a problem at is far beyond anything this app holds.

def refresh_all(db, today=None):
    """Recompute status for every order. Returns how many rows changed."""
    from sqlalchemy import func

    from models import PurchaseOrder, OrderComponent

    orders = db.query(PurchaseOrder).all()
    counts = dict(
        db.query(OrderComponent.order_id, func.count(OrderComponent.id))
          .group_by(OrderComponent.order_id).all()
    )

    wanted = compute_for_orders(orders, counts, today)
    changed = 0
    for o in orders:
        new = wanted.get(o.id)
        if new and o.status != new:
            o.status = new
            changed += 1
    return changed
