"""Sample submission endpoints — track v1/v2/v3 attempts per sample area, per component.

Rows in sample_submissions are created lazily on the first rejection. Before any
rejection, the legacy status/date columns on PurchaseOrder / OrderComponent are
authoritative and the sample is implicitly v1. On rejection we backfill a v1 row
mirroring the column state, close it as REJECTED, and open a fresh v2 row.
"""
from datetime import datetime
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, Integer, case
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, PurchaseOrder, OrderComponent, SampleSubmission,
    SAMPLE_REJECT_REASONS, SAMPLE_TYPES, DateChangeHistory,
)
from auth import get_current_internal_user
from sample_helpers import reconcile_sample_status


router = APIRouter()

# Map sample_type key → the status/received/approved columns on the target table.
# 'target' is either 'component' (OrderComponent) or 'order' (PurchaseOrder).
SAMPLE_FIELD_MAP = {
    'fit':    {'target': 'component', 'status': 'fit_sample_status',    'received': 'fit_sample_received',    'approved': 'fit_sample_approved'},
    'strike': {'target': 'component', 'status': 'strike_off_status',    'received': 'strike_off_received',    'approved': 'strike_off_approved'},
    'lab':    {'target': 'component', 'status': 'lab_dip_status',       'received': 'lab_dip_received',       'approved': 'lab_dip_approved'},
    'label':  {'target': 'component', 'status': 'label_status',         'received': 'label_received',         'approved': 'label_approved'},
    'pps':    {'target': 'order',     'status': 'pps_status',           'received': 'pps_received',           'approved': 'pps_approved'},
}


class RejectRequest(BaseModel):
    order_id: int
    component_id: Optional[int] = None  # null for order-level samples (PPS, or fit/strike/lab when the order has no components)
    sample_type: Literal['fit', 'strike', 'lab', 'pps', 'label']
    reason: str = Field(..., min_length=1, description="Reason code from SAMPLE_REJECT_REASONS")
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    # Multi-style apply scope. 'single' = just this (order, component) tuple.
    # 'all_on_po' = find every sibling component with the same name on the same PO and reject each.
    # 'selected' = only the orders listed in apply_to_order_ids (names matched).
    apply_scope: Literal['single', 'all_on_po', 'selected'] = 'single'
    apply_to_order_ids: Optional[list[int]] = None


class ApproveRequest(BaseModel):
    order_id: int
    component_id: Optional[int] = None
    sample_type: Literal['fit', 'strike', 'lab', 'pps', 'label']
    # ISO date string; defaults to today if omitted. Mirrors received_at on
    # MarkReceivedRequest.
    #
    # Without this the endpoint always stamped utcnow(), so an approval that
    # happened weeks ago could only be recorded as happening today — and
    # because pydantic drops unknown keys by default, a client sending a date
    # got no error, just the wrong date. That poisons every downstream
    # calculation keyed off the approval: idle days, chase thresholds, and
    # ex-factory-from-PP-approval. It surfaced onboarding a real PD sheet,
    # which is all historical dates.
    approved_at: Optional[str] = None
    apply_scope: Literal['single', 'all_on_po', 'selected'] = 'single'
    apply_to_order_ids: Optional[list[int]] = None


def _validate_target(db: Session, order_id: int, component_id: Optional[int], sample_type: str):
    """Load and validate the target record (component or order). Returns (order, component_or_None)."""
    field_map = SAMPLE_FIELD_MAP.get(sample_type)
    if not field_map:
        raise HTTPException(400, f"Unknown sample_type '{sample_type}'")

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, f"Order {order_id} not found")

    component = None
    if field_map['target'] == 'component':
        if component_id is None:
            # Fit/Strike/Lab on orders without components live on the order row itself.
            # Allow this but we'll operate on PurchaseOrder's equivalent columns instead.
            pass
        else:
            component = db.query(OrderComponent).filter(
                OrderComponent.id == component_id,
                OrderComponent.order_id == order_id,
            ).first()
            if not component:
                raise HTTPException(404, f"Component {component_id} not found on order {order_id}")
    elif component_id is not None:
        # PPS is always order-level.
        raise HTTPException(400, "PPS is always order-level — component_id must be null")

    return order, component


