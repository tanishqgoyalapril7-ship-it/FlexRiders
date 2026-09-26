"""Mandatory driver selfie at registration (private storage, admin-only viewing) and registration security."""
import base64
import os
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import UserRole, get_password_hash
from app.models.all_models import Rider, User
from app.services import storage_service
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE, SELFIE_BYTES
from tests.test_crud import make_admin

API = "/api/v1"
NUMBERS = {"TWO_WHEELER": "HR26DK", "AUTO": "DL1RA", "THREE_WHEELER": "MH12LD"}


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _body(category="CYCLE", **extra):
    phone = _phone()
    body = {"full_name": "Selfie Rider", "mobile_number": phone, "password": "riderPass1", "vehicle_category": category, "selfie": SELFIE}
    if category in NUMBERS:
        body["vehicle_number"] = NUMBERS[category] + phone[-4:]
    body.update(extra)
    return {k: v for k, v in body.items() if v is not None}


def _rider(db_session, phone):
    db_session.expire_all()
    return db_session.query(Rider).filter(Rider.mobile_number == phone).first()


# --------------------------------------------------------------------------- selfie is required

@pytest.mark.parametrize("category", ["CYCLE", "TWO_WHEELER", "AUTO", "THREE_WHEELER"])
def test_each_vehicle_type_registers_with_selfie(client, db_session, uploads_dir, category):
    body = _body(category)
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 200, res.text
    rider = _rider(db_session, body["mobile_number"])
    assert rider.profile_photo.startswith("/uploads/selfies/")
    stored = uploads_dir / rider.profile_photo[len("/uploads/"):]
    assert stored.read_bytes() == SELFIE_BYTES  # Stored exactly, and linked to this rider


@pytest.mark.parametrize(
    "selfie",
    [
        None,  # Missing
        "",  # Empty
        "not base64 at all!!",  # Unreadable
        base64.b64encode(b"\xff\xd8\xff" + b"x" * 10).decode(),  # Too small to be a photo
        base64.b64encode(b"%PDF-1.7 " * 200).decode(),  # Not an image
        "/uploads/selfies/someone-elses.jpg",  # A path/reference instead of a photo
    ],
)
def test_registration_without_a_valid_selfie_is_refused(client, db_session, monkeypatch, selfie):
    monkeypatch.setattr(settings, "REQUIRE_DRIVER_SELFIE", True)  # The production rule
    body = _body(selfie=selfie)
    if selfie is None:
        body.pop("selfie", None)
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 422, res.text
    assert "access_token" not in res.json()
    assert _rider(db_session, body["mobile_number"]) is None


def test_data_url_and_png_selfies_are_accepted(client, db_session):
    png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"p" * 2000).decode()
    for selfie in ("data:image/jpeg;base64," + SELFIE, png):
        body = _body(selfie=selfie)
        assert client.post(f"{API}/auth/register", json=body).status_code == 200
    assert _rider(db_session, body["mobile_number"]).profile_photo.endswith(".png")


def test_storage_failure_means_no_account(client, db_session, monkeypatch):
    def broken(*args, **kwargs):
        raise storage_service.StorageError("down")

    monkeypatch.setattr(storage_service, "save", broken)
    body = _body()
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 503 and "try again" in res.json()["detail"]
    db_session.expire_all()
    assert db_session.query(User).filter(User.phone == body["mobile_number"]).first() is None
    assert _rider(db_session, body["mobile_number"]) is None
    # Retrying once storage works succeeds.
    monkeypatch.undo()
    monkeypatch.setattr(settings, "UPLOAD_DIR", settings.UPLOAD_DIR)
    assert client.post(f"{API}/auth/register", json=body).status_code == 200


# --------------------------------------------------------------------------- privacy

