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

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="rider_profile")
    documents = relationship("RiderDocument", back_populates="rider", cascade="all, delete-orphan")
    brand_assignments = relationship("RiderBrandAssignment", back_populates="rider", cascade="all, delete-orphan")
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
    amount = Column(Float, nullable=False)
    payment_date = Column(DateTime, default=datetime.utcnow)
    payment_period = Column(String(50), default="September 2026")
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
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")


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
