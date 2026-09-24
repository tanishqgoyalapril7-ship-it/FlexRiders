"""Campaign business rules: slots, rider eligibility, daily activity, streaks and payouts.

All payout figures are derived here on the server; clients only display them.
"""
import json
import re
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.all_models import Rider, RiderStatus, User
from app.models.campaign_models import (
    ActivityStatus,
    ApplicationStatus,
    AssignmentStatus,
    Campaign,
    CampaignActivityPhoto,
    CampaignApplication,
    CampaignAssignment,
    CampaignDailyActivity,
    ActivityChangeLog,
    CampaignBrandKit,
    CampaignPayout,
    CampaignStatus,
    KitStatus,
    PhotoSlot,
    CampaignVisibility,
    PayoutStatus,
    PhotoStatus,
    VehicleCategory,
)
from app.services import fulfillment_service as fs
from app.services import kit_service as ks
from app.services.fulfillment_service import today_ist, to_ist_date  # noqa: F401  (re-exported)
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification
from app.services.payment_service import create_payment, process_payment_transaction

ELIGIBLE_RIDER_STATUSES = (RiderStatus.APPROVED, RiderStatus.ACTIVE)


class CampaignError(ValueError):
    """A business-rule violation, reported to the client as a 400 response."""


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


def slot_capacity(campaign: Campaign) -> int:
    """Required riders plus replacement slots opened by an admin. Contracted rider-days never change."""
    return campaign.total_slots + (campaign.extra_replacement_slots or 0)


def target_reached(db: Session, campaign: Campaign) -> bool:
    """True once delivered rider-days reach the contract and the campaign doesn't continue past it."""
    if campaign.continue_after_fulfillment:
        return False
    return len(fs._counted_approved_days(db, campaign)) >= fs.contracted_rider_days(campaign)


def sync_campaign_status(db: Session, campaign: Campaign, today: Optional[date] = None) -> Campaign:
    """Derives OPEN / FULL / ACTIVE (Live) for published campaigns and starts assignments on day one.

    A campaign goes Live when an admin says so or, at the latest, on its start date. Once Live it stays
    ACTIVE and new riders can no longer join."""
    today = today or today_ist()
    changed = False

    if campaign.status in CampaignStatus.PUBLISHED:
        if not campaign.live_at and campaign.start_date <= today:
            go_live(db, campaign, None)
            return campaign
        if campaign.live_at:
            new_status = CampaignStatus.ACTIVE
        elif slots_used(db, campaign.id) >= slot_capacity(campaign):
            new_status = CampaignStatus.FULL
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


def go_live(db: Session, campaign: Campaign, admin: Optional[User]) -> Campaign:
    """Published → Live. Closes joining and tells every approved rider, once (the live notification is
    de-duplicated per rider). `admin` is None when the start date arrives on its own."""
    if campaign.live_at:
        raise CampaignError("This campaign is already live.")
    if campaign.status not in CampaignStatus.PUBLISHED:
        raise CampaignError("Only published campaigns can go live.")
    campaign.live_at = datetime.utcnow()
    campaign.status = CampaignStatus.ACTIVE
    db.commit()
    sync_campaign_status(db, campaign)  # Starts waiting assignments if the start date has arrived
    if admin:
        log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_LIVE", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} is now live; joining closed")
    notify_campaign_live(db, campaign)
    return campaign


def notify_campaign_live(db: Session, campaign: Campaign) -> int:
    """'Campaign is now LIVE' to every rider currently assigned (not requested, rejected or removed)."""
    assignments = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.status.in_(AssignmentStatus.CURRENT))
        .all()
    )
    starts = "" if campaign.start_date <= today_ist() else f" Your first photo day is {campaign.start_date:%d %b}."
    sent = 0
    for a in assignments:
        if not a.rider or not a.rider.user_id:
            continue
        sent += bool(
            send_notification(
                db=db,
                user_id=a.rider.user_id,
                title=f"{campaign.name} is now LIVE 🎉",
                message=f"Your campaign {campaign.name} has started.{starts} Please follow your daily photo schedule and complete all required slots.",
                category="CAMPAIGN",
                reference_id=str(campaign.id),
                dedupe_key=f"CAMPAIGN_LIVE:{campaign.id}:{a.rider_id}",
            )
        )
    return sent


def backfill_live_dates() -> None:
    """Campaigns that started before Live was tracked count as live from their publish date (no notice sent)."""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        db.query(Campaign).filter(
            Campaign.live_at.is_(None),
            Campaign.status != CampaignStatus.DRAFT,
            Campaign.start_date < today_ist(),
        ).update({Campaign.live_at: func.coalesce(Campaign.published_at, Campaign.created_at)}, synchronize_session=False)
        db.commit()
    finally:
        db.close()


def lifecycle(campaign: Campaign, today: Optional[date] = None) -> Dict:
    """The campaign state riders and brands see: Draft, Open for Joining, Live, Paused, Completed, Cancelled."""
    today = today or today_ist()
    if campaign.status == CampaignStatus.DRAFT:
        key = "DRAFT"
    elif campaign.status == CampaignStatus.CANCELLED:
        key = "CANCELLED"
    elif campaign.status == CampaignStatus.COMPLETED or fs.effective_end_date(campaign) < today:
        key = "COMPLETED"
    elif campaign.status == CampaignStatus.PAUSED:
        key = "PAUSED"
    elif campaign.live_at:
        key = "LIVE"
    else:
        key = "OPEN"
    labels = {"DRAFT": "Draft", "OPEN": "Open for Joining", "LIVE": "Live", "PAUSED": "Paused", "COMPLETED": "Completed", "CANCELLED": "Cancelled"}
    return {"key": key, "label": labels[key], "live_at": campaign.live_at}


