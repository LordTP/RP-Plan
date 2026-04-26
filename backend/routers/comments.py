"""Comment endpoints — list / add / mark-read / order history / bulk-add.
Comment creation parses @mentions from explicit IDs and @username tokens in
the text, writes CommentMention rows, and fires mention emails through the
kill-switch-gated automation service."""
import re
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, PurchaseOrder, Comment, CommentRead, CommentMention, DateChangeHistory,
)
from schemas import CommentCreate, CommentResponse, DateChangeResponse
from auth import get_current_user, get_current_internal_user
from supplier_access import assert_supplier_can_access
from realtime import manager
import email_service


router = APIRouter()


@router.get("/api/orders/{order_id}/comments", response_model=List[CommentResponse])
async def get_order_comments(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all comments for a specific order"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID {order_id} was not found. Please refresh the page."
        )

    assert_supplier_can_access(
        order, current_user,
        detail=f"You can only view comments for your factory's orders ({current_user.factory_name})."
    )

    comments = db.query(Comment).filter(Comment.po_id == order_id).order_by(Comment.created_at.desc()).all()

    # Get set of comment IDs this user has read
    read_ids = set(
        r[0] for r in db.query(CommentRead.comment_id).filter(
            CommentRead.user_id == current_user.id,
            CommentRead.comment_id.in_([c.id for c in comments])
        ).all()
    )

    # Get all read receipts for these comments in one query
    all_reads = db.query(CommentRead, User).join(User, CommentRead.user_id == User.id).filter(
        CommentRead.comment_id.in_([c.id for c in comments])
    ).all() if comments else []

    reads_by_comment: dict = {}
    for cr, u in all_reads:
        if cr.comment_id not in reads_by_comment:
            reads_by_comment[cr.comment_id] = []
        reads_by_comment[cr.comment_id].append({
            "username": u.username,
            "full_name": u.full_name,
            "read_at": cr.read_at,
        })

    result = []
    for comment in comments:
        user = db.query(User).filter(User.id == comment.user_id).first()
        result.append(CommentResponse(
            id=comment.id,
            po_id=comment.po_id,
            user_id=comment.user_id,
            username=user.username if user else "Unknown",
            full_name=user.full_name if user else None,
            comment_text=comment.comment_text,
            source=comment.source or "Sourcelab",
            read=comment.id in read_ids,
            read_by_internal=comment.read_by_internal or False,
            read_by_supplier=comment.read_by_supplier or False,
            read_by_users=reads_by_comment.get(comment.id, []),
            created_at=comment.created_at
        ))

    return result


@router.post("/api/orders/{order_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    order_id: int,
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a comment to an order"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot add comment - Order with ID {order_id} was not found. The order may have been deleted."
        )

    assert_supplier_can_access(
        order, current_user,
        detail=f"You can only add comments to your factory's orders ({current_user.factory_name})."
    )

    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    is_internal = role_str != 'supplier'
    source_tag = "Sourcelab" if is_internal else "Supplier"
    new_comment = Comment(
        po_id=order_id,
        user_id=current_user.id,
        comment_text=comment_data.comment_text,
        source=source_tag,
        read_by_internal=is_internal,
        read_by_supplier=not is_internal
    )

    db.add(new_comment)
    db.flush()

    db.add(CommentRead(comment_id=new_comment.id, user_id=current_user.id))

    # Resolve @mentions — union of explicit IDs and usernames parsed from text
    mentioned_ids = set()
    if comment_data.mentioned_user_ids:
        mentioned_ids.update(int(i) for i in comment_data.mentioned_user_ids)
    for match in re.finditer(r'@([A-Za-z0-9_.-]{2,50})', comment_data.comment_text):
        uname = match.group(1)
        u = db.query(User).filter(
            User.username == uname, User.is_active == True, User.mentionable != False
        ).first()
        if u:
            mentioned_ids.add(u.id)
    mentioned_ids.discard(current_user.id)  # No self-mentions

    mentioned_users = []
    if mentioned_ids:
        mentioned_users = db.query(User).filter(
            User.id.in_(mentioned_ids),
            User.is_active == True,
            User.mentionable != False,
        ).all()
        for mu in mentioned_users:
            db.add(CommentMention(comment_id=new_comment.id, user_id=mu.id))

    db.commit()
    db.refresh(new_comment)

    # Send @mention emails (gated by the kill switch + the per-automation toggle)
    if mentioned_users:
        author_name = current_user.full_name or current_user.username
        subject_base = f"{author_name} mentioned you on PO#{order.po_number}"
        preheader_parts = [f"New mention by {author_name}"]
        if order.style_code:
            preheader_parts.append(order.style_code)
        if order.customer:
            preheader_parts.append(order.customer)
        preheader = " · ".join(preheader_parts)
        for mu in mentioned_users:
            if not mu.email:
                continue
            html = email_service.render(
                "mention.html.j2",
                subject=subject_base,
                preheader=preheader,
                heading=f"{author_name} mentioned you",
                subheading=f"On PO#{order.po_number}" + (f" · {order.style_code}" if order.style_code else ""),
                cta_url=f"{email_service.APP_BASE_URL}/design?openStyle={order.id}",
                cta_label="View comment",
                po_number=order.po_number,
                customer_po_number=order.customer_po_number,
                style_code=order.style_code,
                colour=order.colour,
                description=order.description,
                customer=order.customer,
                factory=order.factory,
                author_name=author_name,
                comment_text=new_comment.comment_text,
            )
            email_service.send_automation_email(
                db=db,
                automation_key='email_mention',
                to=mu.email,
                subject=subject_base,
                html=html,
                reply_to=current_user.email,
            )

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

    return CommentResponse(
        id=new_comment.id,
        po_id=new_comment.po_id,
        user_id=new_comment.user_id,
        username=current_user.username,
        full_name=current_user.full_name,
        comment_text=new_comment.comment_text,
        source=new_comment.source,
        read=True,
        read_by_internal=new_comment.read_by_internal or False,
        read_by_supplier=new_comment.read_by_supplier or False,
        created_at=new_comment.created_at
    )


