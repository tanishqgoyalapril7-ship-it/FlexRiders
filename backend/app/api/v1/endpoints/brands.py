from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.all_models import Brand, Rider, RiderBrandAssignment, User, RiderStatus
from app.schemas.all_schemas import (
    BrandCreate,
    BrandUpdate,
    BrandResponse,
    BrandAssignmentRequest,
    BrandAssignmentResponse,
)
from app.api.deps import get_current_admin
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification
from datetime import datetime
from typing import List

router = APIRouter()


@router.get("", response_model=List[BrandResponse])
def get_brands(db: Session = Depends(get_db)):
    """List all active brands with rider count"""
    brands = db.query(Brand).all()
    res = []
    for b in brands:
        active_count = (
            db.query(RiderBrandAssignment)
            .filter(RiderBrandAssignment.brand_id == b.id, RiderBrandAssignment.is_current == True)
            .count()
        )
        res.append(
            BrandResponse(
                id=b.id,
                name=b.name,
                code=b.code,
                logo=b.logo,
                description=b.description,
                contact_person=b.contact_person,
                contact_number=b.contact_number,
                is_active=b.is_active,
                created_at=b.created_at,
                active_riders_count=active_count,
            )
        )
    return res


@router.post("", response_model=BrandResponse)
def create_brand(
    brand_in: BrandCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin creates a new brand"""
    existing = db.query(Brand).filter(Brand.name.ilike(brand_in.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Brand with this name already exists")

    brand = Brand(
        name=brand_in.name,
        code=brand_in.code or brand_in.name.lower().replace(" ", "_"),
        logo=brand_in.logo,
        description=brand_in.description,
        contact_person=brand_in.contact_person,
        contact_number=brand_in.contact_number,
        is_active=brand_in.is_active,
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

    return BrandResponse(
        id=brand.id,
        name=brand.name,
        code=brand.code,
        logo=brand.logo,
        description=brand.description,
        contact_person=brand.contact_person,
        contact_number=brand.contact_number,
        is_active=brand.is_active,
        created_at=brand.created_at,
        active_riders_count=0,
    )


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

    if brand_in.name is not None:
        brand.name = brand_in.name
    if brand_in.code is not None:
        brand.code = brand_in.code
    if brand_in.logo is not None:
        brand.logo = brand_in.logo
    if brand_in.description is not None:
        brand.description = brand_in.description
    if brand_in.contact_person is not None:
        brand.contact_person = brand_in.contact_person
    if brand_in.contact_number is not None:
        brand.contact_number = brand_in.contact_number
    if brand_in.is_active is not None:
        brand.is_active = brand_in.is_active

    db.commit()
    db.refresh(brand)

    log_admin_action(
        db=db,
        admin_user=admin,
        action="BRAND_UPDATED",
        target_type="BRAND",
        target_id=str(brand.id),
        details=f"Brand {brand.name} updated",
    )

    active_count = (
        db.query(RiderBrandAssignment)
        .filter(RiderBrandAssignment.brand_id == brand.id, RiderBrandAssignment.is_current == True)
        .count()
    )

    return BrandResponse(
        id=brand.id,
        name=brand.name,
        code=brand.code,
        logo=brand.logo,
        description=brand.description,
        contact_person=brand.contact_person,
        contact_number=brand.contact_number,
        is_active=brand.is_active,
        created_at=brand.created_at,
        active_riders_count=active_count,
    )


@router.post("/assign/{rider_id}")
def assign_rider_to_brand(
    rider_id: int,
    request: BrandAssignmentRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Assigns rider to brand.
    Business rule:
    - Retires previous current assignment (marks is_current=False and sets removal_date)
    - Creates new RiderBrandAssignment
    - Rider status becomes ACTIVE!
    - Logs audit and notifies rider
    """
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    brand = db.query(Brand).filter(Brand.id == request.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Mark existing active assignments as ended
    existing_assignments = (
        db.query(RiderBrandAssignment)
        .filter(RiderBrandAssignment.rider_id == rider.id, RiderBrandAssignment.is_current == True)
        .all()
    )
    for old_a in existing_assignments:
        old_a.is_current = False
        old_a.removal_date = datetime.utcnow()

    # Create new assignment
    new_assignment = RiderBrandAssignment(
        rider_id=rider.id,
        brand_id=brand.id,
        assigned_by_id=admin.id,
        assignment_date=datetime.utcnow(),
        is_current=True,
        notes=request.notes or "Brand assigned by admin",
    )
    db.add(new_assignment)

    # Transition Rider status to ACTIVE
    rider.status = RiderStatus.ACTIVE
    db.commit()
    db.refresh(rider)

    # Audit log
    log_admin_action(
        db=db,
        admin_user=admin,
        action="BRAND_ASSIGNED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Assigned to {brand.name} on {datetime.utcnow().strftime('%d %b %Y')}",
    )

    # Notify rider
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Brand Assigned",
            message=f"You have been assigned to {brand.name}! Your account is now ACTIVE and you can start taking orders.",
            category="BRAND",
            reference_id=brand.name,
        )

    return {
        "success": True,
        "message": f"Rider {rider.rider_id} successfully assigned to {brand.name}. Status is now ACTIVE.",
        "rider_status": rider.status,
        "brand_name": brand.name,
    }


@router.delete("/unassign/{rider_id}")
def unassign_rider_brand(
    rider_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Removes current brand assignment"""
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    existing_assignments = (
        db.query(RiderBrandAssignment)
        .filter(RiderBrandAssignment.rider_id == rider.id, RiderBrandAssignment.is_current == True)
        .all()
    )
    for old_a in existing_assignments:
        old_a.is_current = False
        old_a.removal_date = datetime.utcnow()

    db.commit()

    log_admin_action(
        db=db,
        admin_user=admin,
        action="BRAND_REMOVED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Brand assignment removed for {rider.rider_id}",
    )

    return {"success": True, "message": "Brand assignment removed"}
