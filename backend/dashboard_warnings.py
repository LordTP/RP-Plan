"""Dashboard warnings endpoint — per-PO flags for orders needing attention."""
from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models import User, PurchaseOrder, OrderComponent
from auth import get_current_user
from sample_helpers import is_sample_done, business_days_between, closure_days_between
import app_settings

router = APIRouter()


# The warnings population, shared. The board endpoint renders the same orders,
# so this lives in one place — if the two drifted, the board would show a style
# as stuck that the warnings centre had already dropped, or the reverse.
def active_order_clauses():
    """Clauses selecting orders still in play.

      - Status indicates the order's finished (Cancelled / Delivered / Complete).
        NULL or empty status means "no explicit status yet" — those rows
        are still active and must NOT be excluded.
      - tracking_reference is set — the order's been confirmed onto a
        shipment, so the sampling / spec / approval windows aren't
        actionable anymore. Treat NULL and empty string equivalently.
      - PPS is done (status APPROVED / NOT REQUIRED or pps_approved date
        is set). Once PPS is signed off the order's past the sampling
        phase entirely — every other warning we fire on it would be stale.

    Important: SQL three-valued logic means `~status.in_(...)` silently
    drops rows where status IS NULL (NULL IN (...) evaluates to NULL,
    NOT NULL is NULL, the row is filtered). The explicit OR with IS NULL
    keeps those rows in the population.

    The IS NULL arm on the PPS filter is load-bearing, and its absence was a
    live bug: for a row with pps_status NULL, `NULL IN (...)` is NULL,
    `pps_approved IS NOT NULL` is False, `or_(NULL, False)` is NULL, and
    `~NULL` is NULL — so the row was filtered OUT. Every order that had not
    reached PPS yet, which is most of them, vanished from the warnings centre.
    Measured on a 52-order set: 52 dropped, leaving it permanently empty.
    """
    finished_statuses = ["Cancelled", "Delivered", "Complete", "Completed"]
    pps_done_statuses = ["APPROVED", "NOT REQUIRED"]
    return [
        or_(
            PurchaseOrder.status.is_(None),
            PurchaseOrder.status == '',
            ~PurchaseOrder.status.in_(finished_statuses),
        ),
        or_(
            PurchaseOrder.tracking_reference.is_(None),
            PurchaseOrder.tracking_reference == '',
        ),
        or_(
            PurchaseOrder.pps_status.is_(None),
            PurchaseOrder.pps_status == '',
            ~or_(
                PurchaseOrder.pps_status.in_(pps_done_statuses),
                PurchaseOrder.pps_approved.isnot(None),
            ),
        ),
    ]


