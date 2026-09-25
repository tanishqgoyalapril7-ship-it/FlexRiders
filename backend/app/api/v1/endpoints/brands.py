from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.all_models import Brand, Rider, RiderBrandAssignment, User, RiderStatus
from app.schemas.all_schemas import (
    BrandCreate,
    BrandUpdate,
    BrandResponse,
    BrandAssignmentRequest,
)
from app.api.deps import get_current_admin
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification
from app.services import data_admin_service as das
from datetime import datetime, date
from typing import List

router = APIRouter()

# Riders must be approved by an admin before they can work for a brand.
ASSIGNABLE_RIDER_STATUSES = (RiderStatus.APPROVED, RiderStatus.ACTIVE)


def _current_rider_count(db: Session, brand_id: int) -> int:
    return (
        db.query(func.count(RiderBrandAssignment.id))
        .filter(RiderBrandAssignment.brand_id == brand_id, RiderBrandAssignment.is_current == True)
        .scalar()
    )


def _brand_response(db: Session, brand: Brand) -> BrandResponse:
    return BrandResponse(
        id=brand.id,
        name=brand.name,
        code=brand.code,
        logo=brand.logo,
        description=brand.description,
        contact_person=brand.contact_person,
        contact_number=brand.contact_number,
        is_active=brand.is_active,
        public_assets_approved=bool(brand.public_assets_approved),
        created_at=brand.created_at,
        updated_at=brand.updated_at,
        active_riders_count=_current_rider_count(db, brand.id),
    )


def _clean(value):
    value = (value or "").strip()
    return value or None


def _check_unique(db: Session, name: str, code: str, exclude_id: int = None):
    query = db.query(Brand)
    if exclude_id:
        query = query.filter(Brand.id != exclude_id)
    if query.filter(func.lower(Brand.name) == name.lower()).first():
        raise HTTPException(status_code=400, detail="A brand with this name already exists")
    if code and query.filter(func.lower(Brand.code) == code.lower()).first():
        raise HTTPException(status_code=400, detail="A brand with this code already exists")


@router.get("", response_model=List[BrandResponse])
def get_brands(active_only: bool = False, db: Session = Depends(get_db)):
    """Lists brands created by admins. Pass active_only=true for assignment and campaign pickers."""
    query = db.query(Brand)
    if active_only:
        query = query.filter(Brand.is_active == True)
    return [_brand_response(db, b) for b in query.order_by(Brand.name).all()]


