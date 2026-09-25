"""Account deletion requests from the public web form (Google Play requires a way to ask for deletion
without the app). The form never reveals whether a number has an account. An admin confirms the
requester (e.g. by calling the number) and then completes the request, which applies the same rule as
deleting from the app: full deletion without history, otherwise personal data is erased and the payout /
campaign records that must be kept stay."""
import re
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.models.all_models import AccountDeletionRequest, Rider, User
from app.services import data_admin_service as das
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification

public_router = APIRouter()
admin_router = APIRouter()

MAX_PER_NUMBER_PER_DAY = 3
RECEIVED = "Your request has been received. The FlexRiders team will contact you on this number to confirm it before deleting the account."


class DeletionRequestIn(BaseModel):
    mobile_number: str = Field(..., max_length=20)
    full_name: str = Field(..., min_length=2, max_length=120)
    message: Optional[str] = Field(None, max_length=1000)


class ResolveIn(BaseModel):
    note: Optional[str] = Field(None, max_length=500)


def _ten_digits(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits[-10:] if len(digits) >= 10 else ""


def _find_rider(db: Session, phone10: str) -> Optional[Rider]:
    return db.query(Rider).filter(Rider.mobile_number.like(f"%{phone10}")).order_by(Rider.id.desc()).first() if phone10 else None


@public_router.post("/account-deletion-requests")
def request_account_deletion(data: DeletionRequestIn, db: Session = Depends(get_db)):
    phone = _ten_digits(data.mobile_number)
    if not phone:
        raise HTTPException(status_code=422, detail="Enter the 10-digit mobile number of the account.")
    # Same answer whether or not the number has an account; repeated requests are quietly collapsed.
    since = datetime.utcnow() - timedelta(days=1)
    recent = db.query(AccountDeletionRequest).filter(AccountDeletionRequest.mobile_number == phone, AccountDeletionRequest.created_at >= since).count()
    if recent < MAX_PER_NUMBER_PER_DAY:
        request = AccountDeletionRequest(mobile_number=phone, full_name=data.full_name.strip(), message=(data.message or "").strip() or None)
        db.add(request)
        db.commit()
        send_notification(
            db=db, is_admin=True, category="REGISTRATION", reference_id=str(request.id),
            title="Account deletion request",
            message=f"{request.full_name} ({phone}) asked for their FlexRiders account to be deleted. Confirm with them, then complete it under Deletion Requests.",
        )
    return {"success": True, "message": RECEIVED}


def _request_dict(db: Session, r: AccountDeletionRequest) -> dict:
    rider = _find_rider(db, r.mobile_number)
    return {
        "id": r.id,
        "mobile_number": r.mobile_number,
        "full_name": r.full_name,
        "message": r.message,
        "status": r.status,
        "resolution": r.resolution,
        "created_at": r.created_at,
        "handled_at": r.handled_at,
        "handled_by": r.handled_by_email,
        "rider": {"id": rider.id, "rider_id": rider.rider_id, "full_name": rider.full_name, "status": rider.status, "archived": bool(rider.archived_at)} if rider else None,
    }


@admin_router.get("")
def list_deletion_requests(status: Optional[str] = None, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    query = db.query(AccountDeletionRequest)
    if status and status != "ALL":
        query = query.filter(AccountDeletionRequest.status == status)
    return [_request_dict(db, r) for r in query.order_by(AccountDeletionRequest.created_at.desc()).all()]


def _get(db: Session, request_id: int) -> AccountDeletionRequest:
    r = db.get(AccountDeletionRequest, request_id)
    if not r:
        raise HTTPException(status_code=404, detail="Request not found")
    if r.status != "NEW":
        raise HTTPException(status_code=400, detail="This request has already been handled.")
    return r


@admin_router.post("/{request_id}/complete")
def complete_deletion_request(request_id: int, data: ResolveIn, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Deletes the matching rider account (after the admin confirmed the requester)."""
    from app.services import campaign_service as svc

    r = _get(db, request_id)
    rider = _find_rider(db, r.mobile_number)
    if rider is None:
        outcome = "No FlexRiders account uses this number; nothing to delete."
    else:
        current = svc.current_assignment(db, rider.id)
        if current:
            raise HTTPException(status_code=400, detail="This rider is in an active campaign. Remove them from the campaign first, then complete the request.")
        result = das.delete_rider_account(db, rider, f"Web deletion request #{r.id}", admin)
        outcome = (
            "Account and all details deleted."
            if result["deleted"]
            else "Account deleted and personal data erased; payment and campaign records kept."
        )
    r.status, r.handled_at, r.handled_by_email = "COMPLETED", datetime.utcnow(), admin.email
    r.resolution = (outcome + (f" Note: {data.note.strip()}" if data.note and data.note.strip() else ""))[:500]
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="ACCOUNT_DELETION_REQUEST_COMPLETED", target_type="DELETION_REQUEST", target_id=str(r.id), details=r.resolution)
    return _request_dict(db, r)


@admin_router.post("/{request_id}/reject")
def reject_deletion_request(request_id: int, data: ResolveIn, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """E.g. the requester couldn't be confirmed as the account owner."""
    if not data.note or not data.note.strip():
        raise HTTPException(status_code=400, detail="Give a reason (for example: could not confirm the owner).")
    r = _get(db, request_id)
    r.status, r.handled_at, r.handled_by_email, r.resolution = "REJECTED", datetime.utcnow(), admin.email, data.note.strip()[:500]
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="ACCOUNT_DELETION_REQUEST_REJECTED", target_type="DELETION_REQUEST", target_id=str(r.id), details=r.resolution)
    return _request_dict(db, r)
