"""Shipment draft endpoints — factory builds a draft manifest, confirms when
ready, and the 5 shared shipping fields are pushed to every linked order.

Bypasses the supplier-approval pending-change flow that single-row date
edits trigger today; the draft itself is the approval surface for the
factory's shipping data.
"""
from datetime import datetime, timedelta
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, UserRole, PurchaseOrder, ShipmentDraft, ShipmentDraftOrder,
    DateChangeHistory,
)
from auth import get_current_user, get_current_internal_user


router = APIRouter()


# ---- Request / response shapes ---------------------------------------------

class DraftCreateRequest(BaseModel):
    factory: str
    name: Optional[str] = None
    # Optional initial shipping fields. All editable later.
    fcl_lcl: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_etd: Optional[str] = None  # ISO date
    vessel_eta_to_port: Optional[str] = None
    tracking_reference: Optional[str] = None
    # Optional initial order ids to populate.
    order_ids: Optional[List[int]] = None


class DraftUpdateRequest(BaseModel):
    name: Optional[str] = None
    fcl_lcl: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_etd: Optional[str] = None
    vessel_eta_to_port: Optional[str] = None
    tracking_reference: Optional[str] = None
    reference: Optional[str] = None  # allow rename


class AddOrdersRequest(BaseModel):
    order_ids: List[int]


class UpdateOrderQuantityRequest(BaseModel):
    quantity: Optional[int] = None  # null clears, int sets


# ---- Helpers ---------------------------------------------------------------