@router.post("", response_model=BrandResponse)
def create_brand(
    brand_in: BrandCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin creates a new brand"""
    name = _clean(brand_in.name)
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Brand name must be at least 2 characters")
    code = _clean(brand_in.code) or name.lower().replace(" ", "_")
    _check_unique(db, name, code)

    brand = Brand(
        name=name,
        code=code,
        logo=_clean(brand_in.logo),
        description=_clean(brand_in.description),
        contact_person=_clean(brand_in.contact_person),
        contact_number=_clean(brand_in.contact_number),
        is_active=brand_in.is_active,
        public_assets_approved=bool(brand_in.public_assets_approved),
    )
    db.add(brand)
    db.commit()
    db.refresh(brand)

    log_admin_action(
        db=db,
        admin_user=admin,
        action="BRAND_CREATED",
        target_type="BRAND",
        target_id=str(brand.id),
        details=f"Brand {brand.name} created",
    )
    return _brand_response(db, brand)


@router.get("/{id}")
def get_brand_detail(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Brand details with current riders and full assignment history."""
    brand = db.query(Brand).filter(Brand.id == id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    assignments = (
        db.query(RiderBrandAssignment)
        .filter(RiderBrandAssignment.brand_id == brand.id)
        .order_by(RiderBrandAssignment.assignment_date.desc())
        .all()
    )
    return {
        **_brand_response(db, brand).model_dump(),
        "assignments": [
            {
                "id": a.id,
                "rider_db_id": a.rider.id,
                "rider_id": a.rider.rider_id,
                "rider_name": a.rider.full_name,
                "rider_status": a.rider.status,
                "assignment_date": a.assignment_date,
                "removal_date": a.removal_date,
                "is_current": a.is_current,
                "assigned_by": a.assigned_by.email if a.assigned_by else None,
                "notes": a.notes,
            }
            for a in assignments
        ],
    }


@router.put("/{id}", response_model=BrandResponse)
def update_brand(
    id: int,
    brand_in: BrandUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    brand = db.query(Brand).filter(Brand.id == id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    name = _clean(brand_in.name) if brand_in.name is not None else brand.name
    code = _clean(brand_in.code) if brand_in.code is not None else brand.code
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="Brand name must be at least 2 characters")
    _check_unique(db, name, code, exclude_id=brand.id)

    was_active = brand.is_active
    brand.name = name
    brand.code = code or brand.code
    for field in ("logo", "description", "contact_person", "contact_number"):
        value = getattr(brand_in, field)
        if value is not None:
            setattr(brand, field, _clean(value))
    if brand_in.is_active is not None:
        # Deactivating only blocks new assignments; current and past assignments are kept.
        brand.is_active = brand_in.is_active
    assets_changed = brand_in.public_assets_approved is not None and bool(brand.public_assets_approved) != brand_in.public_assets_approved
    if brand_in.public_assets_approved is not None:
        brand.public_assets_approved = brand_in.public_assets_approved

    db.commit()
    db.refresh(brand)

    action = "BRAND_UPDATED"
    if was_active != brand.is_active:
        action = "BRAND_ACTIVATED" if brand.is_active else "BRAND_DEACTIVATED"
    log_admin_action(
        db=db,
        admin_user=admin,
        action=action,
        target_type="BRAND",
        target_id=str(brand.id),
        details=f"Brand {brand.name} {action.split('_')[1].lower()}",
    )
    if assets_changed:
        log_admin_action(db=db, admin_user=admin, action="BRAND_PUBLIC_ASSETS_" + ("APPROVED" if brand.public_assets_approved else "REVOKED"),
                         target_type="BRAND", target_id=str(brand.id),
                         details=f"{brand.name}: logo {'may' if brand.public_assets_approved else 'may no longer'} be shown on public pages")
    return _brand_response(db, brand)


@router.get("/{id}/delete-impact")
def brand_delete_impact(id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    brand = db.query(Brand).filter(Brand.id == id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return das.brand_impact(db, brand)


@router.delete("/{id}")
def delete_brand(id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Permanent delete, only for brands with no campaigns, assignments or payments. Otherwise deactivate."""
    brand = db.query(Brand).filter(Brand.id == id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    try:
        das.hard_delete_brand(db, brand, admin)
    except das.DataAdminError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"success": True, "message": "Brand permanently deleted"}


@router.post("/assign/{rider_id}")
def assign_rider_to_brand(
    rider_id: int,
    request: BrandAssignmentRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Assigns an approved rider to an active brand.
    - A rider has one current brand; any previous assignment is ended, never deleted.
    - The rider becomes ACTIVE once assigned.
    """
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    if rider.archived_at:
        raise HTTPException(status_code=400, detail="Archived riders can't be assigned to a brand. Restore the rider first.")
    if rider.status not in ASSIGNABLE_RIDER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Only approved riders can be assigned to a brand. This rider is {rider.status.lower().replace('_', ' ')}.",
        )

    brand = db.query(Brand).filter(Brand.id == request.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found. Create the brand first.")
    if not brand.is_active:
        raise HTTPException(status_code=400, detail=f"{brand.name} is inactive and cannot receive new riders.")

    today = date.today()
    assigned_on = request.assignment_date or today
    if assigned_on > today:
        raise HTTPException(status_code=400, detail="Assignment date cannot be in the future.")

    existing_assignments = (
        db.query(RiderBrandAssignment)
        .filter(RiderBrandAssignment.rider_id == rider.id, RiderBrandAssignment.is_current == True)
        .all()
    )
    if any(a.brand_id == brand.id for a in existing_assignments):
        raise HTTPException(status_code=400, detail=f"{rider.full_name} is already assigned to {brand.name}.")

    now = datetime.utcnow()
    for old_a in existing_assignments:
        old_a.is_current = False
        old_a.removal_date = now

    new_assignment = RiderBrandAssignment(
        rider_id=rider.id,
        brand_id=brand.id,
        assigned_by_id=admin.id,
        assignment_date=now if assigned_on == today else datetime.combine(assigned_on, datetime.min.time()),
        is_current=True,
        notes=_clean(request.notes) or "Brand assigned by admin",
    )
    db.add(new_assignment)
    rider.status = RiderStatus.ACTIVE
    db.commit()
    db.refresh(rider)

    log_admin_action(
        db=db,
        admin_user=admin,
        action="BRAND_ASSIGNED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Assigned to {brand.name} from {assigned_on.strftime('%d %b %Y')}",
    )
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Brand Assigned",
            message=f"You've been assigned to {brand.name}. You can view your brand details in the app.",
            category="BRAND",
            reference_id=brand.name,
        )

    return {
        "success": True,
        "message": f"{rider.full_name} ({rider.rider_id}) is now assigned to {brand.name}.",
        "rider_status": rider.status,
        "brand_id": brand.id,
        "brand_name": brand.name,
        "assignment_date": new_assignment.assignment_date,
    }


@router.delete("/unassign/{rider_id}")
def unassign_rider_brand(
    rider_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Ends the rider's current brand assignment. The brand and the history are kept."""
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    existing_assignments = (
        db.query(RiderBrandAssignment)
        .filter(RiderBrandAssignment.rider_id == rider.id, RiderBrandAssignment.is_current == True)
        .all()
    )
    if not existing_assignments:
        raise HTTPException(status_code=400, detail="This rider has no current brand assignment.")

    brand_names = ", ".join(a.brand.name for a in existing_assignments)
    for old_a in existing_assignments:
        old_a.is_current = False
        old_a.removal_date = datetime.utcnow()
    # Back to "approved, waiting for a brand".
    if rider.status == RiderStatus.ACTIVE:
        rider.status = RiderStatus.APPROVED
    db.commit()

    log_admin_action(
        db=db,
        admin_user=admin,
        action="BRAND_REMOVED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Assignment to {brand_names} ended for {rider.rider_id}",
    )
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Brand assignment ended",
            message=f"Your assignment to {brand_names} has ended. You'll be notified when you're assigned to a new brand.",
            category="BRAND",
            reference_id=brand_names,
        )

    return {"success": True, "message": "Brand assignment ended", "rider_status": rider.status}
