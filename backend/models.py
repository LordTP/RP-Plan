"""
Database models for China Orderbook Portal
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, ForeignKey, Text, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    INTERNAL = "internal"
    SUPPLIER = "supplier"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.SUPPLIER)
    factory_name = Column(String(100), nullable=True)  # For supplier users
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    previous_login = Column(DateTime, nullable=True)
    
    # Relationships
    comments = relationship("Comment", back_populates="user")
    date_changes = relationship("DateChangeHistory", back_populates="user")


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
    
    # Sizes (stored as JSON string or individual columns)
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
    
    # Financial
    total_quantity = Column(Integer, nullable=True)
    trade_price = Column(Float, nullable=True)
    total_order_value = Column(Float, nullable=True)
    
    # Dates
    order_received_date = Column(DateTime, nullable=True)
    order_sent_to_factory_date = Column(DateTime, nullable=True)
    original_po_ex_factory = Column(DateTime, nullable=True)
    date_approved_to_production = Column(DateTime, nullable=True)
    revised_po_ex_factory = Column(DateTime, nullable=True)
    original_del_date_to_customer = Column(DateTime, nullable=True)
    customer_po_open_month = Column(String(20), nullable=True)
    expected_dispatch_arrive_uk_month = Column(String(20), nullable=True)
    eta_to_uk = Column(DateTime, nullable=True)
    actual_date_del_to_uk = Column(DateTime, nullable=True)
    eta_to_customer = Column(DateTime, nullable=True)
    actual_date_del_to_customer = Column(DateTime, nullable=True)
    
    # Status
    status = Column(String(50), nullable=True)  # Active, On Hold, Cancelled, etc.
    is_late = Column(Boolean, default=False)
    
    # Import tracking
    import_batch_id = Column(String(36), nullable=True, index=True)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    comments = relationship("Comment", back_populates="purchase_order", cascade="all, delete-orphan")
    date_changes = relationship("DateChangeHistory", back_populates="purchase_order", cascade="all, delete-orphan")


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
    import_batch_id = Column(String(36), nullable=True, index=True)

    # For approved/rejected supplier changes - who reviewed it
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by_username = Column(String(50), nullable=True)
    rejection_reason = Column(Text, nullable=True)  # Only set for rejected changes

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="date_changes")
    user = relationship("User", back_populates="date_changes")


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
