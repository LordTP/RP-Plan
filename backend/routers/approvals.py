"""Supplier date-change approval workflow — pending / approve / reject /
bulk actions / supplier-facing 'my changes' views / cancel."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserRole, PurchaseOrder, PendingDateChange, DateChangeHistory
from auth import get_current_user, get_current_internal_user
from supplier_access import supplier_filter_clause


router = APIRouter()


@router.get("/api/approvals/pending")
async def get_pending_approvals(
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Get all pending date change approvals (for Sourcelab dashboard)"""
    pending = db.query(PendingDateChange).filter(
        PendingDateChange.status == "pending"
    ).order_by(PendingDateChange.submitted_at.desc()).all()

    result = {}
    for p in pending:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == p.order_id).first()
        if not order:
            continue
        po_number = order.po_number
        if po_number not in result:
            result[po_number] = {
                "po_number": po_number,
                "factory": order.factory,
                "customer": order.customer,
                "changes": []
            }
        result[po_number]["changes"].append({
            "id": p.id,
            "order_id": p.order_id,
            "style_code": order.style_code,
            "field_name": p.field_name,
            "current_value": p.current_value,
            "proposed_value": p.proposed_value,
            "reason": p.reason,
            "submitted_by": p.submitted_by_username,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
        })

    return {"pending_approvals": list(result.values())}


@router.get("/api/approvals/rejected")
async def get_rejected_approvals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get rejected date changes for the current supplier"""
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()

    if role_str == 'supplier':
        rejected = db.query(PendingDateChange).filter(
            PendingDateChange.submitted_by_id == current_user.id,
            PendingDateChange.status == "rejected"
        ).order_by(PendingDateChange.reviewed_at.desc()).limit(50).all()
    else:
        rejected = db.query(PendingDateChange).filter(
            PendingDateChange.status == "rejected"
        ).order_by(PendingDateChange.reviewed_at.desc()).limit(50).all()

    result = []
    for r in rejected:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == r.order_id).first()
        if not order:
            continue
        result.append({
            "id": r.id,
            "po_number": order.po_number,
            "style_code": order.style_code,
            "field_name": r.field_name,
            "current_value": r.current_value,
            "proposed_value": r.proposed_value,
            "reason": r.reason,
            "submitted_by": r.submitted_by_username,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "rejected_by": r.reviewed_by_username,
            "rejected_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "rejection_reason": r.rejection_reason
        })

    return {"rejected_changes": result}


@router.post("/api/orders/batch-pending-changes")
async def get_batch_pending_changes(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending date changes for multiple orders in one request.

    Supplier-scoped via a join on the parent order — the caller supplies
    arbitrary order_ids, so without this a supplier could read another
    factory's proposed dates and the free-text reasons attached to them."""
    order_ids = body.get("order_ids", [])
    if not order_ids:
        return {"pending_changes": {}}

    pending = db.query(PendingDateChange).join(
        PurchaseOrder, PurchaseOrder.id == PendingDateChange.order_id
    ).filter(
        PendingDateChange.order_id.in_(order_ids),
        PendingDateChange.status == "pending",
        *supplier_filter_clause(current_user)
    ).all()

    result: dict = {}
    for p in pending:
        if p.order_id not in result:
            result[p.order_id] = []
        result[p.order_id].append({
            "id": p.id,
            "field_name": p.field_name,
            "current_value": p.current_value,
            "proposed_value": p.proposed_value,
            "reason": p.reason,
            "submitted_by": p.submitted_by_username,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
        })

    return {"pending_changes": result}


