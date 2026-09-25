"""AUTO campaigns end to end, the customer (brand) dashboard, and brand search / access."""
import re
import uuid
from datetime import timedelta
from pathlib import Path

import pytest

from app.core.config import settings
from app.models.campaign_models import CampaignCategory, VehicleCategory
from app.services.campaign_service import today_ist
from tests.conftest import before_start
from tests.test_crud import make_admin
from tests.test_vehicle_terms import approved_rider

API = "/api/v1"
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _brand(client, admin, **extra):
    res = client.post(f"{API}/brands", json={"name": f"Cust {uuid.uuid4().hex[:6]}", **extra}, headers=admin)
    assert res.status_code == 200, res.text
    return res.json()


def _campaign(client, admin, brand_id, vehicles=None, start_offset=5, **extra):
    start = today_ist() + timedelta(days=start_offset)
    res = client.post(
        f"{API}/campaigns",
        json={"name": f"Auto Ads {uuid.uuid4().hex[:5]}", "brand_id": brand_id, "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 3, "daily_rate": 50, "visibility": "PUBLIC",
              **({"eligible_vehicle_categories": vehicles} if vehicles is not None else {}), **extra},
        headers=admin,
    )
    assert res.status_code == 200, res.text
    return res.json()


# --------------------------------------------------------------------------- AUTO campaigns

def test_auto_campaign_create_list_filter_and_detail(client, admin):
    brand = _brand(client, admin)
    auto = _campaign(client, admin, brand["id"], ["AUTO"], campaign_category="AUTO")
    bike = _campaign(client, admin, brand["id"], ["TWO_WHEELER"])
    everyone = _campaign(client, admin, brand["id"])

    # Created and shown correctly
    assert auto["eligible_vehicle_categories"] == ["AUTO"] and auto["eligible_vehicle_label"] == "Auto"
    assert auto["campaign_category"] == "AUTO" and auto["campaign_category_label"] == "Auto"
    detail = client.get(f"{API}/campaigns/{auto['id']}", headers=admin).json()
    assert detail["eligible_vehicle_categories"] == ["AUTO"]

    # In the full list
    ids = [c["id"] for c in client.get(f"{API}/campaigns", headers=admin).json()]
    assert {auto["id"], bike["id"], everyone["id"]} <= set(ids)

    # Vehicle filter: campaigns an Auto can join = Auto-only + open-to-all, never Bike-only
    for value in ("AUTO", "auto", "Auto"):
        shown = {c["id"] for c in client.get(f"{API}/campaigns", params={"vehicle": value}, headers=admin).json()}
        assert auto["id"] in shown and everyone["id"] in shown and bike["id"] not in shown
    assert client.get(f"{API}/campaigns", params={"vehicle": "TRUCK"}, headers=admin).status_code == 400

    # Category filter (case-insensitive)
    for value in ("AUTO", "auto"):
        shown = {c["id"] for c in client.get(f"{API}/campaigns", params={"category": value}, headers=admin).json()}
        assert shown == {auto["id"]} or (auto["id"] in shown and bike["id"] not in shown)


def test_auto_campaign_via_direct_api_accepts_any_spelling(client, admin):
    brand = _brand(client, admin)
    for spelling in (["auto"], ["Auto"], ["AUTO", "auto"], ["Auto rickshaw"]):
        assert _campaign(client, admin, brand["id"], spelling)["eligible_vehicle_categories"] == ["AUTO"]
    start = today_ist() + timedelta(days=5)
    bad = client.post(f"{API}/campaigns", json={"name": "Bad", "brand_id": brand["id"], "start_date": start.isoformat(),
                                                "end_date": (start + timedelta(days=2)).isoformat(), "total_slots": 1, "daily_rate": 1,
                                                "eligible_vehicle_categories": ["TRUCK"]}, headers=admin)
    assert bad.status_code == 422


