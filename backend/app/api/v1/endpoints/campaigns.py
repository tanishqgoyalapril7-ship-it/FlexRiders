import csv
import io
import os
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_rider
from app.core.config import settings
from app.core.database import get_db
from app.models.all_models import Brand, Rider, User
from app.models.campaign_models import (
    ApplicationStatus,
    AssignmentStatus,
    Campaign,
    CampaignApplication,
    CampaignAssignment,
    CampaignDailyActivity,
    CampaignPayout,
    CampaignStatus,
    CampaignVisibility,
    PhotoStatus,
)
from app.schemas.campaign_schemas import CampaignCreate, CampaignUpdate, ReasonRequest
from app.services import campaign_service as svc
from app.services.audit_service import log_admin_action

# Admin routes, mounted at /campaigns
router = APIRouter()
# Rider routes, mounted at /riders/me/campaigns
rider_router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(action):
    """Runs a service call, turning business-rule violations into 400 responses."""
    try:
        return action()
    except svc.CampaignError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _save_image(upload: UploadFile, folder: str) -> str:
    extension = ALLOWED_IMAGE_TYPES.get(upload.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Please upload a JPG, PNG, WEBP or HEIC image.")
    content = await upload.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image must be 8 MB or smaller.")
    directory = os.path.join(settings.UPLOAD_DIR, folder)
    os.makedirs(directory, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{extension}"
    with open(os.path.join(directory, filename), "wb") as f:
        f.write(content)
    return f"/uploads/{folder}/{filename}"


def _get_campaign(db: Session, campaign_id: int) -> Campaign:
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return svc.sync_campaign_status(db, campaign)


def _rider_brief(rider: Rider) -> dict:
    return {
        "id": rider.id,
        "rider_id": rider.rider_id,
        "full_name": rider.full_name,
        "mobile_number": rider.mobile_number,
        "status": rider.status,
        "upi_id": rider.upi_id,
    }


def _campaign_dict(db: Session, campaign: Campaign, with_stats: bool = True) -> dict:
    data = {
        "id": campaign.id,
        "name": campaign.name,
        "brand_id": campaign.brand_id,
        "brand_name": campaign.brand.name if campaign.brand else None,
        "description": campaign.description,
        "rules": [line.strip() for line in (campaign.rules or "").splitlines() if line.strip()],
        "rules_text": campaign.rules or "",
        "image_url": campaign.image_url,
        "start_date": campaign.start_date.isoformat(),
        "end_date": campaign.end_date.isoformat(),
        "total_slots": campaign.total_slots,
        "daily_rate": campaign.daily_rate,
        "status": campaign.status,
        "visibility": campaign.visibility,
        "published_at": campaign.published_at,
        "completed_at": campaign.completed_at,
        "cancelled_at": campaign.cancelled_at,
        "created_at": campaign.created_at,
        "updated_at": campaign.updated_at,
    }
    if with_stats:
        data["stats"] = svc.campaign_stats(db, campaign)
    return data


def _assignment_row(assignment: CampaignAssignment) -> dict:
    progress = svc.rider_progress(assignment)
    return {
        "assignment_id": assignment.id,
        "rider": _rider_brief(assignment.rider),
        "status": assignment.status,
        "joined_at": assignment.assigned_at,
        "ended_at": assignment.ended_at,
        "removal_reason": assignment.removal_reason,
        "payout_id": assignment.payout.id if assignment.payout else None,
        **{k: v for k, v in progress.items() if k != "days"},
    }


def _activity_dict(activity: CampaignDailyActivity) -> dict:
    return {
        "id": activity.id,
        "assignment_id": activity.assignment_id,
        "rider": _rider_brief(activity.rider),
        "date": activity.activity_date.isoformat(),
        "status": activity.status,
        "photo_url": activity.photo_url,
        "photo_status": activity.photo_status,
        "rejection_reason": activity.rejection_reason,
        "earned_amount": activity.earned_amount,
        "submitted_at": activity.submitted_at,
        "approved_at": activity.approved_at,
    }


def _payout_dict(payout: CampaignPayout) -> dict:
    return {
        "id": payout.id,
        "assignment_id": payout.assignment_id,
        "rider": _rider_brief(payout.rider),
        "assignment_status": payout.assignment.status,
        "eligible_days": payout.eligible_days,
        "daily_rate": payout.daily_rate,
        "total_amount": payout.total_amount,
        "paid_amount": payout.paid_amount,
        "pending_amount": round(payout.total_amount - payout.paid_amount, 2),
        "status": payout.status,
        "approved_at": payout.approved_at,
        "paid_at": payout.paid_at,
        "payment_id": payout.payment_id,
    }


# ---------------------------------------------------------------------------
# Admin: campaigns
# ---------------------------------------------------------------------------

@router.get("")
def list_campaigns(
    search: Optional[str] = None,
    status: Optional[str] = None,
    brand_id: Optional[int] = None,
    start_from: Optional[date] = None,
    end_to: Optional[date] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    query = db.query(Campaign).join(Brand, Campaign.brand_id == Brand.id)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(Campaign.name.ilike(term), Brand.name.ilike(term)))
    if brand_id:
        query = query.filter(Campaign.brand_id == brand_id)
    if start_from:
        query = query.filter(Campaign.start_date >= start_from)
    if end_to:
        query = query.filter(Campaign.end_date <= end_to)
    campaigns = [svc.sync_campaign_status(db, c) for c in query.order_by(Campaign.start_date.desc(), Campaign.id.desc()).all()]
    if status and status != "ALL":
        campaigns = [c for c in campaigns if c.status == status]
    return [_campaign_dict(db, c) for c in campaigns]


@router.get("/summary")
def campaign_summary(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Campaign figures for the admin dashboard overview card."""
    campaigns = [svc.sync_campaign_status(db, c) for c in db.query(Campaign).all()]
    counts = {}
    for c in campaigns:
        counts[c.status] = counts.get(c.status, 0) + 1
    assigned = (
        db.query(func.count(CampaignAssignment.id))
        .filter(CampaignAssignment.status.in_(AssignmentStatus.CURRENT))
        .scalar()
    )
    generated, paid = db.query(
        func.coalesce(func.sum(CampaignPayout.total_amount), 0.0),
        func.coalesce(func.sum(CampaignPayout.paid_amount), 0.0),
    ).one()
    requests = (
        db.query(func.count(CampaignApplication.id))
        .filter(CampaignApplication.status == ApplicationStatus.REQUESTED)
        .scalar()
    )
    return {
        "total_campaigns": len(campaigns),
        "active_campaigns": counts.get(CampaignStatus.ACTIVE, 0),
        "open_campaigns": counts.get(CampaignStatus.OPEN, 0),
        "full_campaigns": counts.get(CampaignStatus.FULL, 0),
        "draft_campaigns": counts.get(CampaignStatus.DRAFT, 0),
        "total_assigned_riders": assigned,
        "pending_requests": requests,
        "total_campaign_payout": round(float(generated), 2),
        "total_campaign_paid": round(float(paid), 2),
    }


@router.post("")
def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if not db.query(Brand).filter(Brand.id == payload.brand_id).first():
        raise HTTPException(status_code=400, detail="Selected brand does not exist")
    campaign = Campaign(
        **payload.model_dump(exclude={"visibility"}),
        status=CampaignStatus.DRAFT,
        visibility=CampaignVisibility.DRAFT,
        created_by_id=admin.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_CREATED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} created")
    if payload.visibility == CampaignVisibility.PUBLIC:
        _run(lambda: svc.publish_campaign(db, campaign, admin))
    return _campaign_dict(db, campaign)


@router.get("/{campaign_id}")
def get_campaign(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return _campaign_dict(db, _get_campaign(db, campaign_id))


@router.put("/{campaign_id}")
def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    campaign = _get_campaign(db, campaign_id)
    if campaign.status in CampaignStatus.CLOSED:
        raise HTTPException(status_code=400, detail="Completed or cancelled campaigns cannot be edited.")
    if payload.total_slots < svc.slots_used(db, campaign.id):
        raise HTTPException(status_code=400, detail="Total slots cannot be lower than the number of approved riders.")
    if not db.query(Brand).filter(Brand.id == payload.brand_id).first():
        raise HTTPException(status_code=400, detail="Selected brand does not exist")
    for field, value in payload.model_dump().items():
        setattr(campaign, field, value)
    db.commit()
    svc.sync_campaign_status(db, campaign)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_UPDATED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"{campaign.name} updated")
    return _campaign_dict(db, campaign)


@router.post("/{campaign_id}/image")
async def upload_campaign_image(
    campaign_id: int,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    campaign = _get_campaign(db, campaign_id)
    campaign.image_url = await _save_image(image, "campaigns")
    db.commit()
    return _campaign_dict(db, campaign)


@router.post("/{campaign_id}/{action}")
def change_campaign_status(
    campaign_id: int,
    action: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    actions = {
        "publish": svc.publish_campaign,
        "pause": svc.pause_campaign,
        "resume": svc.resume_campaign,
        "complete": svc.complete_campaign,
        "cancel": svc.cancel_campaign,
    }
    if action not in actions:
        raise HTTPException(status_code=404, detail="Unknown campaign action")
    campaign = _get_campaign(db, campaign_id)
    _run(lambda: actions[action](db, campaign, admin))
    return _campaign_dict(db, campaign)


# ---------------------------------------------------------------------------
# Admin: join requests
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}/applications")
def list_applications(
    campaign_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    _get_campaign(db, campaign_id)
    query = db.query(CampaignApplication).filter(CampaignApplication.campaign_id == campaign_id)
    if status and status != "ALL":
        query = query.filter(CampaignApplication.status == status)
    result = []
    for a in query.order_by(CampaignApplication.requested_at.desc()).all():
        busy = svc.current_assignment(db, a.rider_id)
        result.append(
            {
                "id": a.id,
                "rider": _rider_brief(a.rider),
                "status": a.status,
                "requested_at": a.requested_at,
                "approved_at": a.approved_at,
                "rejected_at": a.rejected_at,
                "rejection_reason": a.rejection_reason,
                "rider_busy_in_campaign": busy.campaign.name if busy and busy.campaign_id != campaign_id else None,
            }
        )
    return result


def _get_application(db: Session, campaign_id: int, application_id: int) -> CampaignApplication:
    application = (
        db.query(CampaignApplication)
        .filter(CampaignApplication.id == application_id, CampaignApplication.campaign_id == campaign_id)
        .first()
    )
    if not application:
        raise HTTPException(status_code=404, detail="Request not found")
    return application


@router.post("/{campaign_id}/applications/{application_id}/approve")
def approve_application(campaign_id: int, application_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    application = _get_application(db, campaign_id, application_id)
    _run(lambda: svc.approve_application(db, application, admin))
    return _campaign_dict(db, _get_campaign(db, campaign_id))


@router.post("/{campaign_id}/applications/{application_id}/reject")
def reject_application(
    campaign_id: int,
    application_id: int,
    payload: ReasonRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    application = _get_application(db, campaign_id, application_id)
    _run(lambda: svc.reject_application(db, application, admin, payload.reason))
    return {"success": True}


# ---------------------------------------------------------------------------
# Admin: riders, activity, photos, payouts
# ---------------------------------------------------------------------------

def _get_assignment(db: Session, campaign_id: int, assignment_id: int) -> CampaignAssignment:
    assignment = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.id == assignment_id, CampaignAssignment.campaign_id == campaign_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Campaign rider not found")
    return assignment


@router.get("/{campaign_id}/riders")
def list_campaign_riders(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    _get_campaign(db, campaign_id)
    assignments = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.campaign_id == campaign_id)
        .order_by(CampaignAssignment.assigned_at.desc())
        .all()
    )
    return [_assignment_row(a) for a in assignments]


@router.get("/{campaign_id}/riders/{assignment_id}/activity")
def rider_activity(campaign_id: int, assignment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    assignment = _get_assignment(db, campaign_id, assignment_id)
    return {**_assignment_row(assignment), "days": svc.rider_progress(assignment)["days"]}


@router.post("/{campaign_id}/riders/{assignment_id}/remove")
def remove_rider(
    campaign_id: int,
    assignment_id: int,
    payload: ReasonRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    assignment = _get_assignment(db, campaign_id, assignment_id)
    _run(lambda: svc.remove_assignment(db, assignment, admin, payload.reason))
    return _campaign_dict(db, _get_campaign(db, campaign_id))


@router.get("/{campaign_id}/photos")
def list_photos(
    campaign_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    _get_campaign(db, campaign_id)
    query = db.query(CampaignDailyActivity).filter(CampaignDailyActivity.campaign_id == campaign_id)
    if status and status != "ALL":
        query = query.filter(CampaignDailyActivity.photo_status == status)
    activities = query.order_by(CampaignDailyActivity.activity_date.desc(), CampaignDailyActivity.id.desc()).all()
    return [_activity_dict(a) for a in activities]


def _get_activity(db: Session, campaign_id: int, activity_id: int) -> CampaignDailyActivity:
    activity = (
        db.query(CampaignDailyActivity)
        .filter(CampaignDailyActivity.id == activity_id, CampaignDailyActivity.campaign_id == campaign_id)
        .first()
    )
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


@router.post("/{campaign_id}/activities/{activity_id}/approve")
def approve_activity(campaign_id: int, activity_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    activity = _get_activity(db, campaign_id, activity_id)
    return _activity_dict(_run(lambda: svc.review_activity(db, activity, admin, approve=True)))


@router.post("/{campaign_id}/activities/{activity_id}/reject")
def reject_activity(
    campaign_id: int,
    activity_id: int,
    payload: ReasonRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    activity = _get_activity(db, campaign_id, activity_id)
    return _activity_dict(_run(lambda: svc.review_activity(db, activity, admin, approve=False, reason=payload.reason)))


@router.get("/{campaign_id}/payouts")
def list_payouts(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    _get_campaign(db, campaign_id)
    payouts = db.query(CampaignPayout).filter(CampaignPayout.campaign_id == campaign_id).order_by(CampaignPayout.id).all()
    return [_payout_dict(p) for p in payouts]


def _get_payout(db: Session, campaign_id: int, payout_id: int) -> CampaignPayout:
    payout = db.query(CampaignPayout).filter(CampaignPayout.id == payout_id, CampaignPayout.campaign_id == campaign_id).first()
    if not payout:
        raise HTTPException(status_code=404, detail="Payout not found")
    return payout


@router.post("/{campaign_id}/payouts/{payout_id}/approve")
def approve_payout(campaign_id: int, payout_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    payout = _get_payout(db, campaign_id, payout_id)
    return _payout_dict(_run(lambda: svc.approve_payout(db, payout, admin)))


@router.post("/{campaign_id}/payouts/{payout_id}/pay")
def pay_payout(campaign_id: int, payout_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    payout = _get_payout(db, campaign_id, payout_id)
    return _payout_dict(_run(lambda: svc.pay_payout(db, payout, admin)))


@router.get("/{campaign_id}/export")
def export_campaign_report(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    campaign = _get_campaign(db, campaign_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Campaign", campaign.name])
    writer.writerow(["Brand", campaign.brand.name if campaign.brand else ""])
    writer.writerow(["Dates", f"{campaign.start_date} to {campaign.end_date}"])
    writer.writerow(["Status", campaign.status])
    writer.writerow(["Daily Rate (INR)", campaign.daily_rate])
    writer.writerow([])
    writer.writerow([
        "Rider ID", "Rider Name", "Phone", "Status", "Joined", "Days Completed", "Missed Days",
        "Current Streak", "Longest Streak", "Photos Submitted", "Photos Approved",
        "Daily Rate (INR)", "Earned (INR)", "Paid (INR)", "Pending (INR)", "Payout Status",
    ])
    for assignment in db.query(CampaignAssignment).filter(CampaignAssignment.campaign_id == campaign.id).all():
        row = _assignment_row(assignment)
        writer.writerow([
            row["rider"]["rider_id"], row["rider"]["full_name"], row["rider"]["mobile_number"], row["status"],
            assignment.assigned_at.strftime("%Y-%m-%d"), row["completed_days"], row["missed_days"],
            row["current_streak"], row["longest_streak"], row["photos_submitted"], row["photos_approved"],
            row["daily_rate"], row["earned"], row["paid"], row["pending"], row["payout_status"],
        ])
    safe_name = "".join(ch if ch.isalnum() else "_" for ch in campaign.name).strip("_").lower()
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=campaign_{safe_name}_{datetime.utcnow():%Y%m%d}.csv"},
    )


# ---------------------------------------------------------------------------
# Rider app
# ---------------------------------------------------------------------------

def _participation_status(db: Session, campaign: Campaign, rider: Rider) -> Optional[str]:
    assignment = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.rider_id == rider.id)
        .order_by(CampaignAssignment.id.desc())
        .first()
    )
    if assignment:
        return assignment.status
    application = (
        db.query(CampaignApplication)
        .filter(CampaignApplication.campaign_id == campaign.id, CampaignApplication.rider_id == rider.id)
        .order_by(CampaignApplication.id.desc())
        .first()
    )
    return application.status if application else None


def _rider_campaign_card(db: Session, campaign: Campaign, rider: Rider) -> dict:
    can_join, reason = svc.join_eligibility(db, campaign, rider)
    data = _campaign_dict(db, campaign, with_stats=False)
    used = svc.slots_used(db, campaign.id)
    data.update(
        {
            "filled_slots": used,
            "remaining_slots": max(campaign.total_slots - used, 0),
            "my_status": _participation_status(db, campaign, rider),
            "can_join": can_join,
            "join_blocked_reason": reason,
        }
    )
    return data


@rider_router.get("")
def rider_campaigns(rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    today = svc.today_ist()
    public = (
        db.query(Campaign)
        .filter(
            Campaign.visibility == CampaignVisibility.PUBLIC,
            Campaign.status.in_(CampaignStatus.PUBLISHED + (CampaignStatus.PAUSED,)),
            Campaign.end_date >= today,
        )
        .order_by(Campaign.start_date)
        .all()
    )
    public = [svc.sync_campaign_status(db, c, today) for c in public]

    active = svc.current_assignment(db, rider.id)
    active_data = None
    if active:
        svc.sync_campaign_status(db, active.campaign, today)
        progress = svc.rider_progress(active, today)
        active_data = {**_rider_campaign_card(db, active.campaign, rider), "progress": {k: v for k, v in progress.items() if k != "days"}}

    pending = svc.pending_application(db, rider.id)
    past = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.rider_id == rider.id, ~CampaignAssignment.status.in_(AssignmentStatus.CURRENT))
        .order_by(CampaignAssignment.assigned_at.desc())
        .all()
    )
    rejected = (
        db.query(CampaignApplication)
        .filter(CampaignApplication.rider_id == rider.id, CampaignApplication.status == ApplicationStatus.REJECTED)
        .order_by(CampaignApplication.requested_at.desc())
        .all()
    )
    history = [
        {
            **_campaign_dict(db, a.campaign, with_stats=False),
            "my_status": a.status,
            "earned": a.payout.total_amount if a.payout else 0,
            "completed_days": a.payout.eligible_days if a.payout else 0,
            "ended_at": a.ended_at,
        }
        for a in past
    ] + [
        {**_campaign_dict(db, a.campaign, with_stats=False), "my_status": a.status, "rejection_reason": a.rejection_reason, "ended_at": a.rejected_at}
        for a in rejected
    ]

    return {
        "available": [_rider_campaign_card(db, c, rider) for c in public if not active or c.id != active.campaign_id],
        "active": active_data,
        "pending_request": _rider_campaign_card(db, pending.campaign, rider) if pending else None,
        "history": history,
    }


def _rider_visible_campaign(db: Session, campaign_id: int, rider: Rider) -> Campaign:
    campaign = _get_campaign(db, campaign_id)
    took_part = (
        db.query(CampaignApplication)
        .filter(CampaignApplication.campaign_id == campaign.id, CampaignApplication.rider_id == rider.id)
        .first()
    )
    if campaign.visibility != CampaignVisibility.PUBLIC and not took_part:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@rider_router.get("/{campaign_id}")
def rider_campaign_detail(campaign_id: int, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    campaign = _rider_visible_campaign(db, campaign_id, rider)
    data = _rider_campaign_card(db, campaign, rider)
    assignment = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.rider_id == rider.id)
        .order_by(CampaignAssignment.id.desc())
        .first()
    )
    data["progress"] = svc.rider_progress(assignment) if assignment else None
    return data


@rider_router.post("/{campaign_id}/join")
def join_campaign(campaign_id: int, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    campaign = _rider_visible_campaign(db, campaign_id, rider)
    _run(lambda: svc.request_to_join(db, campaign, rider))
    return _rider_campaign_card(db, campaign, rider)


@rider_router.post("/{campaign_id}/withdraw")
def withdraw_campaign_request(campaign_id: int, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    campaign = _rider_visible_campaign(db, campaign_id, rider)
    _run(lambda: svc.withdraw_request(db, campaign, rider))
    return _rider_campaign_card(db, campaign, rider)


@rider_router.post("/{campaign_id}/activity")
async def submit_daily_proof(
    campaign_id: int,
    photo: UploadFile = File(...),
    rider: Rider = Depends(get_current_rider),
    db: Session = Depends(get_db),
):
    assignment = svc.current_assignment(db, rider.id)
    if not assignment or assignment.campaign_id != campaign_id:
        raise HTTPException(status_code=400, detail="You are not active in this campaign.")
    # Validate before storing the file.
    _run(lambda: svc.sync_campaign_status(db, assignment.campaign))
    if assignment.status != AssignmentStatus.ACTIVE or not svc.is_running(assignment.campaign):
        raise HTTPException(status_code=400, detail="This campaign is not accepting proof today.")
    photo_url = await _save_image(photo, "campaign-proofs")
    activity = _run(lambda: svc.submit_activity(db, assignment, photo_url))
    return {"id": activity.id, "date": activity.activity_date.isoformat(), "photo_url": activity.photo_url, "photo_status": activity.photo_status}