def is_running(campaign: Campaign, today: Optional[date] = None) -> bool:
    """True while riders can submit daily activity: contract period or an approved extension."""
    today = today or today_ist()
    return campaign.status in (CampaignStatus.ACTIVE, CampaignStatus.FULL) and fs.is_eligible_date(campaign, today)


# ---------------------------------------------------------------------------
# Rider eligibility
# ---------------------------------------------------------------------------

def rider_visibility(campaign: Campaign, today: Optional[date] = None) -> Optional[str]:
    """Why riders can't see this campaign in their Available list, or None if they can.

    Only publication and dates decide visibility. A rider's own approval, brand or current campaign
    never hide a campaign; they only decide whether the rider can join (see join_eligibility).
    """
    today = today or today_ist()
    if campaign.status == CampaignStatus.DRAFT or campaign.visibility != CampaignVisibility.PUBLIC:
        return "Draft: not published yet"
    if campaign.status == CampaignStatus.COMPLETED:
        return "Completed"
    if campaign.status == CampaignStatus.CANCELLED:
        return "Cancelled"
    if fs.effective_end_date(campaign) < today:
        return f"Ended on {fs.effective_end_date(campaign):%d %b %Y}"
    return None


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


LIVE_JOIN_CLOSED = "Campaign has already started. New riders cannot join this campaign."


def eligible_categories(campaign: Campaign) -> List[str]:
    """Vehicle categories allowed in this campaign; empty means all."""
    return [c for c in (campaign.eligible_vehicle_categories or "").split(",") if c in VehicleCategory.ALL]


def vehicle_block_reason(campaign: Campaign, rider: Rider) -> Optional[str]:
    """Why the rider's stored vehicle category doesn't fit this campaign, or None."""
    allowed = eligible_categories(campaign)
    if not allowed or set(allowed) == set(VehicleCategory.ALL):
        return None
    names = " or ".join(VehicleCategory.LABELS[c] for c in allowed)
    if not rider.vehicle_category:
        return f"This campaign is for {names} riders. Add your vehicle type in your profile to join."
    if rider.vehicle_category not in allowed:
        return f"This campaign is only for {names} riders."
    return None


def join_eligibility(
    db: Session, campaign: Campaign, rider: Rider, today: Optional[date] = None, by_admin: bool = False
) -> Tuple[bool, Optional[str]]:
    """Returns (can_join, reason shown to the rider when they cannot).

    by_admin: an admin adding a (replacement) rider directly may do so after the campaign went live."""
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
    if campaign.status in CampaignStatus.PUBLISHED and campaign.live_at and not by_admin:
        return False, LIVE_JOIN_CLOSED
    vehicle = vehicle_block_reason(campaign, rider)
    if vehicle:
        return False, vehicle
    if campaign.status == CampaignStatus.FULL:
        return False, "This campaign is full."
    if campaign.status == CampaignStatus.PAUSED:
        return False, "This campaign is paused."
    if campaign.status not in (CampaignStatus.OPEN, CampaignStatus.ACTIVE):
        return False, "This campaign is not accepting riders."
    if today > fs.effective_end_date(campaign):
        return False, "This campaign has ended."
    if target_reached(db, campaign):
        return False, "This campaign has reached its target."
    return True, None


def _kit_choice(db: Session, campaign: Campaign, tshirt_size: Optional[str], pickup_location_id: Optional[int]):
    try:
        return ks.resolve_join_choice(db, campaign, tshirt_size, pickup_location_id)
    except ks.KitError as e:
        raise CampaignError(str(e))


def request_to_join(
    db: Session, campaign: Campaign, rider: Rider, tshirt_size: Optional[str] = None, pickup_location_id: Optional[int] = None
) -> CampaignApplication:
    sync_campaign_status(db, campaign)
    can_join, reason = join_eligibility(db, campaign, rider)
    if not can_join:
        raise CampaignError(reason)
    size, location_id = _kit_choice(db, campaign, tshirt_size, pickup_location_id)

    application = CampaignApplication(
        campaign_id=campaign.id, rider_id=rider.id, tshirt_size=size, pickup_location_id=location_id,
        kit_status=ks.initial_request_kit_status(campaign),
    )
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

