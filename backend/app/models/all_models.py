from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    Text,
    Enum,
    Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum


class RiderStatus(str, enum.Enum):
    PENDING = "PENDING"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    INACTIVE = "INACTIVE"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    PAID = "PAID"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class DocumentType(str, enum.Enum):
    GOVT_ID = "GOVT_ID"
    DRIVING_LICENSE = "DRIVING_LICENSE"
    VEHICLE_RC = "VEHICLE_RC"
    OTHER = "OTHER"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=True)
    role = Column(String(30), default="RIDER", nullable=False)  # SUPER_ADMIN, ADMIN, FINANCE_ADMIN, OPERATIONS_ADMIN, RIDER
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    rider_profile = relationship("Rider", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="admin")


class Rider(Base):
    __tablename__ = "riders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    rider_id = Column(String(20), unique=True, index=True, nullable=False)  # SR-000145 format

    # Personal Information
    full_name = Column(String(120), nullable=False)
    mobile_number = Column(String(20), nullable=False, index=True)
    email = Column(String(120), nullable=True)
    profile_photo = Column(String(500), nullable=True)
    dob = Column(String(30), nullable=True)

    # Work Information
    current_company = Column(String(120), nullable=True)
    current_role = Column(String(80), default="Rider")
    experience_years = Column(Integer, default=0)
    experience_months = Column(Integer, default=0)
    vehicle_type = Column(String(50), default="Bike")  # Bike, Scooter, Electric Bike, Other
    vehicle_number = Column(String(20), nullable=True, index=True)  # Normalised, e.g. HR26DK8337
    vehicle_category = Column(String(20), nullable=True, index=True)  # VehicleCategory: TWO_WHEELER / THREE_WHEELER

    # Working Location
    primary_city = Column(String(80), nullable=False, default="Gurugram")
    primary_area = Column(String(120), nullable=True)
    additional_locations = Column(Text, nullable=True)
    preferred_radius = Column(String(40), default="10 km")

    # Payment Information
    upi_id = Column(String(100), nullable=True)
    gpay_number = Column(String(20), nullable=True)
    bank_account_number = Column(String(50), nullable=True)
    ifsc_code = Column(String(20), nullable=True)

    # Status & Workflow
    status = Column(String(30), default="PENDING", index=True)  # PENDING, UNDER_REVIEW, APPROVED, ACTIVE, etc.
    rejection_reason = Column(Text, nullable=True)
    suspension_reason = Column(Text, nullable=True)
    # Archived (soft-deleted) riders keep all history but are hidden and can't log in.
    archived_at = Column(DateTime, nullable=True, index=True)
    archive_reason = Column(String(255), nullable=True)
    # Refer & Earn: this rider's own code, and who referred them (set once, at registration).
    referral_code = Column(String(12), unique=True, index=True, nullable=True)
    referred_by_rider_id = Column(Integer, ForeignKey("riders.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="rider_profile")
    documents = relationship("RiderDocument", back_populates="rider", cascade="all, delete-orphan")
    brand_assignments = relationship("RiderBrandAssignment", back_populates="rider", cascade="all, delete-orphan", foreign_keys="RiderBrandAssignment.rider_id")
    payments = relationship("Payment", back_populates="rider", cascade="all, delete-orphan")
    support_tickets = relationship("SupportTicket", back_populates="rider", cascade="all, delete-orphan")


class RiderDocument(Base):
    __tablename__ = "rider_documents"

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    doc_type = Column(String(40), nullable=False)  # GOVT_ID, DRIVING_LICENSE, VEHICLE_RC, OTHER
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(500), nullable=False)
    status = Column(String(30), default="PENDING")  # PENDING, VERIFIED, REJECTED
    rejection_note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rider = relationship("Rider", back_populates="documents")


class Brand(Base):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), unique=True, nullable=False)
    code = Column(String(40), unique=True, nullable=True)
    logo = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    contact_person = Column(String(120), nullable=True)
    contact_number = Column(String(30), nullable=True)
    is_active = Column(Boolean, default=True)
    # The brand's logo is only shown on public pages once an admin confirms FlexRiders may use it.
    public_assets_approved = Column(Boolean, default=False, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignments = relationship("RiderBrandAssignment", back_populates="brand")
    payments = relationship("Payment", back_populates="brand")


class RiderBrandAssignment(Base):
    __tablename__ = "rider_brand_assignments"

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assignment_date = Column(DateTime, default=datetime.utcnow)
    removal_date = Column(DateTime, nullable=True)
    is_current = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rider = relationship("Rider", back_populates="brand_assignments")
    brand = relationship("Brand", back_populates="assignments")
    assigned_by = relationship("User")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True, index=True)  # Set for campaign payouts
    category = Column(String(30), nullable=True)  # e.g. REFERRAL_REWARD; null for ordinary payments
    # Set on system-created credits (rewards, incentives) so the same credit can never be created twice.
    idempotency_key = Column(String(100), nullable=True)
    amount = Column(Float, nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow)
    payment_period = Column(String(50), default=lambda: datetime.utcnow().strftime("%B %Y"))
    payment_type = Column(String(40), default="UPI")  # UPI, Bank Transfer, IMPS
    upi_id = Column(String(100), nullable=True)
    payment_reference = Column(String(100), nullable=True)
    transaction_id = Column(String(100), unique=True, index=True, nullable=True)
    status = Column(String(30), default="PENDING", index=True)  # PENDING, PROCESSING, PAID, FAILED, CANCELLED
    failure_reason = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    rider = relationship("Rider", back_populates="payments")
    brand = relationship("Brand", back_populates="payments")
    created_by = relationship("User")

    __table_args__ = (Index("uq_payment_idempotency_key", "idempotency_key", unique=True),)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # None means broadcast/admin
    is_admin_notification = Column(Boolean, default=False)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(50), default="SYSTEM")  # PAYMENT, BRAND, REGISTRATION, DOCUMENT, SYSTEM
    is_read = Column(Boolean, default=False)
    reference_id = Column(String(100), nullable=True)  # e.g., rider_id or payment_id
    # Set on automatic notifications (slot reminders, campaign live) so each is sent once, e.g.
    # "SLOT_OPEN:<assignment>:<date>:MORNING".
    dedupe_key = Column(String(120), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")

    __table_args__ = (Index("uq_notification_dedupe_key", "dedupe_key", unique=True),)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_email = Column(String(120), nullable=False)
    action = Column(String(80), nullable=False)  # RIDER_APPROVED, BRAND_ASSIGNED, PAYMENT_CREATED, etc.
    target_type = Column(String(50), nullable=False)  # RIDER, BRAND, PAYMENT, SYSTEM
    target_id = Column(String(50), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), default="127.0.0.1")
    created_at = Column(DateTime, default=datetime.utcnow)

    admin = relationship("User", back_populates="audit_logs")


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    subject = Column(String(200), nullable=False)
    category = Column(String(50), default="GENERAL")
    message = Column(Text, nullable=False)
    status = Column(String(30), default="OPEN")  # OPEN, IN_PROGRESS, RESOLVED, CLOSED
    priority = Column(String(20), default="MEDIUM")  # LOW, MEDIUM, HIGH, URGENT
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    rider = relationship("Rider", back_populates="support_tickets")


