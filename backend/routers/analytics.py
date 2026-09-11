"""Analytics endpoints — overview, orders-over-time, factory performance,
customer analytics, delivery performance, date-change analytics, pipeline
funnel, alerts, and the big design-analytics aggregator."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, case
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, PurchaseOrder, OrderComponent, DateChangeHistory,
)
from auth import get_current_user, get_current_internal_user, get_current_full_internal_user
from sample_helpers import (
    is_sample_done, sample_needs_work, business_days_between,
)


router = APIRouter()


@router.get("/api/analytics/overview")
async def get_analytics_overview(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get high-level analytics overview"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    start_date = now - relativedelta(months=months)

    total_orders = db.query(func.count(func.distinct(PurchaseOrder.po_number))).scalar() or 0
    total_lines = db.query(func.count(PurchaseOrder.id)).scalar() or 0
    total_value = db.query(func.sum(PurchaseOrder.total_order_value)).scalar() or 0
    total_quantity = db.query(func.sum(PurchaseOrder.total_quantity)).scalar() or 0

    status_counts = db.query(
        PurchaseOrder.status,
        func.count(func.distinct(PurchaseOrder.po_number))
    ).group_by(PurchaseOrder.status).all()

    on_time = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
        or_(PurchaseOrder.is_late == False, PurchaseOrder.is_late.is_(None))
    ).scalar() or 0
    late = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(PurchaseOrder.is_late == True).scalar() or 0

    avg_order_value = db.query(func.avg(PurchaseOrder.total_order_value)).scalar() or 0

    factory_count = db.query(func.count(func.distinct(PurchaseOrder.factory))).scalar() or 0
    customer_count = db.query(func.count(func.distinct(PurchaseOrder.customer))).scalar() or 0

    return {
        "total_orders": total_orders,
        "total_lines": total_lines,
        "total_value": float(total_value),
        "total_quantity": int(total_quantity) if total_quantity else 0,
        "avg_order_value": float(avg_order_value),
        "on_time_orders": on_time,
        "late_orders": late,
        "on_time_rate": round((on_time / total_orders * 100) if total_orders > 0 else 0, 1),
        "factory_count": factory_count,
        "customer_count": customer_count,
        "status_breakdown": {s[0] or "Unknown": s[1] for s in status_counts}
    }


@router.get("/api/analytics/orders-over-time")
async def get_orders_over_time(
    months: int = Query(12, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get order counts and values by month"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    data = []

    for i in range(months - 1, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if i > 0:
            month_end = (now - relativedelta(months=i-1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            month_end = now

        order_count = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end
        ).scalar() or 0

        order_value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end
        ).scalar() or 0

        data.append({
            "month": month_start.strftime("%b %Y"),
            "orders": order_count,
            "value": float(order_value)
        })

    return {"data": data}


@router.get("/api/analytics/factory-performance")
async def get_factory_performance(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get performance metrics by factory"""
    factories = db.query(PurchaseOrder.factory).filter(
        PurchaseOrder.factory.isnot(None),
        PurchaseOrder.factory != ''
    ).distinct().all()

    performance = []
    for (factory,) in factories:
        total = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.factory == factory
        ).scalar() or 0

        late = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.factory == factory,
            PurchaseOrder.is_late == True
        ).scalar() or 0

        value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.factory == factory
        ).scalar() or 0

        date_changes = db.query(func.count(DateChangeHistory.id)).join(
            PurchaseOrder, DateChangeHistory.po_id == PurchaseOrder.id
        ).filter(PurchaseOrder.factory == factory).scalar() or 0

        on_time_rate = round(((total - late) / total * 100) if total > 0 else 0, 1)

        performance.append({
            "factory": factory,
            "total_orders": total,
            "late_orders": late,
            "on_time_rate": on_time_rate,
            "total_value": float(value),
            "date_changes": date_changes,
            "changes_per_order": round(date_changes / total, 2) if total > 0 else 0
        })

    performance.sort(key=lambda x: x["total_orders"], reverse=True)

    return {"factories": performance}