def approve_application(
    db: Session, application: CampaignApplication, admin: User, replacement_for_assignment_id: Optional[int] = None
) -> CampaignAssignment:
    if application.status != ApplicationStatus.REQUESTED:
        raise CampaignError("Only requested applications can be approved.")

    # Lock the campaign row so concurrent approvals cannot overfill slots (no-op on SQLite).
    campaign = db.query(Campaign).filter(Campaign.id == application.campaign_id).with_for_update().one()
    sync_campaign_status(db, campaign)
    if campaign.status not in CampaignStatus.PUBLISHED:
        raise CampaignError(f"Riders cannot be approved while the campaign is {campaign.status.lower()}.")
    if slots_used(db, campaign.id) >= slot_capacity(campaign):
        raise CampaignError("All slots for this campaign are filled. Open a replacement slot to add another rider.")
    if replacement_for_assignment_id is not None:
        replaced = db.query(CampaignAssignment).filter(CampaignAssignment.id == replacement_for_assignment_id).first()
        if not replaced or replaced.campaign_id != campaign.id:
            raise CampaignError("The rider being replaced is not part of this campaign.")
    if current_assignment(db, application.rider_id):
        raise CampaignError("This rider is already assigned to another active campaign.")
    rider = application.rider
    if rider is None or rider.archived_at or rider.status not in ELIGIBLE_RIDER_STATUSES:
        raise CampaignError("Only approved, non-archived riders can be approved for a campaign.")
    vehicle = vehicle_block_reason(campaign, rider)
    if vehicle:
        raise CampaignError(f"{rider.full_name} can't be approved: {vehicle[0].lower()}{vehicle[1:]}")
    if ks.kit_required(campaign) and ks.request_kit_status(application) != KitStatus.COLLECTED:
        raise CampaignError("Mark the rider's T-shirt as collected before approving them for this campaign.")

    today = today_ist()
    now = datetime.utcnow()
    assignment = CampaignAssignment(
        campaign_id=campaign.id,
        rider_id=application.rider_id,
        application_id=application.id,
        status=AssignmentStatus.ACTIVE if campaign.start_date <= today else AssignmentStatus.ASSIGNED,
        daily_rate=campaign.daily_rate,
        assigned_at=now,
        replacement_for_assignment_id=replacement_for_assignment_id,
    )
    db.add(assignment)
    db.flush()
    ks.create_rider_kit(db, campaign, assignment, application)
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
        details=(
            f"Join request #{application.id}: {rider.full_name} ({rider.rider_id}) for {campaign.name}. "
            f"Campaign approval: Pending Admin Approval → Approved; "
            f"T-shirt: {KitStatus.LABELS.get(ks.request_kit_status(application), 'Not Required')}"
        ),
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
    if not (reason or "").strip():
        raise CampaignError("Please give a reason for rejecting this request.")
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
        details=(
            f"Join request #{application.id}: {rider.full_name} ({rider.rider_id}) for {campaign.name}. "
            f"Campaign approval: Pending Admin Approval → Rejected. Reason: {application.rejection_reason}"
        ),
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
    """Payouts depend on the whole campaign (contract vs surplus), so recalculate all of them."""
    fs.recalculate_campaign_payouts(db, assignment.campaign)
    db.refresh(assignment.payout)
    return assignment.payout


def _log_change(db: Session, activity: CampaignDailyActivity, old_status: Optional[str], old_earned: Optional[float], reason: Optional[str], admin: Optional[User]) -> None:
    db.add(
        ActivityChangeLog(
            campaign_id=activity.campaign_id,
            activity_id=activity.id,
            rider_id=activity.rider_id,
            activity_date=activity.activity_date,
            old_status=old_status,
            new_status=activity.status,
            old_earned=old_earned,
            new_earned=activity.earned_amount,
            reason=reason,
            changed_by_id=admin.id if admin else None,
        )
    )
    db.commit()


# ---------------------------------------------------------------------------
# Photo Streaks: Morning + Evening + Night photos approved on one date = 1 completed rider-day
# ---------------------------------------------------------------------------

def photos_required() -> int:
    return len(PhotoSlot.ALL)


_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def slot_windows(campaign: Optional[Campaign] = None) -> dict:
    """Time window (IST, "HH:MM") per slot: the campaign's own windows, else the defaults."""
    windows = dict(PhotoSlot.DEFAULT_WINDOWS)
    if campaign is not None and campaign.photo_slot_windows:
        try:
            stored = json.loads(campaign.photo_slot_windows)
            for slot in PhotoSlot.ALL:
                if slot in stored:
                    windows[slot] = tuple(stored[slot])
        except (ValueError, TypeError):
            pass  # A malformed value falls back to the defaults
    return windows


def validate_slot_windows(windows: Optional[Dict]) -> Optional[str]:
    """Checks admin-entered windows and returns them as stored JSON (None = defaults)."""
    if not windows:
        return None
    clean = {}
    for slot in PhotoSlot.ALL:
        pair = windows.get(slot)
        if not pair or len(pair) != 2 or not all(isinstance(t, str) and _TIME.match(t) for t in pair):
            raise CampaignError(f"Enter the {PhotoSlot.LABELS[slot]} slot as start and end times (HH:MM).")
        if pair[0] >= pair[1]:
            raise CampaignError(f"The {PhotoSlot.LABELS[slot]} slot must end after it starts.")
        clean[slot] = [pair[0], pair[1]]
    ordered = [clean[s] for s in PhotoSlot.ALL]
    for earlier, later in zip(ordered, ordered[1:]):
        if later[0] < earlier[1]:
            raise CampaignError("Photo slots can't overlap: Morning, then Evening, then Night.")
    if {s: tuple(v) for s, v in clean.items()} == PhotoSlot.DEFAULT_WINDOWS:
        return None
    return json.dumps(clean)


def slot_view(activity: Optional[CampaignDailyActivity]) -> dict:
    """The photo shown in each slot: its live (pending/approved) photo, else its latest rejected one.
    Photos taken before slots existed fill the remaining slots in upload order (duplicates once)."""
    view = {slot: None for slot in PhotoSlot.ALL}
    if not activity or not activity.photos:
        return view
    photos = list(activity.photos)  # Upload order (the relationship is ordered by id; new photos are appended)
    for slot in PhotoSlot.ALL:
        in_slot = [p for p in photos if p.slot == slot]
        live = [p for p in in_slot if p.status != PhotoStatus.REJECTED]
        view[slot] = (live or in_slot or [None])[-1]
    seen = {p.content_hash or p.photo_url for p in view.values() if p is not None and p.status != PhotoStatus.REJECTED}
    free = [slot for slot in PhotoSlot.ALL if view[slot] is None or view[slot].status == PhotoStatus.REJECTED]
    for p in photos:
        if p.slot is not None or not free:
            continue
        key = p.content_hash or p.photo_url
        if p.status != PhotoStatus.REJECTED:
            if key in seen:
                continue  # The same image never fills two slots
            seen.add(key)
        slot = free[0]
        if view[slot] is None or p.status != PhotoStatus.REJECTED:
            view[slot] = p
            if p.status != PhotoStatus.REJECTED:
                free.pop(0)
    return view


