"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    INTERNAL = "internal"
    SUPPLIER = "supplier"
    ADMIN = "admin"
    SOURCELAB_DESIGNER = "sourcelab_designer"


# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole
    factory_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128, description="Password must be at least 8 characters")


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# Purchase Order Schemas
class PurchaseOrderBase(BaseModel):
    po_number: str
    system_po_number: Optional[str] = None
    is_active: bool = True
    customer: Optional[str] = None
    china_orderbook_ref: Optional[str] = None
    customer_po_number: Optional[str] = None
    season: Optional[str] = None
    factory: Optional[str] = None
    terms: Optional[str] = None
    sales_person: Optional[str] = None
    style_code: Optional[str] = None
    customer_style_code: Optional[str] = None
    description: Optional[str] = None
    colour: Optional[str] = None
    gender: Optional[str] = None
    
    # Sizes
    size_2xs: Optional[int] = None
    size_xs: Optional[int] = None
    size_s: Optional[int] = None
    size_m: Optional[int] = None
    size_l: Optional[int] = None
    size_xl: Optional[int] = None
    size_2xl: Optional[int] = None
    size_3xl: Optional[int] = None
    size_4xl: Optional[int] = None
    size_5xl: Optional[int] = None
    size_11: Optional[int] = None
    size_12: Optional[int] = None
    size_13: Optional[int] = None
    size_14: Optional[int] = None

    direct_repeat_new: Optional[str] = None

    # Financial
    total_quantity: Optional[int] = None
    trade_price: Optional[float] = None
    total_order_value: Optional[float] = None

    # Dates - Order & Factory
    order_received_date: Optional[datetime] = None
    order_sent_to_factory_date: Optional[datetime] = None
    tech_packs_sent_to_factory: Optional[datetime] = None
    specs_sent_to_factory: Optional[datetime] = None
    barcodes_sent_to_factory: Optional[datetime] = None
    original_po_ex_factory: Optional[datetime] = None
    factory_confirmed_ex_factory: Optional[datetime] = None

    # Samples - Fit
    fit_sample_required: Optional[str] = None
    fit_sample_status: Optional[str] = None
    fit_sample_received: Optional[datetime] = None
    fit_sample_approved: Optional[datetime] = None

    # Samples - Strike Off
    strike_off_status: Optional[str] = None
    strike_off_received: Optional[datetime] = None
    strike_off_approved: Optional[datetime] = None

    # Samples - Lab Dip
    lab_dip_status: Optional[str] = None
    lab_dip_received: Optional[datetime] = None
    lab_dip_approved: Optional[datetime] = None

    # Samples - PPS
    pps_status: Optional[str] = None
    pps_received: Optional[datetime] = None
    pps_sent_to_customer: Optional[datetime] = None
    pps_approved: Optional[datetime] = None

    # Samples - Other
    photo_sample_received: Optional[datetime] = None
    ex_factory_from_pp_approval: Optional[datetime] = None
    revised_po_ex_factory: Optional[datetime] = None
    shipment_sample_received: Optional[datetime] = None

    # Delivery dates
    original_del_date_to_customer: Optional[datetime] = None
    eta_to_uk: Optional[datetime] = None
    eta_to_customer: Optional[datetime] = None
    customer_po_open_month: Optional[str] = None
    expected_dispatch_arrive_uk_month: Optional[str] = None

    # Shipping / Vessel
    fcl_lcl: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_etd: Optional[datetime] = None
    vessel_eta_to_port: Optional[datetime] = None
    revised_vessel_eta_to_port: Optional[datetime] = None
    estimated_del_to_customer: Optional[datetime] = None

    # Legacy fields (kept for data preservation)
    date_approved_to_production: Optional[datetime] = None
    actual_date_del_to_uk: Optional[datetime] = None
    actual_date_del_to_customer: Optional[datetime] = None

    status: Optional[str] = None
    is_late: bool = False
    tracking_reference: Optional[str] = None


class PurchaseOrderCreate(PurchaseOrderBase):
    pass


class PurchaseOrderUpdate(PurchaseOrderBase):
    # For internal users - can update any field
    pass


class PurchaseOrderSupplierUpdate(BaseModel):
    """Suppliers can ONLY update these specific fields (changes require approval)"""
    factory_confirmed_ex_factory: Optional[datetime] = None
    revised_po_ex_factory: Optional[datetime] = None
    # Note: Comments are handled separately via the comments endpoint


class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    comment_count: Optional[int] = 0
    unread_comment_count: Optional[int] = 0

    class Config:
        from_attributes = True