@router.get("/api/orders/{order_id}/pending-changes")
async def get_order_pending_changes(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending date changes for a specific order. Supplier-scoped —
    see the batch endpoint above for why."""
    pending = db.query(PendingDateChange).join(
        PurchaseOrder, PurchaseOrder.id == PendingDateChange.order_id
    ).filter(
        PendingDateChange.order_id == order_id,
        PendingDateChange.status == "pending",
        *supplier_filter_clause(current_user)
    ).all()

    return {
        "pending_changes": [
            {
                "id": p.id,
                "field_name": p.field_name,
                "current_value": p.current_value,
                "proposed_value": p.proposed_value,
                "reason": p.reason,
                "submitted_by": p.submitted_by_username,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
            }
            for p in pending
        ]
    }


@router.post("/api/approvals/{approval_id}/approve")
async def approve_date_change(
    approval_id: int,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Approve a pending date change"""
    pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Pending change not found")
    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="This change has already been processed")

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == pending.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    from excel_utils import parse_date
    new_value = parse_date(pending.proposed_value)

    setattr(order, pending.field_name, new_value)
    order.updated_at = datetime.utcnow()

    history = DateChangeHistory(
        po_id=order.id,
        user_id=pending.submitted_by_id,
        field_name=pending.field_name,
        old_value=pending.current_value,
        new_value=pending.proposed_value,
        source="Supplier (Approved)",
        approved_by_id=current_user.id,
        approved_by_username=current_user.username
    )
    db.add(history)

    pending.status = "approved"
    pending.reviewed_by_id = current_user.id
    pending.reviewed_by_username = current_user.username
    pending.reviewed_at = datetime.utcnow()

    # If factory_confirmed_ex_factory was approved and revised is blank, default it
    if pending.field_name == 'factory_confirmed_ex_factory' and order.factory_confirmed_ex_factory and not order.revised_po_ex_factory:
        order.revised_po_ex_factory = order.factory_confirmed_ex_factory

    # Auto-calculate ETA dates if revised_po_ex_factory was approved (or defaulted)
    if order.revised_po_ex_factory:
        order.eta_to_uk = order.revised_po_ex_factory + timedelta(days=60)
        order.eta_to_customer = order.eta_to_uk + timedelta(days=5)

    # Auto-calculate estimated_del_to_customer if vessel ETA fields approved
    if pending.field_name in ('vessel_eta_to_port', 'revised_vessel_eta_to_port'):
        vessel_eta = order.revised_vessel_eta_to_port or order.vessel_eta_to_port
        if vessel_eta:
            fcl_lcl = (order.fcl_lcl or '').strip().upper()
            days_to_add = 7 if fcl_lcl == 'LCL' else 2 if fcl_lcl == 'AIR' else 5
            order.estimated_del_to_customer = vessel_eta + timedelta(days=days_to_add)

    db.commit()

    return {"success": True, "message": "Date change approved"}


@router.post("/api/approvals/{approval_id}/reject")
async def reject_date_change(
    approval_id: int,
    rejection_data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Reject a pending date change"""
    pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Pending change not found")
    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="This change has already been processed")

    rejection_reason = rejection_data.get("reason", "").strip()
    if not rejection_reason:
        raise HTTPException(status_code=400, detail="Please provide a reason for rejection")

    history = DateChangeHistory(
        po_id=pending.order_id,
        user_id=pending.submitted_by_id,
        field_name=pending.field_name,
        old_value=pending.current_value,
        new_value=pending.proposed_value,
        source="Supplier (Rejected)",
        approved_by_id=current_user.id,
        approved_by_username=current_user.username,
        rejection_reason=rejection_reason
    )
    db.add(history)

    pending.status = "rejected"
    pending.reviewed_by_id = current_user.id
    pending.reviewed_by_username = current_user.username
    pending.reviewed_at = datetime.utcnow()
    pending.rejection_reason = rejection_reason

    db.commit()

    return {"success": True, "message": "Date change rejected"}


@router.post("/api/approvals/bulk-approve")
async def bulk_approve_date_changes(
    approval_data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Approve multiple pending date changes at once"""
    approval_ids = approval_data.get("ids", [])
    if not approval_ids:
        raise HTTPException(status_code=400, detail="No approval IDs provided")

    approved_count = 0
    from excel_utils import parse_date

    for approval_id in approval_ids:
        pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
        if not pending or pending.status != "pending":
            continue

        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == pending.order_id).first()
        if not order:
            continue

        new_value = parse_date(pending.proposed_value)
        setattr(order, pending.field_name, new_value)
        order.updated_at = datetime.utcnow()

        history = DateChangeHistory(
            po_id=order.id,
            user_id=pending.submitted_by_id,
            field_name=pending.field_name,
            old_value=pending.current_value,
            new_value=pending.proposed_value,
            source="Supplier (Approved)",
            approved_by_id=current_user.id,
            approved_by_username=current_user.username
        )
        db.add(history)

        pending.status = "approved"
        pending.reviewed_by_id = current_user.id
        pending.reviewed_by_username = current_user.username
        pending.reviewed_at = datetime.utcnow()

        if pending.field_name == 'factory_confirmed_ex_factory' and order.factory_confirmed_ex_factory and not order.revised_po_ex_factory:
            order.revised_po_ex_factory = order.factory_confirmed_ex_factory

        if order.revised_po_ex_factory:
            order.eta_to_uk = order.revised_po_ex_factory + timedelta(days=60)
            order.eta_to_customer = order.eta_to_uk + timedelta(days=5)

        if pending.field_name in ('vessel_eta_to_port', 'revised_vessel_eta_to_port'):
            vessel_eta = order.revised_vessel_eta_to_port or order.vessel_eta_to_port
            if vessel_eta:
                fcl_lcl = (order.fcl_lcl or '').strip().upper()
                days_to_add = 7 if fcl_lcl == 'LCL' else 2 if fcl_lcl == 'AIR' else 5
                order.estimated_del_to_customer = vessel_eta + timedelta(days=days_to_add)

        approved_count += 1

    db.commit()

    return {"success": True, "approved_count": approved_count}