def slot_status(photo) -> str:
    return photo.status if photo is not None else "NOT_STARTED"


def slot_rows(activity: Optional[CampaignDailyActivity], campaign: Optional[Campaign] = None) -> list:
    """Morning / Evening / Night with each slot's photo and status, for the apps."""
    view, windows = slot_view(activity), slot_windows(campaign)
    return [
        {
            "slot": slot,
            "label": PhotoSlot.LABELS[slot],
            "window": {"start": windows[slot][0], "end": windows[slot][1]},
            "status": slot_status(view[slot]),
            "photo_id": view[slot].id if view[slot] else None,
            "photo_url": view[slot].photo_url if view[slot] else None,
            "rejection_reason": view[slot].rejection_reason if view[slot] and view[slot].status == PhotoStatus.REJECTED else None,
        }
        for slot in PhotoSlot.ALL
    ]


def photo_counts(activity: Optional[CampaignDailyActivity]) -> dict:
    """Photo tallies for one rider-day. Valid = approved photos with distinct content, so a
    duplicate image never counts twice and extra photos never count beyond one day."""
    required = photos_required()
    if not activity:
        return {"required": required, "valid": 0, "pending": 0, "rejected": 0, "uploaded": 0}
    if not activity.photos:
        # Legacy day recorded before per-photo proofs: its single decision covers the whole day.
        legacy_valid = required if activity.status == ActivityStatus.COMPLETED else 0
        return {
            "required": required,
            "valid": legacy_valid,
            "pending": 1 if activity.photo_url and activity.photo_status == PhotoStatus.PENDING else 0,
            "rejected": 1 if activity.photo_status == PhotoStatus.REJECTED else 0,
            "uploaded": 1 if activity.photo_url else 0,
        }
    # Valid = slots holding an approved photo: at most one per slot, so at most 3 per day.
    view = slot_view(activity)
    return {
        "required": required,
        "valid": sum(1 for p in view.values() if p is not None and p.status == PhotoStatus.APPROVED),
        "pending": sum(1 for p in view.values() if p is not None and p.status == PhotoStatus.PENDING),
        "rejected": sum(1 for p in activity.photos if p.status == PhotoStatus.REJECTED),
        "uploaded": len(activity.photos),
    }


def derive_day_status(activity: CampaignDailyActivity) -> None:
    """Sets the day's status from its photos. Only a day with the required valid photos is COMPLETED."""
    if not activity.photos:
        return  # Legacy / manually recorded day: status is set directly
    counts = photo_counts(activity)
    if counts["valid"] >= counts["required"]:
        if activity.status != ActivityStatus.COMPLETED:
            activity.approved_at = datetime.utcnow()
        activity.status = ActivityStatus.COMPLETED
        activity.photo_status = PhotoStatus.APPROVED
        activity.rejection_reason = None
        activity.excuse_reason = None
        return
    activity.approved_at = None
    if activity.status == ActivityStatus.EXCUSED:
        return  # Still excused: the photos don't make up a full day
    if counts["pending"]:
        activity.status, activity.photo_status = ActivityStatus.SUBMITTED, PhotoStatus.PENDING
    elif counts["valid"]:
        activity.status, activity.photo_status = ActivityStatus.INCOMPLETE, PhotoStatus.PARTIAL
    else:
        activity.status, activity.photo_status = ActivityStatus.REJECTED, PhotoStatus.REJECTED
    latest_rejected = next((p for p in reversed(activity.photos) if p.status == PhotoStatus.REJECTED), None)
    activity.rejection_reason = latest_rejected.rejection_reason if latest_rejected and not counts["pending"] else None


def _adopt_legacy_photo(db: Session, activity: CampaignDailyActivity) -> None:
    """Turns a legacy single-photo day into a per-photo record before adding more photos."""
    if activity.photos or not activity.photo_url or activity.photo_status not in (PhotoStatus.PENDING, PhotoStatus.REJECTED):
        return
    activity.photos.append(
        CampaignActivityPhoto(
            campaign_id=activity.campaign_id,
            rider_id=activity.rider_id,
            photo_url=activity.photo_url,
            status=activity.photo_status,
            rejection_reason=activity.rejection_reason,
            uploaded_at=activity.submitted_at or datetime.utcnow(),
        )
    )
    db.flush()


