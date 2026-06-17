"""
Pydantic schemas for request/response validation
"""
from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator
from typing import Any, Dict, List, Optional
from datetime import datetime
from enum import Enum


# Coerce bare "YYYY-MM-DD" date strings (from HTML date inputs) into a form
# Pydantic v2 accepts for datetime fields. Pydantic v2 requires a T separator.
def _coerce_date_only_string(v):
    if isinstance(v, str) and len(v) == 10 and v[4] == '-' and v[7] == '-':
        return v + 'T00:00:00'
    return v


_COMPONENT_DATE_FIELDS = (
    'fit_sample_received', 'fit_sample_approved',
    'strike_off_received', 'strike_off_approved',
    'lab_dip_received', 'lab_dip_approved',
)


class UserRole(str, Enum):
    INTERNAL = "internal"
    SUPPLIER = "supplier"
    ADMIN = "admin"
    SOURCELAB_DESIGNER = "sourcelab_designer"


# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
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
    mentionable: bool = True
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


class ComponentResponse(BaseModel):
    id: int
    order_id: int
    name: str
    # Which sample type this component tracks. 'strike_off' or 'lab_dip'.
    sample_type: str
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
    # Resubmission metadata — current attempt number and prior rejection count
    # per sample area. Default to 1/0 when no submissions exist (i.e. component
    # has never been rejected, implicit v1).
    fit_sample_attempt_no: Optional[int] = 1
    fit_sample_rejection_count: Optional[int] = 0
    strike_off_attempt_no: Optional[int] = 1
    strike_off_rejection_count: Optional[int] = 0
    lab_dip_attempt_no: Optional[int] = 1
    lab_dip_rejection_count: Optional[int] = 0
    # Latest rejection context per sample area — only populated when the current
    # attempt is > 1. Surfaced to factories on their supplier views so they know
    # WHY the previous attempt was rejected and what to fix.
    fit_sample_last_rejection: Optional[Dict[str, Any]] = None
    strike_off_last_rejection: Optional[Dict[str, Any]] = None
    lab_dip_last_rejection: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    created_at: datetime
    updated_at: datetime
    comment_count: Optional[int] = 0
    unread_comment_count: Optional[int] = 0
    components: List[ComponentResponse] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def style_base(self) -> Optional[str]:
        """Style code with everything from the first dash onwards stripped.
        Auto-derived from style_code on every response; not stored on the
        model so it can't get out of sync. Returns the whole code when no
        dash is present (e.g. "PLAIN" → "PLAIN")."""
        if not self.style_code:
            return None
        return self.style_code.split('-', 1)[0]

    # Resubmission rollup per sample area. For orders WITH components this is
    # the max attempt across that order's components for that sample type;
    # for orders WITHOUT components it reflects the order-level submission.
    # PPS is always order-level. Defaults to v1 / 0 when no rejection has happened.
    fit_sample_attempt_no: Optional[int] = 1
    fit_sample_rejection_count: Optional[int] = 0
    strike_off_attempt_no: Optional[int] = 1
    strike_off_rejection_count: Optional[int] = 0
    lab_dip_attempt_no: Optional[int] = 1
    lab_dip_rejection_count: Optional[int] = 0
    pps_attempt_no: Optional[int] = 1
    pps_rejection_count: Optional[int] = 0
    fit_sample_last_rejection: Optional[Dict[str, Any]] = None
    strike_off_last_rejection: Optional[Dict[str, Any]] = None
    lab_dip_last_rejection: Optional[Dict[str, Any]] = None
    pps_last_rejection: Optional[Dict[str, Any]] = None

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
    components: List[ComponentResponse] = []

    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def style_base(self) -> Optional[str]:
        """Same derivation as PurchaseOrderResponse.style_base — see there."""
        if not self.style_code:
            return None
        return self.style_code.split('-', 1)[0]

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
    # User IDs resolved by the client from the @mention autocomplete. The server
    # will also parse @username tokens from comment_text as a fallback.
    mentioned_user_ids: Optional[List[int]] = None


class MentionableUser(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str

    class Config:
        from_attributes = True


class CommentReadBy(BaseModel):
    username: str
    full_name: Optional[str] = None
    read_at: datetime

class CommentResponse(CommentBase):
    id: int
    po_id: int
    user_id: int
    username: str
    full_name: Optional[str] = None  # Display name resolved at fetch-time, falls back to username
    read: bool = False  # Whether the current user has read this comment
    read_by_internal: bool = False  # Legacy, kept for compat
    read_by_supplier: bool = False  # Legacy, kept for compat
    read_by_users: List[CommentReadBy] = []  # Who has read this comment
    created_at: datetime

    class Config:
        from_attributes = True


# Order Component Schemas
class ComponentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    # Required at create-time — every new component is strictly one sample
    # type. 'strike_off' or 'lab_dip'. Default is 'strike_off' to keep older
    # API clients (e.g. cross-PO add flow) functional without a code update.
    sample_type: str = 'strike_off'
    fit_sample_status: Optional[str] = None
    fit_sample_received: Optional[datetime] = None
    fit_sample_approved: Optional[datetime] = None
    strike_off_status: Optional[str] = None
    strike_off_received: Optional[datetime] = None
    strike_off_approved: Optional[datetime] = None
    lab_dip_status: Optional[str] = None
    lab_dip_received: Optional[datetime] = None
    lab_dip_approved: Optional[datetime] = None

    _coerce_date_fields = field_validator(*_COMPONENT_DATE_FIELDS, mode='before')(_coerce_date_only_string)

    @field_validator('sample_type')
    @classmethod
    def _validate_sample_type(cls, v: str) -> str:
        if v not in ('strike_off', 'lab_dip'):
            raise ValueError("sample_type must be 'strike_off' or 'lab_dip'")
        return v


class ComponentUpdate(BaseModel):
    name: Optional[str] = None
    # sample_type is immutable post-create — omit it from updates. Switching
    # would orphan the previously-entered fields and break attempt history.
    fit_sample_status: Optional[str] = None
    fit_sample_received: Optional[datetime] = None
    fit_sample_approved: Optional[datetime] = None
    strike_off_status: Optional[str] = None
    strike_off_received: Optional[datetime] = None
    strike_off_approved: Optional[datetime] = None
    lab_dip_status: Optional[str] = None
    lab_dip_received: Optional[datetime] = None
    lab_dip_approved: Optional[datetime] = None

    _coerce_date_fields = field_validator(*_COMPONENT_DATE_FIELDS, mode='before')(_coerce_date_only_string)


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
    component_name: Optional[str] = None  # Set when the change was on a specific component
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
