import re

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, List, Dict, Any
from datetime import date, datetime


# ==================== AUTH SCHEMAS ====================
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    rider_id: Optional[str] = None
    name: Optional[str] = None


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    rider_id: Optional[str] = None
    exp: Optional[int] = None


class LoginRequest(BaseModel):
    phone: str
    password: Optional[str] = None
    role_requested: Optional[str] = None  # ADMIN, RIDER


class OTPRequest(BaseModel):
    phone: str


class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str


# ==================== DOCUMENT SCHEMAS ====================
class DocumentBase(BaseModel):
    doc_type: str
    file_name: str
    file_url: str


class DocumentCreate(DocumentBase):
    pass


class DocumentResponse(DocumentBase):
    id: int
    status: str
    rejection_note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== BRAND SCHEMAS ====================
class BrandBase(BaseModel):
    name: str
    code: Optional[str] = None
    logo: Optional[str] = None
    description: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    is_active: bool = True


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    logo: Optional[str] = None
    description: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    is_active: Optional[bool] = None


class BrandResponse(BrandBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    active_riders_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class BrandAssignmentRequest(BaseModel):
    brand_id: int
    assignment_date: Optional[date] = None  # Defaults to today
    notes: Optional[str] = None


class BrandAssignmentResponse(BaseModel):
    id: int
    rider_id: int
    brand_id: int
    brand_name: str
    assignment_date: datetime
    removal_date: Optional[datetime] = None
    is_current: bool
    notes: Optional[str] = None
    assigned_by_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== RIDER SCHEMAS ====================
# Indian registration numbers: state + RTO + optional series + 4 digits (HR26DK8337, DL3C1234,
# MH12AB1234), or Bharat series (22BH1234AA).
VEHICLE_NUMBER_PATTERNS = (
    re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$"),
    re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$"),
)


def normalize_vehicle_number(value: Optional[str]) -> Optional[str]:
    """Uppercases and strips spaces/dashes; raises ValueError if it isn't a valid Indian number."""
    if value is None or not value.strip():
        return None
    cleaned = re.sub(r"[\s\-.]", "", value).upper()
    if not any(p.match(cleaned) for p in VEHICLE_NUMBER_PATTERNS):
        raise ValueError("Enter a valid vehicle number, e.g. HR26DK8337 or 22BH1234AA")
    return cleaned


class RiderRegistrationRequest(BaseModel):
    # Step 1: Personal
    full_name: str
    mobile_number: str
    email: Optional[str] = None
    dob: Optional[str] = None
    profile_photo: Optional[str] = None
    password: Optional[str] = "Rider@123"

    # Step 2: Work
    current_company: Optional[str] = None
    current_role: Optional[str] = "Rider"
    experience_years: Optional[int] = 0
    experience_months: Optional[int] = 0
    vehicle_type: Optional[str] = "Bike"
    vehicle_number: Optional[str] = None

    # Step 3: Location
    primary_city: str = "Gurugram"
    primary_area: Optional[str] = None
    additional_locations: Optional[str] = None
    preferred_radius: Optional[str] = "10 km"

    # Step 4: Payment
    upi_id: Optional[str] = None
    gpay_number: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None

    # Step 5: Documents (URLs or base64 keys)
    documents: Optional[List[DocumentCreate]] = []

    @field_validator("vehicle_number")
    @classmethod
    def _valid_vehicle_number(cls, value):
        return normalize_vehicle_number(value)


class AdminRiderCreate(BaseModel):
    """Admin creates a rider directly (e.g. walk-in). The rider logs in with the mobile number and password."""
    full_name: str = Field(..., min_length=2, max_length=120)
    mobile_number: str = Field(..., min_length=10, max_length=20)
    password: str = Field(..., min_length=6, max_length=128)
    email: Optional[str] = None
    dob: Optional[str] = None
    current_company: Optional[str] = None
    current_role: Optional[str] = "Rider"
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    primary_city: str = Field(..., min_length=2, max_length=80)
    primary_area: Optional[str] = None
    upi_id: Optional[str] = None
    gpay_number: Optional[str] = None
    status: str = "PENDING"  # PENDING or APPROVED

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value):
        return normalize_email(value)

    @field_validator("vehicle_number")
    @classmethod
    def _valid_vehicle_number(cls, value):
        return normalize_vehicle_number(value)


class AdminRiderUpdate(BaseModel):
    """Only the fields sent are changed; an empty string clears an optional field."""
    full_name: Optional[str] = None
    mobile_number: Optional[str] = None
    email: Optional[str] = None
    dob: Optional[str] = None
    current_company: Optional[str] = None
    current_role: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    primary_city: Optional[str] = None
    primary_area: Optional[str] = None
    upi_id: Optional[str] = None
    gpay_number: Optional[str] = None

    @field_validator("vehicle_number")
    @classmethod
    def _valid_vehicle_number(cls, value):
        if value is None:
            return None
        return normalize_vehicle_number(value) or ""  # "" means clear


class ArchiveRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)


