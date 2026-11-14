"""Redeem Offer rules (see app/models/offer_models.py for the flow).

Everything that matters is decided here on the server: the trusted time is when the server received the
photo, the brand and campaign come from an admin's approval (never from the phone), and automatic checks
only raise flags for the admin; they never approve or reject on their own.
"""
import hashlib
import hmac
import io
import json
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.all_models import Brand
from app.models.campaign_models import Campaign, CampaignStatus, RoutePoint
from app.models.offer_models import (
    CampaignOffer,
    DiscountType,
    OfferGuest,
    OfferSubmission,
    SubmissionStatus,
    Voucher,
    VoucherStatus,
)
from app.services.geo_service import IST, bounding_box, haversine_km

MAX_PHOTO_BYTES = 8 * 1024 * 1024
MIN_PHOTO_SIDE = 480  # px: smaller than this is a thumbnail or screenshot crop, not a camera photo
PER_NUMBER_PER_DAY = 5
PER_ADDRESS_PER_HOUR = 15
SIMILAR_MAX_DISTANCE = 6  # Bits (of 64) two perceptual hashes may differ by and still count as "the same photo"
NEARBY_RADIUS_KM = 0.6  # A rider's route point this close to the photo's location...
NEARBY_BEFORE = timedelta(minutes=30)  # ...recorded up to 30 min before the server received the photo
NEARBY_AFTER = timedelta(minutes=5)
CLOCK_TOLERANCE = timedelta(minutes=20)
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # No 0/O, 1/I/L: easy to read out at a counter


class OfferError(ValueError):
    """A rule was broken; the message is shown to the person."""


# --------------------------------------------------------------------------- small helpers

