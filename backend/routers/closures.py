"""Factory closure calendar — the days the plants are shut.

Chinese New Year is the reason this exists. See models.FactoryClosure for the
why; this module is the admin surface plus the seed of upcoming CNY windows.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, false
from sqlalchemy.orm import Session

from database import get_db
from models import User, FactoryClosure
from auth import get_current_user, get_current_admin_user
import sample_helpers

router = APIRouter()

# A closure longer than this is a mistyped year, not a holiday. The cache has
# its own hard cap as a backstop; this is the one that produces a readable
# error instead of silently swallowing the row.
MAX_CLOSURE_DAYS = 90

# Day 1 of Chinese New Year. Seeded as a starting point only — the *shutdown*
# is longer than the public holiday and differs between plants, so these rows
# exist to be edited by somebody who has asked the factory, not trusted as-is.
CNY_DAY_ONE = {
    2027: date(2027, 2, 6),
    2028: date(2028, 1, 26),
    2029: date(2029, 2, 13),
    2030: date(2030, 2, 3),
}
# Rough shutdown either side of day one: a few days to travel home, then back
# around the Lantern Festival.
CNY_DAYS_BEFORE = 3
CNY_DAYS_AFTER = 14


def seed_default_closures(db: Session) -> int:
    """Seed upcoming Chinese New Year windows, once.

    Only runs when the table is completely empty, so an admin who deletes a
    row does not find it resurrected on the next deploy.
    """
    if db.query(FactoryClosure).count() > 0:
        return 0
    today = datetime.utcnow().date()
    added = 0
    for year, day_one in sorted(CNY_DAY_ONE.items()):
        end = day_one + timedelta(days=CNY_DAYS_AFTER)
        if end < today:
            continue
        db.add(FactoryClosure(
            label=f"Chinese New Year {year}",
            start_date=day_one - timedelta(days=CNY_DAYS_BEFORE),
            end_date=end,
            factory=None,
            active=True,
            notes="Estimated window — please confirm the actual shutdown with the factory and adjust.",
        ))
        added += 1
    if added:
        db.commit()
        sample_helpers.invalidate_closure_cache()
    return added


def _working_days(start: date, end: date) -> int:
    """Mon-Fri days inside the closure — what it actually removes from a count."""
    n, day = 0, start
    while day <= end:
        if day.weekday() < 5:
            n += 1
        day += timedelta(days=1)
    return n


def _serialise(c: FactoryClosure) -> dict:
    return {
        "id": c.id,
        "label": c.label,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "factory": c.factory,
        "active": bool(c.active),
        "notes": c.notes,
        "calendar_days": (c.end_date - c.start_date).days + 1 if c.start_date and c.end_date else 0,
        "working_days": _working_days(c.start_date, c.end_date) if c.start_date and c.end_date else 0,
    }


def _parse_date(raw, field: str) -> date:
    if not raw:
        raise HTTPException(status_code=400, detail=f"{field} is required")
    if isinstance(raw, date):
        return raw
    try:
        return datetime.fromisoformat(str(raw).strip()[:10]).date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} must be a date (YYYY-MM-DD)")


def _validate(data: dict) -> dict:
    label = (data.get("label") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="Give the closure a name, e.g. 'Chinese New Year 2027'")
    start = _parse_date(data.get("start_date"), "Start date")
    end = _parse_date(data.get("end_date"), "End date")
    if end < start:
        raise HTTPException(status_code=400, detail="The end date is before the start date")
    span = (end - start).days + 1
    if span > MAX_CLOSURE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"That closure is {span} days long. The longest allowed is {MAX_CLOSURE_DAYS} — check the year on each date.")
    factory = (data.get("factory") or "").strip() or None
    if factory:
        # Storing one would be harmless; applying it is not. The closure cache
        # is a single flat set of dates and business_days_between() has no
        # factory argument, so a per-factory row would stop the clock for every
        # factory. Refuse it outright rather than accept a row that quietly
        # does the wrong thing.
        raise HTTPException(
            status_code=400,
            detail="Closures apply to all factories for now. Leave the factory blank.")
    return {
        "label": label[:120],
        "start_date": start,
        "end_date": end,
        "factory": factory,
        "active": bool(data.get("active", True)),
        "notes": (data.get("notes") or "").strip() or None,
    }


@router.get("/api/settings/factory-closures")
async def list_factory_closures(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every closure, soonest first. Readable by any signed-in user so the
    warnings centre can explain why a count is paused.

    Suppliers see the global closures plus their own factory's, never another
    factory's — a per-factory closure carries that factory's name, and a
    factory login has no business reading the list of who else we buy from.
    """
    q = db.query(FactoryClosure)
    if getattr(current_user, 'role', None) == 'supplier':
        q = q.filter(or_(
            FactoryClosure.factory.is_(None),
            FactoryClosure.factory == '',
            # Same NUL trap as the components library had: a sentinel string
            # for "match nothing" is refused by PostgreSQL. A supplier with no
            # factory_name should simply see the global closures, so express
            # that as a false clause rather than an impossible comparison.
            FactoryClosure.factory == current_user.factory_name
            if current_user.factory_name else false(),
        ))
    rows = q.order_by(FactoryClosure.start_date.asc()).all()
    today = datetime.utcnow().date()
    return {
        "closures": [_serialise(c) for c in rows],
        "today": today.isoformat(),
        "max_closure_days": MAX_CLOSURE_DAYS,
    }


@router.post("/api/settings/factory-closures")
async def create_factory_closure(
    data: dict,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    row = FactoryClosure(**_validate(data))
    db.add(row)
    db.commit()
    db.refresh(row)
    sample_helpers.invalidate_closure_cache()
    return _serialise(row)


@router.put("/api/settings/factory-closures/{closure_id}")
async def update_factory_closure(
    closure_id: int,
    data: dict,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    row = db.query(FactoryClosure).filter(FactoryClosure.id == closure_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Closure not found")
    for key, val in _validate(data).items():
        setattr(row, key, val)
    db.commit()
    db.refresh(row)
    sample_helpers.invalidate_closure_cache()
    return _serialise(row)


@router.delete("/api/settings/factory-closures/{closure_id}")
async def delete_factory_closure(
    closure_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    row = db.query(FactoryClosure).filter(FactoryClosure.id == closure_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Closure not found")
    db.delete(row)
    db.commit()
    sample_helpers.invalidate_closure_cache()
    return {"success": True, "deleted": closure_id}
