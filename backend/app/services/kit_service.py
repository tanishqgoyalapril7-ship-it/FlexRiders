"""T-shirt / brand kit pickup: official pickup locations (admin-configured), the rider's size and
chosen location, and per-rider pickup status. Independent of rider-days, streaks and payouts."""
import re
from collections import Counter
from datetime import date, datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.campaign_models import (
    ApplicationStatus,
    AssignmentStatus,
    Campaign,
    CampaignApplication,
    CampaignAssignment,
    CampaignBrandKit,
    CampaignPickupLocation,
    KitStatus,
    RiderBrandKit,
)

DEFAULT_SIZES = "S,M,L,XL,XXL"
TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class KitError(ValueError):
    """A kit/pickup rule was broken; shown to the user as-is."""


def sizes_of(kit: Optional[CampaignBrandKit]) -> List[str]:
    return [x.strip() for x in ((kit.size_options if kit else None) or DEFAULT_SIZES).split(",") if x.strip()]


def kit_required(campaign: Campaign) -> bool:
    return bool(campaign.brand_kit and campaign.brand_kit.tshirt_required)


# ---------------------------------------------------------------------------
# Pickup locations
# ---------------------------------------------------------------------------

def locations(db: Session, campaign: Campaign, active_only: bool = False) -> List[CampaignPickupLocation]:
    _migrate_legacy_location(db, campaign)
    query = db.query(CampaignPickupLocation).filter(CampaignPickupLocation.campaign_id == campaign.id)
    if active_only:
        query = query.filter(CampaignPickupLocation.is_active == True)  # noqa: E712
    return query.order_by(CampaignPickupLocation.id).all()


def _migrate_legacy_location(db: Session, campaign: Campaign) -> None:
    """Earlier versions stored one location on the kit itself; turn it into a location row once."""
    kit = campaign.brand_kit
    if not kit or not (kit.pickup_location or kit.pickup_address):
        return
    exists = db.query(CampaignPickupLocation.id).filter(CampaignPickupLocation.campaign_id == campaign.id).first()
    if not exists:
        location = CampaignPickupLocation(
            campaign_id=campaign.id,
            name=kit.pickup_location or "Pickup point",
            address=kit.pickup_address or kit.pickup_location,
            available_days=(kit.pickup_hours or None) and kit.pickup_hours[:60],
            contact_name=kit.contact_name,
            contact_phone=kit.contact_phone,
        )
        db.add(location)
        db.flush()
        db.query(RiderBrandKit).filter(RiderBrandKit.campaign_id == campaign.id, RiderBrandKit.pickup_location_id.is_(None)).update(
            {RiderBrandKit.pickup_location_id: location.id}, synchronize_session=False
        )
    kit.pickup_location = kit.pickup_address = kit.pickup_hours = kit.contact_name = kit.contact_phone = None
    db.commit()


