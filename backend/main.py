"""
Main FastAPI application for China Orderbook Portal
"""
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, case
from typing import List, Optional
from datetime import datetime, timedelta
import json
import os

from collections import defaultdict
import time as _time

from database import get_db, init_db
from models import User, PurchaseOrder, Comment, CommentRead, DateChangeHistory, UserRole, ORDER_STATUSES, RoleColumnSettings, ImportBatch, PendingDateChange, OrderComponent
from schemas import (
    UserCreate, UserLogin, UserResponse, Token,
    PurchaseOrderCreate, PurchaseOrderResponse, PurchaseOrderUpdate, PurchaseOrderList,
    PurchaseOrderSupplierResponse, PurchaseOrderSupplierUpdate,
    CommentCreate, CommentResponse,
    ComponentCreate, ComponentUpdate, ComponentResponse,
    DateChangeResponse,
    ExcelUploadResponse,
    WSMessage
)
from auth import (
    get_password_hash, create_access_token, authenticate_user,
    get_current_user, get_current_internal_user, get_current_full_internal_user, get_current_admin_user
)
from excel_utils import import_excel_to_database, export_database_to_excel

# Initialize FastAPI app
app = FastAPI(
    title="China Orderbook Portal API",
    description="Backend API for managing purchase orders, comments, and supplier collaboration",
    version="1.0.0"
)

# CORS middleware - configurable via environment variable
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Refresh-Token"],
)

# Token refresh middleware - issues a fresh token on every authenticated request
class TokenRefreshMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Skip for non-API routes, websocket, and auth endpoints
        path = request.url.path
        if not path.startswith("/api/") or path in ["/api/auth/login"]:
            return response
        # Check if request had a valid Bearer token
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                from auth import decode_access_token, create_access_token
                payload = decode_access_token(token)
                username = payload.get("sub")
                if username:
                    new_token = create_access_token(data={"sub": username})
                    response.headers["X-Refresh-Token"] = new_token
            except Exception:
                pass  # Token invalid/expired - don't refresh
        return response

app.add_middleware(TokenRefreshMiddleware)


# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()


# Simple in-memory rate limiter for login attempts
class LoginRateLimiter:
    """Limits login attempts per IP address to prevent brute-force attacks."""
    def __init__(self, max_attempts: int = 5, window_seconds: int = 300):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = defaultdict(list)

    def is_rate_limited(self, key: str) -> bool:
        now = _time.time()
        cutoff = now - self.window_seconds
        # Prune old attempts
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]
        return len(self._attempts[key]) >= self.max_attempts

    def record_attempt(self, key: str) -> None:
        self._attempts[key].append(_time.time())

    def reset(self, key: str) -> None:
        self._attempts.pop(key, None)

login_limiter = LoginRateLimiter(max_attempts=5, window_seconds=300)


# ============================================================================
# STARTUP / HEALTH CHECK
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    init_db()
    print("✓ API server started successfully")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "China Orderbook Portal API",
        "status": "online",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/health")
async def health_check():
    """Health check for monitoring"""
    return {"status": "healthy"}


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Register a new user (admin only)"""
    # Check if username exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The username '{user_data.username}' is already taken. Please choose a different username."
        )

    # Check if email exists
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The email '{user_data.email}' is already registered. Use a different email or recover your existing account."
        )
    
    # Create new user
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role,
        factory_name=user_data.factory_name
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user


@app.post("/api/auth/login", response_model=Token)
async def login(
    login_data: UserLogin,
    request: Request,
    db: Session = Depends(get_db)
):
    """Login and receive JWT token"""
    # Rate limit by IP address
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if login_limiter.is_rate_limited(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait 5 minutes before trying again."
        )

    user = authenticate_user(db, login_data.username, login_data.password)

    if not user:
        login_limiter.record_attempt(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login failed. Please check your username and password are correct. Passwords are case-sensitive."
        )
    
    # Successful login — reset rate limiter for this IP
    login_limiter.reset(client_ip)

    # Preserve previous login time, then update last login
    user.previous_login = user.last_login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": user.username})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user


# ============================================================================
# USER MANAGEMENT ENDPOINTS (Internal/Admin only)
# ============================================================================

@app.get("/api/users", response_model=List[UserResponse])
async def get_all_users(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get all users (internal/admin only)"""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return users


@app.post("/api/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Create a new user (internal/admin only)"""
    # Check if username or email already exists
    existing_user = db.query(User).filter(
        or_(User.username == user_data.username, User.email == user_data.email)
    ).first()

    if existing_user:
        if existing_user.username == user_data.username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The username '{user_data.username}' is already taken. Please choose a different username."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The email '{user_data.email}' is already registered to another user."
            )

    # Create user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role,
        factory_name=user_data.factory_name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@app.put("/api/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Update a user (internal/admin only)"""
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} was not found. They may have been deleted."
        )

    # Only admins can change roles or deactivate users
    if 'role' in user_data:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can change user roles."
            )
        user.role = UserRole(user_data['role'])
    if 'is_active' in user_data:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only administrators can activate or deactivate users."
            )
        user.is_active = user_data['is_active']
    if 'factory_name' in user_data:
        user.factory_name = user_data['factory_name']
    if 'password' in user_data and user_data['password']:
        user.hashed_password = get_password_hash(user_data['password'])

    db.commit()
    db.refresh(user)

    return user


@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Delete a user (internal/admin only)"""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account while logged in. Ask another admin to delete it if needed."
        )

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with ID {user_id} was not found. They may have already been deleted."
        )

    db.delete(user)
    db.commit()

    return None


# ============================================================================
# PURCHASE ORDER ENDPOINTS
# ============================================================================

@app.get("/api/orders")
async def get_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: Optional[str] = None,
    factory: Optional[str] = None,
    customer: Optional[str] = None,
    status: Optional[str] = None,
    po_number: Optional[str] = None,
    style_code: Optional[str] = None,
    tab: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get paginated list of purchase orders
    - Internal users see all orders with ALL fields
    - Supplier users only see their factory's orders with LIMITED fields (no pricing/internal data)
    - tab=shipped: filter where tracking_reference IS NOT NULL (internal only)
    - tab=orders (default for internal): filter where tracking_reference IS NULL
    """
    query = db.query(PurchaseOrder)

    # Filter by factory for supplier users
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        query = query.filter(PurchaseOrder.factory == current_user.factory_name)

    # Tab filtering for internal/admin users only
    if current_user.role != UserRole.SUPPLIER and tab:
        if tab == 'shipped':
            query = query.filter(PurchaseOrder.tracking_reference.isnot(None))
        elif tab == 'orders':
            query = query.filter(PurchaseOrder.tracking_reference.is_(None))

    # Apply filters
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                PurchaseOrder.po_number.ilike(search_pattern),
                PurchaseOrder.style_code.ilike(search_pattern),
                PurchaseOrder.customer.ilike(search_pattern)
            )
        )

    if factory:
        query = query.filter(PurchaseOrder.factory == factory)

    if customer:
        query = query.filter(PurchaseOrder.customer == customer)

    if status:
        query = query.filter(PurchaseOrder.status == status)

    if po_number:
        # Search both po_number and customer_po_number
        po_pattern = f"%{po_number}%"
        query = query.filter(
            or_(
                PurchaseOrder.po_number.ilike(po_pattern),
                PurchaseOrder.customer_po_number.ilike(po_pattern)
            )
        )

    if style_code:
        query = query.filter(PurchaseOrder.style_code.ilike(f"%{style_code}%"))
    
    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * page_size
    orders = query.order_by(PurchaseOrder.system_po_number.asc()).offset(offset).limit(page_size).all()
    
    # Add comment count and unread count per user
    for order in orders:
        order.comment_count = db.query(Comment).filter(Comment.po_id == order.id).count()
        # Count comments this specific user hasn't read
        read_comment_ids = db.query(CommentRead.comment_id).filter(
            CommentRead.user_id == current_user.id
        ).subquery()
        order.unread_comment_count = db.query(Comment).filter(
            Comment.po_id == order.id,
            ~Comment.id.in_(read_comment_ids)
        ).count()
    
    # Return different response based on user role
    if current_user.role == UserRole.SUPPLIER:
        # Suppliers get limited fields (Sheet 2 equivalent)
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "orders": [PurchaseOrderSupplierResponse.from_orm(o) for o in orders]
        }
    else:
        # Internal users get all fields (Sheet 1 equivalent)
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "orders": [PurchaseOrderResponse.from_orm(o) for o in orders]
        }


