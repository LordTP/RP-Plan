"""Order components — per-style samples (fit / strike off / lab dip) with
bulk update + apply-to-PO actions. All status/date changes also write to
DateChangeHistory so the activity feed picks them up."""
from datetime import datetime
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, OrderComponent, DateChangeHistory, SampleSubmission
from schemas import ComponentCreate, ComponentUpdate, ComponentResponse
from auth import get_current_user
from sample_helpers import (
    reconcile_sample_status,
    SAMPLE_PREFIXES_COMPONENT,
)


router = APIRouter()


# Map sample_type code in sample_submissions to the field-name prefix on the
# legacy column model. Used when decorating components/orders with attempt info.
SAMPLE_TYPE_TO_PREFIX = {
    'fit': 'fit_sample',
    'strike': 'strike_off',
    'lab': 'lab_dip',
    'pps': 'pps',
}


def _attempt_summary_for_components(
    db: Session, component_ids: List[int]
) -> Dict[Tuple[int, str], Tuple[int, int]]:
    """For each (component_id, sample_type) with at least one submission row,
    return (max_attempt_no, rejection_count). Components/sample_types absent
    from the result map are implicit v1 with 0 rejections."""
    if not component_ids:
        return {}
    rows = db.query(
        SampleSubmission.component_id,
        SampleSubmission.sample_type,
        func.max(SampleSubmission.attempt_no).label('max_attempt'),
        func.sum(case((SampleSubmission.outcome == 'REJECTED', 1), else_=0)).label('rejections'),
    ).filter(
        SampleSubmission.component_id.in_(component_ids),
    ).group_by(
        SampleSubmission.component_id, SampleSubmission.sample_type,
    ).all()
    return {(int(c), s): (int(m), int(r or 0)) for c, s, m, r in rows}


def _decorate_component_attempts(component_dict: dict, summary: Dict[Tuple[int, str], Tuple[int, int]]) -> dict:
    """Mutate a component dict (or pydantic-friendly object) with the per-area
    attempt + rejection fields. Defaults to v1 / 0 when no submission exists."""
    cid = component_dict['id'] if isinstance(component_dict, dict) else component_dict.id
    for sample_type, prefix in (('fit', 'fit_sample'), ('strike', 'strike_off'), ('lab', 'lab_dip')):
        attempt, rejections = summary.get((cid, sample_type), (1, 0))
        if isinstance(component_dict, dict):
            component_dict[f'{prefix}_attempt_no'] = attempt
            component_dict[f'{prefix}_rejection_count'] = rejections
    return component_dict


def decorate_orders_with_attempts(db: Session, order_dicts: List[dict]) -> List[dict]:
    """Roll up per-sample-area attempt info onto each order dict in-place,
    then also decorate any nested components dicts. Used by the orders list
    endpoint so any UI showing order-level sample status (the spreadsheet
    table, factory pages, etc.) automatically gets v2 awareness without
    each surface knowing about the submissions table."""
    if not order_dicts:
        return order_dicts
    order_ids = [d['id'] for d in order_dicts]

    # Single aggregate query across BOTH order-level (component_id IS NULL) and
    # component-level submissions on these orders. We then roll up per
    # (order_id, sample_type) by taking max attempt and summing rejections.
    rows = db.query(
        SampleSubmission.order_id,
        SampleSubmission.sample_type,
        func.max(SampleSubmission.attempt_no).label('max_attempt'),
        func.sum(case((SampleSubmission.outcome == 'REJECTED', 1), else_=0)).label('rejections'),
    ).filter(
        SampleSubmission.order_id.in_(order_ids),
    ).group_by(
        SampleSubmission.order_id, SampleSubmission.sample_type,
    ).all()
    order_summary = {(int(oid), st): (int(m), int(r or 0)) for oid, st, m, r in rows}

    # Component-level summary so we can also decorate the nested components.
    nested_component_ids = []
    for d in order_dicts:
        for c in d.get('components', []) or []:
            nested_component_ids.append(c['id'])
    comp_summary = _attempt_summary_for_components(db, nested_component_ids)

    for d in order_dicts:
        oid = d['id']
        for sample_type, prefix in (('fit', 'fit_sample'), ('strike', 'strike_off'), ('lab', 'lab_dip'), ('pps', 'pps')):
            attempt, rejections = order_summary.get((oid, sample_type), (1, 0))
            d[f'{prefix}_attempt_no'] = attempt
            d[f'{prefix}_rejection_count'] = rejections
        for c in d.get('components', []) or []:
            _decorate_component_attempts(c, comp_summary)
    return order_dicts


