"""
Seed local DB with a realistic spread of pending date-change approvals so we
can see how /dashboard-v2's inbox handles real volume.

The fields used here are the REAL approval-gated set: the intersection of
(role_column_settings.is_editable for role='supplier') with the DATE_FIELDS
constant in routers/orders.py — i.e. the only fields a supplier can submit
for approval. Anything else would be impossible in production.

Run: cd backend && source venv/bin/activate && python seed_fake_approvals.py
"""
import random
from datetime import datetime, timedelta

from database import SessionLocal
from models import PurchaseOrder, PendingDateChange, RoleColumnSettings, User, UserRole

# DATE_FIELDS from routers/orders.py — fields that route through PendingDateChange.
# Keep this in sync if that constant changes.
DATE_FIELDS_SET = {
    'factory_confirmed_ex_factory', 'revised_po_ex_factory',
    'vessel_etd', 'vessel_eta_to_port', 'revised_vessel_eta_to_port',
    'order_received_date', 'order_sent_to_factory_date',
    'tech_packs_sent_to_factory', 'specs_sent_to_factory', 'barcodes_sent_to_factory',
    'original_po_ex_factory', 'fit_sample_received', 'fit_sample_approved',
    'strike_off_received', 'strike_off_approved', 'lab_dip_received', 'lab_dip_approved',
    'pps_received', 'pps_sent_to_customer', 'pps_approved',
    'photo_sample_received', 'ex_factory_from_pp_approval',
    'shipment_sample_received', 'original_del_date_to_customer',
    'eta_to_uk', 'eta_to_customer', 'estimated_del_to_customer',
}

REASONS = [
    "Holiday week — extra processing time",
    "Material arrived late from upstream supplier",
    "Vessel rescheduled by carrier",
    "Port congestion at Shanghai",
    "QC found issues, re-running production",
    "Fabric mill delay (1 week)",
    "Lunar new year — factory closed",
    "Container availability issue",
    "Customer requested change to colour",
    "Combining shipment with PO-XXX",
]


def random_recent_iso(min_hours_ago: float, max_hours_ago: float) -> datetime:
    seconds = random.uniform(min_hours_ago * 3600, max_hours_ago * 3600)
    return datetime.utcnow() - timedelta(seconds=seconds)


def random_future_date(min_days: int, max_days: int) -> str:
    d = datetime.utcnow().date() + timedelta(days=random.randint(min_days, max_days))
    return d.isoformat()


def main(target_count: int = 60, clear_existing: bool = True) -> None:
    db = SessionLocal()
    try:
        # Pick a supplier user to attribute changes to
        supplier = db.query(User).filter(User.role == UserRole.SUPPLIER).first()
        if not supplier:
            print("No SUPPLIER user found — create one first")
            return

        # Resolve the REAL approval-gated set: supplier-editable AND in DATE_FIELDS
        editable_supplier_fields = {
            s.column_key for s in db.query(RoleColumnSettings).filter(
                RoleColumnSettings.role == 'supplier',
                RoleColumnSettings.is_editable == True,
            ).all()
        }
        if not editable_supplier_fields:
            # Fall back to the hardcoded default in routers/orders.py
            editable_supplier_fields = {'factory_confirmed_ex_factory', 'revised_po_ex_factory'}
        approval_fields = sorted(editable_supplier_fields & DATE_FIELDS_SET)
        if not approval_fields:
            print("No approval-gated fields found for supplier — nothing to seed")
            return
        print(f"Using approval-gated fields: {approval_fields}")

        if clear_existing:
            deleted = db.query(PendingDateChange).filter(
                PendingDateChange.status == "pending"
            ).delete()
            print(f"Cleared {deleted} existing pending changes")

        # Group orders by PO so a single supplier can submit many changes for one PO
        all_orders = db.query(PurchaseOrder).filter(
            PurchaseOrder.po_number.isnot(None)
        ).all()
        if not all_orders:
            print("No purchase orders found — nothing to seed against")
            return

        po_map: dict[str, list[PurchaseOrder]] = {}
        for o in all_orders:
            po_map.setdefault(o.po_number, []).append(o)

        # Pick a varied set of POs to seed against — favour ones with multiple styles
        po_numbers = sorted(po_map.keys(), key=lambda p: -len(po_map[p]))
        # Take up to 8 POs, prefer those with >=3 styles for nice batches
        chosen_pos = po_numbers[:8] if len(po_numbers) >= 8 else po_numbers
        random.shuffle(chosen_pos)

        created = 0
        per_po_target = max(3, target_count // max(1, len(chosen_pos)))

        for po_number in chosen_pos:
            if created >= target_count:
                break
            styles = po_map[po_number]
            # Within this PO, pick a few approval-gated fields to "push" — same fields
            # for all styles so it looks like a coherent batch from the supplier.
            fields_for_this_po = random.sample(
                approval_fields, k=random.randint(1, min(3, len(approval_fields)))
            )
            base_reason = random.choice(REASONS)
            # All changes from one PO submitted in the same time window
            submission_time = random_recent_iso(0.5, 72)

            count_for_this_po = 0
            target_for_this_po = min(per_po_target, len(styles) * len(fields_for_this_po))

            for style in styles:
                if count_for_this_po >= target_for_this_po:
                    break
                for field in fields_for_this_po:
                    current = getattr(style, field, None)
                    new_val = random_future_date(7, 30)
                    pending = PendingDateChange(
                        order_id=style.id,
                        field_name=field,
                        current_value=str(current) if current else None,
                        proposed_value=new_val,
                        reason=base_reason,
                        submitted_by_id=supplier.id,
                        submitted_by_username=supplier.username,
                        submitted_at=submission_time + timedelta(seconds=random.randint(0, 30)),
                        status="pending",
                    )
                    db.add(pending)
                    count_for_this_po += 1
                    created += 1
                    if created >= target_count:
                        break
                if created >= target_count:
                    break

            print(f"  + {count_for_this_po} pending on {po_number} ({styles[0].factory})")

        db.commit()
        print(f"\nSeeded {created} pending date-change approvals across {len(chosen_pos)} POs.")
        print("Refresh /dashboard-v2 to see them.")
    except Exception as e:
        db.rollback()
        print(f"Failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    main(target_count=n)
