"""Centralized supplier access control for PurchaseOrder queries and authorization."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Query

from models import User, UserRole, PurchaseOrder


def apply_supplier_filter(query: Query, user: User) -> Query:
    """Restrict a PurchaseOrder query to the supplier's factory.

    No-op for non-supplier users. A supplier with no factory_name set gets
    an empty result rather than an unrestricted one — see the fail-closed
    note below.
    """
    if user.role == UserRole.SUPPLIER:
        if not user.factory_name:
            return query.filter(PurchaseOrder.factory.is_(None), PurchaseOrder.factory == '')
        return query.filter(PurchaseOrder.factory == user.factory_name)
    return query


def supplier_filter_clause(user: User) -> list:
    """Return a list of SQLAlchemy filter clauses to apply for supplier scoping.

    Returns [] for non-supplier users. Use with
    `.filter(*supplier_filter_clause(user))` for aggregate queries.
    """
    if user.role == UserRole.SUPPLIER:
        if not user.factory_name:
            # Deliberately unsatisfiable — see the fail-closed note below.
            return [PurchaseOrder.factory.is_(None), PurchaseOrder.factory == '']
        return [PurchaseOrder.factory == user.factory_name]
    return []


def assert_supplier_can_access(order: PurchaseOrder, user: User, detail: str = None) -> None:
    """Raise 403 if a supplier is trying to access an order outside their factory.

    No-op for non-supplier users. Pass `detail` to customize the error message.
    """
    if user.role == UserRole.SUPPLIER:
        if not user.factory_name or order.factory != user.factory_name:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=detail or f"You can only access orders for your factory ({user.factory_name or 'not set'}). This order belongs to a different factory."
            )


# ── Fail-closed note ──────────────────────────────────────────────────
# All three helpers previously treated "supplier with no factory_name" as
# "no restriction", which fails OPEN: such an account would have seen every
# factory's orders. Changed Sep 2026 to return nothing / 403 instead.
#
# Safe to tighten: audited against the 4 Sep prod snapshot, where all six
# supplier accounts have factory_name = 'PRIME-23' and none is unset, so
# no existing login is affected. If a supplier is ever created without a
# factory they'll now see an empty book — which is the correct failure and
# is visible immediately, rather than a silent cross-factory leak.
