"""Notification service — trigger detection, initial + reminder emails,
and one-shot tracking so we don't spam.

Called from:
- The orders update path (via `check_new_po_needs_components(db, po_number)`)
  after any change to the 3 sent-to-factory dates.
- The periodic scheduler (via `run_periodic_check(db)`) every 6 hours to
  send 2-business-day reminders and resolve firings whose condition no
  longer holds.
"""
from datetime import datetime, timedelta
from typing import List, Optional
import logging

from sqlalchemy.orm import Session

from models import (
    NotificationRecipient,
    NotificationSent,
    OrderComponent,
    PurchaseOrder,
    User,
)
import app_settings
import email_service


logger = logging.getLogger(__name__)


AUTOMATION_NEW_PO_NEEDS_COMPONENTS = 'new_po_needs_components'

# The three sent-to-factory dates that must all be present for the trigger
# to fire. Named as they exist on the PurchaseOrder model.
NEW_PO_TRIGGER_DATE_FIELDS = (
    'order_sent_to_factory_date',
    'tech_packs_sent_to_factory',
    'specs_sent_to_factory',
)

# Business days to wait before the reminder email fires.
REMINDER_BUSINESS_DAYS = 2


# ─────────────────────────────────────────────────────────────────────────
# Recipient helpers
# ─────────────────────────────────────────────────────────────────────────

def get_recipient_emails(db: Session, automation_key: str) -> List[str]:
    """Resolve every recipient row for this automation into a list of email
    addresses. User-based rows look up the user's current email; direct
    rows use the stored address as-is. Dedupes."""
    rows = db.query(NotificationRecipient).filter(
        NotificationRecipient.automation_key == automation_key
    ).all()
    seen = set()
    emails: List[str] = []
    for r in rows:
        addr: Optional[str] = None
        if r.user_id is not None:
            user = db.query(User).filter(User.id == r.user_id).first()
            if user and user.email and user.is_active:
                addr = user.email.strip()
        elif r.email:
            addr = r.email.strip()
        if addr and addr.lower() not in seen:
            seen.add(addr.lower())
            emails.append(addr)
    return emails


# ─────────────────────────────────────────────────────────────────────────
# Business-day arithmetic (Mon–Fri)
# ─────────────────────────────────────────────────────────────────────────

def business_days_between(start: datetime, end: datetime) -> int:
    """Count Mon–Fri days strictly between start and end (start not counted;
    end IS counted). Weekends dropped. Negative if end < start."""
    if end < start:
        return -business_days_between(end, start)
    total = 0
    d = start.date()
    end_date = end.date()
    while d < end_date:
        d += timedelta(days=1)
        if d.weekday() < 5:  # 0=Mon .. 4=Fri
            total += 1
    return total


# ─────────────────────────────────────────────────────────────────────────
# PO trigger condition
# ─────────────────────────────────────────────────────────────────────────

def _po_has_all_sent_dates_on_every_style(db: Session, po_number: str) -> bool:
    """True only when every style row under this po_number has all three
    sent-to-factory dates populated. Empty PO returns False."""
    rows = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number).all()
    if not rows:
        return False
    for r in rows:
        for field in NEW_PO_TRIGGER_DATE_FIELDS:
            if getattr(r, field, None) is None:
                return False
    return True


def _po_has_zero_components(db: Session, po_number: str) -> bool:
    """True when NO style under this po_number has any components attached."""
    order_ids = [r.id for r in db.query(PurchaseOrder.id).filter(
        PurchaseOrder.po_number == po_number
    ).all()]
    if not order_ids:
        return True
    count = db.query(OrderComponent).filter(OrderComponent.order_id.in_(order_ids)).count()
    return count == 0


def _po_is_cancelled_or_done(db: Session, po_number: str) -> bool:
    """True when every style under this po_number has a status that means
    we shouldn't chase components anymore."""
    STOP_STATUSES = {'Cancelled', 'Complete', 'Completed', 'Delivered', 'Delivered to UK', 'Delivered to Customer'}
    rows = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number).all()
    if not rows:
        return False
    return all((r.status or '') in STOP_STATUSES for r in rows)


def _po_trigger_condition_holds(db: Session, po_number: str) -> bool:
    """The exact condition that fires the initial email."""
    if _po_is_cancelled_or_done(db, po_number):
        return False
    if not _po_has_all_sent_dates_on_every_style(db, po_number):
        return False
    if not _po_has_zero_components(db, po_number):
        return False
    return True


# ─────────────────────────────────────────────────────────────────────────
# Email rendering + sending
# ─────────────────────────────────────────────────────────────────────────

def _po_email_context(db: Session, po_number: str) -> dict:
    """Data bundle for the email template. Grabs the styles under this
    po_number + shared PO-level metadata from the first row."""
    rows = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.po_number == po_number)
        .order_by(PurchaseOrder.style_code)
        .all()
    )
    if not rows:
        return {'po_number': po_number, 'customer': None, 'order_reference': None, 'requested_ex_factory': None, 'styles': []}
    header = rows[0]
    styles = []
    for r in rows:
        styles.append({
            'style_code': r.style_code or '',
            'customer_style_code': r.customer_style_code or '',
            'description': r.description or '',
            'colour': r.colour or '',
            'total_qty': r.total_quantity,
        })
    return {
        'po_number': po_number,
        'customer': header.customer or '',
        'order_reference': header.china_orderbook_ref or header.customer_po_number or '',
        'requested_ex_factory': (
            header.original_po_ex_factory.strftime('%d %b %Y')
            if header.original_po_ex_factory else '—'
        ),
        'factory': header.factory or '',
        'styles': styles,
    }


