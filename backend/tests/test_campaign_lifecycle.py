"""Campaign lifecycle: joining closes when a campaign goes Live, vehicle eligibility, photo slot
notifications, the public brand page and the one-time T-shirt return incentive."""
import uuid
from datetime import datetime, time, timedelta

import pytest

from app.core.config import settings
from app.models.all_models import Notification, Payment
from app.services import slot_reminder_service
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE, before_start
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _campaign(client, admin, start_offset=1, days=5, **extra):
    brand = client.post(f"{API}/brands", json={"name": f"Life Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=start_offset)
    res = client.post(
        f"{API}/campaigns",
        json={"name": f"Sector 57 Promotion {uuid.uuid4().hex[:4]}", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=days - 1)).isoformat(), "total_slots": 3, "daily_rate": 100,
              "visibility": "PUBLIC", "rules": "Wear the T-shirt\nKeep the bike clean", **extra},
        headers=admin,
    )
    assert res.status_code == 200, res.text
    return res.json()


def _rider(client, admin, **extra):
    body = rider_payload(status="APPROVED", **extra)
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    return rider, {"Authorization": f"Bearer {token}"}


def _join_and_approve(client, admin, cid, headers, **join):
    assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json=join, headers=headers).status_code == 200
    app_id = client.get(f"{API}/campaigns/{cid}/applications?status=REQUESTED", headers=admin).json()[0]["id"]
    return app_id


def _titles(db_session, rider_id_):
    from app.models.all_models import Rider

    db_session.expire_all()
    user_id = db_session.get(Rider, rider_id_).user_id
    return [n.title for n in db_session.query(Notification).filter(Notification.user_id == user_id).order_by(Notification.id)]


def test_join_closes_when_campaign_goes_live(client, db_session, admin):
    campaign = _campaign(client, admin)
    cid = campaign["id"]
    assert campaign["lifecycle"]["label"] == "Open for Joining"
    joined, joined_h = _rider(client, admin)
    pending, pending_h = _rider(client, admin)
    late, late_h = _rider(client, admin)

    # A. Open for joining: eligible riders can join.
    app_id = _join_and_approve(client, admin, cid, joined_h)
    assert client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin).status_code == 200
    assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=pending_h).status_code == 200

    # F. Admin: Published → Live. Only assigned riders are told, once.
    live = client.post(f"{API}/campaigns/{cid}/go-live", headers=admin).json()
    assert live["lifecycle"]["key"] == "LIVE" and live["live_at"]
    assert client.post(f"{API}/campaigns/{cid}/go-live", headers=admin).status_code == 400
    assert any("is now LIVE" in t for t in _titles(db_session, joined["id"]))
    assert not any("LIVE" in t for t in _titles(db_session, pending["id"]))
    from app.services.campaign_service import notify_campaign_live
    from app.models.campaign_models import Campaign

    assert notify_campaign_live(db_session, db_session.get(Campaign, cid)) == 0  # Never twice

    # B. Live: the join button is disabled with a reason, and the API refuses new riders.
    card = client.get(f"{API}/riders/me/campaigns/{cid}", headers=late_h).json()
    assert card["can_join"] is False and card["join_blocked_reason"] == "Campaign has already started. New riders cannot join this campaign."
    res = client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=late_h)
    assert res.status_code == 400 and "already started" in res.json()["detail"]

    # A request made while it was open can still be approved; admins can still add replacements.
    pending_app = client.get(f"{API}/campaigns/{cid}/applications?status=REQUESTED", headers=admin).json()[0]["id"]
    assert client.post(f"{API}/campaigns/{cid}/applications/{pending_app}/approve", headers=admin).status_code == 200
    assert client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": late["id"]}, headers=admin).status_code == 200


def test_assigned_rider_continues_after_start_and_start_date_goes_live(client, db_session, admin):
    # C. A campaign that starts today goes live by itself; riders who joined earlier keep working.
    campaign = _campaign(client, admin, start_offset=0)
    cid = campaign["id"]
    assert campaign["lifecycle"]["key"] == "LIVE"
    rider, headers = _rider(client, admin)
    with before_start(db_session, cid):
        app_id = _join_and_approve(client, admin, cid, headers)
        client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin)
    detail = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
    assert detail["lifecycle"]["key"] == "LIVE" and detail["my_status"] == "ACTIVE"
    assert any("is now LIVE" in t for t in _titles(db_session, rider["id"]))
    up = client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", b"morning", "image/jpeg")}, data={"slot": "MORNING"}, headers=headers)
    assert up.status_code == 200, up.text