def _clean(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def validate_location(data: Dict) -> Dict:
    data = {k: _clean(v) for k, v in data.items()}
    if not data.get("name") or len(data["name"]) < 2:
        raise KitError("Enter the pickup location name.")
    if not data.get("address") or len(data["address"]) < 5:
        raise KitError("Enter the full pickup address.")
    if data.get("map_url") and not re.match(r"^https?://", data["map_url"]):
        raise KitError("The map link must start with http:// or https://")
    for field in ("start_time", "end_time"):
        if data.get(field) and not TIME_PATTERN.match(data[field]):
            raise KitError("Pickup times must be in HH:MM (24-hour) format.")
    if data.get("start_time") and data.get("end_time") and data["start_time"] >= data["end_time"]:
        raise KitError("The pickup end time must be after the start time.")
    if data.get("available_from") and data.get("available_to") and data["available_from"] > data["available_to"]:
        raise KitError("The last pickup date must be on or after the first pickup date.")
    return data


def create_location(db: Session, campaign: Campaign, data: Dict) -> CampaignPickupLocation:
    location = CampaignPickupLocation(campaign_id=campaign.id, **validate_location(data))
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


def update_location(db: Session, location: CampaignPickupLocation, data: Dict) -> CampaignPickupLocation:
    current = {c: getattr(location, c) for c in ("name", "address", "map_url", "available_from", "available_to", "available_days", "start_time", "end_time", "contact_name", "contact_phone", "instructions")}
    merged = validate_location({**current, **{k: v for k, v in data.items() if k != "is_active"}})
    for field, value in merged.items():
        setattr(location, field, value)
    if data.get("is_active") is not None:
        location.is_active = bool(data["is_active"])
    db.commit()
    db.refresh(location)
    return location


def location_usage(db: Session, location: CampaignPickupLocation) -> int:
    riders = db.query(RiderBrandKit.id).filter(RiderBrandKit.pickup_location_id == location.id).count()
    requests = db.query(CampaignApplication.id).filter(CampaignApplication.pickup_location_id == location.id).count()
    return riders + requests


def delete_location(db: Session, location: CampaignPickupLocation) -> None:
    """Only unused locations are deleted; a location riders were given is deactivated instead."""
    used = location_usage(db, location)
    if used:
        raise KitError(
            f"{used} rider{'s are' if used != 1 else ' is'} linked to this pickup location. "
            "Deactivate it instead (riders already assigned keep it), or move them to another location first."
        )
    db.delete(location)
    db.commit()


# ---------------------------------------------------------------------------
# Kit settings
# ---------------------------------------------------------------------------

def update_kit(db: Session, campaign: Campaign, tshirt_required: bool, size_options: Optional[str], instructions: Optional[str]) -> CampaignBrandKit:
    sizes = [s.strip().upper() for s in (size_options or DEFAULT_SIZES).split(",") if s.strip()]
    if tshirt_required and not sizes:
        raise KitError("Add at least one T-shirt size.")
    if len(set(sizes)) != len(sizes):
        raise KitError("Each T-shirt size should appear once.")
    kit = campaign.brand_kit
    if kit is None:
        kit = CampaignBrandKit(campaign=campaign)  # Also sets campaign.brand_kit for the checks below
        db.add(kit)
    kit.tshirt_required = bool(tshirt_required)
    kit.size_options = ",".join(sizes) or DEFAULT_SIZES
    kit.instructions = _clean(instructions)
    db.flush()

    rider_kits = {k.assignment_id: k for k in db.query(RiderBrandKit).filter(RiderBrandKit.campaign_id == campaign.id)}
    if kit.tshirt_required:
        # Riders already in the campaign get a kit record; re-enabling brings "Not Required" back to pending.
        only_location = _single_active_location_id(db, campaign)
        for a in campaign.assignments:
            if a.status not in AssignmentStatus.CURRENT:
                continue
            existing = rider_kits.get(a.id)
            if existing is None:
                application = db.get(CampaignApplication, a.application_id) if a.application_id else None
                db.add(
                    RiderBrandKit(
                        campaign_id=campaign.id,
                        assignment_id=a.id,
                        rider_id=a.rider_id,
                        tshirt_size=application.tshirt_size if application else None,
                        pickup_location_id=(application.pickup_location_id if application else None) or only_location,
                        status=KitStatus.PENDING,
                    )
                )
            elif existing.status == KitStatus.NOT_REQUIRED:
                existing.status = KitStatus.PENDING
    else:
        for existing in rider_kits.values():
            if existing.status != KitStatus.COLLECTED:
                existing.status = KitStatus.NOT_REQUIRED
    db.flush()
    sync_request_kits(db, campaign)
    db.commit()
    db.refresh(kit)
    return kit


def _single_active_location_id(db: Session, campaign: Campaign) -> Optional[int]:
    active = locations(db, campaign, active_only=True)
    return active[0].id if len(active) == 1 else None


# ---------------------------------------------------------------------------
# Joining and rider kits
# ---------------------------------------------------------------------------

def resolve_join_choice(db: Session, campaign: Campaign, tshirt_size: Optional[str], pickup_location_id: Optional[int]) -> Tuple[Optional[str], Optional[int]]:
    """Validates the size and pickup location given when joining. Nothing is needed without a kit."""
    if not kit_required(campaign):
        return None, None
    sizes = sizes_of(campaign.brand_kit)
    size = (tshirt_size or "").strip().upper() or None
    if not size or size not in sizes:
        raise KitError(f"Please choose a T-shirt size ({', '.join(sizes)}).")
    active = locations(db, campaign, active_only=True)
    if not active:
        return size, None  # Pickup point not announced yet; admin can set it later
    if len(active) == 1 and pickup_location_id in (None, active[0].id):
        return size, active[0].id
    if pickup_location_id is None:
        raise KitError("Please choose where you'll collect your T-shirt.")
    if pickup_location_id not in {l.id for l in active}:
        raise KitError("That pickup location isn't available for this campaign.")
    return size, pickup_location_id


def create_rider_kit(db: Session, campaign: Campaign, assignment: CampaignAssignment, application: CampaignApplication) -> Optional[RiderBrandKit]:
    if not kit_required(campaign):
        return None
    collected = request_kit_status(application) == KitStatus.COLLECTED
    kit = RiderBrandKit(
        campaign_id=campaign.id,
        assignment_id=assignment.id,
        rider_id=application.rider_id,
        tshirt_size=application.tshirt_size,
        pickup_location_id=application.pickup_location_id or _single_active_location_id(db, campaign),
        status=KitStatus.COLLECTED if collected else KitStatus.PENDING,
        collected_date=application.kit_collected_at.date() if collected and application.kit_collected_at else None,
        issued_by_id=application.kit_collected_by_id if collected else None,
    )
    db.add(kit)
    return kit


def update_rider_kit(
    db: Session, kit: RiderBrandKit, admin_id: int, status: Optional[str] = None, tshirt_size: Optional[str] = None,
    pickup_date: Optional[date] = None, pickup_location_id: Optional[int] = None, clear_pickup_date: bool = False,
) -> RiderBrandKit:
    if status is not None:
        if status not in KitStatus.ALL:
            raise KitError("Choose Not Required, Pending Collection, Ready for Pickup or Collected.")
        if status == KitStatus.COLLECTED and kit.status != KitStatus.COLLECTED:
            from app.services.fulfillment_service import today_ist

            kit.collected_date = today_ist()
            kit.issued_by_id = admin_id
        elif status != KitStatus.COLLECTED:
            kit.collected_date = None  # Undoing a mistaken "Collected"
            kit.issued_by_id = None
        kit.status = status
    if tshirt_size is not None:
        campaign = db.get(Campaign, kit.campaign_id)
        size = tshirt_size.strip().upper() or None
        if size and size not in sizes_of(campaign.brand_kit):
            raise KitError(f"Size must be one of {', '.join(sizes_of(campaign.brand_kit))}.")
        kit.tshirt_size = size
    if pickup_location_id is not None:
        location = db.get(CampaignPickupLocation, pickup_location_id)
        if not location or location.campaign_id != kit.campaign_id:
            raise KitError("That pickup location doesn't belong to this campaign.")
        kit.pickup_location_id = location.id
    if clear_pickup_date:
        kit.pickup_date = None
    elif pickup_date is not None:
        kit.pickup_date = pickup_date
    db.commit()
    db.refresh(kit)
    return kit


def summary(db: Session, campaign: Campaign) -> Dict:
    """Admin overview: riders, size-wise requirement, status counts and per-location counts."""
    assigned = db.query(CampaignAssignment).filter(
        CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.status.in_(AssignmentStatus.SLOT_HOLDING)
    ).count()
    kits = db.query(RiderBrandKit).filter(RiderBrandKit.campaign_id == campaign.id).all()
    needed = [k for k in kits if k.status != KitStatus.NOT_REQUIRED]
    by_size = Counter(k.tshirt_size or "Not set" for k in needed)
    sizes = sizes_of(campaign.brand_kit)
    status_of = lambda k: KitStatus.READY_FOR_PICKUP if k.status == KitStatus.PICKUP_SCHEDULED else KitStatus.PENDING if k.status == KitStatus.NOT_COLLECTED else k.status
    statuses = Counter(status_of(k) for k in kits)
    by_location = Counter(k.pickup_location_id for k in needed)
    return {
        "assigned_riders": assigned,
        "kits_needed": len(needed),
        "sizes": [{"size": s, "count": by_size.get(s, 0)} for s in sizes] + (
            [{"size": "Not set", "count": by_size["Not set"]}] if by_size.get("Not set") else []
        ),
        "pending": statuses.get(KitStatus.PENDING, 0),
        "ready": statuses.get(KitStatus.READY_FOR_PICKUP, 0),
        "collected": statuses.get(KitStatus.COLLECTED, 0),
        "not_required": statuses.get(KitStatus.NOT_REQUIRED, 0),
        "by_location": [{"location_id": lid, "count": n} for lid, n in by_location.items()],
    }


# ---------------------------------------------------------------------------
# Join requests: the T-shirt is collected before the admin approves the rider
# ---------------------------------------------------------------------------

REQUEST_KIT_STATUSES = (KitStatus.NOT_REQUIRED, KitStatus.PENDING, KitStatus.COLLECTED)


def request_kit_status(application: CampaignApplication) -> str:
    """Stored status, or derived for requests made before collection was tracked on requests."""
    if application.kit_status:
        return application.kit_status
    return KitStatus.PENDING if kit_required(application.campaign) else KitStatus.NOT_REQUIRED


def initial_request_kit_status(campaign: Campaign) -> str:
    return KitStatus.PENDING if kit_required(campaign) else KitStatus.NOT_REQUIRED


def set_request_kit(db: Session, application: CampaignApplication, admin_id: int, collected: bool, tshirt_size: Optional[str] = None) -> str:
    """Marks the requester's T-shirt as collected (or back to pending). Returns the previous status."""
    if application.status != ApplicationStatus.REQUESTED:
        raise KitError("Only pending requests can be updated.")
    campaign = application.campaign
    if not kit_required(campaign):
        raise KitError("This campaign doesn't require a T-shirt.")
    if tshirt_size:
        size = tshirt_size.strip().upper()
        if size not in sizes_of(campaign.brand_kit):
            raise KitError(f"Size must be one of {', '.join(sizes_of(campaign.brand_kit))}.")
        application.tshirt_size = size
    if collected and not application.tshirt_size:
        raise KitError("Set the T-shirt size that was handed over.")
    previous = request_kit_status(application)
    if collected:
        application.kit_status = KitStatus.COLLECTED
        application.kit_collected_at = datetime.utcnow()
        application.kit_collected_by_id = admin_id
    else:
        application.kit_status = KitStatus.PENDING
        application.kit_collected_at = None
        application.kit_collected_by_id = None
    db.commit()
    return previous


def sync_request_kits(db: Session, campaign: Campaign) -> None:
    """Keeps pending requests in line when "T-shirt required" is switched on or off."""
    required = kit_required(campaign)
    pending = db.query(CampaignApplication).filter(
        CampaignApplication.campaign_id == campaign.id, CampaignApplication.status == ApplicationStatus.REQUESTED
    )
    for application in pending:
        if required and request_kit_status(application) == KitStatus.NOT_REQUIRED:
            application.kit_status = KitStatus.PENDING
        elif not required and application.kit_status == KitStatus.PENDING:
            application.kit_status = KitStatus.NOT_REQUIRED
