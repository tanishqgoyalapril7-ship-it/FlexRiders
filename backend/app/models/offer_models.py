"""Redeem Offer: members of the public photograph a FlexRiders rider carrying a brand, an admin verifies the
photo, and an approved request becomes a one-time voucher the brand redeems at its outlet.

Naming: in this codebase "CUSTOMER" already means a brand account, so the people claiming offers are
"offer guests". Guests have no login: each phone keeps a private claim token, and only the token's hash is
stored (on every submission it made), so nobody can look up another person's requests by phone number.

Tables (all additive; nothing existing changes):
- campaign_offers   one optional offer per campaign (premium add-on, configured by an admin)
- offer_guests      one row per mobile number (name, first/last seen)
- offer_submissions one photo + details per request, with the evidence used to verify it
- vouchers          created only when an admin approves a submission; redeemed once by the brand
Approvals, rejections and redemptions are also written to audit_logs.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.database import Base


class DiscountType:
    PERCENT = "PERCENT"
    FIXED = "FIXED"  # Rupees off
    ALL = (PERCENT, FIXED)


class SubmissionStatus:
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"  # An admin has opened it
    APPROVED = "APPROVED"  # A voucher exists
    REJECTED = "REJECTED"
    OPEN = (SUBMITTED, UNDER_REVIEW)


class VoucherStatus:
    ACTIVE = "ACTIVE"
    REDEEMED = "REDEEMED"
    EXPIRED = "EXPIRED"  # Shown when expires_at has passed; the stored status may still say ACTIVE
    CANCELLED = "CANCELLED"  # Withdrawn by a FlexRiders admin (never by the brand)


class CampaignOffer(Base):
    __tablename__ = "campaign_offers"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, unique=True)
    enabled = Column(Boolean, default=False, nullable=False)
    title = Column(String(120), nullable=False)  # e.g. "10% off your bill"
    description = Column(Text, nullable=True)  # Terms shown to the guest
    discount_type = Column(String(10), default=DiscountType.PERCENT, nullable=False)
    discount_value = Column(Float, nullable=False)  # 10 = 10% or ₹10
    max_vouchers = Column(Integer, nullable=True)  # Empty = no cap
    validity_days = Column(Integer, default=30, nullable=False)  # Voucher lifetime from approval
    start_date = Column(Date, nullable=True)  # Empty = the campaign's dates
    end_date = Column(Date, nullable=True)
    outlets = Column(Text, nullable=True)  # Free text: participating outlets / addresses
    max_per_customer = Column(Integer, default=1, nullable=False)  # Vouchers per mobile number for this campaign
    cooldown_days = Column(Integer, default=0, nullable=False)  # Days between two vouchers for the same number
    # The discount is always funded by the brand at its own outlet (owner, 2026-11-14): FlexRiders never
    # pays for vouchers. Free-text notes on the agreement, for the monthly report only.
    settlement_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    campaign = relationship("Campaign")


class OfferGuest(Base):
    __tablename__ = "offer_guests"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(10), unique=True, nullable=False)  # 10 digits
    name = Column(String(120), nullable=False)  # Latest name given
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)


class OfferSubmission(Base):
    __tablename__ = "offer_submissions"

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(String(16), unique=True, nullable=False)  # FR-XXXXXX, shown to the guest
    guest_id = Column(Integer, ForeignKey("offer_guests.id"), nullable=False, index=True)
    guest_name = Column(String(120), nullable=False)  # As entered on this request
    claim_token_hash = Column(String(64), nullable=False, index=True)
    # The offer the guest says they saw (a hint; the admin confirms the real campaign).
    offer_hint_id = Column(Integer, ForeignKey("campaign_offers.id"), nullable=True)
    photo_path = Column(String(300), nullable=False)  # Original, private
    stamped_path = Column(String(300), nullable=True)  # Copy with the server's date/time stamp
    photo_sha256 = Column(String(64), nullable=False, index=True)
    photo_dhash = Column(String(16), nullable=True, index=True)  # 64-bit perceptual hash, hex
    received_at = Column(DateTime, nullable=False, index=True)  # Server time (UTC): the trusted time
    device_captured_at = Column(DateTime, nullable=True)  # Phone's clock (UTC): stored, never trusted
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    accuracy_m = Column(Float, nullable=True)
    device_info = Column(String(200), nullable=True)
    source_key = Column(String(64), nullable=True, index=True)  # Keyed hash of the client address
    status = Column(String(16), default=SubmissionStatus.SUBMITTED, nullable=False, index=True)
    # Automatic checks, for the admin (never an automatic decision)
    flags = Column(Text, nullable=True)  # JSON list of {"code", "text"}
    duplicate_of_id = Column(Integer, ForeignKey("offer_submissions.id"), nullable=True)
    suggested_campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True)
    suggested_rider_id = Column(Integer, ForeignKey("riders.id"), nullable=True)
    suggested_distance_m = Column(Float, nullable=True)
    # Review
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True, index=True)  # Confirmed by the admin
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=True)
    reject_reason = Column(String(300), nullable=True)
    flagged_suspicious = Column(Boolean, default=False, nullable=False)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    guest = relationship("OfferGuest")
    offer_hint = relationship("CampaignOffer")
    voucher = relationship("Voucher", back_populates="submission", uselist=False)

    __table_args__ = (Index("ix_offer_submissions_guest_received", "guest_id", "received_at"),)


class Voucher(Base):
    __tablename__ = "vouchers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(24), unique=True, nullable=False)  # FR-B10-8X29KQ
    submission_id = Column(Integer, ForeignKey("offer_submissions.id"), nullable=False)
    guest_id = Column(Integer, ForeignKey("offer_guests.id"), nullable=False, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False, index=True)
    offer_id = Column(Integer, ForeignKey("campaign_offers.id"), nullable=False)
    # Snapshot of the offer at approval, so later edits never change an issued voucher
    title = Column(String(120), nullable=False)
    discount_type = Column(String(10), nullable=False)
    discount_value = Column(Float, nullable=False)
    status = Column(String(12), default=VoucherStatus.ACTIVE, nullable=False, index=True)
    issued_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    redeemed_at = Column(DateTime, nullable=True)
    redeemed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    redeemed_outlet = Column(String(160), nullable=True)
    bill_amount = Column(Float, nullable=True)  # Optional, entered by the outlet for reconciliation
    cancelled_reason = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    submission = relationship("OfferSubmission", back_populates="voucher")
    guest = relationship("OfferGuest")
    brand = relationship("Brand")
    campaign = relationship("Campaign")

    __table_args__ = (
        UniqueConstraint("submission_id", name="uq_voucher_submission"),  # One voucher per request, ever
        Index("ix_vouchers_guest_campaign", "guest_id", "campaign_id"),
    )
