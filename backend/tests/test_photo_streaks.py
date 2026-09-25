"""Photo Streaks: 3 distinct approved photos on one date = 1 completed Photo Streak day = 1 delivered rider-day."""
import uuid
from datetime import datetime, timedelta

import pytest

from app.core.config import settings
from app.core.security import UserRole, get_password_hash
from app.models.all_models import Brand, Rider, RiderStatus, User
from app.models.campaign_models import (
    ActivityChangeLog,
    ActivityStatus,
    CampaignActivityPhoto,
    CampaignDailyActivity,
    FinancialAdjustment,
    PhotoStatus,
)
from app.services import campaign_service as svc
from app.services import fulfillment_service as fs
from app.services.campaign_service import today_ist
from tests.test_fulfillment import add_rider, admin, day, make_campaign  # noqa: F401  (admin is a fixture)

from tests.conftest import SELFIE, before_start

API = "/api/v1"


def add_photo_day(db, assignment, d, statuses=("APPROVED",) * 3, hashes=None):
    """A rider-day with one photo per status; the day's status is derived from the photos."""
    activity = CampaignDailyActivity(
        campaign_id=assignment.campaign_id, rider_id=assignment.rider_id, assignment_id=assignment.id, activity_date=d
    )
    db.add(activity)
    db.flush()
    hashes = hashes or [uuid.uuid4().hex for _ in statuses]
    for status, h in zip(statuses, hashes):
        activity.photos.append(
            CampaignActivityPhoto(
                campaign_id=assignment.campaign_id, rider_id=assignment.rider_id,
                photo_url=f"/uploads/{h}.jpg", content_hash=h, status=status,
            )
        )
    svc.derive_day_status(activity)
    db.commit()
    return activity


def test_three_valid_photos_complete_one_day(db_session, admin):
    campaign = make_campaign(db_session, riders=1, days=5)
    rider = add_rider(db_session, campaign)
    activity = add_photo_day(db_session, rider, day(1), statuses=("PENDING",) * 3)
    assert activity.status == ActivityStatus.SUBMITTED

    photos = list(activity.photos)
    svc.review_photo(db_session, photos[0], admin, approve=True)
    svc.review_photo(db_session, photos[1], admin, approve=True)
    assert activity.status == ActivityStatus.SUBMITTED  # 2/3 valid, 1 still pending
    assert fs.campaign_fulfillment(db_session, campaign, today=day(2))["delivered_rider_days"] == 0

    svc.review_photo(db_session, photos[2], admin, approve=True)
    assert activity.status == ActivityStatus.COMPLETED and activity.photo_status == PhotoStatus.APPROVED
    assert fs.campaign_fulfillment(db_session, campaign, today=day(2))["delivered_rider_days"] == 1
    assert rider.payout.total_amount == 10


def test_duplicates_and_extra_photos_never_add_days(db_session):
    campaign = make_campaign(db_session, riders=1, days=5)
    rider = add_rider(db_session, campaign)
    # 3 approved photos but two are the same image → only 2 valid → incomplete.
    dup = add_photo_day(db_session, rider, day(1), hashes=["a", "a", "b"])
    assert svc.photo_counts(dup)["valid"] == 2 and dup.status == ActivityStatus.INCOMPLETE
    # 5 distinct approved photos → still exactly one completed day.
    extra = add_photo_day(db_session, rider, day(2), statuses=("APPROVED",) * 5)
    assert extra.status == ActivityStatus.COMPLETED

    f = fs.campaign_fulfillment(db_session, campaign, today=day(3))
    assert f["delivered_rider_days"] == 1
    progress = svc.rider_progress(rider, today=day(3))
    assert progress["completed_days"] == 1 and progress["missed_days"] == 1


def test_pending_and_rejected_photos_do_not_count(db_session, admin):
    campaign = make_campaign(db_session, riders=1, days=5)
    rider = add_rider(db_session, campaign)
    activity = add_photo_day(db_session, rider, day(1), statuses=("APPROVED", "APPROVED", "PENDING"))
    assert activity.status == ActivityStatus.SUBMITTED

    pending = [p for p in activity.photos if p.status == PhotoStatus.PENDING][0]
    svc.review_photo(db_session, pending, admin, approve=False, reason="Brand logo not visible")
    assert activity.status == ActivityStatus.INCOMPLETE and activity.photo_status == PhotoStatus.PARTIAL
    assert fs.campaign_fulfillment(db_session, campaign, today=day(2))["delivered_rider_days"] == 0
    perf = fs.rider_performance(campaign, rider, day(2))
    assert perf["approved_days_so_far"] == 0 and perf["elapsed_eligible_days"] == 1


