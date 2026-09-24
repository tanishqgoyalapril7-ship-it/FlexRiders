from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.all_models import Notification


def send_notification(
    db: Session,
    title: str,
    message: str,
    user_id: Optional[int] = None,
    is_admin: bool = False,
    category: str = "SYSTEM",
    reference_id: Optional[str] = None,
    dedupe_key: Optional[str] = None,
) -> Optional[Notification]:
    """Stores an in-app notification. With a dedupe_key, a second call with the same key sends nothing
    and returns None (enforced by a unique index, so it holds across processes too)."""
    if dedupe_key and db.query(Notification.id).filter(Notification.dedupe_key == dedupe_key).first():
        return None
    notif = Notification(
        user_id=user_id,
        is_admin_notification=is_admin,
        title=title,
        message=message,
        category=category,
        reference_id=reference_id,
        dedupe_key=dedupe_key,
    )
    db.add(notif)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # Another process sent the same one a moment ago
        return None
    db.refresh(notif)
    return notif