@app.get("/api/orders/recent-changes")
async def get_recent_changes(
    po_number: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get recent date changes for orders, optionally filtered by PO number.
    Used to highlight changed cells in the UI.
    """
    # Default to last login time or 24 hours ago
    since_date = None
    if since:
        try:
            since_date = datetime.fromisoformat(since.replace('Z', '+00:00'))
        except ValueError:
            pass

    if not since_date:
        since_date = current_user.last_login or (datetime.utcnow() - timedelta(hours=24))

    # Build query for recent changes
    query = db.query(DateChangeHistory).filter(DateChangeHistory.created_at > since_date)

    # Filter by PO number if provided
    if po_number:
        # Get order IDs for this PO number
        order_ids_query = db.query(PurchaseOrder.id).filter(PurchaseOrder.po_number == str(po_number))

        # Filter by factory for supplier users
        if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
            order_ids_query = order_ids_query.filter(PurchaseOrder.factory == current_user.factory_name)

        order_ids = [o[0] for o in order_ids_query.all()]

        # If no orders found, return empty result
        if not order_ids:
            return {
                "since": since_date.isoformat(),
                "changes": {}
            }

        query = query.filter(DateChangeHistory.po_id.in_(order_ids))
    else:
        # Filter by factory for supplier users
        if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
            order_ids = db.query(PurchaseOrder.id).filter(
                PurchaseOrder.factory == current_user.factory_name
            ).all()
            order_ids = [o[0] for o in order_ids]

            if not order_ids:
                return {
                    "since": since_date.isoformat(),
                    "changes": {}
                }

            query = query.filter(DateChangeHistory.po_id.in_(order_ids))

    changes = query.order_by(DateChangeHistory.created_at.desc()).all()

    # Group changes by order_id and field_name
    # Return: { order_id: [field_name, ...] }
    changes_by_order: dict = {}
    for change in changes:
        order_id = change.po_id
        if order_id not in changes_by_order:
            changes_by_order[order_id] = set()
        changes_by_order[order_id].add(change.field_name)

    # Convert sets to lists for JSON serialization
    return {
        "since": since_date.isoformat(),
        "changes": {str(k): list(v) for k, v in changes_by_order.items()}
    }


@app.get("/api/orders/{order_id}")
async def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single purchase order by ID - returns role-appropriate response"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {order_id} was not found. It may have been deleted."
        )

    # Check permissions for supplier users
    if current_user.role == UserRole.SUPPLIER:
        if order.factory != current_user.factory_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only view orders for your factory ({current_user.factory_name}). This order belongs to a different factory."
            )
    
    # Add comment count
    order.comment_count = db.query(Comment).filter(Comment.po_id == order.id).count()
    
    # Return appropriate response based on role
    if current_user.role == UserRole.SUPPLIER:
        return PurchaseOrderSupplierResponse.from_orm(order)
    else:
        return PurchaseOrderResponse.from_orm(order)


@app.post("/api/orders", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_data: PurchaseOrderCreate,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Create a new purchase order (internal users only)"""
    # Check if PO number already exists
    existing_po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_number == order_data.po_number
    ).first()
    
    if existing_po:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PO# {order_data.po_number} already exists"
        )
    
    new_order = PurchaseOrder(**order_data.dict())
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    # Broadcast update
    await manager.broadcast({
        "type": "po_created",
        "data": {"po_id": new_order.id, "po_number": new_order.po_number},
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return new_order


@app.put("/api/orders/{order_id}")
async def update_order(
    order_id: int,
    order_data: dict,  # Accept raw dict to handle different schemas
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a purchase order
    - Suppliers can only update: factory_confirmed_ex_factory, revised_po_ex_factory
    - Internal users can update everything
    - ALL date changes are tracked in DateChangeHistory
    """
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {order_id} was not found. It may have been deleted or the page needs refreshing."
        )

    # Check permissions
    if current_user.role == UserRole.SUPPLIER:
        if order.factory != current_user.factory_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only edit orders for your factory ({current_user.factory_name}). This order belongs to a different factory."
            )
        
        # Build supplier allowed fields from DB settings, fall back to defaults
        db_settings = db.query(RoleColumnSettings).filter(
            RoleColumnSettings.role == 'supplier',
            RoleColumnSettings.is_editable == True
        ).all()
        if db_settings:
            allowed_fields = [s.column_key for s in db_settings]
        else:
            allowed_fields = ['factory_confirmed_ex_factory', 'revised_po_ex_factory']

        # Determine which fields are dates (need approval) vs text (direct save)
        DATE_FIELDS = {
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

        # Reject any fields not in the allowed list
        submitted_fields = [k for k in order_data.keys() if k != 'change_reason']
        for f in submitted_fields:
            if f not in allowed_fields:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"You are not allowed to edit '{f}'"
                )

        # Handle text/non-date fields — save directly, no approval needed
        direct_updates = {}
        for field in allowed_fields:
            if field in order_data and field not in DATE_FIELDS:
                direct_updates[field] = order_data[field]

        for field, value in direct_updates.items():
            if hasattr(order, field):
                setattr(order, field, value)

        # Handle date fields — require approval
        change_reason = order_data.get('change_reason', '').strip()
        pending_changes_created = []

        for field in allowed_fields:
            if field not in DATE_FIELDS:
                continue
            if field in order_data and order_data[field] is not None:
                new_value_str = order_data[field]

                # Parse datetime if it's a string
                if isinstance(new_value_str, str):
                    try:
                        new_value = datetime.fromisoformat(new_value_str.replace('Z', '+00:00'))
                    except (ValueError, TypeError):
                        continue
                elif isinstance(new_value_str, datetime):
                    new_value = new_value_str
                else:
                    continue

                old_value = getattr(order, field)

                # Only create pending change if value actually changed
                if old_value != new_value:
                    if not change_reason:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Please provide a reason for the date change"
                        )

                    # Check for existing pending change on this field - replace it
                    existing_pending = db.query(PendingDateChange).filter(
                        PendingDateChange.order_id == order.id,
                        PendingDateChange.field_name == field,
                        PendingDateChange.status == "pending"
                    ).first()

                    if existing_pending:
                        # Update existing pending change
                        existing_pending.proposed_value = new_value.strftime('%Y-%m-%d') if new_value else None
                        existing_pending.reason = change_reason
                        existing_pending.submitted_at = datetime.utcnow()
                    else:
                        # Create new pending change
                        pending_change = PendingDateChange(
                            order_id=order.id,
                            field_name=field,
                            current_value=old_value.strftime('%Y-%m-%d') if old_value else None,
                            proposed_value=new_value.strftime('%Y-%m-%d') if new_value else None,
                            reason=change_reason,
                            submitted_by_id=current_user.id,
                            submitted_by_username=current_user.username,
                            status="pending"
                        )
                        db.add(pending_change)

                    pending_changes_created.append(field)

        # If we had direct updates but no pending changes, commit and return
        if direct_updates and not pending_changes_created:
            order.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(order)
            order.comment_count = db.query(Comment).filter(Comment.po_id == order.id).count()
            read_ids = db.query(CommentRead.comment_id).filter(CommentRead.user_id == current_user.id).subquery()
            order.unread_comment_count = db.query(Comment).filter(
                Comment.po_id == order.id,
                ~Comment.id.in_(read_ids)
            ).count()
            return PurchaseOrderSupplierResponse.from_orm(order)

        # If pending changes were created, commit and return early
        if pending_changes_created:
            db.commit()
            db.refresh(order)
            # Return with pending info
            order.comment_count = db.query(Comment).filter(Comment.po_id == order.id).count()
            read_ids = db.query(CommentRead.comment_id).filter(CommentRead.user_id == current_user.id).subquery()
            order.unread_comment_count = db.query(Comment).filter(
                Comment.po_id == order.id,
                ~Comment.id.in_(read_ids)
            ).count()
            return {
                "order": PurchaseOrderSupplierResponse.from_orm(order),
                "pending_approval": True,
                "pending_fields": pending_changes_created,
                "message": "Date change(s) submitted for approval"
            }
    
    else:  # Internal/Admin users can update everything
        # If status is being set to "Shipped", require tracking_reference
        if order_data.get('status') == 'Shipped' and not order_data.get('tracking_reference') and not order.tracking_reference:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A tracking reference is required when setting status to Shipped"
            )

        # Only allow updating known business fields — block id, metadata, and relationships
        ALLOWED_UPDATE_FIELDS = {
            'po_number', 'system_po_number', 'is_active', 'customer', 'china_orderbook_ref',
            'customer_po_number', 'direct_repeat_new', 'season', 'factory', 'terms', 'sales_person',
            'style_code', 'customer_style_code', 'description', 'colour', 'gender',
            'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l',
            'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl',
            'size_11', 'size_12', 'size_13', 'size_14',
            'total_quantity', 'trade_price', 'total_order_value',
            'order_received_date', 'order_sent_to_factory_date',
            'tech_packs_sent_to_factory', 'specs_sent_to_factory', 'barcodes_sent_to_factory',
            'original_po_ex_factory', 'factory_confirmed_ex_factory',
            'fit_sample_required', 'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
            'strike_off_status', 'strike_off_received', 'strike_off_approved',
            'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
            'pps_status', 'pps_received', 'pps_sent_to_customer', 'pps_approved',
            'photo_sample_received', 'ex_factory_from_pp_approval',
            'revised_po_ex_factory', 'shipment_sample_received',
            'original_del_date_to_customer',
            'eta_to_uk', 'eta_to_customer',
            'customer_po_open_month', 'expected_dispatch_arrive_uk_month',
            'fcl_lcl', 'vessel_name', 'vessel_etd', 'vessel_eta_to_port',
            'revised_vessel_eta_to_port', 'estimated_del_to_customer',
            'status', 'is_late', 'tracking_reference',
            # Legacy fields (still updatable for backwards compatibility)
            'date_approved_to_production', 'actual_date_del_to_uk', 'actual_date_del_to_customer',
        }

        # Fields to skip change tracking (non-business fields)
        skip_tracking = {'id', 'created_at', 'updated_at', 'import_batch_id'}

        # Date fields that need parsing
        date_fields = {
            'order_received_date', 'order_sent_to_factory_date',
            'tech_packs_sent_to_factory', 'specs_sent_to_factory', 'barcodes_sent_to_factory',
            'original_po_ex_factory', 'factory_confirmed_ex_factory',
            'fit_sample_received', 'fit_sample_approved',
            'strike_off_received', 'strike_off_approved',
            'lab_dip_received', 'lab_dip_approved',
            'pps_received', 'pps_sent_to_customer', 'pps_approved',
            'photo_sample_received', 'ex_factory_from_pp_approval',
            'revised_po_ex_factory', 'shipment_sample_received',
            'original_del_date_to_customer',
            'eta_to_uk', 'eta_to_customer',
            'vessel_etd', 'vessel_eta_to_port', 'revised_vessel_eta_to_port',
            'estimated_del_to_customer',
            # Legacy
            'date_approved_to_production', 'actual_date_del_to_uk', 'actual_date_del_to_customer',
        }

        for key, value in order_data.items():
            if key not in ALLOWED_UPDATE_FIELDS:
                continue
            if value is not None and hasattr(order, key):
                old_value = getattr(order, key)

                # Parse datetime for date fields if it's a string
                if (key in date_fields or 'date' in key.lower()) and isinstance(value, str) and value:
                    try:
                        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                    except ValueError:
                        try:
                            value = datetime.strptime(value, '%Y-%m-%d')
                        except ValueError:
                            try:
                                value = datetime.strptime(value, '%d/%m/%Y')
                            except ValueError:
                                continue  # Skip this field if we can't parse the date

                # Track changes for all business fields
                values_different = old_value != value

                if key not in skip_tracking and values_different:
                    role_val = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
                    change_source = "Sourcelab" if role_val != 'supplier' else "Supplier"

                    old_value_str = str(old_value) if old_value is not None else None
                    new_value_str = str(value) if value is not None else None

                    field_change = DateChangeHistory(
                        po_id=order.id,
                        user_id=current_user.id,
                        field_name=key,
                        old_value=old_value_str,
                        new_value=new_value_str,
                        source=change_source
                    )
                    db.add(field_change)

                # Update the field
                setattr(order, key, value)
    
    # Auto-calculate total_quantity from size columns
    size_fields = ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l',
                   'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl',
                   'size_11', 'size_12', 'size_13', 'size_14']
    total_qty = sum(getattr(order, f) or 0 for f in size_fields)
    if total_qty > 0:
        order.total_quantity = total_qty

    # Auto-calculate total_order_value = trade_price × total_quantity
    if order.trade_price is not None and order.total_quantity is not None:
        order.total_order_value = round(order.trade_price * order.total_quantity, 2)

    db.commit()
    db.refresh(order)

    # Broadcast update
    await manager.broadcast({
        "type": "po_updated",
        "data": {"po_id": order.id, "po_number": order.po_number},
        "timestamp": datetime.utcnow().isoformat()
    })

    # Add comment counts before returning
    order.comment_count = db.query(Comment).filter(Comment.po_id == order.id).count()
    read_ids = db.query(CommentRead.comment_id).filter(CommentRead.user_id == current_user.id).subquery()
    order.unread_comment_count = db.query(Comment).filter(
        Comment.po_id == order.id,
        ~Comment.id.in_(read_ids)
    ).count()

    # Return appropriate response based on user role
    if current_user.role == UserRole.SUPPLIER:
        return PurchaseOrderSupplierResponse.from_orm(order)
    else:
        return PurchaseOrderResponse.from_orm(order)


@app.delete("/api/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order(
    order_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a purchase order (admin only)"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {order_id} was not found. It may have already been deleted."
        )

    db.delete(order)
    db.commit()

    return None


# ============================================================================
# COMMENT ENDPOINTS
# ============================================================================

@app.get("/api/orders/{order_id}/comments", response_model=List[CommentResponse])
async def get_order_comments(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all comments for a specific order"""
    # Verify order exists and user has access
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {order_id} was not found. Please refresh the page."
        )

    # Check permissions for supplier users
    if current_user.role == UserRole.SUPPLIER:
        if order.factory != current_user.factory_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only view comments for your factory's orders ({current_user.factory_name})."
            )

    # Get comments with user information
    comments = db.query(Comment).filter(Comment.po_id == order_id).order_by(Comment.created_at.desc()).all()

    # Get set of comment IDs this user has read
    read_ids = set(
        r[0] for r in db.query(CommentRead.comment_id).filter(
            CommentRead.user_id == current_user.id,
            CommentRead.comment_id.in_([c.id for c in comments])
        ).all()
    )

    # Build response with username
    result = []
    for comment in comments:
        user = db.query(User).filter(User.id == comment.user_id).first()
        result.append(CommentResponse(
            id=comment.id,
            po_id=comment.po_id,
            user_id=comment.user_id,
            username=user.username if user else "Unknown",
            comment_text=comment.comment_text,
            source=comment.source or "Sourcelab",
            read=comment.id in read_ids,
            read_by_internal=comment.read_by_internal or False,
            read_by_supplier=comment.read_by_supplier or False,
            created_at=comment.created_at
        ))

    return result


@app.post("/api/orders/{order_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    order_id: int,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a comment to an order"""
    # Verify order exists and user has access
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot add comment - Order with ID {order_id} was not found. The order may have been deleted."
        )

    # Check permissions for supplier users
    if current_user.role == UserRole.SUPPLIER:
        if order.factory != current_user.factory_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You can only add comments to your factory's orders ({current_user.factory_name})."
            )

    # Create comment - mark as read by the user type who created it
    # Get role as string for comparison (handles both enum and string)
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()

    # Check if user is internal/admin (not a supplier)
    is_internal = role_str != 'supplier'
    # Tag as "Supplier" for factory/supplier users, "Sourcelab" for internal/admin
    source_tag = "Sourcelab" if is_internal else "Supplier"
    new_comment = Comment(
        po_id=order_id,
        user_id=current_user.id,
        comment_text=comment_data.comment_text,
        source=source_tag,
        read_by_internal=is_internal,  # Legacy compat
        read_by_supplier=not is_internal  # Legacy compat
    )

    db.add(new_comment)
    db.flush()  # Get the comment ID

    # Mark as read by the creator
    db.add(CommentRead(comment_id=new_comment.id, user_id=current_user.id))
    db.commit()
    db.refresh(new_comment)

    # Broadcast new comment
    await manager.broadcast({
        "type": "comment_added",
        "data": {
            "po_id": order_id,
            "po_number": order.po_number,
            "comment_id": new_comment.id,
            "username": current_user.username,
            "comment_text": new_comment.comment_text
        },
        "timestamp": datetime.utcnow().isoformat()
    })

    # Return properly constructed response
    return CommentResponse(
        id=new_comment.id,
        po_id=new_comment.po_id,
        user_id=new_comment.user_id,
        username=current_user.username,
        comment_text=new_comment.comment_text,
        source=new_comment.source,
        read=True,  # Creator has read their own comment
        read_by_internal=new_comment.read_by_internal or False,
        read_by_supplier=new_comment.read_by_supplier or False,
        created_at=new_comment.created_at
    )


