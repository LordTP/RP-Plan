"""Dashboard warnings endpoint — per-PO flags for orders needing attention."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
from models import User, PurchaseOrder, OrderComponent
from auth import get_current_user
from sample_helpers import is_sample_done, business_days_between

router = APIRouter()


@router.get("/api/warnings/dashboard")
async def get_dashboard_warnings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Warnings/flags for orders needing attention — grouped by PO"""
    now = datetime.utcnow()

    # Drop orders that are no longer in play:
    #   - Status indicates the order's finished (Cancelled / Delivered / Complete).
    #   - tracking_reference is set — the order's been confirmed onto a
    #     shipment, so the sampling/spec/etc. windows the warnings track
    #     aren't actionable anymore.
    all_orders = db.query(PurchaseOrder).filter(
        ~PurchaseOrder.status.in_(["Cancelled", "Delivered", "Complete", "Completed"]),
        PurchaseOrder.tracking_reference.is_(None),
    ).all()

    # Group orders by PO number — warnings are per-PO
    po_groups = {}
    for o in all_orders:
        if o.po_number not in po_groups:
            po_groups[o.po_number] = []
        po_groups[o.po_number].append(o)

    warnings = []

    # --- Warning 1: Tech Packs need sending ---
    # Order sent to factory populated, 3+ business days ago, but tech packs not sent
    tech_packs_needed = []
    for po_num, orders in po_groups.items():
        rep = orders[0]  # Representative row (same across PO)
        if rep.order_sent_to_factory_date and not rep.tech_packs_sent_to_factory:
            days_since = business_days_between(rep.order_sent_to_factory_date, now)
            if days_since >= 3:
                tech_packs_needed.append({
                    "po_number": po_num,
                    "customer": rep.customer,
                    "factory": rep.factory,
                    "days_since": days_since,
                    "trigger_date": rep.order_sent_to_factory_date.isoformat(),
                    "style_count": len(orders),
                })
    tech_packs_needed.sort(key=lambda x: x["days_since"], reverse=True)

    if tech_packs_needed:
        warnings.append({
            "key": "tech_packs_needed",
            "title": "Tech Packs Need Sending",
            "description": "Orders sent to factory 3+ business days ago without tech packs",
            "severity": "amber",
            "count": len(tech_packs_needed),
            "items": tech_packs_needed,
        })

    # --- Warning 2: Specs need sending ---
    specs_needed = []
    for po_num, orders in po_groups.items():
        rep = orders[0]
        if rep.order_sent_to_factory_date and not rep.specs_sent_to_factory:
            days_since = business_days_between(rep.order_sent_to_factory_date, now)
            if days_since >= 3:
                specs_needed.append({
                    "po_number": po_num,
                    "customer": rep.customer,
                    "factory": rep.factory,
                    "days_since": days_since,
                    "trigger_date": rep.order_sent_to_factory_date.isoformat(),
                    "style_count": len(orders),
                })
    specs_needed.sort(key=lambda x: x["days_since"], reverse=True)

    if specs_needed:
        warnings.append({
            "key": "specs_needed",
            "title": "Specs Need Sending",
            "description": "Orders sent to factory 3+ business days ago without specs",
            "severity": "amber",
            "count": len(specs_needed),
            "items": specs_needed,
        })

    # --- Warning 3: Fit Sample Overdue ---
    fit_sample_overdue = []
    for o in all_orders:
        if not o.tech_packs_sent_to_factory:
            continue
        days_since = business_days_between(o.tech_packs_sent_to_factory, now)
        if days_since < 15:
            continue

        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        if components:
            for comp in components:
                if is_sample_done(comp.fit_sample_status, comp.fit_sample_approved):
                    continue
                if not comp.fit_sample_received:
                    fit_sample_overdue.append({
                        "order_id": o.id,
                        "po_number": o.po_number,
                        "style_code": o.style_code,
                        "customer": o.customer,
                        "factory": o.factory,
                        "component": comp.name,
                        "days_since": days_since,
                    })
        else:
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
            "description": "3+ business weeks since tech packs sent, no fit sample received",
            "severity": "amber",
            "count": len(fit_sample_overdue),
            "items": fit_sample_overdue,
        })

    # --- Warning 4: Lab Dip Overdue ---
    lab_dip_overdue = []
    for o in all_orders:
        if not o.tech_packs_sent_to_factory:
            continue
        days_since = business_days_between(o.tech_packs_sent_to_factory, now)
        if days_since < 15:
            continue

        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        if components:
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
        else:
            if is_sample_done(o.lab_dip_status, o.lab_dip_approved):
                continue
            if not o.lab_dip_received:
                lab_dip_overdue.append({
                    "order_id": o.id,
                    "po_number": o.po_number,
                    "style_code": o.style_code,
                    "customer": o.customer,
                    "factory": o.factory,
                    "days_since": days_since,
                })
    lab_dip_overdue.sort(key=lambda x: x["days_since"], reverse=True)

    if lab_dip_overdue:
        warnings.append({
            "key": "lab_dip_overdue",
            "title": "Lab Dip Overdue",
            "description": "3+ business weeks since tech packs sent, no lab dip received",
            "severity": "amber",
            "count": len(lab_dip_overdue),
            "items": lab_dip_overdue,
        })

    # --- Warning 5: Lab Dip Needs Approval ---
    # Lab dip received 5+ business days ago, not yet approved
    # Skip if status = NOT REQUIRED
    lab_dip_approval = []
    for o in all_orders:
        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        if components:
            for comp in components:
                if is_sample_done(comp.lab_dip_status, comp.lab_dip_approved):
                    continue
                if comp.lab_dip_received and not comp.lab_dip_approved:
                    days_since = business_days_between(comp.lab_dip_received, now)
                    if days_since >= 5:
                        lab_dip_approval.append({
                            "order_id": o.id,
                            "po_number": o.po_number,
                            "style_code": o.style_code,
                            "customer": o.customer,
                            "factory": o.factory,
                            "component": comp.name,
                            "days_since": days_since,
                        })
        else:
            if is_sample_done(o.lab_dip_status, o.lab_dip_approved):
                continue
            if o.lab_dip_received and not o.lab_dip_approved:
                days_since = business_days_between(o.lab_dip_received, now)
                if days_since >= 5:
                    lab_dip_approval.append({
                        "order_id": o.id,
                        "po_number": o.po_number,
                        "style_code": o.style_code,
                        "customer": o.customer,
                        "factory": o.factory,
                        "days_since": days_since,
                    })
    lab_dip_approval.sort(key=lambda x: x["days_since"], reverse=True)

    if lab_dip_approval:
        warnings.append({
            "key": "lab_dip_approval",
            "title": "Lab Dip Needs Approval",
            "description": "Received 5+ business days ago, not yet approved",
            "severity": "amber",
            "count": len(lab_dip_approval),
            "items": lab_dip_approval,
        })

    # --- Warning 6: Strike Off Overdue ---
    # 4 weeks (20 business days) since tech packs sent, no strike off received
    # If component name contains 'badge' / 'woven label' / 'woven tape', use 5 weeks (25 business days)
    def strike_off_threshold(name) -> int:
        if not name:
            return 20
        n = name.lower()
        if 'badge' in n or 'woven label' in n or 'woven tape' in n:
            return 25
        return 20

    strike_off_overdue = []
    for o in all_orders:
        if not o.tech_packs_sent_to_factory:
            continue
        days_since = business_days_between(o.tech_packs_sent_to_factory, now)

        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        if components:
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
        else:
            if days_since < 20:
                continue
            if is_sample_done(o.strike_off_status, o.strike_off_approved):
                continue
            if not o.strike_off_received:
                strike_off_overdue.append({
                    "order_id": o.id,
                    "po_number": o.po_number,
                    "style_code": o.style_code,
                    "customer": o.customer,
                    "factory": o.factory,
                    "days_since": days_since,
                })
    strike_off_overdue.sort(key=lambda x: x["days_since"], reverse=True)

    if strike_off_overdue:
        warnings.append({
            "key": "strike_off_overdue",
            "title": "Strike Off Overdue",
            "description": "4+ business weeks since tech packs sent (5 for badges/woven), no strike off received",
            "severity": "amber",
            "count": len(strike_off_overdue),
            "items": strike_off_overdue,
        })

    # --- Warning 7: Strike Off Needs Approval ---
    # Strike off received 5+ business days ago, not yet approved
    strike_off_approval = []
    for o in all_orders:
        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        if components:
            for comp in components:
                if is_sample_done(comp.strike_off_status, comp.strike_off_approved):
                    continue
                if comp.strike_off_received and not comp.strike_off_approved:
                    days_since = business_days_between(comp.strike_off_received, now)
                    if days_since >= 5:
                        strike_off_approval.append({
                            "order_id": o.id,
                            "po_number": o.po_number,
                            "style_code": o.style_code,
                            "customer": o.customer,
                            "factory": o.factory,
                            "component": comp.name,
                            "days_since": days_since,
                        })
        else:
            if is_sample_done(o.strike_off_status, o.strike_off_approved):
                continue
            if o.strike_off_received and not o.strike_off_approved:
                days_since = business_days_between(o.strike_off_received, now)
                if days_since >= 5:
                    strike_off_approval.append({
                        "order_id": o.id,
                        "po_number": o.po_number,
                        "style_code": o.style_code,
                        "customer": o.customer,
                        "factory": o.factory,
                        "days_since": days_since,
                    })
    strike_off_approval.sort(key=lambda x: x["days_since"], reverse=True)

    if strike_off_approval:
        warnings.append({
            "key": "strike_off_approval",
            "title": "Strike Off Needs Approval",
            "description": "Received 5+ business days ago, not yet approved",
            "severity": "amber",
            "count": len(strike_off_approval),
            "items": strike_off_approval,
        })

    # --- Warning 8: PPS Received Overdue ---
    # 8 business weeks (40 business days) after lab dip approved, no PPS received
    pps_received_overdue = []
    for o in all_orders:
        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        # PPS is order-level, but we check lab_dip_approved per component if components exist
        # Use latest lab_dip_approved from components, or order-level
        if components:
            lab_dip_dates = [c.lab_dip_approved for c in components if c.lab_dip_approved]
            latest_lab_dip = max(lab_dip_dates) if lab_dip_dates else None
        else:
            latest_lab_dip = o.lab_dip_approved

        if not latest_lab_dip:
            continue
        days_since = business_days_between(latest_lab_dip, now)
        if days_since < 40:
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
            })
    pps_received_overdue.sort(key=lambda x: x["days_since"], reverse=True)

    if pps_received_overdue:
        warnings.append({
            "key": "pps_received_overdue",
            "title": "PPS Overdue",
            "description": "8+ business weeks since lab dip approved, no PPS received",
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
            if days_since >= 7:
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
            "description": "Sent to customer 7+ business days ago, not yet approved",
            "severity": "amber",
            "count": len(pps_approval),
            "items": pps_approval,
        })

    return {"warnings": warnings}