def _column_names(sample_type: str) -> dict:
    """Map sample_type to the (status, received, approved) column name strings.
    For component-level samples on orders without components, the order has the
    same column names, so this works for both targets."""
    fm = SAMPLE_FIELD_MAP[sample_type]
    return {'status': fm['status'], 'received': fm['received'], 'approved': fm['approved']}


def _read_target_state(record, sample_type: str) -> dict:
    cols = _column_names(sample_type)
    return {
        'status':   getattr(record, cols['status'], None),
        'received': getattr(record, cols['received'], None),
        'approved': getattr(record, cols['approved'], None),
    }


def _set_target_state(record, sample_type: str, status=None, received=None, approved=None):
    cols = _column_names(sample_type)
    if status is not None:   setattr(record, cols['status'], status)
    if received is not None: setattr(record, cols['received'], received)
    if approved is not None: setattr(record, cols['approved'], approved)


def _resolve_targets(
    db: Session,
    primary_order_id: int,
    primary_component_id: Optional[int],
    sample_type: str,
    apply_scope: str,
    apply_to_order_ids: Optional[list[int]],
) -> list[tuple[PurchaseOrder, Optional[OrderComponent]]]:
    """Expand a single (order, component) target into a list of (order, component)
    tuples based on the apply scope. Siblings are matched by component name on
    the same PO. For order-level samples (component_id is None), we expand by
    matching the same PO number regardless of component."""
    primary_order, primary_component = _validate_target(db, primary_order_id, primary_component_id, sample_type)
    primary = (primary_order, primary_component)

    if apply_scope == 'single':
        return [primary]

    # For order-level samples (no component on the primary), sibling expansion
    # means "the same sample_type on every other order sharing this PO number".
    if primary_component is None:
        sibling_orders = db.query(PurchaseOrder).filter(
            PurchaseOrder.po_number == primary_order.po_number,
            PurchaseOrder.id != primary_order.id,
        )
        if apply_scope == 'selected':
            ids = apply_to_order_ids or []
            sibling_orders = sibling_orders.filter(PurchaseOrder.id.in_(ids))
        siblings = [(o, None) for o in sibling_orders.all()]
        return [primary, *siblings]

    # Component-level: find every OrderComponent with the same name on the same PO.
    sibling_components = db.query(OrderComponent, PurchaseOrder).join(
        PurchaseOrder, OrderComponent.order_id == PurchaseOrder.id
    ).filter(
        PurchaseOrder.po_number == primary_order.po_number,
        OrderComponent.name == primary_component.name,
        OrderComponent.id != primary_component.id,
    )
    if apply_scope == 'selected':
        ids = apply_to_order_ids or []
        sibling_components = sibling_components.filter(OrderComponent.order_id.in_(ids))
    siblings = [(o, c) for c, o in sibling_components.all()]
    return [primary, *siblings]


def _latest_submission(db: Session, order_id: int, component_id: Optional[int], sample_type: str) -> Optional[SampleSubmission]:
    q = db.query(SampleSubmission).filter(
        SampleSubmission.order_id == order_id,
        SampleSubmission.sample_type == sample_type,
    )
    q = q.filter(SampleSubmission.component_id == component_id) if component_id is not None else q.filter(SampleSubmission.component_id.is_(None))
    return q.order_by(SampleSubmission.attempt_no.desc()).first()


