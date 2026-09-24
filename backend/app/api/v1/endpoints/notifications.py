from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from app.core.database import get_db
from app.core.security import UserRole
from app.models.all_models import Notification, User
from app.schemas.all_schemas import NotificationResponse
from app.api.deps import get_current_user
from typing import List

router = APIRouter()


def _visible(db: Session, user: User):
    """Notifications this user may see and manage: their own, plus admin broadcasts for admins."""
    query = db.query(Notification)
    if user.role in UserRole.ADMIN_ROLES:
        return query.filter(or_(Notification.is_admin_notification == True, Notification.user_id == user.id))  # noqa: E712
    return query.filter(Notification.user_id == user.id)


def _get_visible(db: Session, user: User, id: int) -> Notification:
    notif = _visible(db, user).filter(Notification.id == id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notif


@router.get("", response_model=List[NotificationResponse])
def get_user_notifications(
    category: str = "ALL",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns notifications for the current user or admin broadcast"""
    query = _visible(db, current_user)
    if category != "ALL" and category != "All":
        query = query.filter(Notification.category.ilike(category))
    return query.order_by(desc(Notification.created_at)).limit(50).all()


@router.patch("/{id}/read")
def mark_notification_read(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notif = _get_visible(db, current_user, id)
    notif.is_read = True
    db.commit()
    return {"success": True}


@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _visible(db, current_user).update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"success": True}


@router.delete("/{id}")
def delete_notification(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Notifications are messages, not records: deleting one removes it for good."""
    db.delete(_get_visible(db, current_user, id))
    db.commit()
    return {"success": True}


@router.delete("")
def clear_notifications(read_only: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = _visible(db, current_user)
    if read_only:
        query = query.filter(Notification.is_read == True)  # noqa: E712
    removed = query.delete(synchronize_session=False)
    db.commit()
    return {"success": True, "removed": removed}
