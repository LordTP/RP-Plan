"""Order components — per-style samples (fit / strike off / lab dip) with
bulk update + apply-to-PO actions. All status/date changes also write to
DateChangeHistory so the activity feed picks them up."""
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, OrderComponent, DateChangeHistory, SampleSubmission, Component
from schemas import ComponentCreate, ComponentUpdate, ComponentResponse
from auth import get_current_user, get_current_full_internal_user
from sample_helpers import (
    reconcile_sample_status,
    SAMPLE_PREFIXES_COMPONENT,
)
from supplier_access import assert_supplier_can_access, apply_supplier_filter, supplier_filter_clause


# Sample-tracking fields suppliers cannot touch — those belong to the
# sign-off lifecycle Source Lab owns. Suppliers manage the catalogue
# (add / rename / delete) but never write Status / Received / Approved.
SUPPLIER_FORBIDDEN_FIELDS = {
    'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
    'strike_off_status', 'strike_off_received', 'strike_off_approved',
    'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
    'label_status', 'label_received', 'label_approved',
}


def _is_supplier(user: User) -> bool:
    role_str = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    return role_str == 'supplier'


router = APIRouter()


# Map sample_type code in sample_submissions to the field-name prefix on the
# legacy column model. Used when decorating components/orders with attempt info.
SAMPLE_TYPE_TO_PREFIX = {
    'fit': 'fit_sample',
    'strike': 'strike_off',
    'lab': 'lab_dip',
    'pps': 'pps',
    'label': 'label',
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


def _last_rejection_by_key(
    db: Session,
    order_ids: List[int],
    component_ids: List[int],
) -> Dict[Tuple[int, Optional[int], str], dict]:
    """Find the most recent REJECTED submission per (order_id, component_id, sample_type).
    Used to surface "why was this rejected last time" context to factories.
    Returns an empty map if no inputs."""
    if not order_ids and not component_ids:
        return {}
    q = db.query(SampleSubmission).filter(SampleSubmission.outcome == 'REJECTED')
    if component_ids and order_ids:
        # Match either component-level rejections OR order-level rejections on these orders.
        from sqlalchemy import or_
        q = q.filter(or_(
            SampleSubmission.component_id.in_(component_ids),
            SampleSubmission.order_id.in_(order_ids),
        ))
    elif component_ids:
        q = q.filter(SampleSubmission.component_id.in_(component_ids))
    else:
        q = q.filter(SampleSubmission.order_id.in_(order_ids))
    rows = q.order_by(SampleSubmission.attempt_no.asc()).all()
    # Resolve actioned_by_id → username in one shot for the tooltip's
    # "who rejected" line. Map lookup is cheap; no per-row query needed.
    user_ids = {r.actioned_by_id for r in rows if r.actioned_by_id is not None}
    usernames_by_id: Dict[int, str] = {}
    if user_ids:
        for uid, uname in db.query(User.id, User.username).filter(User.id.in_(user_ids)).all():
            usernames_by_id[uid] = uname
    out: Dict[Tuple[int, Optional[int], str], dict] = {}
    for r in rows:
        # Latest wins — keep overwriting, end up with highest attempt_no per key.
        out[(r.order_id, r.component_id, r.sample_type)] = {
            'attempt_no': r.attempt_no,
            'reason': r.reason,
            'notes': r.notes,
            'rejected_at': r.resolved_at.isoformat() if r.resolved_at else None,
            'photo_url': r.photo_url,
            'rejected_by': usernames_by_id.get(r.actioned_by_id) if r.actioned_by_id else None,
        }
    return out


def _decorate_component_attempts(
    component_dict: dict,
    summary: Dict[Tuple[int, str], Tuple[int, int]],
    last_rejections: Optional[Dict[Tuple[int, Optional[int], str], dict]] = None,
) -> dict:
    """Mutate a component dict with per-area attempt + rejection fields, and
    optionally the latest-rejection context (only populated when current attempt > 1)."""
    cid = component_dict['id'] if isinstance(component_dict, dict) else component_dict.id
    oid = component_dict.get('order_id') if isinstance(component_dict, dict) else getattr(component_dict, 'order_id', None)
    # Fit lives on the style/order, not the component — drop it from the per-component
    # decorator so the component dict no longer ships fit_sample_attempt_no etc.
    for sample_type, prefix in (('strike', 'strike_off'), ('lab', 'lab_dip'), ('label', 'label')):
        attempt, rejections = summary.get((cid, sample_type), (1, 0))
        if isinstance(component_dict, dict):
            component_dict[f'{prefix}_attempt_no'] = attempt
            component_dict[f'{prefix}_rejection_count'] = rejections
            if last_rejections is not None and attempt > 1 and oid is not None:
                component_dict[f'{prefix}_last_rejection'] = last_rejections.get((oid, cid, sample_type))
            elif last_rejections is not None:
                component_dict[f'{prefix}_last_rejection'] = None
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

    # Latest rejection per key, for both component-level and order-level rows.
    last_rejections = _last_rejection_by_key(db, order_ids, nested_component_ids)

    for d in order_dicts:
        oid = d['id']
        for sample_type, prefix in (('fit', 'fit_sample'), ('strike', 'strike_off'), ('lab', 'lab_dip'), ('pps', 'pps')):
            attempt, rejections = order_summary.get((oid, sample_type), (1, 0))
            d[f'{prefix}_attempt_no'] = attempt
            d[f'{prefix}_rejection_count'] = rejections
            # Order-level rejection context (component_id is NULL on the row).
            if attempt > 1:
                d[f'{prefix}_last_rejection'] = last_rejections.get((oid, None, sample_type))
            else:
                d[f'{prefix}_last_rejection'] = None
        for c in d.get('components', []) or []:
            _decorate_component_attempts(c, comp_summary, last_rejections)
    return order_dicts



@router.post("/api/components/merge")
async def merge_component_names(
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Rename every OrderComponent whose `name` is in `from_names` to `to_name`.
    Used to collapse casing/spacing duplicates flagged by the data-quality
    callout. Atomic — one transaction.

    Admin/internal only. This renames across EVERY factory's orders by
    design — there's no per-factory version of "collapse these duplicate
    names" that makes sense — so it previously being open to any
    authenticated user, suppliers included, was a straightforward hole.
    Its only caller (DesignComponentsContent) is currently unreachable
    dead code, so tightening this breaks nothing today."""
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
    # Without this a supplier could walk order ids and read another factory's
    # component names, sample state, and full rejection reasons/notes — the
    # response is decorated with that context further down.
    assert_supplier_can_access(order, current_user)
    components = db.query(OrderComponent).filter(OrderComponent.order_id == order_id).order_by(OrderComponent.created_at).all()
    component_ids = [c.id for c in components]
    summary = _attempt_summary_for_components(db, component_ids)
    last_rejections = _last_rejection_by_key(db, [order_id], component_ids)
    result = []
    for c in components:
        d = ComponentResponse.model_validate(c).model_dump()
        _decorate_component_attempts(d, summary, last_rejections)
        result.append(d)
    return result


@router.post("/api/orders/{order_id}/components", response_model=ComponentResponse, status_code=status.HTTP_201_CREATED)
async def create_component(
    order_id: int,
    data: ComponentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a component to an order. Each component is strictly one sample
    type (Strike Off or Lab Dip) — fields for the "other" type are ignored
    on create so a confused client can't seed orphan data.

    Suppliers can create components on their own factory's orders. They
    can't seed sample-lifecycle fields (status / received / approved) on
    creation — those stay Source Lab's call."""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_supplier_can_access(order, current_user)
    create_data = data.model_dump(exclude_unset=True)
    # Strip sample-lifecycle fields from supplier creates — they manage
    # the catalogue, not the sample sign-off.
    if _is_supplier(current_user):
        for f in list(create_data.keys()):
            if f in SUPPLIER_FORBIDDEN_FIELDS:
                create_data.pop(f, None)
    # Drop fields that belong to the OTHER sample types so we never persist
    # stale data outside the component's chosen lane.
    sample_type = create_data.get('sample_type', 'strike_off')
    if sample_type not in ('strike_off', 'lab_dip', 'label'):
        raise HTTPException(status_code=400, detail="sample_type must be 'strike_off', 'lab_dip', or 'label'")
    keep_prefix = {'strike_off': 'strike_off', 'lab_dip': 'lab_dip', 'label': 'label'}[sample_type]
    for other in ('strike_off', 'lab_dip', 'label'):
        if other == keep_prefix:
            continue
        for f in [f'{other}_status', f'{other}_received', f'{other}_approved']:
            create_data.pop(f, None)
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
    # Supplier scoping — they can only update components on their own
    # factory's orders.
    parent_order = db.query(PurchaseOrder).filter(PurchaseOrder.id == component.order_id).first()
    if parent_order is None:
        raise HTTPException(status_code=404, detail="Parent order not found")
    assert_supplier_can_access(parent_order, current_user)
    update_data = data.model_dump(exclude_unset=True)
    # Suppliers can rename and re-scope but not touch sample lifecycle
    # fields — those are Source Lab's call.
    if _is_supplier(current_user):
        forbidden = [k for k in update_data if k in SUPPLIER_FORBIDDEN_FIELDS]
        if forbidden:
            raise HTTPException(
                status_code=403,
                detail=f"Suppliers can't edit sample lifecycle fields: {forbidden}. Only Source Lab can mark received / approved / rejected.",
            )
    # Reject edits to fields that don't belong to this component's sample
    # type. A strike_off component can't have lab_dip or label fields
    # touched, and so on. Returning a clean 400 is easier to debug than
    # silently writing values that don't belong.
    other_prefixes = {
        'strike_off': ('lab_dip_', 'label_'),
        'lab_dip': ('strike_off_', 'label_'),
        'label': ('strike_off_', 'lab_dip_'),
    }.get(component.sample_type, ())
    bad = [k for k in update_data if any(k.startswith(p) for p in other_prefixes)]
    if bad:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit {bad} on a '{component.sample_type}' component",
        )

    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    source_tag = "Supplier" if role_str == 'supplier' else "Sourcelab"

    # Imported here to avoid a circular import at module load.
    from routers.submissions import sync_submission_on_status_change, reconcile_and_sync, STATUS_FIELD_TO_SAMPLE_TYPE
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == component.order_id).first()

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
        # Keep sample_submissions in sync when a sample status flips through this path.
        if order is not None and key in STATUS_FIELD_TO_SAMPLE_TYPE and role_str != 'supplier':
            sync_submission_on_status_change(db, order, component, key, value, current_user.id)

    component.updated_at = datetime.utcnow()
    # The sync above only fires for STATUS writes. A date-only approval —
    # write *_approved and let reconcile flip the status — skipped it
    # entirely, leaving the attempt open while the column read APPROVED.
    # reconcile_and_sync closes whatever the reconcile just settled.
    user_touched_status = [p for p in SAMPLE_PREFIXES_COMPONENT if f'{p}_status' in update_data]
    if order is not None and role_str != 'supplier':
        reconcile_and_sync(
            db, order, component, SAMPLE_PREFIXES_COMPONENT, current_user.id,
            skip_prefixes=user_touched_status,
        )
    else:
        reconcile_sample_status(component, SAMPLE_PREFIXES_COMPONENT, skip_prefixes=user_touched_status)
    db.commit()
    db.refresh(component)
    summary = _attempt_summary_for_components(db, [component.id])
    d = ComponentResponse.model_validate(component).model_dump()
    _decorate_component_attempts(d, summary)
    return d


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

    Suppliers can't call this — every field it allows is a sample-lifecycle
    field, which Source Lab owns. They get a clean 403.
    """
    if _is_supplier(current_user):
        raise HTTPException(
            status_code=403,
            detail="Suppliers can't bulk-update sample fields. Sample sign-off (received / approved) is managed by Source Lab.",
        )
    component_ids = data.get("component_ids") or []
    field = data.get("field")
    value = data.get("value")

    # Fit is order-level — see SAMPLE_PREFIXES_COMPONENT. Bulk-updating it on
    # a component wrote to a field nothing reads.
    ALLOWED_FIELDS = {
        'strike_off_status', 'strike_off_received', 'strike_off_approved',
        'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
        'label_status', 'label_received', 'label_approved',
    }
    if field not in ALLOWED_FIELDS:
        raise HTTPException(status_code=400, detail=f"Field '{field}' is not updatable in bulk")
    if not component_ids or not isinstance(component_ids, list):
        raise HTTPException(status_code=400, detail="component_ids must be a non-empty list")

    # REJECTED is a lifecycle event, not a field write. The sync call further
    # down is gated on APPROVED — originally on the assumption that clients
    # route rejections to /bulk-reject — but nothing enforced that, so a
    # REJECTED sent here wrote the status column and created NO submission
    # row at all: no attempt closed, no v+1 opened, no reason, and the
    # sample silently frozen at REJECTED with no way back through the
    # normal flow. Refuse it instead of assuming.
    if field.endswith('_status') and value == 'REJECTED':
        raise HTTPException(
            status_code=400,
            detail=(
                "Rejecting samples in bulk needs a structured reason. Use "
                "POST /api/submissions/bulk-reject, which closes each current "
                "attempt and opens the next one."
            ),
        )

    # Coerce date strings (YYYY-MM-DD) to datetimes for date columns
    date_fields = {
        'fit_sample_received', 'fit_sample_approved',
        'strike_off_received', 'strike_off_approved',
        'lab_dip_received', 'lab_dip_approved',
        'label_received', 'label_approved',
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

    # Drop any rows whose sample_type doesn't match the field being updated.
    # e.g. trying to set lab_dip_received on strike-off components is a no-op
    # for them rather than an error — the client is hitting a mixed bunch.
    if field.startswith('strike_off_'):
        rows = [c for c in rows if c.sample_type == 'strike_off']
    elif field.startswith('lab_dip_'):
        rows = [c for c in rows if c.sample_type == 'lab_dip']
    elif field.startswith('label_'):
        rows = [c for c in rows if c.sample_type == 'label']

    # For the status-vs-date reconciliation logic, only skip reconcile when the
    # user explicitly touched the status field. Here we always touch ONE field.
    touched_status_prefixes = []
    if field.endswith('_status'):
        prefix = field[:-len('_status')]
        if prefix in SAMPLE_PREFIXES_COMPONENT:
            touched_status_prefixes = [prefix]

    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    source_tag = "Supplier" if role_str == 'supplier' else "Sourcelab"

    from routers.submissions import sync_submission_on_status_change, reconcile_and_sync, STATUS_FIELD_TO_SAMPLE_TYPE

    # Pre-fetch the orders for these components so the submission sync can run
    # without hitting the DB once per row.
    order_ids = list({c.order_id for c in rows})
    orders_by_id = {o.id: o for o in db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()}

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
            # Keep submissions in sync — if APPROVED and an open row exists, close it.
            # (REJECTED via bulk goes through bulk-reject which creates submission rows
            # itself, so we skip the legacy-path REJECTED backfill here to avoid double-processing.)
            order = orders_by_id.get(comp.order_id)
            if order is not None and field in STATUS_FIELD_TO_SAMPLE_TYPE and value == 'APPROVED' and role_str != 'supplier':
                sync_submission_on_status_change(db, order, comp, field, value, current_user.id)
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
    """Delete a component. Suppliers can only delete components on their
    own factory's orders."""
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    parent_order = db.query(PurchaseOrder).filter(PurchaseOrder.id == component.order_id).first()
    if parent_order is not None:
        assert_supplier_can_access(parent_order, current_user)
    db.delete(component)
    db.commit()




