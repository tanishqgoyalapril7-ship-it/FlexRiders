"""Redeem Offer, phase 1: offer settings, the guest submission (camera JPEG, name, mobile, no login), the
private claim token, automatic checks (rider nearby, duplicates, clock) and spam limits."""
import io
import json
import random
import uuid
from datetime import datetime, timedelta

import pytest
from PIL import Image

from app.core.config import settings
from app.models.offer_models import OfferSubmission
from tests.test_crud import make_admin
from tests.test_routes import _setup, _walk

API = "/api/v1"
PUB = f"{API}/public/offers"
ADM = f"{API}/admin/offers"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def photo(seed=None, size=(960, 720), fmt="JPEG") -> bytes:
    """A unique 'camera photo': random blocks, so its perceptual hash differs from every other test's."""
    rnd = random.Random(seed if seed is not None else uuid.uuid4().int)
    image = Image.new("RGB", size)
    block = 48
    for x in range(0, size[0], block):
        for y in range(0, size[1], block):
            image.paste((rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)), (x, y, x + block, y + block))
    out = io.BytesIO()
    image.save(out, fmt, quality=90)
    return out.getvalue()


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _ip():
    return f"198.51.{random.randrange(256)}.{random.randrange(256)}"


def submit(client, content=None, token=None, ip=None, **form):
    data = {"name": "Rahul Sharma", "phone": _phone(), "consent": "true", **form}
    headers = {"x-forwarded-for": ip or _ip()}
    if token:
        headers["x-offer-token"] = token
    return client.post(f"{PUB}/submissions", data=data, files={"photo": ("p.jpg", content or photo(), "image/jpeg")}, headers=headers)


def offer_body(**extra):
    return {"enabled": True, "title": "10% off your bill", "description": "Show this code at the counter.",
            "discount_type": "PERCENT", "discount_value": 10, "max_vouchers": 100, "validity_days": 30, **extra}


def test_offer_settings_and_public_list(client, db_session):
    admin, cid, _ = _setup(client, db_session)
    assert client.put(f"{ADM}/campaigns/{cid}", json=offer_body()).status_code == 401  # Admins only
    assert client.put(f"{ADM}/campaigns/{cid}", json=offer_body(discount_value=120), headers=admin).status_code == 422
    saved = client.put(f"{ADM}/campaigns/{cid}", json=offer_body(), headers=admin).json()["offer"]
    assert saved["enabled"] and saved["discount"] == "10% off" and saved["vouchers_issued"] == 0
    assert client.get(f"{ADM}/campaigns/{cid}", headers=admin).json()["offer"]["id"] == saved["id"]

    listed = [o for o in client.get(PUB).json()["offers"] if o["id"] == saved["id"]]
    assert len(listed) == 1 and listed[0]["discount"] == "10% off"
    # Only what a guest needs: no money terms, no campaign internals.
    assert set(listed[0]) == {"id", "brand_name", "brand_logo", "title", "discount", "description", "area", "ends_on"}

    client.put(f"{ADM}/campaigns/{cid}", json=offer_body(enabled=False), headers=admin)
    assert not [o for o in client.get(PUB).json()["offers"] if o["id"] == saved["id"]]  # Switched off: hidden