class PaymentCategory:
    REFERRAL_REWARD = "REFERRAL_REWARD"
    TSHIRT_RETURN_INCENTIVE = "TSHIRT_RETURN_INCENTIVE"
    LABELS = {REFERRAL_REWARD: "Referral Reward", TSHIRT_RETURN_INCENTIVE: "T-shirt Return Incentive"}


class ReferralStatus:
    JOINED = "JOINED"  # Registered with the code; waiting for their first completed Photo Streak
    REWARDED = "REWARDED"  # Reward credited to the referrer


class RiderReferral(Base):
    """Who referred whom, and the one-time reward. One row per referred rider (unique)."""

    __tablename__ = "rider_referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    referred_rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, unique=True)
    code_used = Column(String(12), nullable=False)
    status = Column(String(20), default=ReferralStatus.JOINED, nullable=False)
    reward_amount = Column(Float, nullable=True)
    reward_payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True, unique=True)
    qualifying_activity_id = Column(Integer, nullable=True)  # The campaign day that completed the first Photo Streak
    created_at = Column(DateTime, default=datetime.utcnow)
    rewarded_at = Column(DateTime, nullable=True)

    referrer = relationship("Rider", foreign_keys=[referrer_rider_id])
    referred = relationship("Rider", foreign_keys=[referred_rider_id])
    reward_payment = relationship("Payment")


