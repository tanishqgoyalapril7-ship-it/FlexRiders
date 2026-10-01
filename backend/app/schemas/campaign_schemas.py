from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.campaign_models import CampaignCategory, VehicleCategory


class GeoTargetFields(BaseModel):
    """Campaign target and radius expansion. Coordinates come from the area search or a map pin."""
    target_lat: Optional[float] = Field(None, ge=-90, le=90)
    target_lng: Optional[float] = Field(None, ge=-180, le=180)
    initial_radius_km: Optional[float] = Field(None, gt=0, le=100)
    max_radius_km: Optional[float] = Field(None, gt=0, le=100)
    expansion_step_km: Optional[float] = Field(None, gt=0, le=50)
    expansion_interval_min: Optional[int] = Field(None, ge=5, le=10080)
    daily_start_time: Optional[str] = Field(None, max_length=20)
    daily_end_time: Optional[str] = Field(None, max_length=20)

    @model_validator(mode="after")
    def check_geo(self):
        if (self.target_lat is None) != (self.target_lng is None):
            raise ValueError("Pick the target location again: both latitude and longitude are needed")
        if self.target_lat is not None and not self.initial_radius_km:
            raise ValueError("Set an initial radius for the target location")
        from app.services.geo_service import validate_geo_config

        problem = validate_geo_config(self.initial_radius_km, self.max_radius_km, self.expansion_step_km, self.expansion_interval_min)
        if problem:
            raise ValueError(problem)
        return self


class GeoActionRequest(BaseModel):
    action: str = Field(..., pattern="^(expand|pause|resume|set)$")
    radius_km: Optional[float] = Field(None, gt=0, le=100)


class CampaignReviewRequest(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|request_changes)$")
    note: Optional[str] = Field(None, max_length=1000)


class CampaignBase(GeoTargetFields):
    name: str = Field(..., min_length=3, max_length=150)
    brand_id: int
    description: Optional[str] = None
    rules: Optional[str] = None  # One requirement per line
    image_url: Optional[str] = None
    start_date: date
    end_date: date
    total_slots: int = Field(..., ge=1, le=10000)  # Required riders
    daily_rate: float = Field(..., gt=0, le=100000)  # Rider payout per approved day
    brand_contract_value: float = Field(0, ge=0)  # What the brand pays; independent of rider payout
    allow_payout_beyond_contract: bool = False
    continue_after_fulfillment: bool = False
    location_area: Optional[str] = Field(None, max_length=200)
    # Vehicle categories that may join; empty/None = all.
    eligible_vehicle_categories: Optional[List[str]] = None
    campaign_category: Optional[str] = Field(None, max_length=30)  # Label only (Standard, Bike, Cycle, TV, Google, …)
    public_image_approved: Optional[bool] = None  # Banner may be shown on the public page (rights confirmed)
    brand_payment_due_date: Optional[date] = None  # Unpaid balance after this date shows as Overdue

    @field_validator("campaign_category")
    @classmethod
    def _valid_category(cls, value):
        if not value:
            return None
        value = value.strip().upper().replace(" ", "_")
        if value not in CampaignCategory.ALL:
            raise ValueError(f"Campaign category must be one of: {', '.join(CampaignCategory.LABELS.values())}")
        return value
    # {"MORNING": ["06:00", "11:00"], "EVENING": [...], "NIGHT": [...]}; None = default slot times.
    photo_slot_windows: Optional[Dict[str, List[str]]] = None

    @field_validator("eligible_vehicle_categories")
    @classmethod
    def _valid_categories(cls, value):
        if not value:
            return None
        from app.schemas.all_schemas import normalize_vehicle_category

        # Same parsing as rider registration: "AUTO", "auto", "Auto" and "Auto rickshaw" all mean AUTO.
        cleaned = set()
        for v in value:
            try:
                code = normalize_vehicle_category(str(v))
            except ValueError:
                raise ValueError(f"Unknown vehicle category: {v}")
            if code:
                cleaned.add(code)
        return [c for c in VehicleCategory.ALL if c in cleaned] or None

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after the start date")
        return self


class CampaignCreate(CampaignBase):
    visibility: str = Field("DRAFT", pattern="^(DRAFT|PUBLIC)$")
    # Publishes FlexRiders' standard terms as version 1 when the campaign is created.
    publish_standard_terms: bool = False


