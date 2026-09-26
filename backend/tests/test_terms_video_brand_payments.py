"""Platform Terms & Privacy acceptance, campaign video, and brand payment history (mode, cancel, overdue)."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.models.all_models import Payment, PlatformConsent, User
from app.services import storage_service as storage
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE
from tests.test_crud import make_admin

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _body(**extra):
    return {"accept_terms": True, "full_name": "Terms Rider", "mobile_number": _phone(), "password": "riderPass1",
            "vehicle_category": "CYCLE", "selfie": SELFIE, **extra}


def _rider(client, admin, approve=True, **extra):
    body = _body(**extra)
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 200, res.text
    headers = {"Authorization": "Bearer " + res.json()["access_token"]}
    me = client.get(f"{API}/riders/me", headers=headers).json()
    if approve:
        client.patch(f"{API}/admin/riders/{me['id']}/approve", headers=admin)
    return headers, me


def _campaign(client, admin, **extra):
    brand = client.post(f"{API}/brands", json={"name": f"Pay {uuid.uuid4().hex[:6]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=3)
    body = {"name": "Money test", "brand_id": brand["id"], "start_date": start.isoformat(), "end_date": (start + timedelta(days=9)).isoformat(),
            "total_slots": 2, "daily_rate": 50, "visibility": "PUBLIC", **extra}
    res = client.post(f"{API}/campaigns", json=body, headers=admin)
    assert res.status_code == 200, res.text
    return res.json()


# --------------------------------------------------------------------------- Terms & Privacy

def test_registration_needs_terms_and_keeps_every_acceptance(client, db_session, admin, monkeypatch):
    refused = _body(accept_terms=False)
    res = client.post(f"{API}/auth/register", json=refused)
    assert res.status_code == 422 and "Terms" in res.json()["detail"]
    no_field = _body()
    no_field.pop("accept_terms")
    assert client.post(f"{API}/auth/register", json=no_field).status_code == 422
    assert db_session.query(User).filter(User.phone.in_([refused["mobile_number"], no_field["mobile_number"]])).count() == 0

    headers, me = _rider(client, admin, approve=False)
    status = client.get(f"{API}/auth/consent", headers=headers).json()
    assert status["required"] is False and status["accepted"]["source"] == "REGISTRATION"
    assert status["accepted"]["terms_version"] == settings.PLATFORM_TERMS_VERSION

    # A new Terms version: the rider is asked again; the earlier acceptance is kept.
    monkeypatch.setattr(settings, "PLATFORM_TERMS_VERSION", "2099-01-01")
    assert client.get(f"{API}/auth/consent", headers=headers).json()["required"] is True
    assert client.post(f"{API}/auth/consent", json={"accept_terms": False}, headers=headers).status_code == 422
    after = client.post(f"{API}/auth/consent", json={"accept_terms": True}, headers=headers).json()
    assert after["required"] is False and after["accepted"]["source"] == "APP"
    client.post(f"{API}/auth/consent", json={"accept_terms": True}, headers=headers)  # Accepting twice adds nothing
    history = client.get(f"{API}/admin/riders/{me['id']}/consents", headers=admin).json()
    assert [a["terms_version"] for a in history["acceptances"]] == ["2099-01-01", "2026-09-26"] and history["is_current"]
    assert client.get(f"{API}/admin/riders/{me['id']}/consents", headers=headers).status_code == 403
    assert client.get(f"{API}/auth/consent").status_code == 401
    user_id = db_session.query(User.id).filter(User.phone == me["mobile_number"]).scalar()
    assert db_session.query(PlatformConsent).filter(PlatformConsent.user_id == user_id).count() == 2


def test_selfie_is_required_by_default(client):
    assert settings.REQUIRE_DRIVER_SELFIE is True
    body = _body()
    body.pop("selfie")
    assert client.post(f"{API}/auth/register", json=body).status_code == 422
    assert client.get(f"{API}/public/app-config").json()["selfie_required"] is True


# --------------------------------------------------------------------------- Brand payments

def test_brand_payment_history_totals_and_status(client, db_session, admin):
    c = _campaign(client, admin, brand_contract_value=50000)
    url = f"{API}/campaigns/{c['id']}/brand-payments"
    day = today_ist()
    first = client.get(url, headers=admin).json()
    assert first["summary"]["payment_status"] == "PENDING" and first["summary"]["outstanding"] == 50000
    assert {m["value"] for m in first["modes"]} == {"UPI", "BANK_TRANSFER", "IMPS", "RTGS", "CHEQUE", "CASH", "OTHER"}

    assert client.post(url, json={"kind": "RECEIVED", "amount": 20000, "record_date": day.isoformat()}, headers=admin).status_code == 422  # Mode needed
    assert client.post(url, json={"kind": "RECEIVED", "amount": 1, "payment_mode": "BITCOIN", "record_date": day.isoformat()}, headers=admin).status_code == 422
    client.post(url, json={"kind": "RECEIVED", "amount": 20000, "payment_mode": "UPI", "record_date": day.isoformat(), "reference": "UTR-1"}, headers=admin)
    data = client.post(url, json={"kind": "RECEIVED", "amount": 15000, "payment_mode": "Bank Transfer / NEFT", "record_date": day.isoformat()}, headers=admin).json()
    s = data["summary"]
    assert (s["received"], s["outstanding"], s["payment_status"]) == (35000, 15000, "PARTIALLY_PAID")
    assert [r["payment_mode"] for r in data["records"]] == ["BANK_TRANSFER", "UPI"] and data["records"][0]["created_by"]

    # A wrong entry is cancelled, not deleted or edited: it stays in the history and stops counting.
    wrong = data["records"][0]["id"]
    assert client.post(f"{url}/{wrong}/cancel", json={"reason": ""}, headers=admin).status_code == 422
    data = client.post(f"{url}/{wrong}/cancel", json={"reason": "Entered twice"}, headers=admin).json()
    assert data["summary"]["received"] == 20000 and data["summary"]["outstanding"] == 30000
    cancelled = next(r for r in data["records"] if r["id"] == wrong)
    assert cancelled["status"] == "CANCELLED" and cancelled["cancel_reason"] == "Entered twice" and cancelled["cancelled_by"]
    assert client.post(f"{url}/{wrong}/cancel", json={"reason": "Again"}, headers=admin).status_code == 400

    # Past the due date with a balance → Overdue; paid in full → Paid.
    edit = {k: c[k] for k in ("name", "brand_id", "start_date", "end_date", "total_slots", "daily_rate")}
    assert client.put(f"{API}/campaigns/{c['id']}", json={**edit, "brand_contract_value": 50000,
                                                          "brand_payment_due_date": (day - timedelta(days=1)).isoformat()}, headers=admin).status_code == 200
    assert client.get(url, headers=admin).json()["summary"]["payment_status"] == "OVERDUE"
    data = client.post(url, json={"kind": "RECEIVED", "amount": 30000, "payment_mode": "CHEQUE", "record_date": day.isoformat()}, headers=admin).json()
    assert data["summary"]["payment_status"] == "PAID" and data["summary"]["outstanding"] == 0 and len(data["records"]) == 3

    # The brand profile shows the same numbers; rider payouts are untouched.
    brand = client.get(f"{API}/brands/{c['brand_id']}/dashboard", headers=admin)
    if brand.status_code == 200:
        totals = brand.json()["totals"]
        assert totals["contract_value"] == 50000 and totals["received"] == 50000 and totals["outstanding"] == 0
    assert db_session.query(Payment).filter(Payment.campaign_id == c["id"]).count() == 0

    logs = client.get(f"{API}/audit-logs", headers=admin).json()
    logs = logs if isinstance(logs, list) else logs.get("items", logs.get("logs", []))
    assert "BRAND_PAYMENT_CANCELLED" in {r["action"] for r in logs}


def test_riders_never_see_brand_money(client, db_session, admin):
    c = _campaign(client, admin, brand_contract_value=90000)
    headers, _ = _rider(client, admin)
    assert client.get(f"{API}/campaigns/{c['id']}/brand-payments", headers=headers).status_code == 403
    card = client.get(f"{API}/riders/me/campaigns/{c['id']}", headers=headers).json()
    assert "brand_contract_value" not in card and "brand_payment_due_date" not in card
    listing = client.get(f"{API}/riders/me/campaigns", headers=headers).json()
    assert all("brand_contract_value" not in x for x in listing["available"])


# --------------------------------------------------------------------------- Campaign video

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64


def test_campaign_video_link_upload_and_rider_access(client, db_session, admin):
    c = _campaign(client, admin, eligible_vehicle_categories=["CYCLE"])
    base = f"{API}/campaigns/{c['id']}/video"
    assert client.put(f"{base}/link", json={"video_url": "http://youtube.com/x"}, headers=admin).status_code == 422
    assert client.put(f"{base}/link", json={"video_url": "javascript:alert(1)"}, headers=admin).status_code == 422
    set_link = client.put(f"{base}/link", json={"video_url": "https://www.youtube.com/watch?v=abc123"}, headers=admin).json()
    assert set_link["video"] == {"kind": "LINK", "link": "https://www.youtube.com/watch?v=abc123"}

    rider, _ = _rider(client, admin)
    assert client.get(f"{API}/riders/me/campaigns/{c['id']}/video", headers=rider).json()["url"].startswith("https://www.youtube.com/")
    # Riders who can't see the campaign (pending approval, other vehicle) can't get its video either.
    pending, _ = _rider(client, admin, approve=False)
    assert client.get(f"{API}/riders/me/campaigns/{c['id']}/video", headers=pending).status_code == 404
    auto, _ = _rider(client, admin, vehicle_category="AUTO", vehicle_number="HR26AB1234")
    assert client.get(f"{API}/riders/me/campaigns/{c['id']}/video", headers=auto).status_code == 404
    assert client.put(f"{base}/link", json={"video_url": "https://x.example/v.mp4"}, headers=rider).status_code == 403

    # Upload (local development goes through the API; type and size are checked).
    assert client.post(f"{base}/upload-url", json={"content_type": "video/mp4", "size": 1000}, headers=admin).json()["mode"] == "API"
    assert client.post(f"{base}/upload-url", json={"content_type": "video/avi", "size": 1000}, headers=admin).status_code == 400
    assert client.post(f"{base}/upload-url", json={"content_type": "video/mp4", "size": 60 * 1024 * 1024}, headers=admin).status_code == 400
    assert client.post(f"{base}/file", files={"video": ("a.exe", b"MZ", "application/octet-stream")}, headers=admin).status_code == 400
    up = client.post(f"{base}/file", files={"video": ("promo.mp4", MP4, "video/mp4")}, headers=admin).json()
    assert up["video"] == {"kind": "UPLOAD", "link": None}
    played = client.get(base, headers=admin).json()
    assert played["kind"] == "UPLOAD" and played["url"].startswith("/uploads/campaign-videos/")
    assert client.get(f"{API}/riders/me/campaigns/{c['id']}/video", headers=rider).json()["kind"] == "UPLOAD"

    # Confirm only accepts a real, uploaded campaign-video path.
    for bad in ("/uploads/selfies/" + "a" * 32 + ".mp4", "/uploads/campaign-videos/../x.mp4", "/uploads/campaign-videos/" + "b" * 32 + ".mp4"):
        assert client.post(f"{base}/confirm", json={"path": bad}, headers=admin).status_code == 400

    assert client.delete(base, headers=admin).json()["video"] is None
    assert client.get(f"{API}/riders/me/campaigns/{c['id']}/video", headers=rider).status_code == 404


def test_hosted_video_upload_goes_straight_to_private_storage(client, db_session, admin, monkeypatch):
    c = _campaign(client, admin)
    stored = set()
    monkeypatch.setattr(storage, "remote", lambda: True)
    monkeypatch.setattr(storage, "signed_upload_url", lambda path: f"https://storage.example/upload/{path}?token=t")
    monkeypatch.setattr(storage, "exists", lambda url: url in stored)
    monkeypatch.setattr(storage, "signed_url", lambda path, expires_in=3600: f"https://storage.example/sign/{path}?token=s")
    monkeypatch.setattr(storage, "delete", lambda url: stored.discard(url))
    base = f"{API}/campaigns/{c['id']}/video"
    ticket = client.post(f"{base}/upload-url", json={"content_type": "video/mp4", "size": 5_000_000}, headers=admin).json()
    assert ticket["mode"] == "DIRECT" and ticket["path"].startswith("/uploads/campaign-videos/") and ticket["path"].endswith(".mp4")
    assert client.post(f"{base}/confirm", json={"path": ticket["path"]}, headers=admin).status_code == 400  # Not uploaded yet
    stored.add(ticket["path"])
    assert client.post(f"{base}/confirm", json={"path": ticket["path"]}, headers=admin).json()["video"]["kind"] == "UPLOAD"
    played = client.get(base, headers=admin).json()
    assert played["url"].startswith("https://storage.example/sign/campaign-videos/") and played["expires_in"] == 3600
    assert client.post(f"{base}/file", files={"video": ("p.mp4", MP4, "video/mp4")}, headers=admin).status_code == 400
    # Never served by the public /uploads route when hosted.
    assert storage.is_private(ticket["path"]) and storage.is_private("/uploads/selfies/x.jpg")
    assert not storage.is_private("/uploads/campaigns/x.jpg")
    # Replacing the upload with a link removes the old file.
    client.put(f"{base}/link", json={"video_url": "https://drive.google.com/file/d/abc/view"}, headers=admin)
    assert ticket["path"] not in stored


def test_partial_campaign_edit_keeps_other_fields(client, db_session, admin):
    """The admin's banner toggle sends only a few fields; nothing else may be reset."""
    c = _campaign(client, admin, description="Keep me", rules="Wear the T-shirt", brand_contract_value=12000,
                  eligible_vehicle_categories=["AUTO"], location_area="Sector 57")
    fields = {k: c[k] for k in ("name", "brand_id", "start_date", "end_date", "total_slots", "daily_rate")}
    after = client.put(f"{API}/campaigns/{c['id']}", json={**fields, "public_image_approved": True}, headers=admin).json()
    assert after["public_image_approved"] is True
    assert (after["description"], after["rules_text"], after["brand_contract_value"]) == ("Keep me", "Wear the T-shirt", 12000)
    assert after["eligible_vehicle_categories"] == ["AUTO"] and after["location_area"] == "Sector 57"
