"""Size guide CRUD — single source of truth for gender size codes and their
per-position size labels. Admin / full-internal users manage rows from
/settings → Size Guide. Read endpoint is open to any authenticated user
so the frontend and Excel export can render correctly."""

import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import SizeGuide, User
from auth import get_current_user, get_current_full_internal_user


router = APIRouter()


def _serialize(row: SizeGuide) -> dict:
    """Turn a SizeGuide row into a JSON-friendly dict. Parses the stored
    `sizes` text back into a list — invalid JSON becomes an empty list so
    callers never get a crash from corrupted data."""
    try:
        sizes = json.loads(row.sizes) if row.sizes else []
    except (json.JSONDecodeError, TypeError):
        sizes = []
    return {
        "id": row.id,
        "code": row.code,
        "label": row.label,
        "sizes": sizes,
        "sort_order": row.sort_order,
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/api/size-guide", response_model=List[dict])
async def list_size_guide(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all size guide rows sorted by sort_order. Available to any
    authenticated user — the size guide is referenced everywhere in the UI."""
    rows = db.query(SizeGuide).order_by(SizeGuide.sort_order, SizeGuide.id).all()
    return [_serialize(r) for r in rows]


@router.post("/api/size-guide", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_size_guide(
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db),
):
    """Create a new size guide row. Admin / full-internal only."""
    code = (data.get("code") or "").strip()
    label = (data.get("label") or "").strip()
    sizes = data.get("sizes") or []
    if not code:
        raise HTTPException(status_code=400, detail="code is required")
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    if not isinstance(sizes, list):
        raise HTTPException(status_code=400, detail="sizes must be an array of strings")

    existing = db.query(SizeGuide).filter(SizeGuide.code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Code '{code}' already exists")

    # Append to the end of the sort order by default.
    max_sort = db.query(SizeGuide).order_by(SizeGuide.sort_order.desc()).first()
    next_sort = (max_sort.sort_order if max_sort else -1) + 1

    row = SizeGuide(
        code=code,
        label=label,
        sizes=json.dumps([str(s) for s in sizes]),
        sort_order=int(data.get("sort_order", next_sort)),
        is_active=bool(data.get("is_active", True)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.put("/api/size-guide/{guide_id}", response_model=dict)
async def update_size_guide(
    guide_id: int,
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db),
):
    """Update an existing size guide row. Admin / full-internal only."""
    row = db.query(SizeGuide).filter(SizeGuide.id == guide_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Size guide row not found")

    if "code" in data:
        new_code = (data["code"] or "").strip()
        if not new_code:
            raise HTTPException(status_code=400, detail="code cannot be empty")
        if new_code != row.code:
            clash = db.query(SizeGuide).filter(SizeGuide.code == new_code, SizeGuide.id != guide_id).first()
            if clash:
                raise HTTPException(status_code=400, detail=f"Code '{new_code}' already exists")
        row.code = new_code
    if "label" in data:
        new_label = (data["label"] or "").strip()
        if not new_label:
            raise HTTPException(status_code=400, detail="label cannot be empty")
        row.label = new_label
    if "sizes" in data:
        sizes = data["sizes"]
        if not isinstance(sizes, list):
            raise HTTPException(status_code=400, detail="sizes must be an array of strings")
        row.sizes = json.dumps([str(s) for s in sizes])
    if "sort_order" in data:
        row.sort_order = int(data["sort_order"])
    if "is_active" in data:
        row.is_active = bool(data["is_active"])

    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/api/size-guide/{guide_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_size_guide(
    guide_id: int,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db),
):
    """Permanently delete a size guide row. Admin / full-internal only.
    No referential integrity check on orders.gender — admins can re-add the
    row if needed, and the frontend gracefully shows the raw gender string
    if the lookup misses."""
    row = db.query(SizeGuide).filter(SizeGuide.id == guide_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Size guide row not found")
    db.delete(row)
    db.commit()
    return


@router.post("/api/size-guide/reorder")
async def reorder_size_guide(
    data: dict,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db),
):
    """Persist a new ordering. Body: { "order": [id1, id2, id3, ...] }."""
    order = data.get("order")
    if not isinstance(order, list):
        raise HTTPException(status_code=400, detail="order must be an array of size-guide IDs")
    rows = {r.id: r for r in db.query(SizeGuide).filter(SizeGuide.id.in_(order)).all()}
    for i, guide_id in enumerate(order):
        row = rows.get(int(guide_id))
        if row:
            row.sort_order = i
    db.commit()
    return {"success": True, "updated": len(rows)}