def test_selfie_is_admin_only_and_never_public(client, db_session, admin):
    body = _body("AUTO")
    token = client.post(f"{API}/auth/register", json=body).json()["access_token"]
    rider_headers = {"Authorization": f"Bearer {token}"}
    rider = _rider(db_session, body["mobile_number"])

    # Admin sees it (not cached).
    res = client.get(f"{API}/admin/riders/{rider.id}/selfie", headers=admin)
    assert res.status_code == 200 and res.content == SELFIE_BYTES
    assert res.headers["content-type"] == "image/jpeg" and "no-store" in res.headers["cache-control"]
    # Riders and anonymous users can't.
    assert client.get(f"{API}/admin/riders/{rider.id}/selfie", headers=rider_headers).status_code == 403
    assert client.get(f"{API}/admin/riders/{rider.id}/selfie").status_code == 401
    # The file route never serves selfies, even with the exact path.
    assert client.get(rider.profile_photo).status_code == 404
    assert storage_service.is_private(rider.profile_photo) and not storage_service.is_private("/uploads/campaign-proofs/1/x.jpg")

    # The public campaign page never carries rider data, selfies included.
    brand = client.post(f"{API}/brands", json={"name": f"Pub {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=3)
    c = client.post(f"{API}/campaigns", json={"name": "Public Auto", "brand_id": brand["id"], "start_date": start.isoformat(),
                                              "end_date": (start + timedelta(days=3)).isoformat(), "total_slots": 2, "daily_rate": 10,
                                              "visibility": "PUBLIC"}, headers=admin).json()
    client.patch(f"{API}/admin/riders/{rider.id}/approve", headers=admin)
    client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=rider_headers)
    slug = client.post(f"{API}/campaigns/{c['id']}/share", json={"enabled": True}, headers=admin).json()["slug"]
    page = client.get(f"{API}/public/campaigns/{slug}")
    assert page.status_code == 200 and "selfies" not in page.text and rider.profile_photo not in page.text


def test_selfie_survives_profile_updates_and_cannot_be_replaced_by_the_rider(client, db_session, admin):
    body = _body()
    token = client.post(f"{API}/auth/register", json=body).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    original = _rider(db_session, body["mobile_number"]).profile_photo

    assert client.patch(f"{API}/riders/me", json={"primary_area": "Sector 29", "upi_id": "me@upi"}, headers=headers).status_code == 200
    client.patch(f"{API}/riders/me", json={"profile_photo": "/uploads/campaigns/other.jpg"}, headers=headers)  # Ignored
    client.patch(f"{API}/riders/me", json={"profile_photo": ""}, headers=headers)  # Can't clear it either
    rider = _rider(db_session, body["mobile_number"])
    assert rider.profile_photo == original and rider.primary_area == "Sector 29"
    client.put(f"{API}/admin/riders/{rider.id}", json={"full_name": "Renamed Rider"}, headers=admin)
    assert _rider(db_session, body["mobile_number"]).profile_photo == original


def test_hard_delete_removes_the_selfie_file(client, db_session, admin, uploads_dir):
    body = _body()
    client.post(f"{API}/auth/register", json=body)
    rider = _rider(db_session, body["mobile_number"])
    stored = uploads_dir / rider.profile_photo[len("/uploads/"):]
    assert stored.exists()
    res = client.request("DELETE", f"{API}/admin/riders/{rider.id}", json={"reason": "Test cleanup"}, headers=admin)
    assert res.status_code == 200, res.text
    assert not stored.exists()


# --------------------------------------------------------------------------- registration security

def test_registering_an_existing_rider_number_never_logs_in_as_them(client, db_session):
    victim = _body()
    assert client.post(f"{API}/auth/register", json=victim).status_code == 200
    attacker = {**_body(), "mobile_number": victim["mobile_number"], "full_name": "Attacker", "password": "attacker1"}
    res = client.post(f"{API}/auth/register", json=attacker)
    assert res.status_code == 400 and "already registered" in res.json()["detail"]
    assert "access_token" not in res.json()
    assert _rider(db_session, victim["mobile_number"]).full_name == "Selfie Rider"  # Unchanged


def test_registering_an_admin_number_never_gives_admin_access(client, db_session):
    phone = _phone()
    db_session.add(User(phone=phone, email=f"{phone}@admin.test", hashed_password=get_password_hash("adminSecret1"), role=UserRole.SUPER_ADMIN))
    db_session.commit()
    res = client.post(f"{API}/auth/register", json={**_body(), "mobile_number": phone})
    assert res.status_code == 400 and "access_token" not in res.json()
    db_session.expire_all()
    admin_user = db_session.query(User).filter(User.phone == phone).one()
    assert admin_user.role == UserRole.SUPER_ADMIN
    assert db_session.query(Rider).filter(Rider.user_id == admin_user.id).first() is None  # Nothing attached


def test_password_is_required_no_default(client, db_session):
    body = _body()
    body.pop("password")
    assert client.post(f"{API}/auth/register", json=body).status_code == 422
    assert client.post(f"{API}/auth/register", json={**_body(), "password": "12345"}).status_code == 422  # Too short
    # The old default password never works for anyone.
    assert client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "Rider@123"}).status_code == 401


