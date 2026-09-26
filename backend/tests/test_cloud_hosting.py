"""Hosted mode: photos in the private Supabase Storage bucket and reminders via the cron endpoint."""
import uuid
from datetime import datetime, time, timedelta

import httpx
import pytest

from app.core.config import settings
from app.models.all_models import Notification
from app.services import storage_service
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE, before_start
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


class FakeStorage:
    """Stands in for Supabase Storage's REST API (records what the backend sends)."""

    def __init__(self):
        self.objects = {}

    def handle(self, method, url, **kw):
        base = settings.SUPABASE_URL + "/storage/v1"
        path = url[len(base):]
        if method == "POST" and path.startswith("/object/sign/"):
            key = path[len("/object/sign/uploads/"):]
            if key not in self.objects:
                return httpx.Response(404, json={"error": "not found"})
            return httpx.Response(200, json={"signedURL": f"/object/sign/uploads/{key}?token=t"})
        if method == "POST" and path.startswith("/object/list/"):
            prefix = kw["json"]["prefix"] + "/"
            level = {k[len(prefix):].split("/")[0]: "/" in k[len(prefix):] for k in self.objects if k.startswith(prefix)}
            return httpx.Response(200, json=[{"name": n, "id": None if is_dir else n} for n, is_dir in level.items()])
        if method == "POST" and path.startswith("/object/uploads/"):
            assert kw["headers"]["apikey"] == settings.SUPABASE_SECRET_KEY
            self.objects[path[len("/object/uploads/"):]] = kw["content"]
            return httpx.Response(200, json={"Key": path})
        if method == "DELETE":
            for p in kw["json"]["prefixes"]:
                self.objects.pop(p, None)
            return httpx.Response(200, json=[])
        raise AssertionError(f"unexpected {method} {url}")


@pytest.fixture
def fake_storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "sb_secret_test")
    monkeypatch.setattr(httpx, "post", lambda url, **kw: fake.handle("POST", url, **kw))
    monkeypatch.setattr(httpx, "request", lambda method, url, **kw: fake.handle(method, url, **kw))
    return fake


def test_storage_save_sign_and_delete(fake_storage):
    ref = storage_service.save(b"jpeg-bytes", ".jpg", "campaign-proofs/7/9", "image/jpeg")
    assert ref.startswith("/uploads/campaign-proofs/7/9/") and ref.endswith(".jpg")
    key = ref[len("/uploads/"):]
    assert fake_storage.objects[key] == b"jpeg-bytes"
    assert storage_service.signed_url(key).startswith("https://example.supabase.co/storage/v1/object/sign/uploads/")
    assert storage_service.signed_url("campaign-proofs/missing.jpg") is None
    storage_service.save(b"other", ".jpg", "campaign-proofs/8/1", "image/jpeg")
    storage_service.delete_folder("campaign-proofs")  # Nested folders are emptied too
    assert fake_storage.objects == {}


