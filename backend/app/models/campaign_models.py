from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    String,
    DateTime,
    Date,
    ForeignKey,
    Float,
    Text,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class CampaignStatus:
    DRAFT = "DRAFT"
    OPEN = "OPEN"  # Public, accepting riders, not started yet
    FULL = "FULL"  # Public, all slots taken
    ACTIVE = "ACTIVE"  # Public, running, slots still available
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

    # Published states whose exact value is derived from slots and dates.
    PUBLISHED = (OPEN, FULL, ACTIVE)
    CLOSED = (COMPLETED, CANCELLED)


class CampaignVisibility:
    DRAFT = "DRAFT"
    PUBLIC = "PUBLIC"


class ApplicationStatus:
    REQUESTED = "REQUESTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"


class AssignmentStatus:
    ASSIGNED = "ASSIGNED"  # Approved, campaign not started yet
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    REMOVED = "REMOVED"
    CANCELLED = "CANCELLED"

    # A rider may hold at most one of these at a time.
    CURRENT = (ASSIGNED, ACTIVE)
    # These consume a campaign slot.
    SLOT_HOLDING = (ASSIGNED, ACTIVE, COMPLETED)


class ActivityStatus:
    SUBMITTED = "SUBMITTED"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    EXCUSED = "EXCUSED"  # Approved absence: not delivered, not paid, not a performance failure
    NOT_ELIGIBLE = "NOT_ELIGIBLE"
    INCOMPLETE = "INCOMPLETE"  # Some photos approved but fewer than required, none awaiting review


class PhotoStatus:
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    NONE = "NONE"  # Days recorded without a photo (e.g. excused)
    PARTIAL = "PARTIAL"  # Day-level only: some photos approved, fewer than required


class PhotoSlot:
    """The three daily photo slots. All three approved = 1 completed Photo-Day.

    DEFAULT_WINDOWS apply unless a campaign sets its own (Campaign.photo_slot_windows). Windows drive the
    slot reminders; uploads are only restricted to them when ENFORCE_PHOTO_SLOT_WINDOWS is on."""
    MORNING = "MORNING"
    EVENING = "EVENING"
    NIGHT = "NIGHT"
    ALL = (MORNING, EVENING, NIGHT)
    LABELS = {MORNING: "Morning", EVENING: "Evening", NIGHT: "Night"}
    DEFAULT_WINDOWS = {MORNING: ("06:00", "11:00"), EVENING: ("12:00", "15:00"), NIGHT: ("17:00", "21:00")}


class RequestLabels:
    """How join-request statuses are shown to admins and riders."""
    CAMPAIGN = {
        "REQUESTED": "Pending Admin Approval",
        "APPROVED": "Approved",
        "REJECTED": "Rejected",
        "WITHDRAWN": "Withdrawn",
    }


class PayoutStatus:
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    PAID = "PAID"
    FAILED = "FAILED"


class BrandPaymentKind:
    RECEIVED = "RECEIVED"
    REFUND = "REFUND"
    CREDIT = "CREDIT"


class AdjustmentStatus:
    OPEN = "OPEN"
    RECOVERED = "RECOVERED"
    WAIVED = "WAIVED"


class VehicleCategory:
    """Rider vehicle types, used for campaign eligibility. Add a type here to support it everywhere.

    TWO_WHEELER keeps its original stored value; it is shown as "Bike / Two Wheeler"."""
    CYCLE = "CYCLE"
    TWO_WHEELER = "TWO_WHEELER"
    AUTO = "AUTO"
    THREE_WHEELER = "THREE_WHEELER"
    ALL = (CYCLE, TWO_WHEELER, AUTO, THREE_WHEELER)
    LABELS = {CYCLE: "Cycle", TWO_WHEELER: "Bike / Two Wheeler", AUTO: "Auto", THREE_WHEELER: "Three Wheeler"}
    DESCRIPTIONS = {
        CYCLE: "Bicycle or pedal cycle",
        TWO_WHEELER: "Motorbike or scooter",
        AUTO: "Passenger auto-rickshaw",
        THREE_WHEELER: "Cargo / loader or other non-passenger three-wheeler",
    }
    # Cycles usually have no registration number; every other type must give one at registration.
    NUMBER_OPTIONAL = (CYCLE,)
    # Every campaign photo (Morning, Evening, Night) must show the vehicle's number plate.
    PLATE_IN_PHOTOS = (AUTO, THREE_WHEELER)