@app.get("/api/orders/{order_id}/history", response_model=List[DateChangeResponse])
async def get_order_history(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get date change history for an order (internal/admin only)"""
    # Suppliers cannot view history
    if current_user.role == UserRole.SUPPLIER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="History is not available for supplier accounts"
        )

    # Verify order exists
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    # Get history with user information
    history = db.query(DateChangeHistory).filter(
        DateChangeHistory.po_id == order_id
    ).order_by(DateChangeHistory.created_at.desc()).all()

    # Build response with username - properly serialize
    # Convert old_value/new_value to strings to handle legacy integer data
    result = []
    for entry in history:
        user = db.query(User).filter(User.id == entry.user_id).first()
        result.append(DateChangeResponse(
            id=entry.id,
            po_id=entry.po_id,
            user_id=entry.user_id,
            username=user.username if user else "Unknown",
            field_name=entry.field_name,
            old_value=str(entry.old_value) if entry.old_value is not None else None,
            new_value=str(entry.new_value) if entry.new_value is not None else None,
            source=entry.source or "Sourcelab",
            approved_by=entry.approved_by_username,
            rejection_reason=entry.rejection_reason,
            created_at=entry.created_at
        ))

    return result


@app.post("/api/orders/{order_id}/comments/mark-read")
async def mark_comments_read(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all comments for an order as read by the current user type"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Check permissions for supplier users
    if current_user.role == UserRole.SUPPLIER:
        if order.factory != current_user.factory_name:
            raise HTTPException(status_code=403, detail="Not authorized")

    # Get all comment IDs for this order
    comment_ids = [c.id for c in db.query(Comment.id).filter(Comment.po_id == order_id).all()]

    if comment_ids:
        # Find which ones this user has already read
        already_read = set(
            r[0] for r in db.query(CommentRead.comment_id).filter(
                CommentRead.user_id == current_user.id,
                CommentRead.comment_id.in_(comment_ids)
            ).all()
        )

        # Insert read records for unread comments
        new_reads = 0
        for cid in comment_ids:
            if cid not in already_read:
                db.add(CommentRead(comment_id=cid, user_id=current_user.id))
                new_reads += 1

        db.commit()
        return {"success": True, "comments_marked": new_reads}

    return {"success": True, "comments_marked": 0}


# ============================================================================
# ORDER COMPONENTS
# ============================================================================

@app.get("/api/orders/{order_id}/components", response_model=List[ComponentResponse])
async def get_order_components(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all components for an order"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    components = db.query(OrderComponent).filter(OrderComponent.order_id == order_id).order_by(OrderComponent.created_at).all()
    return components


@app.post("/api/orders/{order_id}/components", response_model=ComponentResponse, status_code=status.HTTP_201_CREATED)
async def create_component(
    order_id: int,
    data: ComponentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a component to an order"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    component = OrderComponent(order_id=order_id, **data.model_dump(exclude_unset=True))
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


@app.put("/api/components/{component_id}", response_model=ComponentResponse)
async def update_component(
    component_id: int,
    data: ComponentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a component"""
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(component, key, value)
    component.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(component)
    return component


@app.delete("/api/components/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a component"""
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    db.delete(component)
    db.commit()


@app.post("/api/orders/{order_id}/components/bulk-add")
async def bulk_add_component(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a component to selected styles or all styles on the same PO"""
    body = await request.json()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Component name is required")
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # If order_ids provided, use those; otherwise all styles on PO
    order_ids = body.get("order_ids")
    if order_ids:
        sibling_orders = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()
    else:
        sibling_orders = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == order.po_number).all()
    created = 0
    for sib in sibling_orders:
        existing = db.query(OrderComponent).filter(
            OrderComponent.order_id == sib.id,
            OrderComponent.name == name
        ).first()
        if not existing:
            component = OrderComponent(order_id=sib.id, name=name)
            db.add(component)
            created += 1
    db.commit()
    return {"success": True, "components_created": created, "po_number": order.po_number}


@app.post("/api/components/{component_id}/apply-to-po")
async def apply_component_field_to_po(
    component_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apply a component field update to matching components (same name) on selected or all styles on the PO"""
    body = await request.json()
    component = db.query(OrderComponent).filter(OrderComponent.id == component_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == component.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # If order_ids provided, scope to those; otherwise all on PO
    selected_ids = body.pop("order_ids", None)
    if selected_ids:
        sibling_ids = selected_ids
    else:
        sibling_ids = [o.id for o in db.query(PurchaseOrder.id).filter(PurchaseOrder.po_number == order.po_number).all()]
    matching = db.query(OrderComponent).filter(
        OrderComponent.order_id.in_(sibling_ids),
        OrderComponent.name == component.name
    ).all()
    # Remaining keys in body are the fields to update
    update_data = {k: v for k, v in body.items() if k in [
        'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
        'strike_off_status', 'strike_off_received', 'strike_off_approved',
        'lab_dip_status', 'lab_dip_received', 'lab_dip_approved', 'name'
    ]}
    updated = 0
    for comp in matching:
        for key, value in update_data.items():
            setattr(comp, key, value)
        comp.updated_at = datetime.utcnow()
        updated += 1
    db.commit()
    return {"success": True, "components_updated": updated, "po_number": order.po_number}


@app.get("/api/components/styles-with-component")
async def get_styles_with_component(
    po_number: str = Query(...),
    component_name: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all styles on a PO that have a component with a given name"""
    orders = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number).all()
    results = []
    for o in orders:
        comp = db.query(OrderComponent).filter(
            OrderComponent.order_id == o.id,
            OrderComponent.name == component_name
        ).first()
        if comp:
            results.append({
                "id": o.id,
                "style_code": o.style_code or "",
                "description": o.description or "",
                "colour": o.colour or "",
                "component_id": comp.id,
            })
    return {"styles": results}


@app.get("/api/statuses")
async def get_statuses():
    """Get list of available order statuses"""
    return {"statuses": ORDER_STATUSES}


# ============================================================================
# ROLE COLUMN SETTINGS ENDPOINTS
# ============================================================================

# Default columns configuration - matches frontend COLUMNS
DEFAULT_COLUMNS = [
    'po_number', 'system_po_number', 'is_active', 'customer', 'china_orderbook_ref',
    'customer_po_number', 'direct_repeat_new', 'season', 'factory', 'terms', 'sales_person',
    'style_code', 'customer_style_code', 'description', 'colour', 'gender',
    'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l',
    'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl',
    'size_11', 'size_12', 'size_13', 'size_14',
    'total_quantity', 'trade_price', 'total_order_value',
    'order_received_date', 'order_sent_to_factory_date',
    'tech_packs_sent_to_factory', 'specs_sent_to_factory', 'barcodes_sent_to_factory',
    'original_po_ex_factory', 'factory_confirmed_ex_factory',
    'fit_sample_required', 'fit_sample_status', 'fit_sample_received', 'fit_sample_approved',
    'strike_off_status', 'strike_off_received', 'strike_off_approved',
    'lab_dip_status', 'lab_dip_received', 'lab_dip_approved',
    'pps_status', 'pps_received', 'pps_sent_to_customer', 'pps_approved',
    'photo_sample_received', 'ex_factory_from_pp_approval',
    'revised_po_ex_factory', 'shipment_sample_received',
    'original_del_date_to_customer',
    'eta_to_uk', 'eta_to_customer',
    'customer_po_open_month', 'expected_dispatch_arrive_uk_month',
    'fcl_lcl', 'vessel_name', 'vessel_etd', 'vessel_eta_to_port',
    'revised_vessel_eta_to_port', 'estimated_del_to_customer',
    'status',
]

# Default supplier hidden columns (initial defaults)
DEFAULT_SUPPLIER_HIDDEN = [
    'system_po_number', 'is_active', 'trade_price', 'total_order_value', 'order_received_date',
]

# Columns that suppliers can edit (initial defaults)
DEFAULT_SUPPLIER_EDITABLE = [
    'factory_confirmed_ex_factory', 'revised_po_ex_factory',
]


@app.get("/api/settings/role-columns/{role}")
async def get_role_column_settings(
    role: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get column visibility settings for a role"""
    # Get stored settings
    settings = db.query(RoleColumnSettings).filter(RoleColumnSettings.role == role).all()

    # Build response - if no settings exist, use defaults
    if not settings:
        # Return defaults for supplier role
        if role == 'supplier':
            return {
                "role": role,
                "columns": [
                    {
                        "column_key": col,
                        "is_visible": col not in DEFAULT_SUPPLIER_HIDDEN,
                        "is_editable": col in DEFAULT_SUPPLIER_EDITABLE
                    }
                    for col in DEFAULT_COLUMNS
                ]
            }
        else:
            # Internal/admin can see everything
            return {
                "role": role,
                "columns": [
                    {"column_key": col, "is_visible": True, "is_editable": True}
                    for col in DEFAULT_COLUMNS
                ]
            }

    # Return stored settings
    settings_dict = {s.column_key: s for s in settings}
    return {
        "role": role,
        "columns": [
            {
                "column_key": col,
                "is_visible": settings_dict[col].is_visible if col in settings_dict else True,
                "is_editable": settings_dict[col].is_editable if col in settings_dict else False
            }
            for col in DEFAULT_COLUMNS
        ]
    }


@app.put("/api/settings/role-columns/{role}")
async def update_role_column_settings(
    role: str,
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Update column visibility settings for a role (internal/admin only)"""
    columns = data.get("columns", [])

    if not columns:
        raise HTTPException(status_code=400, detail="columns array is required")

    # Delete existing settings for this role
    db.query(RoleColumnSettings).filter(RoleColumnSettings.role == role).delete()

    # Insert new settings
    for col_setting in columns:
        setting = RoleColumnSettings(
            role=role,
            column_key=col_setting["column_key"],
            is_visible=col_setting.get("is_visible", True),
            is_editable=col_setting.get("is_editable", False)
        )
        db.add(setting)

    db.commit()

    return {"success": True, "message": f"Updated {len(columns)} column settings for {role}"}


@app.post("/api/orders/bulk-update-status")
async def bulk_update_status(
    data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Update status for all orders (or selected order IDs) with the same PO number"""
    po_number = data.get("po_number")
    new_status = data.get("status")
    tracking_reference = data.get("tracking_reference")
    order_ids = data.get("order_ids", [])  # Empty list = all orders on PO

    if not po_number or not new_status:
        raise HTTPException(status_code=400, detail="po_number and status are required")

    if new_status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {ORDER_STATUSES}")

    if new_status == "Shipped" and not tracking_reference:
        raise HTTPException(status_code=400, detail="A tracking reference is required when setting status to Shipped")

    # Update all orders with this PO number, or only the selected IDs
    query = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number)
    if order_ids:
        query = query.filter(PurchaseOrder.id.in_(order_ids))
    orders = query.all()

    if not orders:
        raise HTTPException(status_code=404, detail="No orders found with this PO number")

    for order in orders:
        order.status = new_status
        if tracking_reference is not None:
            order.tracking_reference = tracking_reference
        order.updated_at = datetime.utcnow()

    db.commit()

    # Broadcast update
    await manager.broadcast({
        "type": "bulk_status_update",
        "data": {"po_number": po_number, "status": new_status, "count": len(orders)},
        "timestamp": datetime.utcnow().isoformat()
    })

    return {"success": True, "orders_updated": len(orders)}


@app.post("/api/orders/bulk-update-date")
async def bulk_update_date(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a date field for multiple orders with the same PO number.
    - po_number: The PO number to filter orders
    - field_name: The date field to update
    - new_value: The new date value (ISO format string)
    - order_ids: Optional list of specific order IDs to update (empty = all orders on PO)
    """
    po_number = data.get("po_number")
    field_name = data.get("field_name")
    new_value_str = data.get("new_value")
    order_ids = data.get("order_ids", [])  # Empty list means all orders

    if not po_number or not field_name:
        raise HTTPException(status_code=400, detail="po_number and field_name are required")

    # Valid date fields
    date_fields = [
        'order_received_date', 'order_sent_to_factory_date',
        'tech_packs_sent_to_factory', 'specs_sent_to_factory', 'barcodes_sent_to_factory',
        'original_po_ex_factory', 'factory_confirmed_ex_factory',
        'fit_sample_received', 'fit_sample_approved',
        'strike_off_received', 'strike_off_approved',
        'lab_dip_received', 'lab_dip_approved',
        'pps_received', 'pps_sent_to_customer', 'pps_approved',
        'photo_sample_received', 'ex_factory_from_pp_approval',
        'revised_po_ex_factory', 'shipment_sample_received',
        'original_del_date_to_customer',
        'eta_to_uk', 'eta_to_customer',
        'vessel_etd', 'vessel_eta_to_port', 'revised_vessel_eta_to_port',
        'estimated_del_to_customer',
        # Legacy
        'date_approved_to_production', 'actual_date_del_to_uk', 'actual_date_del_to_customer',
    ]

    if field_name not in date_fields:
        raise HTTPException(status_code=400, detail=f"Invalid date field. Must be one of: {date_fields}")

    # Parse the new date value
    new_value = None
    if new_value_str:
        try:
            new_value = datetime.fromisoformat(new_value_str.replace('Z', '+00:00'))
        except ValueError:
            try:
                new_value = datetime.strptime(new_value_str, '%Y-%m-%d')
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Could not parse date value: {new_value_str}")

    # Get orders with this PO number
    query = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number)

    # Filter by specific order IDs if provided
    if order_ids:
        query = query.filter(PurchaseOrder.id.in_(order_ids))

    orders = query.all()

    if not orders:
        raise HTTPException(status_code=404, detail="No orders found with this PO number")

    # Check permissions
    if current_user.role == UserRole.SUPPLIER:
        # Build supplier allowed fields from DB settings, fall back to defaults
        db_settings = db.query(RoleColumnSettings).filter(
            RoleColumnSettings.role == 'supplier',
            RoleColumnSettings.is_editable == True
        ).all()
        if db_settings:
            supplier_allowed_fields = [s.column_key for s in db_settings]
        else:
            supplier_allowed_fields = ['factory_confirmed_ex_factory', 'revised_po_ex_factory']
        if field_name not in supplier_allowed_fields:
            raise HTTPException(status_code=403, detail=f"Suppliers can only edit: {supplier_allowed_fields}")

        # Verify all orders belong to supplier's factory
        for order in orders:
            if order.factory != current_user.factory_name:
                raise HTTPException(status_code=403, detail="Not authorized to update these orders")

    # Determine source tag based on role
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    is_supplier = role_str == 'supplier'

    # For suppliers, create pending changes instead of updating directly
    if is_supplier:
        change_reason = data.get("change_reason", "").strip()
        if not change_reason:
            raise HTTPException(status_code=400, detail="Please provide a reason for the date change")

        pending_count = 0
        for order in orders:
            old_value = getattr(order, field_name)

            # Only create pending if value actually changed
            if old_value != new_value:
                # Check for existing pending change on this field - replace it
                existing_pending = db.query(PendingDateChange).filter(
                    PendingDateChange.order_id == order.id,
                    PendingDateChange.field_name == field_name,
                    PendingDateChange.status == "pending"
                ).first()

                if existing_pending:
                    existing_pending.proposed_value = new_value.strftime('%Y-%m-%d') if new_value else None
                    existing_pending.reason = change_reason
                    existing_pending.submitted_at = datetime.utcnow()
                else:
                    pending_change = PendingDateChange(
                        order_id=order.id,
                        field_name=field_name,
                        current_value=old_value.strftime('%Y-%m-%d') if old_value else None,
                        proposed_value=new_value.strftime('%Y-%m-%d') if new_value else None,
                        reason=change_reason,
                        submitted_by_id=current_user.id,
                        submitted_by_username=current_user.username,
                        status="pending"
                    )
                    db.add(pending_change)

                pending_count += 1

        db.commit()

        return {
            "success": True,
            "pending_approval": True,
            "pending_count": pending_count,
            "message": f"Date change(s) submitted for approval ({pending_count} orders)"
        }

    # For internal/admin users, update directly
    change_source = "Sourcelab"
    updated_count = 0
    for order in orders:
        old_value = getattr(order, field_name)

        # Only update if value actually changed
        if old_value != new_value:
            # Track the change in history (store as strings)
            date_change = DateChangeHistory(
                po_id=order.id,
                user_id=current_user.id,
                field_name=field_name,
                old_value=str(old_value) if old_value is not None else None,
                new_value=str(new_value) if new_value is not None else None,
                source=change_source
            )
            db.add(date_change)

            # Update the field
            setattr(order, field_name, new_value)
            order.updated_at = datetime.utcnow()
            updated_count += 1

    db.commit()

    # Broadcast update
    await manager.broadcast({
        "type": "bulk_date_update",
        "data": {"po_number": po_number, "field_name": field_name, "count": updated_count},
        "timestamp": datetime.utcnow().isoformat()
    })

    return {"success": True, "orders_updated": updated_count}


@app.get("/api/orders/styles-on-po/{po_number}")
async def get_styles_on_po(
    po_number: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all orders/styles on a specific PO number"""
    query = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number)

    # Filter by factory for supplier users
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        query = query.filter(PurchaseOrder.factory == current_user.factory_name)

    orders = query.order_by(PurchaseOrder.style_code).all()

    if not orders:
        raise HTTPException(status_code=404, detail="No orders found with this PO number")

    # Return simplified order info for the bulk update UI
    return {
        "orders": [
            {
                "id": order.id,
                "style_code": order.style_code,
                "description": order.description,
                "colour": order.colour
            }
            for order in orders
        ]
    }


@app.post("/api/orders/bulk-add-comment")
async def bulk_add_comment(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a comment to all orders with the same PO number"""
    po_number = data.get("po_number")
    comment_text = data.get("comment_text")

    if not po_number or not comment_text:
        raise HTTPException(status_code=400, detail="po_number and comment_text are required")

    # Get all orders with this PO number
    orders = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number).all()

    if not orders:
        raise HTTPException(status_code=404, detail="No orders found with this PO number")

    # Check permissions for supplier users
    if current_user.role == UserRole.SUPPLIER:
        # Verify all orders belong to supplier's factory
        for order in orders:
            if order.factory != current_user.factory_name:
                raise HTTPException(status_code=403, detail="Not authorized to comment on these orders")

    # Get role as string for comparison
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    is_internal = role_str != 'supplier'
    # Tag as "Supplier" for factory/supplier users, "Sourcelab" for internal/admin
    source_tag = "Sourcelab" if is_internal else "Supplier"

    # Add comment to each order
    new_comments = []
    for order in orders:
        new_comment = Comment(
            po_id=order.id,
            user_id=current_user.id,
            comment_text=comment_text,
            source=source_tag,
            read_by_internal=is_internal,
            read_by_supplier=not is_internal
        )
        db.add(new_comment)
        new_comments.append(new_comment)

    db.flush()  # Get IDs for all comments

    # Mark all as read by the creator
    for comment in new_comments:
        db.add(CommentRead(comment_id=comment.id, user_id=current_user.id))

    db.commit()

    # Broadcast update
    await manager.broadcast({
        "type": "bulk_comment_added",
        "data": {"po_number": po_number, "count": len(orders), "username": current_user.username},
        "timestamp": datetime.utcnow().isoformat()
    })

    return {"success": True, "comments_added": len(orders)}


# ============================================================================
# EXCEL IMPORT/EXPORT ENDPOINTS
# ============================================================================

@app.post("/api/excel/preview")
async def preview_excel_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Preview what an Excel import will do without committing changes"""
    if not file.filename.endswith(('.xlsx', '.xlsm')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .xlsx or .xlsm format"
        )

    # Read file content
    content = await file.read()

    # Import preview function
    from excel_utils import preview_excel_import as do_preview
    result = do_preview(content, db)

    return result


@app.post("/api/excel/import")
async def import_excel(
    file: UploadFile = File(...),
    conflict_resolutions: Optional[str] = Form(None),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Import purchase orders from Excel file"""
    if not file.filename.endswith(('.xlsx', '.xlsm')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be .xlsx or .xlsm format"
        )

    # Read file content
    content = await file.read()

    # Parse conflict resolutions if provided
    import json
    resolutions = []
    if conflict_resolutions:
        try:
            resolutions = json.loads(conflict_resolutions)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid conflict resolutions format"
            )

    # Generate batch ID for undo tracking
    import uuid
    batch_id = str(uuid.uuid4())

    # Import to database
    result = import_excel_to_database(
        content, db, current_user,
        import_batch_id=batch_id,
        conflict_resolutions=resolutions if resolutions else None
    )

    # Create ImportBatch record if import was successful
    if result.rows_created > 0 or result.rows_updated > 0:
        batch = ImportBatch(
            batch_id=batch_id,
            user_id=current_user.id,
            username=current_user.username,
            filename=file.filename,
            rows_created=result.rows_created,
            rows_updated=result.rows_updated,
        )
        db.add(batch)
        db.commit()

    # Broadcast update
    await manager.broadcast({
        "type": "bulk_import",
        "data": {
            "rows_created": result.rows_created,
            "rows_updated": result.rows_updated,
            "username": current_user.username
        },
        "timestamp": datetime.utcnow().isoformat()
    })

    return {
        "success": result.success,
        "rows_processed": result.rows_processed,
        "rows_created": result.rows_created,
        "rows_updated": result.rows_updated,
        "errors": result.errors,
        "batch_id": batch_id if (result.rows_created > 0 or result.rows_updated > 0) else None,
    }


@app.get("/api/excel/export")
async def export_excel(
    po_number: str = None,
    style_code: str = None,
    factory: str = None,
    customer: str = None,
    status: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export purchase orders to Excel file"""
    try:
        # Check if user is supplier
        role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
        is_supplier = role_str == 'supplier'

        # Build filters dict
        filters = {}
        if po_number:
            filters['po_number'] = po_number
        if style_code:
            filters['style_code'] = style_code
        if factory:
            filters['factory'] = factory
        if customer:
            filters['customer'] = customer
        if status:
            filters['status'] = status

        # For suppliers, always filter by their factory
        factory_filter = current_user.factory_name if is_supplier else None

        # Generate Excel file
        excel_file = export_database_to_excel(
            db,
            factory_filter=factory_filter,
            is_supplier=is_supplier,
            filters=filters if filters else None
        )

        # Prepare filename
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        suffix = "_filtered" if filters else ""
        filename = f"orderbook_export{suffix}_{timestamp}.xlsx"

        # Return as streaming response
        return StreamingResponse(
            excel_file,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Export failed. Please try again or contact an administrator."
        )


@app.get("/api/excel/template")
async def download_template(current_user: User = Depends(get_current_full_internal_user)):
    """Download an empty Excel template for imports"""
    # Create empty template with headers
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from io import BytesIO
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Template"
    
    headers = [
        "PO#", "SYSTEM PO#", "ACTIVE", "CUSTOMER", "China Orderbook Reference",
        "CUSTOMER PO#", "SEASON", "FACTORY", "TERMS", "SALES PERSON", "STYLE CODE",
        "CUSTOMER STYLE CODE", "DESCRIPTION", "COLOUR", "GENDER", "TOTAL",
        "TRADE PRICE", "TOTAL ORDER VALUE", "ORDER RECEIVED DATE",
        "ORDER SENT TO FACTORY DATE", "ORIGINAL PO EX-FACTORY",
        "DATE APPROVED TO PRODUCTION", "REVISED PO EX-FACTORY",
        "ORIGINAL DEL DATE TO CUSTOMER", "CUSTOMER PO OPEN MONTH",
        "EXPECTED DISPATCH ARRIVE TO UK MONTH", "ETA TO UK",
        "ACTUAL DATE DEL TO UK", "ETA TO CUSTOMER", "ACTUAL DATE DEL TO CUSTOMER"
    ]
    
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(1, col_idx, header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=orderbook_template.xlsx"}
    )


# ============================================================================
# IMPORT UNDO ENDPOINTS
# ============================================================================

@app.get("/api/excel/last-import")
async def get_last_import(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get the most recent import batch info (for showing undo button)"""
    batch = db.query(ImportBatch).filter(
        ImportBatch.is_undone == False
    ).order_by(ImportBatch.created_at.desc()).first()

    if not batch:
        return {"batch": None}

    return {
        "batch": {
            "batch_id": batch.batch_id,
            "username": batch.username,
            "filename": batch.filename,
            "rows_created": batch.rows_created,
            "rows_updated": batch.rows_updated,
            "created_at": batch.created_at.isoformat() if batch.created_at else None,
        }
    }


@app.post("/api/excel/undo")
async def undo_last_import(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Undo the most recent Excel import"""
    # Find the latest non-undone batch
    batch = db.query(ImportBatch).filter(
        ImportBatch.is_undone == False
    ).order_by(ImportBatch.created_at.desc()).first()

    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No import found to undo"
        )

    batch_id = batch.batch_id
    orders_deleted = 0
    orders_reverted = 0

    # 1. Delete all PurchaseOrders created by this import
    new_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.import_batch_id == batch_id
    ).all()

    for order in new_orders:
        db.delete(order)
        orders_deleted += 1

    # 2. Revert all field changes from this import using DateChangeHistory
    history_entries = db.query(DateChangeHistory).filter(
        DateChangeHistory.import_batch_id == batch_id
    ).all()

    # Group history entries by PO to count reverted orders
    reverted_po_ids = set()
    for entry in history_entries:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == entry.po_id).first()
        if po:
            # Restore the old value
            field_name = entry.field_name
            old_value_str = entry.old_value

            # Parse old_value back to the correct type
            if old_value_str is None:
                setattr(po, field_name, None)
            elif field_name in ['size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l',
                                'size_xl', 'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl',
                                'size_11', 'size_12', 'size_13', 'size_14',
                                'total_quantity']:
                try:
                    setattr(po, field_name, int(float(old_value_str)))
                except (ValueError, TypeError):
                    setattr(po, field_name, None)
            elif field_name in ['trade_price', 'total_order_value']:
                try:
                    setattr(po, field_name, float(old_value_str))
                except (ValueError, TypeError):
                    setattr(po, field_name, None)
            elif field_name in ['order_received_date', 'order_sent_to_factory_date',
                                'original_po_ex_factory', 'date_approved_to_production',
                                'revised_po_ex_factory', 'original_del_date_to_customer',
                                'eta_to_uk', 'actual_date_del_to_uk',
                                'eta_to_customer', 'actual_date_del_to_customer']:
                from excel_utils import parse_date
                setattr(po, field_name, parse_date(old_value_str))
            else:
                setattr(po, field_name, old_value_str)

            po.updated_at = datetime.utcnow()
            reverted_po_ids.add(entry.po_id)

        # Delete the history entry
        db.delete(entry)

    orders_reverted = len(reverted_po_ids)

    # 3. Mark the batch as undone
    batch.is_undone = True

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to undo import: {str(e)}"
        )

    return {
        "success": True,
        "orders_deleted": orders_deleted,
        "orders_reverted": orders_reverted,
        "batch_id": batch_id,
    }


# ============================================================================
# DATE CHANGE APPROVAL ENDPOINTS
# ============================================================================

@app.get("/api/approvals/pending")
async def get_pending_approvals(
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Get all pending date change approvals (for Sourcelab dashboard)"""
    pending = db.query(PendingDateChange).filter(
        PendingDateChange.status == "pending"
    ).order_by(PendingDateChange.submitted_at.desc()).all()

    # Group by PO number for easier display
    result = {}
    for p in pending:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == p.order_id).first()
        if not order:
            continue
        po_number = order.po_number
        if po_number not in result:
            result[po_number] = {
                "po_number": po_number,
                "factory": order.factory,
                "customer": order.customer,
                "changes": []
            }
        result[po_number]["changes"].append({
            "id": p.id,
            "order_id": p.order_id,
            "style_code": order.style_code,
            "field_name": p.field_name,
            "current_value": p.current_value,
            "proposed_value": p.proposed_value,
            "reason": p.reason,
            "submitted_by": p.submitted_by_username,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
        })

    return {"pending_approvals": list(result.values())}


@app.get("/api/approvals/rejected")
async def get_rejected_approvals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get rejected date changes for the current supplier"""
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()

    if role_str == 'supplier':
        # Supplier sees their own rejected changes
        rejected = db.query(PendingDateChange).filter(
            PendingDateChange.submitted_by_id == current_user.id,
            PendingDateChange.status == "rejected"
        ).order_by(PendingDateChange.reviewed_at.desc()).limit(50).all()
    else:
        # Internal users see all recent rejected changes
        rejected = db.query(PendingDateChange).filter(
            PendingDateChange.status == "rejected"
        ).order_by(PendingDateChange.reviewed_at.desc()).limit(50).all()

    result = []
    for r in rejected:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == r.order_id).first()
        if not order:
            continue
        result.append({
            "id": r.id,
            "po_number": order.po_number,
            "style_code": order.style_code,
            "field_name": r.field_name,
            "current_value": r.current_value,
            "proposed_value": r.proposed_value,
            "reason": r.reason,
            "submitted_by": r.submitted_by_username,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "rejected_by": r.reviewed_by_username,
            "rejected_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
            "rejection_reason": r.rejection_reason
        })

    return {"rejected_changes": result}


@app.post("/api/orders/batch-pending-changes")
async def get_batch_pending_changes(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending date changes for multiple orders in one request"""
    order_ids = body.get("order_ids", [])
    if not order_ids:
        return {"pending_changes": {}}

    pending = db.query(PendingDateChange).filter(
        PendingDateChange.order_id.in_(order_ids),
        PendingDateChange.status == "pending"
    ).all()

    result: dict = {}
    for p in pending:
        if p.order_id not in result:
            result[p.order_id] = []
        result[p.order_id].append({
            "id": p.id,
            "field_name": p.field_name,
            "current_value": p.current_value,
            "proposed_value": p.proposed_value,
            "reason": p.reason,
            "submitted_by": p.submitted_by_username,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
        })

    return {"pending_changes": result}


@app.get("/api/orders/{order_id}/pending-changes")
async def get_order_pending_changes(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending date changes for a specific order"""
    pending = db.query(PendingDateChange).filter(
        PendingDateChange.order_id == order_id,
        PendingDateChange.status == "pending"
    ).all()

    return {
        "pending_changes": [
            {
                "id": p.id,
                "field_name": p.field_name,
                "current_value": p.current_value,
                "proposed_value": p.proposed_value,
                "reason": p.reason,
                "submitted_by": p.submitted_by_username,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
            }
            for p in pending
        ]
    }


@app.post("/api/approvals/{approval_id}/approve")
async def approve_date_change(
    approval_id: int,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Approve a pending date change"""
    pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Pending change not found")
    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="This change has already been processed")

    # Get the order
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == pending.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Parse and apply the new value
    from excel_utils import parse_date
    new_value = parse_date(pending.proposed_value)
    old_value = getattr(order, pending.field_name)

    # Update the order
    setattr(order, pending.field_name, new_value)
    order.updated_at = datetime.utcnow()

    # Create history entry with approver info
    history = DateChangeHistory(
        po_id=order.id,
        user_id=pending.submitted_by_id,
        field_name=pending.field_name,
        old_value=pending.current_value,
        new_value=pending.proposed_value,
        source="Supplier (Approved)",
        approved_by_id=current_user.id,
        approved_by_username=current_user.username
    )
    db.add(history)

    # Update pending status
    pending.status = "approved"
    pending.reviewed_by_id = current_user.id
    pending.reviewed_by_username = current_user.username
    pending.reviewed_at = datetime.utcnow()

    db.commit()

    return {"success": True, "message": "Date change approved"}


@app.post("/api/approvals/{approval_id}/reject")
async def reject_date_change(
    approval_id: int,
    rejection_data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Reject a pending date change"""
    pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
    if not pending:
        raise HTTPException(status_code=404, detail="Pending change not found")
    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="This change has already been processed")

    rejection_reason = rejection_data.get("reason", "").strip()
    if not rejection_reason:
        raise HTTPException(status_code=400, detail="Please provide a reason for rejection")

    # Create history entry for the rejected change
    history = DateChangeHistory(
        po_id=pending.order_id,
        user_id=pending.submitted_by_id,
        field_name=pending.field_name,
        old_value=pending.current_value,
        new_value=pending.proposed_value,
        source="Supplier (Rejected)",
        approved_by_id=current_user.id,
        approved_by_username=current_user.username,
        rejection_reason=rejection_reason
    )
    db.add(history)

    # Update pending status
    pending.status = "rejected"
    pending.reviewed_by_id = current_user.id
    pending.reviewed_by_username = current_user.username
    pending.reviewed_at = datetime.utcnow()
    pending.rejection_reason = rejection_reason

    db.commit()

    return {"success": True, "message": "Date change rejected"}


@app.post("/api/approvals/bulk-approve")
async def bulk_approve_date_changes(
    approval_data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Approve multiple pending date changes at once"""
    approval_ids = approval_data.get("ids", [])
    if not approval_ids:
        raise HTTPException(status_code=400, detail="No approval IDs provided")

    approved_count = 0
    from excel_utils import parse_date

    for approval_id in approval_ids:
        pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
        if not pending or pending.status != "pending":
            continue

        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == pending.order_id).first()
        if not order:
            continue

        # Apply the change
        new_value = parse_date(pending.proposed_value)
        setattr(order, pending.field_name, new_value)
        order.updated_at = datetime.utcnow()

        # Create history entry with approver info
        history = DateChangeHistory(
            po_id=order.id,
            user_id=pending.submitted_by_id,
            field_name=pending.field_name,
            old_value=pending.current_value,
            new_value=pending.proposed_value,
            source="Supplier (Approved)",
            approved_by_id=current_user.id,
            approved_by_username=current_user.username
        )
        db.add(history)

        # Update pending status
        pending.status = "approved"
        pending.reviewed_by_id = current_user.id
        pending.reviewed_by_username = current_user.username
        pending.reviewed_at = datetime.utcnow()

        approved_count += 1

    db.commit()

    return {"success": True, "approved_count": approved_count}


@app.post("/api/approvals/bulk-reject")
async def bulk_reject_date_changes(
    rejection_data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Reject multiple pending date changes at once"""
    approval_ids = rejection_data.get("ids", [])
    reason = rejection_data.get("reason", "").strip()

    if not approval_ids:
        raise HTTPException(status_code=400, detail="No approval IDs provided")
    if not reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    rejected_count = 0

    for approval_id in approval_ids:
        pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()
        if not pending or pending.status != "pending":
            continue

        # Create history entry for the rejected change
        history = DateChangeHistory(
            po_id=pending.order_id,
            user_id=pending.submitted_by_id,
            field_name=pending.field_name,
            old_value=pending.current_value,
            new_value=pending.proposed_value,
            source="Supplier (Rejected)",
            approved_by_id=current_user.id,
            approved_by_username=current_user.username,
            rejection_reason=reason
        )
        db.add(history)

        # Update pending status to rejected
        pending.status = "rejected"
        pending.reviewed_by_id = current_user.id
        pending.reviewed_by_username = current_user.username
        pending.reviewed_at = datetime.utcnow()
        pending.rejection_reason = reason

        rejected_count += 1

    db.commit()

    return {"success": True, "rejected_count": rejected_count}


# ============================================================================
# SUPPLIER APPROVAL DASHBOARD ENDPOINTS
# ============================================================================

@app.get("/api/approvals/my-pending")
async def get_my_pending_changes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending date changes submitted by the current user (for suppliers)"""
    pending = db.query(PendingDateChange).filter(
        PendingDateChange.submitted_by_id == current_user.id,
        PendingDateChange.status == "pending"
    ).order_by(PendingDateChange.submitted_at.desc()).limit(50).all()

    result = []
    for p in pending:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == p.order_id).first()
        if order:
            result.append({
                "id": p.id,
                "order_id": p.order_id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "field_name": p.field_name,
                "current_value": p.current_value,
                "proposed_value": p.proposed_value,
                "reason": p.reason,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None
            })

    return {"pending_changes": result}


@app.get("/api/approvals/my-approved")
async def get_my_approved_changes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get recently approved date changes submitted by the current user"""
    approved = db.query(PendingDateChange).filter(
        PendingDateChange.submitted_by_id == current_user.id,
        PendingDateChange.status == "approved"
    ).order_by(PendingDateChange.reviewed_at.desc()).limit(50).all()

    result = []
    for p in approved:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == p.order_id).first()
        if order:
            result.append({
                "id": p.id,
                "order_id": p.order_id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "field_name": p.field_name,
                "current_value": p.current_value,
                "proposed_value": p.proposed_value,
                "reason": p.reason,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
                "approved_by": p.reviewed_by_username,
                "approved_at": p.reviewed_at.isoformat() if p.reviewed_at else None
            })

    return {"approved_changes": result}


@app.delete("/api/approvals/{approval_id}/cancel")
async def cancel_pending_change(
    approval_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a pending date change (only the submitter can cancel)"""
    pending = db.query(PendingDateChange).filter(PendingDateChange.id == approval_id).first()

    if not pending:
        raise HTTPException(status_code=404, detail="Pending change not found")

    if pending.status != "pending":
        raise HTTPException(status_code=400, detail="This change has already been processed")

    # Only the submitter or internal users can cancel
    if pending.submitted_by_id != current_user.id and current_user.role == UserRole.SUPPLIER:
        raise HTTPException(status_code=403, detail="You can only cancel your own pending changes")

    # Delete the pending change
    db.delete(pending)
    db.commit()

    return {"success": True, "message": "Pending change cancelled"}


# ============================================================================
# WEBSOCKET ENDPOINT FOR REAL-TIME UPDATES
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    """WebSocket endpoint for real-time updates (requires valid JWT token)"""
    # Verify authentication before accepting the connection
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return

    try:
        from auth import decode_access_token
        payload = decode_access_token(token)
        username = payload.get("sub")
        if not username:
            await websocket.close(code=4001, reason="Invalid token")
            return
        # Verify user still exists and is active
        db = next(get_db())
        try:
            user = db.query(User).filter(User.username == username).first()
            if not user or not user.is_active:
                await websocket.close(code=4001, reason="User not found or inactive")
                return
        finally:
            db.close()
    except Exception:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    await manager.connect(websocket)

    try:
        while True:
            # Keep connection alive and listen for messages
            data = await websocket.receive_text()

            # Echo back (or handle client messages if needed)
            await websocket.send_json({
                "type": "pong",
                "timestamp": datetime.utcnow().isoformat()
            })

    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ============================================================================
# STATISTICS / DASHBOARD ENDPOINTS
# ============================================================================

@app.get("/api/stats/dashboard")
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics"""
    # Build base filter for supplier users
    base_filter = []
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        base_filter.append(PurchaseOrder.factory == current_user.factory_name)

    def count_by_status(statuses: list) -> int:
        """Count unique PO numbers with given status(es)"""
        query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
            PurchaseOrder.status.in_(statuses)
        )
        for f in base_filter:
            query = query.filter(f)
        return query.scalar() or 0

    # Total orders - count unique PO numbers (not lines)
    total_query = db.query(func.count(func.distinct(PurchaseOrder.po_number)))
    for f in base_filter:
        total_query = total_query.filter(f)
    total_orders = total_query.scalar() or 0

    # Status-based counts
    orders_in_production = count_by_status(["In Production", "QC Passed"])
    orders_shipped = count_by_status(["Shipped", "In Transit"])
    orders_delivered = count_by_status(["Delivered to UK", "Delivered to Customer"])
    orders_pending_approval = count_by_status(["Pending", "Confirmed"])
    orders_cancelled = count_by_status(["Cancelled"])
    orders_on_hold = count_by_status(["On Hold"])

    # Overdue orders - orders that are late (is_late flag or past ex-factory date without delivery)
    overdue_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
        or_(
            PurchaseOrder.is_late == True,
            PurchaseOrder.status == "Delayed"
        )
    )
    for f in base_filter:
        overdue_query = overdue_query.filter(f)
    overdue_orders = overdue_query.scalar() or 0

    # Total open order value (not shipped/tracked, not cancelled) - internal/admin users only
    total_open_value = 0
    if current_user.role in [UserRole.INTERNAL, UserRole.ADMIN]:
        value_query = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.tracking_reference.is_(None),
            PurchaseOrder.status != "Cancelled"
        )
        for f in base_filter:
            value_query = value_query.filter(f)
        total_open_value = value_query.scalar() or 0

    # Orders this month
    first_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
        PurchaseOrder.created_at >= first_of_month
    )
    for f in base_filter:
        this_month_query = this_month_query.filter(f)
    orders_this_month = this_month_query.scalar() or 0

    # Active orders - count unique PO numbers where at least one line is active
    active_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(PurchaseOrder.is_active == True)
    for f in base_filter:
        active_query = active_query.filter(f)
    active_orders = active_query.scalar() or 0

    # Late orders - count unique PO numbers where at least one line is late
    late_query = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(PurchaseOrder.is_late == True)
    for f in base_filter:
        late_query = late_query.filter(f)
    late_orders = late_query.scalar() or 0

    # Recent comments (last 7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_comments_count = db.query(Comment).filter(
        Comment.created_at >= seven_days_ago
    ).count()

    # Orders by customer (top 5) - count unique PO numbers per customer
    customer_query = db.query(
        PurchaseOrder.customer,
        func.count(func.distinct(PurchaseOrder.po_number)).label('count')
    )
    for f in base_filter:
        customer_query = customer_query.filter(f)
    orders_by_customer = customer_query.group_by(PurchaseOrder.customer).order_by(func.count(func.distinct(PurchaseOrder.po_number)).desc()).limit(5).all()

    return {
        "total_orders": total_orders,
        "active_orders": active_orders,
        "late_orders": late_orders,
        "orders_in_production": orders_in_production,
        "orders_shipped": orders_shipped,
        "orders_delivered": orders_delivered,
        "orders_pending_approval": orders_pending_approval,
        "orders_cancelled": orders_cancelled,
        "orders_on_hold": orders_on_hold,
        "overdue_orders": overdue_orders,
        "total_open_value": float(total_open_value) if total_open_value else 0,
        "orders_this_month": orders_this_month,
        "recent_comments": recent_comments_count,
        "top_customers": [{"customer": c[0], "count": c[1]} for c in orders_by_customer],
        "user_role": current_user.role.value,
        "factory": current_user.factory_name
    }


@app.get("/api/stats/recent-activity")
async def get_recent_activity(
    limit: int = 15,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a unified recent activity feed combining field changes and comments"""
    base_filter = []
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        base_filter.append(PurchaseOrder.factory == current_user.factory_name)

    # Get recent field changes (excluding import batches for cleaner feed)
    changes_query = db.query(DateChangeHistory, PurchaseOrder, User).join(
        PurchaseOrder, DateChangeHistory.po_id == PurchaseOrder.id
    ).join(
        User, DateChangeHistory.user_id == User.id
    ).filter(
        DateChangeHistory.import_batch_id.is_(None)
    )
    for f in base_filter:
        changes_query = changes_query.filter(f)
    recent_changes = changes_query.order_by(
        DateChangeHistory.created_at.desc()
    ).limit(limit).all()

    # Get recent comments
    comments_query = db.query(Comment, PurchaseOrder, User).join(
        PurchaseOrder, Comment.po_id == PurchaseOrder.id
    ).join(
        User, Comment.user_id == User.id
    )
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        comments_query = comments_query.filter(
            PurchaseOrder.factory == current_user.factory_name
        )
    recent_comments = comments_query.order_by(
        Comment.created_at.desc()
    ).limit(limit).all()

    # Merge into unified feed
    events = []

    for change, order, user in recent_changes:
        events.append({
            "type": "field_change",
            "username": user.username,
            "user_initials": user.username[:2].upper(),
            "po_number": order.po_number,
            "style_code": order.style_code,
            "field_name": change.field_name,
            "old_value": change.old_value,
            "new_value": change.new_value,
            "source": change.source,
            "created_at": change.created_at.isoformat() if change.created_at else None,
        })

    for comment, order, user in recent_comments:
        events.append({
            "type": "comment",
            "username": user.username,
            "user_initials": user.username[:2].upper(),
            "po_number": order.po_number,
            "style_code": order.style_code,
            "comment_text": comment.comment_text[:80] + ("..." if len(comment.comment_text) > 80 else ""),
            "source": comment.source,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        })

    # Sort by created_at descending and take top N
    events.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    events = events[:limit]

    return {"events": events}


@app.get("/api/stats/activity-summary")
async def get_activity_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of changes since user's last login (for internal/admin users)"""
    # Use last_login as the cutoff, or 24 hours ago if never logged in before
    since = current_user.last_login or (datetime.utcnow() - timedelta(hours=24))

    # Build base filter for supplier users
    base_filter = []
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        base_filter.append(PurchaseOrder.factory == current_user.factory_name)

    # New orders created since last login
    new_orders_query = db.query(PurchaseOrder).filter(PurchaseOrder.created_at > since)
    for f in base_filter:
        new_orders_query = new_orders_query.filter(f)
    new_orders = new_orders_query.order_by(PurchaseOrder.created_at.desc()).limit(20).all()

    # Orders updated since last login (but not newly created)
    updated_orders_query = db.query(PurchaseOrder).filter(
        PurchaseOrder.updated_at > since,
        PurchaseOrder.created_at <= since
    )
    for f in base_filter:
        updated_orders_query = updated_orders_query.filter(f)
    updated_orders = updated_orders_query.order_by(PurchaseOrder.updated_at.desc()).limit(20).all()

    # New comments since last login
    comments_query = db.query(Comment).filter(Comment.created_at > since)
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        # Filter comments to only those on orders belonging to supplier's factory
        comments_query = comments_query.join(PurchaseOrder).filter(
            PurchaseOrder.factory == current_user.factory_name
        )
    new_comments = comments_query.order_by(Comment.created_at.desc()).limit(30).all()

    # Build comment summary with PO info
    comment_details = []
    for comment in new_comments:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == comment.po_id).first()
        user = db.query(User).filter(User.id == comment.user_id).first()
        if order:
            comment_details.append({
                "id": comment.id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "comment_text": comment.comment_text[:100] + "..." if len(comment.comment_text) > 100 else comment.comment_text,
                "source": comment.source,
                "username": user.username if user else "Unknown",
                "created_at": comment.created_at.isoformat()
            })

    # Group new orders by PO number for cleaner display
    new_po_summary = {}
    for order in new_orders:
        if order.po_number not in new_po_summary:
            new_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "created_at": order.created_at.isoformat()
            }
        new_po_summary[order.po_number]["styles"].append(order.style_code)

    # Group updated orders by PO number
    updated_po_summary = {}
    for order in updated_orders:
        if order.po_number not in updated_po_summary:
            updated_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "updated_at": order.updated_at.isoformat()
            }
        updated_po_summary[order.po_number]["styles"].append(order.style_code)

    return {
        "since": since.isoformat(),
        "new_orders": {
            "count": len(new_orders),
            "po_count": len(new_po_summary),
            "orders": list(new_po_summary.values())[:10]
        },
        "updated_orders": {
            "count": len(updated_orders),
            "po_count": len(updated_po_summary),
            "orders": list(updated_po_summary.values())[:10]
        },
        "new_comments": {
            "count": len(new_comments),
            "comments": comment_details[:15]
        }
    }