class CampaignUpdate(GeoTargetFields):
    name: Optional[str] = Field(None, min_length=3, max_length=150)
    brand_id: Optional[int] = None
    description: Optional[str] = None
    rules: Optional[str] = None
    image_url: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_slots: Optional[int] = Field(None, ge=1, le=10000)
    daily_rate: Optional[float] = Field(None, gt=0, le=100000)
    brand_contract_value: Optional[float] = Field(None, ge=0)
    allow_payout_beyond_contract: Optional[bool] = None
    continue_after_fulfillment: Optional[bool] = None
    location_area: Optional[str] = Field(None, max_length=200)
    eligible_vehicle_categories: Optional[List[str]] = None
    campaign_category: Optional[str] = Field(None, max_length=30)
    public_image_approved: Optional[bool] = None
    brand_payment_due_date: Optional[date] = None
    photo_slot_windows: Optional[Dict[str, List[str]]] = None

    @field_validator("campaign_category")
    @classmethod
    def _valid_category(cls, value):
        if not value:
            return None
        value = value.strip().upper().replace(" ", "_")
        if value not in CampaignCategory.ALL:
            raise ValueError(f"Campaign category must be one of: {', '.join(CampaignCategory.LABELS.values())}")
        return value

    @field_validator("eligible_vehicle_categories")
    @classmethod
    def _valid_categories(cls, value):
        if not value:
            return None
        from app.schemas.all_schemas import normalize_vehicle_category

        cleaned = set()
        for v in value:
            try:
                code = normalize_vehicle_category(str(v))
            except ValueError:
                raise ValueError(f"Unknown vehicle category: {v}")
            if code:
                cleaned.add(code)
        return [c for c in VehicleCategory.ALL if c in cleaned] or None


class ReasonRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)


class ApproveApplicationRequest(BaseModel):
    replacement_for_assignment_id: Optional[int] = None


