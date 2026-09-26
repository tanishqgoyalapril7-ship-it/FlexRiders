"""Website enquiries (leads): the public landing page can only SUBMIT; admins read and follow up.

Spam protection: a hidden honeypot field, server-side validation, and per-number and per-address limits
(the client address is only stored as a keyed hash). A converted brand enquiry links to the existing
Brand (customer) instead of creating a second customer record."""
import hashlib
import hmac
import re
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin
from app.core.config import settings
from app.core.database import get_db
from app.models.all_models import Brand, BrandEnquiry, EnquiryStatus, User
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification

public_router = APIRouter()
admin_router = APIRouter()

KINDS = ("business", "rider", "driver")
INTENTS = ("start", "talk", "advertise", "support")
VEHICLE_INTERESTS = {
    "RIDER_BIKE": "Rider / Bike",
    "AUTO": "Auto",
    "THREE_WHEELER": "Three Wheeler",
    "MULTIPLE": "Multiple vehicles",
}
PER_NUMBER_PER_DAY = 3
PER_ADDRESS_PER_HOUR = 5
THANKS = "Thank you! Your enquiry has been submitted. Our team will contact you soon."
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class EnquiryIn(BaseModel):
    kind: str = Field("business", max_length=20)
    intent: Optional[str] = Field(None, max_length=20)
    name: str = Field(..., max_length=120)
    company_name: Optional[str] = Field(None, max_length=160)
    phone: str = Field(..., max_length=24)
    email: Optional[str] = Field(None, max_length=160)
    city: Optional[str] = Field(None, max_length=80)
    vehicle_interest: Optional[str] = Field(None, max_length=20)
    campaign_requirement: Optional[str] = Field(None, max_length=1000)
    campaign_duration: Optional[str] = Field(None, max_length=80)
    message: Optional[str] = Field(None, max_length=2000)
    website: Optional[str] = Field(None, max_length=200)  # Honeypot: people never see or fill it


class EnquiryUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=5000)


class ConvertIn(BaseModel):
    brand_id: Optional[int] = None  # Link an existing customer; otherwise a new Brand is created from the enquiry


