"""Campaign business rules: slots, rider eligibility, daily activity, streaks and payouts.

All payout figures are derived here on the server; clients only display them.
"""
from datetime import date, datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.all_models import Rider, RiderStatus, User
from app.models.campaign_models import (
    ActivityStatus,
    ApplicationStatus,
    AssignmentStatus,
    Campaign,
    CampaignApplication,
    CampaignAssignment,
    CampaignDailyActivity,
    CampaignPayout,
    CampaignStatus,
    CampaignVisibility,
    PayoutStatus,
    PhotoStatus,
)
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification
from app.services.payment_service import create_payment, process_payment_transaction

IST_OFFSET = timedelta(hours=5, minutes=30)
ELIGIBLE_RIDER_STATUSES = (RiderStatus.APPROVED, RiderStatus.ACTIVE)


class CampaignError(ValueError):
    """A business-rule violation, reported to the client as a 400 response."""


def today_ist() -> date:
    """Campaign days follow Indian Standard Time."""
    return (datetime.utcnow() + IST_OFFSET).date()


def to_ist_date(value: Optional[datetime]) -> Optional[date]:
    return (value + IST_OFFSET).date() if value else None


# ---------------------------------------------------------------------------
# Slots and status
# ---------------------------------------------------------------------------

def slots_used(db: Session, campaign_id: int) -> int:
    return (
        db.query(func.count(CampaignAssignment.id))
        .filter(
            CampaignAssignment.campaign_id == campaign_id,
            CampaignAssignment.status.in_(AssignmentStatus.SLOT_HOLDING),
        )
        .scalar()
    )


def sync_campaign_status(db: Session, campaign: Campaign, today: Optional[date] = None) -> Campaign:
    """Derives OPEN / ACTIVE / FULL for published campaigns and starts assignments on day one."""
    today = today or today_ist()
    changed = False

    if campaign.status in CampaignStatus.PUBLISHED:
        if slots_used(db, campaign.id) >= campaign.total_slots:
            new_status = CampaignStatus.FULL
        elif campaign.start_date <= today:
            new_status = CampaignStatus.ACTIVE
        else:
            new_status = CampaignStatus.OPEN
        if new_status != campaign.status:
            campaign.status = new_status
            changed = True

    if campaign.start_date <= today and campaign.status not in CampaignStatus.CLOSED:
        waiting = (
            db.query(CampaignAssignment)
            .filter(
                CampaignAssignment.campaign_id == campaign.id,
                CampaignAssignment.status == AssignmentStatus.ASSIGNED,
            )
            .all()
        )
        for assignment in waiting:
            assignment.status = AssignmentStatus.ACTIVE
            changed = True

    if changed:
        db.commit()
        db.refresh(campaign)
    return campaign


def is_running(campaign: Campaign, today: Optional[date] = None) -> bool:
    """True while riders can submit daily activity."""
    today = today or today_ist()
    return (
        campaign.status in (CampaignStatus.ACTIVE, CampaignStatus.FULL)
        and campaign.start_date <= today <= campaign.end_date
    )


# ---------------------------------------------------------------------------
# Rider eligibility
# ---------------------------------------------------------------------------

def current_assignment(db: Session, rider_id: int) -> Optional[CampaignAssignment]:
    return (
        db.query(CampaignAssignment)
        .filter(
            CampaignAssignment.rider_id == rider_id,
            CampaignAssignment.status.in_(AssignmentStatus.CURRENT),
        )
        .first()
    )


def pending_application(db: Session, rider_id: int) -> Optional[CampaignApplication]:
    return (
        db.query(CampaignApplication)
        .filter(
            CampaignApplication.rider_id == rider_id,
            CampaignApplication.status == ApplicationStatus.REQUESTED,
        )
        .first()
    )


