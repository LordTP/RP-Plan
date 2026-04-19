"""Tracking endpoints — list / search / bulk-update revised vessel ETA."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, DateChangeHistory
from auth import get_current_full_internal_user


router = APIRouter()


@router.get("/api/tracking/refs")
async def list_tracking_refs(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """List all distinct tracking references in the system with a count per ref"""
    results = db.query(
        PurchaseOrder.tracking_reference,
        func.count(PurchaseOrder.id)
    ).filter(
        PurchaseOrder.tracking_reference.isnot(None),
        PurchaseOrder.tracking_reference != ''
    ).group_by(PurchaseOrder.tracking_reference).order_by(PurchaseOrder.tracking_reference).all()

    return {
        "refs": [{"ref": ref, "count": count} for ref, count in results]
    }


@router.get("/api/tracking/search")
async def search_by_tracking_ref(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Find all orders whose tracking_reference contains the given query (case-insensitive)"""
    orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.tracking_reference.isnot(None),
        PurchaseOrder.tracking_reference.ilike(f"%{q}%")
    ).order_by(PurchaseOrder.po_number, PurchaseOrder.style_code).all()

    return {
        "orders": [
            {
                "id": o.id,
                "po_number": o.po_number,
                "style_code": o.style_code,
                "customer": o.customer,
                "factory": o.factory,
                "tracking_reference": o.tracking_reference,
                "vessel_name": o.vessel_name,
                "vessel_eta_to_port": o.vessel_eta_to_port.isoformat() if o.vessel_eta_to_port else None,
                "revised_vessel_eta_to_port": o.revised_vessel_eta_to_port.isoformat() if o.revised_vessel_eta_to_port else None,
                "status": o.status,
            }
            for o in orders
        ]
    }


@router.post("/api/tracking/bulk-update-revised-vessel-eta")
async def bulk_update_revised_vessel_eta(
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Bulk update revised_vessel_eta_to_port for selected orders"""
    order_ids = data.get("order_ids", [])
    new_value_str = data.get("new_value")

    if not order_ids:
        raise HTTPException(status_code=400, detail="No orders selected")

    new_value = None
    if new_value_str:
        try:
            new_value = datetime.fromisoformat(new_value_str.replace('Z', '+00:00'))
        except ValueError:
            try:
                new_value = datetime.strptime(new_value_str, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format")

    orders = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()
    updated_count = 0

    for order in orders:
        old_value = order.revised_vessel_eta_to_port
        if old_value != new_value:
            order.revised_vessel_eta_to_port = new_value
            order.updated_at = datetime.utcnow()

            db.add(DateChangeHistory(
                po_id=order.id,
                user_id=current_user.id,
                field_name='revised_vessel_eta_to_port',
                old_value=str(old_value) if old_value else None,
                new_value=str(new_value) if new_value else None,
                source="Sourcelab (Tracking)",
            ))

            # Auto-calculate estimated_del_to_customer
            vessel_eta = order.revised_vessel_eta_to_port or order.vessel_eta_to_port
            if vessel_eta:
                fcl_lcl = (order.fcl_lcl or '').strip().upper()
                days_to_add = 7 if fcl_lcl == 'LCL' else 2 if fcl_lcl == 'AIR' else 5
                order.estimated_del_to_customer = vessel_eta + timedelta(days=days_to_add)

            updated_count += 1

    db.commit()
    return {"success": True, "updated_count": updated_count}