def _coerce_iso_date(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError:
        try:
            return datetime.strptime(s, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(400, f"Could not parse date '{s}'")


def _next_reference(db: Session, today: datetime) -> str:
    """Generate the next per-day auto reference like DRAFT-2026-04-25-001."""
    prefix = today.strftime('DRAFT-%Y-%m-%d-')
    count = db.query(func.count(ShipmentDraft.id)).filter(
        ShipmentDraft.reference.like(f'{prefix}%'),
    ).scalar() or 0
    return f'{prefix}{count + 1:03d}'


def _supplier_owns(draft: ShipmentDraft, current_user: User) -> bool:
    if current_user.role != UserRole.SUPPLIER:
        return True
    return draft.factory == (current_user.factory_name or '')


def _ensure_access(draft: ShipmentDraft, current_user: User):
    if not _supplier_owns(draft, current_user):
        raise HTTPException(403, "You can only access drafts for your own factory")


def _serialize_draft(db: Session, draft: ShipmentDraft, include_orders: bool = False) -> dict:
    out = {
        'id': draft.id,
        'reference': draft.reference,
        'name': draft.name,
        'factory': draft.factory,
        'status': draft.status,
        'fcl_lcl': draft.fcl_lcl,
        'vessel_name': draft.vessel_name,
        'vessel_etd': draft.vessel_etd.isoformat() if draft.vessel_etd else None,
        'vessel_eta_to_port': draft.vessel_eta_to_port.isoformat() if draft.vessel_eta_to_port else None,
        'tracking_reference': draft.tracking_reference,
        'created_by_id': draft.created_by_id,
        'confirmed_by_id': draft.confirmed_by_id,
        'confirmed_at': draft.confirmed_at.isoformat() if draft.confirmed_at else None,
        'created_at': draft.created_at.isoformat(),
        'updated_at': draft.updated_at.isoformat(),
        'order_count': db.query(func.count(ShipmentDraftOrder.id)).filter(
            ShipmentDraftOrder.draft_id == draft.id,
        ).scalar() or 0,
        'unit_count': db.query(func.coalesce(func.sum(ShipmentDraftOrder.quantity), 0)).filter(
            ShipmentDraftOrder.draft_id == draft.id,
        ).scalar() or 0,
    }
    if include_orders:
        rows = db.query(ShipmentDraftOrder, PurchaseOrder).join(
            PurchaseOrder, ShipmentDraftOrder.order_id == PurchaseOrder.id,
        ).filter(ShipmentDraftOrder.draft_id == draft.id).order_by(
            PurchaseOrder.po_number, PurchaseOrder.style_code,
        ).all()
        out['orders'] = [
            {
                'link_id': link.id,
                'order_id': order.id,
                'po_number': order.po_number,
                'china_orderbook_ref': order.china_orderbook_ref,
                'style_code': order.style_code,
                'description': order.description,
                'colour': order.colour,
                'customer': order.customer,
                'total_quantity': order.total_quantity,
                'quantity': link.quantity,
            }
            for link, order in rows
        ]
    # Username / display name lookups for the audit trail.
    creator = db.query(User).filter(User.id == draft.created_by_id).first()
    out['created_by'] = {
        'username': creator.username if creator else None,
        'full_name': creator.full_name if creator else None,
    } if creator else None
    confirmer = None
    if draft.confirmed_by_id:
        c = db.query(User).filter(User.id == draft.confirmed_by_id).first()
        if c:
            confirmer = {'username': c.username, 'full_name': c.full_name}
    out['confirmed_by'] = confirmer
    return out


# ---- List / detail / create / update / delete -------------------------------

@router.get("/api/shipment-drafts")
async def list_drafts(
    status: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List drafts visible to the current user. Suppliers see only their own
    factory; internal/admin users see everything."""
    q = db.query(ShipmentDraft)
    if current_user.role == UserRole.SUPPLIER:
        q = q.filter(ShipmentDraft.factory == (current_user.factory_name or ''))
    if status:
        q = q.filter(ShipmentDraft.status == status)
    drafts = q.order_by(ShipmentDraft.updated_at.desc()).all()
    return {'drafts': [_serialize_draft(db, d) for d in drafts]}


@router.get("/api/shipment-drafts/{draft_id}")
async def get_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    _ensure_access(draft, current_user)
    return _serialize_draft(db, draft, include_orders=True)


@router.post("/api/shipment-drafts")
async def create_draft(
    body: DraftCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    factory = body.factory
    # Suppliers can only create for their own factory.
    if current_user.role == UserRole.SUPPLIER:
        factory = current_user.factory_name or ''
        if not factory:
            raise HTTPException(400, "No factory associated with your account")
    if not factory:
        raise HTTPException(400, "factory is required")

    now = datetime.utcnow()
    draft = ShipmentDraft(
        reference=_next_reference(db, now),
        name=(body.name or None),
        factory=factory,
        status='draft',
        fcl_lcl=body.fcl_lcl,
        vessel_name=body.vessel_name,
        vessel_etd=_coerce_iso_date(body.vessel_etd),
        vessel_eta_to_port=_coerce_iso_date(body.vessel_eta_to_port),
        tracking_reference=body.tracking_reference,
        created_by_id=current_user.id,
    )
    db.add(draft)
    db.flush()  # populate draft.id

    # Initial orders, if provided. Default each link's quantity to the order's
    # total_quantity at time of add.
    if body.order_ids:
        for oid in body.order_ids:
            order = db.query(PurchaseOrder).filter(PurchaseOrder.id == oid).first()
            if order is None:
                continue
            if current_user.role == UserRole.SUPPLIER and order.factory != factory:
                continue  # silently skip — supplier can't add other factories' orders
            db.add(ShipmentDraftOrder(
                draft_id=draft.id,
                order_id=oid,
                quantity=order.total_quantity,
            ))
    db.commit()
    db.refresh(draft)
    return _serialize_draft(db, draft, include_orders=True)


@router.put("/api/shipment-drafts/{draft_id}")
async def update_draft(
    draft_id: int,
    body: DraftUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    _ensure_access(draft, current_user)
    if draft.status != 'draft':
        raise HTTPException(400, f"Draft is {draft.status} — locked, cannot edit")

    if body.reference is not None: draft.reference = body.reference.strip() or draft.reference
    if body.name is not None: draft.name = body.name.strip() or None
    if body.fcl_lcl is not None: draft.fcl_lcl = body.fcl_lcl or None
    if body.vessel_name is not None: draft.vessel_name = body.vessel_name or None
    if body.vessel_etd is not None: draft.vessel_etd = _coerce_iso_date(body.vessel_etd)
    if body.vessel_eta_to_port is not None: draft.vessel_eta_to_port = _coerce_iso_date(body.vessel_eta_to_port)
    if body.tracking_reference is not None: draft.tracking_reference = body.tracking_reference or None

    db.commit()
    return _serialize_draft(db, draft, include_orders=True)


@router.delete("/api/shipment-drafts/{draft_id}")
async def delete_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel/delete a draft. Confirmed drafts can't be deleted (they're a
    historical record at that point)."""
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    _ensure_access(draft, current_user)
    if draft.status == 'confirmed':
        raise HTTPException(400, "Confirmed shipments can't be deleted")
    db.delete(draft)
    db.commit()
    return {'ok': True}


# ---- Order links -----------------------------------------------------------

@router.post("/api/shipment-drafts/{draft_id}/orders")
async def add_orders(
    draft_id: int,
    body: AddOrdersRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    _ensure_access(draft, current_user)
    if draft.status != 'draft':
        raise HTTPException(400, "Draft is locked")

    existing = {l.order_id for l in db.query(ShipmentDraftOrder).filter(
        ShipmentDraftOrder.draft_id == draft.id,
    ).all()}
    added = 0
    for oid in body.order_ids:
        if oid in existing:
            continue
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == oid).first()
        if order is None:
            continue
        if order.factory != draft.factory:
            continue  # one factory per draft
        db.add(ShipmentDraftOrder(
            draft_id=draft.id,
            order_id=oid,
            quantity=order.total_quantity,
        ))
        added += 1
    db.commit()
    return {'ok': True, 'added': added}


@router.delete("/api/shipment-drafts/{draft_id}/orders/{order_id}")
async def remove_order(
    draft_id: int,
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    _ensure_access(draft, current_user)
    if draft.status != 'draft':
        raise HTTPException(400, "Draft is locked")
    db.query(ShipmentDraftOrder).filter(
        ShipmentDraftOrder.draft_id == draft.id,
        ShipmentDraftOrder.order_id == order_id,
    ).delete()
    db.commit()
    return {'ok': True}


@router.put("/api/shipment-drafts/{draft_id}/orders/{order_id}")
async def update_order_link(
    draft_id: int,
    order_id: int,
    body: UpdateOrderQuantityRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the quantity stored against an SKU in this draft. Must be > 0
    but is allowed to exceed the PO line total — factories sometimes ship
    over (overage runs, replacement units, etc.) and the cap was blocking
    legitimate shipments."""
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    _ensure_access(draft, current_user)
    if draft.status != 'draft':
        raise HTTPException(400, "Draft is locked")

    link = db.query(ShipmentDraftOrder).filter(
        ShipmentDraftOrder.draft_id == draft.id,
        ShipmentDraftOrder.order_id == order_id,
    ).first()
    if link is None:
        raise HTTPException(404, "Order is not in this draft")

    if body.quantity is not None:
        if body.quantity <= 0:
            raise HTTPException(400, "Quantity must be greater than zero")
    link.quantity = body.quantity
    db.commit()
    return {'ok': True, 'quantity': link.quantity}


# ---- SKU picker — list all orders for the factory with draft/confirm flags --

@router.get("/api/shipment-drafts/picker/orders")
async def picker_orders(
    factory: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return every order for the factory grouped by PO, plus a flag noting
    whether each SKU is already in another draft or already confirmed in a
    prior shipment. Powers the SKU picker on the new-draft page.

    Suppliers always see their own factory regardless of the query param;
    internal users can pass a factory filter."""
    if current_user.role == UserRole.SUPPLIER:
        factory = current_user.factory_name or ''
    if not factory:
        raise HTTPException(400, "factory is required")

    orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.factory == factory,
    ).order_by(PurchaseOrder.po_number, PurchaseOrder.style_code).all()
    order_ids = [o.id for o in orders]
    if not order_ids:
        return {'pos': []}

    # Find every draft each SKU is currently in (status != cancelled).
    links = db.query(ShipmentDraftOrder, ShipmentDraft).join(
        ShipmentDraft, ShipmentDraftOrder.draft_id == ShipmentDraft.id,
    ).filter(
        ShipmentDraftOrder.order_id.in_(order_ids),
        ShipmentDraft.status != 'cancelled',
    ).all()
    by_order: dict[int, list[dict]] = {}
    for link, d in links:
        by_order.setdefault(link.order_id, []).append({
            'draft_id': d.id,
            'reference': d.reference,
            'name': d.name,
            'status': d.status,
            'quantity': link.quantity,
        })

    # Group orders by PO# for the picker UI.
    by_po: dict[str, dict] = {}
    for o in orders:
        po_key = o.po_number or '—'
        bucket = by_po.setdefault(po_key, {
            'po_number': po_key,
            'china_orderbook_ref': o.china_orderbook_ref,
            'customer': o.customer,
            'styles': [],
        })
        in_drafts = by_order.get(o.id, [])
        bucket['styles'].append({
            'order_id': o.id,
            'style_code': o.style_code,
            'customer_style_code': o.customer_style_code,
            'description': o.description,
            'colour': o.colour,
            'total_quantity': o.total_quantity,
            'in_drafts': in_drafts,  # may have status 'draft' or 'confirmed'
        })

    return {'pos': list(by_po.values())}


# ---- Edit a confirmed shipment's shared fields and re-propagate -------------

class UpdateConfirmedShippingRequest(BaseModel):
    """Update the 5 shared shipping fields on a CONFIRMED shipment and
    re-push them to every linked order. SKUs and quantities can't be changed
    via this endpoint — they're frozen once confirmed. The shipment stays
    confirmed; this is just a values correction (e.g. vessel changed)."""
    fcl_lcl: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_etd: Optional[str] = None
    vessel_eta_to_port: Optional[str] = None
    tracking_reference: Optional[str] = None


@router.post("/api/shipment-drafts/{draft_id}/update-shipping")
async def update_confirmed_shipping(
    draft_id: int,
    body: UpdateConfirmedShippingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Shipment not found")
    _ensure_access(draft, current_user)
    if draft.status != 'confirmed':
        raise HTTPException(400, "This endpoint only works on confirmed shipments — use the standard update endpoint for drafts.")

    # Update the draft's stored values.
    draft.fcl_lcl = (body.fcl_lcl or None) if body.fcl_lcl is not None else draft.fcl_lcl
    draft.vessel_name = (body.vessel_name or None) if body.vessel_name is not None else draft.vessel_name
    draft.vessel_etd = _coerce_iso_date(body.vessel_etd) if body.vessel_etd is not None else draft.vessel_etd
    draft.vessel_eta_to_port = _coerce_iso_date(body.vessel_eta_to_port) if body.vessel_eta_to_port is not None else draft.vessel_eta_to_port
    draft.tracking_reference = (body.tracking_reference or None) if body.tracking_reference is not None else draft.tracking_reference

    # Re-push to every linked order — same logic as confirm, but no status flip.
    role_label = 'Supplier' if current_user.role == UserRole.SUPPLIER else 'Sourcelab'
    fields_to_apply = {
        'fcl_lcl': draft.fcl_lcl,
        'vessel_name': draft.vessel_name,
        'vessel_etd': draft.vessel_etd,
        'vessel_eta_to_port': draft.vessel_eta_to_port,
        'tracking_reference': draft.tracking_reference,
    }
    links = db.query(ShipmentDraftOrder).filter(ShipmentDraftOrder.draft_id == draft.id).all()
    for link in links:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == link.order_id).first()
        if order is None:
            continue
        for field, new_value in fields_to_apply.items():
            old_value = getattr(order, field, None)
            if old_value != new_value:
                db.add(DateChangeHistory(
                    po_id=order.id,
                    user_id=current_user.id,
                    field_name=field,
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(new_value) if new_value is not None else None,
                    source=role_label,
                ))
                setattr(order, field, new_value)
        # Re-derive estimated delivery in case vessel ETA changed.
        vessel_eta = order.revised_vessel_eta_to_port or order.vessel_eta_to_port
        if vessel_eta:
            mode = (order.fcl_lcl or '').strip().upper()
            days = 7 if mode == 'LCL' else 2 if mode == 'AIR' else 5
            order.estimated_del_to_customer = vessel_eta + timedelta(days=days)

    db.commit()
    db.refresh(draft)
    return _serialize_draft(db, draft, include_orders=True)


# ---- Confirm — apply shared fields to every linked order --------------------

@router.post("/api/shipment-drafts/{draft_id}/confirm")
async def confirm_draft(
    draft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Push the draft's 5 shared fields onto every linked order, mark the
    draft confirmed, and lock it. Bypasses the supplier-approval pending
    flow — the draft itself is the approval surface for the factory."""
    draft = db.query(ShipmentDraft).filter(ShipmentDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(404, "Draft not found")
    _ensure_access(draft, current_user)
    if draft.status != 'draft':
        raise HTTPException(400, f"Draft is already {draft.status}")

    links = db.query(ShipmentDraftOrder).filter(ShipmentDraftOrder.draft_id == draft.id).all()
    if not links:
        raise HTTPException(400, "Add at least one SKU before confirming")

    now = datetime.utcnow()
    role_label = 'Supplier' if current_user.role == UserRole.SUPPLIER else 'Sourcelab'
    fields_to_apply = {
        'fcl_lcl': draft.fcl_lcl,
        'vessel_name': draft.vessel_name,
        'vessel_etd': draft.vessel_etd,
        'vessel_eta_to_port': draft.vessel_eta_to_port,
        'tracking_reference': draft.tracking_reference,
    }

    for link in links:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == link.order_id).first()
        if order is None:
            continue
        for field, new_value in fields_to_apply.items():
            if new_value is None:
                continue  # leave the order's existing value alone if the draft didn't set it
            old_value = getattr(order, field, None)
            if old_value != new_value:
                # Audit trail per row so admins still see the activity in the
                # change history view, even though the supplier confirmed it
                # directly without going through pending-change approval.
                db.add(DateChangeHistory(
                    po_id=order.id,
                    user_id=current_user.id,
                    field_name=field,
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(new_value) if new_value is not None else None,
                    source=role_label,
                ))
                setattr(order, field, new_value)

        # Re-derive estimated_del_to_customer per the existing auto-calc rule
        # (revised vessel ETA + 5 / 7 / 2 days based on FCL/LCL/AIR).
        vessel_eta = order.revised_vessel_eta_to_port or order.vessel_eta_to_port
        if vessel_eta:
            mode = (order.fcl_lcl or '').strip().upper()
            days = 7 if mode == 'LCL' else 2 if mode == 'AIR' else 5
            order.estimated_del_to_customer = vessel_eta + timedelta(days=days)

    draft.status = 'confirmed'
    draft.confirmed_at = now
    draft.confirmed_by_id = current_user.id
    db.commit()
    db.refresh(draft)
    return _serialize_draft(db, draft, include_orders=True)