@app.get("/api/stats/missed-activity")
async def get_missed_activity(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of changes that happened while the user was logged out (between previous_login and last_login)"""
    # Need both timestamps to define the window
    if not current_user.previous_login or not current_user.last_login:
        return {
            "since": None,
            "until": None,
            "new_orders": {"count": 0, "po_count": 0, "orders": []},
            "updated_orders": {"count": 0, "po_count": 0, "orders": []},
            "new_comments": {"count": 0, "comments": []},
        }

    since = current_user.previous_login
    until = current_user.last_login

    # Build base filter for supplier users
    base_filter = []
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        base_filter.append(PurchaseOrder.factory == current_user.factory_name)

    # New orders created in the window
    new_orders_query = db.query(PurchaseOrder).filter(
        PurchaseOrder.created_at > since,
        PurchaseOrder.created_at <= until,
    )
    for f in base_filter:
        new_orders_query = new_orders_query.filter(f)
    new_orders = new_orders_query.order_by(PurchaseOrder.created_at.desc()).limit(20).all()

    # Orders updated in the window (but not newly created in that window)
    updated_orders_query = db.query(PurchaseOrder).filter(
        PurchaseOrder.updated_at > since,
        PurchaseOrder.updated_at <= until,
        PurchaseOrder.created_at <= since,
    )
    for f in base_filter:
        updated_orders_query = updated_orders_query.filter(f)
    updated_orders = updated_orders_query.order_by(PurchaseOrder.updated_at.desc()).limit(20).all()

    # New comments in the window
    comments_query = db.query(Comment).filter(
        Comment.created_at > since,
        Comment.created_at <= until,
    )
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        comments_query = comments_query.join(PurchaseOrder).filter(
            PurchaseOrder.factory == current_user.factory_name
        )
    new_comments = comments_query.order_by(Comment.created_at.desc()).limit(30).all()

    # Build comment summary with PO info
    comment_details = []
    for comment in new_comments:
        order = db.query(PurchaseOrder).filter(PurchaseOrder.id == comment.po_id).first()
        user = db.query(User).filter(User.id == comment.user_id).first()
        if order:
            comment_details.append({
                "id": comment.id,
                "po_number": order.po_number,
                "style_code": order.style_code,
                "comment_text": comment.comment_text[:100] + "..." if len(comment.comment_text) > 100 else comment.comment_text,
                "source": comment.source,
                "username": user.username if user else "Unknown",
                "created_at": comment.created_at.isoformat()
            })

    # Group new orders by PO number
    new_po_summary = {}
    for order in new_orders:
        if order.po_number not in new_po_summary:
            new_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "created_at": order.created_at.isoformat()
            }
        new_po_summary[order.po_number]["styles"].append(order.style_code)

    # Group updated orders by PO number
    updated_po_summary = {}
    for order in updated_orders:
        if order.po_number not in updated_po_summary:
            updated_po_summary[order.po_number] = {
                "po_number": order.po_number,
                "customer": order.customer,
                "factory": order.factory,
                "styles": [],
                "updated_at": order.updated_at.isoformat()
            }
        updated_po_summary[order.po_number]["styles"].append(order.style_code)

    return {
        "since": since.isoformat(),
        "until": until.isoformat(),
        "new_orders": {
            "count": len(new_orders),
            "po_count": len(new_po_summary),
            "orders": list(new_po_summary.values())[:10]
        },
        "updated_orders": {
            "count": len(updated_orders),
            "po_count": len(updated_po_summary),
            "orders": list(updated_po_summary.values())[:10]
        },
        "new_comments": {
            "count": len(new_comments),
            "comments": comment_details[:15]
        }
    }


@app.get("/api/factories")
async def get_factories(
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Get list of unique factories from orders (internal/admin only)"""
    factories = db.query(PurchaseOrder.factory).filter(
        PurchaseOrder.factory.isnot(None),
        PurchaseOrder.factory != ''
    ).distinct().order_by(PurchaseOrder.factory).all()

    return {"factories": [f[0] for f in factories if f[0]]}


@app.get("/api/stats/po-summary")
async def get_po_summary(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summary of recent POs grouped by PO number for dashboard"""
    # Base query - group by PO number
    query = db.query(PurchaseOrder)

    # Filter by factory for supplier users
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        query = query.filter(PurchaseOrder.factory == current_user.factory_name)

    # Get unique PO numbers with aggregated data
    po_summary = db.query(
        PurchaseOrder.po_number,
        PurchaseOrder.customer,
        PurchaseOrder.factory,
        func.count(PurchaseOrder.id).label('line_count'),
        func.sum(PurchaseOrder.total_quantity).label('total_qty'),
        func.sum(PurchaseOrder.total_order_value).label('total_value'),
        func.min(PurchaseOrder.original_po_ex_factory).label('earliest_ex_factory'),
        func.max(PurchaseOrder.created_at).label('latest_update'),
        func.max(PurchaseOrder.status).label('status'),
    )

    # Apply factory filter for suppliers
    if current_user.role == UserRole.SUPPLIER and current_user.factory_name:
        po_summary = po_summary.filter(PurchaseOrder.factory == current_user.factory_name)

    po_summary = po_summary.group_by(
        PurchaseOrder.po_number,
        PurchaseOrder.customer,
        PurchaseOrder.factory
    ).order_by(func.max(PurchaseOrder.created_at).desc()).limit(limit).all()

    # Format response
    is_supplier = current_user.role == UserRole.SUPPLIER
    return {
        "po_summaries": [
            {
                "po_number": po.po_number,
                "customer": po.customer,
                "factory": po.factory,
                "line_count": po.line_count,
                "total_qty": po.total_qty or 0,
                **({"total_value": float(po.total_value or 0)} if not is_supplier else {}),
                "earliest_ex_factory": po.earliest_ex_factory.isoformat() if po.earliest_ex_factory else None,
                "latest_update": po.latest_update.isoformat() if po.latest_update else None,
                "status": po.status,
            }
            for po in po_summary
        ]
    }


# =============================================================================
# ANALYTICS ENDPOINTS
# =============================================================================

@app.get("/api/analytics/overview")
async def get_analytics_overview(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get high-level analytics overview"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    start_date = now - relativedelta(months=months)

    # Total orders (unique PO numbers) and value
    total_orders = db.query(func.count(func.distinct(PurchaseOrder.po_number))).scalar() or 0
    total_lines = db.query(func.count(PurchaseOrder.id)).scalar() or 0
    total_value = db.query(func.sum(PurchaseOrder.total_order_value)).scalar() or 0
    total_quantity = db.query(func.sum(PurchaseOrder.total_quantity)).scalar() or 0

    # Orders by status (count unique PO numbers)
    status_counts = db.query(
        PurchaseOrder.status,
        func.count(func.distinct(PurchaseOrder.po_number))
    ).group_by(PurchaseOrder.status).all()

    # On-time vs late (unique PO numbers)
    on_time = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(
        or_(PurchaseOrder.is_late == False, PurchaseOrder.is_late.is_(None))
    ).scalar() or 0
    late = db.query(func.count(func.distinct(PurchaseOrder.po_number))).filter(PurchaseOrder.is_late == True).scalar() or 0

    # Average order value
    avg_order_value = db.query(func.avg(PurchaseOrder.total_order_value)).scalar() or 0

    # Unique factories and customers
    factory_count = db.query(func.count(func.distinct(PurchaseOrder.factory))).scalar() or 0
    customer_count = db.query(func.count(func.distinct(PurchaseOrder.customer))).scalar() or 0

    return {
        "total_orders": total_orders,
        "total_lines": total_lines,
        "total_value": float(total_value),
        "total_quantity": int(total_quantity) if total_quantity else 0,
        "avg_order_value": float(avg_order_value),
        "on_time_orders": on_time,
        "late_orders": late,
        "on_time_rate": round((on_time / total_orders * 100) if total_orders > 0 else 0, 1),
        "factory_count": factory_count,
        "customer_count": customer_count,
        "status_breakdown": {s[0] or "Unknown": s[1] for s in status_counts}
    }


@app.get("/api/analytics/orders-over-time")
async def get_orders_over_time(
    months: int = Query(12, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get order counts and values by month"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    data = []

    for i in range(months - 1, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if i > 0:
            month_end = (now - relativedelta(months=i-1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            month_end = now

        order_count = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end
        ).scalar() or 0

        order_value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end
        ).scalar() or 0

        data.append({
            "month": month_start.strftime("%b %Y"),
            "orders": order_count,
            "value": float(order_value)
        })

    return {"data": data}


@app.get("/api/analytics/factory-performance")
async def get_factory_performance(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get performance metrics by factory"""
    factories = db.query(PurchaseOrder.factory).filter(
        PurchaseOrder.factory.isnot(None),
        PurchaseOrder.factory != ''
    ).distinct().all()

    performance = []
    for (factory,) in factories:
        # Total orders for this factory
        total = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.factory == factory
        ).scalar() or 0

        # Late orders
        late = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.factory == factory,
            PurchaseOrder.is_late == True
        ).scalar() or 0

        # Total value
        value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.factory == factory
        ).scalar() or 0

        # Date changes for this factory
        date_changes = db.query(func.count(DateChangeHistory.id)).join(
            PurchaseOrder, DateChangeHistory.po_id == PurchaseOrder.id
        ).filter(PurchaseOrder.factory == factory).scalar() or 0

        on_time_rate = round(((total - late) / total * 100) if total > 0 else 0, 1)

        performance.append({
            "factory": factory,
            "total_orders": total,
            "late_orders": late,
            "on_time_rate": on_time_rate,
            "total_value": float(value),
            "date_changes": date_changes,
            "changes_per_order": round(date_changes / total, 2) if total > 0 else 0
        })

    # Sort by total orders descending
    performance.sort(key=lambda x: x["total_orders"], reverse=True)

    return {"factories": performance}