@router.get("/api/warnings/dashboard")
async def get_dashboard_warnings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Warnings/flags for orders needing attention — grouped by PO"""
    # Thresholds are admin-editable (Settings -> Warnings). Read once per
    # request rather than per order, and fall back to the registered defaults,
    # which are the numbers that used to be hardcoded here.
    T = {t['key']: app_settings.get_threshold(db, t['key'])
         for t in app_settings.WARNING_THRESHOLDS}
    now = datetime.utcnow()

    # Population shared with the board endpoint — see active_order_clauses().
    all_orders = db.query(PurchaseOrder).filter(*active_order_clauses()).all()

    # Group orders by PO number — warnings are per-PO
    po_groups = {}
    for o in all_orders:
        if o.po_number not in po_groups:
            po_groups[o.po_number] = []
        po_groups[o.po_number].append(o)

    warnings = []

    # --- Warnings 1 & 2: paperwork that should have followed the order ---
    def overdue_sends(orders, field, threshold):
        """Styles in this PO sent to the factory `threshold`+ business days
        ago that still have no date in `field`.

        Both `order_sent_to_factory_date` and the paperwork dates are per-row
        editable (COLUMNS marks them editable), so rows inside one PO
        routinely disagree. This used to read orders[0] as a stand-in for the
        whole PO, which missed real work in both directions: if style 1 had
        its tech packs and style 2 did not, the PO stayed silent; if style 1
        was never sent to the factory at all, the PO stayed silent even
        though style 2 was weeks overdue.

        Reports the worst offender's age and how many styles are waiting.
        """
        waiting = [
            (business_days_between(o.order_sent_to_factory_date, now), o)
            for o in orders
            if o.order_sent_to_factory_date and not getattr(o, field)
        ]
        waiting = [(days, o) for days, o in waiting if days >= threshold]
        if not waiting:
            return None
        waiting.sort(key=lambda pair: pair[0], reverse=True)
        days_since, worst = waiting[0]
        return {
            "customer": worst.customer,
            "factory": worst.factory,
            "days_since": days_since,
            "trigger_date": worst.order_sent_to_factory_date.isoformat(),
            # Styles still waiting, not styles on the PO — the warning is
            # about the outstanding work, so that is the number to show.
            "style_count": len(waiting),
        }

    # --- Warning 1: Tech Packs need sending ---
    tech_packs_needed = []
    for po_num, orders in po_groups.items():
        hit = overdue_sends(orders, 'tech_packs_sent_to_factory', T['warn_tech_packs_days'])
        if hit:
            tech_packs_needed.append({"po_number": po_num, **hit})
    tech_packs_needed.sort(key=lambda x: x["days_since"], reverse=True)

    if tech_packs_needed:
        warnings.append({
            "key": "tech_packs_needed",
            "title": "Tech Packs Need Sending",
            "description": f"Orders sent to factory {T['warn_tech_packs_days']}+ business days ago without tech packs",
            "severity": "amber",
            "count": len(tech_packs_needed),
            "items": tech_packs_needed,
        })

    # --- Warning 2: Specs need sending ---
    specs_needed = []
    for po_num, orders in po_groups.items():
        hit = overdue_sends(orders, 'specs_sent_to_factory', T['warn_specs_days'])
        if hit:
            specs_needed.append({"po_number": po_num, **hit})
    specs_needed.sort(key=lambda x: x["days_since"], reverse=True)

    if specs_needed:
        warnings.append({
            "key": "specs_needed",
            "title": "Specs Need Sending",
            "description": f"Orders sent to factory {T['warn_specs_days']}+ business days ago without specs",
            "severity": "amber",
            "count": len(specs_needed),
            "items": specs_needed,
        })

    # --- Warning 3: Fit Sample Overdue ---
    # Fit samples are order-level only — the earlier per-component version
    # is legacy from before we moved fit to the style/order. Components
    # (Strike Off / Lab Dip) have their own separate warnings below.
    fit_sample_overdue = []
    for o in all_orders:
        if not o.tech_packs_sent_to_factory:
            continue
        if (o.fit_sample_required or '').strip().upper() == 'N':
            continue
        days_since = business_days_between(o.tech_packs_sent_to_factory, now)
        if days_since < T['warn_fit_sample_days']:
            continue
        if is_sample_done(o.fit_sample_status, o.fit_sample_approved):
            continue
        if not o.fit_sample_received:
            fit_sample_overdue.append({
                "order_id": o.id,
                "po_number": o.po_number,
                "style_code": o.style_code,
                "customer": o.customer,
                "factory": o.factory,
                "days_since": days_since,
            })
    fit_sample_overdue.sort(key=lambda x: x["days_since"], reverse=True)

    if fit_sample_overdue:
        warnings.append({
            "key": "fit_sample_overdue",
            "title": "Fit Sample Overdue",
            "description": f"{T['warn_fit_sample_days']}+ business days since tech packs sent, no fit sample received",
            "severity": "amber",
            "count": len(fit_sample_overdue),
            "items": fit_sample_overdue,
        })

    # --- Warning 4: Lab Dip Overdue ---
    # Only components with sample_type == 'lab_dip' can produce a lab dip
    # warning. An order without any lab-dip components has nothing to be
    # overdue on — the earlier order-level fallback is legacy from the
    # pre-component-split shape.
    lab_dip_overdue = []
    for o in all_orders:
        if not o.tech_packs_sent_to_factory:
            continue
        days_since = business_days_between(o.tech_packs_sent_to_factory, now)
        if days_since < T['warn_lab_dip_days']:
            continue

        components = db.query(OrderComponent).filter(
            OrderComponent.order_id == o.id,
            OrderComponent.sample_type == 'lab_dip',
        ).all()

        for comp in components:
            if is_sample_done(comp.lab_dip_status, comp.lab_dip_approved):
                continue
            if not comp.lab_dip_received:
                lab_dip_overdue.append({
                    "order_id": o.id,
                    "po_number": o.po_number,
                    "style_code": o.style_code,
                    "customer": o.customer,
                    "factory": o.factory,
                    "component": comp.name,
                    "days_since": days_since,
                })
    lab_dip_overdue.sort(key=lambda x: x["days_since"], reverse=True)

    if lab_dip_overdue:
        warnings.append({
            "key": "lab_dip_overdue",
            "title": "Lab Dip Overdue",
            "description": f"{T['warn_lab_dip_days']}+ business days since tech packs sent, no lab dip received",
            "severity": "amber",
            "count": len(lab_dip_overdue),
            "items": lab_dip_overdue,
        })

    # --- Warning 5: Lab Dip Needs Approval ---
    # Lab dip received 5+ business days ago, not yet approved.
    # Same scope rule as Overdue — only sample_type='lab_dip' components.
    lab_dip_approval = []
    for o in all_orders:
        components = db.query(OrderComponent).filter(
            OrderComponent.order_id == o.id,
            OrderComponent.sample_type == 'lab_dip',
        ).all()

        for comp in components:
            if is_sample_done(comp.lab_dip_status, comp.lab_dip_approved):
                continue
            if comp.lab_dip_received and not comp.lab_dip_approved:
                days_since = business_days_between(comp.lab_dip_received, now)
                if days_since >= T['warn_lab_dip_approval_days']:
                    lab_dip_approval.append({
                        "order_id": o.id,
                        "po_number": o.po_number,
                        "style_code": o.style_code,
                        "customer": o.customer,
                        "factory": o.factory,
                        "component": comp.name,
                        "days_since": days_since,
                    })
    lab_dip_approval.sort(key=lambda x: x["days_since"], reverse=True)

    if lab_dip_approval:
        warnings.append({
            "key": "lab_dip_approval",
            "title": "Lab Dip Needs Approval",
            "description": f"Received {T['warn_lab_dip_approval_days']}+ business days ago, not yet approved",
            "severity": "amber",
            "count": len(lab_dip_approval),
            "items": lab_dip_approval,
        })

    # --- Warning 6: Strike Off Overdue ---
    # 4 weeks (20 business days) since tech packs sent, no strike off received
    # If component name contains 'badge' / 'woven label' / 'woven tape', use 5 weeks (25 business days)
    def strike_off_threshold(name) -> int:
        if not name:
            return T['warn_strike_off_days']
        n = name.lower()
        if 'badge' in n or 'woven label' in n or 'woven tape' in n:
            return T['warn_strike_off_slow_days']
        return T['warn_strike_off_days']

    # Only sample_type='strike_off' components can produce a strike off
    # warning — same rationale as the lab dip warnings.
    strike_off_overdue = []
    for o in all_orders:
        if not o.tech_packs_sent_to_factory:
            continue
        days_since = business_days_between(o.tech_packs_sent_to_factory, now)

        components = db.query(OrderComponent).filter(
            OrderComponent.order_id == o.id,
            OrderComponent.sample_type == 'strike_off',
        ).all()

        for comp in components:
            threshold = strike_off_threshold(comp.name)
            if days_since < threshold:
                continue
            if is_sample_done(comp.strike_off_status, comp.strike_off_approved):
                continue
            if not comp.strike_off_received:
                strike_off_overdue.append({
                    "order_id": o.id,
                    "po_number": o.po_number,
                    "style_code": o.style_code,
                    "customer": o.customer,
                    "factory": o.factory,
                    "component": comp.name,
                    "days_since": days_since,
                })
    strike_off_overdue.sort(key=lambda x: x["days_since"], reverse=True)

    if strike_off_overdue:
        warnings.append({
            "key": "strike_off_overdue",
            "title": "Strike Off Overdue",
            "description": f"{T['warn_strike_off_days']}+ business days since tech packs sent ({T['warn_strike_off_slow_days']} for badges/woven), no strike off received",
            "severity": "amber",
            "count": len(strike_off_overdue),
            "items": strike_off_overdue,
        })

    # --- Warning 7: Strike Off Needs Approval ---
    # Strike off received 5+ business days ago, not yet approved.
    strike_off_approval = []
    for o in all_orders:
        components = db.query(OrderComponent).filter(
            OrderComponent.order_id == o.id,
            OrderComponent.sample_type == 'strike_off',
        ).all()

        for comp in components:
            if is_sample_done(comp.strike_off_status, comp.strike_off_approved):
                continue
            if comp.strike_off_received and not comp.strike_off_approved:
                days_since = business_days_between(comp.strike_off_received, now)
                if days_since >= T['warn_strike_off_approval_days']:
                    strike_off_approval.append({
                        "order_id": o.id,
                        "po_number": o.po_number,
                        "style_code": o.style_code,
                        "customer": o.customer,
                        "factory": o.factory,
                        "component": comp.name,
                        "days_since": days_since,
                    })
    strike_off_approval.sort(key=lambda x: x["days_since"], reverse=True)

    if strike_off_approval:
        warnings.append({
            "key": "strike_off_approval",
            "title": "Strike Off Needs Approval",
            "description": f"Received {T['warn_strike_off_approval_days']}+ business days ago, not yet approved",
            "severity": "amber",
            "count": len(strike_off_approval),
            "items": strike_off_approval,
        })

    # --- Warning 8: PPS Received Overdue ---
    # 40 CALENDAR days (~5-6 weeks including weekends) from the latest of
    # Lab Dip or Strike Off approval, no PPS received yet. Either approval
    # opens the PPS clock — whichever was most recent. Per-component when
    # components exist, otherwise the order-level fields.
    pps_received_overdue = []
    for o in all_orders:
        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        candidate_dates = []
        if components:
            for c in components:
                if c.lab_dip_approved:
                    candidate_dates.append(c.lab_dip_approved)
                if c.strike_off_approved:
                    candidate_dates.append(c.strike_off_approved)
        else:
            if o.lab_dip_approved:
                candidate_dates.append(o.lab_dip_approved)
            if o.strike_off_approved:
                candidate_dates.append(o.strike_off_approved)

        if not candidate_dates:
            continue
        latest_approval = max(candidate_dates)
        # Calendar days, not business days — Mimi's request: "5/6 weeks
        # including weekends" maps to 40 calendar days from the approval.
        #
        # This is the one counter that does not run through
        # business_days_between(), so it is also the one a factory closure
        # hurts most: a three-week Chinese New Year shutdown sits entirely
        # inside a 40-day window without leaving a trace, and every order
        # whose approval landed in January would flag in February having had
        # barely three working weeks. Subtract the closed days so the window
        # stays "about 5-6 weeks of a factory actually being open".
        closed_days = closure_days_between(latest_approval, now)
        days_since = (now - latest_approval).days - closed_days
        if days_since < T['warn_pps_received_days']:
            continue

        if is_sample_done(o.pps_status, o.pps_approved):
            continue
        if not o.pps_received:
            pps_received_overdue.append({
                "order_id": o.id,
                "po_number": o.po_number,
                "style_code": o.style_code,
                "customer": o.customer,
                "factory": o.factory,
                "days_since": days_since,
                "closure_days": closed_days,
            })
    pps_received_overdue.sort(key=lambda x: x["days_since"], reverse=True)

    if pps_received_overdue:
        warnings.append({
            "key": "pps_received_overdue",
            "title": "PPS Overdue",
            "description": f"{T['warn_pps_received_days']}+ days from the latest Lab Dip / Strike Off approval, no PPS received",
            "severity": "amber",
            "count": len(pps_received_overdue),
            "items": pps_received_overdue,
        })

    # --- Warning 9: PPS Needs Approval ---
    # PPS sent to customer 7+ business days ago, not yet approved
    pps_approval = []
    for o in all_orders:
        if is_sample_done(o.pps_status, o.pps_approved):
            continue
        if o.pps_sent_to_customer and not o.pps_approved:
            days_since = business_days_between(o.pps_sent_to_customer, now)
            if days_since >= T['warn_pps_approval_days']:
                pps_approval.append({
                    "order_id": o.id,
                    "po_number": o.po_number,
                    "style_code": o.style_code,
                    "customer": o.customer,
                    "factory": o.factory,
                    "days_since": days_since,
                })
    pps_approval.sort(key=lambda x: x["days_since"], reverse=True)

    if pps_approval:
        warnings.append({
            "key": "pps_approval",
            "title": "PPS Needs Approval",
            "description": f"Sent to customer {T['warn_pps_approval_days']}+ business days ago, not yet approved",
            "severity": "amber",
            "count": len(pps_approval),
            "items": pps_approval,
        })

    return {"warnings": warnings}