def check_photo_upload(db: Session, assignment: CampaignAssignment, content_hash: Optional[str], slot: Optional[str] = None) -> str:
    """Raises CampaignError if the rider can't add this photo today, otherwise returns the slot it
    goes into (the requested slot, or the first open one for older clients). Call before storing the file."""
    today = today_ist()
    campaign = sync_campaign_status(db, assignment.campaign, today)
    if assignment.status != AssignmentStatus.ACTIVE:
        raise CampaignError("You can only submit proof for a campaign you are active in.")
    if not is_running(campaign, today):
        raise CampaignError("This campaign is not accepting proof today.")
    if target_reached(db, campaign):
        raise CampaignError("Campaign target reached. No more proof is needed for this campaign.")

    activity = (
        db.query(CampaignDailyActivity)
        .filter(CampaignDailyActivity.assignment_id == assignment.id, CampaignDailyActivity.activity_date == today)
        .first()
    )
    required = photos_required()
    if activity:
        if activity.status == ActivityStatus.EXCUSED:
            raise CampaignError("Today is marked as an excused absence.")
        counts = photo_counts(activity)
        if counts["valid"] >= required:
            raise CampaignError(f"Today's {required} photos are already approved. See you tomorrow!")
        if activity.photos and counts["valid"] + counts["pending"] >= required:
            raise CampaignError(f"You've uploaded {required} photos for today. Wait for review; rejected photos can be replaced.")
    view = slot_view(activity)
    open_slots = [s for s in PhotoSlot.ALL if slot_status(view[s]) in ("NOT_STARTED", PhotoStatus.REJECTED)]
    if slot is None:
        if not open_slots:
            raise CampaignError("All of today's photo slots are taken.")
        slot = open_slots[0]
    slot = slot.upper()
    if slot not in PhotoSlot.ALL:
        raise CampaignError("Choose the Morning, Evening or Night photo slot.")
    if slot not in open_slots:
        state = "approved" if slot_status(view[slot]) == PhotoStatus.APPROVED else "waiting for review"
        raise CampaignError(f"Today's {PhotoSlot.LABELS[slot]} photo is already {state}.")
    if settings.ENFORCE_PHOTO_SLOT_WINDOWS:
        start, end = slot_windows(campaign)[slot]
        now = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%H:%M")
        if not (start <= now <= end):
            raise CampaignError(f"{PhotoSlot.LABELS[slot]} photos can be taken between {start} and {end}.")
    if content_hash:
        duplicate = (
            db.query(CampaignActivityPhoto.id)
            .filter(
                CampaignActivityPhoto.campaign_id == campaign.id,
                CampaignActivityPhoto.rider_id == assignment.rider_id,
                CampaignActivityPhoto.content_hash == content_hash,
            )
            .first()
        )
        if duplicate:
            raise CampaignError("This photo has already been uploaded. Please take a new photo.")
    return slot


def submit_activity(
    db: Session, assignment: CampaignAssignment, photo_url: str, content_hash: Optional[str] = None, slot: Optional[str] = None
) -> CampaignDailyActivity:
    """Adds today's photo for one slot. The day completes once all three slots are approved."""
    slot = check_photo_upload(db, assignment, content_hash, slot)
    today = today_ist()
    activity = (
        db.query(CampaignDailyActivity)
        .filter(CampaignDailyActivity.assignment_id == assignment.id, CampaignDailyActivity.activity_date == today)
        .first()
    )
    if not activity:
        activity = CampaignDailyActivity(
            campaign_id=assignment.campaign_id,
            rider_id=assignment.rider_id,
            assignment_id=assignment.id,
            activity_date=today,
            status=ActivityStatus.SUBMITTED,
            photo_status=PhotoStatus.PENDING,
        )
        db.add(activity)
        db.flush()
    else:
        _adopt_legacy_photo(db, activity)

    activity.photos.append(
        CampaignActivityPhoto(
            campaign_id=assignment.campaign_id,
            rider_id=assignment.rider_id,
            photo_url=photo_url,
            content_hash=content_hash,
            status=PhotoStatus.PENDING,
            slot=slot,
        )
    )
    activity.photo_url = photo_url  # Latest photo, kept for older clients
    activity.submitted_at = datetime.utcnow()
    derive_day_status(activity)
    db.commit()
    db.refresh(activity)
    return activity


def _after_day_change(db: Session, activity: CampaignDailyActivity, old_status: Optional[str], old_earned: Optional[float], reason: Optional[str], admin: User) -> None:
    """Recalculates payouts and records the change whenever a day's delivered status moves."""
    db.commit()
    if old_status != activity.status:
        fs.recalculate_campaign_payouts(db, activity.assignment.campaign)
        db.refresh(activity)
        _log_change(db, activity, old_status, old_earned, reason, admin)
        if activity.status == ActivityStatus.COMPLETED:
            # Refer & Earn: a referred rider's first completed Photo Streak credits their referrer (once).
            from app.services import referral_service

            referral_service.on_photo_day_completed(db, activity.rider_id, activity.id)


def review_photo(db: Session, photo: CampaignActivityPhoto, admin: User, approve: bool, reason: Optional[str] = None) -> CampaignActivityPhoto:
    """Approves or rejects one photo, then re-derives the day (and its streak / payout) from all its photos."""
    activity = photo.activity
    if not approve and photo.status == PhotoStatus.APPROVED and not (reason or "").strip():
        raise CampaignError("A reason is required to reject a photo that was already approved.")
    if approve and photo.status == PhotoStatus.REJECTED and photo.slot:
        retaken = [p for p in activity.photos if p.slot == photo.slot and p.id != photo.id and p.status != PhotoStatus.REJECTED]
        if retaken:
            raise CampaignError(f"The rider has already retaken the {PhotoSlot.LABELS[photo.slot]} photo. Review the new one instead.")
    old_status, old_earned = activity.status, activity.earned_amount
    photo.status = PhotoStatus.APPROVED if approve else PhotoStatus.REJECTED
    photo.rejection_reason = None if approve else (reason or "Photo does not meet the campaign requirements")
    photo.reviewed_at = datetime.utcnow()
    photo.reviewed_by_id = admin.id
    activity.reviewed_by_id = admin.id
    derive_day_status(activity)
    counts = photo_counts(activity)
    change_reason = f"Photo {'approved' if approve else 'rejected: ' + photo.rejection_reason} ({counts['valid']}/{counts['required']} valid)"
    _after_day_change(db, activity, old_status, old_earned, change_reason, admin)

    rider, campaign = activity.assignment.rider, activity.assignment.campaign
    day = activity.activity_date.strftime("%d %b")
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_PHOTO_APPROVED" if approve else "CAMPAIGN_PHOTO_REJECTED",
        target_type="CAMPAIGN",
        target_id=str(campaign.id),
        details=f"{rider.rider_id} photo for {day}: {'approved' if approve else photo.rejection_reason} ({counts['valid']}/{counts['required']})",
    )
    if not approve and rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="Campaign photo rejected",
            message=f"A photo for {day} in {campaign.name} was rejected. Reason: {photo.rejection_reason}",
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
    db.refresh(photo)
    return photo