class PurchaseOrderSupplierResponse(BaseModel):
    """Limited response for suppliers - hides pricing and internal-only fields"""
    id: int
    po_number: str
    # system_po_number: HIDDEN FROM SUPPLIERS
    # is_active: HIDDEN FROM SUPPLIERS
    customer: Optional[str] = None
    china_orderbook_ref: Optional[str] = None
    customer_po_number: Optional[str] = None
    season: Optional[str] = None
    factory: Optional[str] = None
    terms: Optional[str] = None
    sales_person: Optional[str] = None
    style_code: Optional[str] = None
    customer_style_code: Optional[str] = None
    description: Optional[str] = None
    colour: Optional[str] = None
    gender: Optional[str] = None
    
    # Sizes
    size_2xs: Optional[int] = None
    size_xs: Optional[int] = None
    size_s: Optional[int] = None
    size_m: Optional[int] = None
    size_l: Optional[int] = None
    size_xl: Optional[int] = None
    size_2xl: Optional[int] = None
    size_3xl: Optional[int] = None
    size_4xl: Optional[int] = None
    size_5xl: Optional[int] = None
    size_11: Optional[int] = None
    size_12: Optional[int] = None
    size_13: Optional[int] = None
    size_14: Optional[int] = None

    total_quantity: Optional[int] = None
    # trade_price: HIDDEN FROM SUPPLIERS
    # total_order_value: HIDDEN FROM SUPPLIERS

    # Dates (visible to suppliers)
    # order_received_date: HIDDEN FROM SUPPLIERS
    order_sent_to_factory_date: Optional[datetime] = None
    tech_packs_sent_to_factory: Optional[datetime] = None
    specs_sent_to_factory: Optional[datetime] = None
    barcodes_sent_to_factory: Optional[datetime] = None
    original_po_ex_factory: Optional[datetime] = None
    factory_confirmed_ex_factory: Optional[datetime] = None  # EDITABLE by suppliers

    # Samples (visible to suppliers)
    fit_sample_required: Optional[str] = None
    fit_sample_status: Optional[str] = None
    fit_sample_received: Optional[datetime] = None
    fit_sample_approved: Optional[datetime] = None
    strike_off_status: Optional[str] = None
    strike_off_received: Optional[datetime] = None
    strike_off_approved: Optional[datetime] = None
    lab_dip_status: Optional[str] = None
    lab_dip_received: Optional[datetime] = None
    lab_dip_approved: Optional[datetime] = None
    pps_status: Optional[str] = None
    pps_received: Optional[datetime] = None
    pps_sent_to_customer: Optional[datetime] = None
    pps_approved: Optional[datetime] = None
    photo_sample_received: Optional[datetime] = None
    ex_factory_from_pp_approval: Optional[datetime] = None
    revised_po_ex_factory: Optional[datetime] = None  # EDITABLE by suppliers
    shipment_sample_received: Optional[datetime] = None

    # Delivery
    original_del_date_to_customer: Optional[datetime] = None
    eta_to_uk: Optional[datetime] = None
    eta_to_customer: Optional[datetime] = None
    customer_po_open_month: Optional[str] = None
    expected_dispatch_arrive_uk_month: Optional[str] = None

    # Shipping / Vessel
    fcl_lcl: Optional[str] = None
    vessel_name: Optional[str] = None
    vessel_etd: Optional[datetime] = None
    vessel_eta_to_port: Optional[datetime] = None
    revised_vessel_eta_to_port: Optional[datetime] = None
    estimated_del_to_customer: Optional[datetime] = None

    status: Optional[str] = None
    is_late: bool = False
    comment_count: Optional[int] = 0
    unread_comment_count: Optional[int] = 0

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PurchaseOrderList(BaseModel):
    total: int
    page: int
    page_size: int
    orders: List[PurchaseOrderResponse]


# Comment Schemas
class CommentBase(BaseModel):
    comment_text: str
    source: str = "Sourcelab"  # Either "Sourcelab" or "Supplier"


class CommentCreate(BaseModel):
    """Comment creation - po_id comes from URL path, not body"""
    comment_text: str = Field(..., min_length=1, max_length=5000)
    source: Optional[str] = None


class CommentResponse(CommentBase):
    id: int
    po_id: int
    user_id: int
    username: str
    read: bool = False  # Whether the current user has read this comment
    read_by_internal: bool = False  # Legacy, kept for compat
    read_by_supplier: bool = False  # Legacy, kept for compat
    created_at: datetime

    class Config:
        from_attributes = True


# Order Component Schemas
class ComponentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    fit_sample_status: Optional[str] = None
    fit_sample_received: Optional[datetime] = None
    fit_sample_approved: Optional[datetime] = None
    strike_off_status: Optional[str] = None
    strike_off_received: Optional[datetime] = None
    strike_off_approved: Optional[datetime] = None
    lab_dip_status: Optional[str] = None
    lab_dip_received: Optional[datetime] = None
    lab_dip_approved: Optional[datetime] = None


class ComponentUpdate(BaseModel):
    name: Optional[str] = None
    fit_sample_status: Optional[str] = None
    fit_sample_received: Optional[datetime] = None
    fit_sample_approved: Optional[datetime] = None
    strike_off_status: Optional[str] = None
    strike_off_received: Optional[datetime] = None
    strike_off_approved: Optional[datetime] = None
    lab_dip_status: Optional[str] = None
    lab_dip_received: Optional[datetime] = None
    lab_dip_approved: Optional[datetime] = None


class ComponentResponse(BaseModel):
    id: int
    order_id: int
    name: str
    fit_sample_status: Optional[str] = None
    fit_sample_received: Optional[datetime] = None
    fit_sample_approved: Optional[datetime] = None
    strike_off_status: Optional[str] = None
    strike_off_received: Optional[datetime] = None
    strike_off_approved: Optional[datetime] = None
    lab_dip_status: Optional[str] = None
    lab_dip_received: Optional[datetime] = None
    lab_dip_approved: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Field Change History Schemas (tracks all field changes, not just dates)
class DateChangeCreate(BaseModel):
    po_id: int
    field_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    source: str = "Supplier"  # "Sourcelab" or "Supplier"


class DateChangeResponse(BaseModel):
    id: int
    po_id: int
    user_id: int
    username: str
    field_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    source: str
    approved_by: Optional[str] = None  # Who approved/rejected (for supplier changes)
    rejection_reason: Optional[str] = None  # Reason for rejection (if rejected)
    created_at: datetime

    class Config:
        from_attributes = True


# Excel Upload/Export
class ExcelUploadResponse(BaseModel):
    success: bool
    rows_processed: int
    rows_created: int
    rows_updated: int
    errors: List[str] = []


# WebSocket Messages
class WSMessage(BaseModel):
    type: str  # "comment_added", "po_updated", "user_joined", etc.
    data: dict
    timestamp: datetime = Field(default_factory=datetime.utcnow)