def test_proof_photo_goes_to_bucket_under_campaign_and_rider(client, db_session, fake_storage):
    admin, _ = make_admin(client, db_session)
    brand = client.post(f"{API}/brands", json={"name": f"Cloud {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist()
    cid = client.post(f"{API}/campaigns", json={"name": "Cloud Campaign", "brand_id": brand["id"], "start_date": start.isoformat(),
                      "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 1, "daily_rate": 10, "visibility": "PUBLIC"}, headers=admin).json()["id"]
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    with before_start(db_session, cid):
        client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=headers)
        app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]["id"]
        client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin)

    res = client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", b"morning-selfie", "image/jpeg")}, data={"slot": "MORNING"}, headers=headers)
    assert res.status_code == 200, res.text
    photo = client.get(f"{API}/campaigns/{cid}/photos", headers=admin).json()[0]
    assert photo["photo_url"].startswith(f"/uploads/campaign-proofs/{cid}/{rider['id']}/") and photo["slot"] == "MORNING"
    assert fake_storage.objects[photo["photo_url"][len("/uploads/"):]] == b"morning-selfie"


def test_cron_endpoint_requires_secret_and_is_idempotent(client, db_session, monkeypatch):
    url = f"{API}/internal/cron/slot-reminders"
    assert client.post(url).status_code == 401  # No secret configured: always refused
    monkeypatch.setattr(settings, "CRON_SECRET", "cron-test-secret")
    assert client.post(url, headers={"X-Cron-Secret": "wrong"}).status_code == 401

    admin, _ = make_admin(client, db_session)
    brand = client.post(f"{API}/brands", json={"name": f"Cron {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist()
    cid = client.post(f"{API}/campaigns", json={"name": "Cron Campaign", "brand_id": brand["id"], "start_date": start.isoformat(),
                      "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 1, "daily_rate": 10, "visibility": "PUBLIC"}, headers=admin).json()["id"]
    body = rider_payload(status="APPROVED")
    client.post(f"{API}/admin/riders", json=body, headers=admin)
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    with before_start(db_session, cid):
        client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers={"Authorization": f"Bearer {token}"})
        app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]["id"]
        client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin)

    # Pretend it's 7:00 AM IST: the morning slot is open.
    from app.services import slot_reminder_service
    seven_am_utc = datetime.combine(today_ist(), time(7, 0)) - timedelta(hours=5, minutes=30)
    real_run_once = slot_reminder_service.run_once
    monkeypatch.setattr(slot_reminder_service, "run_once", lambda db, now_utc=None: real_run_once(db, seven_am_utc))

    first = client.post(url, headers={"X-Cron-Secret": "cron-test-secret"})
    assert first.status_code == 200
    assert first.json()["campaigns_went_live"] >= 1 and first.json()["reminders_sent"] >= 1
    again = client.post(url, headers={"X-Cron-Secret": "cron-test-secret"}).json()
    assert again == {"campaigns_went_live": 0, "reminders_sent": 0}  # Running twice sends nothing new
    db_session.expire_all()
    mine = db_session.query(Notification).filter(Notification.title == "Morning selfie slot is open", Notification.reference_id == str(cid))
    assert mine.count() == 1


def test_otp_login_is_refused_when_disabled(client, monkeypatch):
    """With ENABLE_OTP_LOGIN=false (production), the fixed development code must never log anyone in."""
    monkeypatch.setattr(settings, "ENABLE_OTP_LOGIN", False)
    assert client.post(f"{API}/auth/otp/send", json={"phone": "+919811009999"}).status_code == 403
    for code in (settings.MOCK_OTP_CODE, "000000"):
        assert client.post(f"{API}/auth/otp/verify", json={"phone": "+919811009999", "otp": code}).status_code == 403


def test_hosted_server_refuses_published_default_secret_key():
    """On Vercel, starting with the default (published) SECRET_KEY must fail instead of signing forgeable tokens."""
    import os
    import subprocess
    import sys

    base = {**os.environ, "VERCEL": "1", "DATABASE_URL": "sqlite://", "SUPABASE_URL": "", "SUPABASE_SECRET_KEY": ""}
    code = "import app.core.config"
    bad = subprocess.run([sys.executable, "-c", code], env={**base, "SECRET_KEY": "super-riders-secret-key-production-change-this-in-prod"},
                         capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert bad.returncode != 0 and "SECRET_KEY is not set" in bad.stderr
    good = subprocess.run([sys.executable, "-c", code], env={**base, "SECRET_KEY": "x" * 48},
                          capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert good.returncode == 0, good.stderr


def test_otp_always_off_on_hosted_server(client, monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_OTP_LOGIN", True)
    monkeypatch.setattr(settings, "VERCEL", "1")
    assert client.post(f"{API}/auth/otp/verify", json={"phone": "+919811007777", "otp": settings.MOCK_OTP_CODE}).status_code == 403


def test_login_does_not_reveal_which_numbers_exist(client, db_session):
    make_admin(client, db_session)
    unknown = client.post(f"{API}/auth/login", json={"phone": "+919000009999", "password": "whatever123"})
    body = rider_payload()
    client.post(f"{API}/auth/register", json={"selfie": SELFIE, **body, "vehicle_category": "CYCLE"})
    wrong = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "wrongPass999"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"] == "Incorrect phone number or password"



def test_hosted_cors_allows_only_flexriders_domains(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "VERCEL", "1")
    monkeypatch.setattr(settings, "CORS_ORIGINS", "")
    hosted = settings.cors_origins()
    assert "https://flexriders.in" in hosted and not any("localhost" in o or "127.0.0.1" in o for o in hosted)
    monkeypatch.setattr(settings, "VERCEL", "")
    assert "http://localhost:5180" in settings.cors_origins()  # Local development still works
