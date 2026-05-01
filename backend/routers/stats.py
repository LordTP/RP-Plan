"""Dashboard stats endpoints — dashboard totals, recent activity, activity
summary, missed activity, factories dropdown, and PO summary."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, UserRole, PurchaseOrder, Comment, DateChangeHistory,
)
from auth import get_current_user, get_current_internal_user
from supplier_access import apply_supplier_filter, supplier_filter_clause


router = APIRouter()


@router.get("/api/stats/dashboard")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics"""
    base_filter = supplier_filter_clause(current_user)

    def count_by_status(statuses: list) -> int:
        """Count unique PO numbers with given status(es)"""
        query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
            PurchaseOrder.status.in_(statuses)
        )
        for f in base_filter:
            query = query.filter(f)
        return query.scalar() or 0

    total_query = db.query(func.count(func.distinct(PurchaseOrder.po_number)))
    for f in base_filter:
        total_query = total_query.filter(f)
    total_orders = total_query.scalar() or 0

    orders_in_production = count_by_status(["In Production", "QC Passed"])
    orders_shipped = count_by_status(["Shipped", "In Transit"])
    orders_delivered = count_by_status(["Delivered to UK", "Delivered to Customer"])
    orders_pending_approval = count_by_status(["Pending", "Confirmed"])
    orders_cancelled = count_by_status(["Cancelled"])
    orders_on_hold = count_by_status(["On Hold"])

    overdue_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
        or_(
            PurchaseOrder.is_late == True,
            PurchaseOrder.status == "Delayed"
        )
    )
    for f in base_filter:
        overdue_query = overdue_query.filter(f)
    overdue_orders = overdue_query.scalar() or 0

    total_open_value = 0
    if current_user.role in [UserRole.INTERNAL, UserRole.ADMIN]:
        value_query = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.tracking_reference.is_(None),
            PurchaseOrder.status != "Cancelled"
        )
        for f in base_filter:
            value_query = value_query.filter(f)
        total_open_value = value_query.scalar() or 0

    first_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
        PurchaseOrder.created_at >= first_of_month
    )
    for f in base_filter:
        this_month_query = this_month_query.filter(f)
    orders_this_month = this_month_query.scalar() or 0

    active_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(PurchaseOrder.is_active == True)
    for f in base_filter:
        active_query = active_query.filter(f)
    active_orders = active_query.scalar() or 0

    late_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(PurchaseOrder.is_late == True)
    for f in base_filter:
        late_query = late_query.filter(f)
    late_orders = late_query.scalar() or 0

    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_comments_count = db.query(Comment).filter(
        Comment.created_at >= seven_days_ago
    ).count()

    customer_query = db.query(
        PurchaseOrder.customer,
        func.count(func.distinct(PurchaseOrder.po_number)).label('count')
    )
    for f in base_filter:
        customer_query = customer_query.filter(f)
    orders_by_customer = customer_query.group_by(PurchaseOrder.customer).order_by(
        func.count(func.distinct(PurchaseOrder.po_number)).desc()
    ).limit(5).all()

    return {
        "total_orders": total_orders,
        "active_orders": active_orders,
        "late_orders": late_orders,
        "orders_in_production": orders_in_production,
        "orders_shipped": orders_shipped,
        "orders_delivered": orders_delivered,
        "orders_pending_approval": orders_pending_approval,
        "orders_cancelled": orders_cancelled,
        "orders_on_hold": orders_on_hold,
        "overdue_orders": overdue_orders,
        "total_open_value": float(total_open_value) if total_open_value else 0,
        "orders_this_month": orders_this_month,
        "recent_comments": recent_comments_count,
        "top_customers": [{"customer": c[0], "count": c[1]} for c in orders_by_customer],
        "user_role": current_user.role.value,
        "factory": current_user.factory_name
    }


