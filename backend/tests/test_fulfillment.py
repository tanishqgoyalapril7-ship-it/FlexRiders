"""Campaign fulfilment: the worked examples from the business spec, computed with a fixed `today`."""
import json
import uuid
from datetime import date, datetime, timedelta

import pytest

from app.core.security import UserRole
from app.models.all_models import Brand, Rider, RiderStatus, User
from app.models.campaign_models import (
    ActivityChangeLog,
    ActivityStatus,
    AssignmentStatus,
    Campaign,
    CampaignAssignment,
    CampaignDailyActivity,
    CampaignExtension,
    CampaignFulfillmentSnapshot,
    CampaignPayout,
    CampaignStatus,
    CampaignVisibility,
    FinancialAdjustment,
    PhotoStatus,
    BrandPaymentRecord,
)
from app.services import campaign_service as svc
from app.services import fulfillment_service as fs

D0 = date(2026, 9, 1)  # Campaign start used throughout


# ---------------------------------------------------------------------------
# Helpers that build campaign data directly, so each example is exact
# ---------------------------------------------------------------------------

@pytest.fixture
def admin(db_session):
    user = User(phone=f"+91{uuid.uuid4().int % 10**10:010d}", email=f"{uuid.uuid4().hex[:8]}@admin.test", role=UserRole.SUPER_ADMIN)
    db_session.add(user)
    db_session.commit()
    return user


def make_campaign(db, riders, days, rate=10.0, start=D0, **extra):
    brand = Brand(name=f"Brand {uuid.uuid4().hex[:6]}", code=uuid.uuid4().hex[:8], is_active=True)
    db.add(brand)
    db.flush()
    campaign = Campaign(
        name=f"Fulfilment {uuid.uuid4().hex[:6]}",
        brand_id=brand.id,
        start_date=start,
        end_date=start + timedelta(days=days - 1),
        total_slots=riders,
        daily_rate=rate,
        status=CampaignStatus.ACTIVE,
        visibility=CampaignVisibility.PUBLIC,
        contracted_rider_days=riders * days,
        **extra,
    )
    db.add(campaign)
    db.commit()
    return campaign


def add_rider(db, campaign, joined=None, status=AssignmentStatus.ACTIVE):
    user = User(phone=f"+91{uuid.uuid4().int % 10**10:010d}", role=UserRole.RIDER)
    db.add(user)
    db.flush()
    rider = Rider(user_id=user.id, rider_id=f"T-{uuid.uuid4().hex[:10]}", full_name="Test Rider", mobile_number="9000000000", status=RiderStatus.ACTIVE)
    db.add(rider)
    db.flush()
    joined = joined or campaign.start_date
    assignment = CampaignAssignment(
        campaign_id=campaign.id,
        rider_id=rider.id,
        status=status,
        daily_rate=campaign.daily_rate,
        assigned_at=datetime.combine(joined, datetime.min.time()),  # midnight UTC = same IST date
    )
    db.add(assignment)
    db.flush()
    db.add(CampaignPayout(campaign_id=campaign.id, rider_id=rider.id, assignment_id=assignment.id, daily_rate=campaign.daily_rate))
    db.commit()
    return assignment


def add_days(db, assignment, dates, approved=True):
    for i, d in enumerate(dates):
        db.add(
            CampaignDailyActivity(
                campaign_id=assignment.campaign_id,
                rider_id=assignment.rider_id,
                assignment_id=assignment.id,
                activity_date=d,
                status=ActivityStatus.COMPLETED if approved else ActivityStatus.SUBMITTED,
                photo_status=PhotoStatus.APPROVED if approved else PhotoStatus.PENDING,
                photo_url="/uploads/x.jpg",
                approved_at=datetime(2026, 9, 1) + timedelta(minutes=i) if approved else None,
            )
        )
    db.commit()


def day(n):
    """Campaign day n (1-based) as a date."""
    return D0 + timedelta(days=n - 1)


def first_days(n, offset=1):
    return [day(offset + i) for i in range(n)]


# ---------------------------------------------------------------------------
# Pure formulas
# ---------------------------------------------------------------------------

