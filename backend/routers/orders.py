"""Purchase order endpoints — list / detail / create / update / delete,
bulk status + bulk date updates, styles-on-PO, and recent-changes.

The PUT endpoint is the big one: supplier pending-change flow, field-change
history logging, auto-calc chain (total_qty, total_order_value, ETA UK/
customer, estimated_del_to_customer, month fields, ex_factory_from_pp_approval),
and the reconcile_sample_status invariant."""
import json
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, distinct
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, UserRole, PurchaseOrder, Comment, CommentRead, DateChangeHistory,
    PendingDateChange, ORDER_STATUSES, RoleColumnSettings,
)
from schemas import (
    PurchaseOrderCreate, PurchaseOrderResponse,
    PurchaseOrderSupplierResponse,
)
from routers.components import decorate_orders_with_attempts
from routers.submissions import sync_submission_on_status_change, STATUS_FIELD_TO_SAMPLE_TYPE
from auth import (
    get_current_user, get_current_internal_user, get_current_full_internal_user,
    get_current_admin_user,
)
from supplier_access import (
    apply_supplier_filter, supplier_filter_clause, assert_supplier_can_access,
)
from date_notes import DATE_NOTE_FIELDS, apply_date_field
from sample_helpers import (
    reconcile_sample_status,
    SAMPLE_PREFIXES_ORDER,
    SAMPLE_PREFIXES_COMPONENT,
)
from realtime import manager


router = APIRouter()


# Sentinel the frontend sends when the user has ticked "(Blanks)" in a
# column filter dropdown — exact-match IN can't catch NULL otherwise.
BLANK_SENTINEL = "__BLANK__"

# Columns the frontend can filter on. Anything not in this set is rejected,
# both for the listing endpoint and the distinct-values endpoint. Keeps the
# query safe from arbitrary-column SQL exposure.
FILTERABLE_COLUMNS = {
    # MERCH
    'po_number', 'system_po_number', 'is_active', 'customer',
    'china_orderbook_ref', 'customer_po_number', 'direct_repeat_new',
    'season', 'factory', 'terms', 'sales_person', 'style_code',
    # Derived field — handled specially below (no real DB column to filter on).
    'style_base',
    'customer_style_code', 'description', 'colour', 'gender',
    # Status / sample statuses
    'status', 'fit_sample_required', 'fit_sample_status',
    'strike_off_status', 'lab_dip_status', 'pps_status',
    # Dates — ISO formatted on the wire
    'order_received_date', 'order_sent_to_factory_date',
    'tech_packs_sent_to_factory', 'specs_sent_to_factory',
    'barcodes_sent_to_factory', 'original_po_ex_factory',
    'factory_confirmed_ex_factory', 'fit_sample_received',
    'fit_sample_approved', 'strike_off_received', 'strike_off_approved',
    'lab_dip_received', 'lab_dip_approved', 'pps_received',
    'pps_sent_to_customer', 'pps_approved', 'photo_sample_received',
    'ex_factory_from_pp_approval', 'revised_po_ex_factory',
    'shipment_sample_received', 'original_del_date_to_customer',
    'eta_to_uk', 'eta_to_customer', 'customer_po_open_month',
    'expected_dispatch_arrive_uk_month',
    # Shipping
    'fcl_lcl', 'vessel_name', 'vessel_etd', 'vessel_eta_to_port',
    'revised_vessel_eta_to_port', 'estimated_del_to_customer',
    'tracking_reference',
    # Numerics
    'total_quantity', 'trade_price', 'total_order_value',
}

# Columns whose values are dates — frontend sends ISO yyyy-mm-dd strings,
# we need to compare against the date portion of the DB datetime.
DATE_COLUMNS = {
    'order_received_date', 'order_sent_to_factory_date',
    'tech_packs_sent_to_factory', 'specs_sent_to_factory',
    'barcodes_sent_to_factory', 'original_po_ex_factory',
    'factory_confirmed_ex_factory', 'fit_sample_received',
    'fit_sample_approved', 'strike_off_received', 'strike_off_approved',
    'lab_dip_received', 'lab_dip_approved', 'pps_received',
    'pps_sent_to_customer', 'pps_approved', 'photo_sample_received',
    'ex_factory_from_pp_approval', 'revised_po_ex_factory',
    'shipment_sample_received', 'original_del_date_to_customer',
    'eta_to_uk', 'eta_to_customer', 'vessel_etd', 'vessel_eta_to_port',
    'revised_vessel_eta_to_port', 'estimated_del_to_customer',
}