def test_slot_notifications(client, db_session, admin):
    campaign = _campaign(client, admin, start_offset=0)
    cid = campaign["id"]
    assert campaign["photo_slot_windows"] == {"MORNING": ["06:00", "11:00"], "EVENING": ["12:00", "15:00"], "NIGHT": ["17:00", "21:00"]}
    rider, headers = _rider(client, admin)
    outsider, _ = _rider(client, admin)
    with before_start(db_session, cid):
        app_id = _join_and_approve(client, admin, cid, headers)
        client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin)
    client.get(f"{API}/campaigns/{cid}", headers=admin)  # Goes live

    at = lambda hh, mm: datetime.combine(today_ist(), time(hh, mm)) - timedelta(hours=5, minutes=30)  # IST → UTC
    # D. Morning opens at 6:00: the rider is notified (once), outsiders aren't.
    assert slot_reminder_service.run_once(db_session, at(6, 1)) >= 1
    assert slot_reminder_service.run_once(db_session, at(6, 2)) == 0
    titles = _titles(db_session, rider["id"])
    assert "Morning selfie slot is open" in titles
    assert not _titles(db_session, outsider["id"])
    msg = db_session.query(Notification).filter(Notification.title == "Morning selfie slot is open").first().message
    assert "between 6:00 AM and 11:00 AM" in msg

    # E. Morning photo submitted: no "closes soon" reminder for it.
    up = client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", b"m", "image/jpeg")}, data={"slot": "MORNING"}, headers=headers)
    assert up.status_code == 200
    slot_reminder_service.run_once(db_session, at(10, 45))
    assert "Morning slot closes soon" not in _titles(db_session, rider["id"])

    # Evening not submitted: opens at 12:00, reminder before 3:00 PM.
    slot_reminder_service.run_once(db_session, at(12, 5))
    slot_reminder_service.run_once(db_session, at(14, 40))
    slot_reminder_service.run_once(db_session, at(14, 50))
    titles = _titles(db_session, rider["id"])
    assert titles.count("Evening selfie slot is open") == 1 and titles.count("Evening slot closes soon") == 1
    closing = db_session.query(Notification).filter(Notification.title == "Evening slot closes soon").first().message
    assert "before 3:00 PM" in closing
    assert slot_reminder_service.run_once(db_session, at(15, 30)) == 0  # Between slots: nothing

    # Custom windows are validated and used.
    edit = {k: campaign[k] for k in ("name", "brand_id", "start_date", "end_date", "total_slots", "daily_rate")}
    bad = client.put(f"{API}/campaigns/{cid}", json={**edit, "photo_slot_windows": {"MORNING": ["06:00", "13:00"], "EVENING": ["12:00", "15:00"], "NIGHT": ["17:00", "21:00"]}}, headers=admin)
    assert bad.status_code == 400 and "overlap" in bad.json()["detail"]
    ok = client.put(f"{API}/campaigns/{cid}", json={**edit, "photo_slot_windows": {"MORNING": ["07:00", "10:00"], "EVENING": ["12:00", "15:00"], "NIGHT": ["17:00", "21:00"]}}, headers=admin)
    assert ok.json()["photo_slot_windows"]["MORNING"] == ["07:00", "10:00"]


