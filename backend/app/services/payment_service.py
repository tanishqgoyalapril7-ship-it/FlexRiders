from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.all_models import Payment, Rider, Brand, User, PaymentStatus
from app.services.notification_service import send_notification
from app.services.audit_service import log_admin_action
from datetime import datetime, date
import random
import string
from typing import Optional, Dict, Any


def generate_transaction_id() -> str:
    """Generates unique transaction ID like TXN9823487192"""
    digits = "".join(random.choices(string.digits, k=9))
    return f"TXN{digits}"


def create_payment(
    db: Session,
    rider_id: int,
    amount: float,
    admin_user: User,
    brand_id: Optional[int] = None,
    payment_period: Optional[str] = None,
    payment_type: str = "UPI",
    upi_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> Payment:
    rider = db.query(Rider).filter(Rider.id == rider_id).first()
    if not rider:
        raise ValueError("Rider not found")

    # If brand not specified, pick rider's current brand
    if not brand_id and rider.brand_assignments:
        current_assign = next((a for a in rider.brand_assignments if a.is_current), None)
        if current_assign:
            brand_id = current_assign.brand_id

    payment = Payment(
        rider_id=rider.id,
        brand_id=brand_id,
        amount=amount,
        payment_date=datetime.utcnow(),
        payment_period=payment_period or datetime.utcnow().strftime("%B %Y"),
        payment_type=payment_type,
        upi_id=upi_id or rider.upi_id,
        payment_reference=f"REF-{rider.rider_id}-{int(datetime.utcnow().timestamp())}",
        status=PaymentStatus.PENDING,
        notes=notes,
        created_by_id=admin_user.id if admin_user else None,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    # Log audit
    log_admin_action(
        db=db,
        admin_user=admin_user,
        action="PAYMENT_CREATED",
        target_type="PAYMENT",
        target_id=str(payment.id),
        details=f"Payment of ₹{amount:,.2f} created for {rider.full_name} ({rider.rider_id})",
    )

    # Notify rider that payment was initiated
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Payment Initiated",
            message=f"Payment of ₹{amount:,.0f} has been created and is pending processing.",
            category="PAYMENT",
            reference_id=str(payment.id),
        )

    return payment


def process_payment_transaction(
    db: Session,
    payment_id: int,
    admin_user: User,
    mark_as: str = "PAID",  # PAID, FAILED, PROCESSING
    failure_reason: Optional[str] = None,
) -> Payment:
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise ValueError("Payment not found")
    if payment.status in (PaymentStatus.PAID, PaymentStatus.CANCELLED):
        raise ValueError(f"This payment is already {payment.status.lower()}.")

    rider = payment.rider
    if mark_as == "PAID":
        payment.status = PaymentStatus.PAID
        payment.transaction_id = payment.transaction_id or generate_transaction_id()
        payment.failure_reason = None
        db.commit()
        db.refresh(payment)

        # Notify rider
        if rider and rider.user_id:
            brand_name = payment.brand.name if payment.brand else "FlexRiders"
            send_notification(
                db=db,
                user_id=rider.user_id,
                title="Payment Received",
                message=f"₹{payment.amount:,.0f} credited to your UPI account ({payment.upi_id}) for {brand_name}. Txn ID: {payment.transaction_id}",
                category="PAYMENT",
                reference_id=payment.transaction_id,
            )

        # Audit log
        log_admin_action(
            db=db,
            admin_user=admin_user,
            action="PAYMENT_PROCESSED_SUCCESS",
            target_type="PAYMENT",
            target_id=str(payment.id),
            details=f"Payment of ₹{payment.amount} marked PAID. Txn: {payment.transaction_id}",
        )

    elif mark_as == "FAILED":
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = failure_reason or "Bank server timeout / UPI ID invalid"
        db.commit()
        db.refresh(payment)

        # Notify rider
        if rider and rider.user_id:
            send_notification(
                db=db,
                user_id=rider.user_id,
                title="Payment Failed",
                message=f"Payment of ₹{payment.amount:,.0f} failed. Reason: {payment.failure_reason}. Please verify your UPI ID.",
                category="PAYMENT",
                reference_id=str(payment.id),
            )

        # Audit log
        log_admin_action(
            db=db,
            admin_user=admin_user,
            action="PAYMENT_FAILED",
            target_type="PAYMENT",
            target_id=str(payment.id),
            details=f"Payment of ₹{payment.amount} marked FAILED. Reason: {payment.failure_reason}",
        )

    return payment


def calculate_rider_earnings(db: Session, rider_id: int) -> Dict[str, Any]:
    """Total, paid, pending and today's earnings, from the single earnings calculation."""
    from app.services.earnings_service import rider_earnings  # Local import avoids a circular import

    e = rider_earnings(db, rider_id)
    return {k: e[k] for k in ("total_earnings", "paid_earnings", "pending_earnings", "today_earnings")}