def join_eligibility(db: Session, campaign: Campaign, rider: Rider, today: Optional[date] = None) -> Tuple[bool, Optional[str]]:
    """Returns (can_join, reason shown to the rider when they cannot)."""
    today = today or today_ist()

    assignment = current_assignment(db, rider.id)
    if assignment:
        if assignment.campaign_id == campaign.id:
            return False, "You're already part of this campaign."
        return False, "You are already assigned to an active campaign."

    application = pending_application(db, rider.id)
    if application:
        if application.campaign_id == campaign.id:
            return False, "Your request is awaiting admin approval."
        return False, "You already have a pending request for another campaign."

    if rider.status not in ELIGIBLE_RIDER_STATUSES:
        return False, "Your rider account must be approved before you can join campaigns."
    if campaign.status == CampaignStatus.FULL:
        return False, "This campaign is full."
    if campaign.status == CampaignStatus.PAUSED:
        return False, "This campaign is paused."
    if campaign.status not in (CampaignStatus.OPEN, CampaignStatus.ACTIVE):
        return False, "This campaign is not accepting riders."
    if today > campaign.end_date:
        return False, "This campaign has ended."
    return True, None


def request_to_join(db: Session, campaign: Campaign, rider: Rider) -> CampaignApplication:
    sync_campaign_status(db, campaign)
    can_join, reason = join_eligibility(db, campaign, rider)
    if not can_join:
        raise CampaignError(reason)

    application = CampaignApplication(campaign_id=campaign.id, rider_id=rider.id)
    db.add(application)
    db.commit()
    db.refresh(application)

    send_notification(
        db=db,
        title=f"Campaign request: {rider.full_name}",
        message=f"{rider.full_name} ({rider.rider_id}) requested to join {campaign.name}.",
        is_admin=True,
        category="CAMPAIGN",
        reference_id=str(campaign.id),
    )
    return application


def withdraw_request(db: Session, campaign: Campaign, rider: Rider) -> CampaignApplication:
    application = (
        db.query(CampaignApplication)
        .filter(
            CampaignApplication.campaign_id == campaign.id,
            CampaignApplication.rider_id == rider.id,
            CampaignApplication.status == ApplicationStatus.REQUESTED,
        )
        .first()
    )
    if not application:
        raise CampaignError("You have no pending request for this campaign.")
    application.status = ApplicationStatus.WITHDRAWN
    db.commit()
    return application


# ---------------------------------------------------------------------------
# Admin: applications and assignments
# ---------------------------------------------------------------------------

def approve_application(db: Session, application: CampaignApplication, admin: User) -> CampaignAssignment:
    if application.status != ApplicationStatus.REQUESTED:
        raise CampaignError("Only requested applications can be approved.")

    # Lock the campaign row so concurrent approvals cannot overfill slots (no-op on SQLite).
    campaign = db.query(Campaign).filter(Campaign.id == application.campaign_id).with_for_update().one()
    sync_campaign_status(db, campaign)
    if campaign.status not in CampaignStatus.PUBLISHED:
        raise CampaignError(f"Riders cannot be approved while the campaign is {campaign.status.lower()}.")
    if slots_used(db, campaign.id) >= campaign.total_slots:
        raise CampaignError("All slots for this campaign are filled.")
    if current_assignment(db, application.rider_id):
        raise CampaignError("This rider is already assigned to another active campaign.")

    today = today_ist()
    now = datetime.utcnow()
    assignment = CampaignAssignment(
        campaign_id=campaign.id,
        rider_id=application.rider_id,
        application_id=application.id,
        status=AssignmentStatus.ACTIVE if campaign.start_date <= today else AssignmentStatus.ASSIGNED,
        daily_rate=campaign.daily_rate,
        assigned_at=now,
    )
    db.add(assignment)
    db.flush()
    db.add(
        CampaignPayout(
            campaign_id=campaign.id,
            rider_id=application.rider_id,
            assignment_id=assignment.id,
            daily_rate=campaign.daily_rate,
        )
    )
    application.status = ApplicationStatus.APPROVED
    application.approved_at = now
    application.reviewed_by_id = admin.id
    db.commit()
    db.refresh(assignment)
    sync_campaign_status(db, campaign)

    rider = application.rider
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_RIDER_APPROVED",
        target_type="CAMPAIGN",
        target_id=str(campaign.id),
        details=f"{rider.full_name} ({rider.rider_id}) approved for {campaign.name}",
    )
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Campaign request approved",
            message=f"You've been approved for {campaign.name}. Earn ₹{campaign.daily_rate:,.0f} for every approved day.",
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
    return assignment