def _apply_column_filters(query, column_filter_json: str):
    """Apply per-column multi-value filters parsed from a JSON-encoded
    string. Each {field: [values]} entry becomes an IN clause; the
    BLANK_SENTINEL string represents NULL/empty selection. Filters across
    different columns intersect (AND); values within a column union (OR)."""
    try:
        parsed = json.loads(column_filter_json)
    except (json.JSONDecodeError, TypeError):
        return query
    if not isinstance(parsed, dict):
        return query

    for field, values in parsed.items():
        if field not in FILTERABLE_COLUMNS:
            continue
        if not isinstance(values, list) or not values:
            continue

        # style_base is a derived field (style_code with everything from the
        # first dash onwards stripped). Filter by translating selected
        # prefixes into LIKE clauses on style_code.
        if field == 'style_base':
            wants_blank = BLANK_SENTINEL in values
            real_values = [v for v in values if v != BLANK_SENTINEL]
            clauses = []
            for v in real_values:
                if not isinstance(v, str):
                    continue
                # Match either "<v>-..." or exactly "<v>" (no dash).
                clauses.append(PurchaseOrder.style_code.like(f"{v}-%"))
                clauses.append(PurchaseOrder.style_code == v)
            if wants_blank:
                clauses.append(PurchaseOrder.style_code.is_(None))
                clauses.append(PurchaseOrder.style_code == '')
            if clauses:
                query = query.filter(or_(*clauses))
            continue

        col = getattr(PurchaseOrder, field, None)
        if col is None:
            continue

        wants_blank = BLANK_SENTINEL in values
        real_values = [v for v in values if v != BLANK_SENTINEL]

        clauses = []
        if real_values:
            if field in DATE_COLUMNS:
                # Compare on the date portion only — DB stores datetimes but
                # the frontend ticks discrete dates.
                parsed_dates = []
                for v in real_values:
                    try:
                        parsed_dates.append(datetime.fromisoformat(str(v)).date())
                    except (ValueError, TypeError):
                        continue
                if parsed_dates:
                    from sqlalchemy import func
                    clauses.append(func.date(col).in_(parsed_dates))
            else:
                clauses.append(col.in_(real_values))
        if wants_blank:
            clauses.append(col.is_(None))
            if not field in DATE_COLUMNS:
                # Treat empty strings as blank too for text columns
                clauses.append(col == '')

        if clauses:
            query = query.filter(or_(*clauses))

    return query


@router.get("/api/orders")
async def get_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=10000),
    search: Optional[str] = None,
    factory: Optional[str] = None,
    customer: Optional[str] = None,
    status: Optional[str] = None,
    po_number: Optional[str] = None,
    style_code: Optional[str] = None,
    tab: Optional[str] = None,
    # Excel-style per-column multi-value filter. JSON-encoded
    # {"field_name": ["value1", "value2", ...]} — applied as exact-match
    # IN clauses. None / empty values can be selected via the literal
    # sentinel string "__BLANK__". Dates should be ISO yyyy-mm-dd.
    column_filter: Optional[str] = None,
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
    query = apply_supplier_filter(query, current_user)

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

    # Excel-style per-column filters (multi-value exact match). Skipped
    # silently if the JSON is malformed or the field doesn't exist on the
    # model — a typo in the URL shouldn't 500 the listing.
    if column_filter:
        query = _apply_column_filters(query, column_filter)

    # Get total count
    total = query.count()
    
    # Apply pagination
    offset = (page - 1) * page_size
    # Sort by insertion id (Sep 2026 change) so the /orders list mirrors the
    # order rows arrived — Excel imports land in file order at the bottom;
    # newly-added-via-app rows always appear at the end. Previous multi-tier
    # sort (PO#/Customer PO#/Style/id) grouped rows by PO for lookup ergonomics
    # but reshuffled the list every import, which surprised merch and made
    # "what did I just add?" invisible. If we ever want the PO-cluster view
    # back, plan is to add a sort-by-PO toggle on the /orders header rather
    # than flip the default again.
    orders = query.order_by(
        PurchaseOrder.id.asc(),
    ).offset(offset).limit(page_size).all()
    
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
        # Suppliers get limited fields (Sheet 2 equivalent) — no resubmission
        # decoration since suppliers don't see the rework UI.
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "orders": [PurchaseOrderSupplierResponse.from_orm(o) for o in orders]
        }
    else:
        # Internal users get all fields (Sheet 1 equivalent) plus per-sample-area
        # attempt rollup so the orders table can show v2 indicators inline.
        order_dicts = [PurchaseOrderResponse.from_orm(o).model_dump() for o in orders]
        decorate_orders_with_attempts(db, order_dicts)
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "orders": order_dicts,
        }


