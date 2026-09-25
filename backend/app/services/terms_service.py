"""Campaign Terms & Conditions: versioned text entered by an admin, and riders' acceptances.

Rules:
- A version is never edited or deleted; publishing new text creates the next version.
- Acceptances are append-only, one row per rider per version, and are only ever recorded by the
  server for the campaign's *current* version (a client can't claim an older or made-up version).
- Joining (a new request) and admin approval require the current version to be accepted.
- Riders already in a campaign are NOT blocked from their daily photos when a new version is
  published; they get a notification and a reminder until they accept.
- FlexRiders never writes terms itself: the text is exactly what an admin publishes.
"""
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.all_models import Rider, User
from app.models.campaign_models import (
    AssignmentStatus,
    Campaign,
    CampaignAssignment,
    CampaignTerms,
    CampaignTermsAcceptance,
)
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification

MAX_TERMS_LENGTH = 50_000


class TermsError(ValueError):
    """Shown to the user as-is (400)."""


def current_terms(db: Session, campaign_id: int) -> Optional[CampaignTerms]:
    return (
        db.query(CampaignTerms)
        .filter(CampaignTerms.campaign_id == campaign_id)
        .order_by(CampaignTerms.version.desc())
        .first()
    )


def accepted_version(db: Session, campaign_id: int, rider_id: int) -> Optional[int]:
    """The newest version this rider accepted for this campaign, or None."""
    return (
        db.query(func.max(CampaignTermsAcceptance.terms_version))
        .filter(CampaignTermsAcceptance.campaign_id == campaign_id, CampaignTermsAcceptance.rider_id == rider_id)
        .scalar()
    )


def has_accepted_current(db: Session, campaign_id: int, rider_id: int) -> bool:
    """True when the campaign has no terms, or the rider accepted the current version."""
    terms = current_terms(db, campaign_id)
    return terms is None or (accepted_version(db, campaign_id, rider_id) or 0) >= terms.version


def publish(db: Session, campaign: Campaign, body: str, change_note: Optional[str], admin: User) -> CampaignTerms:
    text = (body or "").strip()
    if len(text) < 20:
        raise TermsError("Enter the full Terms & Conditions text (at least 20 characters).")
    if len(text) > MAX_TERMS_LENGTH:
        raise TermsError(f"The terms text is too long (maximum {MAX_TERMS_LENGTH:,} characters).")
    previous = current_terms(db, campaign.id)
    if previous and previous.body.strip() == text:
        raise TermsError("This text is the same as the current version. Change the text to publish a new version.")
    terms = CampaignTerms(
        campaign_id=campaign.id,
        version=(previous.version + 1) if previous else 1,
        body=text,
        change_note=(change_note or "").strip() or None,
        published_by_id=admin.id,
    )
    db.add(terms)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise TermsError("Another admin just published a version. Reload and try again.")
    db.refresh(terms)
    log_admin_action(
        db=db, admin_user=admin, action="CAMPAIGN_TERMS_PUBLISHED", target_type="CAMPAIGN", target_id=str(campaign.id),
        details=f"{campaign.name}: Terms & Conditions version {terms.version} published" + (f" ({terms.change_note})" if terms.change_note else ""),
    )
    if previous:
        # Riders already in the campaign keep working; they're asked to review and accept the new version.
        riders = (
            db.query(Rider)
            .join(CampaignAssignment, CampaignAssignment.rider_id == Rider.id)
            .filter(CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.status.in_(AssignmentStatus.CURRENT))
            .all()
        )
        for rider in riders:
            if rider.user_id:
                send_notification(
                    db=db, user_id=rider.user_id, category="CAMPAIGN", reference_id=str(campaign.id),
                    title="Campaign terms updated",
                    message=f"The Terms & Conditions for {campaign.name} were updated (version {terms.version}). Open the campaign to review and accept them.",
                    dedupe_key=f"TERMS_UPDATED:{terms.id}:{rider.id}",
                )
    return terms


def accept(
    db: Session, campaign: Campaign, rider: Rider, version: Optional[int], application_id: Optional[int] = None, source: str = "JOIN"
) -> Optional[CampaignTermsAcceptance]:
    """Records the rider accepting the CURRENT version. `version` is what the rider saw; it must match,
    so nobody accepts text they weren't shown. Accepting the same version twice is a no-op."""
    terms = current_terms(db, campaign.id)
    if terms is None:
        return None
    if version != terms.version:
        raise TermsError(
            f"Please read and accept the current Terms & Conditions for {campaign.name} (version {terms.version})."
            if version is None else
            f"These terms have been updated to version {terms.version}. Please review the latest version and accept it."
        )
    existing = (
        db.query(CampaignTermsAcceptance)
        .filter(CampaignTermsAcceptance.terms_id == terms.id, CampaignTermsAcceptance.rider_id == rider.id)
        .first()
    )
    if existing:
        if application_id and not existing.application_id:
            existing.application_id = application_id
            db.commit()
        return existing
    acceptance = CampaignTermsAcceptance(
        campaign_id=campaign.id, rider_id=rider.id, terms_id=terms.id, terms_version=terms.version,
        application_id=application_id, source=source, accepted_at=datetime.utcnow(),
    )
    db.add(acceptance)
    try:
        db.commit()
    except IntegrityError:  # Two taps at once: the first one counts
        db.rollback()
        return (
            db.query(CampaignTermsAcceptance)
            .filter(CampaignTermsAcceptance.terms_id == terms.id, CampaignTermsAcceptance.rider_id == rider.id)
            .first()
        )
    db.refresh(acceptance)
    return acceptance


def terms_dict(terms: Optional[CampaignTerms]) -> Optional[Dict]:
    if terms is None:
        return None
    return {"version": terms.version, "body": terms.body, "change_note": terms.change_note, "published_at": terms.published_at}


def rider_status(db: Session, campaign_id: int, rider_id: int) -> Optional[Dict]:
    """What the rider app shows: the current text and whether this rider still has to accept it."""
    terms = current_terms(db, campaign_id)
    if terms is None:
        return None
    mine = accepted_version(db, campaign_id, rider_id)
    return {**terms_dict(terms), "accepted_version": mine, "needs_acceptance": (mine or 0) < terms.version}


def admin_overview(db: Session, campaign: Campaign) -> Dict:
    """Every version with its acceptance count, and how many current riders accepted the latest one."""
    versions = (
        db.query(CampaignTerms).filter(CampaignTerms.campaign_id == campaign.id).order_by(CampaignTerms.version.desc()).all()
    )
    counts = dict(
        db.query(CampaignTermsAcceptance.terms_version, func.count(CampaignTermsAcceptance.id))
        .filter(CampaignTermsAcceptance.campaign_id == campaign.id)
        .group_by(CampaignTermsAcceptance.terms_version)
        .all()
    )
    current = versions[0] if versions else None
    current_riders = [
        a.rider_id
        for a in db.query(CampaignAssignment.rider_id).filter(
            CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.status.in_(AssignmentStatus.CURRENT)
        )
    ]
    accepted_current = 0
    if current and current_riders:
        accepted_current = (
            db.query(func.count(CampaignTermsAcceptance.id))
            .filter(CampaignTermsAcceptance.terms_id == current.id, CampaignTermsAcceptance.rider_id.in_(current_riders))
            .scalar()
        )
    return {
        "current": terms_dict(current),
        "current_riders": len(current_riders),
        "current_riders_accepted": accepted_current,
        "versions": [
            {**terms_dict(t), "published_by": t.published_by.email if t.published_by else None, "acceptances": counts.get(t.version, 0)}
            for t in versions
        ],
    }