@router.get("/api/stats/recent-activity")
async def get_recent_activity(
    limit: int = 15,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a unified recent activity feed combining field changes and comments"""
    base_filter = supplier_filter_clause(current_user)

    changes_query = db.query(DateChangeHistory, PurchaseOrder, User).join(
        PurchaseOrder, DateChangeHistory.po_id == PurchaseOrder.id
    ).join(
        User, DateChangeHistory.user_id == User.id
    ).filter(
        DateChangeHistory.import_batch_id.is_(None)
    )
    for f in base_filter:
        changes_query = changes_query.filter(f)
    fetch_limit = offset + limit + 50
    recent_changes = changes_query.order_by(
        DateChangeHistory.created_at.desc()
    ).limit(fetch_limit).all()

    comments_query = db.query(Comment, PurchaseOrder, User).join(
        PurchaseOrder, Comment.po_id == PurchaseOrder.id
    ).join(
        User, Comment.user_id == User.id
    )
    comments_query = apply_supplier_filter(comments_query, current_user)
    recent_comments = comments_query.order_by(
        Comment.created_at.desc()
    ).limit(fetch_limit).all()

    events = []

    for change, order, user in recent_changes:
        events.append({
            "type": "field_change",
            "username": user.username,
            "user_initials": user.username[:2].upper(),
            "po_number": order.po_number,
            "style_code": order.style_code,
            "customer": order.customer,
            "description": order.description,
            "factory": order.factory,
            "field_name": change.field_name,
            "old_value": change.old_value,
            "new_value": change.new_value,
            "source": change.source,
            "component_name": change.component_name,
            "created_at": change.created_at.isoformat() if change.created_at else None,
        })

    for comment, order, user in recent_comments:
        events.append({
            "type": "comment",
            "username": user.username,
            "user_initials": user.username[:2].upper(),
            "po_number": order.po_number,
            "style_code": order.style_code,
            "customer": order.customer,
            "description": order.description,
            "factory": order.factory,
            "comment_text": comment.comment_text[:80] + ("..." if len(comment.comment_text) > 80 else ""),
            "source": comment.source,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        })

    events.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    total = len(events)
    events = events[offset:offset + limit]

    return {"events": events, "total": total, "has_more": (offset + limit) < total}


@router.get("/api/stats/activity-summary")
async def get_activity_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of changes since user's last login (for internal/admin users)"""
    since = current_user.last_login or (datetime.utcnow() - timedelta(hours=24))

    base_filter = supplier_filter_clause(current_user)

    new_orders_query = db.query(PurchaseOrder).filter(PurchaseOrder.created_at > since)
    for f in base_filter:
        new_orders_query = new_orders_query.filter(f)
    new_orders = new_orders_query.order_by(PurchaseOrder.created_at.desc()).limit(20).all()

    updated_orders_query = db.query(PurchaseOrder).filter(
        PurchaseOrder.updated_at > since,
        PurchaseOrder.created_at <= since
    )
    for f in base_filter:
        updated_orders_query = updated_orders_query.filter(f)
    updated_orders = updated_orders_query.order_by(PurchaseOrder.updated_at.desc()).limit(20).all()

    comments_query = db.query(Comment).filter(Comment.created_at > since)
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        comments_query = comments_query.join(PurchaseOrder).filter(
            PurchaseOrder.factory == current_user.factory_name
        )
    new_comments = comments_query.order_by(Comment.created_at.desc()).limit(30).all()

    comment_details = []
    for comment in new_comments:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == comment.po_id).first()
        user = db.query(User).filter(User.id == comment.user_id).first()
        if order:
            comment_details.append({
                "id": comment.id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "comment_text": comment.comment_text[:100] + "..." if len(comment.comment_text) > 100 else comment.comment_text,
                "source": comment.source,
                "username": user.username if user else "Unknown",
                "created_at": comment.created_at.isoformat()
            })

    new_po_summary = {}
    for order in new_orders:
        if order.po_number not in new_po_summary:
            new_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "created_at": order.created_at.isoformat()
            }
        new_po_summary[order.po_number]["styles"].append(order.style_code)

    updated_po_summary = {}
    for order in updated_orders:
        if order.po_number not in updated_po_summary:
            updated_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "updated_at": order.updated_at.isoformat()
            }
        updated_po_summary[order.po_number]["styles"].append(order.style_code)

    return {
        "since": since.isoformat(),
        "new_orders": {
            "count": len(new_orders),
            "po_count": len(new_po_summary),
            "orders": list(new_po_summary.values())[:10]
        },
        "updated_orders": {
            "count": len(updated_orders),
            "po_count": len(updated_po_summary),
            "orders": list(updated_po_summary.values())[:10]
        },
        "new_comments": {
            "count": len(new_comments),
            "comments": comment_details[:15]
        }
    }


