"""Refer & Earn.

- Every rider has a unique referral code.
- A new rider may enter a code at registration; that links them to the referrer (once, permanently).
- When the referred rider's first campaign day becomes COMPLETED (Morning + Evening + Night photos all
  approved), the referrer is credited REFERRAL_REWARD_AMOUNT as a real payment in the payments ledger
  (category REFERRAL_REWARD, status PENDING until an admin pays it out). Only once per referred rider.
"""
import secrets
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.all_models import (
    Payment,
    PaymentCategory,
    PaymentStatus,
    ReferralStatus,
    Rider,
    RiderReferral,
)
from app.services.notification_service import send_notification

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # No 0/O or 1/I lookalikes


class ReferralError(ValueError):
    pass


def ensure_code(db: Session, rider: Rider) -> str:
    """The rider's referral code, created on first use (e.g. SRK7M2QX)."""
    if rider.referral_code:
        return rider.referral_code
    while True:
        code = "SR" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.query(Rider.id).filter(Rider.referral_code == code).first():
            break
    rider.referral_code = code
    db.commit()
    return code


def find_referrer(db: Session, code: Optional[str]) -> Optional[Rider]:
    """Validates a code entered at registration. Raises ReferralError for an unknown code."""
    code = (code or "").strip().upper()
    if not code:
        return None
    referrer = db.query(Rider).filter(Rider.referral_code == code).first()
    if not referrer or referrer.archived_at:
        raise ReferralError("That referral code isn't valid. Check it with your friend, or leave it blank.")
    return referrer


def link_referral(db: Session, referrer: Rider, referred: Rider) -> RiderReferral:
    if referrer.id == referred.id:
        raise ReferralError("You can't use your own referral code.")
    referred.referred_by_rider_id = referrer.id
    referral = RiderReferral(referrer_rider_id=referrer.id, referred_rider_id=referred.id, code_used=referrer.referral_code)
    db.add(referral)
    db.flush()
    return referral


def on_photo_day_completed(db: Session, rider_id: int, activity_id: int) -> Optional[Payment]:
    """Called when one of the rider's campaign days becomes COMPLETED. Credits the referrer once."""
    referral = (
        db.query(RiderReferral)
        .filter(RiderReferral.referred_rider_id == rider_id, RiderReferral.status == ReferralStatus.JOINED)
        .with_for_update()
        .first()
    )
    if not referral:
        return None  # Not referred, or already rewarded
    referrer, referred = referral.referrer, referral.referred
    amount = settings.REFERRAL_REWARD_AMOUNT
    payment = Payment(
        rider_id=referrer.id,
        amount=amount,
        payment_type="UPI",
        upi_id=referrer.upi_id,
        category=PaymentCategory.REFERRAL_REWARD,
        payment_reference=f"REF-{referrer.rider_id}-{referred.rider_id}",
        status=PaymentStatus.PENDING,
        notes=f"Referral reward: {referred.full_name} ({referred.rider_id}) completed their first Photo Streak",
    )
    db.add(payment)
    db.flush()
    referral.status = ReferralStatus.REWARDED
    referral.reward_amount = amount
    referral.reward_payment_id = payment.id
    referral.qualifying_activity_id = activity_id
    referral.rewarded_at = datetime.utcnow()
    db.commit()

    if referrer.user_id:
        send_notification(
            db=db,
            user_id=referrer.user_id,
            title=f"You earned ₹{amount:,.0f} 🎉",
            message=f"{referred.full_name.split(' ')[0]} completed their first Photo Streak. ₹{amount:,.0f} has been added to your earnings.",
            category="PAYMENT",
            reference_id=str(payment.id),
        )
    send_notification(
        db=db,
        title="Referral reward due",
        message=f"₹{amount:,.0f} referral reward for {referrer.full_name} ({referrer.rider_id}): {referred.full_name} completed their first Photo Streak.",
        is_admin=True,
        category="PAYMENT",
        reference_id=str(payment.id),
    )
    return payment


def summary(db: Session, rider: Rider) -> Dict:
    """What the rider's Refer & Earn screen shows."""
    code = ensure_code(db, rider)
    referrals = (
        db.query(RiderReferral).filter(RiderReferral.referrer_rider_id == rider.id).order_by(RiderReferral.id.desc()).all()
    )
    rewarded = [r for r in referrals if r.status == ReferralStatus.REWARDED]
    amount = settings.REFERRAL_REWARD_AMOUNT
    link = f"{settings.REFERRAL_LINK_BASE}{code}"
    return {
        "code": code,
        "link": link,
        "reward_amount": amount,
        "share_message": (
            f"Join me on FlexRiders and earn with brand campaigns! Use my referral code {code} when you register: {link}"
        ),
        "successful_referrals": len(rewarded),
        "total_earnings": round(sum(r.reward_amount or 0 for r in rewarded), 2),
        "history": [
            {
                "id": r.id,
                # First name only: riders see who joined, not their details.
                "name": (r.referred.full_name or "Rider").split(" ")[0] if r.referred else "Rider",
                "joined_at": r.created_at,
                "status": r.status,
                "reward": r.reward_amount,
                "rewarded_at": r.rewarded_at,
                "reward_paid": bool(r.reward_payment and r.reward_payment.status == PaymentStatus.PAID),
            }
            for r in referrals
        ],
    }
