import csv
import hashlib
import io
import logging
import json
import os
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_rider
from app.core.config import settings
from app.core.database import get_db
from app.models.all_models import Brand, Rider, User
from app.models.campaign_models import (
    ActivityChangeLog,
    AdjustmentStatus,
    ApplicationStatus,
    BrandPaymentKind,
    BrandPaymentRecord,
    CampaignBrandKit,
    CampaignExtension,
    CampaignFulfillmentSnapshot,
    FinancialAdjustment,
    KitStatus,
    RiderBrandKit,
    AssignmentStatus,
    Campaign,
    CampaignActivityPhoto,
    CampaignPickupLocation,
    CampaignApplication,
    CampaignAssignment,
    CampaignDailyActivity,
    CampaignPayout,
    CampaignStatus,
    CampaignVisibility,
    KitReturnStatus,
    LocationPurpose,
    PhotoSlot,
    PhotoStatus,
    RequestLabels,
    VehicleCategory,
)
from app.schemas.campaign_schemas import (
    AdjustmentResolve,
    AdminAddRiderRequest,
    ApproveApplicationRequest,
    BrandKitUpdate,
    PickupLocationCreate,
    RequestKitUpdate,
    RoutePointsUpload,
    PickupLocationUpdate,
    BrandPaymentCreate,
    CampaignCreate,
    CampaignUpdate,
    ExcuseRequest,
    ExtensionCreate,
    JoinCampaignRequest,
    ReasonRequest,
    ReplacementSlotsRequest,
    RiderKitUpdate,
    ShareCampaignRequest,
)
from app.services import fulfillment_service as fs
from app.services import data_admin_service as das
from app.services import kit_service as ks
from app.services import route_service as routes
from app.services import storage_service as storage
from app.services import campaign_service as svc
from app.services.audit_service import log_admin_action

visibility_log = logging.getLogger("app.campaigns.visibility")
if not visibility_log.handlers:  # Uvicorn doesn't configure app loggers; print these to the server console
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     [visibility] %(message)s"))
    visibility_log.addHandler(_handler)
    visibility_log.setLevel(logging.INFO)
    visibility_log.propagate = False

# Admin routes, mounted at /campaigns
router = APIRouter()
# Rider routes, mounted at /riders/me/campaigns
rider_router = APIRouter()
# Public (no login) routes, mounted at /public/campaigns
public_router = APIRouter()

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


async def _read_image(upload: UploadFile) -> (bytes, str):
    extension = ALLOWED_IMAGE_TYPES.get(upload.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Please upload a JPG, PNG, WEBP or HEIC image.")
    content = await upload.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Image must be 8 MB or smaller.")
    return content, extension


async def _save_image(upload: UploadFile, folder: str) -> str:
    content, extension = await _read_image(upload)
    return _store_image(content, extension, folder)


def _store_image(content: bytes, extension: str, folder: str) -> str:
    content_type = next((t for t, ext in ALLOWED_IMAGE_TYPES.items() if ext == extension), "application/octet-stream")
    try:
        return storage.save(content, extension, folder, content_type)
    except storage.StorageError as e:
        raise HTTPException(status_code=503, detail=str(e))


def _require_active_brand(db: Session, brand_id: int) -> Brand:
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=400, detail="Selected brand does not exist. Create the brand first.")
    if not brand.is_active:
        raise HTTPException(status_code=400, detail=f"{brand.name} is inactive. Activate it before creating campaigns for it.")
    return brand


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
        "contract_days": fs.contract_days(campaign),
        "contracted_rider_days": fs.contracted_rider_days(campaign),
        "commitment_locked": campaign.contracted_rider_days is not None,
        "brand_contract_value": campaign.brand_contract_value or 0.0,
        "allow_payout_beyond_contract": bool(campaign.allow_payout_beyond_contract),
        "continue_after_fulfillment": bool(campaign.continue_after_fulfillment),
        "extra_replacement_slots": campaign.extra_replacement_slots or 0,
        "effective_end_date": fs.effective_end_date(campaign).isoformat(),
        "extensions": [_extension_dict(e) for e in campaign.extensions],
        "brand_kit": _kit_dict(db, campaign),
        "status": campaign.status,
        "lifecycle": svc.lifecycle(campaign),
        "live_at": campaign.live_at,
        "location_area": campaign.location_area,
        "eligible_vehicle_categories": svc.eligible_categories(campaign),
        "eligible_vehicle_label": _vehicle_label(campaign),
        "photo_slot_windows": {slot: list(w) for slot, w in svc.slot_windows(campaign).items()},
        "public_share_enabled": bool(campaign.public_share_enabled),
        "public_slug": campaign.public_slug,
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


def _vehicle_label(campaign: Campaign) -> str:
    allowed = svc.eligible_categories(campaign)
    if not allowed or set(allowed) == set(VehicleCategory.ALL):
        return "All vehicles"
    return " & ".join(VehicleCategory.LABELS[c] for c in allowed)


def _campaign_fields(payload, only_set: bool = False) -> dict:
    """Payload → column values (vehicle categories and slot times are stored as text)."""
    data = payload.model_dump(exclude={"visibility"})
    if only_set:  # Fields added later are only changed when the client sends them
        for field in ("location_area", "eligible_vehicle_categories", "photo_slot_windows"):
            if field not in payload.model_fields_set:
                data.pop(field)
    if "eligible_vehicle_categories" in data:
        data["eligible_vehicle_categories"] = ",".join(data["eligible_vehicle_categories"] or []) or None
    if "photo_slot_windows" in data:
        data["photo_slot_windows"] = _run(lambda: svc.validate_slot_windows(data["photo_slot_windows"]))
    if "location_area" in data:
        data["location_area"] = (data["location_area"] or "").strip() or None
    return data


def _extension_dict(e: CampaignExtension) -> dict:
    return {
        "id": e.id,
        "start_date": e.start_date.isoformat(),
        "end_date": e.end_date.isoformat(),
        "days": fs.days_between(e.start_date, e.end_date),
        "reason": e.reason,
        "rider_day_target": e.rider_day_target,
        "approved_by": e.approved_by.email if e.approved_by else None,
        "approved_at": e.approved_at,
    }


