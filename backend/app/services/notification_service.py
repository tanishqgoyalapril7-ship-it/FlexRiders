from sqlalchemy.orm import Session
from app.models.all_models import Notification
from typing import Optional


def send_notification(
    db: Session,
    title: str,
    message: str,
    user_id: Optional[int] = None,
    is_admin: bool = False,
    category: str = "SYSTEM",
    reference_id: Optional[str] = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        is_admin_notification=is_admin,
        title=title,
        message=message,
        category=category,
        reference_id=reference_id,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif
