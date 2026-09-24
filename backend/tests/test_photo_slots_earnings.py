"""Morning / Evening / Night photo slots and one source of truth for rider earnings."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.services import campaign_service as svc
from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def _setup(client, db_session, rate=10):
    admin, _ = make_admin(client, db_session)
    brand = client.post(f"{API}/brands", json={"name": f"Slot Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist()
    campaign = client.post(
        f"{API}/campaigns",
        json={"name": "Diwali", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=9)).isoformat(), "total_slots": 1, "daily_rate": rate, "visibility": "PUBLIC"},
        headers=admin,
    ).json()
    body = rider_payload(status="APPROVED", upi_id="tanishq@upi")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post(f"{API}/campaigns/{campaign['id']}/riders", json={"rider_id": rider["id"]}, headers=admin).status_code == 200
    return admin, headers, campaign["id"], rider


def _upload(client, headers, cid, slot=None, data=None):
    form = {"slot": slot} if slot else {}
    return client.post(
        f"{API}/riders/me/campaigns/{cid}/activity",
        files={"photo": ("p.jpg", data or uuid.uuid4().bytes, "image/jpeg")},
        data=form,
        headers=headers,
    )


def _today(client, headers, cid):
    return client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["progress"]


def _approve_pending(client, admin, cid):
    for p in client.get(f"{API}/campaigns/{cid}/photos?status=PENDING", headers=admin).json():
        assert client.post(f"{API}/campaigns/{cid}/photos/{p['id']}/approve", headers=admin).status_code == 200


def test_three_slots_complete_one_paid_day_everywhere(client, db_session):
    admin, headers, cid, rider = _setup(client, db_session)

    # Morning → 1/3, Evening → 2/3 (both approved): still not a completed day, nothing earned.
    assert _upload(client, headers, cid, "MORNING").json()["slot"] == "MORNING"
    again = _upload(client, headers, cid, "MORNING")
    assert again.status_code == 400 and "Morning photo is already" in again.json()["detail"]
    assert _upload(client, headers, cid, "LUNCH").status_code == 400
    _upload(client, headers, cid, "EVENING")
    _approve_pending(client, admin, cid)
    p = _today(client, headers, cid)
    slots = {s["slot"]: s["status"] for s in p["today_photos"]["slots"]}
    assert slots == {"MORNING": "APPROVED", "EVENING": "APPROVED", "NIGHT": "NOT_STARTED"}
    assert p["today_photos"]["valid"] == 2 and p["completed_days"] == 0 and p["earned"] == 0
    assert client.get(f"{API}/riders/me/earnings", headers=headers).json()["total_earnings"] == 0

    # Night → 3/3 approved: 1 Photo-Day, streak 1, ₹10 earned.
    _upload(client, headers, cid, "NIGHT")
    _approve_pending(client, admin, cid)
    p = _today(client, headers, cid)
    assert p["today_photos"]["completed"] is True and p["completed_days"] == 1 and p["current_streak"] == 1
    assert p["earned"] == 10 and p["can_submit_today"] is False

    # The same ₹10 everywhere.
    campaigns = client.get(f"{API}/riders/me/campaigns", headers=headers).json()
    assert campaigns["active"]["progress"]["earned"] == 10  # Campaign card
    me = client.get(f"{API}/riders/me", headers=headers).json()
    assert me["total_earnings"] == 10 and me["pending_earnings"] == 10 and me["paid_earnings"] == 0  # Home / profile
    earnings = client.get(f"{API}/riders/me/earnings", headers=headers).json()  # Earnings tab
    assert earnings["total_earnings"] == 10 and earnings["today_earnings"] == 10 and earnings["pending_earnings"] == 10
    assert earnings["campaigns"][0]["campaign_name"] == "Diwali" and earnings["campaigns"][0]["approved_days"] == 1
    payout = client.get(f"{API}/campaigns/{cid}/payouts", headers=admin).json()[0]  # Admin payout
    assert payout["rider"]["upi_id"] == "tanishq@upi" and payout["rider"]["rider_id"] == rider["rider_id"]
    assert payout["eligible_days"] == 1 and payout["total_amount"] == 10 and payout["pending_amount"] == 10
    detail = client.get(f"{API}/admin/riders/{rider['id']}", headers=admin).json()  # Admin rider detail
    assert detail["total_earnings"] == 10 and detail["pending_earnings"] == 10

    # Paying moves pending → paid without double counting the ledger entry.
    client.post(f"{API}/campaigns/{cid}/payouts/{payout['id']}/approve", headers=admin)
    assert client.post(f"{API}/campaigns/{cid}/payouts/{payout['id']}/pay", headers=admin).status_code == 200
    earnings = client.get(f"{API}/riders/me/earnings", headers=headers).json()
    assert (earnings["total_earnings"], earnings["paid_earnings"], earnings["pending_earnings"]) == (10, 10, 0)

    # A manual (non-campaign) payment adds on top.
    client.post(f"{API}/payments", json={"rider_id": rider["id"], "amount": 50}, headers=admin)
    earnings = client.get(f"{API}/riders/me/earnings", headers=headers).json()
    assert (earnings["total_earnings"], earnings["paid_earnings"], earnings["pending_earnings"]) == (60, 10, 50)


def test_rejected_slot_blocks_payout_and_can_be_retaken(client, db_session):
    admin, headers, cid, _ = _setup(client, db_session)
    for slot in ("MORNING", "EVENING", "NIGHT"):
        _upload(client, headers, cid, slot)
    photos = {p["slot"]: p for p in client.get(f"{API}/campaigns/{cid}/photos?status=PENDING", headers=admin).json()}
    client.post(f"{API}/campaigns/{cid}/photos/{photos['MORNING']['id']}/approve", headers=admin)
    client.post(f"{API}/campaigns/{cid}/photos/{photos['EVENING']['id']}/approve", headers=admin)
    client.post(f"{API}/campaigns/{cid}/photos/{photos['NIGHT']['id']}/reject", json={"reason": "Blurry"}, headers=admin)

    p = _today(client, headers, cid)
    night = next(s for s in p["today_photos"]["slots"] if s["slot"] == "NIGHT")
    assert night["status"] == "REJECTED" and night["rejection_reason"] == "Blurry"
    assert p["completed_days"] == 0 and p["earned"] == 0 and p["can_submit_today"] is True

    # Retake only the Night slot; the old rejected photo can't be approved over the new one.
    assert _upload(client, headers, cid, "NIGHT").status_code == 200
    stale = client.post(f"{API}/campaigns/{cid}/photos/{photos['NIGHT']['id']}/approve", headers=admin)
    assert stale.status_code == 400 and "retaken" in stale.json()["detail"]
    _approve_pending(client, admin, cid)
    assert _today(client, headers, cid)["earned"] == 10


def test_slot_windows_can_be_enforced(client, db_session, monkeypatch):
    _, headers, cid, _ = _setup(client, db_session)
    monkeypatch.setattr(settings, "ENFORCE_PHOTO_SLOT_WINDOWS", True)
    monkeypatch.setattr(svc, "slot_windows", lambda campaign=None: {"MORNING": ("00:00", "00:00"), "EVENING": ("00:00", "23:59"), "NIGHT": ("00:00", "23:59")})
    blocked = _upload(client, headers, cid, "MORNING")
    assert blocked.status_code == 400 and "between" in blocked.json()["detail"]
    assert _upload(client, headers, cid, "EVENING").status_code == 200