def _location_dict(location: Optional[CampaignPickupLocation]) -> Optional[dict]:
    if not location:
        return None
    return {
        "id": location.id,
        "name": location.name,
        "address": location.address,
        "map_url": location.map_url,
        "available_from": location.available_from.isoformat() if location.available_from else None,
        "available_to": location.available_to.isoformat() if location.available_to else None,
        "available_days": location.available_days,
        "start_time": location.start_time,
        "end_time": location.end_time,
        "contact_name": location.contact_name,
        "contact_phone": location.contact_phone,
        "instructions": location.instructions,
        "is_active": location.is_active,
        "purpose": ks.purpose_of(location),
    }


def _kit_dict(db: Session, campaign: Campaign, active_only: bool = False) -> Optional[dict]:
    kit = campaign.brand_kit
    if not kit:
        return None
    return {
        "tshirt_required": kit.tshirt_required,
        "size_options": ks.sizes_of(kit),
        "instructions": kit.instructions,
        "locations": [_location_dict(l) for l in ks.locations(db, campaign, active_only=active_only)],
        "return_required": ks.return_required(campaign),
        "return_required_setting": kit.return_required is not False,
        "return_incentive": ks.return_incentive(campaign),
        "return_instructions": kit.return_instructions,
        "return_locations": [
            _location_dict(l) for l in ks.locations(db, campaign, active_only=active_only, purpose=LocationPurpose.RETURN)
        ],
    }


def _rider_kit_dict(kit: Optional[RiderBrandKit]) -> Optional[dict]:
    if not kit:
        return None
    status = KitStatus.READY_FOR_PICKUP if kit.status == KitStatus.PICKUP_SCHEDULED else KitStatus.PENDING if kit.status == KitStatus.NOT_COLLECTED else kit.status
    return {
        "id": kit.id,
        "assignment_id": kit.assignment_id,
        "rider": _rider_brief(kit.rider),
        "tshirt_size": kit.tshirt_size,
        "status": status,
        "status_label": KitStatus.LABELS.get(status, status),
        "pickup_location": _location_dict(kit.pickup_location),
        "pickup_date": kit.pickup_date.isoformat() if kit.pickup_date else None,
        "collected_date": kit.collected_date.isoformat() if kit.collected_date else None,
        "issued_by": kit.issued_by.email if kit.issued_by else None,
        **_return_dict(kit),
    }


def _return_dict(kit: RiderBrandKit) -> dict:
    status = ks.return_status(kit.campaign, kit)
    payment = kit.return_payment
    return {
        "return_status": status,
        "return_status_label": KitReturnStatus.LABELS[status],
        "returned_at": kit.returned_at,
        "returned_by": kit.returned_by.email if kit.returned_by else None,
        "return_incentive_amount": payment.amount if payment else None,
        "return_incentive_status": payment.status if payment else None,
    }


def _rider_request_dict(a: Optional[CampaignApplication]) -> Optional[dict]:
    if not a:
        return None
    kit_status = ks.request_kit_status(a)
    return {
        "id": a.id,
        "status": a.status,
        "status_label": {"REQUESTED": "Waiting for Admin Approval"}.get(a.status, RequestLabels.CAMPAIGN.get(a.status, a.status)),
        "requested_at": a.requested_at,
        "rejection_reason": a.rejection_reason,
        "tshirt_size": a.tshirt_size,
        "kit_status": kit_status,
        "kit_status_label": KitStatus.LABELS.get(kit_status, kit_status),
        "pickup_location": _location_dict(a.pickup_location) if a.pickup_location_id else None,
    }


def _accepting(db: Session, campaign: Campaign) -> bool:
    return not svc.target_reached(db, campaign)


def _assignment_row(assignment: CampaignAssignment, accepting: bool = True) -> dict:
    progress = svc.rider_progress(assignment, accepting=accepting)
    replaced = None
    if assignment.replacement_for_assignment_id:
        original = next((a for a in assignment.campaign.assignments if a.id == assignment.replacement_for_assignment_id), None)
        replaced = original.rider.full_name if original else None
    return {
        "replacement_for": replaced,
        "assignment_id": assignment.id,
        "rider": _rider_brief(assignment.rider),
        "status": assignment.status,
        "joined_at": assignment.assigned_at,
        "ended_at": assignment.ended_at,
        "removal_reason": assignment.removal_reason,
        "payout_id": assignment.payout.id if assignment.payout else None,
        **{k: v for k, v in progress.items() if k != "days"},
    }


def _photo_dict(photo: CampaignActivityPhoto) -> dict:
    activity = photo.activity
    counts = svc.photo_counts(activity)
    return {
        "id": photo.id,
        "activity_id": activity.id,
        "assignment_id": activity.assignment_id,
        "rider": _rider_brief(activity.rider),
        "date": activity.activity_date.isoformat(),
        "photo_url": photo.photo_url,
        "status": photo.status,
        "photo_status": photo.status,
        "rejection_reason": photo.rejection_reason,
        "slot": photo.slot,
        "slot_label": PhotoSlot.LABELS.get(photo.slot) if photo.slot else None,
        "uploaded_at": photo.uploaded_at,
        "reviewed_at": photo.reviewed_at,
        "day_status": activity.status,
        "day_valid": counts["valid"],
        "day_pending": counts["pending"],
        "photos_required": counts["required"],
    }