class CampaignCategory:
    """A label for grouping and filtering campaigns. It adds no workflow of its own."""
    STANDARD = "STANDARD"
    BIKE = "BIKE"
    CYCLE = "CYCLE"
    AUTO = "AUTO"  # Auto-rickshaw advertising
    TV = "TV"
    GOOGLE = "GOOGLE"
    BRAND_PARTNERSHIP = "BRAND_PARTNERSHIP"
    OTHER = "OTHER"
    ALL = (STANDARD, BIKE, CYCLE, AUTO, TV, GOOGLE, BRAND_PARTNERSHIP, OTHER)
    LABELS = {
        STANDARD: "Standard", BIKE: "Bike", CYCLE: "Cycle", AUTO: "Auto", TV: "TV", GOOGLE: "Google",
        BRAND_PARTNERSHIP: "Brand Partnership", OTHER: "Other",
    }


class LocationPurpose:
    PICKUP = "PICKUP"  # Where riders collect the T-shirt (also stored as null on older rows)
    RETURN = "RETURN"  # Where riders hand it back after the campaign


class KitReturnStatus:
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    RETURNED = "RETURNED"
    INCENTIVE_CREDITED = "INCENTIVE_CREDITED"
    LABELS = {
        NOT_REQUIRED: "Return Not Required",
        PENDING: "Return Pending",
        RETURNED: "Returned",
        INCENTIVE_CREDITED: "Incentive Credited",
    }