@app.get("/api/analytics/customer-analytics")
async def get_customer_analytics(
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get analytics by customer"""
    customers = db.query(
        PurchaseOrder.customer,
        func.count(func.distinct(PurchaseOrder.po_number)).label('order_count'),
        func.sum(PurchaseOrder.total_order_value).label('total_value'),
        func.sum(PurchaseOrder.total_quantity).label('total_quantity'),
        func.count(func.distinct(case((PurchaseOrder.is_late == True, PurchaseOrder.po_number)))).label('late_count')
    ).filter(
        PurchaseOrder.customer.isnot(None),
        PurchaseOrder.customer != ''
    ).group_by(PurchaseOrder.customer).order_by(
        func.sum(PurchaseOrder.total_order_value).desc()
    ).limit(limit).all()

    return {
        "customers": [
            {
                "customer": c.customer,
                "order_count": c.order_count,
                "total_value": float(c.total_value or 0),
                "total_quantity": int(c.total_quantity or 0),
                "late_count": c.late_count,
                "on_time_rate": round(((c.order_count - c.late_count) / c.order_count * 100) if c.order_count > 0 else 0, 1)
            }
            for c in customers
        ]
    }


@app.get("/api/analytics/delivery-performance")
async def get_delivery_performance(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get delivery performance metrics over time"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    data = []

    for i in range(months - 1, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if i > 0:
            month_end = (now - relativedelta(months=i-1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            month_end = now

        on_time = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end,
            or_(PurchaseOrder.is_late == False, PurchaseOrder.is_late.is_(None))
        ).scalar() or 0

        late = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.created_at >= month_start,
            PurchaseOrder.created_at < month_end,
            PurchaseOrder.is_late == True
        ).scalar() or 0

        total = on_time + late

        data.append({
            "month": month_start.strftime("%b %Y"),
            "on_time": on_time,
            "late": late,
            "total": total,
            "on_time_rate": round((on_time / total * 100) if total > 0 else 0, 1)
        })

    return {"data": data}


@app.get("/api/analytics/date-changes")
async def get_date_change_analytics(
    months: int = Query(6, ge=1, le=24),
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get date change analytics"""
    from dateutil.relativedelta import relativedelta

    now = datetime.utcnow()
    start_date = now - relativedelta(months=months)

    # Total date changes
    total_changes = db.query(func.count(DateChangeHistory.id)).filter(
        DateChangeHistory.created_at >= start_date
    ).scalar() or 0

    # Changes by field
    changes_by_field = db.query(
        DateChangeHistory.field_name,
        func.count(DateChangeHistory.id)
    ).filter(
        DateChangeHistory.created_at >= start_date
    ).group_by(DateChangeHistory.field_name).all()

    # Changes by factory
    changes_by_factory = db.query(
        PurchaseOrder.factory,
        func.count(DateChangeHistory.id).label('change_count')
    ).join(
        PurchaseOrder, DateChangeHistory.po_id == PurchaseOrder.id
    ).filter(
        DateChangeHistory.created_at >= start_date,
        PurchaseOrder.factory.isnot(None)
    ).group_by(PurchaseOrder.factory).order_by(
        func.count(DateChangeHistory.id).desc()
    ).limit(10).all()

    # Changes over time
    changes_over_time = []
    for i in range(months - 1, -1, -1):
        month_start = (now - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if i > 0:
            month_end = (now - relativedelta(months=i-1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            month_end = now

        count = db.query(func.count(DateChangeHistory.id)).filter(
            DateChangeHistory.created_at >= month_start,
            DateChangeHistory.created_at < month_end
        ).scalar() or 0

        changes_over_time.append({
            "month": month_start.strftime("%b %Y"),
            "changes": count
        })

    return {
        "total_changes": total_changes,
        "changes_by_field": {f[0]: f[1] for f in changes_by_field},
        "changes_by_factory": [{"factory": f[0], "changes": f[1]} for f in changes_by_factory],
        "changes_over_time": changes_over_time
    }


@app.get("/api/analytics/pipeline")
async def get_order_pipeline(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get order pipeline/funnel data"""
    # Define pipeline stages
    stages = [
        ("Pending", ["Pending", "Pending Approval", "New"]),
        ("In Production", ["In Production", "Production", "Manufacturing"]),
        ("Shipped", ["Shipped", "In Transit", "Dispatched"]),
        ("Delivered", ["Delivered", "Complete", "Completed"]),
        ("Delayed", ["Delayed", "Late", "On Hold"]),
        ("Cancelled", ["Cancelled", "Canceled"])
    ]

    pipeline = []
    for stage_name, statuses in stages:
        count = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.status.in_(statuses)
        ).scalar() or 0

        value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            PurchaseOrder.status.in_(statuses)
        ).scalar() or 0

        pipeline.append({
            "stage": stage_name,
            "count": count,
            "value": float(value)
        })

    # Also count orders without status
    no_status = db.query(func.count(PurchaseOrder.id)).filter(
        or_(PurchaseOrder.status.is_(None), PurchaseOrder.status == '')
    ).scalar() or 0

    if no_status > 0:
        no_status_value = db.query(func.sum(PurchaseOrder.total_order_value)).filter(
            or_(PurchaseOrder.status.is_(None), PurchaseOrder.status == '')
        ).scalar() or 0
        pipeline.append({
            "stage": "No Status",
            "count": no_status,
            "value": float(no_status_value or 0)
        })

    return {"pipeline": pipeline}


@app.get("/api/analytics/alerts")
async def get_analytics_alerts(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get orders that need attention"""
    now = datetime.utcnow()

    # Orders with ex-factory date in past but not shipped
    overdue_production = db.query(PurchaseOrder).filter(
        PurchaseOrder.revised_po_ex_factory < now,
        ~PurchaseOrder.status.in_(["Shipped", "Delivered", "Complete", "Completed", "Cancelled"])
    ).order_by(PurchaseOrder.revised_po_ex_factory.asc()).limit(10).all()

    # Orders with no updates in 14 days
    stale_date = now - timedelta(days=14)
    stale_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.updated_at < stale_date,
        ~PurchaseOrder.status.in_(["Delivered", "Complete", "Completed", "Cancelled"])
    ).order_by(PurchaseOrder.updated_at.asc()).limit(10).all()

    # Deliveries expected this week
    week_end = now + timedelta(days=7)
    upcoming_deliveries = db.query(PurchaseOrder).filter(
        PurchaseOrder.eta_to_uk >= now,
        PurchaseOrder.eta_to_uk <= week_end
    ).order_by(PurchaseOrder.eta_to_uk.asc()).limit(10).all()

    def order_to_dict(o):
        return {
            "id": o.id,
            "po_number": o.po_number,
            "style_code": o.style_code,
            "customer": o.customer,
            "factory": o.factory,
            "status": o.status,
            "revised_po_ex_factory": o.revised_po_ex_factory.isoformat() if o.revised_po_ex_factory else None,
            "eta_to_uk": o.eta_to_uk.isoformat() if o.eta_to_uk else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None
        }

    return {
        "overdue_production": [order_to_dict(o) for o in overdue_production],
        "stale_orders": [order_to_dict(o) for o in stale_orders],
        "upcoming_deliveries": [order_to_dict(o) for o in upcoming_deliveries]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