class AccountDeletionRequest(Base):
    """A deletion request sent through the public web form (flexriders.in/delete-account), for riders who
    no longer have the app. An admin confirms the requester by phone before the account is deleted."""

    __tablename__ = "account_deletion_requests"

    id = Column(Integer, primary_key=True, index=True)
    mobile_number = Column(String(20), nullable=False, index=True)
    full_name = Column(String(120), nullable=False)
    message = Column(String(1000), nullable=True)
    status = Column(String(20), default="NEW", nullable=False)  # NEW, COMPLETED, REJECTED
    resolution = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    handled_at = Column(DateTime, nullable=True)
    handled_by_email = Column(String(120), nullable=True)


class SupportStatus:
    OPEN = "OPEN"                            # Reopened by support
    WAITING_FOR_ADMIN = "WAITING_FOR_ADMIN"  # The rider wrote last
    WAITING_FOR_RIDER = "WAITING_FOR_RIDER"  # Support replied
    RESOLVED = "RESOLVED"                    # The rider can still reply (that reopens it)
    CLOSED = "CLOSED"                        # Finished; the rider starts a new conversation instead
    ALL = (OPEN, WAITING_FOR_ADMIN, WAITING_FOR_RIDER, RESOLVED, CLOSED)
    LABELS = {
        OPEN: "Open", WAITING_FOR_ADMIN: "Waiting for support", WAITING_FOR_RIDER: "Waiting for rider",
        RESOLVED: "Resolved", CLOSED: "Closed",
    }


class SupportConversation(Base):
    """A rider ↔ support chat. The database is the source of truth for the rider app and the admin inbox.
    History is kept when a conversation is resolved, closed or reopened."""

    __tablename__ = "support_conversations"

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False, index=True)
    campaign_id = Column(Integer, nullable=True, index=True)  # Optional; no FK so campaign clean-up never touches chats
    campaign_name = Column(String(150), nullable=True)        # Snapshot shown in both apps
    subject = Column(String(150), nullable=False)
    status = Column(String(30), default=SupportStatus.WAITING_FOR_ADMIN, nullable=False, index=True)
    assigned_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    last_message_at = Column(DateTime, nullable=True)
    last_message_preview = Column(String(160), nullable=True)
    rider_last_read_id = Column(Integer, default=0, nullable=False)  # Highest message id the rider has read
    admin_last_read_id = Column(Integer, default=0, nullable=False)  # Highest message id support has read
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    rider = relationship("Rider")
    assigned_admin = relationship("User")


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("support_conversations.id"), nullable=False, index=True)
    sender_type = Column(String(10), nullable=False)  # RIDER, ADMIN, SYSTEM
    sender_user_id = Column(Integer, nullable=True)   # users.id of the rider's login or the admin (no FK: history is kept)
    sender_name = Column(String(120), nullable=True)  # Snapshot, e.g. "FlexRiders Support (Asha)"
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (Index("ix_support_messages_conversation_id_id", "conversation_id", "id"),)


class EnquiryStatus:
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    IN_PROGRESS = "IN_PROGRESS"
    CONVERTED = "CONVERTED"
    CLOSED = "CLOSED"
    ALL = (NEW, CONTACTED, IN_PROGRESS, CONVERTED, CLOSED)
    LABELS = {NEW: "New", CONTACTED: "Contacted", IN_PROGRESS: "In progress", CONVERTED: "Converted", CLOSED: "Closed"}


class BrandEnquiry(Base):
    """A lead from the public website (brand promotion enquiries, plus riders / auto drivers asking to join).
    Only admins can read it. When a brand enquiry converts, it links to the existing Brand (customer)."""

    __tablename__ = "brand_enquiries"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(20), default="business", nullable=False, index=True)  # business, rider, driver
    intent = Column(String(20), nullable=True)                                  # start, talk, advertise, support
    name = Column(String(120), nullable=False)
    company_name = Column(String(160), nullable=True)
    phone = Column(String(20), nullable=False, index=True)
    email = Column(String(160), nullable=True)
    city = Column(String(80), nullable=True)
    vehicle_interest = Column(String(20), nullable=True)  # RIDER_BIKE, AUTO, THREE_WHEELER, MULTIPLE
    campaign_requirement = Column(String(1000), nullable=True)
    campaign_duration = Column(String(80), nullable=True)
    message = Column(Text, nullable=True)
    status = Column(String(20), default=EnquiryStatus.NEW, nullable=False, index=True)
    notes = Column(Text, nullable=True)  # Internal, admins only
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=True)  # Set when converted to a customer
    source_key = Column(String(64), nullable=True, index=True)  # Hashed client address, only for rate limiting
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    handled_by_email = Column(String(120), nullable=True)

    brand = relationship("Brand")