@router.get("/api/orders/{order_id}/history", response_model=List[DateChangeResponse])
async def get_order_history(
    order_id: int,
    current_user: User = Depends(get_current_internal_user),
    db: Session = Depends(get_db)
):
    """Get date change history for an order (internal/admin only)"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )

    history = db.query(DateChangeHistory).filter(
        DateChangeHistory.po_id == order_id
    ).order_by(DateChangeHistory.created_at.desc()).all()

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
            component_name=entry.component_name,
            created_at=entry.created_at
        ))

    return result


@router.post("/api/orders/{order_id}/comments/mark-read")
async def mark_comments_read(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all comments for an order as read by the current user type"""
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    assert_supplier_can_access(order, current_user, detail="Not authorized")

    comment_ids = [c.id for c in db.query(Comment.id).filter(Comment.po_id == order_id).all()]

    if comment_ids:
        already_read = set(
            r[0] for r in db.query(CommentRead.comment_id).filter(
                CommentRead.user_id == current_user.id,
                CommentRead.comment_id.in_(comment_ids)
            ).all()
        )

        new_reads = 0
        for cid in comment_ids:
            if cid not in already_read:
                db.add(CommentRead(comment_id=cid, user_id=current_user.id))
                new_reads += 1

        db.commit()
        return {"success": True, "comments_marked": new_reads}

    return {"success": True, "comments_marked": 0}


@router.post("/api/orders/bulk-add-comment")
async def bulk_add_comment(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a comment to all orders with the same PO number. @mentions send a
    SINGLE consolidated email per mentioned user summarising every style."""
    po_number = data.get("po_number")
    comment_text = data.get("comment_text")
    mentioned_user_ids = data.get("mentioned_user_ids") or []

    if not po_number or not comment_text:
        raise HTTPException(status_code=400, detail="po_number and comment_text are required")

    orders = db.query(PurchaseOrder).filter(PurchaseOrder.po_number == po_number).all()

    if not orders:
        raise HTTPException(status_code=404, detail="No orders found with this PO number")

    for order in orders:
        assert_supplier_can_access(order, current_user, detail="Not authorized to comment on these orders")

    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    is_internal = role_str != 'supplier'
    source_tag = "Sourcelab" if is_internal else "Supplier"

    mentioned_ids = set(int(i) for i in mentioned_user_ids)
    for match in re.finditer(r'@([A-Za-z0-9_.-]{2,50})', comment_text):
        u = db.query(User).filter(
            User.username == match.group(1), User.is_active == True, User.mentionable != False
        ).first()
        if u:
            mentioned_ids.add(u.id)
    mentioned_ids.discard(current_user.id)
    mentioned_users = []
    if mentioned_ids:
        mentioned_users = db.query(User).filter(
            User.id.in_(mentioned_ids),
            User.is_active == True,
            User.mentionable != False,
        ).all()

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

    db.flush()

    for comment in new_comments:
        db.add(CommentRead(comment_id=comment.id, user_id=current_user.id))
        for mu in mentioned_users:
            db.add(CommentMention(comment_id=comment.id, user_id=mu.id))

    db.commit()

    # Send ONE email per mentioned user, summarising every style on the PO
    if mentioned_users and orders:
        author_name = current_user.full_name or current_user.username
        rep = orders[0]
        styles_list = [
            {
                'style_code': o.style_code,
                'colour': o.colour,
                'description': o.description,
            }
            for o in orders if o.style_code
        ]
        subject_base = f"{author_name} mentioned you on PO#{rep.po_number}"
        preheader_parts = [f"New mention by {author_name}", f"PO#{rep.po_number}", f"{len(styles_list)} styles"]
        if rep.customer:
            preheader_parts.append(rep.customer)
        preheader = " · ".join(preheader_parts)
        subheading = f"On PO#{rep.po_number} · {len(styles_list)} {'styles' if len(styles_list) != 1 else 'style'}"
        for mu in mentioned_users:
            if not mu.email:
                continue
            html = email_service.render(
                "mention.html.j2",
                subject=subject_base,
                preheader=preheader,
                heading=f"{author_name} mentioned you",
                subheading=subheading,
                cta_url=f"{email_service.APP_BASE_URL}/design?expandPO={rep.po_number}",
                cta_label="View on PO",
                po_number=rep.po_number,
                styles=styles_list,
                customer=rep.customer,
                factory=rep.factory,
                author_name=author_name,
                comment_text=comment_text,
            )
            email_service.send_automation_email(
                db=db,
                automation_key='email_mention',
                to=mu.email,
                subject=subject_base,
                html=html,
                reply_to=current_user.email,
            )

    await manager.broadcast({
        "type": "bulk_comment_added",
        "data": {"po_number": po_number, "count": len(orders), "username": current_user.username},
        "timestamp": datetime.utcnow().isoformat()
    })

    return {"success": True, "comments_added": len(orders)}
