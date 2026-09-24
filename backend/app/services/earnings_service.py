"""The single source of truth for a rider's earnings, used by every screen (rider app and admin).

  earned  = campaign earnings (approved, completed photo-days × daily rate, from CampaignPayout)
          + manual payments not tied to a campaign (paid or pending)
  paid    = campaign payout paid amounts + manual payments marked paid
  pending = what is earned but not yet paid (never negative per campaign)

Campaign payout payments in the payments ledger (Payment.campaign_id set, no category) are *not* added
again: they are the same money as CampaignPayout.paid_amount. Categorised credits (referral reward,
T-shirt return incentive) count like manual payments even when they carry a campaign_id.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.all_models import Payment, PaymentCategory, PaymentStatus
from app.models.campaign_models import CampaignDailyActivity, CampaignPayout
from app.services.fulfillment_service import to_ist_date, today_ist

COUNTED_PAYMENT_STATUSES = (PaymentStatus.PAID, PaymentStatus.PENDING)
# Ledger entries that are not campaign payouts (those live in CampaignPayout).
NOT_A_CAMPAIGN_PAYOUT = or_(Payment.campaign_id.is_(None), Payment.category.isnot(None))


def rider_earnings(db: Session, rider_id: int, today: Optional[date] = None) -> Dict:
    today = today or today_ist()
    payouts = db.query(CampaignPayout).filter(CampaignPayout.rider_id == rider_id).order_by(CampaignPayout.id.desc()).all()
    manual = (
        db.query(Payment)
        .filter(Payment.rider_id == rider_id, NOT_A_CAMPAIGN_PAYOUT, Payment.status.in_(COUNTED_PAYMENT_STATUSES))
        .all()
    )

    campaigns: List[Dict] = []
    for p in payouts:
        a = p.assignment
        campaigns.append(
            {
                "campaign_id": p.campaign_id,
                "campaign_name": a.campaign.name if a and a.campaign else "",
                "assignment_status": a.status if a else None,
                "approved_days": p.eligible_days,
                "daily_rate": p.daily_rate,
                "earned": round(p.total_amount, 2),
                "paid": round(p.paid_amount, 2),
                "pending": round(max(p.total_amount - p.paid_amount, 0), 2),
                "payout_status": p.status,
            }
        )

    # Earnings by date: each paid-out photo-day on its activity date, manual payments on their payment date.
    by_date: Dict[date, float] = {}
    activities = (
        db.query(CampaignDailyActivity.activity_date, CampaignDailyActivity.earned_amount)
        .filter(CampaignDailyActivity.rider_id == rider_id, CampaignDailyActivity.earned_amount > 0)
        .all()
    )
    for day, amount in activities:
        by_date[day] = by_date.get(day, 0.0) + amount
    for m in manual:
        day = to_ist_date(m.payment_date) or today
        by_date[day] = by_date.get(day, 0.0) + m.amount

    def between(start: date, end: Optional[date] = None) -> float:
        return round(sum(v for d, v in by_date.items() if d >= start and (end is None or d < end)), 2)

    month_start = today.replace(day=1)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    week_start = today - timedelta(days=6)

    campaign_earned = sum(c["earned"] for c in campaigns)
    campaign_paid = sum(c["paid"] for c in campaigns)
    campaign_pending = sum(c["pending"] for c in campaigns)
    manual_paid = sum(m.amount for m in manual if m.status == PaymentStatus.PAID)
    manual_pending = sum(m.amount for m in manual if m.status == PaymentStatus.PENDING)

    return {
        "total_earnings": round(campaign_earned + manual_paid + manual_pending, 2),
        "paid_earnings": round(campaign_paid + manual_paid, 2),
        "pending_earnings": round(campaign_pending + manual_pending, 2),
        "today_earnings": between(today, today + timedelta(days=1)),
        "week_earnings": between(week_start),
        "month_earnings": between(month_start),
        "last_month_earnings": between(last_month_start, month_start),
        "last_seven_days": [
            {"date": (week_start + timedelta(days=i)).isoformat(), "amount": between(week_start + timedelta(days=i), week_start + timedelta(days=i + 1))}
            for i in range(7)
        ],
        "campaigns": campaigns,
        "other_payments": {"paid": round(manual_paid, 2), "pending": round(manual_pending, 2)},
        "referral_earnings": round(sum(m.amount for m in manual if m.category == PaymentCategory.REFERRAL_REWARD), 2),
        "tshirt_return_earnings": round(sum(m.amount for m in manual if m.category == PaymentCategory.TSHIRT_RETURN_INCENTIVE), 2),
    }
