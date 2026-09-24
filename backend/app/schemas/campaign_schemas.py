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
    total_slots: int = Field(..., ge=1, le=10000)
    daily_rate: float = Field(..., gt=0, le=100000)

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
