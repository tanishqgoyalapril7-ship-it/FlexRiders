"""Platform Terms & Conditions and Privacy Policy acceptance (riders).

Every acceptance is a new PlatformConsent row, so the history of versions a user agreed to is never lost.
A rider must accept at registration; when settings.PLATFORM_TERMS_VERSION or PRIVACY_POLICY_VERSION changes,
existing riders are asked to accept again in the app (GET/POST /auth/consent).
Campaign terms are a separate, per-campaign system (terms_service).
"""
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.all_models import PlatformConsent, User

REGISTRATION = "REGISTRATION"
APP = "APP"


def current() -> Dict[str, str]:
    return {
        "terms_version": settings.PLATFORM_TERMS_VERSION,
        "privacy_version": settings.PRIVACY_POLICY_VERSION,
        "terms_url": settings.TERMS_URL,
        "privacy_url": settings.PRIVACY_URL,
    }


def latest(db: Session, user_id: int) -> Optional[PlatformConsent]:
    return db.query(PlatformConsent).filter(PlatformConsent.user_id == user_id).order_by(PlatformConsent.id.desc()).first()


def is_current(consent: Optional[PlatformConsent]) -> bool:
    return bool(
        consent
        and consent.terms_version == settings.PLATFORM_TERMS_VERSION
        and consent.privacy_version == settings.PRIVACY_POLICY_VERSION
    )


def record(db: Session, user: User, source: str) -> PlatformConsent:
    """Adds an acceptance of the current versions (the caller commits)."""
    consent = PlatformConsent(
        user_id=user.id,
        terms_version=settings.PLATFORM_TERMS_VERSION,
        privacy_version=settings.PRIVACY_POLICY_VERSION,
        source=source,
        accepted_at=datetime.utcnow(),
    )
    db.add(consent)
    return consent


def as_dict(consent: PlatformConsent) -> Dict:
    return {
        "terms_version": consent.terms_version,
        "privacy_version": consent.privacy_version,
        "source": consent.source,
        "accepted_at": consent.accepted_at,
    }