@router.get("/api/submissions/siblings")
async def list_siblings(
    order_id: int,
    sample_type: Literal['fit', 'strike', 'lab', 'pps', 'label'],
    component_id: Optional[int] = None,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Preview which other styles on the same PO would be affected by
    apply_scope='all_on_po' for this (order, component, sample_type) tuple.
    Used by the reject modal to show "this will apply to N styles" with a picker."""
    primary_order, primary_component = _validate_target(db, order_id, component_id, sample_type)

    siblings = []
    if primary_component is None:
        # Order-level: siblings are other orders on the same PO number.
        rows = db.query(PurchaseOrder).filter(
            PurchaseOrder.po_number == primary_order.po_number,
            PurchaseOrder.id != primary_order.id,
        ).all()
        for o in rows:
            siblings.append({
                "order_id": o.id,
                "component_id": None,
                "style_code": o.style_code,
                "description": o.description,
                "colour": o.colour,
            })
    else:
        rows = db.query(OrderComponent, PurchaseOrder).join(
            PurchaseOrder, OrderComponent.order_id == PurchaseOrder.id
        ).filter(
            PurchaseOrder.po_number == primary_order.po_number,
            OrderComponent.name == primary_component.name,
            OrderComponent.id != primary_component.id,
        ).all()
        for c, o in rows:
            siblings.append({
                "order_id": o.id,
                "component_id": c.id,
                "style_code": o.style_code,
                "description": o.description,
                "colour": o.colour,
            })
    return {
        "po_number": primary_order.po_number,
        "component_name": primary_component.name if primary_component else None,
        "siblings": siblings,
    }


@router.get("/api/submissions/reject-reasons")
async def list_reject_reasons(current_user: User = Depends(get_current_internal_user)):
    """The reason taxonomy for rejections — code + human label."""
    return {"reasons": [{"code": code, "label": label} for code, label in SAMPLE_REJECT_REASONS]}


def _reject_one_target(
    db: Session,
    order: PurchaseOrder,
    component: Optional[OrderComponent],
    sample_type: str,
    reason: str,
    notes: Optional[str],
    photo_url: Optional[str],
    actioned_by_id: int,
    now: datetime,
) -> int:
    """Reject the current attempt on a single (order, component) pair and open
    the next attempt. Returns the new attempt number. Caller is responsible for
    committing the transaction once all targets are processed."""
    target = component if component is not None else order
    state = _read_target_state(target, sample_type)
    component_id = component.id if component else None

    latest = _latest_submission(db, order.id, component_id, sample_type)

    if latest is None:
        db.add(SampleSubmission(
            order_id=order.id,
            component_id=component_id,
            sample_type=sample_type,
            attempt_no=1,
            requested_at=order.order_sent_to_factory_date,
            submitted_at=state['received'],
            resolved_at=now,
            outcome='REJECTED',
            reason=reason,
            notes=notes,
            photo_url=photo_url,
            actioned_by_id=actioned_by_id,
        ))
        next_attempt = 2
    elif latest.outcome is None:
        latest.outcome = 'REJECTED'
        latest.resolved_at = now
        latest.reason = reason
        latest.notes = notes
        latest.photo_url = photo_url
        latest.actioned_by_id = actioned_by_id
        if latest.submitted_at is None and state['received'] is not None:
            latest.submitted_at = state['received']
        next_attempt = latest.attempt_no + 1
    else:
        next_attempt = latest.attempt_no + 1

    db.add(SampleSubmission(
        order_id=order.id,
        component_id=component_id,
        sample_type=sample_type,
        attempt_no=next_attempt,
        requested_at=now,
        outcome=None,
        actioned_by_id=actioned_by_id,
    ))

    _set_target_state(target, sample_type, status='OUTSTANDING', received=None, approved=None)

    # Resolve the human-readable reason label once so the change history entry
    # tells the full story without forcing a join in the UI.
    reason_label = next((lbl for code, lbl in SAMPLE_REJECT_REASONS if code == reason), reason)
    note_snippet = ''
    if notes:
        clipped = notes.strip()
        if len(clipped) > 100:
            clipped = clipped[:100].rstrip() + '…'
        note_snippet = f' — "{clipped}"'
    history_text = f'v{next_attempt - 1} REJECTED ({reason_label}){note_snippet} — opened v{next_attempt} OUTSTANDING'
    db.add(DateChangeHistory(
        po_id=order.id,
        user_id=actioned_by_id,
        field_name=_column_names(sample_type)['status'],
        old_value=str(state['status'] or ''),
        new_value=history_text,
        source='Sourcelab',
        component_name=component.name if component else None,
    ))

    return next_attempt


@router.post("/api/submissions/reject")
async def reject_sample(
    body: RejectRequest,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Reject the current attempt and open the next one. When apply_scope is
    'all_on_po' or 'selected', the same rejection is applied to every sibling
    component (same name, same PO — or same PO for order-level samples) in one
    transaction, so multi-style rejections land consistently."""
    if body.reason not in [code for code, _ in SAMPLE_REJECT_REASONS]:
        raise HTTPException(400, f"Unknown reason '{body.reason}'")

    targets = _resolve_targets(
        db, body.order_id, body.component_id, body.sample_type,
        body.apply_scope, body.apply_to_order_ids,
    )
    now = datetime.utcnow()

    primary_attempt_no = None
    applied_to = []
    for order, component in targets:
        new_attempt = _reject_one_target(
            db, order, component, body.sample_type,
            body.reason, body.notes, body.photo_url,
            current_user.id, now,
        )
        if order.id == body.order_id and (component.id if component else None) == body.component_id:
            primary_attempt_no = new_attempt
        applied_to.append({
            "order_id": order.id,
            "component_id": component.id if component else None,
            "new_attempt_no": new_attempt,
        })

    db.commit()
    return {
        "ok": True,
        "new_attempt_no": primary_attempt_no,
        "rejected_attempt_no": (primary_attempt_no or 2) - 1,
        "applied_to_count": len(applied_to),
        "applied_to": applied_to,
    }


# Reverse of SAMPLE_FIELD_MAP — given a status column name (e.g. "lab_dip_status")
# return the canonical sample_type ("lab"). Used by sync_submission_on_status_change
# so any update path that writes a sample status column auto-closes the matching
# open submission instead of leaving a dangling v+1 forever.
STATUS_FIELD_TO_SAMPLE_TYPE = {fm['status']: st for st, fm in SAMPLE_FIELD_MAP.items()}

# Column-name prefix ('strike_off') → submissions sample_type key ('strike').
PREFIX_TO_SAMPLE_TYPE = {
    fm['status'].replace('_status', ''): st for st, fm in SAMPLE_FIELD_MAP.items()
}


def reconcile_and_sync(
    db: Session,
    order: PurchaseOrder,
    component: Optional[OrderComponent],
    prefixes,
    actioned_by_id: int,
    skip_prefixes=None,
) -> None:
    """Reconcile a target's sample columns AND close any submission the
    reconcile just settled. Use this instead of calling
    reconcile_sample_status directly on anything that can end up APPROVED.

    Why this exists
    ---------------
    Sample state lives in two stores: the legacy status/received/approved
    columns, and sample_submissions (the attempt trail). They were kept in
    step by sync_submission_on_status_change, which only three of eight
    write paths called — so three ways of approving a sample left its
    submission open forever:

      * a date-only approval (write *_approved, let reconcile flip the
        status) never touched submissions, because sync was only wired to
        status-column writes
      * apply-to-po pushed a status to siblings and never synced at all
      * bulk-update-date wrote sample statuses through the dropdown path

    A sample left in that state reads APPROVED on screen while still
    counting toward "in rework" and the stuck list on /resubmissions.

    Folding the two together is the actual fix: you can no longer reconcile
    without syncing, so a fourth path can't reintroduce the same drift.

    REJECTED is not handled here on purpose — it's a lifecycle event that
    needs a structured reason and has its own endpoint. The guard in
    sync_submission_on_status_change raises if one arrives via a column
    write.
    """
    target = component if component is not None else order
    component_id = component.id if component else None

    before = {}
    for prefix in prefixes:
        sample_type = PREFIX_TO_SAMPLE_TYPE.get(prefix)
        if sample_type:
            before[prefix] = getattr(target, f'{prefix}_status', None)

    reconcile_sample_status(target, prefixes, skip_prefixes=skip_prefixes)

    now = datetime.utcnow()
    for prefix in prefixes:
        sample_type = PREFIX_TO_SAMPLE_TYPE.get(prefix)
        if not sample_type:
            continue
        after = getattr(target, f'{prefix}_status', None)
        if after != 'APPROVED':
            continue
        # Close the open attempt whether reconcile flipped it or the caller
        # set APPROVED directly — either way an open row is now wrong.
        latest = _latest_submission(db, order.id, component_id, sample_type)
        if latest is not None and latest.outcome is None:
            latest.outcome = 'APPROVED'
            latest.resolved_at = now
            latest.actioned_by_id = actioned_by_id
            if latest.submitted_at is None:
                received = getattr(target, f'{prefix}_received', None)
                if received is not None:
                    latest.submitted_at = received


def sync_submission_on_status_change(
    db: Session,
    order: PurchaseOrder,
    component: Optional[OrderComponent],
    field_name: str,
    new_value: Optional[str],
    actioned_by_id: int,
) -> None:
    """Keep sample_submissions in sync when a sample status column is written
    through any of the legacy update paths (PUT /api/orders/{id},
    PUT /api/components/{id}, POST /api/components/bulk-update, Excel import).

    On APPROVED: close any open submission row for this (order, component, sample_type).
    On REJECTED: raise 400. See the regression-guard note below.
    Other status values are no-ops — they don't open or close attempts.

    Call this AFTER the column has been updated. The caller is responsible for
    committing the transaction."""
    if new_value not in ('APPROVED', 'REJECTED'):
        return

    # ── Regression guard (Sep 2026) ───────────────────────────────────
    # This used to accept a bare REJECTED and silently backfill
    # reason='OTHER' with the note "Rejected via direct status update — no
    # reason captured". That wrote rejections nobody had given a reason
    # for into the same bucket as rejections someone deliberately
    # categorised as Other, quietly corrupting the Resubmissions
    # breakdown.
    #
    # Every current client already intercepts REJECTED and routes it
    # through /api/submissions/reject with a structured reason —
    # OrderTable, both FactoryV2View entry points, ComponentEditModal,
    # BulkEditModal and both orders-v2 paths. So this raises rather than
    # guessing: if a bare REJECTED ever reaches here again it means a new
    # write path skipped the reject flow, and a loud 400 surfaces that
    # immediately instead of burying it in the data.
    #
    # Scale check before changing it: of 16 rejections on the 4 Sep prod
    # snapshot, only 3 came from this path. The other 13 were real user
    # choices. So this is a guard against regression, not a fix for the
    # OTHER-heavy data — that's a question about whether the categories
    # match how people actually describe a rejection.
    if new_value == 'REJECTED':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Rejecting a sample needs a structured reason. Use "
                "POST /api/submissions/reject rather than writing the status "
                "column directly — that closes the current attempt, opens the "
                "next one, and records why."
            ),
        )
    sample_type = STATUS_FIELD_TO_SAMPLE_TYPE.get(field_name)
    if not sample_type:
        return
    component_id = component.id if component else None
    now = datetime.utcnow()

    if new_value == 'APPROVED':
        latest = _latest_submission(db, order.id, component_id, sample_type)
        if latest is not None and latest.outcome is None:
            latest.outcome = 'APPROVED'
            latest.resolved_at = now
            latest.actioned_by_id = actioned_by_id
        return



