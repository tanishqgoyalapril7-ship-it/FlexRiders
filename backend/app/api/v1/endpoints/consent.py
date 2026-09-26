"""Platform Terms & Privacy acceptance for a logged-in user (asked again when a new version is published)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import UserRole
from app.models.all_models import User
from app.services import consent_service as consent

router = APIRouter()


class ConsentIn(BaseModel):
    accept_terms: bool = False


@router.get("/consent")
def consent_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    last = consent.latest(db, user.id)
    return {
        **consent.current(),
        # Only riders are asked in the app; admin accounts accept staff terms separately.
        "required": user.role == UserRole.RIDER and not consent.is_current(last),
        "accepted": consent.as_dict(last) if last else None,
    }


@router.post("/consent")
def accept_consent(data: ConsentIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not data.accept_terms:
        raise HTTPException(status_code=422, detail="Please accept the FlexRiders Terms & Conditions and Privacy Policy to continue.")
    if not consent.is_current(consent.latest(db, user.id)):
        consent.record(db, user, consent.APP)
        db.commit()
    return consent_status(db, user)
