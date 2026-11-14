"""Redeem Offer endpoints.

Public (no login): list open offers, submit one camera photo with name + mobile, and check "my offers"
with the private claim token the app keeps. Nothing here can approve anything or reveal anyone else's data.
Admin: configure the optional offer on a campaign (the approval queue is in this file's admin section).
"""
import hashlib
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.core.database import get_db
from app.models.all_models import User
from app.models.campaign_models import Campaign, CampaignStatus
from app.models.offer_models import (
    CampaignOffer,
    DiscountType,
    OfferSubmission,
    SubmissionStatus,
    Voucher,
)
from app.services import offer_service as svc
from app.services import storage_service as storage
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification

public_router = APIRouter()
admin_router = APIRouter()

PHOTO_FOLDER = "offer-photos"  # Private: never served by /uploads
SUBMITTED_MESSAGE = (
    "Your offer redemption request has been submitted successfully. Our team will verify your photograph. "
    "Once approved, your voucher will become available."
)


def _address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "") or "unknown"


def _bad(e: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(e))


# =========================================================================== public

@public_router.get("")
def list_open_offers(db: Session = Depends(get_db)):
    """Offers a guest can currently claim (brand, discount, area). Shown before the camera opens."""
    return {"offers": [svc.public_offer(o, c, b) for o, c, b in svc.open_offers(db)]}


@public_router.post("/submissions")
async def submit(
    request: Request,
    photo: UploadFile = File(...),
    name: str = Form(..., max_length=120),
    phone: str = Form(..., max_length=24),
    consent: str = Form(...),
    offer_id: Optional[int] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    accuracy_m: Optional[float] = Form(None),
    captured_at: Optional[str] = Form(None, max_length=40),
    device_info: Optional[str] = Form(None, max_length=200),
    website: Optional[str] = Form(None, max_length=200),  # Honeypot
    x_offer_token: Optional[str] = Header(None, max_length=100),
    db: Session = Depends(get_db),
):
    if website:
        raise HTTPException(status_code=422, detail="Please try again.")
    if consent.strip().lower() not in ("true", "1", "yes"):
        raise HTTPException(status_code=422, detail="Please accept the privacy notice to continue.")
    clean_name = " ".join((name or "").split())
    if len(clean_name) < 2:
        raise HTTPException(status_code=422, detail="Please enter your name.")
    try:
        mobile = svc.phone10(phone)
    except svc.OfferError as e:
        raise _bad(e)
    if (latitude is None) != (longitude is None) or (
        latitude is not None and not (-90 <= latitude <= 90 and -180 <= longitude <= 180)
    ):
        latitude = longitude = accuracy_m = None  # Ignore a half or impossible location rather than fail
    hint = None
    if offer_id:
        hint = db.get(CampaignOffer, offer_id)
        if not hint or not hint.enabled:
            hint = None  # A stale choice must not block the request; the admin picks the campaign anyway

    now = datetime.utcnow()
    key = svc.client_key(_address(request))
    guest_today = (
        db.query(func.count(OfferSubmission.id))
        .filter(OfferSubmission.guest.has(phone=mobile), OfferSubmission.received_at >= now - timedelta(days=1))
        .scalar()
    )
    address_hour = db.query(func.count(OfferSubmission.id)).filter(
        OfferSubmission.source_key == key, OfferSubmission.received_at >= now - timedelta(hours=1)
    ).scalar()
    if guest_today >= svc.PER_NUMBER_PER_DAY or address_hour >= svc.PER_ADDRESS_PER_HOUR:
        raise HTTPException(status_code=429, detail="You've sent several requests already. Please try again tomorrow.")

    content = await photo.read(svc.MAX_PHOTO_BYTES + 1)
    try:
        image = svc.read_photo(content)
    except svc.OfferError as e:
        raise _bad(e)

    token = x_offer_token if x_offer_token and len(x_offer_token) >= 32 else svc.new_claim_token()
    public_id = svc.new_public_id(db)
    try:
        original = storage.save(content, ".jpg", PHOTO_FOLDER, "image/jpeg")
        stamped = storage.save(svc.stamp(image, now, public_id), ".jpg", PHOTO_FOLDER, "image/jpeg")
    except storage.StorageError as e:
        raise HTTPException(status_code=503, detail=str(e))

    guest = svc.ensure_guest(db, mobile, clean_name, now)
    sub = OfferSubmission(
        public_id=public_id, guest_id=guest.id, guest_name=clean_name, claim_token_hash=svc.token_hash(token),
        offer_hint_id=hint.id if hint else None, photo_path=original, stamped_path=stamped,
        photo_sha256=hashlib.sha256(content).hexdigest(), photo_dhash=svc.perceptual_hash(image),
        received_at=now, device_captured_at=svc.to_utc_naive(captured_at),
        latitude=latitude, longitude=longitude, accuracy_m=accuracy_m,
        device_info=(device_info or "").strip()[:200] or None, source_key=key,
        status=SubmissionStatus.SUBMITTED, created_at=now, updated_at=now,
    )
    db.add(sub)
    db.flush()
    svc.run_checks(db, sub)
    db.commit()
    send_notification(
        db=db, is_admin=True, category="OFFER", reference_id=str(sub.id),
        title="New offer request", message=f"{clean_name} sent request {public_id} for verification.",
        dedupe_key=f"OFFER_SUBMITTED:{sub.id}",
    )
    return {
        "submission_id": public_id,
        "claim_token": token,
        "status": sub.status,
        "received_at": now.isoformat() + "Z",
        "message": SUBMITTED_MESSAGE,
    }


