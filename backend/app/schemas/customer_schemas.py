from datetime import date, datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator
from app.core.config import settings
from app.schemas.campaign_schemas import GeoTargetFields


class CustomerSignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    company_name: str = Field(..., min_length=2, max_length=120)
    mobile_number: str = Field(..., min_length=10, max_length=20)
    email: Optional[str] = None
    password: str = Field(..., min_length=6, max_length=100)
    confirm_password: Optional[str] = None
    gst_number: Optional[str] = None
    company_address: Optional[str] = None
    # Proof the mobile number was verified by SMS code (from /auth/phone/verify-code); needed when SMS is set up.
    phone_proof: Optional[str] = Field(None, max_length=200)


class CustomerLocationItem(BaseModel):
    city: str
    area: str
    address: Optional[str] = None
    riders_count: int = 1


class CustomerRiderRequirements(BaseModel):
    gender: Optional[str] = "ANY"  # ANY, MALE, FEMALE
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    vehicle_type: Optional[str] = "ANY"  # ANY, CYCLE, TWO_WHEELER, AUTO, THREE_WHEELER
    driving_license_required: Optional[bool] = False
    experience: Optional[str] = None  # NO_EXP, 1_YEAR, 2_YEARS, 3_YEARS
    languages: Optional[List[str]] = []
    other_requirements: Optional[str] = None


class CustomerDocumentItem(BaseModel):
    name: str
    path: str
    size: Optional[int] = None
    mime_type: Optional[str] = None
    url: Optional[str] = None


class BrandCampaignSpec(GeoTargetFields):
    """The campaign details a brand gives, same as the admin's campaign form (commercial terms, visibility
    and publishing stay with the admin)."""
    campaign_category: Optional[str] = Field(None, max_length=30)  # Standard, Bike, Cycle, Auto, TV, Google, …
    eligible_vehicle_categories: Optional[List[str]] = None  # Empty = every vehicle type
    photo_slot_windows: Optional[Dict[str, List[str]]] = None  # {"MORNING": ["06:00", "11:00"], ...}
    rules: Optional[str] = None  # Rules / requirements shown to riders, one per line

    @field_validator("campaign_category")
    @classmethod
    def _valid_category(cls, value):
        from app.models.campaign_models import CampaignCategory

        if not value:
            return None
        value = value.strip().upper().replace(" ", "_")
        if value not in CampaignCategory.ALL:
            raise ValueError(f"Campaign category must be one of: {', '.join(CampaignCategory.LABELS.values())}")
        return value

    @field_validator("eligible_vehicle_categories")
    @classmethod
    def _valid_vehicles(cls, value):
        from app.schemas.all_schemas import normalize_vehicle_category

        if value is None:
            return None
        return sorted({normalize_vehicle_category(v) for v in value if v and v.upper() != "ANY"} - {None})


class CustomerCampaignCreate(BrandCampaignSpec):
    name: str = Field(..., min_length=2, max_length=150)
    campaign_type: Optional[str] = None
    campaign_objective: Optional[str] = None
    description: Optional[str] = None
    locations: List[CustomerLocationItem] = []
    start_date: date
    end_date: date
    total_riders: int = Field(default=1, ge=1)
    target_label: Optional[str] = Field(None, max_length=200)  # e.g. "Sector 54, Gurugram" (from the area search)
    rider_requirements: Optional[CustomerRiderRequirements] = None
    budget_type: Optional[str] = None
    expected_rider_rate: Optional[float] = Field(None, gt=0, le=100000)  # Proposed payout per rider per day
    estimated_budget: Optional[float] = None
    instructions: Optional[str] = None
    documents: Optional[List[CustomerDocumentItem]] = []
    submit: bool = False  # True -> PENDING_APPROVAL, False -> DRAFT

    @field_validator("estimated_budget")
    @classmethod
    def validate_minimum_budget(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < settings.MINIMUM_CAMPAIGN_BUDGET:
            raise ValueError(f"Minimum campaign budget is ₹{int(settings.MINIMUM_CAMPAIGN_BUDGET):,}.")
        return v


class CustomerCampaignUpdate(BrandCampaignSpec):
    name: Optional[str] = None
    target_label: Optional[str] = Field(None, max_length=200)
    campaign_type: Optional[str] = None
    campaign_objective: Optional[str] = None
    description: Optional[str] = None
    locations: Optional[List[CustomerLocationItem]] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    total_riders: Optional[int] = None
    rider_requirements: Optional[CustomerRiderRequirements] = None
    budget_type: Optional[str] = None
    expected_rider_rate: Optional[float] = Field(None, gt=0, le=100000)
    estimated_budget: Optional[float] = None
    instructions: Optional[str] = None
    documents: Optional[List[CustomerDocumentItem]] = None
    submit: Optional[bool] = None  # If True, moves DRAFT or CHANGES_REQUIRED -> PENDING_APPROVAL

    @field_validator("estimated_budget")
    @classmethod
    def validate_minimum_budget(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v < settings.MINIMUM_CAMPAIGN_BUDGET:
            raise ValueError(f"Minimum campaign budget is ₹{int(settings.MINIMUM_CAMPAIGN_BUDGET):,}.")
        return v


class CustomerCampaignResponse(BaseModel):
    id: int
    campaign_code: str
    name: str
    brand_id: int
    brand_name: str
    campaign_type: Optional[str] = None
    campaign_objective: Optional[str] = None
    description: Optional[str] = None
    locations: List[CustomerLocationItem] = []
    location_area: Optional[str] = None
    start_date: date
    end_date: date
    daily_start_time: Optional[str] = None
    daily_end_time: Optional[str] = None
    total_riders: int
    assigned_riders_count: int = 0
    rider_requirements: Optional[CustomerRiderRequirements] = None
    budget_type: Optional[str] = None
    expected_rider_rate: Optional[float] = None
    estimated_budget: Optional[float] = None
    instructions: Optional[str] = None
    documents: List[CustomerDocumentItem] = []
    campaign_category: Optional[str] = None
    eligible_vehicle_categories: List[str] = []
    photo_slot_windows: Optional[Dict[str, List[str]]] = None
    rules: Optional[str] = None
    image_url: Optional[str] = None
    status: str
    status_label: str
    brand_status: str = ""  # DRAFT, REQUESTED, CHANGES_REQUESTED, APPROVED, LIVE, PAUSED, COMPLETED, REJECTED, CANCELLED
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    joined_riders: int = 0
    required_riders: int = 0
    daily_rate: Optional[float] = None
    approved_photos: int = 0
    geo: Optional[dict] = None
    admin_feedback: Optional[str] = None
    contract_amount: Optional[float] = None
    total_paid: Optional[float] = None
    remaining_amount: Optional[float] = None
    payment_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CustomerDashboardResponse(BaseModel):
    customer_name: str
    company_name: str
    brand_id: int
    active_campaigns_count: int
    pending_campaigns_count: int
    completed_campaigns_count: int
    recent_campaigns: List[CustomerCampaignResponse]
    status_counts: dict = {}
    financial_summary: Optional[dict] = None


class CustomerProfileResponse(BaseModel):
    user_id: int
    full_name: str
    email: Optional[str] = None
    mobile_number: str
    brand_id: int
    company_name: str
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    gst_number: Optional[str] = None
    company_address: Optional[str] = None
    logo: Optional[str] = None


class CustomerProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    gst_number: Optional[str] = None
    company_address: Optional[str] = None
