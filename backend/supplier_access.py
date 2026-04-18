"""Centralized supplier access control for PurchaseOrder queries and authorization."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Query

from models import User, UserRole, PurchaseOrder


def apply_supplier_filter(query: Query, user: User) -> Query:
    """Restrict a PurchaseOrder query to the supplier's factory.

    No-op for non-supplier users, or suppliers with no factory_name set.
    """
    if user.role == UserRole.SUPPLIER and user.factory_name:
        return query.filter(PurchaseOrder.factory == user.factory_name)
    return query


def supplier_filter_clause(user: User) -> list:
    """Return a list of SQLAlchemy filter clauses to apply for supplier scoping.

    Returns [] for non-supplier users, or suppliers without factory_name.
    Use with `.filter(*supplier_filter_clause(user))` for aggregate queries.
    """
    if user.role == UserRole.SUPPLIER and user.factory_name:
        return [PurchaseOrder.factory == user.factory_name]
    return []


def assert_supplier_can_access(order: PurchaseOrder, user: User, detail: str = None) -> None:
    """Raise 403 if a supplier is trying to access an order outside their factory.

    No-op for non-supplier users. Pass `detail` to customize the error message.
    """
    if user.role == UserRole.SUPPLIER and order.factory != user.factory_name:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail or f"You can only access orders for your factory ({user.factory_name}). This order belongs to a different factory."
        )
