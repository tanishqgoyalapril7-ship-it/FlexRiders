"""Campaign fulfilment: what the brand purchased, what riders delivered, and how to recover a shortfall.

Four figures are kept strictly separate and never derived from one another:

1. PURCHASED  contracted rider-days (C) = required riders (R) × contract days (D), fixed at publish
2. DELIVERED  completed rider-days (Photo Streak days: Morning, Evening and Night photos all approved on one
              date) on eligible dates (contract period + approved extensions)
3. EARNED     payable approved days × each rider's daily rate
4. BRAND PAID contract value adjusted only by explicit payment / refund / credit records

Everything here is computed live from the stored activity rows, so it can never go stale.
Every function takes `today` so results are deterministic and testable.
"""
import json
import math
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.campaign_models import (
    ActivityChangeLog,
    ActivityStatus,
    AdjustmentStatus,
    AssignmentStatus,
    BrandPaymentKind,
    BrandPaymentRecord,
    BrandPaymentRecordStatus,
    Campaign,
    CampaignAssignment,
    CampaignDailyActivity,
    CampaignFulfillmentSnapshot,
    CampaignPayout,
    CampaignStatus,
    FinancialAdjustment,
    PayoutStatus,
    PhotoSlot,
    PhotoStatus,
)

IST_OFFSET = timedelta(hours=5, minutes=30)


def today_ist() -> date:
    """Campaign days follow Indian Standard Time."""
    return (datetime.utcnow() + IST_OFFSET).date()


def to_ist_date(value: Optional[datetime]) -> Optional[date]:
    return (value + IST_OFFSET).date() if value else None


def days_between(start: date, end: date) -> int:
    """Inclusive number of days from start to end (0 if end is before start)."""
    return max((end - start).days + 1, 0)


# ---------------------------------------------------------------------------
# 1. The commitment
# ---------------------------------------------------------------------------

def contract_days(campaign: Campaign) -> int:
    return days_between(campaign.start_date, campaign.end_date)


def contracted_rider_days(campaign: Campaign) -> int:
    """C: stored at publish; drafts show what C would be."""
    if campaign.contracted_rider_days:
        return campaign.contracted_rider_days
    return campaign.total_slots * contract_days(campaign)


def effective_end_date(campaign: Campaign) -> date:
    """Last date on which a rider-day can count: the contract end, or the latest approved extension."""
    ends = [campaign.end_date] + [e.end_date for e in campaign.extensions]
    return max(ends)


def is_eligible_date(campaign: Campaign, day: date) -> bool:
    if campaign.start_date <= day <= campaign.end_date:
        return True
    return any(e.start_date <= day <= e.end_date for e in campaign.extensions)


def period_of(campaign: Campaign, day: date) -> str:
    return "ORIGINAL" if day <= campaign.end_date else "EXTENSION"


# ---------------------------------------------------------------------------
# 2. Delivered rider-days and contract/surplus allocation
# ---------------------------------------------------------------------------

def _counted_approved_days(db: Session, campaign: Campaign) -> List[CampaignDailyActivity]:
    """Approved rider-days on eligible dates, one per rider per date."""
    approved = (
        db.query(CampaignDailyActivity)
        .filter(
            CampaignDailyActivity.campaign_id == campaign.id,
            CampaignDailyActivity.photo_status == PhotoStatus.APPROVED,
        )
        .order_by(CampaignDailyActivity.id)
        .all()
    )
    seen, result = set(), []
    for a in approved:
        key = (a.rider_id, a.activity_date)
        if key in seen or not is_eligible_date(campaign, a.activity_date):
            continue
        seen.add(key)
        result.append(a)
    return result


def allocate_contract_days(campaign: Campaign, counted: List[CampaignDailyActivity]) -> set:
    """IDs of the rider-days that satisfy the contract; the rest are surplus.

    Date order: the earliest C rider-days satisfy the contract. Days already covered by a paid
    payout are kept in the contract first, so a later correction can never silently move a
    paid day into surplus (such changes go through ActivityChangeLog / FinancialAdjustment).
    """
    ordered = sorted(
        counted,
        key=lambda a: (not bool(a.payout_locked), a.activity_date, a.approved_at or datetime.max, a.id),
    )
    return {a.id for a in ordered[: contracted_rider_days(campaign)]}


