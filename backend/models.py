"""
Database models for China Orderbook Portal
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, ForeignKey, Text, Enum, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    INTERNAL = "internal"
    SUPPLIER = "supplier"
    ADMIN = "admin"
    SOURCELAB_DESIGNER = "sourcelab_designer"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=True)  # Display name, shown in UI instead of username when set
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.SUPPLIER)
    factory_name = Column(String(100), nullable=True)  # For supplier users
    is_active = Column(Boolean, default=True)
    mentionable = Column(Boolean, default=True)  # Admin can hide a user from the @mention autocomplete
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    previous_login = Column(DateTime, nullable=True)
    
    # Relationships
    comments = relationship("Comment", back_populates="user")
    date_changes = relationship("DateChangeHistory", back_populates="user", foreign_keys="[DateChangeHistory.user_id]")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Core PO fields
    po_number = Column(String(50), index=True, nullable=False)
    system_po_number = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    customer = Column(String(100), nullable=True)
    china_orderbook_ref = Column(String(100), nullable=True)
    customer_po_number = Column(String(100), nullable=True)
    season = Column(String(50), nullable=True)
    factory = Column(String(100), index=True, nullable=True)
    terms = Column(String(100), nullable=True)
    sales_person = Column(String(100), nullable=True)
    
    # Product details
    style_code = Column(String(100), index=True, nullable=True)
    customer_style_code = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    colour = Column(String(100), nullable=True)
    gender = Column(String(50), nullable=True)
    
    # Product details (continued)
    direct_repeat_new = Column(String(50), nullable=True)  # DIRECT REPEAT/ NEW?

    # Sizes (stored as individual columns)
    size_2xs = Column(Integer, nullable=True)
    size_xs = Column(Integer, nullable=True)
    size_s = Column(Integer, nullable=True)
    size_m = Column(Integer, nullable=True)
    size_l = Column(Integer, nullable=True)
    size_xl = Column(Integer, nullable=True)
    size_2xl = Column(Integer, nullable=True)
    size_3xl = Column(Integer, nullable=True)
    size_4xl = Column(Integer, nullable=True)
    size_5xl = Column(Integer, nullable=True)
    size_11 = Column(Integer, nullable=True)  # Extra size col 11 (e.g. shoe 13/14, numeric 11)
    size_12 = Column(Integer, nullable=True)  # Extra size col 12 (e.g. shoe 14/15, numeric 12)
    size_13 = Column(Integer, nullable=True)  # Extra size col 13 (e.g. numeric 13)
    size_14 = Column(Integer, nullable=True)  # Extra size col 14 (e.g. numeric 14)

    # Financial
    total_quantity = Column(Integer, nullable=True)
    trade_price = Column(Float, nullable=True)  # FACTORY COST PRICE
    total_order_value = Column(Float, nullable=True)  # TOTAL ORDER COST

    # Dates - Order & Factory
    order_received_date = Column(DateTime, nullable=True)
    order_sent_to_factory_date = Column(DateTime, nullable=True)
    tech_packs_sent_to_factory = Column(DateTime, nullable=True)  # DESIGN
    specs_sent_to_factory = Column(DateTime, nullable=True)  # PRODUCT
    barcodes_sent_to_factory = Column(DateTime, nullable=True)  # PRODUCT
    original_po_ex_factory = Column(DateTime, nullable=True)  # REQUESTED EX-FACTORY
    factory_confirmed_ex_factory = Column(DateTime, nullable=True)  # FACTORY CONFIRMED EX-FACTORY (PRIME)

    # Samples - Fit
    fit_sample_required = Column(String(10), nullable=True)  # Y/N
    fit_sample_status = Column(String(50), nullable=True)  # AUTO-CALC
    fit_sample_received = Column(DateTime, nullable=True)
    fit_sample_approved = Column(DateTime, nullable=True)

    # Samples - Strike Off
    strike_off_status = Column(String(50), nullable=True)  # AUTO-CALC
    strike_off_received = Column(DateTime, nullable=True)
    strike_off_approved = Column(DateTime, nullable=True)

    # Samples - Lab Dip
    lab_dip_status = Column(String(50), nullable=True)  # AUTO-CALC
    lab_dip_received = Column(DateTime, nullable=True)
    lab_dip_approved = Column(DateTime, nullable=True)

    # Samples - PPS
    pps_status = Column(String(50), nullable=True)  # AUTO-CALC
    pps_received = Column(DateTime, nullable=True)
    pps_sent_to_customer = Column(DateTime, nullable=True)  # PPS Sent to Customer by SL
    pps_approved = Column(DateTime, nullable=True)

    # Samples - Other
    photo_sample_received = Column(DateTime, nullable=True)
    ex_factory_from_pp_approval = Column(DateTime, nullable=True)  # EX FACTORY BASED FROM PP APPROVAL (auto: PP approval + 4 weeks)
    revised_po_ex_factory = Column(DateTime, nullable=True)  # REVISED EX-FACTORY
    shipment_sample_received = Column(DateTime, nullable=True)

    # Delivery dates
    original_del_date_to_customer = Column(DateTime, nullable=True)  # CUSTOMER REQUESTED DELIVERY DATE
    eta_to_uk = Column(DateTime, nullable=True)  # ETA TO UK (auto: revised ex-factory + 60 days)
    eta_to_customer = Column(DateTime, nullable=True)  # ETA TO CUSTOMER (auto: revised ex-factory + 5 days)
    customer_po_open_month = Column(String(20), nullable=True)  # AUTO-CALC
    expected_dispatch_arrive_uk_month = Column(String(20), nullable=True)  # EXPECTED CUSTOMER DELIVERY MONTH (AUTO-CALC)

    # Shipping / Vessel
    fcl_lcl = Column(String(20), nullable=True)  # FCL / LCL
    vessel_name = Column(String(100), nullable=True)
    vessel_etd = Column(DateTime, nullable=True)  # VESSEL ETD
    vessel_eta_to_port = Column(DateTime, nullable=True)  # VESSEL ETA TO PORT
    revised_vessel_eta_to_port = Column(DateTime, nullable=True)  # REVISED VESSEL ETA TO PORT
    estimated_del_to_customer = Column(DateTime, nullable=True)  # AUTO-CALC (revised vessel ETA + 5 or 7)

    # Legacy fields (kept for data preservation, hidden from UI)
    date_approved_to_production = Column(DateTime, nullable=True)  # LEGACY: replaced by factory_confirmed_ex_factory
    actual_date_del_to_uk = Column(DateTime, nullable=True)  # LEGACY: removed in new headers
    actual_date_del_to_customer = Column(DateTime, nullable=True)  # LEGACY: removed in new headers

    # Status (internal-only, not in new CP headers but used by app logic)
    status = Column(String(50), nullable=True)
    is_late = Column(Boolean, default=False)

    # Shipping
    tracking_reference = Column(String(100), nullable=True, index=True)

    # Import tracking
    import_batch_id = Column(String(36), nullable=True, index=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    comments = relationship("Comment", back_populates="purchase_order", cascade="all, delete-orphan")
    date_changes = relationship("DateChangeHistory", back_populates="purchase_order", cascade="all, delete-orphan")
    components = relationship("OrderComponent", back_populates="order", cascade="all, delete-orphan")


class OrderComponent(Base):
    """Components for each order style (e.g. Main Fabric, Lining, Trim) with per-component sampling status"""
    __tablename__ = "order_components"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # e.g. "Main Fabric", "Lining"

    # Samples - Fit
    fit_sample_status = Column(String(50), nullable=True)
    fit_sample_received = Column(DateTime, nullable=True)
    fit_sample_approved = Column(DateTime, nullable=True)

    # Samples - Strike Off
    strike_off_status = Column(String(50), nullable=True)
    strike_off_received = Column(DateTime, nullable=True)
    strike_off_approved = Column(DateTime, nullable=True)

    # Samples - Lab Dip
    lab_dip_status = Column(String(50), nullable=True)
    lab_dip_received = Column(DateTime, nullable=True)
    lab_dip_approved = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    order = relationship("PurchaseOrder", back_populates="components")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    comment_text = Column(Text, nullable=False)
    source = Column(String(50), default="Sourcelab")  # "Sourcelab" or "Supplier"

    # Track read status separately for internal and supplier users
    read_by_internal = Column(Boolean, default=False)
    read_by_supplier = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="comments")
    user = relationship("User", back_populates="comments")
    reads = relationship("CommentRead", back_populates="comment", cascade="all, delete-orphan")


class CommentRead(Base):
    """Tracks which users have read which comments"""
    __tablename__ = "comment_reads"
    __table_args__ = (UniqueConstraint('comment_id', 'user_id', name='uq_comment_user'),)

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    read_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    comment = relationship("Comment", back_populates="reads")
    user = relationship("User")


class CommentMention(Base):
    """A user @mentioned in a comment. One row per (comment, user) pair.
    Independent from CommentRead — mentioning doesn't auto-mark as read."""
    __tablename__ = "comment_mentions"
    __table_args__ = (UniqueConstraint('comment_id', 'user_id', name='uq_comment_mention'),)

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    comment = relationship("Comment", backref="mentions")
    user = relationship("User")