def _clean(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    return value or None


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    address = forwarded.split(",")[0].strip() or (request.client.host if request.client else "") or "unknown"
    return hmac.new(settings.SECRET_KEY.encode(), f"enquiry:{address}".encode(), hashlib.sha256).hexdigest()[:40]


@public_router.post("/enquiries")
def submit_enquiry(data: EnquiryIn, request: Request, db: Session = Depends(get_db)):
    if _clean(data.website):
        return {"success": True, "message": THANKS}  # Bots fill the hidden field: accept quietly, store nothing
    kind = (data.kind or "business").strip().lower()
    if kind not in KINDS:
        raise HTTPException(status_code=422, detail="Choose business, rider or auto driver.")
    name = _clean(data.name)
    if not name or len(name) < 2:
        raise HTTPException(status_code=422, detail="Please enter your name.")
    digits = re.sub(r"\D", "", data.phone or "")
    if len(digits) < 10 or len(digits) > 13:
        raise HTTPException(status_code=422, detail="Please enter a valid 10-digit phone number.")
    phone = digits[-10:]
    email = _clean(data.email)
    if email and not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")
    company = _clean(data.company_name)
    vehicle = _clean(data.vehicle_interest)
    requirement = _clean(data.campaign_requirement)
    if kind == "business":
        if not company:
            raise HTTPException(status_code=422, detail="Please enter your company or brand name.")
        if vehicle and vehicle not in VEHICLE_INTERESTS:
            raise HTTPException(status_code=422, detail="Choose a vehicle type from the list.")
        if not requirement and not _clean(data.message):
            raise HTTPException(status_code=422, detail="Tell us briefly what you'd like to promote.")
    elif not _clean(data.city):
        raise HTTPException(status_code=422, detail="Please enter your city.")

    now = datetime.utcnow()
    key = _client_key(request)
    same_number = db.query(func.count(BrandEnquiry.id)).filter(BrandEnquiry.phone == phone, BrandEnquiry.created_at >= now - timedelta(days=1)).scalar()
    same_address = db.query(func.count(BrandEnquiry.id)).filter(BrandEnquiry.source_key == key, BrandEnquiry.created_at >= now - timedelta(hours=1)).scalar()
    if same_number >= PER_NUMBER_PER_DAY or same_address >= PER_ADDRESS_PER_HOUR:
        raise HTTPException(status_code=429, detail="We've already received your enquiry. Our team will contact you soon.")

    enquiry = BrandEnquiry(
        kind=kind, intent=data.intent if data.intent in INTENTS else None, name=name, company_name=company, phone=phone, email=email,
        city=_clean(data.city), vehicle_interest=vehicle if kind == "business" else None, campaign_requirement=requirement,
        campaign_duration=_clean(data.campaign_duration), message=_clean(data.message), source_key=key, created_at=now, updated_at=now,
    )
    db.add(enquiry)
    db.commit()
    who = {"business": company or name, "rider": f"Rider {name}", "driver": f"Auto driver {name}"}[kind]
    send_notification(
        db=db, is_admin=True, category="ENQUIRY", reference_id=str(enquiry.id),
        title="New brand enquiry" if kind == "business" else "New website enquiry",
        message=f"{who} ({phone}) sent an enquiry from the website.",
        dedupe_key=f"ENQUIRY:{enquiry.id}",
    )
    return {"success": True, "message": THANKS}


# --------------------------------------------------------------------------- admin

def _dict(e: BrandEnquiry) -> dict:
    return {
        "id": e.id, "kind": e.kind, "intent": e.intent, "name": e.name, "company_name": e.company_name, "phone": e.phone,
        "email": e.email, "city": e.city, "vehicle_interest": e.vehicle_interest,
        "vehicle_interest_label": VEHICLE_INTERESTS.get(e.vehicle_interest) if e.vehicle_interest else None,
        "campaign_requirement": e.campaign_requirement, "campaign_duration": e.campaign_duration, "message": e.message,
        "status": e.status, "status_label": EnquiryStatus.LABELS.get(e.status, e.status), "notes": e.notes,
        "brand": {"id": e.brand.id, "name": e.brand.name} if e.brand else None,
        "created_at": e.created_at, "updated_at": e.updated_at, "handled_by": e.handled_by_email,
    }


def _get(db: Session, enquiry_id: int) -> BrandEnquiry:
    e = db.get(BrandEnquiry, enquiry_id)
    if not e:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return e


@admin_router.get("")
def list_enquiries(status: Optional[str] = None, kind: Optional[str] = None, search: Optional[str] = None,
                   db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    query = db.query(BrandEnquiry)
    if status and status != "ALL":
        query = query.filter(BrandEnquiry.status == status)
    if kind and kind != "ALL":
        query = query.filter(BrandEnquiry.kind == kind)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(BrandEnquiry.name.ilike(term), BrandEnquiry.company_name.ilike(term), BrandEnquiry.phone.ilike(term),
                                 BrandEnquiry.email.ilike(term), BrandEnquiry.city.ilike(term)))
    counts = dict(db.query(BrandEnquiry.status, func.count(BrandEnquiry.id)).group_by(BrandEnquiry.status).all())
    return {
        "enquiries": [_dict(e) for e in query.order_by(BrandEnquiry.created_at.desc()).limit(500).all()],
        "counts": {s: counts.get(s, 0) for s in EnquiryStatus.ALL},
    }


@admin_router.patch("/{enquiry_id}")
def update_enquiry(enquiry_id: int, data: EnquiryUpdate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    e = _get(db, enquiry_id)
    changes = []
    if data.status is not None:
        status = data.status.strip().upper()
        if status not in EnquiryStatus.ALL:
            raise HTTPException(status_code=400, detail="Unknown status.")
        if status == EnquiryStatus.CONVERTED and not e.brand_id:
            raise HTTPException(status_code=400, detail="Use Convert to customer to link or create the brand.")
        if status != e.status:
            changes.append(f"status {EnquiryStatus.LABELS[e.status]} → {EnquiryStatus.LABELS[status]}")
            e.status = status
    if data.notes is not None:
        e.notes = data.notes.strip() or None
        changes.append("notes updated")
    if changes:
        e.updated_at, e.handled_by_email = datetime.utcnow(), admin.email
        db.commit()
        log_admin_action(db=db, admin_user=admin, action="ENQUIRY_UPDATED", target_type="ENQUIRY", target_id=str(e.id),
                         details=f"Enquiry #{e.id} ({e.company_name or e.name}): " + ", ".join(changes))
    return _dict(e)


@admin_router.post("/{enquiry_id}/convert")
def convert_enquiry(enquiry_id: int, data: ConvertIn, db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    """Brand enquiries only: link an existing Brand, or create one from the enquiry's company and contact."""
    e = _get(db, enquiry_id)
    if e.kind != "business":
        raise HTTPException(status_code=400, detail="Only brand enquiries can become customers.")
    if e.brand_id:
        raise HTTPException(status_code=400, detail="This enquiry is already linked to a customer.")
    if data.brand_id:
        brand = db.get(Brand, data.brand_id)
        if not brand:
            raise HTTPException(status_code=404, detail="Brand not found")
    else:
        from app.api.v1.endpoints.brands import _check_unique

        name = (e.company_name or "").strip()
        if len(name) < 2:
            raise HTTPException(status_code=400, detail="The enquiry has no company name; link an existing brand instead.")
        code = name.lower().replace(" ", "_")
        _check_unique(db, name, code)  # A brand with this name already exists → admin links it instead
        brand = Brand(name=name, code=code, contact_person=e.name, contact_number=e.phone, is_active=True)
        db.add(brand)
        db.flush()
        log_admin_action(db=db, admin_user=admin, action="BRAND_CREATED", target_type="BRAND", target_id=str(brand.id),
                         details=f"Brand {brand.name} created from website enquiry #{e.id}")
    e.brand_id, e.status, e.updated_at, e.handled_by_email = brand.id, EnquiryStatus.CONVERTED, datetime.utcnow(), admin.email
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="ENQUIRY_CONVERTED", target_type="ENQUIRY", target_id=str(e.id),
                     details=f"Enquiry #{e.id} converted to customer {brand.name}")
    return _dict(e)
