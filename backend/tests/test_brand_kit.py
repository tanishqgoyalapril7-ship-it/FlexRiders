"""T-shirt / brand kit pickup: admin-configured locations, rider size + location at join, pickup status."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.models.campaign_models import CampaignBrandKit, CampaignPickupLocation, RiderBrandKit
from app.services import kit_service as ks
from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _campaign(client, admin, slots=3):
    brand = client.post(f"{API}/brands", json={"name": f"Kit Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=1)  # Open for joining (riders can't join once it's live)
    return client.post(
        f"{API}/campaigns",
        json={"name": f"Kit Campaign {uuid.uuid4().hex[:5]}", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=5)).isoformat(), "total_slots": slots, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()


def _rider(client, admin):
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    return rider, {"Authorization": f"Bearer {token}"}


LOCATION = {
    "name": "Super Riders Office – Gurugram", "address": "Sector 44, Gurugram, Haryana",
    "map_url": "https://maps.google.com/?q=Sector+44+Gurugram", "available_days": "Monday–Saturday",
    "start_time": "10:00", "end_time": "18:00", "contact_name": "Rahul", "contact_phone": "9800000000",
    "instructions": "Carry your original ID and collect the T-shirt from reception.",
}


def test_location_crud_and_validation(client, admin):
    cid = _campaign(client, admin)["id"]
    url = f"{API}/campaigns/{cid}/pickup-locations"
    assert client.post(url, json={**LOCATION, "start_time": "18:00", "end_time": "10:00"}, headers=admin).status_code == 400
    assert client.post(url, json={**LOCATION, "start_time": "9am"}, headers=admin).status_code == 400
    assert client.post(url, json={**LOCATION, "map_url": "maps.google.com"}, headers=admin).status_code == 400
    loc = client.post(url, json=LOCATION, headers=admin).json()
    assert loc["name"] == LOCATION["name"] and loc["start_time"] == "10:00" and loc["is_active"] is True

    edited = client.put(f"{url}/{loc['id']}", json={"end_time": "17:00", "map_url": ""}, headers=admin).json()
    assert edited["end_time"] == "17:00" and edited["map_url"] is None and edited["address"] == LOCATION["address"]
    assert client.delete(f"{url}/{loc['id']}", headers=admin).status_code == 200  # Unused → deleted
    kit = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin).json()
    assert kit["kit"] is None or kit["kit"]["locations"] == []
    assert [s["label"] for s in kit["statuses"]] == ["Not Required", "Pending Collection", "Ready for Pickup", "Collected"]


def test_join_with_size_and_location_choice(client, admin):
    cid = _campaign(client, admin)["id"]
    client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": True, "size_options": "s, m, L, XL"}, headers=admin)
    url = f"{API}/campaigns/{cid}/pickup-locations"
    gurugram = client.post(url, json=LOCATION, headers=admin).json()
    saket = client.post(url, json={"name": "Delhi Saket", "address": "Saket, New Delhi"}, headers=admin).json()
    noida = client.post(url, json={"name": "Noida Sector 18", "address": "Sector 18, Noida"}, headers=admin).json()
    client.put(f"{url}/{noida['id']}", json={"is_active": False}, headers=admin)

    rider, headers = _rider(client, admin)
    detail = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
    assert [l["name"] for l in detail["brand_kit"]["locations"]] == [LOCATION["name"], "Delhi Saket"]  # Inactive hidden
    assert detail["brand_kit"]["size_options"] == ["S", "M", "L", "XL"]

    join = f"{API}/riders/me/campaigns/{cid}/join"
    assert "size" in client.post(join, json={}, headers=headers).json()["detail"]
    assert "collect" in client.post(join, json={"tshirt_size": "M"}, headers=headers).json()["detail"]  # 2 locations: must choose
    assert client.post(join, json={"tshirt_size": "M", "pickup_location_id": noida["id"]}, headers=headers).status_code == 400
    assert client.post(join, json={"tshirt_size": "m", "pickup_location_id": saket["id"]}, headers=headers).status_code == 200

    app_row = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]
    assert app_row["tshirt_size"] == "M" and app_row["pickup_location"] == "Delhi Saket"
    client.post(f"{API}/campaigns/{cid}/applications/{app_row['id']}/kit", json={"collected": True}, headers=admin)
    client.post(f"{API}/campaigns/{cid}/applications/{app_row['id']}/approve", headers=admin)

    mine = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["my_kit"]
    assert mine["tshirt_size"] == "M" and mine["status_label"] == "Collected"
    assert mine["pickup_location"]["name"] == "Delhi Saket"

    # Admin: summary, status updates, reassigning the location; the rider can't change it.
    kit = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin).json()
    assert kit["summary"]["kits_needed"] == 1 and kit["summary"]["collected"] == 1
    assert {s["size"]: s["count"] for s in kit["summary"]["sizes"]}["M"] == 1
    kit_id = kit["riders"][0]["id"]
    patch = f"{API}/campaigns/{cid}/brand-kit/riders/{kit_id}"
    assert client.patch(patch, json={"status": "PICKUP_SCHEDULED"}, headers=admin).status_code == 400
    ready = client.patch(patch, json={"status": "READY_FOR_PICKUP", "pickup_date": today_ist().isoformat(), "pickup_location_id": gurugram["id"]}, headers=admin).json()
    assert ready["status_label"] == "Ready for Pickup" and ready["pickup_location"]["name"] == LOCATION["name"] and ready["pickup_date"]
    collected = client.patch(patch, json={"status": "COLLECTED"}, headers=admin).json()
    assert collected["collected_date"] == today_ist().isoformat() and collected["issued_by"]
    undone = client.patch(patch, json={"status": "READY_FOR_PICKUP"}, headers=admin).json()
    assert undone["collected_date"] is None  # Mistaken "Collected" can be undone
    assert client.patch(patch, json={"tshirt_size": "XXXL"}, headers=admin).status_code == 400
    assert client.patch(patch, json={"status": "READY_FOR_PICKUP"}, headers=headers).status_code == 403

    # A location with riders can't be deleted, only deactivated.
    assert client.delete(f"{url}/{gurugram['id']}", headers=admin).status_code == 409
    assert client.put(f"{url}/{gurugram['id']}", json={"is_active": False}, headers=admin).json()["is_active"] is False
    mine = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["my_kit"]
    assert mine["pickup_location"]["name"] == LOCATION["name"]  # Assigned riders keep it


def test_single_location_is_automatic_and_no_kit_needs_nothing(client, admin):
    cid = _campaign(client, admin)["id"]
    rider, headers = _rider(client, admin)
    # No T-shirt: joining needs no size or location, and the rider sees "Not Required".
    assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=headers).status_code == 200
    app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]["id"]
    client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin)
    assert client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["my_kit"]["status"] == "NOT_REQUIRED"

    # Turning the kit on later gives already-assigned riders a pending kit at the only location.
    client.post(f"{API}/campaigns/{cid}/pickup-locations", json=LOCATION, headers=admin)
    kit = client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": True}, headers=admin).json()
    assert kit["riders"][0]["status"] == "PENDING" and kit["riders"][0]["pickup_location"]["name"] == LOCATION["name"]
    assert kit["summary"]["sizes"][-1] == {"size": "Not set", "count": 1}
    # And turning it off marks uncollected kits Not Required.
    kit = client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": False}, headers=admin).json()
    assert kit["riders"][0]["status"] == "NOT_REQUIRED" and kit["summary"]["kits_needed"] == 0

    # Admin adding a rider directly uses the same rules (single location picked automatically).
    client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": True}, headers=admin)
    other, _ = _rider(client, admin)
    assert client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": other["id"]}, headers=admin).status_code == 400  # Size needed
    no_kit = client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": other["id"], "tshirt_size": "L"}, headers=admin)
    assert no_kit.status_code == 400 and "collected" in no_kit.json()["detail"]  # T-shirt must be handed over
    added = client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": other["id"], "tshirt_size": "L", "kit_collected": True}, headers=admin)
    assert added.status_code == 200
    kits = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin).json()["riders"]
    assert any(k["rider"]["id"] == other["id"] and k["tshirt_size"] == "L" and k["pickup_location"] for k in kits)


def test_legacy_single_location_is_migrated(db_session, client, admin):
    cid = _campaign(client, admin)["id"]
    db_session.add(CampaignBrandKit(campaign_id=cid, tshirt_required=True, pickup_location="Old Office", pickup_address="Old Street 1", pickup_hours="Mon-Fri 10-6", contact_phone="99"))
    db_session.commit()
    kit = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin).json()["kit"]
    assert [l["name"] for l in kit["locations"]] == ["Old Office"] and kit["locations"][0]["available_days"] == "Mon-Fri 10-6"
    db_session.expire_all()
    assert db_session.query(CampaignPickupLocation).filter(CampaignPickupLocation.campaign_id == cid).count() == 1
    assert db_session.query(CampaignBrandKit).filter(CampaignBrandKit.campaign_id == cid).one().pickup_location is None