def test_refused_registration_leaves_nothing_behind(client, db_session):
    body = _body(referral_code="SRNOPE00")
    assert client.post(f"{API}/auth/register", json=body).status_code == 400
    db_session.expire_all()
    assert db_session.query(User).filter(User.phone == body["mobile_number"]).first() is None
    body.pop("referral_code")
    assert client.post(f"{API}/auth/register", json=body).status_code == 200  # Can register normally afterwards


# --------------------------------------------------------------------------- admin-created riders

@pytest.mark.parametrize("category", ["CYCLE", "TWO_WHEELER", "AUTO", "THREE_WHEELER"])
def test_admin_created_rider_needs_a_selfie(client, db_session, admin, uploads_dir, category):
    body = {k: v for k, v in _body(category).items() if k != "selfie"}
    body["primary_city"] = "Gurugram"
    refused = client.post(f"{API}/admin/riders", json=body, headers=admin)
    assert refused.status_code == 422 and _rider(db_session, body["mobile_number"]) is None
    bad = client.post(f"{API}/admin/riders", json={**body, "selfie": "/uploads/selfies/x.jpg"}, headers=admin)
    assert bad.status_code == 422
    created = client.post(f"{API}/admin/riders", json={**body, "selfie": SELFIE}, headers=admin)
    assert created.status_code == 200, created.text
    rider = _rider(db_session, body["mobile_number"])
    assert rider.profile_photo.startswith("/uploads/selfies/")
    assert client.get(f"{API}/admin/riders/{rider.id}/selfie", headers=admin).content == SELFIE_BYTES


def test_admin_create_storage_failure_creates_nothing(client, db_session, admin, monkeypatch):
    monkeypatch.setattr(storage_service, "save", lambda *a, **k: (_ for _ in ()).throw(storage_service.StorageError("down")))
    body = {**_body(), "primary_city": "Gurugram"}
    res = client.post(f"{API}/admin/riders", json=body, headers=admin)
    assert res.status_code == 503
    db_session.expire_all()
    assert db_session.query(User).filter(User.phone.like(f"%{body['mobile_number'][-10:]}")).first() is None


# --------------------------------------------------------------------------- testing mode (selfie optional)

def test_selfie_optional_while_testing_but_still_validated(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_DRIVER_SELFIE", False)
    assert client.get(f"{API}/public/app-config").json() == {"selfie_required": False, "email_required": False, "otp_login": settings.ENABLE_OTP_LOGIN}
    for missing in (None, ""):
        body = _body(selfie=missing)
        if missing is None:
            body.pop("selfie", None)
        res = client.post(f"{API}/auth/register", json=body)
        assert res.status_code == 200, res.text
        assert _rider(db_session, body["mobile_number"]).profile_photo is None
    # A selfie that is sent must still be a real photo, and is stored privately as usual.
    assert client.post(f"{API}/auth/register", json=_body(selfie="/uploads/selfies/x.jpg")).status_code == 422
    body = _body()
    assert client.post(f"{API}/auth/register", json=body).status_code == 200
    assert _rider(db_session, body["mobile_number"]).profile_photo.startswith("/uploads/selfies/")


def test_selfie_switch_on_is_enforced_and_reported(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_DRIVER_SELFIE", True)
    assert client.get(f"{API}/public/app-config").json() == {"selfie_required": True, "email_required": False, "otp_login": settings.ENABLE_OTP_LOGIN}
    body = _body()
    body.pop("selfie")
    assert client.post(f"{API}/auth/register", json=body).status_code == 422
    assert _rider(db_session, body["mobile_number"]) is None


def test_admin_add_rider_still_requires_selfie_while_testing(client, db_session, admin, monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_DRIVER_SELFIE", False)
    body = {k: v for k, v in _body().items() if k != "selfie"}
    body["primary_city"] = "Gurugram"
    assert client.post(f"{API}/admin/riders", json=body, headers=admin).status_code == 422