def reject_application(db: Session, application: CampaignApplication, admin: User, reason: Optional[str]) -> CampaignApplication:
    if application.status != ApplicationStatus.REQUESTED:
        raise CampaignError("Only requested applications can be rejected.")
    application.status = ApplicationStatus.REJECTED
    application.rejected_at = datetime.utcnow()
    application.rejection_reason = reason or "Not selected for this campaign"
    application.reviewed_by_id = admin.id
    db.commit()

    campaign, rider = application.campaign, application.rider
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_RIDER_REJECTED",
        target_type="CAMPAIGN",
        target_id=str(campaign.id),
        details=f"{rider.full_name} ({rider.rider_id}) rejected for {campaign.name}: {application.rejection_reason}",
    )
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Campaign request not approved",
            message=f"Your request to join {campaign.name} was not approved. Reason: {application.rejection_reason}",
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
    return application


def remove_assignment(db: Session, assignment: CampaignAssignment, admin: User, reason: Optional[str]) -> CampaignAssignment:
    if assignment.status not in AssignmentStatus.CURRENT:
        raise CampaignError("Only assigned or active riders can be removed.")
    assignment.status = AssignmentStatus.REMOVED
    assignment.ended_at = datetime.utcnow()
    assignment.removal_reason = reason or "Removed by admin"
    db.commit()
    campaign = sync_campaign_status(db, assignment.campaign)

    rider = assignment.rider
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_RIDER_REMOVED",
        target_type="CAMPAIGN",
        target_id=str(campaign.id),
        details=f"{rider.full_name} ({rider.rider_id}) removed from {campaign.name}: {assignment.removal_reason}",
    )
    if rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Removed from campaign",
            message=f"You've been removed from {campaign.name}. Reason: {assignment.removal_reason}. Earnings for approved days are kept.",
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
    return assignment


# ---------------------------------------------------------------------------
# Daily activity and payouts
# ---------------------------------------------------------------------------

def recalculate_payout(db: Session, assignment: CampaignAssignment) -> CampaignPayout:
    """earned = approved days × the rider's daily rate. Missing or rejected days earn nothing."""
    approved = (
        db.query(CampaignDailyActivity)
        .filter(
            CampaignDailyActivity.assignment_id == assignment.id,
            CampaignDailyActivity.photo_status == PhotoStatus.APPROVED,
        )
        .all()
    )
    payout = assignment.payout
    payout.eligible_days = len(approved)
    payout.daily_rate = assignment.daily_rate
    payout.total_amount = round(sum(a.earned_amount for a in approved), 2)
    # New earnings after a payment reopen the payout for the outstanding amount.
    if payout.status == PayoutStatus.PAID and payout.total_amount > payout.paid_amount:
        payout.status = PayoutStatus.PENDING
    db.commit()
    db.refresh(payout)
    return payout


def submit_activity(db: Session, assignment: CampaignAssignment, photo_url: str) -> CampaignDailyActivity:
    """Records today's proof. A rejected or pending proof for today can be replaced."""
    today = today_ist()
    campaign = sync_campaign_status(db, assignment.campaign, today)
    if assignment.status != AssignmentStatus.ACTIVE:
        raise CampaignError("You can only submit proof for a campaign you are active in.")
    if not is_running(campaign, today):
        raise CampaignError("This campaign is not accepting proof today.")

    activity = (
        db.query(CampaignDailyActivity)
        .filter(
            CampaignDailyActivity.assignment_id == assignment.id,
            CampaignDailyActivity.activity_date == today,
        )
        .first()
    )
    if activity and activity.photo_status == PhotoStatus.APPROVED:
        raise CampaignError("Today's proof has already been approved.")
    if not activity:
        activity = CampaignDailyActivity(
            campaign_id=campaign.id,
            rider_id=assignment.rider_id,
            assignment_id=assignment.id,
            activity_date=today,
        )
        db.add(activity)

    activity.photo_url = photo_url
    activity.status = ActivityStatus.SUBMITTED
    activity.photo_status = PhotoStatus.PENDING
    activity.rejection_reason = None
    activity.earned_amount = 0.0
    activity.submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    return activity