class KitStatus:
    NOT_REQUIRED = "NOT_REQUIRED"
    PENDING = "PENDING"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"
    COLLECTED = "COLLECTED"
    # Older values, still readable on existing rows but no longer set.
    PICKUP_SCHEDULED = "PICKUP_SCHEDULED"
    NOT_COLLECTED = "NOT_COLLECTED"

    # Statuses an admin can set on an assigned rider's kit. Join requests use NOT_REQUIRED / PENDING / COLLECTED.
    ALL = (NOT_REQUIRED, PENDING, READY_FOR_PICKUP, COLLECTED)
    LABELS = {
        NOT_REQUIRED: "Not Required",
        PENDING: "Pending Collection",
        READY_FOR_PICKUP: "Ready for Pickup",
        COLLECTED: "Collected",
        PICKUP_SCHEDULED: "Ready for Pickup",
        NOT_COLLECTED: "Pending Collection",
    }


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False, index=True)
    description = Column(Text, nullable=True)
    rules = Column(Text, nullable=True)  # One requirement per line
    image_url = Column(String(500), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    total_slots = Column(Integer, nullable=False)  # Required riders (R)
    daily_rate = Column(Float, nullable=False)  # Rider payout per approved day
    # Fixed at publish: required riders × contract days. Never changed by replacements or extensions.
    contracted_rider_days = Column(Integer, nullable=True)
    brand_contract_value = Column(Float, default=0.0, nullable=True)  # What the brand pays; independent of rider payout
    allow_payout_beyond_contract = Column(Boolean, default=False, nullable=True)
    continue_after_fulfillment = Column(Boolean, default=False, nullable=True)
    extra_replacement_slots = Column(Integer, default=0, nullable=True)  # Opened by admin to replace inactive riders
    status = Column(String(20), default=CampaignStatus.DRAFT, nullable=False, index=True)
    visibility = Column(String(20), default=CampaignVisibility.DRAFT, nullable=False)
    # When the campaign went Live (admin "Go Live" or its start date). New riders can't join after this.
    live_at = Column(DateTime, nullable=True)
    location_area = Column(String(200), nullable=True)  # e.g. "Sector 57, Gurugram"
    # Comma-separated VehicleCategory values; empty means every category may join.
    eligible_vehicle_categories = Column(String(120), nullable=True)
    campaign_category = Column(String(30), nullable=True)  # CampaignCategory; null = STANDARD
    # The campaign banner is only shown on the public page once an admin confirms the rights to it.
    public_image_approved = Column(Boolean, default=False, nullable=True)
    # JSON {"MORNING": ["06:00", "11:00"], ...}; empty means PhotoSlot.DEFAULT_WINDOWS.
    photo_slot_windows = Column(Text, nullable=True)
    # Shareable public page (/campaign/<public_slug>) for the brand.
    public_slug = Column(String(80), unique=True, index=True, nullable=True)
    public_share_enabled = Column(Boolean, default=False, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    published_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    brand = relationship("Brand")
    created_by = relationship("User")
    applications = relationship("CampaignApplication", back_populates="campaign")
    assignments = relationship("CampaignAssignment", back_populates="campaign")
    extensions = relationship("CampaignExtension", back_populates="campaign", order_by="CampaignExtension.start_date")
    brand_kit = relationship("CampaignBrandKit", back_populates="campaign", uselist=False)


class CampaignApplication(Base):
    __tablename__ = "campaign_applications"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    status = Column(String(20), default=ApplicationStatus.REQUESTED, nullable=False, index=True)
    requested_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String(255), nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    tshirt_size = Column(String(10), nullable=True)  # Chosen when joining, if the campaign needs a T-shirt
    pickup_location_id = Column(Integer, ForeignKey("campaign_pickup_locations.id"), nullable=True)
    # T-shirt collection happens before approval: NOT_REQUIRED, PENDING (collection) or COLLECTED.
    kit_status = Column(String(20), nullable=True)
    kit_collected_at = Column(DateTime, nullable=True)
    kit_collected_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    campaign = relationship("Campaign", back_populates="applications")
    rider = relationship("Rider")
    pickup_location = relationship("CampaignPickupLocation")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    kit_collected_by = relationship("User", foreign_keys=[kit_collected_by_id])

    __table_args__ = (
        # A rider can have only one open request per campaign.
        Index(
            "uq_campaign_open_application",
            "campaign_id",
            "rider_id",
            unique=True,
            postgresql_where=text("status = 'REQUESTED'"),
            sqlite_where=text("status = 'REQUESTED'"),
        ),
    )


class CampaignAssignment(Base):
    __tablename__ = "campaign_assignments"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    application_id = Column(Integer, ForeignKey("campaign_applications.id"), nullable=True)
    status = Column(String(20), default=AssignmentStatus.ASSIGNED, nullable=False, index=True)
    daily_rate = Column(Float, nullable=False)  # Snapshot of the campaign rate at approval time
    assigned_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    removal_reason = Column(String(255), nullable=True)
    replacement_for_assignment_id = Column(Integer, ForeignKey("campaign_assignments.id"), nullable=True)

    campaign = relationship("Campaign", back_populates="assignments")
    rider = relationship("Rider")
    activities = relationship("CampaignDailyActivity", back_populates="assignment", order_by="CampaignDailyActivity.activity_date")
    payout = relationship("CampaignPayout", back_populates="assignment", uselist=False)

    __table_args__ = (
        # Business rule: a rider can be actively assigned to only one campaign at a time.
        Index(
            "uq_rider_current_assignment",
            "rider_id",
            unique=True,
            postgresql_where=text("status IN ('ASSIGNED', 'ACTIVE')"),
            sqlite_where=text("status IN ('ASSIGNED', 'ACTIVE')"),
        ),
    )


class CampaignDailyActivity(Base):
    __tablename__ = "campaign_daily_activities"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    assignment_id = Column(Integer, ForeignKey("campaign_assignments.id"), nullable=False, index=True)
    activity_date = Column(Date, nullable=False)
    status = Column(String(20), default=ActivityStatus.SUBMITTED, nullable=False)
    photo_url = Column(String(500), nullable=True)
    photo_status = Column(String(20), default=PhotoStatus.PENDING, nullable=False, index=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(String(255), nullable=True)
    excuse_reason = Column(String(255), nullable=True)
    earned_amount = Column(Float, default=0.0, nullable=False)
    # Set when a payout covering this day is paid, so later corrections can't silently move it to surplus.
    payout_locked = Column(Boolean, default=False, nullable=True)

    assignment = relationship("CampaignAssignment", back_populates="activities")
    rider = relationship("Rider")
    photos = relationship(
        "CampaignActivityPhoto", back_populates="activity", cascade="all, delete-orphan", order_by="CampaignActivityPhoto.id"
    )

    __table_args__ = (UniqueConstraint("assignment_id", "activity_date", name="uq_activity_per_day"),)


class CampaignActivityPhoto(Base):
    """One proof photo. A rider-day is complete (1 Photo Streak day) once it has the required number of
    approved slot photos (Morning, Evening, Night); the day's status is always derived from these rows."""

    __tablename__ = "campaign_activity_photos"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("campaign_daily_activities.id"), nullable=False, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    photo_url = Column(String(500), nullable=False)
    # SHA-256 of the file, so the same image can't be counted twice.
    content_hash = Column(String(64), nullable=True, index=True)
    status = Column(String(20), default=PhotoStatus.PENDING, nullable=False, index=True)
    rejection_reason = Column(String(255), nullable=True)
    # MORNING / EVENING / NIGHT. Null only for photos uploaded before slots existed.
    slot = Column(String(10), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    activity = relationship("CampaignDailyActivity", back_populates="photos")

    __table_args__ = (
        # One live (pending/approved) photo per slot per day; rejected photos stay as history.
        Index(
            "uq_live_photo_per_slot",
            "activity_id",
            "slot",
            unique=True,
            postgresql_where=text("slot IS NOT NULL AND status <> 'REJECTED'"),
            sqlite_where=text("slot IS NOT NULL AND status <> 'REJECTED'"),
        ),
    )


class CampaignPayout(Base):
    __tablename__ = "campaign_payouts"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    assignment_id = Column(Integer, ForeignKey("campaign_assignments.id"), nullable=False, unique=True)
    eligible_days = Column(Integer, default=0, nullable=False)  # Days with approved proof
    daily_rate = Column(Float, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)
    paid_amount = Column(Float, default=0.0, nullable=False)
    status = Column(String(20), default=PayoutStatus.PENDING, nullable=False)
    approved_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)  # Latest ledger entry
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignment = relationship("CampaignAssignment", back_populates="payout")
    rider = relationship("Rider")


class CampaignExtension(Base):
    """Extra dates approved by an admin to recover a shortfall. Never changes contracted rider-days."""

    __tablename__ = "campaign_extensions"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(String(500), nullable=False)
    rider_day_target = Column(Integer, nullable=False)  # Remaining obligation when approved
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, default=datetime.utcnow)

    campaign = relationship("Campaign", back_populates="extensions")
    approved_by = relationship("User")


class BrandPaymentRecord(Base):
    """Money received from, refunded to, or credited to the brand. Always an explicit admin entry."""

    __tablename__ = "brand_payment_records"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # RECEIVED, REFUND, CREDIT
    amount = Column(Float, nullable=False)
    record_date = Column(Date, nullable=False)
    reference = Column(String(120), nullable=True)
    note = Column(String(500), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    created_by = relationship("User")


class FinancialAdjustment(Base):
    """Created when a correction leaves a rider paid more than they earned. Nothing is deducted automatically."""

    __tablename__ = "financial_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("campaign_assignments.id"), nullable=False)
    kind = Column(String(30), default="OVERPAYMENT", nullable=False)
    amount = Column(Float, nullable=False)
    status = Column(String(20), default=AdjustmentStatus.OPEN, nullable=False)
    note = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    rider = relationship("Rider")


class ActivityChangeLog(Base):
    """Every change to a rider-day: original value, new value, who, when and why."""

    __tablename__ = "activity_change_logs"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    activity_id = Column(Integer, ForeignKey("campaign_daily_activities.id"), nullable=False)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    activity_date = Column(Date, nullable=False)
    old_status = Column(String(20), nullable=True)
    new_status = Column(String(20), nullable=False)
    old_earned = Column(Float, nullable=True)
    new_earned = Column(Float, nullable=True)
    reason = Column(String(500), nullable=True)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)

    rider = relationship("Rider")
    changed_by = relationship("User")


class CampaignBrandKit(Base):
    __tablename__ = "campaign_brand_kits"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, unique=True)
    tshirt_required = Column(Boolean, default=False, nullable=False)
    size_options = Column(String(120), default="S,M,L,XL,XXL")  # Comma separated
    # Legacy single-location fields: moved into CampaignPickupLocation on first read.
    pickup_location = Column(String(150), nullable=True)
    pickup_address = Column(String(500), nullable=True)
    pickup_hours = Column(String(120), nullable=True)
    contact_name = Column(String(120), nullable=True)
    contact_phone = Column(String(30), nullable=True)
    instructions = Column(Text, nullable=True)  # General kit instructions (all locations)
    # Returning the T-shirt after the campaign; the incentive is credited once when an admin marks it returned.
    return_required = Column(Boolean, default=True, nullable=True)
    return_incentive = Column(Float, nullable=True)  # Null means settings.TSHIRT_RETURN_INCENTIVE_DEFAULT
    return_instructions = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    campaign = relationship("Campaign", back_populates="brand_kit")


class CampaignPickupLocation(Base):
    """An official place where riders collect the campaign T-shirt / brand kit. Configured by admins only."""

    __tablename__ = "campaign_pickup_locations"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    address = Column(String(500), nullable=False)
    map_url = Column(String(500), nullable=True)
    available_from = Column(Date, nullable=True)
    available_to = Column(Date, nullable=True)
    available_days = Column(String(60), nullable=True)  # e.g. "Monday–Saturday"
    start_time = Column(String(5), nullable=True)  # "HH:MM", 24h
    end_time = Column(String(5), nullable=True)
    contact_name = Column(String(120), nullable=True)
    contact_phone = Column(String(30), nullable=True)
    instructions = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    purpose = Column(String(10), nullable=True)  # LocationPurpose; null = PICKUP
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RiderBrandKit(Base):
    __tablename__ = "rider_brand_kits"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    assignment_id = Column(Integer, ForeignKey("campaign_assignments.id"), nullable=False, unique=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    tshirt_size = Column(String(10), nullable=True)
    status = Column(String(30), default=KitStatus.PENDING, nullable=False)
    pickup_date = Column(Date, nullable=True)
    collected_date = Column(Date, nullable=True)
    issued_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pickup_location_id = Column(Integer, ForeignKey("campaign_pickup_locations.id"), nullable=True)
    # T-shirt return after the campaign (KitReturnStatus); null = derived.
    return_status = Column(String(20), nullable=True)
    returned_at = Column(DateTime, nullable=True)
    returned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    return_payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)  # The incentive credit
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    campaign = relationship("Campaign")
    rider = relationship("Rider")
    issued_by = relationship("User", foreign_keys=[issued_by_id])
    returned_by = relationship("User", foreign_keys=[returned_by_id])
    pickup_location = relationship("CampaignPickupLocation")
    return_payment = relationship("Payment")


class CampaignFulfillmentSnapshot(Base):
    """Immutable summary saved when a campaign is completed or cancelled."""

    __tablename__ = "campaign_fulfillment_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, unique=True)
    data = Column(Text, nullable=False)  # JSON
    created_at = Column(DateTime, default=datetime.utcnow)


class RoutePoint(Base):
    """One GPS fix recorded by the rider app while the rider's route is on (campaign days only).
    Used only to draw the rider's route line on the admin map."""

    __tablename__ = "campaign_route_points"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    assignment_id = Column(Integer, ForeignKey("campaign_assignments.id"), nullable=False)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    route_date = Column(Date, nullable=False)  # IST date of recorded_at
    recorded_at = Column(DateTime, nullable=False)  # UTC, from the device
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)  # Used to drop poor fixes; never shown
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_route_points_assignment_day", "assignment_id", "route_date", "recorded_at"),
        UniqueConstraint("assignment_id", "recorded_at", name="uq_route_point_time"),
    )