def _approve_one_target(
    db: Session,
    order: PurchaseOrder,
    component: Optional[OrderComponent],
    sample_type: str,
    actioned_by_id: int,
    now: datetime,
    approved_on: Optional[datetime] = None,
) -> int:
    """Approve the open attempt on one target.

    `now` and `approved_on` are deliberately separate. `now` is the AUDIT
    timestamp — when this action was actually recorded — and must stay real
    or the trail lies. `approved_on` is the BUSINESS date the sample was
    approved, which can legitimately be in the past when back-filling an
    existing PD sheet. Defaults to `now` when the caller doesn't care.
    """
    approved_on = approved_on or now
    target = component if component is not None else order
    component_id = component.id if component else None
    state_before = _read_target_state(target, sample_type)
    latest = _latest_submission(db, order.id, component_id, sample_type)
    if latest is not None and latest.outcome is None:
        latest.outcome = 'APPROVED'
        latest.resolved_at = now
        latest.actioned_by_id = actioned_by_id
        if latest.submitted_at is None:
            if state_before['received'] is not None:
                latest.submitted_at = state_before['received']
    _set_target_state(target, sample_type, status='APPROVED', approved=approved_on)
    attempt_no = latest.attempt_no if latest else 1
    # Log to change history so dashboard-driven approvals also appear in the
    # activity feed, not just legacy column edits.
    db.add(DateChangeHistory(
        po_id=order.id,
        user_id=actioned_by_id,
        field_name=_column_names(sample_type)['status'],
        old_value=str(state_before['status'] or ''),
        new_value=f'v{attempt_no} APPROVED',
        source='Sourcelab',
        component_name=component.name if component else None,
    ))
    return attempt_no


