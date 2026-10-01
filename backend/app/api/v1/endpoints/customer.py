import json
import logging
import re
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_customer, get_db
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, UserRole
from app.models.all_models import AuditLog, Brand, Notification, User
from app.models.campaign_models import (
    Campaign,
    CampaignActivityPhoto,
    PhotoStatus,
    CampaignAssignment,
    CampaignStatus,
    CampaignVisibility,
    VehicleCategory,
)
from app.schemas.all_schemas import Token
from app.schemas.customer_schemas import (
    CustomerCampaignCreate,
    CustomerCampaignResponse,
    CustomerCampaignUpdate,
    CustomerDashboardResponse,
    CustomerDocumentItem,
    CustomerLocationItem,
    CustomerProfileResponse,
    CustomerProfileUpdate,
    CustomerRiderRequirements,
    CustomerSignupRequest,
)
from app.services import campaign_service as svc
from app.services import fulfillment_service as fs
from app.services import geo_service as geo
from app.services import storage_service as storage
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification

logger = logging.getLogger("app.customer")
router = APIRouter()


def _parse_json(text: Optional[str], default=None):
    if not text:
        return default
    try:
        return json.loads(text)
    except Exception:
        return default


def _customer_campaign_response(campaign: Campaign, db: Session) -> CustomerCampaignResponse:
    """A brand's view of its own campaign. Every figure comes from the same records the admin sees."""
    locations = [
        CustomerLocationItem(
            city=loc.get("city", ""), area=loc.get("area", ""), address=loc.get("address"), riders_count=int(loc.get("riders_count", 1)),
        )
        for loc in _parse_json(campaign.locations_data, []) or []
        if isinstance(loc, dict)
    ]
    rider_reqs_raw = _parse_json(campaign.rider_requirements, None)
    rider_reqs = CustomerRiderRequirements(**{k: v for k, v in rider_reqs_raw.items() if k in CustomerRiderRequirements.model_fields}) \
        if isinstance(rider_reqs_raw, dict) and rider_reqs_raw else None

    documents = [
        CustomerDocumentItem(
            name=doc.get("name", "Document"),
            path=doc.get("path", ""),
            size=doc.get("size"),
            mime_type=doc.get("mime_type"),
            url=storage.signed_url(doc["path"].replace("/uploads/", "")) if doc.get("path") and "/uploads/" in doc["path"] else doc.get("path"),
        )
        for doc in _parse_json(campaign.documents, []) or []
        if isinstance(doc, dict)
    ]

    joined = svc.slots_used(db, campaign.id)
    status = svc.brand_status(campaign)
    fin = fs.brand_account_financials(db, campaign.brand) if campaign.brand else None
    live_or_done = status["key"] in ("LIVE", "PAUSED", "COMPLETED")
    approved_photos = (
        db.query(func.count(CampaignActivityPhoto.id))
        .filter(CampaignActivityPhoto.campaign_id == campaign.id, CampaignActivityPhoto.status == PhotoStatus.APPROVED)
        .scalar()
    )
    geo_data = _geo_dict(db, campaign)

    return CustomerCampaignResponse(
        id=campaign.id,
        campaign_code=svc.campaign_code(campaign.id),
        name=campaign.name,
        brand_id=campaign.brand_id,
        brand_name=campaign.brand.name if campaign.brand else "",
        campaign_type=campaign.campaign_type,
        campaign_objective=campaign.campaign_objective,
        description=campaign.description,
        locations=locations,
        location_area=campaign.location_area,
        start_date=campaign.start_date,
        end_date=fs.effective_end_date(campaign),
        daily_start_time=campaign.daily_start_time,
        daily_end_time=campaign.daily_end_time,
        total_riders=campaign.total_slots,
        assigned_riders_count=joined,
        joined_riders=joined,
        required_riders=campaign.total_slots,
        daily_rate=campaign.daily_rate or None,
        approved_photos=approved_photos,
        geo=geo_data,
        rider_requirements=rider_reqs,
        budget_type=campaign.budget_type,
        expected_rider_rate=campaign.expected_rider_rate,
        estimated_budget=campaign.estimated_budget,
        instructions=campaign.instructions,
        documents=documents,
        campaign_category=campaign.campaign_category,
        eligible_vehicle_categories=svc.eligible_categories(campaign),
        photo_slot_windows={slot: list(w) for slot, w in svc.slot_windows(campaign).items()},
        rules=campaign.rules,
        image_url=campaign.image_url,
        status=campaign.status,
        status_label=status["label"],
        brand_status=status["key"],
        submitted_at=campaign.submitted_at,
        approved_at=campaign.approved_at,
        admin_feedback=campaign.admin_feedback,
        contract_amount=campaign.brand_contract_value if live_or_done else None,
        total_paid=fin["total_paid"] if fin else 0.0,
        remaining_amount=fin["remaining_amount"] if fin else 0.0,
        payment_status=fin["payment_status"] if fin else None,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )


