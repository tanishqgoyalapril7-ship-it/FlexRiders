from datetime import datetime
from sqlalchemy import (
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


class PhotoStatus:
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class PayoutStatus:
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    PAID = "PAID"
    FAILED = "FAILED"


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
    total_slots = Column(Integer, nullable=False)
    daily_rate = Column(Float, nullable=False)
    status = Column(String(20), default=CampaignStatus.DRAFT, nullable=False, index=True)
    visibility = Column(String(20), default=CampaignVisibility.DRAFT, nullable=False)
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

    campaign = relationship("Campaign", back_populates="applications")
    rider = relationship("Rider")

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
    earned_amount = Column(Float, default=0.0, nullable=False)

    assignment = relationship("CampaignAssignment", back_populates="activities")
    rider = relationship("Rider")

    __table_args__ = (UniqueConstraint("assignment_id", "activity_date", name="uq_activity_per_day"),)


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
