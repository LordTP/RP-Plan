"""User management endpoints (list / create / update / delete) plus the
lightweight @mentionable search used by comment autocomplete."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import User, UserRole
from schemas import UserResponse, UserCreate, MentionableUser
from auth import (
    get_password_hash,
    get_current_user,
    get_current_full_internal_user,
)


router = APIRouter()


@router.get("/api/users", response_model=List[UserResponse])
async def get_all_users(
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Get all users (internal/admin only)"""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return users


@router.get("/api/users/mentionable", response_model=List[MentionableUser])
async def get_mentionable_users(
    q: Optional[str] = None,
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lightweight user search for @mention autocomplete in comments.
    Available to any authenticated user. Returns active users matching the
    query against username or full_name. Excludes the current user and any
    users an admin has flagged as non-mentionable."""
    query = db.query(User).filter(
        User.is_active == True,
        User.id != current_user.id,
        User.mentionable != False,
    )
    if q:
        pattern = f"%{q.strip()}%"
        query = query.filter(or_(User.username.ilike(pattern), User.full_name.ilike(pattern)))
    users = query.order_by(User.username.asc()).limit(limit).all()
    return users


@router.post("/api/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_full_internal_user),
    db: Session = Depends(get_db)
):
    """Create a new user (internal/admin only)"""
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

    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hashed_password,
        role=user_data.role,
        factory_name=user_data.factory_name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.put("/api/users/{user_id}", response_model=UserResponse)
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
    if 'mentionable' in user_data:
        user.mentionable = bool(user_data['mentionable'])
    if 'factory_name' in user_data:
        user.factory_name = user_data['factory_name']
    if 'full_name' in user_data:
        user.full_name = user_data['full_name'] or None
    if 'username' in user_data and user_data['username']:
        new_username = user_data['username'].strip()
        if new_username != user.username:
            existing = db.query(User).filter(User.username == new_username, User.id != user_id).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
            user.username = new_username
    if 'email' in user_data and user_data['email']:
        new_email = user_data['email'].strip()
        if new_email != user.email:
            existing = db.query(User).filter(User.email == new_email, User.id != user_id).first()
            if existing:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already taken")
            user.email = new_email
    if 'password' in user_data and user_data['password']:
        user.hashed_password = get_password_hash(user_data['password'])

    db.commit()
    db.refresh(user)

    return user


@router.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
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
