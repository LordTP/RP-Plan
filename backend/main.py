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
from models import User, PurchaseOrder, Comment, CommentRead, CommentMention, DateChangeHistory, UserRole, ORDER_STATUSES, RoleColumnSettings, ImportBatch, PendingDateChange, OrderComponent, AppSetting
import app_settings
from schemas import (
    UserCreate, UserLogin, UserResponse, Token,
    PurchaseOrderCreate, PurchaseOrderResponse, PurchaseOrderUpdate, PurchaseOrderList,
    PurchaseOrderSupplierResponse, PurchaseOrderSupplierUpdate,
    CommentCreate, CommentResponse, CommentReadBy, MentionableUser,
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
from sample_helpers import (
    is_sample_done,
    sample_needs_work,
    business_days_between,
    reconcile_sample_status,
    SAMPLE_PREFIXES_ORDER,
    SAMPLE_PREFIXES_COMPONENT,
)
import email_service
from dashboard_warnings import router as dashboard_warnings_router
from supplier_access import apply_supplier_filter, supplier_filter_clause, assert_supplier_can_access

# Initialize FastAPI app
app = FastAPI(
    title="China Orderbook Portal API",
    description="Backend API for managing purchase orders, comments, and supplier collaboration",
    version="1.0.0"
)

app.include_router(dashboard_warnings_router)

# Endpoint routers (split out of main.py)
from routers import users as users_router
from routers import components as components_router
from routers import tracking as tracking_router
from routers import settings as settings_router
from routers import comments as comments_router
from routers import approvals as approvals_router
from routers import excel as excel_router
from routers import stats as stats_router
from routers import analytics as analytics_router
from routers import orders as orders_router
app.include_router(users_router.router)
app.include_router(components_router.router)
app.include_router(tracking_router.router)
app.include_router(settings_router.router)
app.include_router(comments_router.router)
app.include_router(approvals_router.router)
app.include_router(excel_router.router)
app.include_router(stats_router.router)
app.include_router(analytics_router.router)
app.include_router(orders_router.router)

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


from realtime import manager, login_limiter


# ============================================================================
# STARTUP / HEALTH CHECK
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    init_db()

    # Migration: add full_name column to users if missing
    from sqlalchemy import inspect, text
    from database import engine, SessionLocal
    inspector = inspect(engine)
    user_columns = [c['name'] for c in inspector.get_columns('users')]
    if 'full_name' not in user_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(100)"))
        print("✓ Added full_name column to users table")

    # Migration: add mentionable flag to users (default true so existing users stay visible)
    if 'mentionable' not in user_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN mentionable BOOLEAN DEFAULT TRUE"))
            # Backfill NULL -> TRUE in case the default wasn't applied to existing rows
            conn.execute(text("UPDATE users SET mentionable = TRUE WHERE mentionable IS NULL"))
        print("✓ Added mentionable column to users table")

    # Migration: add component_name column to date_change_history for per-component changes
    history_columns = [c['name'] for c in inspector.get_columns('date_change_history')]
    if 'component_name' not in history_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE date_change_history ADD COLUMN component_name VARCHAR(100)"))
        print("✓ Added component_name column to date_change_history table")

    # Seed default app_settings rows
    seed_db = SessionLocal()
    try:
        app_settings.seed_defaults(seed_db)
    finally:
        seed_db.close()

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






if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
