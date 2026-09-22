from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.database import get_db
from app.models.all_models import AuditLog, User
from app.schemas.all_schemas import AuditLogResponse
from app.api.deps import get_current_admin
from typing import List, Optional

router = APIRouter()


@router.get("", response_model=List[AuditLogResponse])
def get_audit_logs(
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Enforces admin access to immutable audit log trails"""
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)
    if target_type:
        query = query.filter(AuditLog.target_type == target_type)

    logs = query.order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()
    return logs
