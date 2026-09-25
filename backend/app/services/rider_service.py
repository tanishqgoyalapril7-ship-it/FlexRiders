from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.all_models import (
    User,
    Rider,
    RiderDocument,
    Brand,
    RiderBrandAssignment,
    RiderStatus,
)
from app.schemas.all_schemas import RiderRegistrationRequest
from app.core.security import get_password_hash, UserRole
from app.services.notification_service import send_notification
from app.services.audit_service import log_admin_action
from datetime import datetime
from typing import Optional, List

# Private folder for driver selfies. Never served through the public /uploads route.
SELFIE_FOLDER = "selfies"


def generate_next_rider_id(db: Session) -> str:
    """Generate sequential Rider ID like SR-000001, SR-000145"""
    last_rider = db.query(Rider).order_by(Rider.id.desc()).first()
    if not last_rider:
        return "SR-000001"
    
    # Try parsing number from last rider_id e.g. "SR-000145" -> 145
    try:
        current_num = int(last_rider.rider_id.replace("SR-", ""))
        next_num = current_num + 1
    except ValueError:
        next_num = last_rider.id + 1
        
    return f"SR-{next_num:06d}"


def store_selfie(db: Session, rider: Rider, selfie: str) -> None:
    """Stores the required driver selfie privately (Supabase Storage in production) and links it to the
    (flushed, not yet committed) rider. On any failure the whole creation is rolled back."""
    from app.schemas.all_schemas import decode_selfie
    from app.services import storage_service

    try:
        content, extension, content_type = decode_selfie(selfie)
        rider.profile_photo = storage_service.save(content, extension, SELFIE_FOLDER, content_type)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except storage_service.StorageError:
        db.rollback()
        raise HTTPException(status_code=503, detail="The selfie couldn't be saved just now, so the account wasn't created. Please try again.")


def commit_with_selfie(db: Session, rider: Rider) -> None:
    """Commits a new rider; if that fails, removes the already-stored selfie so nothing is left unlinked."""
    from app.services import storage_service

    try:
        db.commit()
    except Exception:
        db.rollback()
        storage_service.delete(rider.profile_photo)
        raise


def register_new_rider(db: Session, reg: RiderRegistrationRequest) -> Rider:
    """Registers a new rider in PENDING status and sends admin notification"""
    # 1. Checks. Every check runs before anything is created, so a refused registration leaves nothing behind.
    from app.services import referral_service  # Local import avoids a circular import

    try:
        referrer = referral_service.find_referrer(db, reg.referral_code)
    except referral_service.ReferralError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if reg.vehicle_number and db.query(Rider.id).filter(Rider.vehicle_number == reg.vehicle_number).first():
        raise HTTPException(status_code=400, detail=f"Vehicle {reg.vehicle_number} is already registered to another rider.")

    # Registration only ever creates a NEW account. A number that already has one (a rider, or an admin)
    # must log in with its password: registration never returns, reuses or attaches to an existing account.
    if db.query(User.id).filter(User.phone == reg.mobile_number).first():
        raise HTTPException(status_code=400, detail="This mobile number is already registered. Please log in instead.")
    user = User(
        phone=reg.mobile_number,
        email=reg.email,
        hashed_password=get_password_hash(reg.password),
        role=UserRole.RIDER,
        is_active=True,
    )
    db.add(user)
    db.flush()

    # 2. Generate unique Rider ID
    sr_id = generate_next_rider_id(db)

    # 3. Create Rider profile
    rider = Rider(
        user_id=user.id,
        rider_id=sr_id,
        full_name=reg.full_name,
        mobile_number=reg.mobile_number,
        email=reg.email,
        dob=reg.dob,
        current_company=reg.current_company or "Independent",
        current_role=reg.current_role or "Rider",
        experience_years=reg.experience_years or 0,
        experience_months=reg.experience_months or 0,
        vehicle_type=reg.vehicle_type or "Bike",
        vehicle_number=reg.vehicle_number,
        vehicle_category=reg.vehicle_category,
        primary_city=reg.primary_city or "Gurugram",
        primary_area=reg.primary_area,
        additional_locations=reg.additional_locations,
        preferred_radius=reg.preferred_radius or "10 km",
        upi_id=reg.upi_id,
        gpay_number=reg.gpay_number or reg.mobile_number,
        bank_account_number=reg.bank_account_number,
        ifsc_code=reg.ifsc_code,
        status=RiderStatus.PENDING,
    )
    db.add(rider)
    db.flush()

    if reg.selfie:  # Required unless settings.REQUIRE_DRIVER_SELFIE is off (testing)
        store_selfie(db, rider, reg.selfie)

    if referrer:
        referral_service.link_referral(db, referrer, rider)

    # 4. Attach documents if provided
    if reg.documents:
        for doc in reg.documents:
            rider_doc = RiderDocument(
                rider_id=rider.id,
                doc_type=doc.doc_type,
                file_name=doc.file_name,
                file_url=doc.file_url,
                status="PENDING",
            )
            db.add(rider_doc)

    commit_with_selfie(db, rider)
    db.refresh(rider)

    # 5. Send Admin notification
    reg_date_str = datetime.utcnow().strftime("%d %b %Y, %I:%M %p")
    admin_msg = (
        f"New Rider Registration\n\n"
        f"Rider: {rider.full_name} ({rider.rider_id})\n"
        f"Company: {rider.current_company}\n"
        f"Location: {rider.primary_city}\n"
        f"Registered: {reg_date_str}\n"
        f"Status: Pending Approval"
    )
    send_notification(
        db=db,
        title=f"New Rider: {rider.full_name}",
        message=admin_msg,
        is_admin=True,
        category="REGISTRATION",
        reference_id=rider.rider_id,
    )

    # 6. Send Rider welcome notification
    send_notification(
        db=db,
        user_id=user.id,
        title="Welcome to FlexRiders",
        message="Your registration has been submitted successfully. Our team will review your application.",
        category="REGISTRATION",
        reference_id=rider.rider_id,
    )

    return rider


def get_rider_current_brand(rider: Rider) -> Optional[dict]:
    """Helper to get current active brand assignment for a rider"""
    for assignment in rider.brand_assignments:
        if assignment.is_current and assignment.brand:
            return {
                "id": assignment.brand.id,
                "name": assignment.brand.name,
                "logo": assignment.brand.logo,
            }
    return None
