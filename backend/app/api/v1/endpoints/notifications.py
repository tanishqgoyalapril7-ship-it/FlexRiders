from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from app.core.database import get_db
from app.models.all_models import Notification, User
from app.schemas.all_schemas import NotificationResponse
from app.api.deps import get_current_user
from typing import List

router = APIRouter()


@router.get("", response_model=List[NotificationResponse])
def get_user_notifications(
    category: str = "ALL",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns notifications for the current user or admin broadcast"""
    query = db.query(Notification)

    if current_user.role in ["SUPER_ADMIN", "ADMIN", "FINANCE_ADMIN", "OPERATIONS_ADMIN"]:
        query = query.filter(or_(Notification.is_admin_notification == True, Notification.user_id == current_user.id))
    else:
        query = query.filter(Notification.user_id == current_user.id)

    if category != "ALL" and category != "All":
        query = query.filter(Notification.category.ilike(category))

    notifs = query.order_by(desc(Notification.created_at)).limit(50).all()
    return notifs


@router.patch("/{id}/read")
def mark_notification_read(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = db.query(Notification).filter(Notification.id == id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    db.commit()
    return {"success": True}


@router.patch("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification)
    if current_user.role in ["SUPER_ADMIN", "ADMIN", "FINANCE_ADMIN", "OPERATIONS_ADMIN"]:
        query = query.filter(or_(Notification.is_admin_notification == True, Notification.user_id == current_user.id))
    else:
        query = query.filter(Notification.user_id == current_user.id)

    query.update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"success": True}