def review_activity(db: Session, activity: CampaignDailyActivity, admin: User, approve: bool, reason: Optional[str] = None) -> CampaignDailyActivity:
    """Reviews a whole day. With per-photo proofs, approving approves every pending photo and
    rejecting rejects every photo; the day still completes only with the required valid photos."""
    assignment = activity.assignment
    was_approved = activity.status == ActivityStatus.COMPLETED
    if not approve and was_approved and not (reason or "").strip():
        raise CampaignError("A reason is required to reject a day that was already approved.")
    old_status, old_earned = activity.status, activity.earned_amount
    now = datetime.utcnow()
    if activity.photos:
        for photo in activity.photos:
            if approve and photo.status == PhotoStatus.PENDING:
                photo.status, photo.rejection_reason = PhotoStatus.APPROVED, None
            elif not approve and photo.status != PhotoStatus.REJECTED:
                photo.status = PhotoStatus.REJECTED
                photo.rejection_reason = reason or "Proof does not meet the campaign requirements"
            else:
                continue
            photo.reviewed_at, photo.reviewed_by_id = now, admin.id
        derive_day_status(activity)
        if not approve:
            activity.rejection_reason = reason or "Proof does not meet the campaign requirements"
    elif approve:
        activity.status = ActivityStatus.COMPLETED
        activity.photo_status = PhotoStatus.APPROVED
        activity.approved_at = now
        activity.rejection_reason = None
        activity.excuse_reason = None
    else:
        activity.status = ActivityStatus.REJECTED
        activity.photo_status = PhotoStatus.REJECTED
        activity.approved_at = None
        activity.rejection_reason = reason or "Proof does not meet the campaign requirements"
    activity.reviewed_by_id = admin.id
    _after_day_change(db, activity, old_status, old_earned, reason or ("Approved" if approve else None), admin)
    db.refresh(activity)

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


def excuse_day(db: Session, assignment: CampaignAssignment, day: date, reason: str, admin: User) -> CampaignDailyActivity:
    """Approved absence (e.g. medical): not delivered, not paid, and not counted against the rider."""
    campaign = assignment.campaign
    if not (reason or "").strip():
        raise CampaignError("Please give a reason for the excused absence.")
    start, end = fs.rider_window(campaign, assignment)
    if not (start <= day <= end) or not fs.is_eligible_date(campaign, day):
        raise CampaignError("That date is outside this rider's campaign period.")
    if day > today_ist():
        raise CampaignError("Only past or current days can be excused.")

    activity = (
        db.query(CampaignDailyActivity)
        .filter(CampaignDailyActivity.assignment_id == assignment.id, CampaignDailyActivity.activity_date == day)
        .first()
    )
    old_status, old_earned = (activity.status, activity.earned_amount) if activity else (None, None)
    if not activity:
        activity = CampaignDailyActivity(
            campaign_id=campaign.id, rider_id=assignment.rider_id, assignment_id=assignment.id, activity_date=day
        )
        db.add(activity)
    activity.status = ActivityStatus.EXCUSED
    activity.photo_status = PhotoStatus.NONE
    activity.approved_at = None
    activity.excuse_reason = reason.strip()
    activity.reviewed_by_id = admin.id
    db.commit()
    fs.recalculate_campaign_payouts(db, campaign)
    db.refresh(activity)
    _log_change(db, activity, old_status, old_earned, f"Excused: {reason.strip()}", admin)
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_DAY_EXCUSED",
        target_type="CAMPAIGN",
        target_id=str(campaign.id),
        details=f"{assignment.rider.rider_id} excused for {day:%d %b}: {reason.strip()}",
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
    payment.campaign_id = campaign.id
    # Paid days stay in the contract even if an earlier-dated day is approved later.
    for activity in payout.assignment.activities:
        if activity.earned_amount > 0:
            activity.payout_locked = True
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
    # The brand's commitment is fixed from here on: required riders × contract days.
    campaign.contracted_rider_days = campaign.total_slots * fs.contract_days(campaign)
    db.commit()
    sync_campaign_status(db, campaign)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_PUBLISHED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} published")
    return campaign


def unpublish_campaign(db: Session, campaign: Campaign, admin: User) -> Campaign:
    """Back to draft, only while no rider has requested or joined, so nothing depends on the commitment yet."""
    if campaign.status not in CampaignStatus.PUBLISHED and campaign.status != CampaignStatus.PAUSED:
        raise CampaignError("Only published or paused campaigns can be unpublished.")
    if db.query(CampaignApplication.id).filter(CampaignApplication.campaign_id == campaign.id).first():
        raise CampaignError("Riders have already requested to join this campaign. Pause or cancel it instead.")
    campaign.status = CampaignStatus.DRAFT
    campaign.visibility = CampaignVisibility.DRAFT
    campaign.published_at = None
    campaign.contracted_rider_days = None  # Recalculated when it is published again
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_UNPUBLISHED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} moved back to draft")
    return campaign


# join_eligibility speaks to the rider; reword for the admin.
_ADMIN_JOIN_MESSAGES = {
    "You're already part of this campaign.": "This rider is already part of this campaign.",
    "You are already assigned to an active campaign.": "This rider is already assigned to another active campaign.",
    "You already have a pending request for another campaign.": "This rider has a pending request for another campaign.",
    "Your rider account must be approved before you can join campaigns.": "Only approved riders can be added to campaigns.",
}