class AccountDeleteRequest(BaseModel):
    password: str
    reason: Optional[str] = None


class ResetRequest(BaseModel):
    scope: str
    confirmation: str


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: Optional[str]) -> Optional[str]:
    if value is None or not value.strip():
        return None
    value = value.strip().lower()
    if not EMAIL_PATTERN.match(value):
        raise ValueError("Enter a valid email address")
    return value


class AdminUserCreate(BaseModel):
    email: str
    phone: str = Field(..., min_length=10, max_length=20)
    password: str = Field(..., min_length=8, max_length=128)
    role: str

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value):
        email = normalize_email(value)
        if not email:
            raise ValueError("Email is required")
        return email


class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value):
        return normalize_email(value)


class RiderStatusUpdate(BaseModel):
    status: str  # APPROVED, REJECTED, SUSPENDED, ACTIVE, INACTIVE
    reason: Optional[str] = None


class RiderResponse(BaseModel):
    id: int
    rider_id: str
    full_name: str
    mobile_number: str
    email: Optional[str] = None
    profile_photo: Optional[str] = None
    dob: Optional[str] = None
    current_company: Optional[str] = None
    current_role: Optional[str] = None
    experience_years: Optional[int] = 0
    experience_months: Optional[int] = 0
    vehicle_type: Optional[str] = None
    vehicle_number: Optional[str] = None
    primary_city: str
    primary_area: Optional[str] = None
    additional_locations: Optional[str] = None
    preferred_radius: Optional[str] = None
    upi_id: Optional[str] = None
    gpay_number: Optional[str] = None
    status: str
    current_brand: Optional[str] = None
    current_brand_id: Optional[int] = None
    created_at: datetime
    archived_at: Optional[datetime] = None
    archive_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RiderDetailResponse(RiderResponse):
    documents: List[DocumentResponse] = []
    brand_history: List[BrandAssignmentResponse] = []
    total_earnings: float = 0.0
    paid_earnings: float = 0.0
    pending_earnings: float = 0.0
    rejection_reason: Optional[str] = None
    suspension_reason: Optional[str] = None


class RiderProfileUpdateRequest(BaseModel):
    dob: Optional[str] = None
    profile_photo: Optional[str] = None
    primary_area: Optional[str] = None
    additional_locations: Optional[str] = None
    preferred_radius: Optional[str] = None
    vehicle_type: Optional[str] = None
    upi_id: Optional[str] = None
    gpay_number: Optional[str] = None


# ==================== PAYMENT SCHEMAS ====================
class PaymentCreate(BaseModel):
    rider_id: int
    brand_id: Optional[int] = None
    amount: float
    payment_period: Optional[str] = None  # Defaults to the current month
    payment_type: Optional[str] = "UPI"
    upi_id: Optional[str] = None
    notes: Optional[str] = None


class PaymentUpdate(BaseModel):
    status: Optional[str] = None
    transaction_id: Optional[str] = None
    notes: Optional[str] = None


class PaymentEdit(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    payment_period: Optional[str] = Field(None, max_length=50)
    payment_type: Optional[str] = Field(None, max_length=40)
    upi_id: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class PaymentCancel(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)


class PaymentResponse(BaseModel):
    id: int
    rider_id: int
    rider_name: str
    rider_sr_id: str
    brand_id: Optional[int] = None
    brand_name: Optional[str] = None
    amount: float
    payment_date: datetime
    payment_period: str
    payment_type: str
    upi_id: Optional[str] = None
    payment_reference: Optional[str] = None
    transaction_id: Optional[str] = None
    status: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PaymentMonthlySummary(BaseModel):
    month_name: str
    total_earnings: float
    paid_amount: float
    pending_amount: float
    today_earnings: float
    payments: List[PaymentResponse] = []


# ==================== NOTIFICATION SCHEMAS ====================
class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    category: str
    is_read: bool
    reference_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== AUDIT LOG SCHEMAS ====================
class AuditLogResponse(BaseModel):
    id: int
    admin_email: str
    action: str
    target_type: str
    target_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== DASHBOARD & REPORT SCHEMAS ====================
class DashboardStats(BaseModel):
    total_riders: int
    pending_approvals: int
    approved_riders: int
    active_riders: int
    suspended_riders: int
    total_payments: float
    pending_payments: float
    today_payments: float
    growth_riders: float = 12.0
    growth_active: float = 6.0
    growth_payments: float = 15.0


class ChartPoint(BaseModel):
    date: str
    count: int = 0
    paid: float = 0.0
    pending: float = 0.0
    failed: float = 0.0


class BrandDistribution(BaseModel):
    brand_name: str
    rider_count: int
    percentage: float


class DashboardOverview(BaseModel):
    stats: DashboardStats
    registration_chart: List[ChartPoint]
    payments_chart: List[ChartPoint]
    brand_distribution: List[BrandDistribution]
    pending_riders: List[RiderResponse]
    recent_registrations: List[RiderResponse]
    recent_payments: List[PaymentResponse]
    monthly_report: Dict[str, Any]
