"""Account deletion (Google Play): in the app, and via the public web request form handled by an admin."""
import uuid
from datetime import date

import pytest

from app.core.config import settings
from app.models.all_models import AccountDeletionRequest, Notification, Payment, Rider, User
from app.models.campaign_models import RoutePoint
from tests.conftest import SELFIE
from tests.test_crud import make_admin

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _register(client, **extra):
    phone = "9" + str(uuid.uuid4().int)[:9]
    body = {"full_name": "Delete Me", "mobile_number": phone, "password": "riderPass1", "vehicle_category": "CYCLE", "selfie": SELFIE,
            "email": f"{phone}@example.com", "dob": "1995-04-02", "upi_id": "me@upi", "primary_area": "Sector 29", **extra}
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 200, res.text
    return phone, {"Authorization": "Bearer " + res.json()["access_token"]}


def _rider(db_session, phone):
    db_session.expire_all()
    return db_session.query(Rider).filter(Rider.mobile_number == phone).first()


def test_in_app_deletion_without_history_removes_everything(client, db_session, uploads_dir):
    phone, headers = _register(client)
    selfie_file = uploads_dir / _rider(db_session, phone).profile_photo[len("/uploads/"):]
    assert client.request("DELETE", f"{API}/riders/me", json={"password": "wrong-pass"}, headers=headers).status_code == 400
    res = client.request("DELETE", f"{API}/riders/me", json={"password": "riderPass1"}, headers=headers)
    assert res.status_code == 200 and res.json()["deleted"] is True
    assert _rider(db_session, phone) is None and not selfie_file.exists()
    assert client.post(f"{API}/auth/login", json={"phone": phone, "password": "riderPass1"}).status_code == 401


def test_in_app_deletion_with_history_erases_personal_data_and_keeps_records(client, db_session, admin, uploads_dir):
    phone, headers = _register(client)
    rider = _rider(db_session, phone)
    selfie_file = uploads_dir / rider.profile_photo[len("/uploads/"):]
    # History that must be kept: a payment, plus private GPS points that must go.
    db_session.add(Payment(rider_id=rider.id, amount=120, payment_date=date.today(), status="COMPLETED", payment_type="UPI", upi_id="me@upi"))
    db_session.add(RoutePoint(campaign_id=1, assignment_id=1, rider_id=rider.id, route_date=date.today(), recorded_at=rider.created_at, latitude=28.4, longitude=77.0))
    db_session.commit()

    res = client.request("DELETE", f"{API}/riders/me", json={"password": "riderPass1"}, headers=headers)
    assert res.status_code == 200 and res.json()["deleted"] is False and "erased" in res.json()["message"]
    rider = _rider(db_session, phone)
    assert rider.archived_at is not None
    for field in ("profile_photo", "email", "dob", "upi_id", "gpay_number", "primary_area", "bank_account_number"):
        assert getattr(rider, field) is None, field
    assert not selfie_file.exists()
    assert db_session.query(RoutePoint).filter(RoutePoint.rider_id == rider.id).count() == 0
    assert db_session.query(Notification).filter(Notification.user_id == rider.user_id).count() == 0
    # Kept: name, Rider ID, phone and the payment record.
    assert rider.full_name == "Delete Me" and rider.rider_id and rider.mobile_number == phone
    assert db_session.query(Payment).filter(Payment.rider_id == rider.id).count() == 1
    # The login is dead, even with the old password.
    assert client.post(f"{API}/auth/login", json={"phone": phone, "password": "riderPass1"}).status_code == 401
    assert db_session.get(User, rider.user_id).email is None


def test_web_request_is_generic_rate_limited_and_admin_completes_it(client, db_session, admin):
    phone, _ = _register(client)
    unknown = "9" + str(uuid.uuid4().int)[:9]
    # Same answer for a real and an unknown number (no account discovery), and no login needed.
    a = client.post(f"{API}/public/account-deletion-requests", json={"mobile_number": f"+91 {phone}", "full_name": "Delete Me", "message": "Please delete"})
    b = client.post(f"{API}/public/account-deletion-requests", json={"mobile_number": unknown, "full_name": "Nobody"})
    assert a.status_code == b.status_code == 200 and a.json() == b.json()
    assert client.post(f"{API}/public/account-deletion-requests", json={"mobile_number": "123", "full_name": "Bad"}).status_code == 422
    for _ in range(5):
        client.post(f"{API}/public/account-deletion-requests", json={"mobile_number": unknown, "full_name": "Nobody"})
    db_session.expire_all()
    assert db_session.query(AccountDeletionRequest).filter(AccountDeletionRequest.mobile_number == unknown).count() == 3  # Capped per day

    # Admin only
    assert client.get(f"{API}/admin/deletion-requests").status_code == 401
    requests = client.get(f"{API}/admin/deletion-requests", params={"status": "NEW"}, headers=admin).json()
    mine = next(r for r in requests if r["mobile_number"] == phone)
    assert mine["rider"]["full_name"] == "Delete Me"
    assert client.post(f"{API}/admin/deletion-requests/{mine['id']}/reject", json={}, headers=admin).status_code == 400  # Reason needed
    done = client.post(f"{API}/admin/deletion-requests/{mine['id']}/complete", json={"note": "Confirmed by phone"}, headers=admin)
    assert done.status_code == 200 and done.json()["status"] == "COMPLETED" and "deleted" in done.json()["resolution"]
    assert _rider(db_session, phone) is None
    assert client.post(f"{API}/admin/deletion-requests/{mine['id']}/complete", json={}, headers=admin).status_code == 400  # Once

    other = next(r for r in client.get(f"{API}/admin/deletion-requests", headers=admin).json() if r["mobile_number"] == unknown and r["status"] == "NEW")
    res = client.post(f"{API}/admin/deletion-requests/{other['id']}/complete", json={}, headers=admin)
    assert res.status_code == 200 and "No FlexRiders account" in res.json()["resolution"]
