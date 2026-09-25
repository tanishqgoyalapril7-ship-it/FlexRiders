from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from app.core.database import get_db
from app.models.all_models import Rider, RiderDocument, RiderBrandAssignment, User, RiderStatus
from app.schemas.all_schemas import (
    AdminRiderCreate,
    AdminRiderUpdate,
    ArchiveRequest,
    RiderResponse,
    RiderDetailResponse,
    RiderStatusUpdate,
    DocumentResponse,
    BrandAssignmentResponse,
)
from app.api.deps import get_current_admin
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification
from app.services.payment_service import calculate_rider_earnings
from app.services import data_admin_service as das
from app.services.rider_service import generate_next_rider_id
from app.core.security import get_password_hash, UserRole
from typing import List, Optional

router = APIRouter()


@router.get("", response_model=List[RiderResponse])
def get_all_riders(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    brand_id: Optional[int] = None,
    city: Optional[str] = None,
    company: Optional[str] = None,
    vehicle_category: Optional[str] = None,  # CYCLE / TWO_WHEELER / AUTO / THREE_WHEELER, or NONE (not set yet)
    archived: str = Query("exclude", pattern="^(exclude|only|include)$"),
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin search and filter riders"""
    query = db.query(Rider)
    # Archived (soft-deleted) riders are hidden unless asked for.
    if archived == "exclude":
        query = query.filter(Rider.archived_at.is_(None))
    elif archived == "only":
        query = query.filter(Rider.archived_at.isnot(None))

    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Rider.full_name.ilike(search_fmt),
                Rider.rider_id.ilike(search_fmt),
                Rider.mobile_number.ilike(search_fmt),
                Rider.current_company.ilike(search_fmt),
                Rider.primary_city.ilike(search_fmt),
                Rider.upi_id.ilike(search_fmt),
                Rider.vehicle_number.ilike(search_fmt.replace(" ", "")),
            )
        )

    if status_filter and status_filter != "ALL":
        query = query.filter(Rider.status == status_filter)

    if city and city != "ALL":
        query = query.filter(Rider.primary_city.ilike(f"%{city}%"))

    if vehicle_category and vehicle_category != "ALL":
        query = query.filter(Rider.vehicle_category.is_(None) if vehicle_category == "NONE" else Rider.vehicle_category == vehicle_category)

    if company and company != "ALL":
        query = query.filter(Rider.current_company.ilike(f"%{company}%"))

    riders = query.order_by(desc(Rider.id)).offset(skip).limit(limit).all()

    result = []
    for r in riders:
        # Check current brand
        current_brand = None
        current_brand_id = None
        for a in r.brand_assignments:
            if a.is_current and a.brand:
                current_brand = a.brand.name
                current_brand_id = a.brand.id
                break

        if brand_id and current_brand_id != brand_id:
            continue

        result.append(
            RiderResponse(
                id=r.id,
                rider_id=r.rider_id,
                full_name=r.full_name,
                mobile_number=r.mobile_number,
                email=r.email,
                profile_photo=r.profile_photo,
                dob=r.dob,
                current_company=r.current_company,
                current_role=r.current_role,
                experience_years=r.experience_years,
                experience_months=r.experience_months,
                vehicle_type=r.vehicle_type,
                vehicle_number=r.vehicle_number,
                vehicle_category=r.vehicle_category,
                archived_at=r.archived_at,
                archive_reason=r.archive_reason,
                primary_city=r.primary_city,
                primary_area=r.primary_area,
                additional_locations=r.additional_locations,
                preferred_radius=r.preferred_radius,
                upi_id=r.upi_id,
                gpay_number=r.gpay_number,
                status=r.status,
                current_brand=current_brand,
                current_brand_id=current_brand_id,
                created_at=r.created_at,
            )
        )

    return result


@router.get("/{id}", response_model=RiderDetailResponse)
def get_rider_detail(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Detailed view for admin review and profile inspection"""
    rider = db.query(Rider).filter(Rider.id == id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    current_brand = None
    current_brand_id = None
    for a in rider.brand_assignments:
        if a.is_current and a.brand:
            current_brand = a.brand.name
            current_brand_id = a.brand.id
            break

    earnings = calculate_rider_earnings(db, rider.id)

    docs = [
        DocumentResponse(
            id=d.id,
            doc_type=d.doc_type,
            file_name=d.file_name,
            file_url=d.file_url,
            status=d.status,
            rejection_note=d.rejection_note,
            created_at=d.created_at,
        )
        for d in rider.documents
    ]

    history = [
        BrandAssignmentResponse(
            id=a.id,
            rider_id=a.rider_id,
            brand_id=a.brand_id,
            brand_name=a.brand.name if a.brand else "Unknown",
            assignment_date=a.assignment_date,
            removal_date=a.removal_date,
            is_current=a.is_current,
            notes=a.notes,
            assigned_by_name=a.assigned_by.email if a.assigned_by else "Admin",
        )
        for a in rider.brand_assignments
    ]

    return RiderDetailResponse(
        id=rider.id,
        rider_id=rider.rider_id,
        full_name=rider.full_name,
        mobile_number=rider.mobile_number,
        email=rider.email,
        profile_photo=rider.profile_photo,
        dob=rider.dob,
        current_company=rider.current_company,
        current_role=rider.current_role,
        experience_years=rider.experience_years,
        experience_months=rider.experience_months,
        vehicle_type=rider.vehicle_type,
        vehicle_number=rider.vehicle_number,
        vehicle_category=rider.vehicle_category,
        archived_at=rider.archived_at,
        archive_reason=rider.archive_reason,
        primary_city=rider.primary_city,
        primary_area=rider.primary_area,
        additional_locations=rider.additional_locations,
        preferred_radius=rider.preferred_radius,
        upi_id=rider.upi_id,
        gpay_number=rider.gpay_number,
        status=rider.status,
        current_brand=current_brand,
        current_brand_id=current_brand_id,
        created_at=rider.created_at,
        documents=docs,
        brand_history=history,
        total_earnings=earnings["total_earnings"],
        paid_earnings=earnings["paid_earnings"],
        pending_earnings=earnings["pending_earnings"],
        rejection_reason=rider.rejection_reason,
        suspension_reason=rider.suspension_reason,
    )


@router.patch("/{id}/approve")
def approve_rider(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin approves pending rider -> status becomes APPROVED"""
    rider = db.query(Rider).filter(Rider.id == id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    rider.status = RiderStatus.APPROVED
    db.commit()
    db.refresh(rider)

    # Log action
    log_admin_action(
        db=db,
        admin_user=admin,
        action="RIDER_APPROVED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Rider {rider.full_name} ({rider.rider_id}) approved by {admin.email}",
    )

    # Notify rider
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Registration Approved",
            message="Your registration has been approved. A brand assignment will be made shortly to activate your account.",
            category="REGISTRATION",
            reference_id=rider.rider_id,
        )

    return {"success": True, "message": f"Rider {rider.rider_id} approved successfully", "status": rider.status}


@router.patch("/{id}/reject")
def reject_rider(
    id: int,
    update: RiderStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin rejects rider -> status becomes REJECTED"""
    rider = db.query(Rider).filter(Rider.id == id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    rider.status = RiderStatus.REJECTED
    rider.rejection_reason = update.reason or "Application did not meet requirements"
    db.commit()
    db.refresh(rider)

    # Log action
    log_admin_action(
        db=db,
        admin_user=admin,
        action="RIDER_REJECTED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Rider {rider.full_name} rejected. Reason: {rider.rejection_reason}",
    )

    # Notify rider
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Registration Status Update",
            message=f"Your registration could not be approved. Reason: {rider.rejection_reason}",
            category="REGISTRATION",
            reference_id=rider.rider_id,
        )

    return {"success": True, "message": f"Rider {rider.rider_id} rejected", "status": rider.status}


@router.patch("/{id}/suspend")
def suspend_rider(
    id: int,
    update: RiderStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin suspends rider"""
    rider = db.query(Rider).filter(Rider.id == id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    rider.status = RiderStatus.SUSPENDED
    rider.suspension_reason = update.reason or "Suspended by admin"
    db.commit()
    db.refresh(rider)

    log_admin_action(
        db=db,
        admin_user=admin,
        action="RIDER_SUSPENDED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Rider {rider.full_name} suspended. Reason: {rider.suspension_reason}",
    )

    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Account Suspended",
            message=f"Your FlexRiders account has been suspended: {rider.suspension_reason}. Contact support for details.",
            category="SYSTEM",
            reference_id=rider.rider_id,
        )

    return {"success": True, "message": f"Rider {rider.rider_id} suspended", "status": rider.status}


@router.patch("/{id}/reactivate")
def reactivate_rider(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Reactivate rider -> status ACTIVE"""
    rider = db.query(Rider).filter(Rider.id == id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    rider.status = RiderStatus.ACTIVE
    rider.suspension_reason = None
    db.commit()
    db.refresh(rider)

    log_admin_action(
        db=db,
        admin_user=admin,
        action="RIDER_REACTIVATED",
        target_type="RIDER",
        target_id=rider.rider_id,
        details=f"Rider {rider.full_name} reactivated by {admin.email}",
    )

    return {"success": True, "message": f"Rider {rider.rider_id} reactivated", "status": rider.status}


# ---------------------------------------------------------------------------
# Create / edit / delete / archive
# ---------------------------------------------------------------------------

def _get_rider(db: Session, id: int) -> Rider:
    rider = db.query(Rider).filter(Rider.id == id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    return rider


def _clean_mobile(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit() or ch == "+")
    if len(digits.lstrip("+")) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number (at least 10 digits)")
    return digits


def _check_rider_unique(db: Session, mobile: Optional[str], vehicle_number: Optional[str], email: Optional[str], exclude_rider: Optional[Rider] = None):
    exclude_user_id = exclude_rider.user_id if exclude_rider else None
    if mobile:
        q = db.query(User).filter(User.phone == mobile)
        if exclude_user_id:
            q = q.filter(User.id != exclude_user_id)
        if q.first():
            raise HTTPException(status_code=400, detail="Another account already uses this mobile number")
    if email:
        q = db.query(User).filter(User.email == email)
        if exclude_user_id:
            q = q.filter(User.id != exclude_user_id)
        if q.first():
            raise HTTPException(status_code=400, detail="Another account already uses this email")
    if vehicle_number:
        q = db.query(Rider).filter(Rider.vehicle_number == vehicle_number)
        if exclude_rider:
            q = q.filter(Rider.id != exclude_rider.id)
        if q.first():
            raise HTTPException(status_code=400, detail=f"Vehicle {vehicle_number} is already registered to another rider")


@router.post("", response_model=RiderDetailResponse)
def create_rider(data: AdminRiderCreate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    if data.status not in (RiderStatus.PENDING, RiderStatus.APPROVED):
        raise HTTPException(status_code=400, detail="New riders start as Pending or Approved")
    mobile = _clean_mobile(data.mobile_number)
    _check_rider_unique(db, mobile, data.vehicle_number, data.email)
    user = User(phone=mobile, email=data.email, hashed_password=get_password_hash(data.password), role=UserRole.RIDER, is_active=True)
    db.add(user)
    db.flush()
    clean = lambda v: (v or "").strip() or None
    rider = Rider(
        user_id=user.id,
        rider_id=generate_next_rider_id(db),
        full_name=data.full_name.strip(),
        mobile_number=mobile,
        email=data.email,
        dob=clean(data.dob),
        current_company=clean(data.current_company),
        current_role=clean(data.current_role) or "Rider",
        vehicle_type=clean(data.vehicle_type),
        vehicle_number=data.vehicle_number,
        vehicle_category=data.vehicle_category,
        primary_city=data.primary_city.strip(),
        primary_area=clean(data.primary_area),
        upi_id=clean(data.upi_id),
        gpay_number=clean(data.gpay_number),
        status=data.status,
    )
    db.add(rider)
    db.commit()
    db.refresh(rider)
    log_admin_action(db=db, admin_user=admin, action="RIDER_CREATED", target_type="RIDER", target_id=rider.rider_id, details=f"{rider.full_name} created by admin ({rider.status})")
    return get_rider_detail(rider.id, db, admin)


EDITABLE_FIELDS = (
    "full_name", "email", "dob", "current_company", "current_role", "vehicle_type", "vehicle_number",
    "vehicle_category", "primary_city", "primary_area", "upi_id", "gpay_number",
)


@router.put("/{id}", response_model=RiderDetailResponse)
def update_rider(id: int, data: AdminRiderUpdate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    rider = _get_rider(db, id)
    changes = data.model_dump(exclude_unset=True)
    mobile = _clean_mobile(changes["mobile_number"]) if changes.get("mobile_number") else None
    if "email" in changes and changes["email"]:
        from app.schemas.all_schemas import normalize_email

        try:
            changes["email"] = normalize_email(changes["email"])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    _check_rider_unique(db, mobile if mobile != rider.mobile_number else None, changes.get("vehicle_number") or None, changes.get("email") or None, exclude_rider=rider)
    for field in ("full_name", "primary_city"):
        if field in changes and not (changes[field] or "").strip():
            raise HTTPException(status_code=400, detail=f"{field.replace('_', ' ').capitalize()} is required")

    changed = []
    old_category = rider.vehicle_category
    for field in EDITABLE_FIELDS:
        if field in changes:
            value = changes[field]
            value = value.strip() if isinstance(value, str) else value
            value = value or None
            if getattr(rider, field) != value:
                setattr(rider, field, value)
                changed.append(field)
    # The result must still be valid: Bike / Auto / Three Wheeler always need a registration number
    # (e.g. Cycle → Bike without a number, or clearing a Bike's number, is refused). Only Cycle may be blank.
    from app.schemas.all_schemas import vehicle_number_problem

    problem = vehicle_number_problem(rider.vehicle_category, rider.vehicle_number)
    if problem:
        db.rollback()
        raise HTTPException(status_code=400, detail=problem)
    if mobile and mobile != rider.mobile_number:
        rider.mobile_number = mobile
        if rider.user:
            rider.user.phone = mobile  # The rider logs in with this number
        changed.append("mobile_number")
    if "email" in changed and rider.user:
        rider.user.email = rider.email
    db.commit()
    if changed:
        log_admin_action(db=db, admin_user=admin, action="RIDER_UPDATED", target_type="RIDER", target_id=rider.rider_id, details=f"{rider.full_name} updated: {', '.join(changed)}")
    if "vehicle_category" in changed:
        from app.models.campaign_models import VehicleCategory

        label = lambda c: VehicleCategory.LABELS.get(c, "not set") if c else "not set"
        log_admin_action(db=db, admin_user=admin, action="RIDER_VEHICLE_TYPE_CHANGED", target_type="RIDER", target_id=rider.rider_id,
                         details=f"{rider.full_name}: vehicle type {label(old_category)} → {label(rider.vehicle_category)}")
    return get_rider_detail(rider.id, db, admin)


@router.get("/{id}/delete-impact")
def rider_delete_impact(id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return das.rider_impact(db, _get_rider(db, id))


@router.delete("/{id}")
def delete_rider(id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Permanent delete, only for riders with no history. Otherwise archive."""
    rider = _get_rider(db, id)
    try:
        das.hard_delete_rider(db, rider, admin)
    except das.DataAdminError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"success": True, "message": "Rider permanently deleted"}


@router.post("/{id}/archive", response_model=RiderDetailResponse)
def archive_rider(id: int, data: ArchiveRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    rider = _get_rider(db, id)
    try:
        das.archive_rider(db, rider, admin, data.reason)
    except das.DataAdminError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_rider_detail(rider.id, db, admin)


@router.post("/{id}/restore", response_model=RiderDetailResponse)
def restore_rider(id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    rider = _get_rider(db, id)
    try:
        das.restore_rider(db, rider, admin)
    except das.DataAdminError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return get_rider_detail(rider.id, db, admin)