def review_activity(db: Session, activity: CampaignDailyActivity, admin: User, approve: bool, reason: Optional[str] = None) -> CampaignDailyActivity:
    assignment = activity.assignment
    now = datetime.utcnow()
    if approve:
        activity.status = ActivityStatus.COMPLETED
        activity.photo_status = PhotoStatus.APPROVED
        activity.approved_at = now
        activity.rejection_reason = None
        activity.earned_amount = assignment.daily_rate
    else:
        activity.status = ActivityStatus.REJECTED
        activity.photo_status = PhotoStatus.REJECTED
        activity.approved_at = None
        activity.rejection_reason = reason or "Proof does not meet the campaign requirements"
        activity.earned_amount = 0.0
    activity.reviewed_by_id = admin.id
    db.commit()
    recalculate_payout(db, assignment)

    rider, campaign = assignment.rider, assignment.campaign
    day = activity.activity_date.strftime("%d %b")
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_PROOF_APPROVED" if approve else "CAMPAIGN_PROOF_REJECTED",
        target_type="CAMPAIGN",
        target_id=str(campaign.id),
        details=f"{rider.rider_id} proof for {day}: {'approved' if approve else activity.rejection_reason}",
    )
    if not approve and rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Campaign proof rejected",
            message=f"Your proof for {day} in {campaign.name} was rejected. Reason: {activity.rejection_reason}",
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
    return activity


def approve_payout(db: Session, payout: CampaignPayout, admin: User) -> CampaignPayout:
    if payout.total_amount - payout.paid_amount <= 0:
        raise CampaignError("There is no outstanding amount to approve.")
    if payout.status not in (PayoutStatus.PENDING, PayoutStatus.FAILED):
        raise CampaignError(f"A {payout.status.lower()} payout cannot be approved.")
    payout.status = PayoutStatus.APPROVED
    payout.approved_at = datetime.utcnow()
    db.commit()
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_PAYOUT_APPROVED",
        target_type="CAMPAIGN",
        target_id=str(payout.campaign_id),
        details=f"Payout of ₹{payout.total_amount - payout.paid_amount:,.2f} approved for {payout.rider.rider_id}",
    )
    return payout


def pay_payout(db: Session, payout: CampaignPayout, admin: User) -> CampaignPayout:
    """Settles the outstanding amount through the existing payments ledger."""
    if payout.status != PayoutStatus.APPROVED:
        raise CampaignError("Approve the payout before marking it as paid.")
    amount = round(payout.total_amount - payout.paid_amount, 2)
    if amount <= 0:
        raise CampaignError("There is no outstanding amount to pay.")

    campaign = payout.assignment.campaign
    payment = create_payment(
        db=db,
        rider_id=payout.rider_id,
        amount=amount,
        admin_user=admin,
        brand_id=campaign.brand_id,
        payment_period=campaign.name[:50],
        notes=f"Campaign payout: {campaign.name} ({payout.eligible_days} approved days × ₹{payout.daily_rate:,.0f})",
    )
    payment = process_payment_transaction(db=db, payment_id=payment.id, admin_user=admin, mark_as="PAID")

    payout.paid_amount = round(payout.paid_amount + amount, 2)
    payout.status = PayoutStatus.PAID
    payout.paid_at = datetime.utcnow()
    payout.payment_id = payment.id
    db.commit()
    db.refresh(payout)
    return payout


# ---------------------------------------------------------------------------
# Campaign lifecycle (admin)
# ---------------------------------------------------------------------------

def publish_campaign(db: Session, campaign: Campaign, admin: User) -> Campaign:
    if campaign.status != CampaignStatus.DRAFT:
        raise CampaignError("Only draft campaigns can be published.")
    if campaign.end_date < today_ist():
        raise CampaignError("A campaign that has already ended cannot be published.")
    campaign.status = CampaignStatus.OPEN
    campaign.visibility = CampaignVisibility.PUBLIC
    campaign.published_at = datetime.utcnow()
    db.commit()
    sync_campaign_status(db, campaign)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_PUBLISHED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} published")
    return campaign


