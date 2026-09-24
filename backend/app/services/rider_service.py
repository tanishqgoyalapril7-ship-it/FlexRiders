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


def register_new_rider(db: Session, reg: RiderRegistrationRequest) -> Rider:
    """Registers a new rider in PENDING status and sends admin notification"""
    # 1. Create or get user
    user = db.query(User).filter(User.phone == reg.mobile_number).first()
    if not user:
        user = User(
            phone=reg.mobile_number,
            email=reg.email,
            hashed_password=get_password_hash(reg.password or "Rider@123"),
            role=UserRole.RIDER,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        # Check if already has rider profile
        existing_rider = db.query(Rider).filter(Rider.user_id == user.id).first()
        if existing_rider:
            return existing_rider

    # 2. Generate unique Rider ID
    sr_id = generate_next_rider_id(db)

    # 3. Create Rider profile
    rider = Rider(
        user_id=user.id,
        rider_id=sr_id,
        full_name=reg.full_name,
        mobile_number=reg.mobile_number,
        email=reg.email,
        profile_photo=reg.profile_photo or f"https://api.dicebear.com/7.x/avataaars/svg?seed={sr_id}",
        dob=reg.dob,
        current_company=reg.current_company or "Independent",
        current_role=reg.current_role or "Rider",
        experience_years=reg.experience_years or 0,
        experience_months=reg.experience_months or 0,
        vehicle_type=reg.vehicle_type or "Bike",
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

    db.commit()
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
        title="Welcome to Super Riders",
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