def test_auto_rider_sees_joins_and_shows_in_admin(client, db_session, admin):
    brand = _brand(client, admin)
    auto_campaign = _campaign(client, admin, brand["id"], ["AUTO"], start_offset=0)
    rider, headers = approved_rider(client, admin, "AUTO")
    bike_rider, bike_headers = approved_rider(client, admin, "TWO_WHEELER")

    # The Auto rider sees it as joinable; the Bike rider is refused (card and direct API).
    with before_start(db_session, auto_campaign["id"]):
        mine = client.get(f"{API}/riders/me/campaigns", headers=headers).json()
        card = next(c for c in mine["available"] if c["id"] == auto_campaign["id"])
        assert card["can_join"] is True and card["eligible_vehicle_label"] == "Auto"
        bike_card = client.get(f"{API}/riders/me/campaigns/{auto_campaign['id']}", headers=bike_headers).json()
        assert bike_card["can_join"] is False and "only for Auto" in bike_card["join_blocked_reason"]
        refused = client.post(f"{API}/riders/me/campaigns/{auto_campaign['id']}/join", json={}, headers=bike_headers)
        assert refused.status_code == 400 and "only for Auto" in refused.json()["detail"]
        assert client.post(f"{API}/riders/me/campaigns/{auto_campaign['id']}/join", json={}, headers=headers).status_code == 200

        # Admin: the request shows the Auto rider, and the riders filter finds them.
        apps = client.get(f"{API}/campaigns/{auto_campaign['id']}/applications", headers=admin).json()
        assert apps[0]["rider"]["vehicle_category"] == "AUTO" and apps[0]["rider"]["vehicle_category_label"] == "Auto"
        requests = client.get(f"{API}/campaigns/join-requests", headers=admin).json()
        requests = requests if isinstance(requests, list) else requests.get("items", [])
        assert any(r["rider"]["vehicle_category"] == "AUTO" for r in requests)
        assert client.post(f"{API}/campaigns/{auto_campaign['id']}/applications/{apps[0]['id']}/approve", headers=admin).status_code == 200
    riders = client.get(f"{API}/admin/riders", params={"vehicle_category": "AUTO"}, headers=admin).json()
    riders = riders if isinstance(riders, list) else riders.get("items", [])
    assert rider["id"] in [r["id"] for r in riders] and bike_rider["id"] not in [r["id"] for r in riders]
    assigned = client.get(f"{API}/campaigns/{auto_campaign['id']}/riders", headers=admin).json()
    assert assigned[0]["rider"]["vehicle_category"] == "AUTO"


def _js_values(path: Path, name: str) -> list:
    """First element of each row in a `[['CODE', ...], ...]` constant in a JS file."""
    text = path.read_text()
    block = re.search(rf"{name}\s*=\s*\[(.*?)\n\];", text, re.S).group(1)
    return re.findall(r"\[\s*'([A-Z_]+)'", block)


def test_dashboard_and_app_lists_match_the_server():
    """Guards against a vehicle type or category being left out of a UI list again."""
    shared = ROOT / "frontend/src/components/CampaignShared.jsx"
    assert _js_values(shared, "VEHICLE_TYPES") == list(VehicleCategory.ALL)
    assert _js_values(shared, "CAMPAIGN_CATEGORIES") == list(CampaignCategory.ALL)
    assert _js_values(ROOT / "mobile/src/components/formFields.js", "VEHICLE_CATEGORIES") == list(VehicleCategory.ALL)


# --------------------------------------------------------------------------- customer dashboard