def _activity_dict(activity: CampaignDailyActivity) -> dict:
    counts = svc.photo_counts(activity)
    return {
        "photos_required": counts["required"],
        "photos_valid": counts["valid"],
        "photos_pending": counts["pending"],
        "photos_rejected": counts["rejected"],
        "photos": [_photo_dict(p) for p in activity.photos],
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


@router.get("/join-requests")
def all_join_requests(
    status: Optional[str] = "REQUESTED",
    campaign_id: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Join requests across all campaigns (default: pending admin approval)."""
    query = db.query(CampaignApplication)
    if status and status != "ALL":
        query = query.filter(CampaignApplication.status == status)
    if campaign_id:
        query = query.filter(CampaignApplication.campaign_id == campaign_id)
    return [_application_dict(db, a) for a in query.order_by(CampaignApplication.requested_at.desc()).limit(500).all()]


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
    _require_active_brand(db, payload.brand_id)
    campaign = Campaign(
        **_campaign_fields(payload),
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
    if campaign.contracted_rider_days is not None and (
        payload.total_slots != campaign.total_slots
        or payload.start_date != campaign.start_date
        or payload.end_date != campaign.end_date
    ):
        raise HTTPException(
            status_code=400,
            detail="Required riders and contract dates are locked once a campaign is published. "
            "Use replacement slots or an extension instead.",
        )
    if payload.total_slots < svc.slots_used(db, campaign.id):
        raise HTTPException(status_code=400, detail="Total slots cannot be lower than the number of approved riders.")
    if payload.brand_id != campaign.brand_id:
        _require_active_brand(db, payload.brand_id)
    for field, value in _campaign_fields(payload, only_set=True).items():
        setattr(campaign, field, value)
    db.commit()
    fs.recalculate_campaign_payouts(db, campaign)  # payout-beyond-contract may have changed
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


_STATUS_ACTIONS = {
    "publish": svc.publish_campaign,
    "unpublish": svc.unpublish_campaign,
    "pause": svc.pause_campaign,
    "resume": svc.resume_campaign,
    "complete": svc.complete_campaign,
    "cancel": svc.cancel_campaign,
    "go-live": svc.go_live,
}


def _status_action_route(action: str):
    def change_campaign_status(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
        campaign = _get_campaign(db, campaign_id)
        _run(lambda: _STATUS_ACTIONS[action](db, campaign, admin))
        return _campaign_dict(db, campaign)

    change_campaign_status.__name__ = f"{action.replace('-', '_')}_campaign"
    return change_campaign_status


# Explicit routes (not /{campaign_id}/{action}) so they never shadow other POST routes.
for _action in _STATUS_ACTIONS:
    router.add_api_route(f"/{{campaign_id}}/{_action}", _status_action_route(_action), methods=["POST"])


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:60] or "campaign"


def _share_dict(campaign: Campaign) -> dict:
    base = settings.PUBLIC_CAMPAIGN_BASE_URL
    return {
        "enabled": bool(campaign.public_share_enabled),
        "slug": campaign.public_slug,
        # Empty when no base URL is configured: the dashboard builds it from its own address.
        "url": f"{base.rstrip('/')}/{campaign.public_slug}" if base and campaign.public_slug else None,
    }


@router.post("/{campaign_id}/share")
def share_campaign(
    campaign_id: int, payload: ShareCampaignRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)
):
    """Turns the public brand page (/campaign/<slug>) on or off. The slug is created once and kept."""
    campaign = _get_campaign(db, campaign_id)
    if payload.enabled and campaign.status == CampaignStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Publish the campaign before sharing its public page.")
    if payload.enabled and not campaign.public_slug:
        base = _slugify(f"{campaign.name} {campaign.location_area or ''}")
        slug, n = base, 1
        while db.query(Campaign.id).filter(Campaign.public_slug == slug).first():
            n += 1
            slug = f"{base}-{n}"
        campaign.public_slug = slug
    campaign.public_share_enabled = payload.enabled
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_SHARE_" + ("ENABLED" if payload.enabled else "DISABLED"),
                     target_type="CAMPAIGN", target_id=str(campaign.id), details=f"Public page for {campaign.name} {'enabled' if payload.enabled else 'disabled'} ({campaign.public_slug})")
    return _share_dict(campaign)


@public_router.get("/{slug}")
def public_campaign(slug: str, db: Session = Depends(get_db)):
    """The brand-facing campaign page. Only fields meant for the public: no riders, admins, payouts,
    rates or analytics."""
    campaign = db.query(Campaign).filter(Campaign.public_slug == slug, Campaign.public_share_enabled == True).first()  # noqa: E712
    if not campaign or campaign.status == CampaignStatus.DRAFT:
        raise HTTPException(status_code=404, detail="This campaign page isn't available.")
    svc.sync_campaign_status(db, campaign)
    kit = campaign.brand_kit
    lifecycle = svc.lifecycle(campaign)
    windows = svc.slot_windows(campaign)
    return {
        "slug": campaign.public_slug,
        "campaign_id": campaign.id,
        "name": campaign.name,
        "brand": {"name": campaign.brand.name if campaign.brand else None, "logo_url": campaign.brand.logo if campaign.brand else None},
        "description": campaign.description,
        "image_url": campaign.image_url,
        "location_area": campaign.location_area,
        "start_date": campaign.start_date.isoformat(),
        "end_date": fs.effective_end_date(campaign).isoformat(),
        "status": lifecycle["key"],
        "status_label": lifecycle["label"],
        "accepting_riders": lifecycle["key"] == "OPEN",
        "eligible_vehicles": _vehicle_label(campaign),
        "requirements": [line.strip() for line in (campaign.rules or "").splitlines() if line.strip()],
        "photo_slots": [
            {"slot": slot, "label": PhotoSlot.LABELS[slot], "start": windows[slot][0], "end": windows[slot][1]} for slot in PhotoSlot.ALL
        ],
        "tshirt": {
            "required": ks.kit_required(campaign),
            "sizes": ks.sizes_of(kit) if ks.kit_required(campaign) else [],
            "return_required": ks.return_required(campaign),
            # Where riders collect the kit (names and areas only; contacts stay in the rider app).
            "pickup_points": [
                {"name": l.name, "address": l.address} for l in ks.locations(db, campaign, active_only=True)
            ] if ks.kit_required(campaign) else [],
        },
        "app_link": f"superriders://campaign/{campaign.id}",
    }


@router.get("/{campaign_id}/rider-visibility")
def campaign_rider_visibility(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Can riders see this campaign, and which riders can join it (with the reason for those who can't)."""
    campaign = _get_campaign(db, campaign_id)
    hidden_reason = svc.rider_visibility(campaign)
    riders = db.query(Rider).filter(Rider.archived_at.is_(None)).order_by(Rider.id).all()
    rows = []
    for rider in riders:
        can_join, reason = svc.join_eligibility(db, campaign, rider)
        rows.append({"rider": _rider_brief(rider), "can_join": can_join and not hidden_reason, "reason": hidden_reason or reason})
    return {
        "visible_to_riders": hidden_reason is None,
        "hidden_reason": hidden_reason,
        "status": campaign.status,
        "visibility": campaign.visibility,
        "remaining_slots": max(svc.slot_capacity(campaign) - svc.slots_used(db, campaign.id), 0),
        "riders_who_can_join": sum(1 for r in rows if r["can_join"]),
        "riders": rows,
    }


@router.get("/{campaign_id}/route-dates")
def campaign_route_dates(
    campaign_id: int, assignment_id: Optional[int] = None, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)
):
    """Dates that have a recorded route (for one rider, or any rider in the campaign)."""
    return routes.route_dates(db, _get_campaign(db, campaign_id), assignment_id)


@router.get("/{campaign_id}/routes")
def campaign_routes(
    campaign_id: int,
    day: date = Query(..., alias="date"),
    assignment_id: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Route lines for one day: one rider (assignment_id) or all riders. Coordinates only, no statistics."""
    campaign = _get_campaign(db, campaign_id)
    return {
        "campaign": {"id": campaign.id, "name": campaign.name},
        "date": day.isoformat(),
        "routes": routes.routes_for_day(db, campaign, day, assignment_id),
    }


@router.get("/{campaign_id}/delete-impact")
def campaign_delete_impact(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    return das.campaign_impact(db, _get_campaign(db, campaign_id))


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Permanent delete, only for draft/cancelled campaigns without riders, activity or money records."""
    campaign = _get_campaign(db, campaign_id)
    try:
        das.hard_delete_campaign(db, campaign, admin)
    except das.DataAdminError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"success": True, "message": "Campaign permanently deleted"}


@router.post("/{campaign_id}/riders")
def add_rider_to_campaign(
    campaign_id: int, payload: AdminAddRiderRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)
):
    campaign = _get_campaign(db, campaign_id)
    rider = db.query(Rider).filter(Rider.id == payload.rider_id).first()
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    assignment = _run(
        lambda: svc.admin_add_rider(
            db, campaign, rider, admin, payload.tshirt_size, payload.replacement_for_assignment_id, payload.pickup_location_id,
            payload.kit_collected,
        )
    )
    return _assignment_row(assignment, _accepting(db, campaign))