def test_streak_sequence_from_spec(db_session):
    """Days 1-3 complete, day 4 missed, days 5-6 complete."""
    campaign = make_campaign(db_session, riders=1, days=10)
    rider = add_rider(db_session, campaign)
    for n in (1, 2, 3, 5, 6):
        add_photo_day(db_session, rider, day(n))

    p = svc.rider_progress(rider, today=day(7))
    assert p["current_streak"] == 2
    assert p["longest_streak"] == 3
    assert p["total_photo_streak_days"] == 5 and p["completed_days"] == 5
    assert p["missed_days"] == 1
    assert p["streak_broken"] is False
    assert p["today_photos"]["valid"] == 0 and p["today_photos"]["required"] == 3
    assert p["target_days"] == 10 and p["remaining_target_days"] == 5
    assert p["completion_pct"] == pytest.approx(83.3)  # 5 of 6 closed days


def test_missed_day_breaks_streak_and_today_stays_open(db_session):
    """5-day example: days 1-3 complete, day 4 missed, day 5 (today) has 1 of 3 photos so far."""
    campaign = make_campaign(db_session, riders=1, days=5)
    rider = add_rider(db_session, campaign)
    for n in (1, 2, 3):
        add_photo_day(db_session, rider, day(n))
    add_photo_day(db_session, rider, day(5), statuses=("APPROVED",))

    p = svc.rider_progress(rider, today=day(5))
    assert p["current_streak"] == 0 and p["longest_streak"] == 3
    assert p["streak_broken"] is True and p["streak_broken_on"] == day(4).isoformat()
    assert p["today_photos"]["valid"] == 1 and p["today_photos"]["completed"] is False
    assert p["missed_days"] == 1  # today isn't counted as missed while it is still open

    # Two more photos approved today → the streak restarts at 1.
    today = [a for a in rider.activities if a.activity_date == day(5)][0]
    for h in ("x", "y"):
        today.photos.append(CampaignActivityPhoto(campaign_id=campaign.id, rider_id=rider.rider_id, photo_url=f"/{h}", content_hash=h, status="APPROVED"))
    svc.derive_day_status(today)
    db_session.commit()
    p = svc.rider_progress(rider, today=day(5))
    assert p["current_streak"] == 1 and p["streak_broken"] is False


def test_streak_uses_photo_date_not_approval_time(db_session, admin):
    campaign = make_campaign(db_session, riders=1, days=5)
    rider = add_rider(db_session, campaign)
    d1 = add_photo_day(db_session, rider, day(1), statuses=("PENDING",) * 3)
    d2 = add_photo_day(db_session, rider, day(2), statuses=("PENDING",) * 3)
    svc.review_activity(db_session, d2, admin, approve=True)  # Day 2 reviewed first
    svc.review_activity(db_session, d1, admin, approve=True)
    p = svc.rider_progress(rider, today=day(3))
    assert p["current_streak"] == 2 and p["longest_streak"] == 2
    assert [d["status"] for d in p["days"]][:2] == ["COMPLETED", "COMPLETED"]


def test_awaiting_review_does_not_break_current_streak(db_session):
    campaign = make_campaign(db_session, riders=1, days=5)
    rider = add_rider(db_session, campaign)
    add_photo_day(db_session, rider, day(1))
    add_photo_day(db_session, rider, day(2), statuses=("APPROVED", "PENDING", "PENDING"))
    p = svc.rider_progress(rider, today=day(3))
    assert p["current_streak"] == 1 and p["streak_broken"] is False


def test_rejecting_approved_photo_recalculates_and_records_overpayment(db_session, admin):
    campaign = make_campaign(db_session, riders=1, days=5)
    rider = add_rider(db_session, campaign)
    add_photo_day(db_session, rider, day(1))
    d2 = add_photo_day(db_session, rider, day(2))
    fs.recalculate_campaign_payouts(db_session, campaign)
    rider.payout.status = "APPROVED"
    db_session.commit()
    svc.pay_payout(db_session, rider.payout, admin)  # ₹20 paid

    photo = d2.photos[0]
    with pytest.raises(svc.CampaignError):
        svc.review_photo(db_session, photo, admin, approve=False)  # reason required
    svc.review_photo(db_session, photo, admin, approve=False, reason="Photo reused from yesterday")

    assert d2.status == ActivityStatus.INCOMPLETE
    db_session.refresh(rider.payout)
    assert rider.payout.total_amount == 10 and rider.payout.paid_amount == 20
    adjustment = db_session.query(FinancialAdjustment).filter(FinancialAdjustment.assignment_id == rider.id).one()
    assert adjustment.amount == 10 and adjustment.status == "OPEN"
    log = db_session.query(ActivityChangeLog).filter(ActivityChangeLog.activity_id == d2.id).all()
    assert any(l.old_status == "COMPLETED" and l.new_status == "INCOMPLETE" and "Photo reused" in l.reason for l in log)
    assert svc.rider_progress(rider, today=day(3))["current_streak"] == 0


