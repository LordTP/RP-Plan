"""Sample submission endpoints — track v1/v2/v3 attempts per sample area, per component.

Rows in sample_submissions are created lazily on the first rejection. Before any
rejection, the legacy status/date columns on PurchaseOrder / OrderComponent are
authoritative and the sample is implicitly v1. On rejection we backfill a v1 row
mirroring the column state, close it as REJECTED, and open a fresh v2 row.
"""
from datetime import datetime
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, Integer, case
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, PurchaseOrder, OrderComponent, SampleSubmission,
    SAMPLE_REJECT_REASONS, SAMPLE_TYPES, DateChangeHistory,
)
from auth import get_current_internal_user


router = APIRouter()

# Map sample_type key → the status/received/approved columns on the target table.
# 'target' is either 'component' (OrderComponent) or 'order' (PurchaseOrder).
SAMPLE_FIELD_MAP = {
    'fit':    {'target': 'component', 'status': 'fit_sample_status',    'received': 'fit_sample_received',    'approved': 'fit_sample_approved'},
    'strike': {'target': 'component', 'status': 'strike_off_status',    'received': 'strike_off_received',    'approved': 'strike_off_approved'},
    'lab':    {'target': 'component', 'status': 'lab_dip_status',       'received': 'lab_dip_received',       'approved': 'lab_dip_approved'},
    'pps':    {'target': 'order',     'status': 'pps_status',           'received': 'pps_received',           'approved': 'pps_approved'},
}


class RejectRequest(BaseModel):
    order_id: int
    component_id: Optional[int] = None  # null for order-level samples (PPS, or fit/strike/lab when the order has no components)
    sample_type: Literal['fit', 'strike', 'lab', 'pps']
    reason: str = Field(..., min_length=1, description="Reason code from SAMPLE_REJECT_REASONS")
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class ApproveRequest(BaseModel):
    order_id: int
    component_id: Optional[int] = None
    sample_type: Literal['fit', 'strike', 'lab', 'pps']


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


def _latest_submission(db: Session, order_id: int, component_id: Optional[int], sample_type: str) -> Optional[SampleSubmission]:
    q = db.query(SampleSubmission).filter(
        SampleSubmission.order_id == order_id,
        SampleSubmission.sample_type == sample_type,
    )
    q = q.filter(SampleSubmission.component_id == component_id) if component_id is not None else q.filter(SampleSubmission.component_id.is_(None))
    return q.order_by(SampleSubmission.attempt_no.desc()).first()


@router.get("/api/submissions/reject-reasons")
async def list_reject_reasons(current_user: User = Depends(get_current_internal_user)):
    """The reason taxonomy for rejections — code + human label."""
    return {"reasons": [{"code": code, "label": label} for code, label in SAMPLE_REJECT_REASONS]}


@router.post("/api/submissions/reject")
async def reject_sample(
    body: RejectRequest,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Reject the current attempt and open the next one.

    Creates a v1 row first if this is the first-ever rejection (backfilling from
    the legacy status/date columns), then writes the REJECTED row and a fresh
    open row at attempt_no+1. Resets the legacy columns to the new open attempt's
    OUTSTANDING state.
    """
    if body.reason not in [code for code, _ in SAMPLE_REJECT_REASONS]:
        raise HTTPException(400, f"Unknown reason '{body.reason}'")

    order, component = _validate_target(db, body.order_id, body.component_id, body.sample_type)
    target = component if component is not None else order
    state = _read_target_state(target, body.sample_type)
    now = datetime.utcnow()

    latest = _latest_submission(db, body.order_id, body.component_id, body.sample_type)

    if latest is None:
        # First-ever rejection — backfill a v1 row reflecting the current legacy state.
        rejected_row = SampleSubmission(
            order_id=body.order_id,
            component_id=body.component_id,
            sample_type=body.sample_type,
            attempt_no=1,
            requested_at=order.order_sent_to_factory_date,
            submitted_at=state['received'],
            resolved_at=now,
            outcome='REJECTED',
            reason=body.reason,
            notes=body.notes,
            photo_url=body.photo_url,
            actioned_by_id=current_user.id,
        )
        db.add(rejected_row)
        next_attempt = 2
    elif latest.outcome is None:
        # There's an open submission for the current attempt — close it as rejected.
        latest.outcome = 'REJECTED'
        latest.resolved_at = now
        latest.reason = body.reason
        latest.notes = body.notes
        latest.photo_url = body.photo_url
        latest.actioned_by_id = current_user.id
        # Carry the submitted_at forward from the legacy column if not already set on the row.
        if latest.submitted_at is None and state['received'] is not None:
            latest.submitted_at = state['received']
        next_attempt = latest.attempt_no + 1
    else:
        # Latest is already closed. Someone re-rejected after an approval(?) — open a new attempt.
        next_attempt = latest.attempt_no + 1

    # Open the next attempt.
    new_open = SampleSubmission(
        order_id=body.order_id,
        component_id=body.component_id,
        sample_type=body.sample_type,
        attempt_no=next_attempt,
        requested_at=now,
        outcome=None,
        actioned_by_id=current_user.id,
    )
    db.add(new_open)

    # Reset the legacy status columns to reflect the new open attempt.
    _set_target_state(target, body.sample_type, status='OUTSTANDING', received=None, approved=None)

    # Log in the existing change history so it shows up in the comments/history view.
    db.add(DateChangeHistory(
        po_id=body.order_id,
        user_id=current_user.id,
        field_name=_column_names(body.sample_type)['status'],
        old_value=str(state['status'] or ''),
        new_value=f"REJECTED → v{next_attempt} OUTSTANDING",
        source='Sourcelab',
        component_name=component.name if component else None,
    ))

    db.commit()
    return {
        "ok": True,
        "new_attempt_no": next_attempt,
        "rejected_attempt_no": next_attempt - 1,
    }


@router.post("/api/submissions/approve")
async def approve_sample(
    body: ApproveRequest,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db),
):
    """Approve the current attempt. If an open submission row exists, close it
    as APPROVED; otherwise just update the legacy approved_date column. Either
    way, the legacy status column flips to APPROVED."""
    order, component = _validate_target(db, body.order_id, body.component_id, body.sample_type)
    target = component if component is not None else order
    now = datetime.utcnow()

    latest = _latest_submission(db, body.order_id, body.component_id, body.sample_type)
    if latest is not None and latest.outcome is None:
        latest.outcome = 'APPROVED'
        latest.resolved_at = now
        latest.actioned_by_id = current_user.id
        if latest.submitted_at is None:
            state = _read_target_state(target, body.sample_type)
            if state['received'] is not None:
                latest.submitted_at = state['received']

    _set_target_state(target, body.sample_type, status='APPROVED', approved=now)
    db.commit()
    return {"ok": True, "attempt_no": latest.attempt_no if latest else 1}


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
