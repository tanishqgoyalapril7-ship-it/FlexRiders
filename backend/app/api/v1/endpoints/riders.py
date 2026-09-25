from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.all_models import Rider, RiderDocument, RiderBrandAssignment, Payment, PaymentStatus, Notification
from app.schemas.all_schemas import (
    RiderDetailResponse,
    RiderProfileUpdateRequest,
    PaymentMonthlySummary,
    PaymentResponse,
    DocumentResponse,
    NotificationResponse,
)
from app.api.deps import get_current_rider
from app.core.security import verify_password
from app.schemas.all_schemas import AccountDeleteRequest
from app.services import data_admin_service as das
from app.services import campaign_service as svc
from datetime import datetime
from app.services.payment_service import calculate_rider_earnings
from typing import List, Optional
from sqlalchemy import desc

router = APIRouter()


@router.get("/me", response_model=RiderDetailResponse)
def get_rider_dashboard(
    rider: Rider = Depends(get_current_rider),
    db: Session = Depends(get_db),
):
    """Returns all data needed for Rider App Home & Profile screens"""
    # Current Brand
    current_brand_name = None
    current_brand_id = None
    for a in rider.brand_assignments:
        if a.is_current and a.brand:
            current_brand_name = a.brand.name
            current_brand_id = a.brand.id
            break

    earnings = calculate_rider_earnings(db, rider.id)

    # Documents
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

    # Brand assignments history
    history = []
    for a in rider.brand_assignments:
        history.append({
            "id": a.id,
            "rider_id": rider.id,
            "brand_id": a.brand_id,
            "brand_name": a.brand.name if a.brand else "Unknown",
            "assignment_date": a.assignment_date,
            "removal_date": a.removal_date,
            "is_current": a.is_current,
            "notes": a.notes,
            "assigned_by_name": a.assigned_by.email if a.assigned_by else "Admin",
        })

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
        current_brand=current_brand_name,
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


@router.patch("/me", response_model=RiderDetailResponse)
def update_rider_profile(
    update_data: RiderProfileUpdateRequest,
    rider: Rider = Depends(get_current_rider),
    db: Session = Depends(get_db),
):
    """Rider edits their own non-verified details. An empty value removes an optional field.
    Verified fields (name, mobile, vehicle number) can only be changed by an admin; the vehicle
    category (which decides campaign eligibility) can be set once, then only by an admin."""
    changes = update_data.model_dump(exclude_unset=True)
    category = changes.pop("vehicle_category", None)
    if category:
        if rider.vehicle_category and rider.vehicle_category != category:
            raise HTTPException(status_code=400, detail="Your vehicle type is already set. Contact support to change it.")
        from app.schemas.all_schemas import vehicle_number_problem

        if vehicle_number_problem(category, rider.vehicle_number):
            # Riders can't enter a registration number themselves (it's verified by operations).
            raise HTTPException(
                status_code=400,
                detail="This vehicle type needs your registration number on file. Ask your operations manager to add it, then choose your vehicle type.",
            )
        rider.vehicle_category = category
    for field, value in changes.items():
        if value is None:
            continue
        setattr(rider, field, value.strip() or None if isinstance(value, str) else value)

    db.commit()
    db.refresh(rider)
    return get_rider_dashboard(rider, db)


@router.get("/me/payments", response_model=PaymentMonthlySummary)
def get_rider_payment_history(
    month: Optional[str] = None,
    brand_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    rider: Rider = Depends(get_current_rider),
    db: Session = Depends(get_db),
):
    """Returns payment history list and monthly aggregations for the rider app"""
    query = db.query(Payment).filter(Payment.rider_id == rider.id)
    if brand_id:
        query = query.filter(Payment.brand_id == brand_id)
    if status_filter:
        query = query.filter(Payment.status == status_filter)

    payments = query.order_by(Payment.payment_date.desc()).all()
    earnings = calculate_rider_earnings(db, rider.id)

    response_items = [
        PaymentResponse(
            id=p.id,
            rider_id=p.rider_id,
            rider_name=rider.full_name,
            rider_sr_id=rider.rider_id,
            brand_id=p.brand_id,
            brand_name=p.brand.name if p.brand else "FlexRiders",
            amount=p.amount,
            payment_date=p.payment_date,
            payment_period=p.payment_period,
            payment_type=p.payment_type,
            upi_id=p.upi_id,
            payment_reference=p.payment_reference,
            transaction_id=p.transaction_id,
            status=p.status,
            notes=p.notes,
            category=p.category,
        )
        for p in payments
    ]

    return PaymentMonthlySummary(
        month_name=month or datetime.utcnow().strftime("%B %Y"),
        total_earnings=earnings["total_earnings"],
        paid_amount=earnings["paid_earnings"],
        pending_amount=earnings["pending_earnings"],
        today_earnings=earnings["today_earnings"],
        payments=response_items,
    )


@router.delete("/me")
def delete_my_account(
    data: AccountDeleteRequest,
    rider: Rider = Depends(get_current_rider),
    db: Session = Depends(get_db),
):
    """Rider deletes their account. With no history it is removed completely; otherwise it is
    deactivated (archived) so payouts, payments and campaign records stay intact for the business."""
    user = rider.user
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect password")
    if svc.current_assignment(db, rider.id):
        raise HTTPException(
            status_code=400,
            detail="You're part of an active campaign. Finish it or ask your operations manager to remove you before deleting your account.",
        )
    reason = (data.reason or "").strip() or "Deleted by rider from the app"
    impact = das.rider_impact(db, rider)
    if impact["can_hard_delete"]:
        das.hard_delete_rider(db, rider, None, reason)
        return {"success": True, "deleted": True, "message": "Your account and details have been deleted."}
    das.archive_rider(db, rider, None, f"Rider requested account deletion: {reason}")
    return {
        "success": True,
        "deleted": False,
        "message": "Your account has been deactivated. Payment and campaign records are kept as required for payouts.",
    }


@router.get("/me/earnings")
def get_my_earnings(rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    """Earnings summary for the rider app: totals, today/week/month, last 7 days and per campaign.
    Same calculation as the admin dashboard and the campaign screens."""
    from app.services.earnings_service import rider_earnings

    return rider_earnings(db, rider.id)


@router.get("/me/referrals")
def get_my_referrals(rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    """Refer & Earn: the rider's code and link, successful referrals, reward earnings and history."""
    from app.services import referral_service

    return referral_service.summary(db, rider)
