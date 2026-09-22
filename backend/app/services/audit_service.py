from sqlalchemy.orm import Session
from app.models.all_models import AuditLog, User
from typing import Optional


def log_admin_action(
    db: Session,
    admin_user: User,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: str = "127.0.0.1",
) -> AuditLog:
    log_entry = AuditLog(
        admin_id=admin_user.id if admin_user else None,
        admin_email=admin_user.email if admin_user else "system@superriders.com",
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id else None,
        details=details,
        ip_address=ip_address,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
