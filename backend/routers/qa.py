"""Shared QA test-plan state — tickboxes that survive across sessions and
all logged-in users see the same state. Backed by a tiny `qa_checks` table."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import QACheck, User


router = APIRouter()


@router.get("/api/qa/state")
async def get_qa_state(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return every ticked check, keyed by check_id."""
    rows = db.query(QACheck).all()
    return {
        "checks": {
            r.check_id: {
                "checked": True,
                "by": r.checked_by,
                "at": r.checked_at.isoformat() if r.checked_at else None,
            }
            for r in rows
        }
    }


@router.post("/api/qa/toggle/{check_id:path}")
async def toggle_check(
    check_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle a single check on or off. Returns the new state for that check."""
    if not check_id or len(check_id) > 200:
        raise HTTPException(status_code=400, detail="Invalid check_id")

    existing = db.query(QACheck).filter(QACheck.check_id == check_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"check_id": check_id, "checked": False}

    row = QACheck(
        check_id=check_id,
        checked_by=current_user.username,
        checked_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    return {
        "check_id": check_id,
        "checked": True,
        "by": row.checked_by,
        "at": row.checked_at.isoformat(),
    }


@router.post("/api/qa/reset")
async def reset_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Wipe every check — admin-only convenience for starting a fresh test pass."""
    role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    if role_str != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can reset QA state")
    deleted = db.query(QACheck).delete()
    db.commit()
    return {"deleted": deleted}