@router.get("/api/analytics/customer-analytics")
async def get_customer_analytics(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get analytics by customer"""
    customers = db.query(
        PurchaseOrder.customer,
        func.count(func.distinct(PurchaseOrder.po_number)).label('order_count'),
        func.sum(PurchaseOrder.total_order_value).label('total_value'),
        func.sum(PurchaseOrder.total_quantity).label('total_quantity'),
        func.count(func.distinct(case((PurchaseOrder.is_late == True, PurchaseOrder.po_number)))).label('late_count')
    ).filter(
        PurchaseOrder.customer.isnot(None),
        PurchaseOrder.customer != ''
    ).group_by(PurchaseOrder.customer).order_by(
        func.sum(PurchaseOrder.total_order_value).desc()
    ).limit(limit).all()

    return {
        "customers": [
            {
                "customer": c.customer,
                "order_count": c.order_count,
                "total_value": float(c.total_value or 0),
                "total_quantity": int(c.total_quantity or 0),
                "late_count": c.late_count,
                "on_time_rate": round(((c.order_count - c.late_count) / c.order_count * 100) if c.order_count > 0 else 0, 1)
            }
            for c in customers
        ]
    }


@router.get("/api/analytics/delivery-performance")
async def get_delivery_performance(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get delivery performance metrics over time"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    data = []

    for i in range(months - 1, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if i > 0:
            month_end = (now - relativedelta(months=i-1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            month_end = now

        on_time = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end,
            or_(PurchaseOrder.is_late == False, PurchaseOrder.is_late.is_(None))
        ).scalar() or 0

        late = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end,
            PurchaseOrder.is_late == True
        ).scalar() or 0

        total = on_time + late

        data.append({
            "month": month_start.strftime("%b %Y"),
            "on_time": on_time,
            "late": late,
            "total": total,
            "on_time_rate": round((on_time / total * 100) if total > 0 else 0, 1)
        })

    return {"data": data}


@router.get("/api/analytics/date-changes")
async def get_date_change_analytics(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get date change analytics"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    start_date = now - relativedelta(months=months)

    total_changes = db.query(func.count(DateChangeHistory.id)).filter(
        DateChangeHistory.created_at >= start_date
    ).scalar() or 0

    changes_by_field = db.query(
        DateChangeHistory.field_name,
        func.count(DateChangeHistory.id)
    ).filter(
        DateChangeHistory.created_at >= start_date
    ).group_by(DateChangeHistory.field_name).all()

    changes_by_factory = db.query(
        PurchaseOrder.factory,
        func.count(DateChangeHistory.id).label('change_count')
    ).join(
        PurchaseOrder, DateChangeHistory.po_id == PurchaseOrder.id
    ).filter(
        DateChangeHistory.created_at >= start_date,
        PurchaseOrder.factory.isnot(None)
    ).group_by(PurchaseOrder.factory).order_by(
        func.count(DateChangeHistory.id).desc()
    ).limit(10).all()

    changes_over_time = []
    for i in range(months - 1, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if i > 0:
            month_end = (now - relativedelta(months=i-1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            month_end = now

        count = db.query(func.count(DateChangeHistory.id)).filter(
            DateChangeHistory.created_at >= month_start,
            DateChangeHistory.created_at < month_end
        ).scalar() or 0

        changes_over_time.append({
            "month": month_start.strftime("%b %Y"),
            "changes": count
        })

    return {
        "total_changes": total_changes,
        "changes_by_field": {f[0]: f[1] for f in changes_by_field},
        "changes_by_factory": [{"factory": f[0], "changes": f[1]} for f in changes_by_factory],
        "changes_over_time": changes_over_time
    }


@router.get("/api/analytics/pipeline")
async def get_order_pipeline(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get order pipeline/funnel data"""
    stages = [
        ("Pending", ["Pending", "Pending Approval", "New"]),
        ("In Production", ["In Production", "Production", "Manufacturing"]),
        ("Shipped", ["Shipped", "In Transit", "Dispatched"]),
        ("Delivered", ["Delivered", "Complete", "Completed"]),
        ("Delayed", ["Delayed", "Late", "On Hold"]),
        ("Cancelled", ["Cancelled", "Canceled"])
    ]

    pipeline = []
    for stage_name, statuses in stages:
        count = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.status.in_(statuses)
        ).scalar() or 0

        value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.status.in_(statuses)
        ).scalar() or 0

        pipeline.append({
            "stage": stage_name,
            "count": count,
            "value": float(value)
        })

    no_status = db.query(func.count(PurchaseOrder.id)).filter(
        or_(PurchaseOrder.status.is_(None), PurchaseOrder.status == '')
    ).scalar() or 0

    if no_status > 0:
        no_status_value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            or_(PurchaseOrder.status.is_(None), PurchaseOrder.status == '')
        ).scalar() or 0
        pipeline.append({
            "stage": "No Status",
            "count": no_status,
            "value": float(no_status_value or 0)
        })

    return {"pipeline": pipeline}


