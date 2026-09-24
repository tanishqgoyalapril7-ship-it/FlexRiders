from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class CampaignBase(BaseModel):
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

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after the start date")
        return self


class CampaignCreate(CampaignBase):
    visibility: str = Field("DRAFT", pattern="^(DRAFT|PUBLIC)$")


class CampaignUpdate(CampaignBase):
    pass


class ReasonRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)


class ApproveApplicationRequest(BaseModel):
    replacement_for_assignment_id: Optional[int] = None


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
    amount: float = Field(..., gt=0)
    record_date: date
    reference: Optional[str] = Field(None, max_length=120)
    note: Optional[str] = Field(None, max_length=500)


class AdjustmentResolve(BaseModel):
    status: str = Field(..., pattern="^(RECOVERED|WAIVED)$")
    note: Optional[str] = Field(None, max_length=500)


class BrandKitUpdate(BaseModel):
    tshirt_required: bool = False
    size_options: Optional[str] = Field("S,M,L,XL,XXL", max_length=120)
    instructions: Optional[str] = Field(None, max_length=2000)


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


class RiderKitUpdate(BaseModel):
    status: Optional[str] = None
    tshirt_size: Optional[str] = Field(None, max_length=10)
    pickup_date: Optional[date] = None
    clear_pickup_date: bool = False
    pickup_location_id: Optional[int] = None


class ExcuseRequest(BaseModel):
    day: date
    reason: str = Field(..., min_length=3, max_length=255)