# ---------------------------------------------------------------------------
# Admin: join requests
# ---------------------------------------------------------------------------

def _approve_blocker(db: Session, a: CampaignApplication) -> Optional[str]:
    """Why an admin can't approve this request yet (None when they can). Mirrors approve_application."""
    if a.status != ApplicationStatus.REQUESTED:
        return None
    campaign, rider = a.campaign, a.rider
    if ks.kit_required(campaign) and ks.request_kit_status(a) != KitStatus.COLLECTED:
        return "Waiting for T-shirt collection"
    if campaign.status not in CampaignStatus.PUBLISHED:
        return f"Campaign is {campaign.status.lower()}"
    busy = svc.current_assignment(db, a.rider_id)
    if busy:
        return f"Rider is already in {busy.campaign.name}"
    if rider.archived_at or rider.status not in svc.ELIGIBLE_RIDER_STATUSES:
        return f"Rider is {rider.status.lower()}"
    if svc.slots_used(db, campaign.id) >= svc.slot_capacity(campaign):
        return "Campaign is full"
    return None


def _application_dict(db: Session, a: CampaignApplication) -> dict:
    kit_status = ks.request_kit_status(a)
    blocker = _approve_blocker(db, a)
    return {
        "id": a.id,
        "rider": _rider_brief(a.rider),
        "campaign": {"id": a.campaign.id, "name": a.campaign.name, "status": a.campaign.status},
        "status": a.status,
        "status_label": RequestLabels.CAMPAIGN.get(a.status, a.status),
        "requested_at": a.requested_at,
        "approved_at": a.approved_at,
        "rejected_at": a.rejected_at,
        "rejection_reason": a.rejection_reason,
        "reviewed_by": a.reviewed_by.email if a.reviewed_by_id and a.reviewed_by else None,
        "tshirt_required": ks.kit_required(a.campaign),
        "tshirt_size": a.tshirt_size,
        "size_options": ks.sizes_of(a.campaign.brand_kit),
        "pickup_location": a.pickup_location.name if a.pickup_location_id and a.pickup_location else None,
        "kit_status": kit_status,
        "kit_status_label": KitStatus.LABELS.get(kit_status, kit_status),
        "kit_collected_at": a.kit_collected_at,
        "kit_collected_by": a.kit_collected_by.email if a.kit_collected_by_id and a.kit_collected_by else None,
        "can_approve": a.status == ApplicationStatus.REQUESTED and blocker is None,
        "approve_blocked_reason": blocker,
        # Kept for older screens
        "rider_busy_in_campaign": (lambda busy: busy.campaign.name if busy and busy.campaign_id != a.campaign_id else None)(svc.current_assignment(db, a.rider_id)),
    }


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
    return [_application_dict(db, a) for a in query.order_by(CampaignApplication.requested_at.desc()).all()]


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
def approve_application(
    campaign_id: int,
    application_id: int,
    payload: Optional[ApproveApplicationRequest] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    application = _get_application(db, campaign_id, application_id)
    replacement_for = payload.replacement_for_assignment_id if payload else None
    _run(lambda: svc.approve_application(db, application, admin, replacement_for))
    return _campaign_dict(db, _get_campaign(db, campaign_id))


@router.post("/{campaign_id}/applications/{application_id}/kit")
def set_application_kit(
    campaign_id: int,
    application_id: int,
    payload: RequestKitUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Mark the requester's T-shirt as collected (or back to pending collection)."""
    application = _get_application(db, campaign_id, application_id)
    _run(lambda: svc.mark_request_kit(db, application, admin, payload.collected, payload.tshirt_size))
    return _application_dict(db, application)


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
    campaign = _get_campaign(db, campaign_id)
    accepting = _accepting(db, campaign)
    assignments = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.campaign_id == campaign_id)
        .order_by(CampaignAssignment.assigned_at.desc())
        .all()
    )
    return [_assignment_row(a, accepting) for a in assignments]