def test_guest_submission_token_and_rider_match(client, db_session):
    admin, cid, [(rider, rider_headers)] = _setup(client, db_session)
    offer = client.put(f"{ADM}/campaigns/{cid}", json=offer_body(), headers=admin).json()["offer"]
    walk = _walk(28.40, n=5, minutes_ago=10)
    client.post(f"{API}/riders/me/campaigns/{cid}/route-points", json={"points": walk}, headers=rider_headers)

    # The guest stands ~100 m from the rider's last recorded point.
    res = submit(client, latitude=walk[-1]["latitude"] + 0.0008, longitude=walk[-1]["longitude"], accuracy_m=15,
                 offer_id=offer["id"], captured_at=datetime.utcnow().isoformat() + "Z", device_info="Android 14")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["submission_id"].startswith("FR-") and len(body["submission_id"]) == 9
    assert body["status"] == "SUBMITTED" and len(body["claim_token"]) >= 32
    assert body["message"].startswith("Your offer redemption request has been submitted successfully.")

    db_session.expire_all()
    sub = db_session.query(OfferSubmission).filter(OfferSubmission.public_id == body["submission_id"]).one()
    assert sub.suggested_rider_id == rider["id"] and sub.suggested_campaign_id == cid and sub.suggested_distance_m < 600
    assert sub.flags is None  # Location shared, rider nearby, clock fine, first request
    assert sub.claim_token_hash != body["claim_token"]  # Only the hash is stored
    assert sub.campaign_id is None and sub.voucher is None  # Nothing is approved by submitting

    token = body["claim_token"]
    mine = client.get(f"{PUB}/my", headers={"x-offer-token": token}).json()["requests"]
    assert [r["submission_id"] for r in mine] == [body["submission_id"]] and mine[0]["status"] == "SUBMITTED" and mine[0]["voucher"] is None
    # A second request from the same phone keeps the same token, so both show up together.
    again = submit(client, token=token).json()
    assert again["claim_token"] == token
    assert len(client.get(f"{PUB}/my", headers={"x-offer-token": token}).json()["requests"]) == 2

    # Nobody else can read them: no token, someone else's token, or a guessed request ID.
    assert client.get(f"{PUB}/my").status_code == 401
    assert client.get(f"{PUB}/my", headers={"x-offer-token": "x" * 43}).json()["requests"] == []
    own = client.get(f"{PUB}/my/{body['submission_id']}/photo", headers={"x-offer-token": token})
    assert own.status_code == 200 and own.headers["content-type"] == "image/jpeg" and own.content[:3] == b"\xff\xd8\xff"
    assert client.get(f"{PUB}/my/{body['submission_id']}/photo", headers={"x-offer-token": "y" * 43}).status_code == 404
    # The photos are private: never served by the public /uploads route.
    assert sub.photo_path.startswith("/uploads/offer-photos/")
    assert client.get(sub.photo_path).status_code in (403, 404)


def _flags(db_session, public_id):
    db_session.expire_all()
    sub = db_session.query(OfferSubmission).filter(OfferSubmission.public_id == public_id).one()
    return {f["code"] for f in json.loads(sub.flags or "[]")}, sub


def test_automatic_checks_flag_but_never_decide(client, db_session):
    original = photo(seed=4242)
    first = submit(client, content=original, latitude=28.6, longitude=77.2).json()["submission_id"]
    codes, _ = _flags(db_session, first)
    assert codes == {"NO_RIDER_NEARBY"}

    # The exact same file again, from another person.
    exact = submit(client, content=original).json()["submission_id"]
    codes, sub = _flags(db_session, exact)
    assert "DUPLICATE_EXACT" in codes and "NO_LOCATION" in codes and sub.duplicate_of_id is not None
    assert sub.status == "SUBMITTED"  # Flagged for the admin, not rejected

    # A re-saved, resized copy (a screenshot or forward of the photo) is caught by the perceptual hash.
    image = Image.open(io.BytesIO(original)).resize((800, 600))
    out = io.BytesIO()
    image.save(out, "JPEG", quality=60)
    similar = submit(client, content=out.getvalue()).json()["submission_id"]
    codes, _ = _flags(db_session, similar)
    assert "DUPLICATE_SIMILAR" in codes

    # The phone's clock is only compared, never trusted.
    skewed = submit(client, captured_at=(datetime.utcnow() - timedelta(days=2)).isoformat() + "Z").json()["submission_id"]
    codes, sub = _flags(db_session, skewed)
    assert "CLOCK_MISMATCH" in codes and sub.received_at > sub.device_captured_at + timedelta(days=1)


