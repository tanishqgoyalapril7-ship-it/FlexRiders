from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.database import get_db
from app.models.all_models import Payment, Rider, Brand, User, PaymentStatus
from app.schemas.all_schemas import PaymentCreate, PaymentUpdate, PaymentResponse
from app.api.deps import get_current_admin
from app.services.payment_service import create_payment, process_payment_transaction
from typing import List, Optional

router = APIRouter()


@router.get("", response_model=List[PaymentResponse])
def get_all_payments(
    status_filter: Optional[str] = None,
    brand_id: Optional[int] = None,
    rider_id: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin endpoint to list and filter all payment records"""
    query = db.query(Payment)

    if status_filter and status_filter != "ALL":
        query = query.filter(Payment.status == status_filter)

    if brand_id:
        query = query.filter(Payment.brand_id == brand_id)

    if rider_id:
        query = query.filter(Payment.rider_id == rider_id)

    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.join(Rider).filter(
            (Rider.full_name.ilike(search_fmt))
            | (Rider.rider_id.ilike(search_fmt))
            | (Payment.transaction_id.ilike(search_fmt))
            | (Payment.upi_id.ilike(search_fmt))
        )

    payments = query.order_by(desc(Payment.payment_date)).offset(skip).limit(limit).all()

    return [
        PaymentResponse(
            id=p.id,
            rider_id=p.rider_id,
            rider_name=p.rider.full_name if p.rider else "Unknown",
            rider_sr_id=p.rider.rider_id if p.rider else "SR-000000",
            brand_id=p.brand_id,
            brand_name=p.brand.name if p.brand else "Super Riders",
            amount=p.amount,
            payment_date=p.payment_date,
            payment_period=p.payment_period,
            payment_type=p.payment_type,
            upi_id=p.upi_id,
            payment_reference=p.payment_reference,
            transaction_id=p.transaction_id,
            status=p.status,
            notes=p.notes,
        )
        for p in payments
    ]


@router.post("", response_model=PaymentResponse)
def create_new_payment(
    p_in: PaymentCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin creates a new payment record"""
    try:
        payment = create_payment(
            db=db,
            rider_id=p_in.rider_id,
            amount=p_in.amount,
            admin_user=admin,
            brand_id=p_in.brand_id,
            payment_period=p_in.payment_period or "September 2026",
            payment_type=p_in.payment_type or "UPI",
            upi_id=p_in.upi_id,
            notes=p_in.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return PaymentResponse(
        id=payment.id,
        rider_id=payment.rider_id,
        rider_name=payment.rider.full_name if payment.rider else "Unknown",
        rider_sr_id=payment.rider.rider_id if payment.rider else "SR-000000",
        brand_id=payment.brand_id,
        brand_name=payment.brand.name if payment.brand else "Super Riders",
        amount=payment.amount,
        payment_date=payment.payment_date,
        payment_period=payment.payment_period,
        payment_type=payment.payment_type,
        upi_id=payment.upi_id,
        payment_reference=payment.payment_reference,
        transaction_id=payment.transaction_id,
        status=payment.status,
        notes=payment.notes,
    )


@router.post("/{id}/process", response_model=PaymentResponse)
def process_payment(
    id: int,
    action: str = Query("PAID", pattern="^(PAID|FAILED)$"),
    failure_reason: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin executes/settles payment via payment provider mock or webhook"""
    try:
        payment = process_payment_transaction(
            db=db,
            payment_id=id,
            admin_user=admin,
            mark_as=action,
            failure_reason=failure_reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return PaymentResponse(
        id=payment.id,
        rider_id=payment.rider_id,
        rider_name=payment.rider.full_name if payment.rider else "Unknown",
        rider_sr_id=payment.rider.rider_id if payment.rider else "SR-000000",
        brand_id=payment.brand_id,
        brand_name=payment.brand.name if payment.brand else "Super Riders",
        amount=payment.amount,
        payment_date=payment.payment_date,
        payment_period=payment.payment_period,
        payment_type=payment.payment_type,
        upi_id=payment.upi_id,
        payment_reference=payment.payment_reference,
        transaction_id=payment.transaction_id,
        status=payment.status,
        notes=payment.notes,
    )