def test_vehicle_category_registration_and_eligibility(client, db_session, admin):
    # Registration stores the category; bad values are refused.
    phone = "9" + str(uuid.uuid4().int)[:9]
    bad = client.post(f"{API}/auth/register", json={"selfie": SELFIE, "full_name": "Auto Rider", "mobile_number": phone, "password": "riderPass1", "vehicle_category": "Truck"})
    assert bad.status_code == 422
    reg = client.post(f"{API}/auth/register", json={"selfie": SELFIE, "full_name": "Auto Rider", "mobile_number": phone, "password": "riderPass1", "vehicle_category": "Three Wheeler", "vehicle_number": "DL1LA" + phone[-4:]})
    assert reg.status_code == 200
    auto_h = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    me = client.get(f"{API}/riders/me", headers=auto_h).json()
    assert me["vehicle_category"] == "THREE_WHEELER"
    # Riders can't switch category themselves once it's set.
    assert client.patch(f"{API}/riders/me", json={"vehicle_category": "TWO_WHEELER"}, headers=auto_h).status_code == 400
    client.patch(f"{API}/admin/riders/{me['id']}/approve", headers=admin)

    campaign = _campaign(client, admin, eligible_vehicle_categories=["TWO_WHEELER"])
    cid = campaign["id"]
    assert campaign["eligible_vehicle_label"] == "Bike / Two Wheeler"

    # G. Three wheeler → rejected by the API, with the reason shown in the app.
    card = client.get(f"{API}/riders/me/campaigns/{cid}", headers=auto_h).json()
    assert card["can_join"] is False and "only for Bike / Two Wheeler" in card["join_blocked_reason"]
    res = client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=auto_h)
    assert res.status_code == 400 and "Two Wheeler" in res.json()["detail"]
    assert client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": me["id"]}, headers=admin).status_code == 400

    # No category yet (riders from before it was required): asked to add it; a two wheeler joins fine.
    unknown, unknown_h = _rider(client, admin)
    from app.models.all_models import Rider

    legacy = db_session.get(Rider, unknown["id"])
    legacy.vehicle_category = None
    db_session.commit()
    assert "Add your vehicle type" in client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=unknown_h).json()["detail"]
    # Bike needs a registration number on file first (riders can't enter it themselves; operations can).
    assert client.patch(f"{API}/riders/me", json={"vehicle_category": "TWO_WHEELER"}, headers=unknown_h).status_code == 400
    legacy.vehicle_number = "HR26LG" + str(unknown["id"]).zfill(4)[-4:]
    db_session.commit()
    assert client.patch(f"{API}/riders/me", json={"vehicle_category": "TWO_WHEELER"}, headers=unknown_h).status_code == 200
    assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=unknown_h).status_code == 200

    # Every type ticked = all vehicles.
    both = _campaign(client, admin, eligible_vehicle_categories=["CYCLE", "TWO_WHEELER", "AUTO", "THREE_WHEELER"])
    assert both["eligible_vehicle_label"] == "All vehicles"
    assert client.post(f"{API}/riders/me/campaigns/{both['id']}/join", json={}, headers=auto_h).status_code == 200


def test_public_campaign_page(client, db_session, admin):
    draft = _campaign(client, admin, visibility="DRAFT", location_area="Sector 57, Gurugram")
    assert client.post(f"{API}/campaigns/{draft['id']}/share", json={"enabled": True}, headers=admin).status_code == 400
    client.post(f"{API}/campaigns/{draft['id']}/publish", headers=admin)
    rider, headers = _rider(client, admin)
    client.post(f"{API}/riders/me/campaigns/{draft['id']}/join", json={}, headers=headers)

    share = client.post(f"{API}/campaigns/{draft['id']}/share", json={"enabled": True}, headers=admin).json()
    assert share["enabled"] and share["slug"].startswith("sector-57-promotion")
    assert client.post(f"{API}/campaigns/{draft['id']}/share", json={"enabled": True}, headers=admin).json()["slug"] == share["slug"]
    assert client.post(f"{API}/campaigns/{draft['id']}/share", json={"enabled": True}, headers={}).status_code in (401, 403)

    # H. Works without login and shows only public information.
    page = client.get(f"{API}/public/campaigns/{share['slug']}")
    assert page.status_code == 200
    data = page.json()
    assert data["name"] == draft["name"] and data["location_area"] == "Sector 57, Gurugram"
    assert data["status_label"] == "Open for Joining" and data["accepting_riders"] is True
    assert data["requirements"] == ["Wear the T-shirt", "Keep the bike clean"]
    text = page.text
    for private in ("daily_rate", "brand_contract_value", "stats", rider["full_name"], rider["mobile_number"], "admin", "payout"):
        assert private not in text

    client.post(f"{API}/campaigns/{draft['id']}/share", json={"enabled": False}, headers=admin)
    assert client.get(f"{API}/public/campaigns/{share['slug']}").status_code == 404


