from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from app.core.database import get_db
from app.models.all_models import Rider, RiderDocument, RiderBrandAssignment, User, RiderStatus
from app.schemas.all_schemas import (
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
from typing import List, Optional

router = APIRouter()


@router.get("", response_model=List[RiderResponse])
def get_all_riders(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    brand_id: Optional[int] = None,
    city: Optional[str] = None,
    company: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin search and filter riders"""
    query = db.query(Rider)

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
            )
        )

    if status_filter and status_filter != "ALL":
        query = query.filter(Rider.status == status_filter)

    if city and city != "ALL":
        query = query.filter(Rider.primary_city.ilike(f"%{city}%"))

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
            message=f"Your Super Riders account has been suspended: {rider.suspension_reason}. Contact support for details.",
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
