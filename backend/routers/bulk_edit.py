"""Bulk field editing — preview first, then write.

Routed under /api/bulk-edit/ rather than /api/orders/ on purpose: orders.py
owns /api/orders/{order_id}, and a literal segment sitting next to a typed
path parameter only resolves correctly if the literal route is registered
first. Depending on include_router order for correctness is a trap — the
first version of this shipped as /api/orders/bulk-editable-fields and was
parsed as order_id="bulk-editable-fields".

Every call is a dry run unless it explicitly says otherwise, so the UI can show
"this changes X on 14 rows, 9 of which already have a value" before anything is
committed. Identity fields need a second flag on top of that.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, DateChangeHistory
from auth import get_current_user, get_current_full_internal_user
from supplier_access import assert_supplier_can_access
import bulk_fields

router = APIRouter()

# A single bulk edit is a person fixing a batch, not a migration. Anything
# larger is almost certainly a select-all that got away from someone.
MAX_ROWS = 500


def _display(value) -> str:
    if value is None:
        return ''
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d')
    return str(value)


@router.get("/api/bulk-edit/fields")
async def list_bulk_editable_fields(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db),
):
    """The fields the UI is allowed to offer, with their types and gating.

    Served from the registry rather than duplicated in the frontend so the
    allowlist has exactly one definition.
    """
    return {
        'fields': [
            {
                'key': f['key'], 'label': f['label'], 'type': f['type'],
                'group': f['group'], 'identity': f['identity'], 'choices': f['choices'],
            }
            for f in bulk_fields.BULK_EDITABLE_FIELDS
        ],
        'max_rows': MAX_ROWS,
    }


@router.post("/api/bulk-edit/current")
async def current_values(
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db),
):
    """What is currently set on the selection, for one field.

    Shown the moment a field is picked, before any value is typed. Two reads
    matter and they need different shapes: "are these all the same already?"
    is answered by the distinct-value tally, and "which style has what?" by
    the per-PO breakdown. A selection is usually one PO but can span several,
    so the breakdown is always grouped by PO rather than flattened.
    """
    order_ids = data.get('order_ids') or []
    field_name = (data.get('field_name') or '').strip()

    if not order_ids:
        raise HTTPException(status_code=400, detail="Pick some rows first")
    spec = bulk_fields.BULK_FIELD_BY_KEY.get(field_name)
    if spec is None:
        raise HTTPException(status_code=400, detail=f"'{field_name}' can't be bulk edited")

    orders = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()
    for o in orders:
        assert_supplier_can_access(o, current_user)

    tally = {}
    by_po = {}
    for o in orders:
        val = _display(getattr(o, field_name, None))
        tally[val] = tally.get(val, 0) + 1
        key = o.po_number or '—'
        g = by_po.setdefault(key, {
            'po_number': key, 'customer': o.customer, 'factory': o.factory, 'rows': [],
        })
        g['rows'].append({
            'order_id': o.id, 'style_code': o.style_code,
            'description': o.description, 'value': val,
        })

    distinct = sorted(tally.items(), key=lambda kv: (-kv[1], kv[0]))
    groups = sorted(by_po.values(), key=lambda g: -len(g['rows']))

    return {
        'field': {'key': spec['key'], 'label': spec['label'], 'type': spec['type'],
                  'identity': spec['identity']},
        'total': len(orders),
        'po_count': len(groups),
        # True when every selected style already carries the same value —
        # worth saying plainly, because it is the common case and it tells
        # the user a bulk edit here is a real change, not a tidy-up.
        'uniform': len(distinct) == 1,
        'distinct': [{'value': v, 'count': n} for v, n in distinct],
        'by_po': groups,
    }


@router.post("/api/bulk-edit/apply")
async def bulk_edit_field(
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db),
):
    """Set one field across many orders.

    Body: order_ids, field_name, new_value, apply (default false),
          confirm_identity (required for identity fields).

    Defaults to a preview. The caller has to ask for the write, which means a
    mistyped request changes nothing.
    """
    order_ids = data.get('order_ids') or []
    field_name = (data.get('field_name') or '').strip()
    apply_changes = bool(data.get('apply'))

    if not order_ids:
        raise HTTPException(status_code=400, detail="Pick some rows first")
    if len(order_ids) > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"That's {len(order_ids)} rows. Bulk edit is capped at {MAX_ROWS} — "
                   f"narrow the selection, or use import for a change that size.")

    # The allowlist is the whole point: an unknown field name is refused
    # outright rather than reflected onto the model.
    spec = bulk_fields.BULK_FIELD_BY_KEY.get(field_name)
    if spec is None:
        raise HTTPException(status_code=400, detail=f"'{field_name}' can't be bulk edited")

    if spec['identity'] and not data.get('confirm_identity'):
        raise HTTPException(
            status_code=400,
            detail=f"{spec['label']} is how rows are matched to each other. "
                   f"Changing it in bulk needs explicit confirmation.")

    value, error = bulk_fields.validate_value(spec, data.get('new_value'))
    if error:
        raise HTTPException(status_code=400, detail=error)

    orders = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()
    if not orders:
        raise HTTPException(status_code=404, detail="None of those rows exist any more")

    # Supplier scoping, per row. A supplier reaching this endpoint at all would
    # already have failed the role check, but the assertion costs nothing and
    # keeps the guarantee local to the write.
    for o in orders:
        assert_supplier_can_access(o, current_user)

    new_display = _display(value)
    changing, unchanged, overwriting = [], 0, 0
    for o in orders:
        current = getattr(o, field_name, None)
        if _display(current) == new_display:
            unchanged += 1
            continue
        if current not in (None, ''):
            overwriting += 1
        changing.append((o, current))

    preview = {
        'field': {'key': spec['key'], 'label': spec['label'], 'type': spec['type'],
                  'identity': spec['identity']},
        'new_value': new_display,
        'selected': len(orders),
        'will_change': len(changing),
        'already_correct': unchanged,
        'overwriting': overwriting,
        'examples': [
            {
                'order_id': o.id,
                'po_number': o.po_number,
                'style_code': o.style_code,
                'from': _display(current),
                'to': new_display,
            }
            for o, current in changing[:8]
        ],
    }

    if not apply_changes:
        preview['applied'] = False
        return preview

    source = 'Supplier' if getattr(current_user, 'role', None) == 'supplier' else 'Sourcelab'
    for o, current in changing:
        setattr(o, field_name, value)
        db.add(DateChangeHistory(
            po_id=o.id,
            user_id=current_user.id,
            field_name=field_name,
            old_value=_display(current),
            new_value=new_display,
            source=source,
        ))
    db.commit()

    preview['applied'] = True
    preview['updated'] = len(changing)
    return preview