def admin_add_rider(
    db: Session, campaign: Campaign, rider: Rider, admin: User, tshirt_size: Optional[str] = None,
    replacement_for_assignment_id: Optional[int] = None, pickup_location_id: Optional[int] = None,
    kit_collected: bool = False,
) -> CampaignAssignment:
    """Admin adds a rider directly: the same checks as a join request, then approval in one step."""
    sync_campaign_status(db, campaign)
    if rider.archived_at:
        raise CampaignError("Archived riders can't be added to campaigns.")
    pending = pending_application(db, rider.id)
    if pending and pending.campaign_id == campaign.id:
        application = pending
    else:
        can_join, reason = join_eligibility(db, campaign, rider, by_admin=True)
        if not can_join:
            raise CampaignError(_ADMIN_JOIN_MESSAGES.get(reason, reason))
        size, location_id = _kit_choice(db, campaign, tshirt_size, pickup_location_id)
        application = CampaignApplication(
            campaign_id=campaign.id, rider_id=rider.id, status=ApplicationStatus.REQUESTED,
            tshirt_size=size, pickup_location_id=location_id, kit_status=ks.initial_request_kit_status(campaign),
        )
        db.add(application)
        db.commit()
    # Adding directly still needs the T-shirt handed over first, just like approving a request.
    if ks.kit_required(campaign) and ks.request_kit_status(application) != KitStatus.COLLECTED:
        if not kit_collected:
            raise CampaignError("Confirm the rider has collected their T-shirt before adding them.")
        mark_request_kit(db, application, admin, True)
    return approve_application(db, application, admin, replacement_for_assignment_id)