@router.post("/api/submissions/approve")
async def approve_sample(
    body: ApproveRequest,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Approve the current attempt. Supports the same apply_scope as reject,
    so approving Lab Dip on Main Fabric can close out every matching sibling
    on the PO in one shot."""
    targets = _resolve_targets(
        db, body.order_id, body.component_id, body.sample_type,
        body.apply_scope, body.apply_to_order_ids,
    )
    now = datetime.utcnow()
    if body.approved_at:
        try:
            approved_on = datetime.fromisoformat(body.approved_at.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(400, f"Invalid approved_at '{body.approved_at}'")
    else:
        approved_on = now

    primary_attempt_no = None
    applied_to_count = 0
    for order, component in targets:
        attempt = _approve_one_target(db, order, component, body.sample_type, current_user.id, now, approved_on)
        if order.id == body.order_id and (component.id if component else None) == body.component_id:
            primary_attempt_no = attempt
        applied_to_count += 1

    db.commit()
    return {"ok": True, "attempt_no": primary_attempt_no or 1, "applied_to_count": applied_to_count}


class BulkRejectRequest(BaseModel):
    """Reject a specific sample area across many components in one go.
    Used by the Components page bulk action so picking REJECTED in the bulk
    dropdown actually opens proper v+1 attempts rather than silently setting
    the status column. component_ids is the list of OrderComponent IDs to act on."""
    component_ids: list[int]
    sample_type: Literal['fit', 'strike', 'lab', 'pps', 'label']
    reason: str
    notes: Optional[str] = None
    photo_url: Optional[str] = None


@router.post("/api/submissions/bulk-reject")
async def bulk_reject_components(
    body: BulkRejectRequest,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Apply reject() to a list of components. Each component gets its own
    v+1 opened; orphan components currently at status=REJECTED with no
    submission row will be backfilled correctly by _reject_one_target."""
    if body.reason not in [code for code, _ in SAMPLE_REJECT_REASONS]:
        raise HTTPException(400, f"Unknown reason '{body.reason}'")
    if not body.component_ids:
        raise HTTPException(400, "component_ids cannot be empty")
    # PPS is order-level — this endpoint is for component-level bulk actions only.
    if body.sample_type == 'pps':
        raise HTTPException(400, "Use /reject with apply_scope for order-level PPS bulk rejection")

    now = datetime.utcnow()
    rejected_count = 0
    for comp_id in body.component_ids:
        component = db.query(OrderComponent).filter(OrderComponent.id == comp_id).first()
        if component is None:
            continue
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == component.order_id).first()
        if order is None:
            continue
        _reject_one_target(
            db, order, component, body.sample_type,
            body.reason, body.notes, body.photo_url,
            current_user.id, now,
        )
        rejected_count += 1

    db.commit()
    return {"ok": True, "rejected_count": rejected_count}