class CampaignTerms(Base):
    """One published version of a campaign's Terms & Conditions: a permanent history record.

    Versions are never edited or deleted (a change is a new version). The row does not depend on the
    campaign or publisher still existing: campaign_id / published_by_id are plain ids (no foreign key)
    with a snapshot of their names, so resets and deletions elsewhere can never remove or block it."""

    __tablename__ = "campaign_terms"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, nullable=False, index=True)  # No FK on purpose: the record outlives the campaign
    campaign_name = Column(String(150), nullable=True)  # Snapshot at publish time
    version = Column(Integer, nullable=False)
    body = Column(Text, nullable=False)
    change_note = Column(String(500), nullable=True)
    published_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    published_by_id = Column(Integer, nullable=True)  # No FK on purpose
    published_by_email = Column(String(120), nullable=True)  # Snapshot

    __table_args__ = (UniqueConstraint("campaign_id", "version", name="uq_campaign_terms_version"),)


class CampaignTermsAcceptance(Base):
    """A rider accepting one terms version: a permanent consent record. Append-only (accepting a newer
    version adds a row), and independent of the campaign, rider and join request rows: those are kept
    as plain ids plus a snapshot of who/what, so no reset or deletion removes or blocks it. The only
    foreign key is to the terms version, which is itself permanent."""

    __tablename__ = "campaign_terms_acceptances"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, nullable=False, index=True)  # No FK on purpose
    campaign_name = Column(String(150), nullable=True)  # Snapshot
    rider_id = Column(Integer, nullable=False, index=True)  # No FK on purpose
    rider_code = Column(String(20), nullable=True)  # Snapshot, e.g. SR-000123
    rider_name = Column(String(120), nullable=True)  # Snapshot
    terms_id = Column(Integer, ForeignKey("campaign_terms.id"), nullable=False)
    terms_version = Column(Integer, nullable=False)
    accepted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    application_id = Column(Integer, nullable=True)  # The join request, if accepted while joining (no FK on purpose)
    source = Column(String(20), nullable=False, default="JOIN")  # JOIN or UPDATE (a newer version accepted later)

    terms = relationship("CampaignTerms")

    __table_args__ = (UniqueConstraint("terms_id", "rider_id", name="uq_terms_acceptance_once"),)
