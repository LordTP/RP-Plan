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


# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole
    factory_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


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
    
    # Financial
    total_quantity: Optional[int] = None
    trade_price: Optional[float] = None
    total_order_value: Optional[float] = None
    
    # Dates
    order_received_date: Optional[datetime] = None
    order_sent_to_factory_date: Optional[datetime] = None
    original_po_ex_factory: Optional[datetime] = None
    date_approved_to_production: Optional[datetime] = None
    revised_po_ex_factory: Optional[datetime] = None
    original_del_date_to_customer: Optional[datetime] = None
    customer_po_open_month: Optional[str] = None
    expected_dispatch_arrive_uk_month: Optional[str] = None
    eta_to_uk: Optional[datetime] = None
    actual_date_del_to_uk: Optional[datetime] = None
    eta_to_customer: Optional[datetime] = None
    actual_date_del_to_customer: Optional[datetime] = None
    
    status: Optional[str] = None
    is_late: bool = False


class PurchaseOrderCreate(PurchaseOrderBase):
    pass


class PurchaseOrderUpdate(PurchaseOrderBase):
    # For internal users - can update any field
    pass


class PurchaseOrderSupplierUpdate(BaseModel):
    """Suppliers can ONLY update these specific date fields"""
    date_approved_to_production: Optional[datetime] = None
    revised_po_ex_factory: Optional[datetime] = None
    actual_date_del_to_uk: Optional[datetime] = None
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
    
    total_quantity: Optional[int] = None
    # trade_price: HIDDEN FROM SUPPLIERS
    # total_order_value: HIDDEN FROM SUPPLIERS
    
    # Dates (visible to suppliers)
    # order_received_date: HIDDEN FROM SUPPLIERS
    order_sent_to_factory_date: Optional[datetime] = None
    original_po_ex_factory: Optional[datetime] = None
    date_approved_to_production: Optional[datetime] = None  # EDITABLE by suppliers
    revised_po_ex_factory: Optional[datetime] = None  # EDITABLE by suppliers
    original_del_date_to_customer: Optional[datetime] = None
    customer_po_open_month: Optional[str] = None
    expected_dispatch_arrive_uk_month: Optional[str] = None
    eta_to_uk: Optional[datetime] = None
    actual_date_del_to_uk: Optional[datetime] = None  # EDITABLE by suppliers
    eta_to_customer: Optional[datetime] = None
    # actual_date_del_to_customer: HIDDEN FROM SUPPLIERS
    
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
    comment_text: str
    source: Optional[str] = None


class CommentResponse(CommentBase):
    id: int
    po_id: int
    user_id: int
    username: str
    read_by_internal: bool = False
    read_by_supplier: bool = False
    created_at: datetime

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
    approved_by: Optional[str] = None  # Who approved (for supplier changes)
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