def _geo_dict(db: Session, campaign: Campaign) -> dict:
    remaining = svc.remaining_slots(db, campaign)
    state = geo.expansion_state(campaign, remaining, accepting=campaign.status == CampaignStatus.OPEN)
    return {
        "targeted": geo.is_targeted(campaign),
        "target_label": campaign.location_area,
        "target_lat": campaign.target_lat,
        "target_lng": campaign.target_lng,
        "initial_radius_km": campaign.initial_radius_km,
        "current_radius_km": geo.current_radius(campaign),
        "max_radius_km": campaign.max_radius_km,
        "expansion_step_km": campaign.expansion_step_km,
        "expansion_interval_min": campaign.expansion_interval_min,
        "expansion_label": state["label"],
    }


def _slot_windows(windows) -> Optional[str]:
    """Photo slot times, checked with the same rule as the admin form (stored as JSON; None = defaults)."""
    try:
        return svc.validate_slot_windows(windows)
    except svc.CampaignError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _own_campaign(db: Session, customer: User, campaign_id: int) -> Campaign:
    """The campaign only if it belongs to the signed-in brand (404 otherwise, so ids can't be probed)."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.brand_id == customer.brand_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return svc.sync_campaign_status(db, campaign)


BRAND_EDITABLE = (CampaignStatus.DRAFT, CampaignStatus.PENDING_APPROVAL, CampaignStatus.CHANGES_REQUIRED)


# ==================== 1. CUSTOMER SIGNUP ====================

@router.post("/auth/signup", response_model=Token)
def customer_signup(request: CustomerSignupRequest, db: Session = Depends(get_db)):
    """Registers a new Customer account, creates or links the Brand, and returns an auth token."""
    phone = request.mobile_number.strip()
    email = request.email.strip() if request.email else None

    # The mobile number is verified by an SMS code (same rule as rider sign-up) once SMS is set up.
    from app.services import sms_service as sms

    if sms.configured() and not sms.check_proof(sms.ten_digits(phone), request.phone_proof):
        raise HTTPException(status_code=400, detail="Verify your mobile number with the SMS code first.")

    # Check for existing user with this phone or email
    if db.query(User).filter(User.phone == phone).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this mobile number already exists. Please log in.",
        )
    if email and db.query(User).filter(func.lower(User.email) == email.lower()).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please log in.",
        )

    company_name = request.company_name.strip()
    # A new login is never attached to an existing brand (that would expose its campaigns to anyone who
    # types its name); existing brands get logins through FlexRiders.
    if db.query(Brand.id).filter(func.lower(Brand.name) == company_name.lower()).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A brand with this name is already registered with FlexRiders. Please contact us to get access to it.",
        )
    brand = None
    if not brand:
        prefix = re.sub(r'[^A-Z0-9]', '', company_name.upper())[:6] or "BRAND"
        unique_code = f"{prefix}{uuid.uuid4().hex[:4].upper()}"
        brand = Brand(
            name=company_name,
            code=unique_code,
            contact_person=request.full_name.strip(),
            contact_number=phone,
            gst_number=request.gst_number.strip() if request.gst_number else None,
            address=request.company_address.strip() if request.company_address else None,
            is_active=True,
        )
        db.add(brand)
        db.flush()

    user = User(
        phone=phone,
        email=email,
        hashed_password=get_password_hash(request.password),
        role=UserRole.CUSTOMER,
        brand_id=brand.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_admin_action(db=db, admin_user=None, action="BRAND_SIGNED_UP", target_type="BRAND", target_id=str(brand.id),
                     details=f"{brand.name} registered a brand account ({request.full_name}, {phone})")
    send_notification(db, title="New brand account", message=f"{brand.name} signed up as a brand ({request.full_name}).",
                      is_admin=True, category="BRAND", reference_id=str(brand.id))

    token = create_access_token(
        subject=user.id,
        role=user.role,
        password_hash=user.hashed_password,
    )

    send_notification(
        db,
        title="Welcome to FlexRiders",
        message=f"Welcome {request.full_name}! Your customer account for {brand.name} has been created.",
        user_id=user.id,
        category="SYSTEM",
    )

    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        brand_id=brand.id,
        brand_name=brand.name,
        name=request.full_name,
        must_change_password=False,
    )


# ==================== 2. CUSTOMER DASHBOARD ====================

@router.get("/dashboard", response_model=CustomerDashboardResponse)
def get_customer_dashboard(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Customer Dashboard: Overview metrics, recent campaigns, and customer-safe financial balance."""
    brand = db.query(Brand).filter(Brand.id == customer.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    campaigns = (
        db.query(Campaign)
        .filter(Campaign.brand_id == brand.id)
        .order_by(Campaign.created_at.desc())
        .all()
    )

    campaigns = [svc.sync_campaign_status(db, c) for c in campaigns]
    keys = [svc.brand_status(c)["key"] for c in campaigns]
    active_count = keys.count("LIVE")
    pending_count = keys.count("REQUESTED") + keys.count("CHANGES_REQUESTED")
    completed_count = keys.count("COMPLETED")

    recent = [_customer_campaign_response(c, db) for c in campaigns[:5]]
    fin = fs.brand_account_financials(db, brand)

    customer_name = brand.contact_person or customer.email or customer.phone

    return CustomerDashboardResponse(
        customer_name=customer_name,
        company_name=brand.name,
        brand_id=brand.id,
        active_campaigns_count=active_count,
        pending_campaigns_count=pending_count,
        completed_campaigns_count=completed_count,
        recent_campaigns=recent,
        status_counts={k: keys.count(k) for k in set(keys)},
        financial_summary={
            "contract_value": fin["contract_value"],
            "total_paid": fin["total_paid"],
            "remaining_amount": fin["remaining_amount"],
            "payment_status": fin["payment_status"],
        },
    )


# ==================== 3. CUSTOMER CAMPAIGNS LIST & CREATE ====================

@router.get("/planner-config")
def get_customer_planner_config(
    customer: User = Depends(get_current_customer),
):
    """Centralized configuration for customer campaign planning (minimum budget and baseline estimation rate)."""
    return {
        "minimum_budget": settings.MINIMUM_CAMPAIGN_BUDGET,
        "default_planning_rate": settings.DEFAULT_PLANNING_RIDER_RATE,
        "currency": "INR",
        "has_vehicle_specific_rates": False,
        "note": "Planning rates are estimates for campaign configuration. Final commercial terms and daily rates are confirmed by FlexRiders administration upon campaign approval.",
    }


@router.get("/campaigns", response_model=List[CustomerCampaignResponse])
def list_customer_campaigns(
    status_filter: str = Query("ALL", alias="status"),
    search: Optional[str] = None,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Lists the customer's own campaigns with optional status and search filtering."""
    query = db.query(Campaign).filter(Campaign.brand_id == customer.brand_id)
    # Tabs: REQUESTED (incl. changes requested), APPROVED, LIVE (incl. paused), COMPLETED, DRAFT, or ALL.
    wanted = {
        "REQUESTED": {"REQUESTED", "CHANGES_REQUESTED"}, "PENDING": {"REQUESTED", "CHANGES_REQUESTED"},
        "APPROVED": {"APPROVED"}, "LIVE": {"LIVE", "PAUSED"}, "ACTIVE": {"LIVE", "PAUSED"},
        "COMPLETED": {"COMPLETED"}, "DRAFT": {"DRAFT"}, "REJECTED": {"REJECTED", "CANCELLED"},
    }.get(status_filter.upper().strip())

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Campaign.name.ilike(term),
                Campaign.location_area.ilike(term),
                Campaign.campaign_type.ilike(term),
            )
        )

    campaigns = [svc.sync_campaign_status(db, c) for c in query.order_by(Campaign.created_at.desc()).all()]
    if wanted:
        campaigns = [c for c in campaigns if svc.brand_status(c)["key"] in wanted]
    return [_customer_campaign_response(c, db) for c in campaigns]


