"""Refer & Earn: ₹30 to the referrer, once, when the referred rider completes their first Photo Streak."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.models.all_models import Payment, RiderReferral
from app.services import referral_service
from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def _login(client, phone):
    token = client.post(f"{API}/auth/login", json={"phone": phone, "password": "riderPass1"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_referral_reward_after_first_photo_streak(client, db_session):
    admin, _ = make_admin(client, db_session)

    # Referrer A (created by admin) gets a code from Refer & Earn.
    a_body = rider_payload(status="APPROVED", upi_id="a@upi")
    a = client.post(f"{API}/admin/riders", json=a_body, headers=admin).json()
    a_headers = _login(client, a_body["mobile_number"])
    info = client.get(f"{API}/riders/me/referrals", headers=a_headers).json()
    code = info["code"]
    assert code.startswith("SR") and info["reward_amount"] == 30 and code in info["share_message"] and code in info["link"]
    assert info["successful_referrals"] == 0 and info["history"] == []

    # B registers with A's code (case doesn't matter); a wrong code is refused.
    b_phone = "9" + str(uuid.uuid4().int)[:9]
    bad = client.post(f"{API}/auth/register", json={"full_name": "Bhavesh Kumar", "mobile_number": b_phone, "password": "riderPass1", "referral_code": "SRNOPE00"})
    assert bad.status_code == 400 and "referral code" in bad.json()["detail"]
    reg = client.post(f"{API}/auth/register", json={"full_name": "Bhavesh Kumar", "mobile_number": b_phone, "password": "riderPass1", "referral_code": code.lower()})
    assert reg.status_code == 200, reg.text
    history = client.get(f"{API}/riders/me/referrals", headers=a_headers).json()["history"]
    assert history[0]["name"] == "Bhavesh" and history[0]["status"] == "JOINED" and history[0]["reward"] is None

    # B is approved, joins a campaign and uploads Morning / Evening / Night.
    b_id = next(r["id"] for r in client.get(f"{API}/admin/riders", headers=admin).json() if r["mobile_number"] == b_phone)
    client.patch(f"{API}/admin/riders/{b_id}/approve", headers=admin)
    brand = client.post(f"{API}/brands", json={"name": f"Ref Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist()
    cid = client.post(
        f"{API}/campaigns",
        json={"name": "Refer Campaign", "brand_id": brand["id"], "start_date": start.isoformat(), "end_date": (start + timedelta(days=5)).isoformat(),
              "total_slots": 1, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()["id"]
    assert client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": b_id}, headers=admin).status_code == 200
    b_headers = _login(client, b_phone)
    for slot in ("MORNING", "EVENING", "NIGHT"):
        client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", uuid.uuid4().bytes, "image/jpeg")}, data={"slot": slot}, headers=b_headers)
    photos = {p["slot"]: p for p in client.get(f"{API}/campaigns/{cid}/photos?status=PENDING", headers=admin).json()}

    def rewards():
        db_session.expire_all()
        return db_session.query(Payment).filter(Payment.rider_id == a["id"], Payment.category == "REFERRAL_REWARD").all()

    # Pending, partial (2/3) and rejected photos don't trigger the reward.
    client.post(f"{API}/campaigns/{cid}/photos/{photos['MORNING']['id']}/approve", headers=admin)
    client.post(f"{API}/campaigns/{cid}/photos/{photos['EVENING']['id']}/approve", headers=admin)
    client.post(f"{API}/campaigns/{cid}/photos/{photos['NIGHT']['id']}/reject", json={"reason": "Blurry"}, headers=admin)
    assert rewards() == []

    # Night retaken and approved → first Photo Streak → ₹30 to A (a real pending payment).
    client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", uuid.uuid4().bytes, "image/jpeg")}, data={"slot": "NIGHT"}, headers=b_headers)
    night = next(p for p in client.get(f"{API}/campaigns/{cid}/photos?status=PENDING", headers=admin).json() if p["slot"] == "NIGHT")
    client.post(f"{API}/campaigns/{cid}/photos/{night['id']}/approve", headers=admin)
    paid = rewards()
    assert len(paid) == 1 and paid[0].amount == 30 and paid[0].status == "PENDING"

    info = client.get(f"{API}/riders/me/referrals", headers=a_headers).json()
    assert info["successful_referrals"] == 1 and info["total_earnings"] == 30
    assert info["history"][0]["status"] == "REWARDED" and info["history"][0]["reward"] == 30
    a_earnings = client.get(f"{API}/riders/me/earnings", headers=a_headers).json()
    assert a_earnings["total_earnings"] == 30 and a_earnings["pending_earnings"] == 30 and a_earnings["referral_earnings"] == 30
    assert any(p["category"] == "REFERRAL_REWARD" and p["amount"] == 30 for p in client.get(f"{API}/payments?rider_id={a['id']}", headers=admin).json())

    # B earns the campaign day, not the referral reward.
    b_earnings = client.get(f"{API}/riders/me/earnings", headers=b_headers).json()
    assert b_earnings["referral_earnings"] == 0 and b_earnings["total_earnings"] == 10

    # The same day completing again (after a correction), or any later streak, never pays twice.
    client.post(f"{API}/campaigns/{cid}/photos/{night['id']}/reject", json={"reason": "Re-check"}, headers=admin)
    client.post(f"{API}/campaigns/{cid}/photos/{night['id']}/approve", headers=admin)
    referral = db_session.query(RiderReferral).filter(RiderReferral.referred_rider_id == b_id).one()
    assert referral_service.on_photo_day_completed(db_session, b_id, 999) is None
    assert len(rewards()) == 1 and referral.status == "REWARDED"


def test_cannot_refer_yourself_or_twice(client, db_session):
    admin, _ = make_admin(client, db_session)
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    code = client.get(f"{API}/riders/me/referrals", headers=_login(client, body["mobile_number"])).json()["code"]
    from app.models.all_models import Rider

    me = db_session.get(Rider, rider["id"])
    with pytest.raises(referral_service.ReferralError):
        referral_service.link_referral(db_session, me, me)
    assert code == referral_service.ensure_code(db_session, me)  # Stable code
