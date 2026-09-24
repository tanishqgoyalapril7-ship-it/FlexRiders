from datetime import datetime, timedelta

import pytest

from app.core.config import settings
from app.core.security import UserRole, get_password_hash
from app.models.all_models import Brand, Rider, RiderStatus, User
from app.models.campaign_models import CampaignAssignment, CampaignDailyActivity
from app.services.campaign_service import today_ist

API = "/api/v1"


@pytest.fixture
def admin_headers(client, db_session):
    if not db_session.query(User).filter(User.phone == "+919999000077").first():
        db_session.add(
            User(
                phone="+919999000077",
                email="campaignadmin@superriders.com",
                hashed_password=get_password_hash("adminPass123"),
                role=UserRole.SUPER_ADMIN,
                is_active=True,
            )
        )
        db_session.commit()
    token = client.post(f"{API}/auth/login", json={"phone": "+919999000077", "password": "adminPass123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def brand_id(db_session):
    brand = db_session.query(Brand).filter(Brand.code == "camp_brand").first()
    if not brand:
        brand = Brand(name="Campaign Brand", code="camp_brand", is_active=True)
        db_session.add(brand)
        db_session.commit()
    return brand.id


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def make_rider(client, db_session, phone, status=RiderStatus.APPROVED):
    res = client.post(f"{API}/auth/register", json={"full_name": f"Rider {phone[-4:]}", "mobile_number": phone, "password": "riderPass1"})
    assert res.status_code == 200
    rider = db_session.query(Rider).filter(Rider.mobile_number == phone).first()
    rider.status = status
    db_session.commit()
    return rider, {"Authorization": f"Bearer {res.json()['access_token']}"}


def create_campaign(client, headers, brand_id, slots=2, start_offset=0, visibility="PUBLIC", rate=10):
    start = today_ist() + timedelta(days=start_offset)
    res = client.post(
        f"{API}/campaigns",
        json={
            "name": f"Test Campaign {datetime.utcnow().timestamp()}",
            "brand_id": brand_id,
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=29)).isoformat(),
            "total_slots": slots,
            "daily_rate": rate,
            "rules": "Upload a photo every day\nWear the brand T-shirt",
            "visibility": visibility,
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    return res.json()


def join_and_approve(client, admin_headers, campaign_id, rider_headers):
    assert client.post(f"{API}/riders/me/campaigns/{campaign_id}/join", headers=rider_headers).status_code == 200
    apps = client.get(f"{API}/campaigns/{campaign_id}/applications?status=REQUESTED", headers=admin_headers).json()
    res = client.post(f"{API}/campaigns/{campaign_id}/applications/{apps[0]['id']}/approve", headers=admin_headers)
    assert res.status_code == 200, res.text
    return res.json()


def test_draft_is_hidden_until_published(client, db_session, admin_headers, brand_id):
    campaign = create_campaign(client, admin_headers, brand_id, visibility="DRAFT")
    assert campaign["status"] == "DRAFT"
    _, rider_headers = make_rider(client, db_session, "9100000001")
    available = client.get(f"{API}/riders/me/campaigns", headers=rider_headers).json()["available"]
    assert campaign["id"] not in [c["id"] for c in available]

    published = client.post(f"{API}/campaigns/{campaign['id']}/publish", headers=admin_headers).json()
    assert published["status"] == "ACTIVE"  # starts today
    available = client.get(f"{API}/riders/me/campaigns", headers=rider_headers).json()["available"]
    assert campaign["id"] in [c["id"] for c in available]


def test_requests_do_not_consume_slots_and_full_blocks_joining(client, db_session, admin_headers, brand_id):
    campaign = create_campaign(client, admin_headers, brand_id, slots=1)
    _, first = make_rider(client, db_session, "9100000002")
    _, second = make_rider(client, db_session, "9100000003")

    client.post(f"{API}/riders/me/campaigns/{campaign['id']}/join", headers=first)
    client.post(f"{API}/riders/me/campaigns/{campaign['id']}/join", headers=second)
    detail = client.get(f"{API}/campaigns/{campaign['id']}", headers=admin_headers).json()
    assert detail["stats"]["requested_riders"] == 2
    assert detail["stats"]["assigned_riders"] == 0

    apps = client.get(f"{API}/campaigns/{campaign['id']}/applications?status=REQUESTED", headers=admin_headers).json()
    detail = client.post(f"{API}/campaigns/{campaign['id']}/applications/{apps[0]['id']}/approve", headers=admin_headers).json()
    assert detail["status"] == "FULL"
    assert detail["stats"]["remaining_slots"] == 0

    res = client.post(f"{API}/campaigns/{campaign['id']}/applications/{apps[1]['id']}/approve", headers=admin_headers)
    assert res.status_code == 400
    assert "slots" in res.json()["detail"]


def test_rider_can_only_be_in_one_active_campaign(client, db_session, admin_headers, brand_id):
    first = create_campaign(client, admin_headers, brand_id)
    second = create_campaign(client, admin_headers, brand_id)
    _, rider_headers = make_rider(client, db_session, "9100000004")
    join_and_approve(client, admin_headers, first["id"], rider_headers)

    data = client.get(f"{API}/riders/me/campaigns", headers=rider_headers).json()
    assert data["active"]["id"] == first["id"]
    other = next(c for c in data["available"] if c["id"] == second["id"])
    assert other["can_join"] is False
    assert other["join_blocked_reason"] == "You are already assigned to an active campaign."
    assert client.post(f"{API}/riders/me/campaigns/{second['id']}/join", headers=rider_headers).status_code == 400

    # Removal frees the rider and the slot, and keeps history.
    rows = client.get(f"{API}/campaigns/{first['id']}/riders", headers=admin_headers).json()
    detail = client.post(f"{API}/campaigns/{first['id']}/riders/{rows[0]['assignment_id']}/remove", json={"reason": "Test"}, headers=admin_headers).json()
    assert detail["stats"]["remaining_slots"] == 2
    data = client.get(f"{API}/riders/me/campaigns", headers=rider_headers).json()
    assert data["active"] is None
    assert data["history"][0]["my_status"] == "REMOVED"
    assert client.post(f"{API}/riders/me/campaigns/{second['id']}/join", headers=rider_headers).status_code == 200


def test_unapproved_rider_cannot_join(client, db_session, admin_headers, brand_id):
    campaign = create_campaign(client, admin_headers, brand_id)
    _, rider_headers = make_rider(client, db_session, "9100000005", status=RiderStatus.PENDING)
    res = client.post(f"{API}/riders/me/campaigns/{campaign['id']}/join", headers=rider_headers)
    assert res.status_code == 400
    assert "approved" in res.json()["detail"]


def test_payout_counts_only_approved_days(client, db_session, admin_headers, brand_id):
    campaign = create_campaign(client, admin_headers, brand_id, start_offset=-4, rate=10)
    rider, rider_headers = make_rider(client, db_session, "9100000006")
    join_and_approve(client, admin_headers, campaign["id"], rider_headers)

    # Backdate the assignment so the rider has 5 eligible days (4 past days + today).
    assignment = db_session.query(CampaignAssignment).filter(CampaignAssignment.rider_id == rider.id).first()
    assignment.assigned_at = datetime.utcnow() - timedelta(days=4)
    for offset in (4, 3, 1):  # day 3 (offset 2) has no proof at all
        db_session.add(
            CampaignDailyActivity(
                campaign_id=campaign["id"],
                rider_id=rider.id,
                assignment_id=assignment.id,
                activity_date=today_ist() - timedelta(days=offset),
                photo_url="/uploads/x.jpg",
            )
        )
    db_session.commit()

    # Today's 3 proof photos through the real upload endpoint.
    for n in range(3):
        res = client.post(
            f"{API}/riders/me/campaigns/{campaign['id']}/activity",
            files={"photo": ("proof.jpg", f"fake-jpeg-bytes-{n}".encode(), "image/jpeg")},
            headers=rider_headers,
        )
        assert res.status_code == 200, res.text
    assert res.json()["photos_pending"] == 3

    photos = client.get(f"{API}/campaigns/{campaign['id']}/photos?status=PENDING", headers=admin_headers).json()
    assert len(photos) == 6  # 3 older single-photo days + today's 3 photos
    by_date = {p["date"]: p["activity_id"] for p in photos}
    day = lambda offset: (today_ist() - timedelta(days=offset)).isoformat()
    for offset in (4, 3, 0):
        client.post(f"{API}/campaigns/{campaign['id']}/activities/{by_date[day(offset)]}/approve", headers=admin_headers)
    client.post(f"{API}/campaigns/{campaign['id']}/activities/{by_date[day(1)]}/reject", json={"reason": "Blurry"}, headers=admin_headers)

    activity = client.get(f"{API}/campaigns/{campaign['id']}/riders/{assignment.id}/activity", headers=admin_headers).json()
    assert activity["completed_days"] == 3
    assert activity["missed_days"] == 2  # one missing, one rejected
    assert activity["earned"] == 30  # 3 approved days × ₹10
    assert activity["current_streak"] == 1  # today only; yesterday was rejected
    assert activity["longest_streak"] == 2
    assert [d["status"] for d in activity["days"]] == ["COMPLETED", "COMPLETED", "MISSED", "REJECTED", "COMPLETED"]

    # A rejected day can still be approved later.
    client.post(f"{API}/campaigns/{campaign['id']}/activities/{by_date[day(1)]}/approve", headers=admin_headers)
    payouts = client.get(f"{API}/campaigns/{campaign['id']}/payouts", headers=admin_headers).json()
    assert payouts[0]["total_amount"] == 40
    assert payouts[0]["eligible_days"] == 4

    # Pay through the existing payments ledger.
    pay_id = payouts[0]["id"]
    assert client.post(f"{API}/campaigns/{campaign['id']}/payouts/{pay_id}/pay", headers=admin_headers).status_code == 400
    client.post(f"{API}/campaigns/{campaign['id']}/payouts/{pay_id}/approve", headers=admin_headers)
    paid = client.post(f"{API}/campaigns/{campaign['id']}/payouts/{pay_id}/pay", headers=admin_headers).json()
    assert paid["status"] == "PAID" and paid["paid_amount"] == 40 and paid["pending_amount"] == 0
    ledger = client.get(f"{API}/payments?rider_id={rider.id}", headers=admin_headers).json()
    assert ledger[0]["amount"] == 40 and ledger[0]["status"] == "PAID"


def test_completion_keeps_history_and_frees_rider(client, db_session, admin_headers, brand_id):
    campaign = create_campaign(client, admin_headers, brand_id)
    _, rider_headers = make_rider(client, db_session, "9100000007")
    join_and_approve(client, admin_headers, campaign["id"], rider_headers)

    done = client.post(f"{API}/campaigns/{campaign['id']}/complete", headers=admin_headers).json()
    assert done["status"] == "COMPLETED"
    assert done["stats"]["completed_riders"] == 1
    data = client.get(f"{API}/riders/me/campaigns", headers=rider_headers).json()
    assert data["active"] is None
    assert data["history"][0]["my_status"] == "COMPLETED"
    assert client.post(f"{API}/campaigns/{campaign['id']}/pause", headers=admin_headers).status_code == 400

    export = client.get(f"{API}/campaigns/{campaign['id']}/export", headers=admin_headers)
    assert export.status_code == 200 and "Rider ID" in export.text