def test_recovery_plan_spec_example():
    # Remaining 55, 10 days left, 5 active riders, 80% attendance.
    plan = fs.recovery_plan(55, 10, 5, 0.8, "NORMAL")
    assert plan["projected_capacity"] == 40  # 5 × 10 × 80%
    assert plan["projected_shortfall"] == 15  # 55 − 40
    assert plan["replacement_riders_needed"] == 2  # ceil(15 / 10)
    assert plan["preliminary"] is False


def test_extension_estimate_after_end():
    # 30 rider-days short after the end date, 3 riders available at 100%.
    plan = fs.recovery_plan(30, 0, 3, 1.0, "NORMAL")
    assert plan["replacement_riders_needed"] is None  # period over: recover by extension
    assert plan["estimated_extension_days"] == 10  # ceil(30 / 3)


def test_low_sample_is_preliminary_and_assumes_full_attendance():
    assert fs.data_quality(0, 0) == "NO_DATA"
    assert fs.data_quality(2, 50) == "LOW_SAMPLE"
    assert fs.data_quality(5, 19) == "LOW_SAMPLE"
    assert fs.data_quality(3, 20) == "NORMAL"
    plan = fs.recovery_plan(55, 10, 5, 0.2, "LOW_SAMPLE")
    assert plan["preliminary"] is True and plan["attendance_rate_used"] == 1.0
    assert plan["projected_shortfall"] == 5  # 55 − 50, not an alarmist figure from 20% attendance


# ---------------------------------------------------------------------------
# Delivered vs contracted
# ---------------------------------------------------------------------------

def test_300_contracted_245_delivered(db_session):
    campaign = make_campaign(db_session, riders=10, days=30)
    for delivered in [30, 30, 25, 22, 20, 18, 30, 27, 15, 28]:
        add_days(db_session, add_rider(db_session, campaign), first_days(delivered))

    f = fs.campaign_fulfillment(db_session, campaign, today=day(31))
    assert f["contracted_rider_days"] == 300
    assert f["delivered_rider_days"] == 245
    assert f["remaining_rider_days"] == 55
    assert f["fulfillment_pct"] == 81.67
    assert f["expected_to_date"] == 300 and f["variance"] == -55
    assert f["surplus_rider_days"] == 0
    assert f["recovery"]["replacement_riders_needed"] is None  # contract period is over
    assert f["recovery"]["estimated_extension_days"] > 0  # a recommendation only


def test_pace_status_thresholds(db_session):
    # 2 riders × 10 days; on day 6, expected to date = 2 × 5 = 10.
    for delivered, expected_status in [(10, "ON_TRACK"), (9, "AT_RISK"), (7, "BEHIND_TARGET")]:
        campaign = make_campaign(db_session, riders=2, days=10)
        a, b = add_rider(db_session, campaign), add_rider(db_session, campaign)
        add_days(db_session, a, first_days(5))
        add_days(db_session, b, first_days(delivered - 5))
        f = fs.campaign_fulfillment(db_session, campaign, today=day(6))
        assert f["expected_to_date"] == 10 and f["actual_to_date"] == delivered
        assert f["delivery_status"] == expected_status, (delivered, f["delivery_status"])


def test_replacement_rider_counts_toward_same_commitment(db_session):
    campaign = make_campaign(db_session, riders=1, days=30)
    original = add_rider(db_session, campaign)
    add_days(db_session, original, first_days(15))
    original.status = AssignmentStatus.REMOVED
    original.ended_at = datetime.combine(day(15), datetime.min.time())
    replacement = add_rider(db_session, campaign, joined=day(16))
    replacement.replacement_for_assignment_id = original.id
    db_session.commit()
    add_days(db_session, replacement, first_days(15, offset=16))

    f = fs.campaign_fulfillment(db_session, campaign, today=day(31))
    assert f["contracted_rider_days"] == 30  # unchanged by the replacement
    assert f["delivered_rider_days"] == 30 and f["fulfilled"] and f["fulfillment_pct"] == 100
    assert fs.rider_performance(campaign, replacement, day(31))["target_days"] == 15