def test_validation_privacy_notice_and_limits(client, db_session):
    assert submit(client, consent="false").status_code == 422
    assert submit(client, name=" ").status_code == 422
    assert submit(client, phone="12345").status_code == 422
    assert submit(client, phone="5123456789").status_code == 422  # Not an Indian mobile number
    assert submit(client, website="spam").status_code == 422  # Honeypot
    png = photo(fmt="PNG")
    res = client.post(f"{PUB}/submissions", data={"name": "A B", "phone": _phone(), "consent": "true"},
                      files={"photo": ("p.png", png, "image/png")})
    assert res.status_code == 422  # Camera JPEG only
    assert submit(client, content=photo(size=(300, 200))).status_code == 422  # Too small to be a camera photo
    assert submit(client, content=b"\xff\xd8\xff" + b"0" * 500).status_code == 422  # Not really an image
    assert submit(client, phone="+91 98765 43210").status_code in (200, 429)  # +91 and spaces accepted

    # Per-number limit: 5 a day.
    number = _phone()
    for _ in range(5):
        assert submit(client, phone=number).status_code == 200
    assert submit(client, phone=number).status_code == 429
    # Per-address limit: 15 an hour.
    ip = _ip()
    codes = [submit(client, ip=ip).status_code for _ in range(16)]
    assert codes[:15] == [200] * 15 and codes[15] == 429


# --------------------------------------------------------------------------- phase 2: admin review

def _db_id(db_session, public_id):
    db_session.expire_all()
    return db_session.query(OfferSubmission).filter(OfferSubmission.public_id == public_id).one().id


def test_admin_review_approve_and_guest_sees_voucher(client, db_session):
    admin, cid, [(rider, rider_headers)] = _setup(client, db_session)
    client.put(f"{ADM}/campaigns/{cid}", json=offer_body(validity_days=15), headers=admin)
    walk = _walk(28.41, n=4, minutes_ago=8)
    client.post(f"{API}/riders/me/campaigns/{cid}/route-points", json={"points": walk}, headers=rider_headers)
    sent = submit(client, latitude=walk[-1]["latitude"], longitude=walk[-1]["longitude"]).json()
    token, sid = sent["claim_token"], _db_id(db_session, sent["submission_id"])

    # Queue: admins only; the new request is open, with the suggested rider and campaign.
    assert client.get(f"{ADM}/submissions").status_code == 401
    queue = client.get(f"{ADM}/submissions", headers=admin).json()
    row = next(r for r in queue["submissions"] if r["id"] == sid)
    assert row["status"] == "SUBMITTED" and row["suggested"]["rider"]["id"] == rider["id"] and row["suggested"]["campaign"]["id"] == cid
    assert len(row["mobile"]) == 10 and queue["counts"]["open"] >= 1

    # Opening it marks it Under Review for the guest, and lists the campaigns it can be approved against.
    detail = client.get(f"{ADM}/submissions/{sid}", headers=admin).json()
    assert detail["status"] == "UNDER_REVIEW" and any(c["id"] == cid for c in detail["campaign_choices"])
    assert detail["nearby_riders"][0]["rider"]["id"] == rider["id"]
    assert client.get(f"{PUB}/my", headers={"x-offer-token": token}).json()["requests"][0]["status"] == "UNDER_REVIEW"
    pic = client.get(f"{ADM}/submissions/{sid}/photo", headers=admin)
    assert pic.status_code == 200 and pic.content[:3] == b"\xff\xd8\xff"
    assert client.get(f"{ADM}/submissions/{sid}/photo", headers=rider_headers).status_code == 403  # Riders can't

    approved = client.post(f"{ADM}/submissions/{sid}/approve", json={"campaign_id": cid, "rider_id": rider["id"]}, headers=admin)
    assert approved.status_code == 200, approved.text
    voucher = approved.json()["voucher"]
    assert voucher["status"] == "ACTIVE" and voucher["code"].startswith("FR-")
    # Deciding twice is refused (double click, or two admins at once).
    assert client.post(f"{ADM}/submissions/{sid}/approve", json={"campaign_id": cid}, headers=admin).status_code == 400
    assert client.post(f"{ADM}/submissions/{sid}/reject", json={"reason": "Changed my mind"}, headers=admin).status_code == 400

    mine = client.get(f"{PUB}/my", headers={"x-offer-token": token}).json()["requests"][0]
    assert mine["status"] == "ACTIVE" and mine["voucher"]["code"] == voucher["code"] and mine["voucher"]["discount"] == "10% off"
    expires = datetime.fromisoformat(mine["voucher"]["expires_at"].rstrip("Z"))
    assert timedelta(days=14) < expires - datetime.utcnow() <= timedelta(days=15)
    # The audit log records who approved it.
    logs = client.get(f"{API}/audit-logs?limit=50", headers=admin).json()
    entries = logs if isinstance(logs, list) else logs.get("logs", logs.get("items", []))
    assert any(e.get("action") == "OFFER_APPROVED" for e in entries)