def pause_campaign(db: Session, campaign: Campaign, admin: User) -> Campaign:
    if campaign.status not in CampaignStatus.PUBLISHED:
        raise CampaignError("Only published campaigns can be paused.")
    campaign.status = CampaignStatus.PAUSED
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_PAUSED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} paused")
    return campaign


def resume_campaign(db: Session, campaign: Campaign, admin: User) -> Campaign:
    if campaign.status != CampaignStatus.PAUSED:
        raise CampaignError("Only paused campaigns can be resumed.")
    campaign.status = CampaignStatus.OPEN
    db.commit()
    sync_campaign_status(db, campaign)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_RESUMED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} resumed")
    return campaign


def _close_campaign(db: Session, campaign: Campaign, admin: User, status: str) -> Campaign:
    """Completes or cancels a campaign. Activity and payout history is always kept."""
    if campaign.status in CampaignStatus.CLOSED:
        raise CampaignError(f"This campaign is already {campaign.status.lower()}.")
    now = datetime.utcnow()
    completing = status == CampaignStatus.COMPLETED
    campaign.status = status
    if completing:
        campaign.completed_at = now
    else:
        campaign.cancelled_at = now

    assignments = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.status.in_(AssignmentStatus.CURRENT))
        .all()
    )
    for assignment in assignments:
        assignment.status = AssignmentStatus.COMPLETED if completing else AssignmentStatus.CANCELLED
        assignment.ended_at = now

    pending = (
        db.query(CampaignApplication)
        .filter(CampaignApplication.campaign_id == campaign.id, CampaignApplication.status == ApplicationStatus.REQUESTED)
        .all()
    )
    for application in pending:
        application.status = ApplicationStatus.REJECTED
        application.rejected_at = now
        application.rejection_reason = f"Campaign {status.lower()}"
    db.commit()

    # Final payout calculation for every rider who took part.
    for assignment in db.query(CampaignAssignment).filter(CampaignAssignment.campaign_id == campaign.id).all():
        recalculate_payout(db, assignment)

    word = "completed" if completing else "cancelled"
    log_admin_action(db=db, admin_user=admin, action=f"CAMPAIGN_{status}", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} {word}")
    for assignment in assignments:
        if assignment.rider.user_id:
            send_notification(
                db=db,
                user_id=assignment.rider.user_id,
                title=f"Campaign {word}",
                message=f"{campaign.name} has been {word}. You earned ₹{assignment.payout.total_amount:,.0f} for {assignment.payout.eligible_days} approved days.",
                category="CAMPAIGN",
                reference_id=str(campaign.id),
            )
    return campaign


def complete_campaign(db: Session, campaign: Campaign, admin: User) -> Campaign:
    return _close_campaign(db, campaign, admin, CampaignStatus.COMPLETED)


def cancel_campaign(db: Session, campaign: Campaign, admin: User) -> Campaign:
    return _close_campaign(db, campaign, admin, CampaignStatus.CANCELLED)


# ---------------------------------------------------------------------------
# Progress, streaks and statistics
# ---------------------------------------------------------------------------