def _guest_item(sub: OfferSubmission, now: datetime) -> dict:
    voucher: Optional[Voucher] = sub.voucher
    item = {
        "submission_id": sub.public_id,
        "status": svc.guest_status(sub, now),
        "submitted_at": sub.received_at.isoformat() + "Z",
        "reject_reason": sub.reject_reason if sub.status == SubmissionStatus.REJECTED else None,
        "voucher": None,
    }
    if voucher:
        item["voucher"] = {
            "code": voucher.code,
            "brand_name": voucher.brand.name,
            "title": voucher.title,
            "discount": svc.discount_label(voucher.discount_type, voucher.discount_value),
            "status": svc.voucher_status(voucher, now),
            "expires_at": voucher.expires_at.isoformat() + "Z",
            "redeemed_at": voucher.redeemed_at.isoformat() + "Z" if voucher.redeemed_at else None,
        }
    return item


def _token_subs(db: Session, token: Optional[str]):
    if not token or len(token) < 32:
        raise HTTPException(status_code=401, detail="No offer requests on this phone yet.")
    return db.query(OfferSubmission).filter(OfferSubmission.claim_token_hash == svc.token_hash(token))


@public_router.get("/my")
def my_requests(x_offer_token: Optional[str] = Header(None, max_length=100), db: Session = Depends(get_db)):
    """This phone's requests and vouchers (by its private claim token only: never by phone number)."""
    now = datetime.utcnow()
    subs = _token_subs(db, x_offer_token).order_by(OfferSubmission.received_at.desc()).limit(50).all()
    return {"requests": [_guest_item(s, now) for s in subs]}