# Valid order statuses
ORDER_STATUSES = [
    "Pending",
    "Confirmed",
    "In Production",
    "QC Passed",
    "Shipped",
    "In Transit",
    "Delivered to UK",
    "Delivered to Customer",
    "On Hold",
    "Cancelled",
    "Delayed",
]


class RoleColumnSettings(Base):
    """Stores which columns are visible/hidden for each role"""
    __tablename__ = "role_column_settings"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(50), nullable=False)  # 'supplier', 'internal', etc.
    column_key = Column(String(100), nullable=False)  # Column key from COLUMNS
    is_visible = Column(Boolean, default=True)
    is_editable = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AppSetting(Base):
    """Generic key-value app settings (admin-managed). Used for the emails
    kill switch and any future global toggles."""
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(String(500), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DateChangeHistory(Base):
    """Tracks all field changes (not just dates, despite the name)"""
    __tablename__ = "date_change_history"

    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    field_name = Column(String(100), nullable=False)  # Which field changed
    old_value = Column(Text, nullable=True)  # String representation of old value
    new_value = Column(Text, nullable=True)  # String representation of new value
    source = Column(String(50), default="Supplier")  # "Sourcelab" or "Supplier"
    component_name = Column(String(100), nullable=True)  # When the change is on a component, this names it
    import_batch_id = Column(String(36), nullable=True, index=True)

    # For approved/rejected supplier changes - who reviewed it
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by_username = Column(String(50), nullable=True)
    rejection_reason = Column(Text, nullable=True)  # Only set for rejected changes

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="date_changes")
    user = relationship("User", back_populates="date_changes", foreign_keys=[user_id])