def test_extension_recovers_shortfall_without_surplus(db_session):
    campaign = make_campaign(db_session, riders=10, days=30)
    riders = [add_rider(db_session, campaign) for _ in range(10)]
    for r in riders[:9]:
        add_days(db_session, r, first_days(30))  # 270 delivered in the contract period
    db_session.add(CampaignExtension(campaign_id=campaign.id, start_date=day(31), end_date=day(35), reason="Recover shortfall", rider_day_target=30))
    db_session.commit()
    db_session.refresh(campaign)
    for r in riders[:6]:
        add_days(db_session, r, first_days(5, offset=31))  # 30 delivered in the extension

    f = fs.campaign_fulfillment(db_session, campaign, today=day(36))
    assert f["contracted_rider_days"] == 300
    assert f["delivered_original_period"] == 270 and f["delivered_extension_period"] == 30
    assert f["delivered_rider_days"] == 300 and f["surplus_rider_days"] == 0
    assert f["fulfillment_pct"] == 100 and f["delivery_status"] == "FULFILLED"


def test_surplus_is_unpaid_by_default_and_capped_at_100(db_session):
    campaign = make_campaign(db_session, riders=2, days=5, continue_after_fulfillment=True)  # C = 10
    db_session.add(CampaignExtension(campaign_id=campaign.id, start_date=day(6), end_date=day(6), reason="Extra day", rider_day_target=0))
    db_session.commit()
    db_session.refresh(campaign)
    a, b = add_rider(db_session, campaign), add_rider(db_session, campaign)
    add_days(db_session, a, first_days(6))
    add_days(db_session, b, first_days(6))  # 12 delivered

    fs.recalculate_campaign_payouts(db_session, campaign)
    f = fs.campaign_fulfillment(db_session, campaign, today=day(7))
    assert f["delivered_rider_days"] == 12 and f["surplus_rider_days"] == 2
    assert f["fulfillment_pct"] == 100
    assert f["rider_payout"]["earned"] == 100  # only the 10 contract days × ₹10
    day6 = [x for x in a.activities + b.activities if x.activity_date == day(6)]
    assert all(x.earned_amount == 0 for x in day6)  # date order: the latest days are surplus

    campaign.allow_payout_beyond_contract = True
    db_session.commit()
    fs.recalculate_campaign_payouts(db_session, campaign)
    assert fs.campaign_fulfillment(db_session, campaign, today=day(7))["rider_payout"]["earned"] == 120


def test_paid_days_are_never_moved_to_surplus(db_session, admin):
    campaign = make_campaign(db_session, riders=1, days=3, continue_after_fulfillment=True)  # C = 3
    db_session.add(CampaignExtension(campaign_id=campaign.id, start_date=day(4), end_date=day(4), reason="Extra", rider_day_target=1))
    db_session.commit()
    db_session.refresh(campaign)
    rider = add_rider(db_session, campaign)
    add_days(db_session, rider, [day(2), day(3), day(4)])
    fs.recalculate_campaign_payouts(db_session, campaign)
    rider.payout.status = "APPROVED"
    db_session.commit()
    svc.pay_payout(db_session, rider.payout, admin)  # ₹30 paid; days 2–4 locked

    # Day 1 is approved late. By date it would be a contract day, but days 2–4 are already paid.
    add_days(db_session, rider, [day(1)])
    fs.recalculate_campaign_payouts(db_session, campaign)
    earned = {x.activity_date: x.earned_amount for x in rider.activities}
    assert earned == {day(1): 0.0, day(2): 10.0, day(3): 10.0, day(4): 10.0}
    assert db_session.query(FinancialAdjustment).filter(FinancialAdjustment.assignment_id == rider.id).count() == 0


def test_target_reached_stops_uploads_unless_configured(db_session):
    campaign = make_campaign(db_session, riders=1, days=2)
    add_days(db_session, add_rider(db_session, campaign), first_days(2))
    assert svc.target_reached(db_session, campaign) is True
    campaign.continue_after_fulfillment = True
    db_session.commit()
    assert svc.target_reached(db_session, campaign) is False


# ---------------------------------------------------------------------------
# Excused days, corrections, brand money, closure
# ---------------------------------------------------------------------------