def test_tshirt_return_incentive_credited_once(client, db_session, admin):
    campaign = _campaign(client, admin)
    cid = campaign["id"]
    kit = client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": True, "return_instructions": "Hand it to the front desk"}, headers=admin).json()
    assert kit["kit"]["return_required"] is True and kit["kit"]["return_incentive"] == 50
    client.post(f"{API}/campaigns/{cid}/pickup-locations", json={"name": "Gurugram Office", "address": "Sector 44, Gurugram"}, headers=admin)
    ret = client.post(f"{API}/campaigns/{cid}/pickup-locations", json={"name": "Return Desk", "address": "Sector 44, Gurugram", "purpose": "RETURN", "start_time": "10:00", "end_time": "18:00"}, headers=admin).json()
    assert ret["purpose"] == "RETURN"

    rider, headers = _rider(client, admin, upi_id="rider@upi")
    detail = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
    assert [l["name"] for l in detail["brand_kit"]["locations"]] == ["Gurugram Office"]  # Return desk isn't a pickup point
    app_id = _join_and_approve(client, admin, cid, headers, tshirt_size="M")
    client.post(f"{API}/campaigns/{cid}/applications/{app_id}/kit", json={"collected": True}, headers=admin)
    client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin)

    ret_block = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["kit_return"]
    assert ret_block["status"] == "PENDING" and ret_block["due"] is False  # Campaign not over yet

    # I. Campaign ends: the return is due, with location and incentive.
    client.post(f"{API}/campaigns/{cid}/complete", headers=admin)
    ret_block = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["kit_return"]
    assert ret_block["due"] is True and ret_block["incentive"] == 50 and ret_block["status_label"] == "Return Pending"
    assert ret_block["locations"][0]["name"] == "Return Desk" and ret_block["instructions"] == "Hand it to the front desk"
    assert db_session.query(Payment).filter(Payment.rider_id == rider["id"]).count() == 0  # Ending alone pays nothing

    # J. Admin marks it returned: ₹50 credited once, as a real ledger entry.
    kit_row = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin).json()["riders"][0]
    assert kit_row["return_status"] == "PENDING"
    done = client.post(f"{API}/campaigns/{cid}/brand-kit/riders/{kit_row['id']}/return", headers=admin)
    assert done.status_code == 200 and done.json()["return_status"] == "INCENTIVE_CREDITED"
    credits = db_session.query(Payment).filter(Payment.rider_id == rider["id"]).all()
    assert len(credits) == 1 and credits[0].amount == 50 and credits[0].notes == "T-shirt Return Incentive"
    assert credits[0].category == "TSHIRT_RETURN_INCENTIVE" and credits[0].campaign_id == cid and credits[0].status == "PENDING"
    earnings = client.get(f"{API}/riders/me/earnings", headers=headers).json()
    assert earnings["tshirt_return_earnings"] == 50 and earnings["pending_earnings"] == 50
    assert "₹50 T-shirt return incentive credited to your wallet." in [
        n["message"] for n in client.get(f"{API}/notifications", headers=headers).json()
    ]
    rider_view = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["kit_return"]
    assert rider_view["incentive_credited"] is True and rider_view["status_label"] == "Incentive Credited"

    # K. Marking again never credits twice.
    again = client.post(f"{API}/campaigns/{cid}/brand-kit/riders/{kit_row['id']}/return", headers=admin)
    assert again.status_code == 400 and "only credited once" in again.json()["detail"]
    db_session.expire_all()
    assert db_session.query(Payment).filter(Payment.rider_id == rider["id"]).count() == 1
    summary = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin).json()["return_summary"]
    assert summary["incentive_credited"] == 1 and summary["pending"] == 0


def test_return_not_required_without_collected_tshirt(client, db_session, admin):
    campaign = _campaign(client, admin)
    cid = campaign["id"]
    client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": True, "return_required": False, "return_incentive": 75}, headers=admin)
    rider, headers = _rider(client, admin)
    added = client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": rider["id"], "tshirt_size": "L", "kit_collected": True}, headers=admin)
    assert added.status_code == 200
    kit_row = client.get(f"{API}/campaigns/{cid}/brand-kit", headers=admin).json()["riders"][0]
    assert kit_row["return_status"] == "NOT_REQUIRED"
    assert client.post(f"{API}/campaigns/{cid}/brand-kit/riders/{kit_row['id']}/return", headers=admin).status_code == 400
    assert client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["kit_return"] is None