@router.get("/api/stats/missed-activity")
async def get_missed_activity(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of changes that happened while the user was logged out
    (between previous_login and last_login)"""
    if not current_user.previous_login or not current_user.last_login:
        return {
            "since": None,
            "until": None,
            "new_orders": {"count": 0, "po_count": 0, "orders": []},
            "updated_orders": {"count": 0, "po_count": 0, "orders": []},
            "new_comments": {"count": 0, "comments": []},
        }

    since = current_user.previous_login
    until = current_user.last_login

    base_filter = supplier_filter_clause(current_user)

    new_orders_query = db.query(PurchaseOrder).filter(
        PurchaseOrder.created_at > since,
        PurchaseOrder.created_at <= until,
    )
    for f in base_filter:
        new_orders_query = new_orders_query.filter(f)
    new_orders = new_orders_query.order_by(PurchaseOrder.created_at.desc()).limit(20).all()

    updated_orders_query = db.query(PurchaseOrder).filter(
        PurchaseOrder.updated_at > since,
        PurchaseOrder.updated_at <= until,
        PurchaseOrder.created_at <= since,
    )
    for f in base_filter:
        updated_orders_query = updated_orders_query.filter(f)
    updated_orders = updated_orders_query.order_by(PurchaseOrder.updated_at.desc()).limit(20).all()

    comments_query = db.query(Comment).filter(
        Comment.created_at > since,
        Comment.created_at <= until,
    )
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        comments_query = comments_query.join(PurchaseOrder).filter(
            PurchaseOrder.factory == current_user.factory_name
        )
    new_comments = comments_query.order_by(Comment.created_at.desc()).limit(30).all()

    comment_details = []
    for comment in new_comments:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == comment.po_id).first()
        user = db.query(User).filter(User.id == comment.user_id).first()
        if order:
            comment_details.append({
                "id": comment.id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "comment_text": comment.comment_text[:100] + "..." if len(comment.comment_text) > 100 else comment.comment_text,
                "source": comment.source,
                "username": user.username if user else "Unknown",
                "created_at": comment.created_at.isoformat()
            })

    new_po_summary = {}
    for order in new_orders:
        if order.po_number not in new_po_summary:
            new_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "created_at": order.created_at.isoformat()
            }
        new_po_summary[order.po_number]["styles"].append(order.style_code)

    updated_po_summary = {}
    for order in updated_orders:
        if order.po_number not in updated_po_summary:
            updated_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "updated_at": order.updated_at.isoformat()
            }
        updated_po_summary[order.po_number]["styles"].append(order.style_code)

    return {
        "since": since.isoformat(),
        "until": until.isoformat(),
        "new_orders": {
            "count": len(new_orders),
            "po_count": len(new_po_summary),
            "orders": list(new_po_summary.values())[:10]
        },
        "updated_orders": {
            "count": len(updated_orders),
            "po_count": len(updated_po_summary),
            "orders": list(updated_po_summary.values())[:10]
        },
        "new_comments": {
            "count": len(new_comments),
            "comments": comment_details[:15]
        }
    }


@router.get("/api/factories")
async def get_factories(
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Get list of unique factories from orders (internal/admin only)"""
    factories = db.query(PurchaseOrder.factory).filter(
        PurchaseOrder.factory.isnot(None),
        PurchaseOrder.factory != ''
    ).distinct().order_by(PurchaseOrder.factory).all()

    return {"factories": [f[0] for f in factories if f[0]]}


@router.get("/api/stats/po-summary")
async def get_po_summary(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of recent POs grouped by PO number for dashboard"""
    query = db.query(PurchaseOrder)
    query = apply_supplier_filter(query, current_user)

    po_summary = db.query(
        PurchaseOrder.po_number,
        PurchaseOrder.customer,
        PurchaseOrder.factory,
        func.count(PurchaseOrder.id).label('line_count'),
        func.sum(PurchaseOrder.total_quantity).label('total_qty'),
        func.sum(PurchaseOrder.total_order_value).label('total_value'),
        func.min(PurchaseOrder.original_po_ex_factory).label('earliest_ex_factory'),
        func.max(PurchaseOrder.created_at).label('latest_update'),
        func.max(PurchaseOrder.status).label('status'),
    )

    po_summary = apply_supplier_filter(po_summary, current_user)

    po_summary = po_summary.group_by(
        PurchaseOrder.po_number,
        PurchaseOrder.customer,
        PurchaseOrder.factory
    ).order_by(func.max(PurchaseOrder.created_at).desc()).limit(limit).all()

    is_supplier = current_user.role == UserRole.SUPPLIER
    return {
        "po_summaries": [
            {
                "po_number": po.po_number,
                "customer": po.customer,
                "factory": po.factory,
                "line_count": po.line_count,
                "total_qty": po.total_qty or 0,
                **({"total_value": float(po.total_value or 0)} if not is_supplier else {}),
                "earliest_ex_factory": po.earliest_ex_factory.isoformat() if po.earliest_ex_factory else None,
                "latest_update": po.latest_update.isoformat() if po.latest_update else None,
                "status": po.status,
            }
            for po in po_summary
        ]
    }