def test_admin_reject_flag_and_approval_rules(client, db_session):
    admin, cid, _ = _setup(client, db_session)
    # Rejection needs a reason, which the guest sees.
    sent = submit(client).json()
    sid = _db_id(db_session, sent["submission_id"])
    assert client.post(f"{ADM}/submissions/{sid}/reject", json={"reason": ""}, headers=admin).status_code == 400
    assert client.post(f"{ADM}/submissions/{sid}/reject", json={"reason": "The brand isn't visible in the photo."}, headers=admin).status_code == 200
    mine = client.get(f"{PUB}/my", headers={"x-offer-token": sent["claim_token"]}).json()["requests"][0]
    assert mine["status"] == "REJECTED" and mine["reject_reason"] == "The brand isn't visible in the photo." and mine["voucher"] is None

    # Flag as suspicious (and back), shown in the flagged filter.
    other = _db_id(db_session, submit(client).json()["submission_id"])
    assert client.post(f"{ADM}/submissions/{other}/flag", json={"suspicious": True, "note": "Same face as yesterday"}, headers=admin).json()["flagged_suspicious"]
    assert any(r["id"] == other for r in client.get(f"{ADM}/submissions?flagged=true", headers=admin).json()["submissions"])

    # A campaign without an offer (or with it switched off) can't issue vouchers.
    assert client.post(f"{ADM}/submissions/{other}/approve", json={"campaign_id": cid}, headers=admin).status_code == 400
    client.put(f"{ADM}/campaigns/{cid}", json=offer_body(enabled=False), headers=admin)
    assert client.post(f"{ADM}/submissions/{other}/approve", json={"campaign_id": cid}, headers=admin).status_code == 400

    # One voucher per mobile number per campaign (configurable); a second number is fine.
    client.put(f"{ADM}/campaigns/{cid}", json=offer_body(max_vouchers=2, max_per_customer=1), headers=admin)
    number = _phone()
    first = _db_id(db_session, submit(client, phone=number).json()["submission_id"])
    second = _db_id(db_session, submit(client, phone=number).json()["submission_id"])
    assert client.post(f"{ADM}/submissions/{first}/approve", json={"campaign_id": cid}, headers=admin).status_code == 200
    res = client.post(f"{ADM}/submissions/{second}/approve", json={"campaign_id": cid}, headers=admin)
    assert res.status_code == 400 and "already has 1 voucher" in res.json()["detail"]
    assert client.post(f"{ADM}/submissions/{other}/approve", json={"campaign_id": cid}, headers=admin).status_code == 200
    # The offer's cap (2) is now reached, so it also disappears from the public list.
    third = _db_id(db_session, submit(client).json()["submission_id"])
    res = client.post(f"{ADM}/submissions/{third}/approve", json={"campaign_id": cid}, headers=admin)
    assert res.status_code == 400 and "maximum number" in res.json()["detail"]
    offer_id = client.get(f"{ADM}/campaigns/{cid}", headers=admin).json()["offer"]["id"]
    assert not [o for o in client.get(PUB).json()["offers"] if o["id"] == offer_id]


def test_campaign_with_vouchers_cannot_be_deleted(client, db_session):
    from app.models.campaign_models import Campaign
    from app.services.data_admin_service import campaign_impact

    admin, cid, _ = _setup(client, db_session)
    client.put(f"{ADM}/campaigns/{cid}", json=offer_body(), headers=admin)
    sid = _db_id(db_session, submit(client).json()["submission_id"])
    client.post(f"{ADM}/submissions/{sid}/approve", json={"campaign_id": cid}, headers=admin)
    db_session.expire_all()
    impact = campaign_impact(db_session, db_session.get(Campaign, cid))
    assert impact["counts"]["vouchers"] == 1 and "vouchers" in impact["blocked_by"]