def rider_progress(assignment: CampaignAssignment, today: Optional[date] = None) -> dict:
    """Day-by-day timeline plus streaks and earnings for one rider in one campaign."""
    today = today or today_ist()
    campaign = assignment.campaign
    by_date = {a.activity_date: a for a in assignment.activities}

    window_start = max(campaign.start_date, to_ist_date(assignment.assigned_at) or campaign.start_date)
    window_end = min(campaign.end_date, today)
    ended = to_ist_date(assignment.ended_at)
    if ended:
        window_end = min(window_end, ended)

    days = []
    current = window_start
    while current <= window_end:
        activity = by_date.get(current)
        if activity:
            status = activity.status
        elif current == today and assignment.status == AssignmentStatus.ACTIVE:
            status = "DUE"
        else:
            status = "MISSED"
        days.append(
            {
                "date": current.isoformat(),
                "day_number": (current - campaign.start_date).days + 1,
                "status": status,
                "earned": activity.earned_amount if activity else 0.0,
                "activity_id": activity.id if activity else None,
                "photo_url": activity.photo_url if activity else None,
                "photo_status": activity.photo_status if activity else None,
                "rejection_reason": activity.rejection_reason if activity else None,
                "submitted_at": activity.submitted_at.isoformat() if activity and activity.submitted_at else None,
            }
        )
        current += timedelta(days=1)

    # Current streak: consecutive approved days, ignoring today while it is still open.
    streak_days = list(reversed(days))
    if streak_days and streak_days[0]["date"] == today.isoformat() and streak_days[0]["status"] in ("DUE", ActivityStatus.SUBMITTED):
        streak_days = streak_days[1:]
    current_streak = 0
    for day in streak_days:
        if day["status"] != ActivityStatus.COMPLETED:
            break
        current_streak += 1

    longest_streak = run = 0
    for day in days:
        run = run + 1 if day["status"] == ActivityStatus.COMPLETED else 0
        longest_streak = max(longest_streak, run)

    payout = assignment.payout
    earned = payout.total_amount if payout else 0.0
    paid = payout.paid_amount if payout else 0.0
    total_days = (campaign.end_date - campaign.start_date).days + 1
    if today < campaign.start_date:
        remaining_days = total_days
    else:
        remaining_days = max((campaign.end_date - today).days, 0)

    return {
        "days": days,
        "total_campaign_days": total_days,
        "eligible_days": len(days),
        "completed_days": sum(1 for d in days if d["status"] == ActivityStatus.COMPLETED),
        "missed_days": sum(1 for d in days if d["status"] in ("MISSED", ActivityStatus.REJECTED)),
        "pending_review_days": sum(1 for d in days if d["status"] == ActivityStatus.SUBMITTED),
        "remaining_days": remaining_days,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "photos_submitted": len(assignment.activities),
        "photos_approved": sum(1 for a in assignment.activities if a.photo_status == PhotoStatus.APPROVED),
        "daily_rate": assignment.daily_rate,
        "earned": earned,
        "paid": paid,
        "pending": round(earned - paid, 2),
        "payout_status": payout.status if payout else PayoutStatus.PENDING,
        "can_submit_today": assignment.status == AssignmentStatus.ACTIVE
        and is_running(campaign, today)
        and (by_date.get(today) is None or by_date[today].photo_status != PhotoStatus.APPROVED),
    }


def campaign_stats(db: Session, campaign: Campaign) -> dict:
    used = slots_used(db, campaign.id)
    assignment_counts = dict(
        db.query(CampaignAssignment.status, func.count(CampaignAssignment.id))
        .filter(CampaignAssignment.campaign_id == campaign.id)
        .group_by(CampaignAssignment.status)
        .all()
    )
    requested = (
        db.query(func.count(CampaignApplication.id))
        .filter(CampaignApplication.campaign_id == campaign.id, CampaignApplication.status == ApplicationStatus.REQUESTED)
        .scalar()
    )
    eligible_days, generated, paid = (
        db.query(
            func.coalesce(func.sum(CampaignPayout.eligible_days), 0),
            func.coalesce(func.sum(CampaignPayout.total_amount), 0.0),
            func.coalesce(func.sum(CampaignPayout.paid_amount), 0.0),
        )
        .filter(CampaignPayout.campaign_id == campaign.id)
        .one()
    )
    pending_photos = (
        db.query(func.count(CampaignDailyActivity.id))
        .filter(CampaignDailyActivity.campaign_id == campaign.id, CampaignDailyActivity.photo_status == PhotoStatus.PENDING)
        .scalar()
    )
    return {
        "total_slots": campaign.total_slots,
        "assigned_riders": used,
        "remaining_slots": max(campaign.total_slots - used, 0),
        "requested_riders": requested,
        "approved_riders": used,
        "active_riders": assignment_counts.get(AssignmentStatus.ACTIVE, 0) + assignment_counts.get(AssignmentStatus.ASSIGNED, 0),
        "completed_riders": assignment_counts.get(AssignmentStatus.COMPLETED, 0),
        "removed_riders": assignment_counts.get(AssignmentStatus.REMOVED, 0),
        "total_eligible_days": int(eligible_days),
        "total_payout_generated": round(float(generated), 2),
        "total_payout_paid": round(float(paid), 2),
        "total_payout_pending": round(float(generated) - float(paid), 2),
        "pending_photos": pending_photos,
    }
