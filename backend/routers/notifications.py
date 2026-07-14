"""Admin endpoints for managing notification recipients per automation.

The per-automation on/off toggle already lives on the /api/settings
endpoint (via app_settings). This router adds the recipient CRUD layer
+ a manual "fire now" endpoint useful for admin debugging.
"""
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import NotificationRecipient, NotificationSent, User
from auth import get_current_admin_user
import app_settings
import notifications


router = APIRouter()


EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _serialize_recipient(r: NotificationRecipient, db: Session) -> dict:
    """Enrich the row so the frontend can render nice labels."""
    display_email = None
    display_name = None
    if r.user_id is not None:
        u = db.query(User).filter(User.id == r.user_id).first()
        if u:
            display_email = u.email
            display_name = u.full_name or u.username
    else:
        display_email = r.email
    return {
        'id': r.id,
        'automation_key': r.automation_key,
        'kind': 'user' if r.user_id is not None else 'email',
        'user_id': r.user_id,
        'email': r.email,
        'display_email': display_email,
        'display_name': display_name,
        'created_at': r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/api/notifications/rules")
async def list_notification_rules(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """List every registered automation with its current toggle state,
    recipient list, and any recent open notifications. Powers the /settings
    Notifications tab."""
    rules = []
    for auto in app_settings.EMAIL_AUTOMATIONS:
        key = auto['key']
        enabled = app_settings.is_automation_enabled(db, key)
        recipient_rows = db.query(NotificationRecipient).filter(
            NotificationRecipient.automation_key == key
        ).order_by(NotificationRecipient.created_at).all()
        recipients = [_serialize_recipient(r, db) for r in recipient_rows]
        open_count = db.query(NotificationSent).filter(
            NotificationSent.automation_key == key,
            NotificationSent.resolved_at.is_(None),
        ).count()
        rules.append({
            'key': key,
            'label': auto['label'],
            'description': auto['description'],
            'enabled': enabled,
            'recipients': recipients,
            'open_fires': open_count,
        })
    return {'rules': rules}


@router.post("/api/notifications/rules/{automation_key}/recipients", status_code=201)
async def add_notification_recipient(
    automation_key: str,
    data: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """Add a recipient to an automation. Body must have EITHER
    {user_id: N} OR {email: '...'}. Rejects duplicates on both axes."""
    valid_keys = {a['key'] for a in app_settings.EMAIL_AUTOMATIONS}
    if automation_key not in valid_keys:
        raise HTTPException(status_code=404, detail="Unknown automation key")

    user_id = data.get('user_id')
    email = (data.get('email') or '').strip()
    if user_id is not None and email:
        raise HTTPException(status_code=400, detail="Provide either user_id or email, not both")
    if user_id is None and not email:
        raise HTTPException(status_code=400, detail="Provide either user_id or email")

    if user_id is not None:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        existing = db.query(NotificationRecipient).filter(
            NotificationRecipient.automation_key == automation_key,
            NotificationRecipient.user_id == user_id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Recipient already added for this automation")
        r = NotificationRecipient(automation_key=automation_key, user_id=user_id)
    else:
        if not EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail="Invalid email format")
        existing = db.query(NotificationRecipient).filter(
            NotificationRecipient.automation_key == automation_key,
            NotificationRecipient.email == email,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Recipient already added for this automation")
        r = NotificationRecipient(automation_key=automation_key, email=email)

    db.add(r)
    db.commit()
    db.refresh(r)
    return _serialize_recipient(r, db)


@router.delete("/api/notifications/rules/{automation_key}/recipients/{recipient_id}", status_code=204)
async def remove_notification_recipient(
    automation_key: str,
    recipient_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """Remove a recipient. The automation_key path arg is for URL clarity;
    we also verify the row actually belongs to it."""
    r = db.query(NotificationRecipient).filter(
        NotificationRecipient.id == recipient_id,
        NotificationRecipient.automation_key == automation_key,
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Recipient not found")
    db.delete(r)
    db.commit()
    return None


@router.post("/api/notifications/rules/{automation_key}/fire-now")
async def fire_notification_now(
    automation_key: str,
    data: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """Manually fire a notification — useful for testing. Body: {po_number: '...'}.

    Only supports the new_po_needs_components automation for now. Runs the
    same trigger check + record path as the automatic flow."""
    if automation_key != notifications.AUTOMATION_NEW_PO_NEEDS_COMPONENTS:
        raise HTTPException(status_code=400, detail="fire-now only supports new_po_needs_components right now")
    po_number = (data.get('po_number') or '').strip()
    if not po_number:
        raise HTTPException(status_code=400, detail="po_number is required")
    fired = notifications.check_new_po_needs_components(db, po_number)
    return {
        'fired': fired is not None,
        'po_number': po_number,
        'condition_holds': notifications._po_trigger_condition_holds(db, po_number),
    }


@router.post("/api/notifications/run-periodic-check")
async def run_periodic_check_now(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin_user),
):
    """Kick the 6-hour periodic check manually — handy when testing
    reminders without waiting for the scheduler."""
    summary = notifications.run_periodic_check(db)
    return {'summary': summary}