class MarkReceivedRequest(BaseModel):
    order_id: int
    component_id: Optional[int] = None
    sample_type: Literal['fit', 'strike', 'lab', 'pps', 'label']
    received_at: Optional[str] = None  # ISO date string; defaults to today if omitted
    apply_scope: Literal['single', 'all_on_po', 'selected'] = 'single'
    apply_to_order_ids: Optional[list[int]] = None


@router.post("/api/submissions/mark-received")
async def mark_received(
    body: MarkReceivedRequest,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Set the received date + status=RECEIVED on the current open attempt.
    Convenience endpoint for the stuck-list inline actions so you can close
    out a factory submission without leaving the dashboard."""
    targets = _resolve_targets(
        db, body.order_id, body.component_id, body.sample_type,
        body.apply_scope, body.apply_to_order_ids,
    )
    if body.received_at:
        try:
            received_dt = datetime.fromisoformat(body.received_at.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(400, f"Invalid received_at '{body.received_at}'")
    else:
        received_dt = datetime.utcnow()

    for order, component in targets:
        target = component if component is not None else order
        _set_target_state(target, body.sample_type, status='RECEIVED', received=received_dt)
        # If there's an open submission for this tuple, stamp its submitted_at.
        latest = _latest_submission(db, order.id, component.id if component else None, body.sample_type)
        if latest is not None and latest.outcome is None and latest.submitted_at is None:
            latest.submitted_at = received_dt

    db.commit()
    return {"ok": True, "applied_to_count": len(targets)}


@router.get("/api/submissions/order/{order_id}")
async def list_submissions_for_order(
    order_id: int,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """All sample submission rows for an order (and its components). Ordered by
    component, sample type, then attempt number ascending."""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, f"Order {order_id} not found")

    rows = db.query(SampleSubmission).filter(
        SampleSubmission.order_id == order_id,
    ).order_by(
        SampleSubmission.component_id.asc(),
        SampleSubmission.sample_type.asc(),
        SampleSubmission.attempt_no.asc(),
    ).all()
    return {
        "submissions": [
            {
                "id": r.id,
                "component_id": r.component_id,
                "sample_type": r.sample_type,
                "attempt_no": r.attempt_no,
                "requested_at": r.requested_at.isoformat() if r.requested_at else None,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                "outcome": r.outcome,
                "reason": r.reason,
                "notes": r.notes,
                "photo_url": r.photo_url,
                "actioned_by_id": r.actioned_by_id,
            } for r in rows
        ]
    }


@router.get("/api/resubmissions/overview")
async def resubmissions_overview(
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Dashboard data: counts + stuck list + per-factory/type breakdowns.
    Returns zero-state cleanly when there are no submissions."""
    total_rows = db.query(func.count(SampleSubmission.id)).scalar() or 0
    if total_rows == 0:
        return {
            "empty": True,
            "in_rework_now": 0,
            "stuck": [],
            "by_factory": [],
            "by_type": [],
        }

    # In-rework = open submission rows with attempt_no >= 2
    in_rework = db.query(func.count(SampleSubmission.id)).filter(
        SampleSubmission.outcome.is_(None),
        SampleSubmission.attempt_no >= 2,
    ).scalar() or 0

    # Stuck list — open rows sorted by days-open desc, top 20
    open_rows = db.query(SampleSubmission).filter(
        SampleSubmission.outcome.is_(None),
        SampleSubmission.attempt_no >= 2,
    ).order_by(SampleSubmission.requested_at.asc()).limit(20).all()

    stuck = []
    for r in open_rows:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == r.order_id).first()
        comp = db.query(OrderComponent).filter(OrderComponent.id == r.component_id).first() if r.component_id else None
        days_open = (datetime.utcnow() - r.requested_at).days if r.requested_at else 0
        # Prior rejection reason (latest REJECTED for this tuple)
        prev_rejected = db.query(SampleSubmission).filter(
            SampleSubmission.order_id == r.order_id,
            SampleSubmission.sample_type == r.sample_type,
            (SampleSubmission.component_id == r.component_id) if r.component_id is not None else SampleSubmission.component_id.is_(None),
            SampleSubmission.outcome == 'REJECTED',
        ).order_by(SampleSubmission.attempt_no.desc()).first()
        stuck.append({
            "submission_id": r.id,
            "order_id": r.order_id,
            "po_number": order.po_number if order else None,
            "china_orderbook_ref": order.china_orderbook_ref if order else None,
            "style_code": order.style_code if order else None,
            "description": order.description if order else None,
            "colour": order.colour if order else None,
            "component_id": r.component_id,
            "component_name": comp.name if comp else None,
            "sample_type": r.sample_type,
            "attempt_no": r.attempt_no,
            "factory": order.factory if order else None,
            "days_open": days_open,
            "last_reason": prev_rejected.reason if prev_rejected else None,
            "last_reason_notes": prev_rejected.notes if prev_rejected else None,
        })

    # By factory — % first-time-right = components with no REJECTED submissions / total components with submissions
    factory_rows = db.query(
        PurchaseOrder.factory,
        func.count(SampleSubmission.id).label('sub_count'),
        func.sum(case((SampleSubmission.outcome == 'REJECTED', 1), else_=0)).label('rejected_count'),
    ).join(SampleSubmission, SampleSubmission.order_id == PurchaseOrder.id).group_by(PurchaseOrder.factory).all()
    by_factory = []
    for factory, sub_count, rejected_count in factory_rows:
        if not factory:
            continue
        total = sub_count or 0
        rej = rejected_count or 0
        ftr = round((total - rej) / total * 100) if total else 100
        by_factory.append({
            "factory": factory,
            "submissions": total,
            "rejections": rej,
            "ftr_pct": ftr,
        })
    by_factory.sort(key=lambda x: x['ftr_pct'])

    # By sample type
    type_rows = db.query(
        SampleSubmission.sample_type,
        func.count(SampleSubmission.id).label('sub_count'),
        func.sum(case((SampleSubmission.outcome == 'REJECTED', 1), else_=0)).label('rejected_count'),
    ).group_by(SampleSubmission.sample_type).all()
    by_type = []
    for sample_type, sub_count, rejected_count in type_rows:
        total = sub_count or 0
        rej = rejected_count or 0
        ftr = round((total - rej) / total * 100) if total else 100
        by_type.append({
            "sample_type": sample_type,
            "submissions": total,
            "rejections": rej,
            "ftr_pct": ftr,
        })
    by_type.sort(key=lambda x: x['ftr_pct'])

    return {
        "empty": False,
        "in_rework_now": in_rework,
        "stuck": stuck,
        "by_factory": by_factory,
        "by_type": by_type,
    }