def recalculate_campaign_payouts(db: Session, campaign: Campaign) -> None:
    """Re-derives every rider-day's earning and every rider's payout for the campaign.

    A day is payable if it is approved, eligible, not a duplicate, and either satisfies the
    contract or the campaign allows payout beyond the contract. earned = payable days × rate.
    """
    counted = _counted_approved_days(db, campaign)
    counted_ids = {a.id for a in counted}
    contract_ids = allocate_contract_days(campaign, counted)
    allow_beyond = bool(campaign.allow_payout_beyond_contract)

    activities = db.query(CampaignDailyActivity).filter(CampaignDailyActivity.campaign_id == campaign.id).all()
    for a in activities:
        payable = a.id in counted_ids and (a.id in contract_ids or allow_beyond)
        new_earned = a.assignment.daily_rate if payable else 0.0
        if round(a.earned_amount or 0, 2) != round(new_earned, 2):
            db.add(
                ActivityChangeLog(
                    campaign_id=campaign.id,
                    activity_id=a.id,
                    rider_id=a.rider_id,
                    activity_date=a.activity_date,
                    old_status=a.status,
                    new_status=a.status,
                    old_earned=a.earned_amount,
                    new_earned=new_earned,
                    reason="Automatic recalculation (contract/surplus allocation or rate)",
                )
            )
            a.earned_amount = new_earned

    assignments = db.query(CampaignAssignment).filter(CampaignAssignment.campaign_id == campaign.id).all()
    for assignment in assignments:
        payout = assignment.payout
        if not payout:
            continue
        payable_days = [a for a in activities if a.assignment_id == assignment.id and a.earned_amount > 0]
        payout.eligible_days = len(payable_days)
        payout.daily_rate = assignment.daily_rate
        payout.total_amount = round(sum(a.earned_amount for a in payable_days), 2)
        if payout.status == PayoutStatus.PAID and payout.total_amount > payout.paid_amount:
            payout.status = PayoutStatus.PENDING  # New earnings after a payment
        _sync_overpayment(db, campaign, assignment, payout)
    db.commit()


def _sync_overpayment(db: Session, campaign: Campaign, assignment: CampaignAssignment, payout: CampaignPayout) -> None:
    """If a correction leaves a rider paid more than earned, record it. Never deducts money."""
    overpaid = round(payout.paid_amount - payout.total_amount, 2)
    open_adjustment = (
        db.query(FinancialAdjustment)
        .filter(FinancialAdjustment.assignment_id == assignment.id, FinancialAdjustment.status == AdjustmentStatus.OPEN)
        .first()
    )
    if overpaid > 0:
        if open_adjustment:
            open_adjustment.amount = overpaid
        else:
            db.add(
                FinancialAdjustment(
                    campaign_id=campaign.id,
                    rider_id=assignment.rider_id,
                    assignment_id=assignment.id,
                    amount=overpaid,
                    note="Rider was paid for days that no longer qualify after a correction.",
                )
            )
    elif open_adjustment:
        open_adjustment.status = AdjustmentStatus.WAIVED
        open_adjustment.resolved_at = datetime.utcnow()
        open_adjustment.note = (open_adjustment.note or "") + " Closed automatically: the correction was reversed."


# ---------------------------------------------------------------------------
# 3. Recovery plan (pure formulas, shown step by step in the UI)
# ---------------------------------------------------------------------------

def data_quality(elapsed_days: int, possible_rider_days: int) -> str:
    if possible_rider_days <= 0:
        return "NO_DATA"
    if elapsed_days < settings.LOW_SAMPLE_MIN_DAYS or possible_rider_days < settings.LOW_SAMPLE_MIN_RIDER_DAYS:
        return "LOW_SAMPLE"
    return "NORMAL"


def recovery_plan(
    remaining_obligation: int,
    days_remaining: int,
    active_riders: int,
    attendance_rate: Optional[float],
    quality: str,
    riders_available: Optional[int] = None,
) -> Dict:
    """Projected capacity, projected shortfall, replacement riders and extension estimate.

    With no data or a low sample, 100% attendance is assumed and the result is marked preliminary.
    """
    preliminary = quality != "NORMAL"
    rate_used = 1.0 if preliminary or attendance_rate is None else attendance_rate
    projected_capacity = round(active_riders * days_remaining * rate_used, 1)
    projected_shortfall = round(max(remaining_obligation - projected_capacity, 0), 1)

    if days_remaining > 0:
        replacement_riders = math.ceil(projected_shortfall / days_remaining) if projected_shortfall > 0 else 0
        extension_basis = projected_shortfall
    else:
        replacement_riders = None  # Contract period over: recover through an extension instead
        extension_basis = remaining_obligation

    available = active_riders if riders_available is None else riders_available
    if extension_basis <= 0:
        extension_days = 0
    elif available > 0 and rate_used > 0:
        extension_days = math.ceil(extension_basis / (available * rate_used))
    else:
        extension_days = None  # Cannot estimate without riders

    return {
        "remaining_obligation": remaining_obligation,
        "days_remaining": days_remaining,
        "active_riders": active_riders,
        "attendance_rate": attendance_rate,
        "attendance_rate_used": rate_used,
        "data_quality": quality,
        "preliminary": preliminary,
        "projected_capacity": projected_capacity,
        "maximum_capacity": active_riders * days_remaining,
        "projected_shortfall": projected_shortfall,
        "replacement_riders_needed": replacement_riders,
        "riders_available_for_extension": available,
        "extension_basis": extension_basis,
        "estimated_extension_days": extension_days,
    }