class ImportBatch(Base):
    """Tracks each Excel import for undo capability"""
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(36), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    username = Column(String(50), nullable=False)
    filename = Column(String(255), nullable=True)
    rows_created = Column(Integer, default=0)
    rows_updated = Column(Integer, default=0)
    is_undone = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class SampleSubmission(Base):
    """One attempt (v1, v2, v3...) at a sample for a given (order, component, sample_type) tuple.

    Rows are created LAZILY on the first rejection:
    - Before any rejection: no submission row; the legacy sample status/date columns on
      PurchaseOrder / OrderComponent are authoritative and this sample is implicitly v1.
    - On first rejection: we backfill a v1 row mirroring the column state, close it as
      REJECTED, and insert a v2 row with outcome=NULL (open). attempt_no increments
      on every subsequent rejection.
    - On approval with an open submission row: we close that row as APPROVED.

    This keeps the legacy columns working for everything that never gets rejected (first-time-right),
    while capturing the full attempt history when rework happens.
    """
    __tablename__ = "sample_submissions"
    __table_args__ = (
        UniqueConstraint('order_id', 'component_id', 'sample_type', 'attempt_no',
                         name='uq_sample_submission_attempt'),
    )

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    # NULL for order-level samples (PPS always; plus fit/strike/lab on orders without components).
    component_id = Column(Integer, ForeignKey("order_components.id", ondelete="CASCADE"), nullable=True, index=True)
    sample_type = Column(String(20), nullable=False)  # 'fit' | 'strike' | 'lab' | 'pps'
    attempt_no = Column(Integer, nullable=False, default=1)

    requested_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    # outcome is null while this attempt is open; 'APPROVED' or 'REJECTED' once closed.
    outcome = Column(String(20), nullable=True)
    # Structured reason taxonomy (e.g. 'COLOUR', 'PLACEMENT', 'STITCH', 'MATERIAL', 'SPEC', 'PRINT', 'OTHER').
    reason = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    photo_url = Column(String(500), nullable=True)

    actioned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Reason taxonomy for rejections. Kept in code so it's easy to extend or reorder.