@router.post("/api/approvals/bulk-reject")
async def bulk_reject_date_changes(
    rejection_data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Reject multiple pending date changes at once"""
    approval_ids = rejection_data.get("ids", [])
    reason = rejection_data.get("reason", "").strip()

    if not approval_ids:
        raise HTTPException(status_code=400, detail="No approval IDs provided")
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    rejected_count = 0

    for approval_id in approval_ids:
        pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
        if not pending or pending.status != "pending":
            continue

        history = DateChangeHistory(
            po_id=pending.order_id,
            user_id=pending.submitted_by_id,
            field_name=pending.field_name,
            old_value=pending.current_value,
            new_value=pending.proposed_value,
            source="Supplier (Rejected)",
            approved_by_id=current_user.id,
            approved_by_username=current_user.username,
            rejection_reason=reason
        )
        db.add(history)

        pending.status = "rejected"
        pending.reviewed_by_id = current_user.id
        pending.reviewed_by_username = current_user.username
        pending.reviewed_at = datetime.utcnow()
        pending.rejection_reason = reason

        rejected_count += 1

    db.commit()

    return {"success": True, "rejected_count": rejected_count}


@router.get("/api/approvals/my-pending")
async def get_my_pending_changes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending date changes submitted by the current user (for suppliers)"""
    pending = db.query(PendingDateChange).filter(
        PendingDateChange.submitted_by_id == current_user.id,
        PendingDateChange.status == "pending"
    ).order_by(PendingDateChange.submitted_at.desc()).limit(50).all()

    result = []
    for p in pending:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == p.order_id).first()
        if order:
            result.append({
                "id": p.id,
                "order_id": p.order_id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "field_name": p.field_name,
                "current_value": p.current_value,
                "proposed_value": p.proposed_value,
                "reason": p.reason,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
            })

    return {"pending_changes": result}


@router.get("/api/approvals/my-approved")
async def get_my_approved_changes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get recently approved date changes submitted by the current user"""
    approved = db.query(PendingDateChange).filter(
        PendingDateChange.submitted_by_id == current_user.id,
        PendingDateChange.status == "approved"
    ).order_by(PendingDateChange.reviewed_at.desc()).limit(50).all()

    result = []
    for p in approved:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == p.order_id).first()
        if order:
            result.append({
                "id": p.id,
                "order_id": p.order_id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "field_name": p.field_name,
                "current_value": p.current_value,
                "proposed_value": p.proposed_value,
                "reason": p.reason,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
                "approved_by": p.reviewed_by_username,
                "approved_at": p.reviewed_at.isoformat() if p.reviewed_at else None
            })

    return {"approved_changes": result}


@router.delete("/api/approvals/{approval_id}/cancel")
async def cancel_pending_change(
    approval_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a pending date change (only the submitter can cancel)"""
    pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()

    if not pending:
        raise HTTPException(status_code=404, detail="Pending change not found")

    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="This change has already been processed")

    # Only the submitter or internal users can cancel
    if pending.submitted_by_id != current_user.id and current_user.role == UserRole.SUPPLIER:
        raise HTTPException(status_code=403, detail="You can only cancel your own pending changes")

    db.delete(pending)
    db.commit()

    return {"success": True, "message": "Pending change cancelled"}