# ---------------------------------------------------------------------------
# 4. Per-rider performance (separate from the campaign target)
# ---------------------------------------------------------------------------

def rider_window(campaign: Campaign, assignment: CampaignAssignment) -> (date, date):
    """The dates this rider was expected to work: from joining to the campaign's (extended) end or their exit."""
    start = max(campaign.start_date, to_ist_date(assignment.assigned_at) or campaign.start_date)
    end = effective_end_date(campaign)
    ended = to_ist_date(assignment.ended_at)
    if ended:
        end = min(end, ended)
    return start, end


def rider_performance(campaign: Campaign, assignment: CampaignAssignment, today: date) -> Dict:
    start, end = rider_window(campaign, assignment)
    yesterday = today - timedelta(days=1)
    by_date = {a.activity_date: a for a in assignment.activities}
    target_days = days_between(start, end)

    elapsed, approved_so_far, excused, missed_streak = 0, 0, 0, 0
    day = start
    while day <= min(yesterday, end):
        if is_eligible_date(campaign, day):
            activity = by_date.get(day)
            status = activity.status if activity else "MISSED"
            if status == ActivityStatus.EXCUSED:
                excused += 1
                missed_streak = 0
            else:
                elapsed += 1
                if status == ActivityStatus.COMPLETED:
                    approved_so_far += 1
                    missed_streak = 0
                elif status == ActivityStatus.SUBMITTED:
                    missed_streak = 0
                else:
                    missed_streak += 1
        day += timedelta(days=1)

    current = assignment.status in AssignmentStatus.CURRENT
    behind = elapsed > 0 and approved_so_far < elapsed * settings.RIDER_BEHIND_PCT / 100
    return {
        "target_days": target_days,
        "elapsed_eligible_days": elapsed,
        "approved_days_so_far": approved_so_far,
        "excused_days": excused,
        "behind_target": behind,
        "inactive": current and missed_streak >= settings.INACTIVE_MISSED_DAYS,
        "consecutive_missed_days": missed_streak,
    }


# ---------------------------------------------------------------------------
# 5. Brand money (never derived from delivery)
# ---------------------------------------------------------------------------

def brand_financials(db: Session, campaign: Campaign, today: Optional[date] = None) -> Dict:
    """Brand → FlexRiders money for one campaign. Remaining = contract value − credits − (received − refunded).
    Cancelled records are kept for history but never counted. Rider payouts are separate (rider_financials)."""
    records = db.query(BrandPaymentRecord).filter(
        BrandPaymentRecord.campaign_id == campaign.id, BrandPaymentRecord.status != BrandPaymentRecordStatus.CANCELLED
    ).all()
    total = lambda kind: round(sum(r.amount for r in records if r.kind == kind), 2)
    received, refunded, credits = total(BrandPaymentKind.RECEIVED), total(BrandPaymentKind.REFUND), total(BrandPaymentKind.CREDIT)
    contract_value = round(campaign.brand_contract_value or 0.0, 2)
    net_received = round(received - refunded, 2)
    outstanding = round(max(contract_value - credits - net_received, 0), 2)
    due = campaign.brand_payment_due_date
    overdue = bool(due and outstanding > 0 and (today or today_ist()) > due)

    if campaign.status == CampaignStatus.CANCELLED:
        status = "CANCELLED"
    elif refunded > 0:
        status = "REFUNDED" if net_received <= 0 else "PARTIALLY_REFUNDED"
    elif overdue:
        status = "OVERDUE"
    elif credits > 0:
        status = "CREDIT_ISSUED"
    elif net_received <= 0:
        status = "PENDING"
    elif outstanding > 0:
        status = "PARTIALLY_PAID"
    else:
        status = "PAID"

    return {
        "contract_value": contract_value,
        "received": received,
        "refunded": refunded,
        "credits": credits,
        "net_received": net_received,
        "outstanding": outstanding,
        "due_date": due.isoformat() if due else None,
        "overdue": overdue,
        "payment_status": status,
    }