SAMPLE_REJECT_REASONS = [
    ('COLOUR', 'Colour / shade off'),
    ('PLACEMENT', 'Placement wrong'),
    ('STITCH', 'Stitch / construction'),
    ('MATERIAL', 'Material / hand feel'),
    ('SPEC', 'Spec mismatch'),
    ('PRINT', 'Print quality'),
    ('OTHER', 'Other'),
]

# Canonical sample type keys used in the sample_submissions table and API.
SAMPLE_TYPES = ('fit', 'strike', 'lab', 'pps')


class ShipmentDraft(Base):
    """A factory's draft (or confirmed) shipment manifest.

    Factories build a draft by picking SKUs from their PO list and filling in
    the 5 shared shipping fields (FCL/LCL, vessel name, ETD, ETA, tracking #).
    "Confirm" copies those fields onto every linked order row in one go and
    locks the draft. Multiple drafts can exist concurrently; an SKU can sit
    in more than one draft at the same time, but the UI flags the case where
    it's already been confirmed in a prior shipment so the user knows the
    confirm will overwrite previously-applied values.

    Bypasses the supplier-approval pending-change flow that single-row date
    edits go through — the draft is itself the approval surface for the
    factory's shipping data.
    """
    __tablename__ = "shipment_drafts"

    id = Column(Integer, primary_key=True, index=True)
    # Auto-generated reference like DRAFT-2026-04-25-001 (per-day counter).
    # Editable by the user, no uniqueness constraint since users may want to
    # rename freely. The numeric counter is just a default seed.
    reference = Column(String(100), nullable=False, index=True)
    # Optional friendly name like "Container ABC123" or "SS26 air freight batch".
    name = Column(String(255), nullable=True)
    factory = Column(String(100), nullable=False, index=True)
    # 'draft' | 'confirmed' | 'cancelled'
    status = Column(String(20), nullable=False, default='draft', index=True)

    # Shared shipping fields applied to every linked order on confirm.
    fcl_lcl = Column(String(20), nullable=True)
    vessel_name = Column(String(100), nullable=True)
    vessel_etd = Column(DateTime, nullable=True)
    vessel_eta_to_port = Column(DateTime, nullable=True)
    tracking_reference = Column(String(100), nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    confirmed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    orders = relationship("ShipmentDraftOrder", back_populates="draft", cascade="all, delete-orphan")


class ShipmentDraftOrder(Base):
    """Many-to-many link between a draft and the orders it ships, plus the
    quantity of each SKU in this specific shipment. Defaults to the full PO
    line quantity but is editable so factories can declare partial shipments
    (only storage for now — no other surface uses this yet)."""
    __tablename__ = "shipment_draft_orders"
    __table_args__ = (
        UniqueConstraint('draft_id', 'order_id', name='uq_shipment_draft_order'),
    )

    id = Column(Integer, primary_key=True, index=True)
    draft_id = Column(Integer, ForeignKey("shipment_drafts.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    # How much of this SKU is in this shipment. Defaults to the order's total_quantity
    # at time of add; the user can override to support partial shipments.
    quantity = Column(Integer, nullable=True)

    added_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    draft = relationship("ShipmentDraft", back_populates="orders")


class PendingDateChange(Base):
    """Tracks date changes from suppliers awaiting approval"""
    __tablename__ = "pending_date_changes"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False)
    field_name = Column(String(100), nullable=False)
    current_value = Column(String(50), nullable=True)
    proposed_value = Column(String(50), nullable=True)
    reason = Column(Text, nullable=False)  # Supplier must provide a reason

    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    submitted_by_username = Column(String(50), nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    status = Column(String(20), default="pending")  # pending, approved, rejected
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_by_username = Column(String(50), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    # Relationships
    order = relationship("PurchaseOrder")


class QACheck(Base):
    """Shared QA test-plan state. One row = one ticked checkbox, by whoever
    on whatever date. Untick = delete the row. Auto-migrates on startup."""
    __tablename__ = "qa_checks"

    check_id = Column(String(200), primary_key=True)
    checked_by = Column(String(50), nullable=False)
    checked_at = Column(DateTime, default=datetime.utcnow)