@router.post("/campaigns", response_model=CustomerCampaignResponse)
def create_customer_campaign(
    payload: CustomerCampaignCreate,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Creates a new campaign for the customer (Save Draft or Submit for Admin Review)."""
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")
    duration_days = (payload.end_date - payload.start_date).days + 1
    if duration_days < 1:
        raise HTTPException(status_code=400, detail="Campaign duration must be at least 1 day.")

    # Minimum budget validation (sourced from centralized config)
    if payload.estimated_budget is not None and payload.estimated_budget < settings.MINIMUM_CAMPAIGN_BUDGET:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum campaign budget is ₹{int(settings.MINIMUM_CAMPAIGN_BUDGET):,}."
        )
    if payload.submit and (payload.estimated_budget is None or payload.estimated_budget < settings.MINIMUM_CAMPAIGN_BUDGET):
        raise HTTPException(
            status_code=400,
            detail=f"Minimum campaign budget is ₹{int(settings.MINIMUM_CAMPAIGN_BUDGET):,}."
        )

    # Compute total riders across locations & validate whole-number positive riders
    if payload.locations:
        for loc in payload.locations:
            if loc.riders_count < 1:
                raise HTTPException(status_code=400, detail="Location rider count must be at least 1.")
        total_riders = sum(loc.riders_count for loc in payload.locations)
    else:
        total_riders = payload.total_riders
    if total_riders < 1:
        raise HTTPException(status_code=400, detail="Total rider count must be at least 1.")

    location_summary = (payload.target_label or "").strip() or (
        "; ".join(", ".join(p for p in (loc.area, loc.city) if p) for loc in payload.locations[:3]) if payload.locations else None
    )
    if payload.submit and not location_summary:
        raise HTTPException(status_code=400, detail="Choose the campaign's target area.")

    locations_json = json.dumps([loc.model_dump() for loc in payload.locations]) if payload.locations else "[]"
    rider_reqs_json = json.dumps(payload.rider_requirements.model_dump()) if payload.rider_requirements else "{}"
    docs_json = json.dumps([d.model_dump() for d in payload.documents]) if payload.documents else "[]"

    initial_status = CampaignStatus.PENDING_APPROVAL if payload.submit else CampaignStatus.DRAFT

    # Eligible vehicles: the list from the form (same as the admin's); older app versions send one type.
    if payload.eligible_vehicle_categories is not None:
        allowed_vehicles = ",".join(payload.eligible_vehicle_categories) or None
    else:
        vehicle_cat = payload.rider_requirements.vehicle_type if payload.rider_requirements else None
        allowed_vehicles = vehicle_cat if vehicle_cat in VehicleCategory.ALL else None
    slot_windows = _slot_windows(payload.photo_slot_windows)

    campaign = Campaign(
        name=payload.name.strip(),
        brand_id=customer.brand_id,
        created_by_id=customer.id,
        campaign_type=payload.campaign_type,
        campaign_objective=payload.campaign_objective,
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        total_slots=total_riders,
        daily_rate=payload.expected_rider_rate or 0.0,  # Proposed rider payout/day; the admin confirms it on approval
        brand_contract_value=0.0,  # Confirmed by Admin upon approval
        location_area=location_summary,
        eligible_vehicle_categories=allowed_vehicles,
        campaign_category=payload.campaign_category,
        photo_slot_windows=slot_windows,
        rules=(payload.rules or "").strip() or None,
        target_lat=payload.target_lat,
        target_lng=payload.target_lng,
        initial_radius_km=payload.initial_radius_km,
        max_radius_km=payload.max_radius_km,
        expansion_step_km=payload.expansion_step_km,
        expansion_interval_min=payload.expansion_interval_min,
        submitted_at=datetime.utcnow() if payload.submit else None,
        status=initial_status,
        visibility=CampaignVisibility.DRAFT,
        locations_data=locations_json,
        daily_start_time=payload.daily_start_time,
        daily_end_time=payload.daily_end_time,
        rider_requirements=rider_reqs_json,
        budget_type=payload.budget_type,
        expected_rider_rate=payload.expected_rider_rate,
        estimated_budget=payload.estimated_budget,
        instructions=payload.instructions,
        documents=docs_json,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    log_admin_action(db=db, admin_user=customer, action="CAMPAIGN_REQUESTED" if payload.submit else "CAMPAIGN_DRAFTED_BY_BRAND",
                     target_type="CAMPAIGN", target_id=str(campaign.id),
                     details=f"{svc.campaign_code(campaign.id)} {campaign.name} created by {campaign.brand.name}" + (" and submitted for review" if payload.submit else " as a draft"))

    if payload.submit:
        from app.services.realtime_service import broadcast_campaign_update
        broadcast_campaign_update(campaign, "campaign_requested")
        # Notify admins that a new campaign has been submitted for review
        send_notification(
            db,
            title="New Campaign Submitted",
            message=f"{campaign.brand.name} submitted campaign '{campaign.name}' for approval.",
            is_admin=True,
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
        # Notify customer
        send_notification(
            db,
            title="Campaign Submitted",
            message=f"Your campaign '{campaign.name}' has been sent to the FlexRiders team for review.",
            user_id=customer.id,
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )

    return _customer_campaign_response(campaign, db)


# ==================== 4. CAMPAIGN DETAILS & EDIT ====================

@router.get("/campaigns/{id}", response_model=CustomerCampaignResponse)
def get_customer_campaign(
    id: int,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Retrieves a single campaign. Strictly enforces tenant isolation (brand_id match)."""
    campaign = (
        db.query(Campaign)
        .filter(Campaign.id == id, Campaign.brand_id == customer.brand_id)
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return _customer_campaign_response(campaign, db)


@router.put("/campaigns/{id}", response_model=CustomerCampaignResponse)
def update_customer_campaign(
    id: int,
    payload: CustomerCampaignUpdate,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Edits a draft campaign or resubmits after Admin requested changes."""
    campaign = _own_campaign(db, customer, id)
    if campaign.status not in BRAND_EDITABLE or campaign.approved_at:
        raise HTTPException(
            status_code=400,
            detail="This campaign has already been approved, so it can't be changed here. Contact FlexRiders for changes.",
        )

    # Date and duration validation
    eff_start = payload.start_date or campaign.start_date
    eff_end = payload.end_date or campaign.end_date
    if eff_end < eff_start:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")
    duration_days = (eff_end - eff_start).days + 1
    if duration_days < 1:
        raise HTTPException(status_code=400, detail="Campaign duration must be at least 1 day.")

    # Minimum budget validation
    if payload.estimated_budget is not None and payload.estimated_budget < settings.MINIMUM_CAMPAIGN_BUDGET:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum campaign budget is ₹{int(settings.MINIMUM_CAMPAIGN_BUDGET):,}."
        )
    eff_budget = payload.estimated_budget if payload.estimated_budget is not None else campaign.estimated_budget
    if payload.submit is True and (eff_budget is None or eff_budget < settings.MINIMUM_CAMPAIGN_BUDGET):
        raise HTTPException(
            status_code=400,
            detail=f"Minimum campaign budget is ₹{int(settings.MINIMUM_CAMPAIGN_BUDGET):,}."
        )

    # Rider counts validation
    if payload.locations is not None:
        for loc in payload.locations:
            if loc.riders_count < 1:
                raise HTTPException(status_code=400, detail="Location rider count must be at least 1.")
        if sum(loc.riders_count for loc in payload.locations) < 1:
            raise HTTPException(status_code=400, detail="Total rider count must be at least 1.")
    elif payload.total_riders is not None and payload.total_riders < 1:
        raise HTTPException(status_code=400, detail="Total rider count must be at least 1.")

    if payload.name is not None:
        campaign.name = payload.name.strip()
    if payload.campaign_type is not None:
        campaign.campaign_type = payload.campaign_type
    if payload.campaign_objective is not None:
        campaign.campaign_objective = payload.campaign_objective
    if payload.description is not None:
        campaign.description = payload.description
    if payload.start_date is not None:
        campaign.start_date = payload.start_date
    if payload.end_date is not None:
        campaign.end_date = payload.end_date
    if payload.daily_start_time is not None:
        campaign.daily_start_time = payload.daily_start_time
    if payload.daily_end_time is not None:
        campaign.daily_end_time = payload.daily_end_time
    if payload.instructions is not None:
        campaign.instructions = payload.instructions
    if payload.budget_type is not None:
        campaign.budget_type = payload.budget_type
    if payload.expected_rider_rate is not None:
        campaign.expected_rider_rate = payload.expected_rider_rate
    if payload.estimated_budget is not None:
        campaign.estimated_budget = payload.estimated_budget

    if payload.total_riders is not None:
        campaign.total_slots = payload.total_riders
    if payload.expected_rider_rate is not None:
        campaign.daily_rate = payload.expected_rider_rate
    if payload.locations is not None:
        campaign.locations_data = json.dumps([loc.model_dump() for loc in payload.locations])
        campaign.total_slots = sum(loc.riders_count for loc in payload.locations) or campaign.total_slots
        if not payload.target_label:
            campaign.location_area = "; ".join(", ".join(p for p in (loc.area, loc.city) if p) for loc in payload.locations[:3]) or None
    if payload.target_label is not None:
        campaign.location_area = payload.target_label.strip() or None
    for field in ("target_lat", "target_lng", "initial_radius_km", "max_radius_km", "expansion_step_km", "expansion_interval_min"):
        if field in payload.model_fields_set:
            setattr(campaign, field, getattr(payload, field))

    if payload.rider_requirements is not None:
        campaign.rider_requirements = json.dumps(payload.rider_requirements.model_dump())
        vehicle_cat = payload.rider_requirements.vehicle_type
        if payload.eligible_vehicle_categories is None:  # Older app versions: one vehicle type
            if vehicle_cat in VehicleCategory.ALL:
                campaign.eligible_vehicle_categories = vehicle_cat
            elif vehicle_cat == "ANY":
                campaign.eligible_vehicle_categories = None
    if payload.eligible_vehicle_categories is not None:
        campaign.eligible_vehicle_categories = ",".join(payload.eligible_vehicle_categories) or None
    if "campaign_category" in payload.model_fields_set:
        campaign.campaign_category = payload.campaign_category
    if "photo_slot_windows" in payload.model_fields_set:
        campaign.photo_slot_windows = _slot_windows(payload.photo_slot_windows)
    if payload.rules is not None:
        campaign.rules = payload.rules.strip() or None

    if payload.documents is not None:
        campaign.documents = json.dumps([d.model_dump() for d in payload.documents])

    # Resubmit handling
    if payload.submit is True:
        if not campaign.location_area:
            raise HTTPException(status_code=400, detail="Choose the campaign's target area.")
        was_changes_required = campaign.status == CampaignStatus.CHANGES_REQUIRED
        campaign.status = CampaignStatus.PENDING_APPROVAL
        campaign.submitted_at = datetime.utcnow()
        db.commit()
        log_admin_action(db=db, admin_user=customer, action="CAMPAIGN_REQUESTED", target_type="CAMPAIGN", target_id=str(campaign.id),
                         details=f"{svc.campaign_code(campaign.id)} {campaign.name} {'resubmitted' if was_changes_required else 'submitted'} for review by {campaign.brand.name}")
        from app.services.realtime_service import broadcast_campaign_update
        broadcast_campaign_update(campaign, "campaign_requested")

        # Notify admin of resubmission
        msg = f"Campaign '{campaign.name}' resubmitted after changes by {campaign.brand.name}." if was_changes_required else f"Campaign '{campaign.name}' submitted for approval."
        send_notification(
            db,
            title="Campaign Resubmitted" if was_changes_required else "Campaign Submitted",
            message=msg,
            is_admin=True,
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
        # Notify customer
        send_notification(
            db,
            title="Campaign Resubmitted" if was_changes_required else "Campaign Submitted",
            message=f"Your campaign '{campaign.name}' has been sent to the FlexRiders team for review.",
            user_id=customer.id,
            category="CAMPAIGN",
            reference_id=str(campaign.id),
        )
    else:
        db.commit()

    db.refresh(campaign)
    return _customer_campaign_response(campaign, db)


# ==================== 5. DOCUMENT UPLOAD ====================

@router.post("/campaigns/{id}/image", response_model=CustomerCampaignResponse)
async def upload_campaign_banner(
    id: int,
    image: UploadFile = File(...),
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """The campaign banner (optional), like the admin form's; only while the request can still be edited."""
    from app.api.v1.endpoints.campaigns import _save_image

    campaign = _own_campaign(db, customer, id)
    if campaign.status not in BRAND_EDITABLE or campaign.approved_at:
        raise HTTPException(status_code=400, detail="This campaign has already been approved. Contact FlexRiders to change its banner.")
    campaign.image_url = await _save_image(image, "campaigns")
    db.commit()
    db.refresh(campaign)
    return _customer_campaign_response(campaign, db)


@router.post("/campaigns/{id}/documents", response_model=CustomerDocumentItem)
async def upload_campaign_document(
    id: int,
    file: UploadFile = File(...),
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Uploads a brief, logo, or document for a campaign."""
    campaign = (
        db.query(Campaign)
        .filter(Campaign.id == id, Campaign.brand_id == customer.brand_id)
        .first()
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:  # 15 MB limit
        raise HTTPException(status_code=400, detail="File size exceeds 15 MB limit.")

    ext = "." + (file.filename.split(".")[-1].lower() if "." in file.filename else "bin")
    path = storage.save(content, ext, "campaign-documents", file.content_type or "application/octet-stream")

    doc_item = {
        "name": file.filename or f"document{ext}",
        "path": path,
        "size": len(content),
        "mime_type": file.content_type,
    }

    current_docs = _parse_json(campaign.documents, [])
    current_docs.append(doc_item)
    campaign.documents = json.dumps(current_docs)
    db.commit()

    signed = storage.signed_url(path.replace("/uploads/", ""))
    return CustomerDocumentItem(
        name=doc_item["name"],
        path=path,
        size=doc_item["size"],
        mime_type=doc_item["mime_type"],
        url=signed or path,
    )


# ==================== 6. NOTIFICATIONS ====================

@router.get("/notifications")
def get_customer_notifications(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Returns in-app notifications for the customer."""
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == customer.id)
        .order_by(Notification.created_at.desc())
        .limit(40)
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "category": n.category,
            "reference_id": n.reference_id,
            "is_read": bool(n.is_read),
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]


@router.put("/notifications/{id}/read")
def mark_notification_read(
    id: int,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Marks a notification as read."""
    notif = db.query(Notification).filter(Notification.id == id, Notification.user_id == customer.id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"success": True}


# ==================== 7. CUSTOMER PROFILE ====================

@router.get("/profile", response_model=CustomerProfileResponse)
def get_customer_profile(
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Returns company and profile information for the logged-in customer."""
    brand = db.query(Brand).filter(Brand.id == customer.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    return CustomerProfileResponse(
        user_id=customer.id,
        full_name=brand.contact_person or customer.email or customer.phone,
        email=customer.email,
        mobile_number=customer.phone,
        brand_id=brand.id,
        company_name=brand.name,
        contact_person=brand.contact_person,
        contact_number=brand.contact_number,
        gst_number=brand.gst_number,
        company_address=brand.address,
        logo=brand.logo,
    )


@router.put("/profile", response_model=CustomerProfileResponse)
def update_customer_profile(
    payload: CustomerProfileUpdate,
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Updates company profile and contact details."""
    brand = db.query(Brand).filter(Brand.id == customer.brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    if payload.full_name:
        brand.contact_person = payload.full_name.strip()
    if payload.contact_person:
        brand.contact_person = payload.contact_person.strip()
    if payload.contact_number:
        brand.contact_number = payload.contact_number.strip()
    if payload.gst_number is not None:
        brand.gst_number = payload.gst_number.strip() or None
    if payload.company_address is not None:
        brand.address = payload.company_address.strip() or None
    if payload.company_name and payload.company_name.strip() != brand.name:
        brand.name = payload.company_name.strip()

    if payload.email and payload.email.strip().lower() != (customer.email or "").lower():
        existing = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower(), User.id != customer.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="This email is already in use by another account.")
        customer.email = payload.email.strip().lower()

    db.commit()
    db.refresh(brand)
    db.refresh(customer)

    return get_customer_profile(customer, db)


# ==================== 8. CAMPAIGN MONITORING (own campaigns only) ====================

@router.get("/campaigns/{id}/riders")
def customer_campaign_riders(id: int, customer: User = Depends(get_current_customer), db: Session = Depends(get_db)):
    """Riders taking part in the brand's own campaign: name, rider ID, participation and approved photos.
    No phone numbers, payment details or other private rider data."""
    campaign = _own_campaign(db, customer, id)
    approved = dict(
        db.query(CampaignActivityPhoto.rider_id, func.count(CampaignActivityPhoto.id))
        .filter(CampaignActivityPhoto.campaign_id == campaign.id, CampaignActivityPhoto.status == PhotoStatus.APPROVED)
        .group_by(CampaignActivityPhoto.rider_id)
        .all()
    )
    labels = {"ASSIGNED": "Joined", "ACTIVE": "Active", "COMPLETED": "Completed", "REMOVED": "Removed", "CANCELLED": "Cancelled"}
    rows = [
        {
            "assignment_id": a.id,
            "rider_id": a.rider.rider_id,
            "name": a.rider.full_name,
            "status": a.status,
            "status_label": labels.get(a.status, a.status.title()),
            "joined_at": a.assigned_at,
            "ended_at": a.ended_at,
            "approved_days": a.payout.eligible_days if a.payout else 0,
            "approved_photos": approved.get(a.rider_id, 0),
        }
        for a in db.query(CampaignAssignment).filter(CampaignAssignment.campaign_id == campaign.id).order_by(CampaignAssignment.assigned_at).all()
        if a.rider
    ]
    return {
        "campaign_code": svc.campaign_code(campaign.id),
        "required_riders": campaign.total_slots,
        "joined_riders": svc.slots_used(db, campaign.id),
        "riders": rows,
    }


@router.get("/campaigns/{id}/photos")
def customer_campaign_photos(
    id: int,
    day: Optional[date] = Query(None, alias="date"),
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Approved proof photos only. Without a date: approved photo count per day. With a date: that day's
    approved photos."""
    from app.models.campaign_models import CampaignDailyActivity, PhotoSlot

    campaign = _own_campaign(db, customer, id)
    base = (
        db.query(CampaignActivityPhoto, CampaignDailyActivity.activity_date)
        .join(CampaignDailyActivity, CampaignActivityPhoto.activity_id == CampaignDailyActivity.id)
        .filter(CampaignActivityPhoto.campaign_id == campaign.id, CampaignActivityPhoto.status == PhotoStatus.APPROVED)
    )
    if day is None:
        counts = (
            db.query(CampaignDailyActivity.activity_date, func.count(CampaignActivityPhoto.id))
            .join(CampaignActivityPhoto, CampaignActivityPhoto.activity_id == CampaignDailyActivity.id)
            .filter(CampaignActivityPhoto.campaign_id == campaign.id, CampaignActivityPhoto.status == PhotoStatus.APPROVED)
            .group_by(CampaignDailyActivity.activity_date)
            .order_by(CampaignDailyActivity.activity_date.desc())
            .all()
        )
        return {"days": [{"date": d.isoformat(), "approved_photos": n} for d, n in counts]}
    rows = base.filter(CampaignDailyActivity.activity_date == day).order_by(CampaignActivityPhoto.id).all()
    return {
        "date": day.isoformat(),
        "photos": [
            {"id": p.id, "photo_url": p.photo_url, "rider_name": p.activity.rider.full_name if p.activity.rider else None,
             "slot_label": PhotoSlot.LABELS.get(p.slot) if p.slot else None, "uploaded_at": p.uploaded_at}
            for p, _ in rows
        ],
    }


@router.get("/campaigns/{id}/map")
def customer_campaign_map(
    id: int,
    day: Optional[date] = Query(None, alias="date"),
    customer: User = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    """Campaign-level map: the target area and radius, the days with recorded routes and, for a chosen
    day, each of the brand's campaign riders' route (an activity card per rider, like a fitness app):
    the line plus facts measured from the recorded points (distance, first/last fix, time between them)
    and that rider's approved photos that day. Today's routes are still growing (in_progress)."""
    from app.models.campaign_models import CampaignDailyActivity
    from app.services import route_service as routes

    campaign = _own_campaign(db, customer, id)
    data = {"geo": _geo_dict(db, campaign), "route_dates": routes.route_dates(db, campaign), "routes": []}
    if day:
        photos = dict(
            db.query(CampaignActivityPhoto.rider_id, func.count(CampaignActivityPhoto.id))
            .join(CampaignDailyActivity, CampaignActivityPhoto.activity_id == CampaignDailyActivity.id)
            .filter(CampaignActivityPhoto.campaign_id == campaign.id, CampaignActivityPhoto.status == PhotoStatus.APPROVED,
                    CampaignDailyActivity.activity_date == day)
            .group_by(CampaignActivityPhoto.rider_id)
            .all()
        )
        in_progress = day >= fs.today_ist()
        data["date"] = day.isoformat()
        data["routes"] = []
        for r in routes.routes_for_day(db, campaign, day):
            rider = r["rider"] or {}
            started, ended = (datetime.fromisoformat(r[k].rstrip("Z")) for k in ("started_at", "ended_at"))
            data["routes"].append({
                "rider_name": rider.get("full_name"), "rider_code": rider.get("rider_id"), "points": r["points"],
                "started_at": r["started_at"], "ended_at": r["ended_at"], "distance_km": r["distance_km"],
                "duration_min": int((ended - started).total_seconds() // 60),
                "approved_photos": photos.get(rider.get("id"), 0), "in_progress": in_progress,
            })
    return data


@router.get("/realtime")
def customer_realtime(customer: User = Depends(get_current_customer)):
    """Where the brand app listens for 'your campaign changed' signals (status, riders, photos)."""
    from app.services.realtime_service import brand_realtime_config

    return brand_realtime_config(customer.brand_id)
