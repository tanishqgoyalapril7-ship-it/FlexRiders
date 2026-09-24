"""Admin accounts, read-only system settings and data reset."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.core.config import settings
from app.core.database import get_db
from app.core.security import UserRole, get_password_hash
from app.models.all_models import User
from app.schemas.all_schemas import AdminUserCreate, AdminUserUpdate, ResetRequest
from app.services import data_admin_service as das
from app.services.audit_service import log_admin_action

users_router = APIRouter()
system_router = APIRouter()

ROLE_DESCRIPTIONS = {
    UserRole.SUPER_ADMIN: "Full access, including admin accounts and data reset",
    UserRole.ADMIN: "Riders, brands, campaigns and payments",
    UserRole.OPERATIONS_ADMIN: "Rider review, approvals, brand and campaign operations",
    UserRole.FINANCE_ADMIN: "Payments, payouts and financial reports",
}


def require_super_admin(admin: User = Depends(get_current_admin)) -> User:
    if admin.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only a super admin can do this.")
    return admin


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "role_description": ROLE_DESCRIPTIONS.get(u.role, ""),
        "is_active": u.is_active,
        "created_at": u.created_at,
    }


def _active_super_admins(db: Session) -> int:
    return db.query(User).filter(User.role == UserRole.SUPER_ADMIN, User.is_active == True).count()  # noqa: E712


def _clean_phone(value: str) -> str:
    phone = "".join(ch for ch in value if ch.isdigit() or ch == "+")
    if len(phone.lstrip("+")) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid phone number (at least 10 digits)")
    return phone


def _check_unique(db: Session, email=None, phone=None, exclude_id=None):
    for field, value, label in ((User.email, email, "email"), (User.phone, phone, "phone number")):
        if not value:
            continue
        query = db.query(User).filter(field == value)
        if exclude_id:
            query = query.filter(User.id != exclude_id)
        if query.first():
            raise HTTPException(status_code=400, detail=f"Another account already uses this {label}")


@users_router.get("")
def list_admin_users(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)) -> List[dict]:
    users = db.query(User).filter(User.role.in_(UserRole.ADMIN_ROLES)).order_by(User.id).all()
    return [_user_dict(u) for u in users]


@users_router.get("/me")
def current_admin(admin: User = Depends(get_current_admin)):
    return _user_dict(admin)


@users_router.get("/roles")
def admin_roles(admin: User = Depends(get_current_admin)):
    return [{"role": role, "description": ROLE_DESCRIPTIONS[role]} for role in UserRole.ADMIN_ROLES]


@users_router.post("")
def create_admin_user(data: AdminUserCreate, db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    if data.role not in UserRole.ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="Choose a valid admin role")
    phone = _clean_phone(data.phone)
    _check_unique(db, data.email, phone)
    user = User(email=data.email, phone=phone, hashed_password=get_password_hash(data.password), role=data.role, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    log_admin_action(db=db, admin_user=admin, action="ADMIN_CREATED", target_type="ADMIN", target_id=str(user.id), details=f"{user.email} created as {user.role}")
    return _user_dict(user)


@users_router.put("/{id}")
def update_admin_user(id: int, data: AdminUserUpdate, db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    user = db.query(User).filter(User.id == id, User.role.in_(UserRole.ADMIN_ROLES)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Admin account not found")
    changes = data.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"] not in UserRole.ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="Choose a valid admin role")
    losing_super = user.role == UserRole.SUPER_ADMIN and user.is_active and (
        changes.get("is_active") is False or changes.get("role", UserRole.SUPER_ADMIN) != UserRole.SUPER_ADMIN
    )
    if user.id == admin.id and (changes.get("is_active") is False or "role" in changes and changes["role"] != admin.role):
        raise HTTPException(status_code=400, detail="You can't deactivate or change the role of your own account.")
    if losing_super and _active_super_admins(db) <= 1:
        raise HTTPException(status_code=400, detail="There must always be at least one active super admin.")
    phone = _clean_phone(changes["phone"]) if changes.get("phone") else None
    _check_unique(db, changes.get("email"), phone, exclude_id=user.id)

    changed = []
    for field, value in (("email", changes.get("email")), ("phone", phone), ("role", changes.get("role")), ("is_active", changes.get("is_active"))):
        if value is not None and getattr(user, field) != value:
            setattr(user, field, value)
            changed.append(field)
    if changes.get("password"):
        user.hashed_password = get_password_hash(changes["password"])
        changed.append("password")
    db.commit()
    if changed:
        log_admin_action(db=db, admin_user=admin, action="ADMIN_UPDATED", target_type="ADMIN", target_id=str(user.id), details=f"{user.email} updated: {', '.join(changed)}")
    return _user_dict(user)


@users_router.delete("/{id}")
def deactivate_admin_user(id: int, db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    """Admin accounts are deactivated, never deleted: the audit log refers to them."""
    return update_admin_user(id, AdminUserUpdate(is_active=False), db, admin)


@system_router.get("/settings")
def system_settings(admin: User = Depends(get_current_admin)):
    """Read-only: these rules are set in the backend configuration (.env), not from the dashboard."""
    return [
        {"group": "Riders", "label": "Rider ID prefix", "value": "SR-"},
        {"group": "Riders", "label": "Brand assignment", "value": "One current brand per rider"},
        {"group": "Campaigns", "label": "Photos needed per completed rider-day", "value": settings.PHOTOS_PER_DAY},
        {"group": "Campaigns", "label": "On track at or above (% of expected)", "value": f"{settings.FULFILLMENT_ON_TRACK_PCT:g}%"},
        {"group": "Campaigns", "label": "Behind target below (% of expected)", "value": f"{settings.FULFILLMENT_AT_RISK_PCT:g}%"},
        {"group": "Campaigns", "label": "Rider at risk below (% of their days)", "value": f"{settings.RIDER_BEHIND_PCT:g}%"},
        {"group": "Campaigns", "label": "Rider inactive after missed days", "value": settings.INACTIVE_MISSED_DAYS},
        {"group": "Campaigns", "label": "Low sample: fewer than", "value": f"{settings.LOW_SAMPLE_MIN_DAYS} days or {settings.LOW_SAMPLE_MIN_RIDER_DAYS} rider-days"},
        {"group": "Payments", "label": "Payment processing", "value": "Recorded manually (no payment gateway connected)"},
    ]


@system_router.get("/reset-preview")
def reset_preview(db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    return {"confirmation": das.RESET_CONFIRMATION, "scopes": das.reset_preview(db)}


@system_router.post("/reset")
def reset(data: ResetRequest, db: Session = Depends(get_db), admin: User = Depends(require_super_admin)):
    try:
        return das.reset_data(db, data.scope, data.confirmation, admin)
    except das.DataAdminError as e:
        raise HTTPException(status_code=400, detail=str(e))