@router.get("/{campaign_id}/riders/{assignment_id}/activity")
def rider_activity(campaign_id: int, assignment_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    assignment = _get_assignment(db, campaign_id, assignment_id)
    accepting = _accepting(db, assignment.campaign)
    return {**_assignment_row(assignment, accepting), "days": svc.rider_progress(assignment, accepting=accepting)["days"]}


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
    """Every proof photo (3 per completed rider-day). Legacy single-photo days are listed as one row each."""
    _get_campaign(db, campaign_id)
    query = db.query(CampaignActivityPhoto).filter(CampaignActivityPhoto.campaign_id == campaign_id)
    if status and status != "ALL":
        query = query.filter(CampaignActivityPhoto.status == status)
    rows = [_photo_dict(p) for p in query.all()]

    legacy = db.query(CampaignDailyActivity).filter(
        CampaignDailyActivity.campaign_id == campaign_id,
        CampaignDailyActivity.photo_url.isnot(None),
        ~CampaignDailyActivity.photos.any(),
    )
    if status and status != "ALL":
        legacy = legacy.filter(CampaignDailyActivity.photo_status == status)
    for a in legacy.all():
        rows.append({**_activity_dict(a), "id": None, "activity_id": a.id, "legacy": True, "day_status": a.status})
    rows.sort(key=lambda r: (r["date"], r["activity_id"], r["id"] or 0), reverse=True)
    return rows


def _get_photo(db: Session, campaign_id: int, photo_id: int) -> CampaignActivityPhoto:
    photo = (
        db.query(CampaignActivityPhoto)
        .filter(CampaignActivityPhoto.id == photo_id, CampaignActivityPhoto.campaign_id == campaign_id)
        .first()
    )
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


@router.post("/{campaign_id}/photos/{photo_id}/approve")
def approve_photo(campaign_id: int, photo_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    photo = _get_photo(db, campaign_id, photo_id)
    return _photo_dict(_run(lambda: svc.review_photo(db, photo, admin, approve=True)))


@router.post("/{campaign_id}/photos/{photo_id}/reject")
def reject_photo(
    campaign_id: int,
    photo_id: int,
    payload: ReasonRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    photo = _get_photo(db, campaign_id, photo_id)
    return _photo_dict(_run(lambda: svc.review_photo(db, photo, admin, approve=False, reason=payload.reason)))


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
    f = fs.campaign_fulfillment(db, campaign)
    writer.writerow(["Contracted Rider-Days", f["contracted_rider_days"]])
    writer.writerow(["Delivered Rider-Days", f["delivered_rider_days"]])
    writer.writerow(["Remaining Rider-Days", f["remaining_rider_days"]])
    writer.writerow(["Surplus Rider-Days", f["surplus_rider_days"]])
    writer.writerow(["Fulfilment %", f["fulfillment_pct"]])
    writer.writerow(["Delivery Status", f["delivery_status"]])
    writer.writerow([])
    writer.writerow([
        "Rider ID", "Rider Name", "Phone", "Status", "Performance", "Joined", "Target Days", "Completed Photo-Days", "Remaining Target Days",
        "Completion %", "Missed Days", "Excused Days", "Current Streak", "Longest Streak", "Photos Submitted", "Valid Photos",
        "Daily Rate (INR)", "Earned (INR)", "Paid (INR)", "Pending (INR)", "Payout Status",
    ])
    for assignment in db.query(CampaignAssignment).filter(CampaignAssignment.campaign_id == campaign.id).all():
        row = _assignment_row(assignment)
        writer.writerow([
            row["rider"]["rider_id"], row["rider"]["full_name"], row["rider"]["mobile_number"], row["status"], row["rider_status"],
            assignment.assigned_at.strftime("%Y-%m-%d"), row["target_days"], row["completed_days"], row["remaining_target_days"],
            row["completion_pct"], row["missed_days"], row["excused_days"],
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
            "slot_capacity": svc.slot_capacity(campaign),
            "remaining_slots": max(svc.slot_capacity(campaign) - used, 0),
            "target_reached": svc.target_reached(db, campaign),
            "my_status": _participation_status(db, campaign, rider),
            "can_join": can_join,
            "join_blocked_reason": reason,
            # Riders only see (and can choose) active pickup locations.
            "brand_kit": _kit_dict(db, campaign, active_only=True),
        }
    )
    return data


@rider_router.get("")
def rider_campaigns(rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    today = svc.today_ist()
    # Every non-closed campaign is checked with the same rule the admin page uses (svc.rider_visibility),
    # so the logged reasons match exactly why a campaign is hidden.
    candidates = (
        db.query(Campaign)
        .filter(~Campaign.status.in_((CampaignStatus.COMPLETED, CampaignStatus.CANCELLED)))
        .order_by(Campaign.start_date, Campaign.id)
        .all()
    )
    public, hidden = [], {}
    for c in candidates:
        svc.sync_campaign_status(db, c, today)
        reason = svc.rider_visibility(c, today)
        if reason:
            hidden[c.id] = reason
        else:
            public.append(c)
    if settings.CAMPAIGN_VISIBILITY_LOG:
        visibility_log.info(
            "rider campaigns: rider=%s (%s, status=%s) today=%s returned=%s hidden=%s",
            rider.rider_id, rider.id, rider.status, today,
            [(c.id, c.status) for c in public], hidden,
        )

    active = svc.current_assignment(db, rider.id)
    active_data = None
    if active:
        svc.sync_campaign_status(db, active.campaign, today)
        progress = svc.rider_progress(active, today, accepting=_accepting(db, active.campaign))
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
        "pending_request": {**_rider_campaign_card(db, pending.campaign, rider), "my_request": _rider_request_dict(pending)} if pending else None,
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
    data["progress"] = svc.rider_progress(assignment, accepting=_accepting(db, campaign)) if assignment else None
    kit = db.query(RiderBrandKit).filter(RiderBrandKit.assignment_id == assignment.id).first() if assignment else None
    data["my_kit"] = _rider_kit_dict(kit)
    # The rider's latest request for this campaign, so the app can show its status and pickup details.
    request = (
        db.query(CampaignApplication)
        .filter(CampaignApplication.campaign_id == campaign.id, CampaignApplication.rider_id == rider.id)
        .order_by(CampaignApplication.id.desc())
        .first()
    )
    data["my_request"] = _rider_request_dict(request)
    if assignment and not kit:
        # Joined a campaign that needs no T-shirt (or the rider's kit record isn't created yet).
        data["my_kit"] = {"status": KitStatus.NOT_REQUIRED, "status_label": KitStatus.LABELS[KitStatus.NOT_REQUIRED]} if not ks.kit_required(campaign) else None
    data["kit_return"] = _rider_return_block(db, campaign, assignment, kit)
    return data


def _rider_return_block(db: Session, campaign: Campaign, assignment: Optional[CampaignAssignment], kit: Optional[RiderBrandKit]) -> Optional[dict]:
    """T-shirt return details for the rider once their part of the campaign is over."""
    if not kit:
        return None
    status = ks.return_status(campaign, kit)
    if status == KitReturnStatus.NOT_REQUIRED:
        return None
    brand_kit = campaign.brand_kit
    return {
        "status": status,
        "status_label": KitReturnStatus.LABELS[status],
        "due": ks.return_due(campaign, assignment, svc.today_ist()),
        "incentive": ks.return_incentive(campaign),
        "instructions": brand_kit.return_instructions if brand_kit else None,
        "locations": [_location_dict(l) for l in ks.locations(db, campaign, active_only=True, purpose=LocationPurpose.RETURN)],
        "returned_at": kit.returned_at,
        "incentive_credited": status == KitReturnStatus.INCENTIVE_CREDITED,
        "incentive_amount": kit.return_payment.amount if kit.return_payment else None,
    }


@rider_router.post("/{campaign_id}/join")
def join_campaign(
    campaign_id: int,
    payload: Optional[JoinCampaignRequest] = None,
    rider: Rider = Depends(get_current_rider),
    db: Session = Depends(get_db),
):
    campaign = _rider_visible_campaign(db, campaign_id, rider)
    size = payload.tshirt_size if payload else None
    location_id = payload.pickup_location_id if payload else None
    _run(lambda: svc.request_to_join(db, campaign, rider, size, location_id))
    return _rider_campaign_card(db, campaign, rider)


@rider_router.post("/{campaign_id}/withdraw")
def withdraw_campaign_request(campaign_id: int, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    campaign = _rider_visible_campaign(db, campaign_id, rider)
    _run(lambda: svc.withdraw_request(db, campaign, rider))
    return _rider_campaign_card(db, campaign, rider)


@rider_router.post("/{campaign_id}/route-points")
def upload_route_points(
    campaign_id: int, payload: RoutePointsUpload, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)
):
    """GPS points recorded by the app while the rider's route is on."""
    assignment = svc.current_assignment(db, rider.id)
    if not assignment or assignment.campaign_id != campaign_id:
        raise HTTPException(status_code=400, detail="You are not active in this campaign.")
    try:
        kept = routes.record_points(db, assignment, [p.model_dump() for p in payload.points])
    except routes.RouteError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"received": len(payload.points), "stored": kept}


@rider_router.post("/{campaign_id}/activity")
async def submit_daily_proof(
    campaign_id: int,
    photo: UploadFile = File(...),
    slot: Optional[str] = Form(None),  # MORNING / EVENING / NIGHT
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
    if svc.target_reached(db, assignment.campaign):
        raise HTTPException(status_code=400, detail="Campaign target reached. No more proof is needed for this campaign.")
    content, extension = await _read_image(photo)
    content_hash = hashlib.sha256(content).hexdigest()
    slot = _run(lambda: svc.check_photo_upload(db, assignment, content_hash, slot))  # Before storing the file
    # campaign-proofs/<campaign>/<rider>/<random>.jpg: grouped for browsing; the random name means a retake
    # never overwrites a rejected photo (its history stays), and duplicates are caught by content hash.
    photo_url = _store_image(content, extension, f"campaign-proofs/{campaign_id}/{rider.id}")
    activity = _run(lambda: svc.submit_activity(db, assignment, photo_url, content_hash, slot))
    counts = svc.photo_counts(activity)
    return {
        "id": activity.id,
        "date": activity.activity_date.isoformat(),
        "photo_url": photo_url,
        "photo_status": activity.photo_status,
        "status": activity.status,
        "photos_required": counts["required"],
        "photos_valid": counts["valid"],
        "photos_pending": counts["pending"],
        "photos_uploaded": counts["uploaded"],
        "slot": slot,
        "slots": svc.slot_rows(activity, assignment.campaign),
    }


# ---------------------------------------------------------------------------
# Admin: fulfilment, recovery, extensions, brand money, brand kit, corrections
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}/fulfillment")
def campaign_fulfillment(
    campaign_id: int,
    riders_available: Optional[int] = Query(None, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    campaign = _get_campaign(db, campaign_id)
    result = fs.campaign_fulfillment(db, campaign, riders_available=riders_available)
    result.pop("rider_performance", None)
    result.pop("contract_activity_ids", None)
    return result


@router.post("/{campaign_id}/replacement-slots")
def set_replacement_slots(
    campaign_id: int,
    payload: ReplacementSlotsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    campaign = _get_campaign(db, campaign_id)
    if campaign.status in CampaignStatus.CLOSED:
        raise HTTPException(status_code=400, detail="This campaign is closed.")
    if campaign.total_slots + payload.extra_replacement_slots < svc.slots_used(db, campaign.id):
        raise HTTPException(status_code=400, detail="Slots cannot be lower than the number of riders already assigned.")
    campaign.extra_replacement_slots = payload.extra_replacement_slots
    db.commit()
    svc.sync_campaign_status(db, campaign)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_REPLACEMENT_SLOTS", target_type="CAMPAIGN", target_id=str(campaign.id),
                     details=f"Replacement slots set to {payload.extra_replacement_slots} (contracted rider-days unchanged)")
    return _campaign_dict(db, campaign)


@router.post("/{campaign_id}/extensions")
def approve_extension(
    campaign_id: int,
    payload: ExtensionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Adds dates to recover a shortfall. Never changes contracted rider-days."""
    campaign = _get_campaign(db, campaign_id)
    if campaign.status in CampaignStatus.CLOSED or campaign.status == CampaignStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Extensions can only be added to a published, open campaign.")
    current_end = fs.effective_end_date(campaign)
    if payload.start_date != current_end + timedelta(days=1):
        raise HTTPException(status_code=400, detail=f"The extension must start on {(current_end + timedelta(days=1)):%d %b %Y}, the day after the current end date.")
    remaining = fs.campaign_fulfillment(db, campaign)["remaining_rider_days"]
    extension = CampaignExtension(
        campaign_id=campaign.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason.strip(),
        rider_day_target=remaining,
        approved_by_id=admin.id,
    )
    db.add(extension)
    db.commit()
    db.refresh(campaign)
    svc.sync_campaign_status(db, campaign)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_EXTENDED", target_type="CAMPAIGN", target_id=str(campaign.id),
                     details=f"Extended {payload.start_date:%d %b} to {payload.end_date:%d %b} to recover {remaining} rider-days: {extension.reason}")
    for a in campaign.assignments:
        if a.status in AssignmentStatus.CURRENT and a.rider.user_id:
            svc.send_notification(db=db, user_id=a.rider.user_id, title="Campaign extended",
                                  message=f"{campaign.name} now runs until {payload.end_date:%d %b %Y}.",
                                  category="CAMPAIGN", reference_id=str(campaign.id))
    return _campaign_dict(db, campaign)


@router.get("/{campaign_id}/brand-payments")
def list_brand_payments(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    campaign = _get_campaign(db, campaign_id)
    records = db.query(BrandPaymentRecord).filter(BrandPaymentRecord.campaign_id == campaign.id).order_by(BrandPaymentRecord.record_date.desc(), BrandPaymentRecord.id.desc()).all()
    return {
        "summary": fs.brand_financials(db, campaign),
        "records": [
            {"id": r.id, "kind": r.kind, "amount": r.amount, "record_date": r.record_date.isoformat(), "reference": r.reference,
             "note": r.note, "created_by": r.created_by.email if r.created_by else None, "created_at": r.created_at}
            for r in records
        ],
    }


@router.post("/{campaign_id}/brand-payments")
def add_brand_payment(
    campaign_id: int,
    payload: BrandPaymentCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Explicit admin entry. Delivery shortfalls never create these automatically."""
    campaign = _get_campaign(db, campaign_id)
    summary = fs.brand_financials(db, campaign)
    if payload.kind == BrandPaymentKind.REFUND and payload.amount > summary["net_received"]:
        raise HTTPException(status_code=400, detail="A refund cannot be more than the amount received.")
    db.add(BrandPaymentRecord(campaign_id=campaign.id, created_by_id=admin.id, **payload.model_dump()))
    db.commit()
    log_admin_action(db=db, admin_user=admin, action=f"BRAND_PAYMENT_{payload.kind}", target_type="CAMPAIGN", target_id=str(campaign.id),
                     details=f"{payload.kind.title()} ₹{payload.amount:,.2f} for {campaign.name}" + (f" (ref {payload.reference})" if payload.reference else ""))
    return list_brand_payments(campaign_id, db, admin)


@router.get("/{campaign_id}/adjustments")
def list_adjustments(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    _get_campaign(db, campaign_id)
    items = db.query(FinancialAdjustment).filter(FinancialAdjustment.campaign_id == campaign_id).order_by(FinancialAdjustment.created_at.desc()).all()
    return [
        {"id": a.id, "rider": _rider_brief(a.rider), "kind": a.kind, "amount": a.amount, "status": a.status, "note": a.note,
         "created_at": a.created_at, "resolved_at": a.resolved_at}
        for a in items
    ]


@router.post("/{campaign_id}/adjustments/{adjustment_id}/resolve")
def resolve_adjustment(
    campaign_id: int,
    adjustment_id: int,
    payload: AdjustmentResolve,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    adjustment = db.query(FinancialAdjustment).filter(FinancialAdjustment.id == adjustment_id, FinancialAdjustment.campaign_id == campaign_id).first()
    if not adjustment:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    if adjustment.status != AdjustmentStatus.OPEN:
        raise HTTPException(status_code=400, detail="This adjustment is already resolved.")
    adjustment.status = payload.status
    adjustment.resolved_at = datetime.utcnow()
    adjustment.resolved_by_id = admin.id
    if payload.note:
        adjustment.note = f"{adjustment.note or ''} Resolution: {payload.note}".strip()
    db.commit()
    log_admin_action(db=db, admin_user=admin, action=f"ADJUSTMENT_{payload.status}", target_type="CAMPAIGN", target_id=str(campaign_id),
                     details=f"Overpayment of ₹{adjustment.amount:,.2f} for {adjustment.rider.rider_id} marked {payload.status.lower()}")
    return list_adjustments(campaign_id, db, admin)


def _kit_run(action):
    try:
        return action()
    except ks.KitError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{campaign_id}/brand-kit")
def get_brand_kit(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    campaign = _get_campaign(db, campaign_id)
    kits = db.query(RiderBrandKit).filter(RiderBrandKit.campaign_id == campaign.id).order_by(RiderBrandKit.id).all()
    return {
        "kit": _kit_dict(db, campaign),
        "summary": ks.summary(db, campaign),
        "riders": [_rider_kit_dict(k) for k in kits],
        "statuses": [{"value": s, "label": KitStatus.LABELS[s]} for s in KitStatus.ALL],
        "return_summary": ks.return_summary(db, campaign),
    }


@router.put("/{campaign_id}/brand-kit")
def update_brand_kit(
    campaign_id: int,
    payload: BrandKitUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    campaign = _get_campaign(db, campaign_id)
    kit = _kit_run(lambda: ks.update_kit(
        db, campaign, payload.tshirt_required, payload.size_options, payload.instructions,
        payload.return_required, payload.return_incentive, payload.return_instructions,
    ))
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_BRAND_KIT_UPDATED", target_type="CAMPAIGN", target_id=str(campaign.id),
                     details=f"Brand kit updated (T-shirt {'required' if kit.tshirt_required else 'not required'}; sizes {kit.size_options})")
    return get_brand_kit(campaign_id, db, admin)


def _get_location(db: Session, campaign_id: int, location_id: int) -> CampaignPickupLocation:
    location = (
        db.query(CampaignPickupLocation)
        .filter(CampaignPickupLocation.id == location_id, CampaignPickupLocation.campaign_id == campaign_id)
        .first()
    )
    if not location:
        raise HTTPException(status_code=404, detail="Pickup location not found")
    return location


@router.post("/{campaign_id}/pickup-locations")
def add_pickup_location(
    campaign_id: int, payload: PickupLocationCreate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)
):
    campaign = _get_campaign(db, campaign_id)
    location = _kit_run(lambda: ks.create_location(db, campaign, payload.model_dump()))
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_PICKUP_LOCATION_ADDED", target_type="CAMPAIGN", target_id=str(campaign.id), details=f"Pickup location added: {location.name}")
    return _location_dict(location)


@router.put("/{campaign_id}/pickup-locations/{location_id}")
def update_pickup_location(
    campaign_id: int, location_id: int, payload: PickupLocationUpdate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)
):
    location = _get_location(db, campaign_id, location_id)
    location = _kit_run(lambda: ks.update_location(db, location, payload.model_dump(exclude_unset=True)))
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_PICKUP_LOCATION_UPDATED", target_type="CAMPAIGN", target_id=str(campaign_id),
                     details=f"Pickup location updated: {location.name}{'' if location.is_active else ' (inactive)'}")
    return _location_dict(location)


@router.delete("/{campaign_id}/pickup-locations/{location_id}")
def delete_pickup_location(campaign_id: int, location_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    location = _get_location(db, campaign_id, location_id)
    name = location.name
    try:
        ks.delete_location(db, location)
    except ks.KitError as e:
        raise HTTPException(status_code=409, detail=str(e))
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_PICKUP_LOCATION_DELETED", target_type="CAMPAIGN", target_id=str(campaign_id), details=f"Pickup location deleted: {name}")
    return {"success": True}


@router.patch("/{campaign_id}/brand-kit/riders/{kit_id}")
def update_rider_kit(
    campaign_id: int,
    kit_id: int,
    payload: RiderKitUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    kit = db.query(RiderBrandKit).filter(RiderBrandKit.id == kit_id, RiderBrandKit.campaign_id == campaign_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail="Rider kit not found")
    before = (kit.status, kit.pickup_location_id)
    kit = _kit_run(
        lambda: ks.update_rider_kit(
            db, kit, admin.id, payload.status, payload.tshirt_size, payload.pickup_date, payload.pickup_location_id, payload.clear_pickup_date
        )
    )
    rider = kit.rider
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_RIDER_KIT_UPDATED", target_type="CAMPAIGN", target_id=str(campaign_id),
                     details=f"{rider.full_name} kit: {KitStatus.LABELS.get(kit.status, kit.status)}, size {kit.tshirt_size or '-'}")
    if rider.user_id and (kit.status, kit.pickup_location_id) != before:
        where = f" at {kit.pickup_location.name}" if kit.pickup_location else ""
        messages = {
            KitStatus.READY_FOR_PICKUP: f"Your campaign T-shirt is ready for pickup{where}.",
            KitStatus.COLLECTED: "Your campaign T-shirt has been marked as collected.",
        }
        message = messages.get(kit.status) if kit.status != before[0] else f"Your T-shirt pickup location changed to {kit.pickup_location.name}."
        if message:
            svc.send_notification(db=db, user_id=rider.user_id, title="Brand kit update", message=message, category="CAMPAIGN", reference_id=str(campaign_id))
    return _rider_kit_dict(kit)


@router.post("/{campaign_id}/brand-kit/riders/{kit_id}/return")
def mark_kit_returned(campaign_id: int, kit_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Admin verified the T-shirt came back. Credits the return incentive once (never twice)."""
    kit = db.query(RiderBrandKit).filter(RiderBrandKit.id == kit_id, RiderBrandKit.campaign_id == campaign_id).first()
    if not kit:
        raise HTTPException(status_code=404, detail="Rider kit not found")
    payment = _kit_run(lambda: ks.mark_returned(db, kit, admin.id))
    rider, campaign = kit.rider, kit.campaign
    credit = f"; ₹{payment.amount:,.0f} return incentive credited (payment #{payment.id})" if payment else ""
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_TSHIRT_RETURNED", target_type="CAMPAIGN", target_id=str(campaign_id),
                     details=f"{rider.full_name} ({rider.rider_id}) returned the {campaign.name} T-shirt{credit}")
    if rider.user_id:
        svc.send_notification(
            db=db, user_id=rider.user_id, category="PAYMENT" if payment else "CAMPAIGN", reference_id=str(campaign_id),
            title="T-shirt returned" + (" 🎉" if payment else ""),
            message=(f"₹{payment.amount:,.0f} T-shirt return incentive credited to your wallet." if payment
                     else f"Your {campaign.name} T-shirt has been marked as returned. Thank you!"),
        )
    return _rider_kit_dict(kit)


@router.post("/{campaign_id}/riders/{assignment_id}/excuse")
def excuse_rider_day(
    campaign_id: int,
    assignment_id: int,
    payload: ExcuseRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    assignment = _get_assignment(db, campaign_id, assignment_id)
    _run(lambda: svc.excuse_day(db, assignment, payload.day, payload.reason, admin))
    return rider_activity(campaign_id, assignment_id, db, admin)


@router.get("/{campaign_id}/activity-log")
def activity_log(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    campaign = _get_campaign(db, campaign_id)
    closed_at = campaign.completed_at or campaign.cancelled_at
    logs = db.query(ActivityChangeLog).filter(ActivityChangeLog.campaign_id == campaign.id).order_by(ActivityChangeLog.changed_at.desc()).limit(300).all()
    return [
        {"id": l.id, "rider": _rider_brief(l.rider), "date": l.activity_date.isoformat(), "old_status": l.old_status,
         "new_status": l.new_status, "old_earned": l.old_earned, "new_earned": l.new_earned, "reason": l.reason,
         "changed_by": l.changed_by.email if l.changed_by else "System", "changed_at": l.changed_at,
         "after_closure": bool(closed_at and l.changed_at > closed_at)}
        for l in logs
    ]


@router.get("/{campaign_id}/snapshot")
def fulfillment_snapshot(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    snapshot = db.query(CampaignFulfillmentSnapshot).filter(CampaignFulfillmentSnapshot.campaign_id == campaign_id).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="No closing summary yet. It is created when the campaign is completed or cancelled.")
    return {"created_at": snapshot.created_at, **json.loads(snapshot.data)}