def rider_financials(db: Session, campaign: Campaign) -> Dict:
    payouts = db.query(CampaignPayout).filter(CampaignPayout.campaign_id == campaign.id).all()
    earned = round(sum(p.total_amount for p in payouts), 2)
    paid = round(sum(p.paid_amount for p in payouts), 2)
    overpaid = round(
        sum(
            a.amount
            for a in db.query(FinancialAdjustment).filter(
                FinancialAdjustment.campaign_id == campaign.id, FinancialAdjustment.status == AdjustmentStatus.OPEN
            )
        ),
        2,
    )
    return {
        "planned_budget": round(contracted_rider_days(campaign) * campaign.daily_rate, 2),
        "earned": earned,
        "paid": paid,
        "pending": round(sum(max(p.total_amount - p.paid_amount, 0) for p in payouts), 2),
        "overpaid_open": overpaid,
    }


# ---------------------------------------------------------------------------
# 6. The full fulfilment picture
# ---------------------------------------------------------------------------

def campaign_fulfillment(db: Session, campaign: Campaign, today: Optional[date] = None, riders_available: Optional[int] = None) -> Dict:
    today = today or today_ist()
    yesterday = today - timedelta(days=1)
    R = campaign.total_slots
    D = contract_days(campaign)
    C = contracted_rider_days(campaign)
    end = effective_end_date(campaign)

    counted = _counted_approved_days(db, campaign)
    contract_ids = allocate_contract_days(campaign, counted)
    delivered = len(counted)
    contract_delivered = min(delivered, C)
    surplus = max(delivered - C, 0)
    remaining = max(C - delivered, 0)
    fulfilled = delivered >= C

    # Expected vs actual, measured to yesterday (today's photos can still arrive).
    if yesterday < campaign.start_date:
        elapsed = 0
    else:
        elapsed = min(days_between(campaign.start_date, yesterday), D)
    expected = min(R * elapsed, C)
    if yesterday > campaign.end_date:
        expected = C  # Contract period over (including during an extension)
    actual_to_date = sum(1 for a in counted if a.activity_date <= yesterday)
    variance = actual_to_date - expected

    # Operational capacity.
    assignments = db.query(CampaignAssignment).filter(CampaignAssignment.campaign_id == campaign.id).all()
    current = [a for a in assignments if a.status in AssignmentStatus.CURRENT]
    if today < campaign.start_date:
        days_remaining = days_between(campaign.start_date, end)
    else:
        days_remaining = days_between(today, end)

    riders = {a.id: rider_performance(campaign, a, today) for a in assignments}
    possible = sum(r["elapsed_eligible_days"] for r in riders.values())
    approved_so_far = sum(r["approved_days_so_far"] for r in riders.values())
    attendance = round(approved_so_far / possible, 4) if possible > 0 else None
    quality = data_quality(elapsed, possible)
    plan = recovery_plan(remaining, days_remaining, len(current), attendance, quality, riders_available)

    # Delivery status: first matching rule wins.
    extension_running = any(e.start_date <= today <= e.end_date for e in campaign.extensions)
    ratio = (actual_to_date / expected * 100) if expected else None
    if campaign.status == CampaignStatus.DRAFT:
        delivery_status = "DRAFT"
    elif campaign.status == CampaignStatus.CANCELLED:
        delivery_status = "CANCELLED"
    elif fulfilled:
        delivery_status = "FULFILLED"
    elif campaign.status == CampaignStatus.COMPLETED:
        delivery_status = "COMPLETED_WITH_SHORTFALL"
    elif extension_running:
        delivery_status = "EXTENDED"
    elif today < campaign.start_date or expected == 0:
        delivery_status = "NOT_STARTED"
    elif ratio < settings.FULFILLMENT_AT_RISK_PCT:
        delivery_status = "BEHIND_TARGET"
    elif ratio < settings.FULFILLMENT_ON_TRACK_PCT or (plan["projected_shortfall"] > 0 and not plan["preliminary"]):
        delivery_status = "AT_RISK"
    else:
        delivery_status = "ON_TRACK"

    # Expected vs actual chart (cumulative, one point per elapsed eligible date).
    chart, by_date = [], {}
    for a in counted:
        by_date[a.activity_date] = by_date.get(a.activity_date, 0) + 1
    running, day, index = 0, campaign.start_date, 0
    last_day = min(yesterday, end)
    while day <= last_day:
        if is_eligible_date(campaign, day):
            index += 1
            running += by_date.get(day, 0)
            chart.append(
                {
                    "date": day.isoformat(),
                    "expected": min(R * min(index, D), C),
                    "actual": running,
                    "period": period_of(campaign, day),
                }
            )
        day += timedelta(days=1)

    rider_financial = rider_financials(db, campaign)
    brand = brand_financials(db, campaign)
    excused_days = sum(r["excused_days"] for r in riders.values())

    return {
        "required_riders": R,
        "contract_days": D,
        "contracted_rider_days": C,
        "contract_start": campaign.start_date.isoformat(),
        "contract_end": campaign.end_date.isoformat(),
        "effective_end": end.isoformat(),
        "delivered_rider_days": delivered,
        "delivered_original_period": sum(1 for a in counted if a.activity_date <= campaign.end_date),
        "delivered_extension_period": sum(1 for a in counted if a.activity_date > campaign.end_date),
        "contract_rider_days_delivered": contract_delivered,
        "surplus_rider_days": surplus,
        "remaining_rider_days": remaining,
        "fulfillment_pct": round(contract_delivered / C * 100, 2) if C else 0.0,
        "fulfilled": fulfilled,
        "accepting_activity": not fulfilled or bool(campaign.continue_after_fulfillment),
        "elapsed_days": elapsed,
        "expected_to_date": expected,
        "actual_to_date": actual_to_date,
        "variance": variance,
        "pace_pct": round(ratio, 2) if ratio is not None else None,
        "daily_average": round(actual_to_date / elapsed, 2) if elapsed else None,
        "delivery_status": delivery_status,
        "excused_rider_days": excused_days,
        "photos_per_day": len(PhotoSlot.ALL),
        "active_riders": len(current),
        "riders_behind_target": sum(1 for a in current if riders[a.id]["behind_target"]),
        "inactive_riders": sum(1 for a in current if riders[a.id]["inactive"]),
        "recovery": plan,
        "chart": chart,
        "rider_payout": rider_financial,
        "brand": brand,
        "platform": {
            "potential_margin": round(brand["contract_value"] - rider_financial["planned_budget"], 2),
            "current_margin": round(brand["net_received"] - rider_financial["earned"], 2),
            "remaining_rider_budget": round(rider_financial["planned_budget"] - rider_financial["earned"], 2),
        },
        "thresholds": {
            "on_track_pct": settings.FULFILLMENT_ON_TRACK_PCT,
            "at_risk_pct": settings.FULFILLMENT_AT_RISK_PCT,
            "low_sample_min_days": settings.LOW_SAMPLE_MIN_DAYS,
            "low_sample_min_rider_days": settings.LOW_SAMPLE_MIN_RIDER_DAYS,
        },
        "rider_performance": riders,
        "contract_activity_ids": sorted(contract_ids),
    }