@public_router.get("/my/{submission_id}/photo")
def my_photo(submission_id: str, x_offer_token: Optional[str] = Header(None, max_length=100), db: Session = Depends(get_db)):
    """The stamped copy of one of this phone's own photos."""
    sub = _token_subs(db, x_offer_token).filter(OfferSubmission.public_id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Request not found.")
    return _image(sub.stamped_path or sub.photo_path)


def _image(path: Optional[str]) -> Response:
    try:
        content = storage.read(path)
    except storage.StorageError:
        raise HTTPException(status_code=503, detail="The photo couldn't be loaded just now. Please try again.")
    if content is None:
        raise HTTPException(status_code=404, detail="The photo file is missing.")
    return Response(content=content, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


# =========================================================================== admin: offer settings

class OfferIn(BaseModel):
    enabled: bool = False
    title: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    discount_type: str = DiscountType.PERCENT
    discount_value: float = Field(..., gt=0)
    max_vouchers: Optional[int] = Field(None, ge=1, le=1_000_000)
    validity_days: int = Field(30, ge=1, le=365)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    outlets: Optional[str] = Field(None, max_length=2000)
    max_per_customer: int = Field(1, ge=1, le=100)
    cooldown_days: int = Field(0, ge=0, le=365)
    settlement_notes: Optional[str] = Field(None, max_length=2000)


def offer_dict(db: Session, offer: Optional[CampaignOffer]) -> Optional[dict]:
    if not offer:
        return None
    fields = [c.name for c in CampaignOffer.__table__.columns]
    data = {f: getattr(offer, f) for f in fields}
    for f in ("start_date", "end_date", "created_at", "updated_at"):
        data[f] = data[f].isoformat() if data[f] else None
    data["discount"] = svc.discount_label(offer.discount_type, offer.discount_value)
    data["vouchers_issued"] = svc.issued_count(db, offer.id)
    return data


def _campaign(db: Session, campaign_id: int) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return campaign


@admin_router.get("/campaigns/{campaign_id}")
def get_campaign_offer(campaign_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    _campaign(db, campaign_id)
    offer = db.query(CampaignOffer).filter(CampaignOffer.campaign_id == campaign_id).first()
    return {"offer": offer_dict(db, offer)}


@admin_router.put("/campaigns/{campaign_id}")
def save_campaign_offer(campaign_id: int, data: OfferIn, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    campaign = _campaign(db, campaign_id)
    if campaign.status in CampaignStatus.CLOSED or campaign.status == CampaignStatus.REJECTED:
        raise HTTPException(status_code=400, detail="This campaign has ended, so its offer can't be changed.")
    if data.discount_type not in DiscountType.ALL:
        raise HTTPException(status_code=422, detail="Choose a percentage or a fixed rupee discount.")
    if data.discount_type == DiscountType.PERCENT and data.discount_value > 100:
        raise HTTPException(status_code=422, detail="A percentage discount can't be more than 100%.")
    if data.start_date and data.end_date and data.end_date < data.start_date:
        raise HTTPException(status_code=422, detail="The offer's end date is before its start date.")
    offer = db.query(CampaignOffer).filter(CampaignOffer.campaign_id == campaign_id).first()
    created = offer is None
    if created:
        offer = CampaignOffer(campaign_id=campaign_id)
        db.add(offer)
    for field, value in data.model_dump().items():
        setattr(offer, field, value.strip() if isinstance(value, str) else value)
    offer.updated_at = datetime.utcnow()
    db.flush()
    log_admin_action(
        db, admin, "OFFER_CREATED" if created else "OFFER_UPDATED", "CAMPAIGN", str(campaign_id),
        f"{'Enabled' if offer.enabled else 'Disabled'}: {offer.title} ({svc.discount_label(offer.discount_type, offer.discount_value)})",
    )
    db.commit()
    return {"offer": offer_dict(db, offer)}


# =========================================================================== admin: review queue

class ApproveIn(BaseModel):
    campaign_id: int
    rider_id: Optional[int] = None


class RejectIn(BaseModel):
    reason: str = Field(..., max_length=300)


class FlagIn(BaseModel):
    suspicious: bool
    note: Optional[str] = Field(None, max_length=300)


def _rider_brief(db: Session, rider_id: Optional[int]) -> Optional[dict]:
    from app.models.all_models import Rider

    rider = db.get(Rider, rider_id) if rider_id else None
    return {"id": rider.id, "code": rider.rider_id, "name": rider.full_name, "phone": rider.mobile_number} if rider else None


def _campaign_brief(db: Session, campaign_id: Optional[int]) -> Optional[dict]:
    campaign = db.get(Campaign, campaign_id) if campaign_id else None
    if not campaign:
        return None
    return {"id": campaign.id, "name": campaign.name, "brand_name": campaign.brand.name if campaign.brand else None,
            "status": campaign.status, "area": campaign.location_area}


def _admin_row(db: Session, sub: OfferSubmission, now: datetime) -> dict:
    voucher = sub.voucher
    duplicate = db.get(OfferSubmission, sub.duplicate_of_id) if sub.duplicate_of_id else None
    hint = sub.offer_hint
    reviewer = db.get(User, sub.reviewed_by_id) if sub.reviewed_by_id else None
    return {
        "id": sub.id,
        "submission_id": sub.public_id,
        "customer_name": sub.guest_name,
        "mobile": sub.guest.phone,
        "received_at": sub.received_at.isoformat() + "Z",
        "device_captured_at": sub.device_captured_at.isoformat() + "Z" if sub.device_captured_at else None,
        "latitude": sub.latitude,
        "longitude": sub.longitude,
        "accuracy_m": sub.accuracy_m,
        "device_info": sub.device_info,
        "status": sub.status,
        "flags": svc.flags_of(sub),
        "flagged_suspicious": sub.flagged_suspicious,
        "duplicate_of": duplicate.public_id if duplicate else None,
        "brand_hint": {"offer_id": hint.id, "brand_name": hint.campaign.brand.name, "title": hint.title} if hint else None,
        "suggested": {
            "campaign": _campaign_brief(db, sub.suggested_campaign_id),
            "rider": _rider_brief(db, sub.suggested_rider_id),
            "distance_m": sub.suggested_distance_m,
        } if sub.suggested_campaign_id else None,
        "campaign": _campaign_brief(db, sub.campaign_id),
        "rider": _rider_brief(db, sub.rider_id),
        "reject_reason": sub.reject_reason,
        "reviewed_by": (reviewer.email or reviewer.phone) if reviewer else None,
        "reviewed_at": sub.reviewed_at.isoformat() + "Z" if sub.reviewed_at else None,
        "voucher": {"code": voucher.code, "status": svc.voucher_status(voucher, now),
                    "expires_at": voucher.expires_at.isoformat() + "Z"} if voucher else None,
    }


def _submission(db: Session, id: int) -> OfferSubmission:
    sub = db.get(OfferSubmission, id)
    if not sub:
        raise HTTPException(status_code=404, detail="Offer request not found.")
    return sub


@admin_router.get("/submissions")
def list_submissions(
    status: str = "open",
    flagged: bool = False,
    q: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    from app.models.offer_models import OfferGuest

    query = db.query(OfferSubmission)
    if status == "open":
        query = query.filter(OfferSubmission.status.in_(SubmissionStatus.OPEN))
    elif status in (SubmissionStatus.APPROVED, SubmissionStatus.REJECTED):
        query = query.filter(OfferSubmission.status == status)
    if flagged:
        query = query.filter((OfferSubmission.flagged_suspicious.is_(True)) | (OfferSubmission.flags.isnot(None)))
    if q and q.strip():
        term = q.strip()
        digits = "".join(ch for ch in term if ch.isdigit())
        conds = [OfferSubmission.public_id.ilike(f"%{term}%"), OfferSubmission.guest_name.ilike(f"%{term}%")]
        if len(digits) >= 4:
            conds.append(OfferSubmission.guest.has(OfferGuest.phone.like(f"%{digits[-10:]}%")))
        from sqlalchemy import or_

        query = query.filter(or_(*conds))
    order = OfferSubmission.received_at.asc() if status == "open" else OfferSubmission.received_at.desc()
    rows = query.order_by(order).limit(max(1, min(limit, 300))).all()
    now = datetime.utcnow()
    counts = dict(db.query(OfferSubmission.status, func.count(OfferSubmission.id)).group_by(OfferSubmission.status).all())
    return {
        "submissions": [_admin_row(db, s, now) for s in rows],
        "counts": {
            "open": counts.get(SubmissionStatus.SUBMITTED, 0) + counts.get(SubmissionStatus.UNDER_REVIEW, 0),
            "approved": counts.get(SubmissionStatus.APPROVED, 0),
            "rejected": counts.get(SubmissionStatus.REJECTED, 0),
        },
    }


@admin_router.get("/submissions/{id}")
def get_submission(id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    sub = _submission(db, id)
    if sub.status == SubmissionStatus.SUBMITTED:
        sub.status = SubmissionStatus.UNDER_REVIEW  # The guest now sees "Under review"
        db.commit()
    now = datetime.utcnow()
    nearby = []
    if sub.latitude is not None:
        for m in svc.nearby_riders(db, sub.latitude, sub.longitude, sub.received_at)[:8]:
            nearby.append({"rider": _rider_brief(db, m["rider_id"]), "campaign": _campaign_brief(db, m["campaign_id"]),
                           "distance_m": m["distance_m"], "offer_enabled": m["offer_enabled"]})
    # Campaigns this request could be approved against: every campaign with its offer switched on.
    choices = [
        {**_campaign_brief(db, o.campaign_id), "offer_title": o.title,
         "discount": svc.discount_label(o.discount_type, o.discount_value)}
        for o in db.query(CampaignOffer).filter(CampaignOffer.enabled.is_(True)).all()
    ]
    history = (
        db.query(OfferSubmission)
        .filter(OfferSubmission.guest_id == sub.guest_id, OfferSubmission.id != sub.id)
        .order_by(OfferSubmission.received_at.desc())
        .limit(20)
        .all()
    )
    return {
        **_admin_row(db, sub, now),
        "nearby_riders": nearby,
        "campaign_choices": choices,
        "same_number_history": [
            {"id": h.id, "submission_id": h.public_id, "status": svc.guest_status(h, now), "received_at": h.received_at.isoformat() + "Z"}
            for h in history
        ],
    }


@admin_router.get("/submissions/{id}/photo")
def submission_photo(id: int, stamped: bool = False, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    sub = _submission(db, id)
    return _image(sub.stamped_path if stamped and sub.stamped_path else sub.photo_path)


@admin_router.post("/submissions/{id}/approve")
def approve_submission(id: int, data: ApproveIn, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    from sqlalchemy.exc import IntegrityError

    sub = _submission(db, id)
    try:
        voucher = svc.approve(db, sub, data.campaign_id, data.rider_id, admin)
        db.commit()
    except svc.OfferError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This request has already been decided.")
    log_admin_action(db, admin, "OFFER_APPROVED", "OFFER_REQUEST", sub.public_id,
                     f"Voucher {voucher.code} for campaign #{voucher.campaign_id} ({voucher.title})")
    return _admin_row(db, sub, datetime.utcnow())


@admin_router.post("/submissions/{id}/reject")
def reject_submission(id: int, data: RejectIn, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    sub = _submission(db, id)
    try:
        svc.reject(db, sub, data.reason, admin)
        db.commit()
    except svc.OfferError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    log_admin_action(db, admin, "OFFER_REJECTED", "OFFER_REQUEST", sub.public_id, sub.reject_reason)
    return _admin_row(db, sub, datetime.utcnow())


@admin_router.post("/submissions/{id}/flag")
def flag_submission(id: int, data: FlagIn, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    sub = _submission(db, id)
    sub.flagged_suspicious = data.suspicious
    db.commit()
    log_admin_action(db, admin, "OFFER_FLAGGED" if data.suspicious else "OFFER_UNFLAGGED", "OFFER_REQUEST", sub.public_id,
                     (data.note or "").strip() or None)
    return _admin_row(db, sub, datetime.utcnow())