class RoutePointIn(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    recorded_at: datetime
    accuracy: Optional[float] = Field(None, ge=0)


class RoutePointsUpload(BaseModel):
    points: List[RoutePointIn] = Field(..., max_length=500)


class RequestKitUpdate(BaseModel):
    collected: bool
    tshirt_size: Optional[str] = Field(None, max_length=10)


class AdminAddRiderRequest(BaseModel):
    rider_id: int
    kit_collected: bool = False  # Admin confirms the T-shirt was handed over (when the campaign needs one)
    tshirt_size: Optional[str] = Field(None, max_length=10)
    pickup_location_id: Optional[int] = None
    replacement_for_assignment_id: Optional[int] = None


class JoinCampaignRequest(BaseModel):
    tshirt_size: Optional[str] = Field(None, max_length=10)
    pickup_location_id: Optional[int] = None
    terms_version: Optional[int] = None  # The Terms & Conditions version the rider read and accepted
    lat: Optional[float] = Field(None, ge=-90, le=90)  # The rider's current location, for geo-targeted campaigns
    lng: Optional[float] = Field(None, ge=-180, le=180)


class TermsPublishRequest(BaseModel):
    body: str = Field(..., max_length=50_000)
    change_note: Optional[str] = Field(None, max_length=500)


class TermsAcceptRequest(BaseModel):
    version: int


class ReplacementSlotsRequest(BaseModel):
    extra_replacement_slots: int = Field(..., ge=0, le=1000)


class ExtensionCreate(BaseModel):
    start_date: date
    end_date: date
    reason: str = Field(..., min_length=3, max_length=500)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("Extension end date must be on or after its start date")
        return self


class BrandPaymentCreate(BaseModel):
    kind: str = Field(..., pattern="^(RECEIVED|REFUND|CREDIT)$")
    amount: float = Field(..., gt=0, le=100_000_000)
    record_date: date
    campaign_id: Optional[int] = None  # Null for general brand-level payments, or set for campaign-specific payments
    # How the money moved (UPI, BANK_TRANSFER, IMPS, RTGS, CHEQUE, CASH, CARD, OTHER). Required for money received.
    payment_mode: Optional[str] = Field(None, max_length=20)
    reference: Optional[str] = Field(None, max_length=120)  # Transaction ID / UTR / cheque number
    note: Optional[str] = Field(None, max_length=500)

    @field_validator("payment_mode")
    @classmethod
    def _valid_mode(cls, value):
        from app.models.campaign_models import BrandPaymentMode

        if not value:
            return None
        import re

        value = re.sub(r"[^A-Z0-9]+", "_", value.strip().upper()).strip("_")  # "Bank Transfer / NEFT" → BANK_TRANSFER_NEFT
        value = {"NEFT": "BANK_TRANSFER", "BANK": "BANK_TRANSFER", "BANK_TRANSFER_NEFT": "BANK_TRANSFER"}.get(value, value)
        if value not in BrandPaymentMode.ALL:
            raise ValueError("Payment mode must be one of: " + ", ".join(BrandPaymentMode.LABELS.values()))
        return value

    @model_validator(mode="after")
    def _mode_for_money_received(self):
        if self.kind == "RECEIVED" and not self.payment_mode:
            raise ValueError("Select how the payment was made (payment mode).")
        return self


class BrandPaymentCancel(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class CampaignVideoLink(BaseModel):
    video_url: str = Field(..., min_length=10, max_length=500)

    @field_validator("video_url")
    @classmethod
    def _https_only(cls, value):
        from urllib.parse import urlparse

        value = value.strip()
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.netloc or " " in value:
            raise ValueError("Enter a full https:// link to the video (for example a YouTube or Google Drive link).")
        return value


class CampaignVideoUploadRequest(BaseModel):
    content_type: str = Field(..., max_length=40)
    size: int = Field(..., gt=0)


class CampaignVideoConfirm(BaseModel):
    path: str = Field(..., max_length=300)


class AdjustmentResolve(BaseModel):
    status: str = Field(..., pattern="^(RECOVERED|WAIVED)$")
    note: Optional[str] = Field(None, max_length=500)


class BrandKitUpdate(BaseModel):
    tshirt_required: bool = False
    size_options: Optional[str] = Field("S,M,L,XL,XXL", max_length=120)
    instructions: Optional[str] = Field(None, max_length=2000)
    return_required: Optional[bool] = None
    return_incentive: Optional[float] = Field(None, ge=0, le=10000)
    return_instructions: Optional[str] = Field(None, max_length=2000)


class PickupLocationCreate(BaseModel):
    name: str = Field(..., max_length=150)
    address: str = Field(..., max_length=500)
    map_url: Optional[str] = Field(None, max_length=500)
    available_from: Optional[date] = None
    available_to: Optional[date] = None
    available_days: Optional[str] = Field(None, max_length=60)
    start_time: Optional[str] = Field(None, max_length=5)
    end_time: Optional[str] = Field(None, max_length=5)
    contact_name: Optional[str] = Field(None, max_length=120)
    contact_phone: Optional[str] = Field(None, max_length=30)
    instructions: Optional[str] = Field(None, max_length=2000)
    purpose: Optional[str] = Field(None, pattern="^(PICKUP|RETURN)$")


class PickupLocationUpdate(BaseModel):
    """Only the fields sent change; send null/"" to clear an optional field."""
    name: Optional[str] = Field(None, max_length=150)
    address: Optional[str] = Field(None, max_length=500)
    map_url: Optional[str] = Field(None, max_length=500)
    available_from: Optional[date] = None
    available_to: Optional[date] = None
    available_days: Optional[str] = Field(None, max_length=60)
    start_time: Optional[str] = Field(None, max_length=5)
    end_time: Optional[str] = Field(None, max_length=5)
    contact_name: Optional[str] = Field(None, max_length=120)
    contact_phone: Optional[str] = Field(None, max_length=30)
    instructions: Optional[str] = Field(None, max_length=2000)
    is_active: Optional[bool] = None
    purpose: Optional[str] = Field(None, pattern="^(PICKUP|RETURN)$")


class RiderKitUpdate(BaseModel):
    status: Optional[str] = None
    tshirt_size: Optional[str] = Field(None, max_length=10)
    pickup_date: Optional[date] = None
    clear_pickup_date: bool = False
    pickup_location_id: Optional[int] = None


class ExcuseRequest(BaseModel):
    day: date
    reason: str = Field(..., min_length=3, max_length=255)


class ShareCampaignRequest(BaseModel):
    enabled: bool = True