def _send_new_po_email(db: Session, po_number: str, is_reminder: bool) -> int:
    """Render + send. Returns the number of recipients successfully sent to."""
    recipients = get_recipient_emails(db, AUTOMATION_NEW_PO_NEEDS_COMPONENTS)
    if not recipients:
        logger.info("No recipients configured for %s — skipping send for PO %s",
                    AUTOMATION_NEW_PO_NEEDS_COMPONENTS, po_number)
        return 0

    context = _po_email_context(db, po_number)
    context['is_reminder'] = is_reminder
    context['heading'] = (
        f"Reminder: components needed for PO {po_number}"
        if is_reminder else
        f"Components needed for PO {po_number}"
    )
    context['subheading'] = (
        f"{context['customer']} · Requested Ex-Factory {context['requested_ex_factory']}"
        if context.get('customer') else None
    )
    context['preheader'] = (
        f"PO {po_number} has been sent to factory. Please add its components."
        if not is_reminder else
        f"PO {po_number} still has no components — please add them."
    )
    context['cta_url'] = f"{email_service.APP_BASE_URL}/orders-v2?q={po_number}"
    context['cta_label'] = f"Open PO {po_number}"
    context['subject'] = context['heading']

    try:
        html = email_service.render('new_po_needs_components.html.j2', **context)
    except Exception as e:
        logger.exception("Failed to render new_po_needs_components template: %s", e)
        return 0

    subject_prefix = 'Reminder — ' if is_reminder else ''
    customer_bit = f" ({context['customer']})" if context.get('customer') else ''
    subject = f"{subject_prefix}Components needed for PO {po_number}{customer_bit}"

    sent_count = 0
    for to in recipients:
        ok = email_service.send_automation_email(
            db=db,
            automation_key=AUTOMATION_NEW_PO_NEEDS_COMPONENTS,
            to=to,
            subject=subject,
            html=html,
        )
        if ok:
            sent_count += 1
    return sent_count


# ─────────────────────────────────────────────────────────────────────────
# Public entry points
# ─────────────────────────────────────────────────────────────────────────

def check_new_po_needs_components(db: Session, po_number: str) -> Optional[NotificationSent]:
    """Called after a PO row is updated. If the trigger conditions hold
    AND we've never sent for this PO before, send the initial email and
    record the fire. Returns the NotificationSent row if we fired, else None."""
    if not po_number:
        return None

    # If we already have a fire record, this is idempotent — resolve
    # closes it out, subsequent checks are no-ops.
    existing = db.query(NotificationSent).filter(
        NotificationSent.automation_key == AUTOMATION_NEW_PO_NEEDS_COMPONENTS,
        NotificationSent.entity_key == po_number,
    ).first()
    if existing is not None:
        return None

    if not _po_trigger_condition_holds(db, po_number):
        return None

    # Fire.
    sent = NotificationSent(
        automation_key=AUTOMATION_NEW_PO_NEEDS_COMPONENTS,
        entity_key=po_number,
        first_sent_at=datetime.utcnow(),
    )
    db.add(sent)
    db.commit()
    db.refresh(sent)

    count = _send_new_po_email(db, po_number, is_reminder=False)
    logger.info("Fired new_po_needs_components for PO %s (recipients=%d)", po_number, count)
    return sent


def run_periodic_check(db: Session) -> dict:
    """Called every 6 hours by the scheduler. Walks every OPEN NotificationSent
    row and decides:
      - If condition no longer holds → set resolved_at.
      - Else if REMINDER_BUSINESS_DAYS have passed since first_sent_at AND
        reminder_sent_at is null → send reminder + set reminder_sent_at.
      - Else leave alone.

    Returns a summary dict useful for logs + admin visibility."""
    now = datetime.utcnow()
    open_rows = db.query(NotificationSent).filter(
        NotificationSent.resolved_at.is_(None),
    ).all()

    resolved = 0
    reminders_sent = 0
    for row in open_rows:
        if row.automation_key != AUTOMATION_NEW_PO_NEEDS_COMPONENTS:
            continue

        po_number = row.entity_key
        if not _po_trigger_condition_holds(db, po_number):
            row.resolved_at = now
            resolved += 1
            continue

        # Condition still holds. Decide if a reminder is due.
        if row.reminder_sent_at is not None:
            continue
        biz_days = business_days_between(row.first_sent_at, now)
        if biz_days < REMINDER_BUSINESS_DAYS:
            continue

        count = _send_new_po_email(db, po_number, is_reminder=True)
        row.reminder_sent_at = now
        reminders_sent += 1
        logger.info("Sent reminder for new_po_needs_components PO %s (recipients=%d)",
                    po_number, count)

    if resolved or reminders_sent:
        db.commit()

    # Backfill scan — catches POs that satisfied the trigger via a path that
    # didn't call the direct check (Excel import, bulk update, migration).
    # For every distinct po_number whose styles all have the 3 sent dates
    # AND zero components, fire the initial email if we haven't already.
    already_fired = {row.entity_key for row in db.query(NotificationSent.entity_key).filter(
        NotificationSent.automation_key == AUTOMATION_NEW_PO_NEEDS_COMPONENTS,
    ).all()}
    candidate_pos = db.query(PurchaseOrder.po_number).filter(
        PurchaseOrder.order_sent_to_factory_date.isnot(None),
        PurchaseOrder.tech_packs_sent_to_factory.isnot(None),
        PurchaseOrder.specs_sent_to_factory.isnot(None),
    ).distinct().all()
    scan_fired = 0
    for (po_number,) in candidate_pos:
        if not po_number or po_number in already_fired:
            continue
        if _po_trigger_condition_holds(db, po_number):
            check_new_po_needs_components(db, po_number)
            scan_fired += 1
    return {
        'resolved': resolved,
        'reminders_sent': reminders_sent,
        'open_rows': len(open_rows),
        'scan_fired': scan_fired,
    }