def test_excused_day_not_delivered_not_paid_not_penalised(db_session, admin):
    campaign = make_campaign(db_session, riders=1, days=10)
    rider = add_rider(db_session, campaign)
    add_days(db_session, rider, [day(1), day(2), day(4), day(5)])
    add_days(db_session, rider, [day(3)], approved=False)
    activity = [x for x in rider.activities if x.activity_date == day(3)][0]
    activity.status, activity.photo_status, activity.excuse_reason = ActivityStatus.EXCUSED, PhotoStatus.NONE, "Medical"
    db_session.commit()
    fs.recalculate_campaign_payouts(db_session, campaign)

    f = fs.campaign_fulfillment(db_session, campaign, today=day(6))
    perf = fs.rider_performance(campaign, rider, day(6))
    assert f["delivered_rider_days"] == 4 and f["excused_rider_days"] == 1
    assert perf["elapsed_eligible_days"] == 4 and perf["excused_days"] == 1
    assert perf["behind_target"] is False  # 4 of 4 non-excused days
    assert rider.payout.total_amount == 40


def test_correction_after_payment_records_overpayment(db_session, admin):
    campaign = make_campaign(db_session, riders=1, days=10)
    rider = add_rider(db_session, campaign)
    add_days(db_session, rider, first_days(3))
    fs.recalculate_campaign_payouts(db_session, campaign)
    rider.payout.status = "APPROVED"
    db_session.commit()
    svc.pay_payout(db_session, rider.payout, admin)  # ₹30 paid

    day2 = [x for x in rider.activities if x.activity_date == day(2)][0]
    with pytest.raises(svc.CampaignError):
        svc.review_activity(db_session, day2, admin, approve=False)  # reason required
    svc.review_activity(db_session, day2, admin, approve=False, reason="Photo was reused from another day")

    db_session.refresh(rider.payout)
    assert rider.payout.total_amount == 20 and rider.payout.paid_amount == 30
    adjustment = db_session.query(FinancialAdjustment).filter(FinancialAdjustment.assignment_id == rider.id).one()
    assert adjustment.amount == 10 and adjustment.status == "OPEN"  # nothing deducted automatically
    log = db_session.query(ActivityChangeLog).filter(ActivityChangeLog.activity_id == day2.id).all()
    assert any(l.old_status == "COMPLETED" and l.new_status == "REJECTED" and l.changed_by_id == admin.id for l in log)


def test_brand_money_is_independent_of_delivery(db_session):
    campaign = make_campaign(db_session, riders=10, days=30, brand_contract_value=4500)
    for _ in range(9):
        add_days(db_session, add_rider(db_session, campaign), first_days(30))  # 270 of 300
    db_session.add(BrandPaymentRecord(campaign_id=campaign.id, kind="RECEIVED", amount=4500, record_date=day(1)))
    db_session.commit()

    f = fs.campaign_fulfillment(db_session, campaign, today=day(31))
    assert f["fulfillment_pct"] == 90
    assert f["brand"]["contract_value"] == 4500 and f["brand"]["outstanding"] == 0
    assert f["brand"]["payment_status"] == "PAID"  # a shortfall never changes billing
    assert f["rider_payout"]["planned_budget"] == 3000
    assert f["platform"]["potential_margin"] == 1500


def test_closing_snapshot_is_immutable(db_session, admin):
    campaign = make_campaign(db_session, riders=2, days=5, start=date.today() - timedelta(days=10))
    a = add_rider(db_session, campaign)
    add_days(db_session, a, [campaign.start_date + timedelta(days=i) for i in range(5)])
    svc.complete_campaign(db_session, campaign, admin)

    snapshot = db_session.query(CampaignFulfillmentSnapshot).filter(CampaignFulfillmentSnapshot.campaign_id == campaign.id).one()
    data = json.loads(snapshot.data)
    assert data["contracted_rider_days"] == 10 and data["delivered_rider_days"] == 5
    assert data["final_status"] == "COMPLETED_WITH_SHORTFALL"

    # A later correction changes live figures but never the snapshot.
    first = a.activities[0]
    svc.review_activity(db_session, first, admin, approve=False, reason="Audit correction")
    fs.create_snapshot(db_session, campaign)
    db_session.refresh(snapshot)
    assert json.loads(snapshot.data) == data