def phone10(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise OfferError("Please enter a valid 10-digit Indian mobile number.")
    return digits


def mask_phone(phone: str) -> str:
    return f"{phone[:2]}XXXXXX{phone[-2:]}" if phone and len(phone) >= 4 else "XXXXXXXXXX"


def client_key(address: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"offer:{address}".encode(), hashlib.sha256).hexdigest()[:40]


def token_hash(token: str) -> str:
    return hashlib.sha256(f"offer-claim:{token}".encode()).hexdigest()


def new_claim_token() -> str:
    return secrets.token_urlsafe(32)


def _random_code(n: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


def new_public_id(db: Session) -> str:
    for _ in range(20):
        candidate = f"FR-{_random_code(6)}"
        if not db.query(OfferSubmission.id).filter(OfferSubmission.public_id == candidate).first():
            return candidate
    raise OfferError("Please try again.")


def brand_prefix(brand: Brand) -> str:
    raw = re.sub(r"[^A-Z0-9]", "", (brand.code or brand.name or "BR").upper())
    return (raw or "BR")[:4]


def new_voucher_code(db: Session, brand: Brand) -> str:
    prefix = brand_prefix(brand)
    for _ in range(20):
        candidate = f"FR-{prefix}-{_random_code(6)}"
        if not db.query(Voucher.id).filter(Voucher.code == candidate).first():
            return candidate
    raise OfferError("Please try again.")


def normalize_code(raw: str) -> str:
    return re.sub(r"[^A-Z0-9-]", "", (raw or "").upper().strip())


def to_utc_naive(value: Optional[str]) -> Optional[datetime]:
    """The phone's capture time (ISO 8601). Stored for comparison only; never trusted."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def ist_label(moment: datetime) -> str:
    return moment.replace(tzinfo=timezone.utc).astimezone(IST).strftime("%d %b %Y | %I:%M %p").upper()


def discount_label(discount_type: str, value: float) -> str:
    amount = int(value) if float(value).is_integer() else value
    return f"{amount}% off" if discount_type == DiscountType.PERCENT else f"₹{amount} off"


# --------------------------------------------------------------------------- photo

def read_photo(content: bytes) -> Image.Image:
    """Decodes the camera photo (JPEG only: the app always sends one) and checks it is a real photo."""
    if not content or len(content) > MAX_PHOTO_BYTES:
        raise OfferError("The photo must be 8 MB or smaller. Please take it again.")
    if content[:3] != b"\xff\xd8\xff":
        raise OfferError("Please take the photo with the FlexRiders camera.")
    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise OfferError("This photo couldn't be read. Please take it again.")
    image = ImageOps.exif_transpose(image).convert("RGB")
    if min(image.size) < MIN_PHOTO_SIDE:
        raise OfferError("The photo is too small. Please take it again with the camera.")
    return image


def perceptual_hash(image: Image.Image) -> str:
    """64-bit difference hash: survives re-compression, resizing, small crops and screenshots of the same
    photo, unlike SHA-256 which only matches byte-identical files."""
    small = image.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(small.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
    return f"{bits:016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def _font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def stamp(image: Image.Image, received_at: datetime, public_id: str) -> bytes:
    """A copy with the server's date/time and the request ID burned in (the phone can't fake it)."""
    copy = image.copy()
    copy.thumbnail((1600, 1600))
    w, h = copy.size
    band = max(64, h // 9)
    draw = ImageDraw.Draw(copy, "RGBA")
    draw.rectangle([0, h - band, w, h], fill=(16, 42, 86, 210))
    big, small = _font(max(16, band // 3)), _font(max(12, band // 4))
    pad = band // 6
    draw.text((pad, h - band + pad), "FLEXRIDERS VERIFIED CAPTURE", font=big, fill=(255, 255, 255, 255))
    draw.text((pad, h - band + pad + band // 2.6), f"{ist_label(received_at)} IST  |  ID: {public_id}", font=small, fill=(220, 230, 255, 255))
    out = io.BytesIO()
    copy.save(out, "JPEG", quality=85)
    return out.getvalue()


# --------------------------------------------------------------------------- offers

def offer_is_open(offer: CampaignOffer, campaign: Campaign, today: date, issued: int) -> bool:
    if not offer.enabled or campaign.status not in CampaignStatus.PUBLISHED:
        return False
    start = offer.start_date or campaign.start_date
    end = offer.end_date or campaign.end_date
    if (start and today < start) or (end and today > end):
        return False
    return offer.max_vouchers is None or issued < offer.max_vouchers


def issued_count(db: Session, offer_id: int) -> int:
    return db.query(func.count(Voucher.id)).filter(Voucher.offer_id == offer_id, Voucher.status != VoucherStatus.CANCELLED).scalar() or 0


def open_offers(db: Session) -> List[Tuple[CampaignOffer, Campaign, Brand]]:
    today = datetime.now(IST).date()
    rows = (
        db.query(CampaignOffer, Campaign, Brand)
        .join(Campaign, Campaign.id == CampaignOffer.campaign_id)
        .join(Brand, Brand.id == Campaign.brand_id)
        .filter(CampaignOffer.enabled.is_(True), Campaign.status.in_(CampaignStatus.PUBLISHED))
        .all()
    )
    return [(o, c, b) for o, c, b in rows if offer_is_open(o, c, today, issued_count(db, o.id))]


def public_offer(offer: CampaignOffer, campaign: Campaign, brand: Brand) -> Dict:
    return {
        "id": offer.id,
        "brand_name": brand.name,
        "brand_logo": brand.logo if brand.public_assets_approved else None,
        "title": offer.title,
        "discount": discount_label(offer.discount_type, offer.discount_value),
        "description": offer.description,
        "area": campaign.location_area,
        "ends_on": (offer.end_date or campaign.end_date).isoformat() if (offer.end_date or campaign.end_date) else None,
    }


# --------------------------------------------------------------------------- automatic checks

def nearby_riders(db: Session, lat: float, lng: float, around: datetime) -> List[Dict]:
    """Riders whose recorded route passed within NEARBY_RADIUS_KM of the photo around the time it arrived,
    nearest first. Riders on a campaign with an open offer come first."""
    min_lat, max_lat, min_lng, max_lng = bounding_box(lat, lng, NEARBY_RADIUS_KM)
    points = (
        db.query(RoutePoint)
        .filter(
            RoutePoint.recorded_at >= around - NEARBY_BEFORE,
            RoutePoint.recorded_at <= around + NEARBY_AFTER,
            RoutePoint.latitude.between(min_lat, max_lat),
            RoutePoint.longitude.between(min_lng, max_lng),
        )
        .all()
    )
    best: Dict[Tuple[int, int], float] = {}
    for p in points:
        km = haversine_km((lat, lng), (p.latitude, p.longitude))
        if km <= NEARBY_RADIUS_KM:
            key = (p.rider_id, p.campaign_id)
            best[key] = min(km, best.get(key, km))
    if not best:
        return []
    with_offer = {
        cid for (cid,) in db.query(CampaignOffer.campaign_id).filter(
            CampaignOffer.enabled.is_(True), CampaignOffer.campaign_id.in_({c for _, c in best})
        )
    }
    found = [
        {"rider_id": r, "campaign_id": c, "distance_m": round(km * 1000), "offer_enabled": c in with_offer}
        for (r, c), km in best.items()
    ]
    return sorted(found, key=lambda x: (not x["offer_enabled"], x["distance_m"]))


def find_duplicate(db: Session, sha: str, dhash: str, exclude_id: Optional[int] = None) -> Tuple[Optional[OfferSubmission], Optional[str]]:
    query = db.query(OfferSubmission)
    if exclude_id:
        query = query.filter(OfferSubmission.id != exclude_id)
    exact = query.filter(OfferSubmission.photo_sha256 == sha).order_by(OfferSubmission.id).first()
    if exact:
        return exact, "DUPLICATE_EXACT"
    # Compare perceptual hashes in Python (cheap: 16 hex chars per row; a few thousand rows a month).
    rows = query.with_entities(OfferSubmission.id, OfferSubmission.photo_dhash).filter(OfferSubmission.photo_dhash.isnot(None)).all()
    for row_id, other in rows:
        if hamming(dhash, other) <= SIMILAR_MAX_DISTANCE:
            return db.get(OfferSubmission, row_id), "DUPLICATE_SIMILAR"
    return None, None


def run_checks(db: Session, sub: OfferSubmission) -> None:
    """Fills flags and the suggested rider/campaign. Flags inform the admin; they never decide."""
    flags: List[Dict] = []
    duplicate, kind = find_duplicate(db, sub.photo_sha256, sub.photo_dhash, exclude_id=sub.id)
    if duplicate:
        sub.duplicate_of_id = duplicate.id
        text = "Same photo as" if kind == "DUPLICATE_EXACT" else "Looks very similar to"
        flags.append({"code": kind, "text": f"{text} request {duplicate.public_id}."})
    if sub.latitude is None or sub.longitude is None:
        flags.append({"code": "NO_LOCATION", "text": "No location was shared, so riders nearby couldn't be checked."})
    else:
        matches = nearby_riders(db, sub.latitude, sub.longitude, sub.received_at)
        if matches:
            top = matches[0]
            sub.suggested_rider_id, sub.suggested_campaign_id, sub.suggested_distance_m = top["rider_id"], top["campaign_id"], top["distance_m"]
        else:
            flags.append({"code": "NO_RIDER_NEARBY", "text": "No FlexRiders rider's route was recorded near this place at this time."})
    if sub.device_captured_at and abs(sub.device_captured_at - sub.received_at) > CLOCK_TOLERANCE:
        flags.append({"code": "CLOCK_MISMATCH", "text": "The phone's clock differs from the server's by more than 20 minutes."})
    recent = (
        db.query(func.count(OfferSubmission.id))
        .filter(OfferSubmission.guest_id == sub.guest_id, OfferSubmission.received_at >= sub.received_at - timedelta(days=1))
        .scalar()
    )
    if recent >= 3:
        flags.append({"code": "MANY_REQUESTS", "text": f"{recent} requests from this number in the last 24 hours."})
    sub.flags = json.dumps(flags) if flags else None


def flags_of(sub: OfferSubmission) -> List[Dict]:
    try:
        return json.loads(sub.flags) if sub.flags else []
    except ValueError:
        return []


# --------------------------------------------------------------------------- guest view

def guest_status(sub: OfferSubmission, now: Optional[datetime] = None) -> str:
    """What the guest sees: Submitted, Under Review, Rejected, Voucher Activated, Redeemed or Expired."""
    voucher = sub.voucher
    if voucher:
        return voucher_status(voucher, now)
    return sub.status


def voucher_status(voucher: Voucher, now: Optional[datetime] = None) -> str:
    if voucher.status == VoucherStatus.ACTIVE and voucher.expires_at <= (now or datetime.utcnow()):
        return VoucherStatus.EXPIRED
    return voucher.status


def ensure_guest(db: Session, phone: str, name: str, now: datetime) -> OfferGuest:
    guest = db.query(OfferGuest).filter(OfferGuest.phone == phone).first()
    if guest:
        guest.name, guest.last_seen_at = name, now
    else:
        guest = OfferGuest(phone=phone, name=name, created_at=now, last_seen_at=now)
        db.add(guest)
        db.flush()
    return guest


# --------------------------------------------------------------------------- admin review

NOT_APPROVABLE = (
    CampaignStatus.DRAFT, CampaignStatus.PENDING_APPROVAL, CampaignStatus.CHANGES_REQUIRED,
    CampaignStatus.REJECTED, CampaignStatus.CANCELLED,
)


def approve(db: Session, sub: OfferSubmission, campaign_id: int, rider_id: Optional[int], admin) -> Voucher:
    """Admin approval: the only way a voucher is ever created. Every rule is checked here, and the unique
    index on vouchers.submission_id makes a double click (or two admins at once) create one voucher."""
    from app.models.all_models import Rider

    if sub.status not in SubmissionStatus.OPEN:
        raise OfferError("This request has already been decided.")
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise OfferError("Choose the campaign shown in the photo.")
    offer = db.query(CampaignOffer).filter(CampaignOffer.campaign_id == campaign.id).first()
    if not offer or not offer.enabled:
        raise OfferError("This campaign has no active Redeem Offer. Turn its offer on first, or reject the request.")
    if campaign.status in NOT_APPROVABLE:
        raise OfferError("This campaign was never live, so it can't issue vouchers.")
    seen_on = sub.received_at.replace(tzinfo=timezone.utc).astimezone(IST).date()
    start, end = offer.start_date or campaign.start_date, offer.end_date or campaign.end_date
    if (start and seen_on < start) or (end and seen_on > end):
        raise OfferError("The photo was taken outside this offer's dates.")
    if offer.max_vouchers is not None and issued_count(db, offer.id) >= offer.max_vouchers:
        raise OfferError("This offer has reached its maximum number of vouchers.")
    mine = (
        db.query(Voucher)
        .filter(Voucher.guest_id == sub.guest_id, Voucher.campaign_id == campaign.id, Voucher.status != VoucherStatus.CANCELLED)
        .order_by(Voucher.issued_at.desc())
        .all()
    )
    if len(mine) >= offer.max_per_customer:
        raise OfferError(f"This mobile number already has {len(mine)} voucher(s) for this campaign (limit {offer.max_per_customer}).")
    now = datetime.utcnow()
    if mine and offer.cooldown_days and mine[0].issued_at > now - timedelta(days=offer.cooldown_days):
        raise OfferError(f"This mobile number got a voucher for this campaign less than {offer.cooldown_days} day(s) ago.")
    if rider_id is not None and not db.get(Rider, rider_id):
        raise OfferError("That rider doesn't exist.")

    brand = db.get(Brand, campaign.brand_id)
    voucher = Voucher(
        code=new_voucher_code(db, brand), submission_id=sub.id, guest_id=sub.guest_id, brand_id=brand.id,
        campaign_id=campaign.id, offer_id=offer.id, title=offer.title, discount_type=offer.discount_type,
        discount_value=offer.discount_value, status=VoucherStatus.ACTIVE, issued_at=now,
        expires_at=now + timedelta(days=offer.validity_days), approved_by_id=admin.id, created_at=now, updated_at=now,
    )
    sub.status, sub.campaign_id, sub.rider_id = SubmissionStatus.APPROVED, campaign.id, rider_id
    sub.reviewed_by_id, sub.reviewed_at, sub.reject_reason = admin.id, now, None
    db.add(voucher)
    db.flush()
    return voucher


def reject(db: Session, sub: OfferSubmission, reason: str, admin) -> None:
    reason = " ".join((reason or "").split())
    if len(reason) < 3:
        raise OfferError("Tell the customer why (for example: the brand isn't visible in the photo).")
    if sub.status not in SubmissionStatus.OPEN:
        raise OfferError("This request has already been decided.")
    sub.status, sub.reject_reason = SubmissionStatus.REJECTED, reason[:300]
    sub.reviewed_by_id, sub.reviewed_at = admin.id, datetime.utcnow()