@router.get("/api/orders/recent-changes")
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
        order_ids_query = apply_supplier_filter(order_ids_query, current_user)
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
            order_ids = apply_supplier_filter(
                db.query(PurchaseOrder.id), current_user
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


@router.get("/api/orders/{order_id}")
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

    assert_supplier_can_access(
        order, current_user,
        detail=f"You can only view orders for your factory ({current_user.factory_name}). This order belongs to a different factory."
    )

    # Add comment count
    order.comment_count = db.query(Comment).filter(Comment.po_id == order.id).count()
    
    # Return appropriate response based on role
    if current_user.role == UserRole.SUPPLIER:
        return PurchaseOrderSupplierResponse.from_orm(order)
    else:
        d = PurchaseOrderResponse.from_orm(order).model_dump()
        decorate_orders_with_attempts(db, [d])
        return d


@router.post("/api/orders", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
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


@router.put("/api/orders/{order_id}")
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
    assert_supplier_can_access(
        order, current_user,
        detail=f"You can only edit orders for your factory ({current_user.factory_name}). This order belongs to a different factory."
    )
    if current_user.role == UserRole.SUPPLIER:
        # Suppliers can only edit if the order has been sent to factory
        if not order.order_sent_to_factory_date or not order.tech_packs_sent_to_factory or not order.specs_sent_to_factory:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This order cannot be edited yet. Order Sent to Factory, Tech Packs, and Specs must all be sent first."
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
            if not hasattr(order, key):
                continue

            is_date = key in date_fields or 'date' in key.lower()

            # Note-eligible date fields (e.g. ASAP for customer delivery)
            # go through the shared helper which routes to either the
            # date column or date_notes based on what parses. Continue
            # after logging the change so history captures both dirs.
            if key in DATE_NOTE_FIELDS:
                old_date = getattr(order, key)
                old_note = (order.date_notes or {}).get(key)
                apply_date_field(order, key, value)
                new_date = getattr(order, key)
                new_note = (order.date_notes or {}).get(key)
                # Throwaway logging for the reported "set new revised ex-factory,
                # toast saved but value doesn't persist" bug. Captures the full
                # incoming/parsed/final state so the next repro is diagnosable
                # from container logs. Safe to remove once the report is closed.
                if key == 'revised_po_ex_factory':
                    print(
                        f"[revised_po_ex_factory] po_id={order.id} user={current_user.username}"
                        f" incoming={value!r} old_date={old_date} old_note={old_note!r}"
                        f" new_date={new_date} new_note={new_note!r}",
                        flush=True,
                    )
                if (old_date != new_date) or (old_note != new_note):
                    role_val = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
                    change_source = "Sourcelab" if role_val != 'supplier' else "Supplier"
                    _old_repr = old_note or (str(old_date) if old_date is not None else None)
                    _new_repr = new_note or (str(new_date) if new_date is not None else None)
                    db.add(DateChangeHistory(
                        po_id=order.id,
                        user_id=current_user.id,
                        field_name=key,
                        old_value=_old_repr,
                        new_value=_new_repr,
                        source=change_source,
                    ))
                continue

            # Treat empty string OR null as "clear this date" for date fields.
            # Without this, clearing a date in the UI silently no-ops.
            if is_date and (value is None or (isinstance(value, str) and not value.strip())):
                value = None
            elif value is None:
                # Non-date None: client didn't include this field, skip.
                continue
            elif is_date and isinstance(value, str):
                try:
                    value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                except ValueError:
                    try:
                        value = datetime.strptime(value, '%Y-%m-%d')
                    except ValueError:
                        try:
                            value = datetime.strptime(value, '%d/%m/%Y')
                        except ValueError:
                            continue  # Unparseable date — skip

            old_value = getattr(order, key)

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

            # Keep sample_submissions in sync — APPROVED via the legacy path
            # closes the open submission row; REJECTED via the legacy path
            # backfills v1+v2 with reason='OTHER'. No-op for any other value.
            if key in STATUS_FIELD_TO_SAMPLE_TYPE:
                sync_submission_on_status_change(db, order, None, key, value, current_user.id)

    # Auto-flip status to 'Shipped' whenever a tracking_reference is written.
    # The /orders Shipped tab filters purely on tracking_reference IS NOT NULL,
    # so status must follow or rows drift into a state where they show as
    # shipped in one place and OUTSTANDING elsewhere (warning centre, analytics).
    # Only fires when tracking_reference is in THIS payload — avoids silently
    # mutating status on unrelated edits.
    _TERMINAL_STATUSES = {'Shipped', 'Delivered', 'Complete', 'Completed', 'Cancelled'}
    if 'tracking_reference' in order_data:
        _incoming_tr = order_data.get('tracking_reference')
        if _incoming_tr and str(_incoming_tr).strip() and order.status not in _TERMINAL_STATUSES:
            _old_status = order.status
            _role_val = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
            _change_source = "Sourcelab" if _role_val != 'supplier' else "Supplier"
            db.add(DateChangeHistory(
                po_id=order.id,
                user_id=current_user.id,
                field_name='status',
                old_value=str(_old_status) if _old_status is not None else None,
                new_value='Shipped',
                source=_change_source,
            ))
            order.status = 'Shipped'

    # Fit Sample Required = N → force fit_sample_status to NOT REQUIRED.
    # Records the derived status change in history so the activity feed
    # reflects it. No-op when status is already NOT REQUIRED.
    if (order.fit_sample_required or '').strip().upper() == 'N':
        current_status = (order.fit_sample_status or '').strip().upper()
        if current_status != 'NOT REQUIRED':
            old_status = order.fit_sample_status
            role_val = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
            change_source = "Sourcelab" if role_val != 'supplier' else "Supplier"
            db.add(DateChangeHistory(
                po_id=order.id,
                user_id=current_user.id,
                field_name='fit_sample_status',
                old_value=str(old_status) if old_status is not None else None,
                new_value='NOT REQUIRED',
                source=change_source,
            ))
            order.fit_sample_status = 'NOT REQUIRED'

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

    # If revised_po_ex_factory is blank AND the incoming payload didn't touch
    # it, default to factory_confirmed_ex_factory. The payload check is the
    # important bit: without it, a Sourcelab user clearing the field (payload
    # says "revised_po_ex_factory: null" or "") gets silently reverted to
    # factory_confirmed on the way out, toast fires "Updated successfully",
    # UI shows the reverted date. Real user report Aug 2026. The default-back
    # itself is still useful for orders that never had a revised set (e.g.
    # freshly imported rows where an unrelated field is being edited later).
    if (
        'revised_po_ex_factory' not in order_data
        and not order.revised_po_ex_factory
        and order.factory_confirmed_ex_factory
    ):
        # Throwaway log — see the DATE_NOTE_FIELDS block for revised_po_ex_factory
        # above. Confirms auto-default didn't fire on a payload that included
        # the field (which would be the silent-revert bug).
        print(
            f"[revised_po_ex_factory] po_id={order.id} auto-default fired"
            f" (payload didn't include field) -> {order.factory_confirmed_ex_factory}",
            flush=True,
        )
        order.revised_po_ex_factory = order.factory_confirmed_ex_factory

    # Auto-calculate ETA dates when revised_po_ex_factory changes
    if order.revised_po_ex_factory:
        order.eta_to_uk = order.revised_po_ex_factory + timedelta(days=60)
        order.eta_to_customer = order.eta_to_uk + timedelta(days=5)

    # Auto-calculate estimated_del_to_customer from vessel ETA + FCL/LCL
    vessel_eta = order.revised_vessel_eta_to_port or order.vessel_eta_to_port
    if vessel_eta:
        fcl_lcl = (order.fcl_lcl or '').strip().upper()
        days_to_add = 7 if fcl_lcl == 'LCL' else 2 if fcl_lcl == 'AIR' else 5
        order.estimated_del_to_customer = vessel_eta + timedelta(days=days_to_add)

    # Auto-calculate month fields
    if order.original_del_date_to_customer:
        order.customer_po_open_month = order.original_del_date_to_customer.strftime('%B')
    if order.eta_to_customer:
        order.expected_dispatch_arrive_uk_month = order.eta_to_customer.strftime('%B')

    # Auto-calculate ex_factory_from_pp_approval = PPS Approved + 35 days
    if order.pps_approved:
        order.ex_factory_from_pp_approval = order.pps_approved + timedelta(days=35)

    user_touched_order_status = [p for p in SAMPLE_PREFIXES_ORDER if f'{p}_status' in order_data]
    reconcile_sample_status(order, SAMPLE_PREFIXES_ORDER, skip_prefixes=user_touched_order_status)
    for comp in order.components:
        reconcile_sample_status(comp, SAMPLE_PREFIXES_COMPONENT)

    db.commit()
    db.refresh(order)

    # Notifications trigger — check if this update just satisfied the
    # "new PO needs components" condition. Runs against the whole PO
    # (all styles under the same po_number). Guarded internally against
    # re-firing so this is safe to call on every update.
    try:
        import notifications as _notifications
        _notifications.check_new_po_needs_components(db, order.po_number)
    except Exception as exc:
        # Never let notification failures block the order update.
        print(f"[notifications] check failed for PO {order.po_number}: {exc}")

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


@router.delete("/api/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
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


@router.post("/api/orders/bulk-delete")
async def bulk_delete_orders(
    data: dict,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Hard-delete a batch of orders (internal/admin only). Rows are gone
    from the DB — the frontend confirm modal warns the user that this
    can't be undone before we hit here.

    Body: { "order_ids": [1, 2, 3, ...] }
    Returns { "deleted_count": N }
    """
    order_ids = data.get("order_ids") or []
    if not isinstance(order_ids, list) or not order_ids:
        raise HTTPException(status_code=400, detail="order_ids must be a non-empty list")

    rows = db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(order_ids)).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No matching orders found")

    count = len(rows)
    for order in rows:
        db.delete(order)
    db.commit()
    return {"success": True, "deleted_count": count}


@router.post("/api/orders/bulk-update-status")
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


@router.post("/api/orders/bulk-update-date")
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

    # Text fields with dropdown options that support bulk update
    dropdown_text_fields = [
        'fcl_lcl',
        'fit_sample_required',
        'fit_sample_status', 'strike_off_status', 'lab_dip_status', 'pps_status',
    ]

    if field_name not in date_fields and field_name not in dropdown_text_fields:
        raise HTTPException(status_code=400, detail=f"Field '{field_name}' is not enabled for bulk update")

    # Parse the new value — date or text
    is_text_field = field_name in dropdown_text_fields
    new_value = None
    if new_value_str:
        if is_text_field:
            new_value = str(new_value_str).strip() or None
        else:
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
            assert_supplier_can_access(order, current_user, detail="Not authorized to update these orders")

    # Determine source tag based on role
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    is_supplier = role_str == 'supplier'

    # For suppliers, create pending changes instead of updating directly
    if is_supplier and not is_text_field:
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

            # Apply the "Required = N → Status = NOT REQUIRED" rule for fit
            # samples whenever this bulk hits fit_sample_required.
            if field_name == 'fit_sample_required' and (new_value or '').strip().upper() == 'N':
                if (order.fit_sample_status or '').strip().upper() != 'NOT REQUIRED':
                    old_status = order.fit_sample_status
                    db.add(DateChangeHistory(
                        po_id=order.id,
                        user_id=current_user.id,
                        field_name='fit_sample_status',
                        old_value=str(old_status) if old_status is not None else None,
                        new_value='NOT REQUIRED',
                        source=change_source,
                    ))
                    order.fit_sample_status = 'NOT REQUIRED'

    db.commit()

    # Broadcast update
    await manager.broadcast({
        "type": "bulk_date_update",
        "data": {"po_number": po_number, "field_name": field_name, "count": updated_count},
        "timestamp": datetime.utcnow().isoformat()
    })

    return {"success": True, "orders_updated": updated_count}


@router.get("/api/orders/styles-on-po/{po_number}")
async def get_styles_on_po(
    po_number: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all orders/styles on a specific PO number"""
    query = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number)

    query = apply_supplier_filter(query, current_user)

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


@router.get("/api/orders/list/distinct-pos")
async def get_po_list(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lightweight list of distinct POs (number + customer + factory + style count)
    for the export-orders modal picker. Respects supplier scoping automatically."""
    query = db.query(PurchaseOrder)
    query = apply_supplier_filter(query, current_user)
    orders = query.all()

    by_po: dict[str, dict] = {}
    for o in orders:
        if not o.po_number:
            continue
        v = by_po.get(o.po_number)
        if v:
            v["style_count"] += 1
        else:
            by_po[o.po_number] = {
                "po_number": o.po_number,
                "customer": o.customer,
                "factory": o.factory,
                "style_count": 1,
            }
    # Sort by PO number desc so newest-looking ones appear first
    pos = sorted(by_po.values(), key=lambda p: p["po_number"], reverse=True)
    return {"pos": pos}


@router.get("/api/orders/list/distinct-values")
async def get_distinct_values(
    column: str = Query(..., description="Field name to fetch unique values for"),
    # Same JSON-encoded filter shape the listing endpoint accepts. When
    # provided, distinct values are computed AFTER applying every OTHER
    # column's filter — so the dropdown shows what's reachable given the
    # filters already in effect, the way Excel does.
    column_filter: Optional[str] = None,
    # Match the listing endpoint's Active/Shipped tab so the dropdown only
    # surfaces values reachable on the tab the user is looking at.
    tab: Optional[str] = Query(None, description="'orders' or 'shipped' — mirror /api/orders tab"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the unique non-null values for a single column. Used by the
    Excel-style column-filter dropdowns on the orders table. The result
    includes a 'has_blanks' flag separately so the frontend can show a
    "(Blanks)" tick option for NULL/empty rows."""
    if column not in FILTERABLE_COLUMNS:
        raise HTTPException(400, f"Column '{column}' is not filterable")
    # style_base is derived (not a real column); skip the existence check.
    col = None if column == 'style_base' else getattr(PurchaseOrder, column, None)
    if col is None and column != 'style_base':
        raise HTTPException(400, f"Column '{column}' not found on order model")

    query = db.query(PurchaseOrder)
    query = apply_supplier_filter(query, current_user)

    # Tab filtering (internal/admin only — same rule as the listing endpoint).
    if current_user.role != UserRole.SUPPLIER and tab:
        if tab == 'shipped':
            query = query.filter(PurchaseOrder.tracking_reference.isnot(None))
        elif tab == 'orders':
            query = query.filter(PurchaseOrder.tracking_reference.is_(None))

    # Apply every column filter EXCEPT the one we're computing distinct
    # values for — that lets the user expand the current column's choices
    # without losing the ones they've already ticked.
    if column_filter:
        try:
            parsed = json.loads(column_filter)
            if isinstance(parsed, dict):
                parsed.pop(column, None)
                if parsed:
                    query = _apply_column_filters(query, json.dumps(parsed))
        except (json.JSONDecodeError, TypeError):
            pass

    # style_base: derive in Python from distinct style_codes. Cheap because
    # there are far fewer style_codes than orders, and we'd have to derive
    # per-row anyway since SQL split-part syntax differs across DB engines.
    if column == 'style_base':
        rows = query.with_entities(PurchaseOrder.style_code).distinct().all()
        bases = set()
        has_blanks = False
        for r in rows:
            sc = r[0]
            if sc is None or sc == '':
                has_blanks = True
                continue
            bases.add(sc.split('-', 1)[0])
        values = sorted(bases, key=lambda s: s.lower())
        return {
            "column": column,
            "values": values,
            "has_blanks": has_blanks,
            "is_date": False,
            "blank_sentinel": BLANK_SENTINEL,
        }

    is_date = column in DATE_COLUMNS

    if is_date:
        from sqlalchemy import func
        date_col = func.date(col)
        rows = query.with_entities(date_col).filter(col.isnot(None)).distinct().all()
        # SQLite's func.date returns a yyyy-mm-dd string; PostgreSQL returns
        # a date object. Normalise both to ISO strings so the wire format
        # is stable across local + prod.
        date_strs = set()
        for r in rows:
            v = r[0]
            if v is None:
                continue
            if hasattr(v, 'isoformat'):
                date_strs.add(v.isoformat())
            else:
                date_strs.add(str(v))
        values = sorted(date_strs)
    else:
        rows = query.with_entities(col).distinct().all()
        raw = {r[0] for r in rows}
        has_explicit_blank = '' in raw
        values = sorted(
            (str(v) for v in raw if v is not None and v != ''),
            key=lambda s: s.lower(),
        )
        # Surface empty strings as blanks too, alongside NULLs.
        if has_explicit_blank:
            # has_blanks will be set below from a separate query
            pass

    # Single quick count for the (Blanks) bucket. Cheap because it short-
    # circuits on the first NULL hit.
    if is_date:
        has_blanks = query.filter(col.is_(None)).limit(1).first() is not None
    else:
        has_blanks = query.filter(or_(col.is_(None), col == '')).limit(1).first() is not None

    return {
        "column": column,
        "values": values,
        "has_blanks": has_blanks,
        "is_date": is_date,
        "blank_sentinel": BLANK_SENTINEL,
    }