def test_customer_dashboard_uses_real_campaign_data(client, db_session, admin):
    brand = _brand(client, admin, contact_person="Asha Rao", contact_number="9811100000")
    auto = _campaign(client, admin, brand["id"], ["AUTO"], start_offset=0, campaign_category="AUTO", brand_contract_value=1000)
    other = _campaign(client, admin, brand["id"], ["CYCLE"], start_offset=10)
    rider, headers = approved_rider(client, admin, "AUTO")
    with before_start(db_session, auto["id"]):
        client.post(f"{API}/riders/me/campaigns/{auto['id']}/join", json={}, headers=headers)
    pending_rider, pending_headers = approved_rider(client, admin, "CYCLE")
    with before_start(db_session, other["id"]):
        client.post(f"{API}/riders/me/campaigns/{other['id']}/join", json={}, headers=pending_headers)
    app_id = client.get(f"{API}/campaigns/{auto['id']}/applications", headers=admin).json()[0]["id"]
    with before_start(db_session, auto["id"]):
        client.post(f"{API}/campaigns/{auto['id']}/applications/{app_id}/approve", headers=admin)
    client.post(f"{API}/campaigns/{auto['id']}/brand-payments", json={"kind": "RECEIVED", "amount": 400, "record_date": today_ist().isoformat(), "reference": "UTR1"}, headers=admin)
    client.post(f"{API}/riders/me/campaigns/{auto['id']}/activity", files={"photo": ("p.jpg", b"auto-morning", "image/jpeg")}, data={"slot": "MORNING"}, headers=headers)

    dash = client.get(f"{API}/brands/{brand['id']}/dashboard", headers=admin)
    assert dash.status_code == 200, dash.text
    d = dash.json()
    assert d["brand"]["contact_person"] == "Asha Rao"
    rows = {r["id"]: r for r in d["campaigns"]}
    assert set(rows) == {auto["id"], other["id"]}

    # Same numbers as the campaign's own fulfilment page (no second calculation).
    fulfil = client.get(f"{API}/campaigns/{auto['id']}/fulfillment", headers=admin).json()
    a = rows[auto["id"]]
    assert a["contracted_rider_days"] == fulfil["contracted_rider_days"]
    assert a["delivered_rider_days"] == fulfil["delivered_rider_days"]
    assert a["fulfillment_pct"] == fulfil["fulfillment_pct"]
    assert a["eligible_vehicle_label"] == "Auto" and a["campaign_category"] == "AUTO"
    assert a["assigned_riders"] == 1 and a["pending_photos"] == 1
    assert rows[other["id"]]["pending_requests"] == 1
    assert a["brand"]["contract_value"] == 1000 and a["brand"]["net_received"] == 400 and a["brand"]["outstanding"] == 600

    t = d["totals"]
    assert t["campaigns"] == 2 and t["pending_requests"] == 1 and t["pending_photos"] == 1
    assert t["contract_value"] == 1000 and t["received"] == 400
    assert any(p["type"] == "BRAND_RECEIVED" and p["amount"] == 400 and p["reference"] == "UTR1" for p in d["payments"])
    actions = {e["action"] for e in d["activity"]}
    assert {"BRAND_CREATED", "CAMPAIGN_CREATED", "CAMPAIGN_PUBLISHED"} <= actions

    # Filters apply to every section
    only_auto = client.get(f"{API}/brands/{brand['id']}/dashboard", params={"vehicle": "AUTO"}, headers=admin).json()
    assert [r["id"] for r in only_auto["campaigns"]] == [auto["id"]] and only_auto["filtered"] is True
    assert len(only_auto["campaign_options"]) == 2
    by_category = client.get(f"{API}/brands/{brand['id']}/dashboard", params={"category": "AUTO"}, headers=admin).json()
    assert [r["id"] for r in by_category["campaigns"]] == [auto["id"]]
    by_id = client.get(f"{API}/brands/{brand['id']}/dashboard", params={"campaign_id": other["id"]}, headers=admin).json()
    assert [r["id"] for r in by_id["campaigns"]] == [other["id"]] and by_id["payments"] == []
    later = client.get(f"{API}/brands/{brand['id']}/dashboard", params={"start_from": (today_ist() + timedelta(days=5)).isoformat()}, headers=admin).json()
    assert [r["id"] for r in later["campaigns"]] == [other["id"]]

    # Admin only
    assert client.get(f"{API}/brands/{brand['id']}/dashboard", headers=headers).status_code == 403
    assert client.get(f"{API}/brands/{brand['id']}/dashboard").status_code == 401
    assert client.get(f"{API}/brands/999999/dashboard", headers=admin).status_code == 404


def test_customer_search_and_brand_list_is_admin_only(client, admin):
    brand = _brand(client, admin, contact_person="Ravi Mehta", contact_number="9822233344")
    campaign = _campaign(client, admin, brand["id"])
    for term in (brand["name"][-6:], "ravi meh", "98222333", campaign["name"]):
        found = client.get(f"{API}/brands", params={"search": term}, headers=admin).json()
        assert brand["id"] in [b["id"] for b in found], term
    assert client.get(f"{API}/brands", params={"search": "zz-no-such-customer"}, headers=admin).json() == []
    # Customer contact details are never public.
    assert client.get(f"{API}/brands").status_code == 401