@router.get("/api/components/names")
async def get_component_names(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List every distinct component name in the system with a count of how
    many component rows use it. Powers the autocomplete on the add-component
    form so users reuse existing names instead of creating variants."""
    rows = db.query(
        OrderComponent.name,
        func.count(OrderComponent.id).label('count')
    ).filter(
        OrderComponent.name.isnot(None),
        OrderComponent.name != ''
    ).group_by(OrderComponent.name).order_by(func.count(OrderComponent.id).desc()).all()
    return {"names": [{"name": name, "count": count} for name, count in rows]}


@router.post("/api/components/merge")
async def merge_component_names(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rename every OrderComponent whose `name` is in `from_names` to `to_name`.
    Used to collapse casing/spacing duplicates flagged by the data-quality
    callout. Atomic — one transaction."""
    from_names = data.get("from_names") or []
    to_name = (data.get("to_name") or "").strip()

    if not from_names or not isinstance(from_names, list):
        raise HTTPException(status_code=400, detail="from_names must be a non-empty list")
    if not to_name:
        raise HTTPException(status_code=400, detail="to_name is required")

    # Find components to rename (exclude those already matching the target)
    matching = db.query(OrderComponent).filter(
        OrderComponent.name.in_(from_names),
        OrderComponent.name != to_name,
    ).all()

    renamed = 0
    for comp in matching:
        comp.name = to_name
        comp.updated_at = datetime.utcnow()
        renamed += 1

    db.commit()

    return {"success": True, "renamed_count": renamed, "to_name": to_name}


@router.get("/api/orders/{order_id}/components", response_model=List[ComponentResponse])
async def get_order_components(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all components for an order, decorated with per-sample-area attempt
    metadata (current attempt number + prior rejection count)."""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    components = db.query(OrderComponent).filter(OrderComponent.order_id == order_id).order_by(OrderComponent.created_at).all()
    summary = _attempt_summary_for_components(db, [c.id for c in components])
    result = []
    for c in components:
        d = ComponentResponse.model_validate(c).model_dump()
        _decorate_component_attempts(d, summary)
        result.append(d)
    return result


@router.post("/api/orders/{order_id}/components", response_model=ComponentResponse, status_code=status.HTTP_201_CREATED)
async def create_component(
    order_id: int,
    data: ComponentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a component to an order"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    create_data = data.model_dump(exclude_unset=True)
    component = OrderComponent(order_id=order_id, **create_data)
    user_touched_status = [p for p in SAMPLE_PREFIXES_COMPONENT if f'{p}_status' in create_data]
    reconcile_sample_status(component, SAMPLE_PREFIXES_COMPONENT, skip_prefixes=user_touched_status)
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


@router.put("/api/components/{component_id}", response_model=ComponentResponse)
async def update_component(
    component_id: int,
    data: ComponentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a component"""
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    update_data = data.model_dump(exclude_unset=True)

    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    source_tag = "Supplier" if role_str == 'supplier' else "Sourcelab"

    # Log each field change to DateChangeHistory so the activity feed picks it up
    for key, value in update_data.items():
        if key == 'name':
            continue  # renaming a component isn't a "field change" we track here
        old_value = getattr(component, key, None)
        if old_value != value:
            db.add(DateChangeHistory(
                po_id=component.order_id,
                user_id=current_user.id,
                field_name=key,
                old_value=str(old_value) if old_value is not None else None,
                new_value=str(value) if value is not None else None,
                source=source_tag,
                component_name=component.name,
            ))
        setattr(component, key, value)
    component.updated_at = datetime.utcnow()
    user_touched_status = [p for p in SAMPLE_PREFIXES_COMPONENT if f'{p}_status' in update_data]
    reconcile_sample_status(component, SAMPLE_PREFIXES_COMPONENT, skip_prefixes=user_touched_status)
    db.commit()
    db.refresh(component)
    return component


@router.post("/api/components/bulk-update")
async def bulk_update_components(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atomically update the same field on many components.

    Body: {
        "component_ids": [1, 2, 3, ...],
        "field":  "fit_sample_status" | "fit_sample_received" | "fit_sample_approved"
                  | "strike_off_status" | "strike_off_received" | "strike_off_approved"
                  | "lab_dip_status" | "lab_dip_received" | "lab_dip_approved",
        "value":  "APPROVED" | "2026-04-19" | null   (string for status, ISO date for date, null to clear)
    }

    Returns a row-level summary (what changed vs what stayed the same).
    """
    component_ids = data.get("component_ids") or []
    field = data.get("field")
    value = data.get("value")

    ALLOWED_FIELDS = {
        'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
        'strike_off_status', 'strike_off_received', 'strike_off_approved',
        'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
    }
    if field not in ALLOWED_FIELDS:
        raise HTTPException(status_code=400, detail=f"Field '{field}' is not updatable in bulk")
    if not component_ids or not isinstance(component_ids, list):
        raise HTTPException(status_code=400, detail="component_ids must be a non-empty list")

    # Coerce date strings (YYYY-MM-DD) to datetimes for date columns
    date_fields = {
        'fit_sample_received', 'fit_sample_approved',
        'strike_off_received', 'strike_off_approved',
        'lab_dip_received', 'lab_dip_approved',
    }
    if field in date_fields and isinstance(value, str) and value:
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            try:
                value = datetime.strptime(value, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Could not parse date '{value}'")

    rows = db.query(OrderComponent).filter(OrderComponent.id.in_(component_ids)).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No matching components found")

    # For the status-vs-date reconciliation logic, only skip reconcile when the
    # user explicitly touched the status field. Here we always touch ONE field.
    touched_status_prefixes = []
    if field.endswith('_status'):
        prefix = field[:-len('_status')]
        if prefix in SAMPLE_PREFIXES_COMPONENT:
            touched_status_prefixes = [prefix]

    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    source_tag = "Supplier" if role_str == 'supplier' else "Sourcelab"

    changed = []
    unchanged = []
    for comp in rows:
        old_value = getattr(comp, field, None)
        values_differ = old_value != value
        if values_differ:
            # Record the change BEFORE mutating so we capture the true old value
            db.add(DateChangeHistory(
                po_id=comp.order_id,
                user_id=current_user.id,
                field_name=field,
                old_value=str(old_value) if old_value is not None else None,
                new_value=str(value) if value is not None else None,
                source=source_tag,
                component_name=comp.name,
            ))
            setattr(comp, field, value)
            comp.updated_at = datetime.utcnow()
            reconcile_sample_status(comp, SAMPLE_PREFIXES_COMPONENT, skip_prefixes=touched_status_prefixes)
            changed.append(comp.id)
        else:
            unchanged.append(comp.id)

    db.commit()
    return {
        "success": True,
        "changed_count": len(changed),
        "unchanged_count": len(unchanged),
        "changed_ids": changed,
    }


@router.delete("/api/components/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a component"""
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    db.delete(component)
    db.commit()


@router.post("/api/orders/{order_id}/components/bulk-add")
async def bulk_add_component(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a component to selected styles or all styles on the same PO"""
    body = await request.json()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Component name is required")
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # If order_ids provided, use those; otherwise all styles on PO
    order_ids = body.get("order_ids")
    if order_ids:
        sibling_orders = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()
    else:
        sibling_orders = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == order.po_number).all()
    created = 0
    for sib in sibling_orders:
        existing = db.query(OrderComponent).filter(
            OrderComponent.order_id == sib.id,
            OrderComponent.name == name
        ).first()
        if not existing:
            component = OrderComponent(order_id=sib.id, name=name)
            db.add(component)
            created += 1
    db.commit()
    return {"success": True, "components_created": created, "po_number": order.po_number}


@router.post("/api/components/{component_id}/apply-to-po")
async def apply_component_field_to_po(
    component_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apply a component field update to matching components (same name) on selected or all styles on the PO"""
    body = await request.json()
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == component.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # If order_ids provided, scope to those; otherwise all on PO
    selected_ids = body.pop("order_ids", None)
    if selected_ids:
        sibling_ids = selected_ids
    else:
        sibling_ids = [o.id for o in db.query(PurchaseOrder.id).filter(PurchaseOrder.po_number == order.po_number).all()]
    matching = db.query(OrderComponent).filter(
        OrderComponent.order_id.in_(sibling_ids),
        OrderComponent.name == component.name
    ).all()
    # Remaining keys in body are the fields to update
    allowed_fields = {
        'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
        'strike_off_status', 'strike_off_received', 'strike_off_approved',
        'lab_dip_status', 'lab_dip_received', 'lab_dip_approved', 'name'
    }
    date_fields = {
        'fit_sample_received', 'fit_sample_approved',
        'strike_off_received', 'strike_off_approved',
        'lab_dip_received', 'lab_dip_approved',
    }
    update_data = {}
    for k, v in body.items():
        if k not in allowed_fields:
            continue
        if k in date_fields and isinstance(v, str) and v:
            try:
                v = datetime.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                try:
                    v = datetime.strptime(v, '%Y-%m-%d')
                except ValueError:
                    continue  # skip unparseable
        update_data[k] = v
    user_touched_status = [p for p in SAMPLE_PREFIXES_COMPONENT if f'{p}_status' in update_data]
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    source_tag = "Supplier" if role_str == 'supplier' else "Sourcelab"
    updated = 0
    for comp in matching:
        for key, value in update_data.items():
            if key == 'name':
                continue  # not tracked as a field change
            old_value = getattr(comp, key, None)
            if old_value != value:
                db.add(DateChangeHistory(
                    po_id=comp.order_id,
                    user_id=current_user.id,
                    field_name=key,
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(value) if value is not None else None,
                    source=source_tag,
                    component_name=comp.name,
                ))
            setattr(comp, key, value)
        comp.updated_at = datetime.utcnow()
        reconcile_sample_status(comp, SAMPLE_PREFIXES_COMPONENT, skip_prefixes=user_touched_status)
        updated += 1
    db.commit()
    return {"success": True, "components_updated": updated, "po_number": order.po_number}


@router.get("/api/components/styles-with-component")
async def get_styles_with_component(
    po_number: str = Query(...),
    component_name: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all styles on a PO that have a component with a given name"""
    orders = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number).all()
    results = []
    for o in orders:
        comp = db.query(OrderComponent).filter(
            OrderComponent.order_id == o.id,
            OrderComponent.name == component_name
        ).first()
        if comp:
            results.append({
                "id": o.id,
                "style_code": o.style_code or "",
                "description": o.description or "",
                "colour": o.colour or "",
                "component_id": comp.id,
            })
    return {"styles": results}