@router.get("/api/analytics/alerts")
async def get_analytics_alerts(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get orders that need attention"""
    now = datetime.utcnow()

    overdue_production = db.query(PurchaseOrder).filter(
        PurchaseOrder.revised_po_ex_factory < now,
        ~PurchaseOrder.status.in_(["Shipped", "Delivered", "Complete", "Completed", "Cancelled"])
    ).order_by(PurchaseOrder.revised_po_ex_factory.asc()).limit(10).all()

    stale_date = now - timedelta(days=14)
    stale_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.updated_at < stale_date,
        ~PurchaseOrder.status.in_(["Delivered", "Complete", "Completed", "Cancelled"])
    ).order_by(PurchaseOrder.updated_at.asc()).limit(10).all()

    week_end = now + timedelta(days=7)
    upcoming_deliveries = db.query(PurchaseOrder).filter(
        PurchaseOrder.eta_to_uk >= now,
        PurchaseOrder.eta_to_uk <= week_end
    ).order_by(PurchaseOrder.eta_to_uk.asc()).limit(10).all()

    def order_to_dict(o):
        return {
            "id": o.id,
            "po_number": o.po_number,
            "style_code": o.style_code,
            "customer": o.customer,
            "factory": o.factory,
            "status": o.status,
            "revised_po_ex_factory": o.revised_po_ex_factory.isoformat() if o.revised_po_ex_factory else None,
            "eta_to_uk": o.eta_to_uk.isoformat() if o.eta_to_uk else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None
        }

    return {
        "overdue_production": [order_to_dict(o) for o in overdue_production],
        "stale_orders": [order_to_dict(o) for o in stale_orders],
        "upcoming_deliveries": [order_to_dict(o) for o in upcoming_deliveries]
    }


@router.get("/api/analytics/design")
async def get_design_analytics(
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Design team analytics: sample pipeline, component coverage, factory
    performance, awaiting action.

    Internal/admin/designer only. This deliberately reports ACROSS factories
    — the factory-performance block ranks them against each other on
    first-time-right — so there is no supplier-scoped version of it that
    still means anything. Previously open to any authenticated user, which
    let a supplier see how they compared to their competitors."""

    all_orders = db.query(PurchaseOrder).filter(
        ~PurchaseOrder.status.in_(["Cancelled", "Delivered", "Complete", "Completed"])
    ).all()

    now = datetime.utcnow()

    def build_pipeline(field):
        groups = {}
        for o in all_orders:
            components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()
            if components and field in ('fit_sample_status', 'strike_off_status', 'lab_dip_status'):
                for comp in components:
                    val = getattr(comp, field, None) or ''
                    val = val.strip().upper() if val else 'NOT SET'
                    if val not in groups:
                        groups[val] = []
                    groups[val].append({
                        "id": o.id,
                        "po_number": o.po_number,
                        "style_code": o.style_code,
                        "customer": o.customer,
                        "factory": o.factory,
                        "colour": o.colour,
                        "component": comp.name,
                    })
            else:
                val = getattr(o, field, None) or ''
                val = val.strip().upper() if val else 'NOT SET'
                if val not in groups:
                    groups[val] = []
                groups[val].append({
                    "id": o.id,
                    "po_number": o.po_number,
                    "style_code": o.style_code,
                    "customer": o.customer,
                    "factory": o.factory,
                    "colour": o.colour,
                })
        result = [{"status": k, "count": len(v), "orders": v} for k, v in groups.items()]
        result.sort(key=lambda x: x["count"], reverse=True)
        return result

    sample_pipeline = {
        "fit_sample": build_pipeline("fit_sample_status"),
        "strike_off": build_pipeline("strike_off_status"),
        "lab_dip": build_pipeline("lab_dip_status"),
        "pps": build_pipeline("pps_status"),
    }

    # --- Component Coverage ---
    orders_with_components = db.query(func.count(func.distinct(OrderComponent.order_id))).scalar() or 0
    total_active_orders = len(all_orders)
    total_components = db.query(func.count(OrderComponent.id)).scalar() or 0

    component_names = db.query(
        OrderComponent.name,
        func.count(OrderComponent.id)
    ).group_by(OrderComponent.name).order_by(func.count(OrderComponent.id).desc()).all()

    component_name_breakdown = [{"name": name, "count": count} for name, count in component_names]

    order_ids_with_comps = {c.order_id for c in db.query(OrderComponent.order_id).distinct().all()}
    orders_without = []
    for o in all_orders:
        if o.id not in order_ids_with_comps:
            orders_without.append({
                "id": o.id,
                "po_number": o.po_number,
                "style_code": o.style_code,
                "customer": o.customer,
                "factory": o.factory,
            })

    component_coverage = {
        "orders_with_components": orders_with_components,
        "orders_without_components": total_active_orders - orders_with_components,
        "total_active_orders": total_active_orders,
        "total_components": total_components,
        "coverage_pct": round((orders_with_components / total_active_orders * 100) if total_active_orders > 0 else 0, 1),
        "by_component_name": component_name_breakdown,
        "orders_missing_components": orders_without[:50],
    }

    # --- Late/At Risk Samples ---
    at_risk = []
    for o in all_orders:
        ex_fac = o.revised_po_ex_factory or o.original_po_ex_factory
        if not ex_fac:
            continue
        biz_days_until = business_days_between(now, ex_fac)
        if biz_days_until > 40:
            continue

        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()
        issues = []

        if components:
            for comp in components:
                if sample_needs_work(comp.fit_sample_status, comp.fit_sample_approved):
                    issues.append(f"Fit sample not approved ({comp.name})")
                if sample_needs_work(comp.strike_off_status, comp.strike_off_approved):
                    issues.append(f"Strike off not approved ({comp.name})")
                if sample_needs_work(comp.lab_dip_status, comp.lab_dip_approved):
                    issues.append(f"Lab dip not approved ({comp.name})")
        else:
            if sample_needs_work(o.fit_sample_status, o.fit_sample_approved):
                issues.append("Fit sample not approved")
            if sample_needs_work(o.strike_off_status, o.strike_off_approved):
                issues.append("Strike off not approved")
            if sample_needs_work(o.lab_dip_status, o.lab_dip_approved):
                issues.append("Lab dip not approved")

        if sample_needs_work(o.pps_status, o.pps_approved):
            issues.append("PPS not approved")

        if issues:
            at_risk.append({
                "id": o.id,
                "po_number": o.po_number,
                "style_code": o.style_code,
                "factory": o.factory,
                "customer": o.customer,
                "days_until_ex_factory": biz_days_until,
                "ex_factory_date": ex_fac.isoformat(),
                "issues": issues,
            })

    at_risk.sort(key=lambda x: x["days_until_ex_factory"])

    # --- Factory Sample Performance ---
    factory_perf = {}
    for o in all_orders:
        factory = o.factory or "Unknown"
        if factory not in factory_perf:
            factory_perf[factory] = {"fit_days": [], "strike_off_days": [], "lab_dip_days": [], "total_orders": 0}
        factory_perf[factory]["total_orders"] += 1

        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()
        if components:
            for comp in components:
                if comp.fit_sample_received and comp.fit_sample_approved:
                    factory_perf[factory]["fit_days"].append(business_days_between(comp.fit_sample_received, comp.fit_sample_approved))
                if comp.strike_off_received and comp.strike_off_approved:
                    factory_perf[factory]["strike_off_days"].append(business_days_between(comp.strike_off_received, comp.strike_off_approved))
                if comp.lab_dip_received and comp.lab_dip_approved:
                    factory_perf[factory]["lab_dip_days"].append(business_days_between(comp.lab_dip_received, comp.lab_dip_approved))
        else:
            if o.fit_sample_received and o.fit_sample_approved:
                factory_perf[factory]["fit_days"].append(business_days_between(o.fit_sample_received, o.fit_sample_approved))
            if o.strike_off_received and o.strike_off_approved:
                factory_perf[factory]["strike_off_days"].append(business_days_between(o.strike_off_received, o.strike_off_approved))
            if o.lab_dip_received and o.lab_dip_approved:
                factory_perf[factory]["lab_dip_days"].append(business_days_between(o.lab_dip_received, o.lab_dip_approved))

    factory_sample_performance = []
    for factory, data in factory_perf.items():
        if data["total_orders"] < 2:
            continue
        entry = {
            "factory": factory,
            "total_orders": data["total_orders"],
            "avg_fit_days": round(sum(data["fit_days"]) / len(data["fit_days"]), 1) if data["fit_days"] else None,
            "avg_strike_off_days": round(sum(data["strike_off_days"]) / len(data["strike_off_days"]), 1) if data["strike_off_days"] else None,
            "avg_lab_dip_days": round(sum(data["lab_dip_days"]) / len(data["lab_dip_days"]), 1) if data["lab_dip_days"] else None,
        }
        factory_sample_performance.append(entry)
    factory_sample_performance.sort(key=lambda x: x["total_orders"], reverse=True)

    # --- Awaiting Action ---
    awaiting_action = []
    for o in all_orders:
        actions = []
        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()

        if components:
            for comp in components:
                if not is_sample_done(comp.fit_sample_status, comp.fit_sample_approved) and comp.fit_sample_received:
                    days = business_days_between(comp.fit_sample_received, now)
                    actions.append({"type": f"Fit Sample ({comp.name})", "received_days_ago": days})
                if not is_sample_done(comp.strike_off_status, comp.strike_off_approved) and comp.strike_off_received:
                    days = business_days_between(comp.strike_off_received, now)
                    actions.append({"type": f"Strike Off ({comp.name})", "received_days_ago": days})
                if not is_sample_done(comp.lab_dip_status, comp.lab_dip_approved) and comp.lab_dip_received:
                    days = business_days_between(comp.lab_dip_received, now)
                    actions.append({"type": f"Lab Dip ({comp.name})", "received_days_ago": days})
        else:
            if not is_sample_done(o.fit_sample_status, o.fit_sample_approved) and o.fit_sample_received:
                days = business_days_between(o.fit_sample_received, now)
                actions.append({"type": "Fit Sample", "received_days_ago": days})
            if not is_sample_done(o.strike_off_status, o.strike_off_approved) and o.strike_off_received:
                days = business_days_between(o.strike_off_received, now)
                actions.append({"type": "Strike Off", "received_days_ago": days})
            if not is_sample_done(o.lab_dip_status, o.lab_dip_approved) and o.lab_dip_received:
                days = business_days_between(o.lab_dip_received, now)
                actions.append({"type": "Lab Dip", "received_days_ago": days})

        if not is_sample_done(o.pps_status, o.pps_approved) and o.pps_received:
            days = business_days_between(o.pps_received, now)
            actions.append({"type": "PPS", "received_days_ago": days})

        if actions:
            awaiting_action.append({
                "id": o.id,
                "po_number": o.po_number,
                "style_code": o.style_code,
                "factory": o.factory,
                "customer": o.customer,
                "actions": actions,
            })

    awaiting_action.sort(key=lambda x: max(a["received_days_ago"] for a in x["actions"]), reverse=True)

    # --- PO Completion Tracker ---
    po_completion = {}
    for o in all_orders:
        if o.po_number not in po_completion:
            po_completion[o.po_number] = {
                "customer": o.customer,
                "factory": o.factory,
                "total_samples": 0,
                "approved_samples": 0,
                "styles": 0,
            }
        po_completion[o.po_number]["styles"] += 1

        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()
        if components:
            for comp in components:
                for field_s, field_a in [('fit_sample_status', 'fit_sample_approved'), ('strike_off_status', 'strike_off_approved'), ('lab_dip_status', 'lab_dip_approved')]:
                    status_val = getattr(comp, field_s, None)
                    approved_val = getattr(comp, field_a, None)
                    s = (status_val or '').strip().upper()
                    if not s or s == '':
                        continue
                    po_completion[o.po_number]["total_samples"] += 1
                    if is_sample_done(status_val, approved_val):
                        po_completion[o.po_number]["approved_samples"] += 1
        else:
            for field_s, field_a in [('fit_sample_status', 'fit_sample_approved'), ('strike_off_status', 'strike_off_approved'), ('lab_dip_status', 'lab_dip_approved')]:
                status_val = getattr(o, field_s, None)
                approved_val = getattr(o, field_a, None)
                s = (status_val or '').strip().upper()
                if not s or s == '':
                    continue
                po_completion[o.po_number]["total_samples"] += 1
                if is_sample_done(status_val, approved_val):
                    po_completion[o.po_number]["approved_samples"] += 1
        pps_s = (o.pps_status or '').strip().upper()
        if pps_s and pps_s != '':
            po_completion[o.po_number]["total_samples"] += 1
            if is_sample_done(o.pps_status, o.pps_approved):
                po_completion[o.po_number]["approved_samples"] += 1

    po_completion_list = []
    for po, data in po_completion.items():
        pct = round((data["approved_samples"] / data["total_samples"] * 100) if data["total_samples"] > 0 else 0)
        po_completion_list.append({
            "po_number": po,
            "customer": data["customer"],
            "factory": data["factory"],
            "styles": data["styles"],
            "total_samples": data["total_samples"],
            "approved_samples": data["approved_samples"],
            "completion_pct": pct,
        })
    po_completion_list.sort(key=lambda x: x["completion_pct"])

    def is_sampling_complete(o):
        components = db.query(OrderComponent).filter(OrderComponent.order_id == o.id).all()
        if components:
            for comp in components:
                if sample_needs_work(comp.fit_sample_status, comp.fit_sample_approved):
                    return False
                if sample_needs_work(comp.strike_off_status, comp.strike_off_approved):
                    return False
                if sample_needs_work(comp.lab_dip_status, comp.lab_dip_approved):
                    return False
        else:
            if sample_needs_work(o.fit_sample_status, o.fit_sample_approved):
                return False
            if sample_needs_work(o.strike_off_status, o.strike_off_approved):
                return False
            if sample_needs_work(o.lab_dip_status, o.lab_dip_approved):
                return False
        if sample_needs_work(o.pps_status, o.pps_approved):
            return False
        return True

    # --- Season Overview ---
    season_data = {}
    for o in all_orders:
        season = o.season or 'Unknown'
        if season not in season_data:
            season_data[season] = {"total": 0, "complete": 0, "in_progress": 0}
        season_data[season]["total"] += 1
        if is_sampling_complete(o):
            season_data[season]["complete"] += 1
        else:
            season_data[season]["in_progress"] += 1

    season_overview = [
        {"season": k, **v, "completion_pct": round(v["complete"] / v["total"] * 100) if v["total"] > 0 else 0}
        for k, v in sorted(season_data.items())
    ]

    # --- Customer Workload ---
    customer_data = {}
    for o in all_orders:
        cust = o.customer or 'Unknown'
        if cust not in customer_data:
            customer_data[cust] = {"total_styles": 0, "incomplete": 0, "complete": 0, "pos": {}}
        customer_data[cust]["total_styles"] += 1
        complete = is_sampling_complete(o)
        if complete:
            customer_data[cust]["complete"] += 1
        else:
            customer_data[cust]["incomplete"] += 1
        if o.po_number not in customer_data[cust]["pos"]:
            customer_data[cust]["pos"][o.po_number] = {
                "factory": o.factory,
                "styles": 0,
                "incomplete": 0,
            }
        customer_data[cust]["pos"][o.po_number]["styles"] += 1
        if not complete:
            customer_data[cust]["pos"][o.po_number]["incomplete"] += 1

    customer_workload = []
    for k, v in sorted(customer_data.items(), key=lambda x: x[1]["incomplete"], reverse=True):
        pos = [
            {"po_number": pn, **pd}
            for pn, pd in sorted(v["pos"].items(), key=lambda x: x[1]["incomplete"], reverse=True)
        ]
        customer_workload.append({
            "customer": k,
            "total_styles": v["total_styles"],
            "incomplete": v["incomplete"],
            "complete": v["complete"],
            "pos": pos,
        })
    customer_workload = customer_workload[:15]

    return {
        "sample_pipeline": sample_pipeline,
        "component_coverage": component_coverage,
        "at_risk_samples": at_risk[:20],
        "factory_sample_performance": factory_sample_performance[:15],
        "awaiting_action": awaiting_action[:20],
        "po_completion": po_completion_list[:30],
        "season_overview": season_overview,
        "customer_workload": customer_workload,
    }
