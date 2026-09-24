"""HTTP-level checks for the fulfilment endpoints (routing, validation and wiring)."""
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import UserRole, get_password_hash
from app.models.all_models import Brand, Rider, RiderStatus, User
from app.services.campaign_service import today_ist

from tests.conftest import before_start

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin_headers(client, db_session):
    if not db_session.query(User).filter(User.phone == "+919999000088").first():
        db_session.add(User(phone="+919999000088", email="fulfil@admin.test", hashed_password=get_password_hash("adminPass123"), role=UserRole.SUPER_ADMIN))
        db_session.commit()
    token = client.post(f"{API}/auth/login", json={"phone": "+919999000088", "password": "adminPass123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_fulfillment_endpoints(client, db_session, admin_headers):
    brand = Brand(name="Fulfil API Brand", code="fulfil_api", is_active=True)
    db_session.add(brand)
    db_session.commit()
    start = today_ist()
    campaign = client.post(
        f"{API}/campaigns",
        json={
            "name": "Fulfil API Campaign", "brand_id": brand.id, "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=9)).isoformat(), "total_slots": 2, "daily_rate": 10,
            "brand_contract_value": 300, "visibility": "PUBLIC",
        },
        headers=admin_headers,
    ).json()
    cid = campaign["id"]
    assert campaign["contracted_rider_days"] == 20 and campaign["commitment_locked"] is True

    # Commitment is locked after publishing.
    edit = {**{k: campaign[k] for k in ("name", "brand_id", "start_date", "end_date", "daily_rate")}, "total_slots": 5}
    assert client.put(f"{API}/campaigns/{cid}", json=edit, headers=admin_headers).status_code == 400

    # Brand kit with a required T-shirt: joining needs a valid size.
    kit = client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": True, "size_options": "M,L"}, headers=admin_headers).json()
    assert kit["kit"]["size_options"] == ["M", "L"]
    client.post(f"{API}/campaigns/{cid}/pickup-locations", json={"name": "Gurugram Office", "address": "Sector 44, Gurugram"}, headers=admin_headers)
    reg = client.post(f"{API}/auth/register", json={"full_name": "Kit Rider", "mobile_number": "9100000099", "password": "riderPass1"}).json()
    rider_headers = {"Authorization": f"Bearer {reg['access_token']}"}
    rider = db_session.query(Rider).filter(Rider.mobile_number == "9100000099").first()
    rider.status = RiderStatus.APPROVED
    db_session.commit()
    # It started today, so it's live: new riders can't join any more.
    assert "already started" in client.post(f"{API}/riders/me/campaigns/{cid}/join", json={"tshirt_size": "L"}, headers=rider_headers).json()["detail"]
    with before_start(db_session, cid):  # As if the rider had joined before the start date
        assert client.post(f"{API}/riders/me/campaigns/{cid}/join", headers=rider_headers).status_code == 400
        assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json={"tshirt_size": "L"}, headers=rider_headers).status_code == 200
        app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin_headers).json()[0]["id"]
        # The T-shirt must be collected before the rider can be approved.
        assert client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin_headers).status_code == 400
        client.post(f"{API}/campaigns/{cid}/applications/{app_id}/kit", json={"collected": True}, headers=admin_headers)
        assert client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin_headers).status_code == 200
    kits = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin_headers).json()["riders"]
    assert kits[0]["tshirt_size"] == "L" and kits[0]["status"] == "COLLECTED" and kits[0]["collected_date"]
    detail = client.get(f"{API}/riders/me/campaigns/{cid}", headers=rider_headers).json()
    assert detail["my_kit"]["status"] == "COLLECTED" and detail["my_kit"]["pickup_location"]["name"] == "Gurugram Office"

    # Live fulfilment figures.
    f = client.get(f"{API}/campaigns/{cid}/fulfillment?riders_available=1", headers=admin_headers).json()
    assert f["contracted_rider_days"] == 20 and f["delivered_rider_days"] == 0 and f["recovery"]["riders_available_for_extension"] == 1

    # Replacement slots and an extension never change the commitment.
    assert client.post(f"{API}/campaigns/{cid}/replacement-slots", json={"extra_replacement_slots": 1}, headers=admin_headers).json()["stats"]["slot_capacity"] == 3
    bad = client.post(f"{API}/campaigns/{cid}/extensions", json={"start_date": start.isoformat(), "end_date": start.isoformat(), "reason": "Overlap"}, headers=admin_headers)
    assert bad.status_code == 400
    ext_start = start + timedelta(days=10)
    extended = client.post(f"{API}/campaigns/{cid}/extensions", json={"start_date": ext_start.isoformat(), "end_date": (ext_start + timedelta(days=2)).isoformat(), "reason": "Recover shortfall"}, headers=admin_headers).json()
    assert extended["contracted_rider_days"] == 20 and extended["extensions"][0]["rider_day_target"] == 20
    assert extended["effective_end_date"] == (ext_start + timedelta(days=2)).isoformat()

    # Brand money is recorded explicitly.
    client.post(f"{API}/campaigns/{cid}/brand-payments", json={"kind": "RECEIVED", "amount": 300, "record_date": start.isoformat()}, headers=admin_headers)
    assert client.post(f"{API}/campaigns/{cid}/brand-payments", json={"kind": "REFUND", "amount": 500, "record_date": start.isoformat()}, headers=admin_headers).status_code == 400
    assert client.get(f"{API}/campaigns/{cid}/brand-payments", headers=admin_headers).json()["summary"]["payment_status"] == "PAID"

    # Excuse today, check the log, then close and read the snapshot.
    assignment_id = client.get(f"{API}/campaigns/{cid}/riders", headers=admin_headers).json()[0]["assignment_id"]
    activity = client.post(f"{API}/campaigns/{cid}/riders/{assignment_id}/excuse", json={"day": start.isoformat(), "reason": "Medical"}, headers=admin_headers).json()
    assert activity["excused_days"] == 1 and activity["days"][0]["status"] == "EXCUSED"
    log = client.get(f"{API}/campaigns/{cid}/activity-log", headers=admin_headers).json()
    assert log[0]["new_status"] == "EXCUSED" and log[0]["reason"] == "Excused: Medical"
    assert client.get(f"{API}/campaigns/{cid}/snapshot", headers=admin_headers).status_code == 404
    client.post(f"{API}/campaigns/{cid}/complete", headers=admin_headers)
    snapshot = client.get(f"{API}/campaigns/{cid}/snapshot", headers=admin_headers).json()
    assert snapshot["contracted_rider_days"] == 20 and snapshot["final_status"] == "COMPLETED_WITH_SHORTFALL"
    assert snapshot["brand"]["received"] == 300
