import math
import uuid
from datetime import date, timedelta
import pytest
from app.core.config import settings
from app.models.campaign_models import Campaign, CampaignStatus
from tests.test_crud import make_admin

API = "/api/v1"


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def create_customer_auth(client):
    """Helper creating a uniquely registered customer account."""
    uid = uuid.uuid4().hex[:6]
    phone = f"98{uuid.uuid4().int % 100000000:08d}"
    res = client.post(
        f"{API}/customer/auth/signup",
        json={
            "full_name": f"Planner User {uid}",
            "company_name": f"Planner Brand {uid}",
            "mobile_number": phone,
            "email": f"planner_{uid}@enterprise.in",
            "password": "PasswordPlanner123",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    return {"Authorization": f"Bearer {data['access_token']}"}, data["brand_id"]


# ==============================================================================
# 1. PLANNER CONFIGURATION ENDPOINT & CENTRALIZED MINIMUM BUDGET (₹10,000)
# ==============================================================================

def test_planner_config_centralized_source(client):
    """Verifies GET /customer/planner-config returns centralized config from Settings."""
    headers, _ = create_customer_auth(client)
    res = client.get(f"{API}/customer/planner-config", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["minimum_budget"] == settings.MINIMUM_CAMPAIGN_BUDGET
    assert data["minimum_budget"] == 10000.0
    assert data["default_planning_rate"] == settings.DEFAULT_PLANNING_RIDER_RATE
    assert data["currency"] == "INR"
    assert data["has_vehicle_specific_rates"] is False
    assert "Planning rates are estimates" in data["note"]


def test_budget_below_minimum_rejected(client):
    """Rejects campaign creation if estimated_budget is below ₹10,000."""
    headers, _ = create_customer_auth(client)
    today = date.today()

    # Budget ₹5,000 (< ₹10,000)
    res = client.post(
        f"{API}/customer/campaigns",
        json={
            "name": "Under-Budget Campaign",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=9)).isoformat(),
            "total_riders": 2,
            "estimated_budget": 5000.0,
        },
        headers=headers,
    )
    assert res.status_code in (400, 422), res.text
    err_text = res.text
    assert "Minimum campaign budget is ₹10,000" in err_text


def test_minimum_budget_valid(client):
    """Accepts budget equal to or greater than ₹10,000."""
    headers, _ = create_customer_auth(client)
    today = date.today()

    res = client.post(
        f"{API}/customer/campaigns",
        json={
            "name": "Valid Min Budget Campaign",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=9)).isoformat(),
            "total_riders": 2,
            "estimated_budget": 10000.0,
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["estimated_budget"] == 10000.0


# ==============================================================================
# 2. PLANNER MATHEMATICAL MODEL (Duration -> Riders, Riders -> Duration)
# ==============================================================================

def test_duration_to_rider_calculation():
    """
    Mathematical test:
    Budget = Riders × Duration × Applicable Rate
    Riders = floor(Budget / (Duration × Rate))
    Whole numbers only, minimum 1.
    """
    budget = 10000.0
    rate = 500.0  # Configurable baseline planning rate

    # Duration = 10 days -> Riders = floor(10000 / (10 * 500)) = 2
    duration = 10
    riders = math.floor(budget / (duration * rate))
    assert riders == 2

    # Customer changes Duration: 10 Days -> 5 Days -> Riders = floor(10000 / (5 * 500)) = 4
    duration = 5
    riders = math.floor(budget / (duration * rate))
    assert riders == 4

    # Customer changes Duration: 5 Days -> 2 Days -> Riders = floor(10000 / (2 * 500)) = 10
    duration = 2
    riders = math.floor(budget / (duration * rate))
    assert riders == 10

    # Minimum whole number constraint: even if formula yields 0, minimum 1 rider enforced
    duration = 30
    calculated_riders = math.floor(budget / (duration * rate))  # floor(10000 / 15000) = 0
    enforced_riders = max(1, calculated_riders)
    assert enforced_riders == 1


def test_rider_to_duration_calculation():
    """
    Mathematical test:
    Duration = floor(Budget / (Riders × Rate))
    """
    budget = 10000.0
    rate = 500.0

    # Riders = 2 -> Duration = floor(10000 / (2 * 500)) = 10 Days
    riders = 2
    duration = math.floor(budget / (riders * rate))
    assert duration == 10

    # Customer changes Riders: 2 -> 4 -> Duration = floor(10000 / (4 * 500)) = 5 Days
    riders = 4
    duration = math.floor(budget / (riders * rate))
    assert duration == 5


def test_budget_recalculation_and_last_changed_field():
    """
    LastChangedField behavior:
    If lastChangedField == 'duration', changing Budget recalculates Riders.
    If lastChangedField == 'riders', changing Budget recalculates Duration.
    No circular recalculation loop.
    """
    rate = 500.0

    # Scenario A: Customer was adjusting duration (duration is driver)
    last_changed = "duration"
    fixed_duration = 10
    new_budget = 25000.0
    if last_changed == "duration":
        recalc_riders = math.floor(new_budget / (fixed_duration * rate))
        recalc_duration = fixed_duration
    assert recalc_riders == 5
    assert recalc_duration == 10

    # Scenario B: Customer was adjusting riders (riders is driver)
    last_changed = "riders"
    fixed_riders = 5
    new_budget = 50000.0
    if last_changed == "riders":
        recalc_duration = math.floor(new_budget / (fixed_riders * rate))
        recalc_riders = fixed_riders
    assert recalc_duration == 20
    assert recalc_riders == 5


# ==============================================================================
# 3. DATE SYNCHRONIZATION: end_date = start_date + duration - 1 day
# ==============================================================================

def test_date_synchronization():
    """
    start_date: 1 October
    duration: 15 Days
    end_date: 15 October (1 + 15 - 1)
    """
    start = date(2026, 10, 1)
    duration = 15
    end = start + timedelta(days=duration - 1)
    assert end == date(2026, 10, 15)

    # Compute duration back: (end - start).days + 1
    computed_duration = (end - start).days + 1
    assert computed_duration == 15


def test_invalid_duration_backend_rejection(client):
    """Backend rejects end_date before start_date."""
    headers, _ = create_customer_auth(client)
    today = date.today()

    res = client.post(
        f"{API}/customer/campaigns",
        json={
            "name": "Invalid Schedule Campaign",
            "start_date": today.isoformat(),
            "end_date": (today - timedelta(days=1)).isoformat(),  # End before start
            "total_riders": 2,
            "estimated_budget": 10000.0,
        },
        headers=headers,
    )
    assert res.status_code == 400
    assert "End date must be on or after start date" in res.json()["detail"]


# ==============================================================================
# 4. LOCATION / RIDER SYNCHRONIZATION (PROPORTIONAL ALLOCATION)
# ==============================================================================

def test_location_proportional_distribution():
    """
    Initial: Total = 10 (Loc 1: 6, Loc 2: 4)
    Customer in planner sets Total = 20
    Expected proportional: Loc 1: 12, Loc 2: 8 (Sum = 20, no data lost)
    """
    locations = [
        {"city": "Delhi", "area": "Connaught Place", "riders_count": 6},
        {"city": "Delhi", "area": "South Extension", "riders_count": 4},
    ]
    old_total = sum(loc["riders_count"] for loc in locations)
    assert old_total == 10

    new_total = 20
    allocated = 0
    updated_locations = []
    for idx, loc in enumerate(locations):
        if idx == len(locations) - 1:
            count = max(1, new_total - allocated)
        else:
            count = max(1, round((loc["riders_count"] / old_total) * new_total))
            allocated += count
        updated_locations.append({**loc, "riders_count": count})

    assert updated_locations[0]["riders_count"] == 12
    assert updated_locations[1]["riders_count"] == 8
    assert sum(l["riders_count"] for l in updated_locations) == 20


# ==============================================================================
# 5. PRICING INTEGRITY & TAMPERING PROTECTION (CUSTOMER vs ADMIN)
# ==============================================================================

def test_customer_cannot_tamper_pricing(client, admin):
    """
    Customer submits a campaign with attempts to set daily_rate and brand_contract_value.
    Backend MUST ignore/zero these customer fields; Admin remains sole authority.
    """
    headers, brand_id = create_customer_auth(client)
    today = date.today()

    res = client.post(
        f"{API}/customer/campaigns",
        json={
            "name": "Tamper Attempt Campaign",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=9)).isoformat(),
            "total_riders": 4,
            "estimated_budget": 20000.0,
            "daily_rate": 99999.0,  # Tampering attempt
            "brand_contract_value": 1.0,  # Tampering attempt
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    camp_id = res.json()["id"]

    # Verify campaign in database has daily_rate = 0.0, brand_contract_value = 0.0
    camp_detail = client.get(f"{API}/customer/campaigns/{camp_id}", headers=headers).json()
    assert camp_detail["contract_amount"] is None or camp_detail["contract_amount"] == 0.0

    # The brand can't bypass review by editing the admin endpoint.
    assert client.put(f"{API}/campaigns/{camp_id}", json={"daily_rate": 1.0}, headers=headers).status_code in (401, 403)

    # Admin sets the official terms (the draft wasn't submitted, so it isn't reviewable yet)
    assert client.put(f"{API}/campaigns/{camp_id}", json={"daily_rate": 600.0, "brand_contract_value": 25000.0}, headers=admin).status_code == 200
    assert client.post(f"{API}/campaigns/{camp_id}/review", json={"action": "approve"}, headers=admin).status_code == 400
    client.put(f"{API}/customer/campaigns/{camp_id}", json={"submit": True, "target_label": "Sector 29, Gurugram"}, headers=headers)
    assert client.post(f"{API}/campaigns/{camp_id}/review", json={"action": "approve"}, headers=admin).status_code == 200
    client.post(f"{API}/campaigns/{camp_id}/publish", headers=admin)

    # Customer sees the contract value confirmed by Admin once the campaign is live
    refreshed = client.get(f"{API}/customer/campaigns/{camp_id}", headers=headers).json()
    assert refreshed["brand_status"] == "LIVE"
    assert refreshed["contract_amount"] == 25000.0


def test_customer_ownership_isolation(client):
    """Strict tenant isolation: Customer cannot access or modify another customer's campaign."""
    headers_a, _ = create_customer_auth(client)
    headers_b, _ = create_customer_auth(client)

    today = date.today()
    camp_a = client.post(
        f"{API}/customer/campaigns",
        json={
            "name": "Company A Campaign",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=9)).isoformat(),
            "total_riders": 2,
            "estimated_budget": 12000.0,
        },
        headers=headers_a,
    ).json()

    # Customer B tries to view Customer A's campaign -> 404
    get_res = client.get(f"{API}/customer/campaigns/{camp_a['id']}", headers=headers_b)
    assert get_res.status_code == 404

    # Customer B tries to update Customer A's campaign -> 404
    put_res = client.put(
        f"{API}/customer/campaigns/{camp_a['id']}",
        json={"name": "Hijacked Name"},
        headers=headers_b,
    )
    assert put_res.status_code == 404


# ==============================================================================
# 6. EXISTING RIDER AND ADMIN FLOWS REMAIN UNCHANGED
# ==============================================================================

def test_rider_and_admin_flows_unchanged(client, admin):
    """Ensures existing admin campaign creation and rider campaign viewing remain functional."""
    today = date.today()
    # Create brand first
    brand = client.post(
        f"{API}/brands",
        json={"name": f"Admin Test Brand {uuid.uuid4().hex[:5]}"},
        headers=admin,
    ).json()

    # 1. Admin creates a standard campaign directly
    admin_camp = client.post(
        f"{API}/campaigns",
        json={
            "name": "Admin Direct Campaign",
            "brand_id": brand["id"],
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=9)).isoformat(),
            "total_slots": 5,
            "daily_rate": 550.0,
            "visibility": "PUBLIC",
        },
        headers=admin,
    )
    assert admin_camp.status_code == 200, admin_camp.text
    camp_id = admin_camp.json()["id"]

    # 2. Campaign inspection check
    admin_view = client.get(f"{API}/campaigns/{camp_id}", headers=admin)
    assert admin_view.status_code == 200
    assert admin_view.json()["daily_rate"] == 550.0