def test_campaign_shortfall_from_photo_streaks(db_session):
    """10 riders × 10 days = 100 rider-days; riders complete 85 photo-days → 15 short."""
    campaign = make_campaign(db_session, riders=10, days=10)
    for i in range(10):
        rider = add_rider(db_session, campaign)
        for n in range(1, 9 if i < 5 else 10):  # 5 riders × 8 days + 5 riders × 9 days = 85
            add_photo_day(db_session, rider, day(n))
    f = fs.campaign_fulfillment(db_session, campaign, today=day(11))
    assert f["contracted_rider_days"] == 100
    assert f["delivered_rider_days"] == 85
    assert f["remaining_rider_days"] == 15
    assert f["fulfillment_pct"] == 85.0
    assert f["photos_per_day"] == 3

    # With 5 days left and no projected capacity, replacements = ceil(15 / 5) = 3 (not one per missed day).
    plan = fs.recovery_plan(15, 5, 0, None, "NO_DATA")
    assert plan["projected_shortfall"] == 15 and plan["replacement_riders_needed"] == 3


# ---------------------------------------------------------------------------
# Upload API
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def test_photo_upload_api(client, db_session):
    if not db_session.query(User).filter(User.phone == "+919999000077").first():
        db_session.add(User(phone="+919999000077", email="streak@admin.test", hashed_password=get_password_hash("adminPass123"), role=UserRole.SUPER_ADMIN))
        db_session.commit()
    admin_headers = {"Authorization": "Bearer " + client.post(f"{API}/auth/login", json={"phone": "+919999000077", "password": "adminPass123"}).json()["access_token"]}
    brand = Brand(name="Streak Brand", code="streak_brand", is_active=True)
    db_session.add(brand)
    db_session.commit()
    start = today_ist()
    cid = client.post(
        f"{API}/campaigns",
        json={"name": "Streak Campaign", "brand_id": brand.id, "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 1, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin_headers,
    ).json()["id"]
    reg = client.post(f"{API}/auth/register", json={"selfie": SELFIE, "vehicle_category": "CYCLE", "full_name": "Streak Rider", "mobile_number": "9100000077", "password": "riderPass1"}).json()
    rider_headers = {"Authorization": f"Bearer {reg['access_token']}"}
    rider = db_session.query(Rider).filter(Rider.mobile_number == "9100000077").first()
    rider.status = RiderStatus.APPROVED
    db_session.commit()
    with before_start(db_session, cid):  # Riders join before a campaign goes live
        client.post(f"{API}/riders/me/campaigns/{cid}/join", headers=rider_headers)
        app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin_headers).json()[0]["id"]
        client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin_headers)

    upload = lambda data: client.post(
        f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", data, "image/jpeg")}, headers=rider_headers
    )
    assert upload(b"photo-1").json()["photos_uploaded"] == 1
    dup = upload(b"photo-1")
    assert dup.status_code == 400 and "already been uploaded" in dup.json()["detail"]
    upload(b"photo-2")
    assert upload(b"photo-3").json()["photos_pending"] == 3
    assert upload(b"photo-4").status_code == 400  # 3 awaiting review: no more today

    photos = client.get(f"{API}/campaigns/{cid}/photos?status=PENDING", headers=admin_headers).json()
    assert len(photos) == 3
    client.post(f"{API}/campaigns/{cid}/photos/{photos[0]['id']}/reject", json={"reason": "Blurry"}, headers=admin_headers)
    for p in photos[1:]:
        client.post(f"{API}/campaigns/{cid}/photos/{p['id']}/approve", headers=admin_headers)

    detail = client.get(f"{API}/riders/me/campaigns/{cid}", headers=rider_headers).json()
    progress = detail["progress"]
    assert progress["today_photos"]["valid"] == 2 and progress["can_submit_today"] is True
    assert upload(b"photo-5").status_code == 200  # A rejected photo can be replaced
    last = [p for p in client.get(f"{API}/campaigns/{cid}/photos?status=PENDING", headers=admin_headers).json()][0]
    done = client.post(f"{API}/campaigns/{cid}/photos/{last['id']}/approve", headers=admin_headers).json()
    assert done["day_status"] == "COMPLETED" and done["day_valid"] == 3

    rows = client.get(f"{API}/campaigns/{cid}/riders", headers=admin_headers).json()
    assert rows[0]["today_photos"]["completed"] is True and rows[0]["current_streak"] == 1
    assert rows[0]["rider_status"] == "ACTIVE"
    assert upload(b"photo-6").status_code == 400  # Day complete
    assert client.get(f"{API}/campaigns/{cid}/fulfillment", headers=admin_headers).json()["delivered_rider_days"] == 1