# ---------------------------------------------------------------------------
# 7. Final snapshot
# ---------------------------------------------------------------------------

def create_snapshot(db: Session, campaign: Campaign) -> CampaignFulfillmentSnapshot:
    """Saves the immutable closing summary. Never overwritten once written."""
    existing = db.query(CampaignFulfillmentSnapshot).filter(CampaignFulfillmentSnapshot.campaign_id == campaign.id).first()
    if existing:
        return existing
    f = campaign_fulfillment(db, campaign)
    assignments = db.query(CampaignAssignment).filter(CampaignAssignment.campaign_id == campaign.id).all()
    perf = f["rider_performance"]
    full = sum(1 for a in assignments if perf[a.id]["approved_days_so_far"] >= perf[a.id]["target_days"] > 0)
    data = {
        "campaign": campaign.name,
        "brand": campaign.brand.name if campaign.brand else None,
        "final_status": f["delivery_status"],
        "closed_as": campaign.status,
        "closed_at": datetime.utcnow().isoformat(),
        "contract_period": f"{campaign.start_date} to {campaign.end_date}",
        "extensions": [
            {"start": e.start_date.isoformat(), "end": e.end_date.isoformat(), "reason": e.reason} for e in campaign.extensions
        ],
        "contracted_rider_days": f["contracted_rider_days"],
        "delivered_rider_days": f["delivered_rider_days"],
        "contract_rider_days_delivered": f["contract_rider_days_delivered"],
        "surplus_rider_days": f["surplus_rider_days"],
        "shortfall_rider_days": f["remaining_rider_days"],
        "fulfillment_pct": f["fulfillment_pct"],
        "excused_rider_days": f["excused_rider_days"],
        "total_riders": len(assignments),
        "riders_fully_completed": full,
        "riders_partially_completed": len(assignments) - full,
        "rider_payout": f["rider_payout"],
        "brand": f["brand"],
        "platform": f["platform"],
    }
    snapshot = CampaignFulfillmentSnapshot(campaign_id=campaign.id, data=json.dumps(data, default=str))
    db.add(snapshot)
    db.commit()
    return snapshot