def mark_request_kit(db: Session, application: CampaignApplication, admin: User, collected: bool, tshirt_size: Optional[str] = None) -> CampaignApplication:
    """Admin confirms (or undoes) that the requester collected their T-shirt, with an audit entry."""
    try:
        previous = ks.set_request_kit(db, application, admin.id, collected, tshirt_size)
    except ks.KitError as e:
        raise CampaignError(str(e))
    rider, campaign = application.rider, application.campaign
    new = KitStatus.COLLECTED if collected else KitStatus.PENDING
    log_admin_action(
        db=db,
        admin_user=admin,
        action="CAMPAIGN_REQUEST_TSHIRT_COLLECTED" if collected else "CAMPAIGN_REQUEST_TSHIRT_PENDING",
        target_type="CAMPAIGN",
        target_id=str(campaign.id),
        details=(
            f"Join request #{application.id}: {rider.full_name} ({rider.rider_id}) for {campaign.name}. "
            f"T-shirt: {KitStatus.LABELS[previous]} → {KitStatus.LABELS[new]} (size {application.tshirt_size or '-'})"
        ),
    )
    if collected and rider.user_id:
        send_notification(
            db=db,
            user_id=rider.user_id,
            title="T-shirt collected",
            message=f"Your {campaign.name} T-shirt has been marked as collected. Your request is now with the team for approval.",
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
    db.refresh(application)
    return application


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

    # Final payout calculation for every rider who took part, then the immutable summary.
    fs.recalculate_campaign_payouts(db, campaign)
    fs.create_snapshot(db, campaign)

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

def rider_progress(assignment: CampaignAssignment, today: Optional[date] = None, accepting: bool = True) -> dict:
    """Day-by-day timeline plus streaks and earnings for one rider in one campaign.

    `accepting` is False once the campaign target is reached and it doesn't continue past it.
    """
    today = today or today_ist()
    campaign = assignment.campaign
    by_date = {a.activity_date: a for a in assignment.activities}
    window_start, window_end = fs.rider_window(campaign, assignment)
    window_end = min(window_end, today)

    days = []
    current = window_start
    while current <= window_end:
        if not fs.is_eligible_date(campaign, current):
            current += timedelta(days=1)
            continue
        activity = by_date.get(current)
        if activity:
            status = activity.status
        elif current == today and assignment.status == AssignmentStatus.ACTIVE and accepting:
            status = "DUE"
        else:
            status = "MISSED"
        approved = bool(activity and activity.photo_status == PhotoStatus.APPROVED)
        counts = photo_counts(activity)
        days.append(
            {
                "date": current.isoformat(),
                "day_number": (current - campaign.start_date).days + 1,
                "period": fs.period_of(campaign, current),
                "status": status,
                "earned": activity.earned_amount if activity else 0.0,
                # Approved but not paid: delivered beyond the contract with surplus payout switched off.
                "unpaid_surplus": approved and (activity.earned_amount or 0) == 0,
                "activity_id": activity.id if activity else None,
                "photo_url": activity.photo_url if activity else None,
                "photo_status": activity.photo_status if activity else None,
                "rejection_reason": activity.rejection_reason if activity else None,
                "excuse_reason": activity.excuse_reason if activity else None,
                "submitted_at": activity.submitted_at.isoformat() if activity and activity.submitted_at else None,
                "photos_required": counts["required"],
                "photos_valid": counts["valid"],
                "photos_pending": counts["pending"],
                "photos_rejected": counts["rejected"],
                "photos": [
                    {"id": p.id, "photo_url": p.photo_url, "status": p.status, "rejection_reason": p.rejection_reason, "slot": p.slot}
                    for p in (activity.photos if activity else [])
                ],
                "slots": slot_rows(activity, campaign),
            }
        )
        current += timedelta(days=1)

    # Photo Streaks: a day counts only when it has the required valid photos (status COMPLETED).
    # Today stays open until it completes, and days still awaiting review neither break nor extend
    # the current streak yet. Excused days are skipped: not delivered, but not a failure either.
    today_iso = today.isoformat()
    streak_days = [d for d in reversed(days) if d["status"] != ActivityStatus.EXCUSED]
    while streak_days and streak_days[0]["status"] != ActivityStatus.COMPLETED and (
        streak_days[0]["date"] == today_iso or streak_days[0]["status"] == ActivityStatus.SUBMITTED
    ):
        streak_days = streak_days[1:]
    current_streak = 0
    for day in streak_days:
        if day["status"] != ActivityStatus.COMPLETED:
            break
        current_streak += 1
    # The day that broke the streak (the most recent closed day that wasn't completed).
    streak_broken_on = streak_days[current_streak]["date"] if len(streak_days) > current_streak else None

    longest_streak = run = 0
    for day in days:
        if day["status"] == ActivityStatus.EXCUSED:
            continue
        run = run + 1 if day["status"] == ActivityStatus.COMPLETED else 0
        longest_streak = max(longest_streak, run)

    completed_days = sum(1 for d in days if d["status"] == ActivityStatus.COMPLETED)
    closed_days = sum(
        1 for d in days
        if d["status"] != ActivityStatus.EXCUSED and (d["date"] < today_iso or d["status"] == ActivityStatus.COMPLETED)
    )
    missed_days = sum(
        1 for d in days
        if d["date"] < today_iso and d["status"] in ("MISSED", ActivityStatus.REJECTED, ActivityStatus.INCOMPLETE)
    )
    today_entry = next((d for d in days if d["date"] == today_iso), None)
    today_activity = by_date.get(today)
    today_counts = photo_counts(today_activity)

    payout = assignment.payout
    earned = payout.total_amount if payout else 0.0
    paid = payout.paid_amount if payout else 0.0
    end = fs.effective_end_date(campaign)
    total_days = fs.days_between(campaign.start_date, campaign.end_date)
    if today < campaign.start_date:
        remaining_days = fs.days_between(campaign.start_date, end)
    else:
        remaining_days = max((end - today).days, 0)
    performance = fs.rider_performance(campaign, assignment, today)

    return {
        "days": days,
        "total_campaign_days": total_days,
        "eligible_days": len([d for d in days if d["status"] != ActivityStatus.EXCUSED]),
        "completed_days": completed_days,
        "missed_days": missed_days,
        "excused_days": sum(1 for d in days if d["status"] == ActivityStatus.EXCUSED),
        "pending_review_days": sum(1 for d in days if d["status"] == ActivityStatus.SUBMITTED),
        "remaining_days": remaining_days,
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_photo_streak_days": completed_days,
        "streak_broken": current_streak == 0 and streak_broken_on is not None,
        "streak_broken_on": streak_broken_on,
        "photos_required": photos_required(),
        "today_photos": {
            "date": today_iso,
            "in_window": today_entry is not None,
            **today_counts,
            "completed": today_counts["valid"] >= today_counts["required"],
            "slots": slot_rows(today_activity, campaign),
            "windows_enforced": settings.ENFORCE_PHOTO_SLOT_WINDOWS,
        },
        "completion_pct": round(completed_days / closed_days * 100, 1) if closed_days else None,
        "photos_submitted": sum(photo_counts(a)["uploaded"] for a in assignment.activities),
        "photos_approved": sum(photo_counts(a)["valid"] for a in assignment.activities),
        "daily_rate": assignment.daily_rate,
        "earned": earned,
        "paid": paid,
        "pending": round(max(earned - paid, 0), 2),
        "overpaid": round(max(paid - earned, 0), 2),
        "remaining_potential": round(remaining_days * assignment.daily_rate, 2) if assignment.status in AssignmentStatus.CURRENT else 0.0,
        "payout_status": payout.status if payout else PayoutStatus.PENDING,
        "target_days": performance["target_days"],
        "remaining_target_days": max(performance["target_days"] - completed_days, 0),
        "behind_target": performance["behind_target"],
        "inactive": performance["inactive"],
        "rider_status": (
            "ENDED" if assignment.status not in AssignmentStatus.CURRENT
            else "INACTIVE" if performance["inactive"]
            else "AT_RISK" if performance["behind_target"]
            else "ACTIVE"
        ),
        "target_reached": not accepting,
        "can_submit_today": assignment.status == AssignmentStatus.ACTIVE
        and accepting
        and is_running(campaign, today)
        and (today_activity is None or today_activity.status != ActivityStatus.EXCUSED)
        and today_counts["valid"] < today_counts["required"]
        and (not (today_activity and today_activity.photos) or today_counts["valid"] + today_counts["pending"] < today_counts["required"]),
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
    # Individual photos awaiting review, plus legacy single-photo days.
    pending_photos = (
        db.query(func.count(CampaignActivityPhoto.id))
        .filter(CampaignActivityPhoto.campaign_id == campaign.id, CampaignActivityPhoto.status == PhotoStatus.PENDING)
        .scalar()
    ) + (
        db.query(func.count(CampaignDailyActivity.id))
        .filter(
            CampaignDailyActivity.campaign_id == campaign.id,
            CampaignDailyActivity.photo_status == PhotoStatus.PENDING,
            ~CampaignDailyActivity.photos.any(),
        )
        .scalar()
    )
    capacity = slot_capacity(campaign)
    return {
        "total_slots": campaign.total_slots,
        "slot_capacity": capacity,
        "assigned_riders": used,
        "remaining_slots": max(capacity - used, 0),
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