@router.post("/api/components/{component_id}/apply-to-po")
async def apply_component_field_to_po(
    component_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apply a component field update to matching components (same name) on
    selected or all styles on the PO. Suppliers can apply rename / scope-add
    operations on their own factory's siblings but can't push sample-lifecycle
    field changes through this endpoint."""
    body = await request.json()
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == component.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    assert_supplier_can_access(order, current_user)
    # Suppliers can't push sample-lifecycle field updates through here either
    # — same rule as the single-component PUT.
    if _is_supplier(current_user):
        forbidden = [k for k in body if k in SUPPLIER_FORBIDDEN_FIELDS]
        if forbidden:
            raise HTTPException(
                status_code=403,
                detail=f"Suppliers can't apply sample lifecycle fields to siblings: {forbidden}.",
            )
    # If order_ids provided, scope to those; otherwise all on PO.
    # Factory-scope the sibling list so suppliers can't reach other
    # factories' orders via a stale id list.
    # Resolve which instances this update reaches.
    #
    # `order_ids` is now an optional NARROWING filter, not the source of the
    # sibling set. It used to be the other way round: with no order_ids the
    # endpoint fell back to "every style on this PO", so the caller had to
    # look up the link and hand over the full list to get cross-PO reach.
    # One caller did (ComponentEditModal), one didn't (the order drawer) —
    # so the same "apply to all" button updated 3 styles from /components and
    # silently only 2 from the drawer, with the toast reporting 2 as if that
    # were the whole set.
    #
    # The link lives in the database, so the database resolves it. A caller
    # can still pass order_ids to apply to a subset, but it can no longer
    # accidentally shrink the scope by omitting them.
    selected_ids = body.pop("order_ids", None)

    match_q = db.query(OrderComponent).join(
        PurchaseOrder, PurchaseOrder.id == OrderComponent.order_id
    )
    if component.canonical_id is not None:
        # Linked instances — the add-event group, wherever its styles live.
        match_q = match_q.filter(OrderComponent.canonical_id == component.canonical_id)
    else:
        # Legacy rows with no link: fall back to same-name-same-type, and keep
        # the PO bound, because a bare name match across the whole book would
        # hit unrelated components that merely share a name.
        match_q = match_q.filter(
            OrderComponent.name == component.name,
            OrderComponent.sample_type == component.sample_type,
            PurchaseOrder.po_number == order.po_number,
        )
    if selected_ids:
        match_q = match_q.filter(OrderComponent.order_id.in_(selected_ids))
    # Supplier scoping still applies on top — a supplier's apply never reaches
    # another factory's styles even if they share a canonical.
    match_q = apply_supplier_filter(match_q, current_user)
    # Local import, matching this module's existing pattern for pulling
    # from routers.submissions (avoids a load-order cycle).
    from routers.submissions import reconcile_and_sync
    matching = match_q.all()
    # Each matching sibling lives on its own order; reconcile_and_sync needs
    # that order to find the right submission rows. One query rather than a
    # lookup per sibling.
    sibling_orders_by_id = {
        o.id: o for o in db.query(PurchaseOrder).filter(
            PurchaseOrder.id.in_({c.order_id for c in matching} or {-1})
        ).all()
    }
    # Remaining keys in body are the fields to update
    allowed_fields = {
        'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
        'strike_off_status', 'strike_off_received', 'strike_off_approved',
        'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
        'label_status', 'label_received', 'label_approved',
        'name',
    }
    date_fields = {
        'fit_sample_received', 'fit_sample_approved',
        'strike_off_received', 'strike_off_approved',
        'lab_dip_received', 'lab_dip_approved',
        'label_received', 'label_approved',
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
        # Was a bare reconcile, so pushing APPROVED to siblings updated their
        # columns and left every sibling's open attempt dangling — each read
        # approved while still counting as in-rework on /resubmissions.
        # Each sibling belongs to its OWN order, so the submission lookup has
        # to use that order's id, not the one the request came in on.
        reconcile_and_sync(
            db,
            sibling_orders_by_id.get(comp.order_id, order),
            comp,
            SAMPLE_PREFIXES_COMPONENT,
            current_user.id,
            skip_prefixes=user_touched_status,
        )
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
    """Get all styles on a PO that have a component with a given name.

    Supplier-scoped — its sibling styles-with-canonical already filtered,
    this one didn't, so a supplier could read style codes, descriptions and
    colours for any PO by guessing a PO number."""
    # One join rather than a per-style component lookup. A PO is usually
    # only a handful of styles so this was never the bottleneck the orders
    # list was, but it's the same shape and costs nothing to collapse.
    rows = (
        db.query(PurchaseOrder, OrderComponent)
        .join(OrderComponent, OrderComponent.order_id == PurchaseOrder.id)
        .filter(
            PurchaseOrder.po_number == po_number,
            OrderComponent.name == component_name,
            *supplier_filter_clause(current_user),
        )
        .order_by(PurchaseOrder.style_code)
        .all()
    )
    # A style could carry two components with the same name but different
    # sample types (e.g. POCKET as both a strike-off and a lab dip). The
    # previous .first() silently kept one; keep that behaviour so callers
    # still get one row per style.
    seen: set[int] = set()
    results = []
    for o, comp in rows:
        if o.id in seen:
            continue
        seen.add(o.id)
        results.append({
            "id": o.id,
            "style_code": o.style_code or "",
            "description": o.description or "",
            "colour": o.colour or "",
            "component_id": comp.id,
        })
    return {"styles": results}


@router.get("/api/components/styles-with-canonical")
async def get_styles_with_canonical(
    canonical_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every style with a component instance linked to this canonical, joined
    with basic order metadata so the caller can render a PO-grouped picker.
    Supplier scope respected."""
    supplier_clauses = supplier_filter_clause(current_user)
    query = (
        db.query(OrderComponent, PurchaseOrder)
        .join(PurchaseOrder, PurchaseOrder.id == OrderComponent.order_id)
        .filter(OrderComponent.canonical_id == canonical_id)
    )
    if supplier_clauses:
        query = query.filter(*supplier_clauses)
    results = []
    for oc, po in query.all():
        results.append({
            "id": po.id,
            "po_number": po.po_number or "",
            "customer": po.customer or "",
            "style_code": po.style_code or "",
            "description": po.description or "",
            "colour": po.colour or "",
            "component_id": oc.id,
        })
    return {"styles": results}


# ─────────────────────────────────────────────────────────────────────────
# Component library (canonical entries) — the /components page
# ─────────────────────────────────────────────────────────────────────────

def _status_field_for(prefix: str, suffix: str):
    """Return the OrderComponent column for the given sample-type prefix +
    field suffix. Prefix is 'strike_off' | 'lab_dip' | 'label', suffix is
    'status' | 'received' | 'approved'."""
    return getattr(OrderComponent, f"{prefix}_{suffix}")


def _instance_status_case():
    """SQL CASE that picks the right status field based on the instance's
    sample_type, so we can roll up across canonicals."""
    return case(
        (OrderComponent.sample_type == 'strike_off', OrderComponent.strike_off_status),
        (OrderComponent.sample_type == 'lab_dip', OrderComponent.lab_dip_status),
        (OrderComponent.sample_type == 'label', OrderComponent.label_status),
        else_=None,
    )


@router.get("/api/components/library")
async def list_component_library(
    q: Optional[str] = Query(None),
    sample_type: Optional[str] = Query(None),
    include_blank: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List canonical components in the library with rollup counts.

    For supplier users, the list is naturally scoped: only canonicals with
    at least one instance on a PO for their factory are returned.
    """
    supplier_clauses = supplier_filter_clause(current_user)

    # Base rollup aggregate per canonical, joining instances + POs (needed
    # for supplier scoping). LEFT JOIN so blank canonicals still show.
    status_case = _instance_status_case()
    approved_case = case((func.upper(status_case) == 'APPROVED', 1), else_=0)
    received_case = case((func.upper(status_case) == 'RECEIVED', 1), else_=0)
    outstanding_case = case((func.upper(status_case) == 'OUTSTANDING', 1), else_=0)

    query = (
        db.query(
            Component.id,
            Component.name,
            Component.sample_type,
            Component.description,
            Component.colour,
            Component.position,
            Component.spec_url,
            Component.supplier_notes,
            Component.created_at,
            Component.updated_at,
            func.count(OrderComponent.id).label('styles_count'),
            func.count(func.distinct(PurchaseOrder.customer)).label('customers_count'),
            func.sum(approved_case).label('approved_count'),
            func.sum(received_case).label('received_count'),
            func.sum(outstanding_case).label('outstanding_count'),
        )
        .outerjoin(OrderComponent, OrderComponent.canonical_id == Component.id)
        .outerjoin(PurchaseOrder, PurchaseOrder.id == OrderComponent.order_id)
        .group_by(Component.id)
    )

    if sample_type:
        query = query.filter(Component.sample_type == sample_type)
    if q:
        like = f"%{q.strip()}%"
        # Match on canonical identity fields OR on style_code / po_number /
        # customer_style_code of any linked instance. The style/PO branch is
        # a subquery so it doesn't multiply rows in the outer group-by.
        style_po_match_ids = (
            db.query(OrderComponent.canonical_id)
            .join(PurchaseOrder, PurchaseOrder.id == OrderComponent.order_id)
            .filter(OrderComponent.canonical_id.isnot(None))
            .filter(
                (PurchaseOrder.style_code.ilike(like))
                | (PurchaseOrder.po_number.ilike(like))
                | (PurchaseOrder.customer_style_code.ilike(like))
            )
            .distinct()
            .subquery()
        )
        query = query.filter(
            (Component.name.ilike(like))
            | (Component.description.ilike(like))
            | (Component.colour.ilike(like))
            | (Component.supplier_notes.ilike(like))
            | (Component.id.in_(db.query(style_po_match_ids)))
        )

    # Supplier scoping: canonical must have at least one instance on their
    # factory. We enforce this via HAVING count > 0 on the PO-filtered join.
    if supplier_clauses:
        # Re-express as: at least one instance whose PO matches the factory.
        # Using a subquery for correctness (LEFT JOIN + filter breaks blanks).
        allowed_ids_subq = (
            db.query(OrderComponent.canonical_id)
            .join(PurchaseOrder, PurchaseOrder.id == OrderComponent.order_id)
            .filter(*supplier_clauses)
            .filter(OrderComponent.canonical_id.isnot(None))
            .distinct()
            .subquery()
        )
        query = query.filter(Component.id.in_(db.query(allowed_ids_subq)))

    rows = query.order_by(Component.name).all()

    results = []
    for r in rows:
        styles_count = int(r.styles_count or 0)
        if not include_blank and styles_count == 0:
            continue
        results.append({
            "id": r.id,
            "name": r.name,
            "sample_type": r.sample_type,
            "description": r.description,
            "colour": r.colour,
            "position": _read_positions_raw(r.position),
            "spec_url": r.spec_url,
            "supplier_notes": r.supplier_notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "styles_count": styles_count,
            "customers_count": int(r.customers_count or 0),
            "approved_count": int(r.approved_count or 0),
            "received_count": int(r.received_count or 0),
            "outstanding_count": int(r.outstanding_count or 0),
            "has_spec": bool(r.spec_url),
            "is_blank": styles_count == 0,
        })
    return {"components": results}


@router.get("/api/components/library/{canonical_id}")
async def get_component_library_entry(
    canonical_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get one canonical + all instances using it. Instance list is scoped
    to the supplier's factory when caller is a supplier."""
    canonical = db.query(Component).filter(Component.id == canonical_id).first()
    if not canonical:
        raise HTTPException(status_code=404, detail="Component not found")

    supplier_clauses = supplier_filter_clause(current_user)

    instance_query = (
        db.query(OrderComponent, PurchaseOrder)
        .join(PurchaseOrder, PurchaseOrder.id == OrderComponent.order_id)
        .filter(OrderComponent.canonical_id == canonical_id)
    )
    if supplier_clauses:
        instance_query = instance_query.filter(*supplier_clauses)

    instances_data = []
    for oc, po in instance_query.all():
        prefix = oc.sample_type  # 'strike_off' | 'lab_dip' | 'label'
        status_val = getattr(oc, f"{prefix}_status", None)
        received_val = getattr(oc, f"{prefix}_received", None)
        approved_val = getattr(oc, f"{prefix}_approved", None)
        instances_data.append({
            "instance_id": oc.id,
            "order_id": po.id,
            "po_number": po.po_number,
            "customer": po.customer,
            "customer_po_number": po.customer_po_number,
            "style_code": po.style_code,
            "customer_style_code": po.customer_style_code,
            "description": po.description,
            "colour": po.colour,
            "status": status_val,
            "received": received_val.isoformat() if received_val else None,
            "approved": approved_val.isoformat() if approved_val else None,
        })

    # Supplier accessing a canonical with no instances on their factory: 404
    if supplier_clauses and not instances_data:
        raise HTTPException(status_code=404, detail="Component not found")

    return {
        "id": canonical.id,
        "name": canonical.name,
        "sample_type": canonical.sample_type,
        "description": canonical.description,
        "colour": canonical.colour,
        "position": _read_positions(canonical),
        "spec_url": canonical.spec_url,
        "supplier_notes": canonical.supplier_notes,
        "created_at": canonical.created_at.isoformat() if canonical.created_at else None,
        "updated_at": canonical.updated_at.isoformat() if canonical.updated_at else None,
        "instances": instances_data,
    }


VALID_POSITIONS = {
    "CHEST POSITION – CENTRAL",
    "CHEST POSITION – LEFT AS WORN",
    "CHEST POSITION – RIGHT AS WORN",
    "BACK",
    "BACK NECK",
    "HEM",
    "LEFT SLEEVE AS WORN",
    "RIGHT SLEEVE AS WORN",
}


def _parse_positions_payload(raw, sample_type: str):
    """Normalise a position payload to a JSON string (list of validated
    values) or None. Accepts:
      - list/tuple of strings
      - single string (wrapped into a one-item list)
      - null / empty / missing (returns None)

    Raises HTTPException on unknown values or when set on a non-strike-off.
    """
    import json as _json
    if raw is None:
        return None
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return None
        raw = [s]
    if not isinstance(raw, (list, tuple)):
        raise HTTPException(status_code=400, detail="position must be a list of strings")
    normalised = []
    for v in raw:
        if not isinstance(v, str):
            raise HTTPException(status_code=400, detail="position entries must be strings")
        v = v.strip().upper()
        if not v:
            continue
        if v not in VALID_POSITIONS:
            raise HTTPException(status_code=400, detail=f"position '{v}' is not in the allowed set")
        if v not in normalised:
            normalised.append(v)
    if not normalised:
        return None
    if sample_type != 'strike_off':
        raise HTTPException(status_code=400, detail="position is only valid for strike-off components")
    return _json.dumps(normalised)


def _read_positions_raw(raw) -> list[str]:
    """Parse a raw position column value into a list. Tolerates legacy
    single-string rows and returns [] for null/empty."""
    import json as _json
    if not raw:
        return []
    if not isinstance(raw, str):
        return []
    s = raw.strip()
    if not s:
        return []
    if s.startswith('['):
        try:
            parsed = _json.loads(s)
            if isinstance(parsed, list):
                return [str(v) for v in parsed if v]
        except Exception:
            pass
    # Legacy single-string row.
    return [s]


def _read_positions(canonical) -> list[str]:
    """Convenience wrapper for a Component ORM object."""
    return _read_positions_raw(canonical.position)


@router.post("/api/components/library", status_code=201)
async def create_component_library_entry(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new canonical component. Identity only — no instances yet.

    Body: {name, sample_type, colour, description?, position?, spec_url?, supplier_notes?}

    Names are UPPERCASED before storage so casing drift doesn't create duplicates.
    Colour is required at create time. Position is strike-off only and
    must be one of FRONT | BACK | LEFT | RIGHT.
    """
    name = (data.get("name") or "").strip().upper()
    sample_type = data.get("sample_type")
    colour = (data.get("colour") or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if sample_type not in ("strike_off", "lab_dip", "label"):
        raise HTTPException(status_code=400, detail="sample_type must be strike_off, lab_dip, or label")
    # Colour is mandatory for strike-offs and lab dips (that's how the sample
    # is identified downstream). Labels don't need one.
    if sample_type in ("strike_off", "lab_dip") and not colour:
        raise HTTPException(status_code=400, detail="colour is required for strike-off and lab-dip components")

    position_json = _parse_positions_payload(data.get("position"), sample_type)

    canonical = Component(
        name=name,
        sample_type=sample_type,
        description=(data.get("description") or None),
        colour=colour,
        position=position_json,
        spec_url=(data.get("spec_url") or None),
        supplier_notes=(data.get("supplier_notes") or None),
    )
    db.add(canonical)
    db.commit()
    db.refresh(canonical)
    return {
        "id": canonical.id,
        "name": canonical.name,
        "sample_type": canonical.sample_type,
        "description": canonical.description,
        "colour": canonical.colour,
        "position": _read_positions(canonical),
        "spec_url": canonical.spec_url,
        "supplier_notes": canonical.supplier_notes,
    }


@router.post("/api/components/library/{canonical_id}/apply")
async def apply_component_library_entry(
    canonical_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a canonical component to N styles with a starting state.

    Body: {
        "order_ids": [1, 2, 3],
        "starting_state": "blank" | "copy" | "approved",
        "peer_instance_id": 42   // required when starting_state = "copy"
    }

    - blank:    creates instances with no dates, no status.
    - copy:     clones state (status, received, approved) AND sample_submissions
                history from peer_instance_id onto each new instance.
    - approved: marks each new instance APPROVED with today's date. Sourcelab-only.

    Skips orders that already have an instance linked to this canonical.
    Supplier orders outside their factory scope are silently dropped.
    """
    canonical = db.query(Component).filter(Component.id == canonical_id).first()
    if not canonical:
        raise HTTPException(status_code=404, detail="Canonical component not found")

    order_ids = data.get("order_ids") or []
    starting_state = data.get("starting_state") or "blank"
    peer_instance_id = data.get("peer_instance_id")

    if not isinstance(order_ids, list) or not order_ids:
        raise HTTPException(status_code=400, detail="At least one order id is required")
    if starting_state not in ("blank", "copy", "approved"):
        raise HTTPException(status_code=400, detail="starting_state must be blank, copy, or approved")
    if starting_state == "copy" and not peer_instance_id:
        raise HTTPException(status_code=400, detail="peer_instance_id is required when starting_state is 'copy'")
    if starting_state == "approved" and _is_supplier(current_user):
        raise HTTPException(status_code=403, detail="Suppliers can't mark new instances Approved. Use Blank or Copy from another style.")

    # Resolve peer instance for copy
    peer = None
    if starting_state == "copy":
        peer = db.query(OrderComponent).filter(OrderComponent.id == peer_instance_id).first()
        if not peer:
            raise HTTPException(status_code=404, detail="Peer instance not found")
        if peer.canonical_id != canonical_id:
            raise HTTPException(status_code=400, detail="Peer instance is not linked to this canonical component")

    # Filter target orders through supplier scope
    target_orders_q = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids))
    target_orders_q = apply_supplier_filter(target_orders_q, current_user)
    target_orders = target_orders_q.all()
    if not target_orders:
        raise HTTPException(status_code=404, detail="No matching orders found for this user")

    prefix = canonical.sample_type
    role_str = str(current_user.role.value if hasattr(current_user.role, "value") else current_user.role).lower()
    source_tag = "Supplier" if role_str == "supplier" else "Sourcelab"

    # Prepare starting-state field values
    copy_status = None
    copy_received = None
    copy_approved = None
    if starting_state == "copy" and peer is not None:
        copy_status = getattr(peer, f"{prefix}_status")
        copy_received = getattr(peer, f"{prefix}_received")
        copy_approved = getattr(peer, f"{prefix}_approved")
    elif starting_state == "approved":
        copy_status = "APPROVED"
        copy_approved = datetime.utcnow()

    # Fetch peer submissions once for copy path
    peer_submissions = []
    if starting_state == "copy" and peer is not None:
        peer_submissions = db.query(SampleSubmission).filter(
            SampleSubmission.component_id == peer.id,
        ).order_by(SampleSubmission.attempt_no).all()

    created_ids = []
    skipped_orders = []
    for o in target_orders:
        # Skip if this style already has an instance of this canonical
        existing = db.query(OrderComponent).filter(
            OrderComponent.order_id == o.id,
            OrderComponent.canonical_id == canonical_id,
        ).first()
        if existing:
            skipped_orders.append(o.id)
            continue

        new_inst = OrderComponent(
            order_id=o.id,
            canonical_id=canonical_id,
            name=canonical.name,
            sample_type=canonical.sample_type,
        )
        if starting_state != "blank":
            setattr(new_inst, f"{prefix}_status", copy_status)
            setattr(new_inst, f"{prefix}_received", copy_received)
            setattr(new_inst, f"{prefix}_approved", copy_approved)
        db.add(new_inst)
        db.flush()  # get id

        # Copy sample submission history if applicable
        if starting_state == "copy":
            for sub in peer_submissions:
                db.add(SampleSubmission(
                    order_id=o.id,
                    component_id=new_inst.id,
                    sample_type=sub.sample_type,
                    attempt_no=sub.attempt_no,
                    requested_at=sub.requested_at,
                    submitted_at=sub.submitted_at,
                    resolved_at=sub.resolved_at,
                    outcome=sub.outcome,
                    reason=sub.reason,
                    notes=sub.notes,
                    photo_url=sub.photo_url,
                ))

        # Activity feed line so the addition is visible in the feed.
        note_bits = []
        if starting_state == "copy" and peer is not None:
            peer_order = db.query(PurchaseOrder).filter(PurchaseOrder.id == peer.order_id).first()
            peer_style = peer_order.style_code if peer_order else f"style {peer.order_id}"
            note_bits.append(f"copied from {peer_style} ({copy_status or 'blank'})")
        elif starting_state == "approved":
            note_bits.append("marked approved on create")
        db.add(DateChangeHistory(
            po_id=o.id,
            user_id=current_user.id,
            field_name=f"component:{canonical.name}",
            old_value=None,
            new_value=" · ".join(note_bits) or "added blank",
            source=source_tag,
            component_name=canonical.name,
        ))

        created_ids.append(new_inst.id)

    db.commit()
    return {
        "success": True,
        "canonical_id": canonical_id,
        "created_count": len(created_ids),
        "created_instance_ids": created_ids,
        "skipped_order_ids": skipped_orders,
    }


@router.post("/api/components/library/instances/bulk-edit")
async def bulk_edit_library_instances(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-update sample lifecycle across a set of instances that may span
    canonicals, POs, and sample types.

    Body: {
        "instance_ids": [1, 2, 3],
        "status":   "APPROVED" | "RECEIVED" | "OUTSTANDING" | null   (optional),
        "received": "2026-07-05" | null                              (optional),
        "approved": "2026-07-05" | null                              (optional)
    }

    Each field is applied to every instance, using the column that matches
    that instance's own sample_type (strike_off / lab_dip / label).
    At least one of status/received/approved must be supplied.

    Suppliers can't call this — sample lifecycle stays Sourcelab-owned.
    """
    if _is_supplier(current_user):
        raise HTTPException(
            status_code=403,
            detail="Suppliers can't bulk-edit sample fields. Sample lifecycle is managed by Source Lab.",
        )

    instance_ids = data.get("instance_ids") or []
    if not instance_ids or not isinstance(instance_ids, list):
        raise HTTPException(status_code=400, detail="instance_ids must be a non-empty list")

    # Which lifecycle fields are being set. Missing key = leave alone.
    updates = {}
    for field_key in ("status", "received", "approved"):
        if field_key in data:
            updates[field_key] = data[field_key]
    if not updates:
        raise HTTPException(status_code=400, detail="At least one of status/received/approved must be provided")

    ALLOWED_STATUSES = {"APPROVED", "RECEIVED", "OUTSTANDING", "NOT REQUIRED", "REJECTED", None}
    if "status" in updates and updates["status"] not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status '{updates['status']}'")

    # REJECTED is a full lifecycle event (closes current attempt, opens the
    # next one, writes a DateChangeHistory entry) so it needs a reason. We
    # dispatch to _reject_one_target per instance instead of just flipping
    # the status column.
    reject_reason = None
    reject_notes = None
    if updates.get("status") == "REJECTED":
        from models import SAMPLE_REJECT_REASONS as _REASONS
        reject_reason = (data.get("reason") or "").strip()
        if not reject_reason:
            raise HTTPException(status_code=400, detail="reason is required when status is REJECTED")
        valid_codes = {code for code, _ in _REASONS}
        if reject_reason not in valid_codes:
            raise HTTPException(status_code=400, detail=f"Unknown rejection reason '{reject_reason}'")
        reject_notes = (data.get("notes") or None)

    # Parse dates once
    for date_key in ("received", "approved"):
        val = updates.get(date_key)
        if isinstance(val, str) and val:
            try:
                updates[date_key] = datetime.fromisoformat(val.replace('Z', '+00:00'))
            except ValueError:
                try:
                    updates[date_key] = datetime.strptime(val, '%Y-%m-%d')
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"Could not parse {date_key} date '{val}'")

    rows = db.query(OrderComponent).filter(OrderComponent.id.in_(instance_ids)).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No matching instances found")

    order_ids = list({c.order_id for c in rows})
    orders_by_id = {o.id: o for o in db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()}

    from routers.submissions import (
        sync_submission_on_status_change,
        STATUS_FIELD_TO_SAMPLE_TYPE,
        _reject_one_target,
    )

    # Component sample_type (long) → submissions sample_type (short) used by
    # _reject_one_target and the SAMPLE_FIELD_MAP downstream.
    LONG_TO_SHORT_SAMPLE_TYPE = {'strike_off': 'strike', 'lab_dip': 'lab', 'label': 'label'}

    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    source_tag = "Sourcelab"

    changed_ids = []
    unchanged_ids = []
    field_key_to_suffix = {"status": "status", "received": "received", "approved": "approved"}

    is_rejection = updates.get("status") == "REJECTED"
    now = datetime.utcnow()

    for comp in rows:
        prefix = comp.sample_type  # 'strike_off' | 'lab_dip' | 'label'
        if prefix not in SAMPLE_PREFIXES_COMPONENT:
            unchanged_ids.append(comp.id)
            continue

        # REJECTED goes through the full attempt-lifecycle path so it opens
        # v+1, clears dates, and writes the same history/submission rows as
        # a single-instance rejection.
        if is_rejection:
            short_type = LONG_TO_SHORT_SAMPLE_TYPE.get(prefix)
            order = orders_by_id.get(comp.order_id)
            if not short_type or order is None:
                unchanged_ids.append(comp.id)
                continue
            _reject_one_target(
                db, order, comp, short_type,
                reject_reason, reject_notes, None,
                current_user.id, now,
            )
            comp.updated_at = now
            changed_ids.append(comp.id)
            continue

        touched_status_here = False
        row_changed = False
        for field_key, new_value in updates.items():
            column_name = f"{prefix}_{field_key_to_suffix[field_key]}"
            old_value = getattr(comp, column_name, None)
            if old_value == new_value:
                continue
            db.add(DateChangeHistory(
                po_id=comp.order_id,
                user_id=current_user.id,
                field_name=column_name,
                old_value=str(old_value) if old_value is not None else None,
                new_value=str(new_value) if new_value is not None else None,
                source=source_tag,
                component_name=comp.name,
            ))
            setattr(comp, column_name, new_value)
            row_changed = True
            if field_key == "status":
                touched_status_here = True
                order = orders_by_id.get(comp.order_id)
                status_field = f"{prefix}_status"
                if order is not None and status_field in STATUS_FIELD_TO_SAMPLE_TYPE and new_value == "APPROVED":
                    sync_submission_on_status_change(db, order, comp, status_field, new_value, current_user.id)

        if row_changed:
            comp.updated_at = datetime.utcnow()
            reconcile_sample_status(
                comp,
                SAMPLE_PREFIXES_COMPONENT,
                skip_prefixes=[prefix] if touched_status_here else [],
            )
            changed_ids.append(comp.id)
        else:
            unchanged_ids.append(comp.id)

    db.commit()
    return {
        "success": True,
        "changed_count": len(changed_ids),
        "unchanged_count": len(unchanged_ids),
        "changed_ids": changed_ids,
    }


@router.patch("/api/components/library/{canonical_id}")
async def update_component_library_entry(
    canonical_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update canonical identity fields (name, description, colour, spec_url,
    supplier_notes). Change propagates to every instance by definition.

    Suppliers can call this only when the canonical has an instance on one
    of their POs — same 'natural scoping' as the list/get endpoints.
    """
    canonical = db.query(Component).filter(Component.id == canonical_id).first()
    if not canonical:
        raise HTTPException(status_code=404, detail="Component not found")

    supplier_clauses = supplier_filter_clause(current_user)
    if supplier_clauses:
        has_scoped_instance = (
            db.query(OrderComponent)
            .join(PurchaseOrder, PurchaseOrder.id == OrderComponent.order_id)
            .filter(OrderComponent.canonical_id == canonical_id)
            .filter(*supplier_clauses)
            .first()
        )
        if not has_scoped_instance:
            raise HTTPException(status_code=404, detail="Component not found")

    EDITABLE_FIELDS = {'name', 'description', 'colour', 'position', 'spec_url', 'supplier_notes'}
    # Normalise: name goes uppercase, position goes JSON-array + validated
    if 'name' in data and isinstance(data['name'], str):
        data['name'] = data['name'].strip().upper() or None
    if 'position' in data:
        data['position'] = _parse_positions_payload(data['position'], canonical.sample_type)

    changed = {}
    for field, value in data.items():
        if field not in EDITABLE_FIELDS:
            continue
        current_val = getattr(canonical, field)
        if value != current_val:
            setattr(canonical, field, value)
            changed[field] = {"from": current_val, "to": value}

    if changed:
        canonical.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(canonical)

    return {
        "id": canonical.id,
        "name": canonical.name,
        "sample_type": canonical.sample_type,
        "description": canonical.description,
        "colour": canonical.colour,
        "position": _read_positions(canonical),
        "spec_url": canonical.spec_url,
        "supplier_notes": canonical.supplier_notes,
        "changed": changed,
    }


@router.delete("/api/components/library/{canonical_id}")
async def delete_component_library_entry(
    canonical_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_full_internal_user),
):
    """Wholesale-delete a canonical library entry: removes every OrderComponent
    instance linked to it (SampleSubmissions cascade off order_components) and
    then the canonical row itself.

    Internal / admin only. Suppliers can delete individual instances via
    DELETE /api/components/{component_id} but the wholesale delete is a
    library-cleanup action that shouldn't be reachable from the supplier
    scope.

    Note on the FK: OrderComponent.canonical_id is `ondelete=SET NULL`, so
    dropping the Component row on its own would orphan the instances rather
    than remove them. We explicitly delete the instances first (which cascades
    to sample_submissions via ondelete=CASCADE on order_components.id) so the
    end state is: no canonical, no instances, no submissions."""
    canonical = db.query(Component).filter(Component.id == canonical_id).first()
    if not canonical:
        raise HTTPException(status_code=404, detail="Component not found")

    # Snapshot rollup counts before we start deleting for the response toast.
    instances = (
        db.query(OrderComponent)
        .filter(OrderComponent.canonical_id == canonical_id)
        .all()
    )
    instance_count = len(instances)
    style_count = len({inst.order_id for inst in instances})

    for inst in instances:
        db.delete(inst)

    canonical_name = canonical.name
    db.delete(canonical)
    db.commit()

    return {
        "success": True,
        "canonical_name": canonical_name,
        "instances_deleted": instance_count,
        "styles_affected": style_count,
    }
