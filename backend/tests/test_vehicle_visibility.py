"""Vehicle eligibility decides what riders can SEE (list and direct links), not only what they can join."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.services.campaign_service import today_ist
from tests.conftest import before_start
from tests.test_crud import make_admin
from tests.test_vehicle_terms import approved_rider

API = "/api/v1"
TYPES = ["CYCLE", "TWO_WHEELER", "AUTO", "THREE_WHEELER"]


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _campaign(client, admin, brand_id, vehicles, start_offset=3):
    start = today_ist() + timedelta(days=start_offset)
    res = client.post(f"{API}/campaigns", json={
        "name": f"Veh {'+'.join(vehicles) or 'ALL'} {uuid.uuid4().hex[:4]}", "brand_id": brand_id, "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 3, "daily_rate": 10, "visibility": "PUBLIC",
        "eligible_vehicle_categories": vehicles}, headers=admin)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def catalogue(client, admin):
    brand = client.post(f"{API}/brands", json={"name": f"Veh Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    only = {t: _campaign(client, admin, brand["id"], [t]) for t in TYPES}
    mixed = _campaign(client, admin, brand["id"], ["AUTO", "TWO_WHEELER"])
    everyone = _campaign(client, admin, brand["id"], [])
    return {"only": only, "mixed": mixed, "everyone": everyone}


@pytest.mark.parametrize("vehicle", TYPES)
def test_each_vehicle_sees_only_eligible_campaigns(client, admin, catalogue, vehicle):
    _, headers = approved_rider(client, admin, vehicle)
    listed = {c["id"] for c in client.get(f"{API}/riders/me/campaigns", headers=headers).json()["available"]}
    own = catalogue["only"][vehicle]["id"]
    others = [c["id"] for t, c in catalogue["only"].items() if t != vehicle]
    assert own in listed and catalogue["everyone"]["id"] in listed
    assert not set(others) & listed
    assert (catalogue["mixed"]["id"] in listed) == (vehicle in ("AUTO", "TWO_WHEELER"))

    # Direct link: own opens; someone else's type is refused without details.
    assert client.get(f"{API}/riders/me/campaigns/{own}", headers=headers).status_code == 200
    for cid in others:
        res = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers)
        assert res.status_code == 404 and res.json() == {"detail": "This campaign is not available for your vehicle."}
        # Join by id is refused as well.
        assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json={}, headers=headers).status_code == 400
        assert client.post(f"{API}/riders/me/campaigns/{cid}/terms/accept", json={"version": 1}, headers=headers).status_code == 404
    assert client.post(f"{API}/riders/me/campaigns/{own}/join", json={}, headers=headers).status_code == 200


def test_multi_vehicle_campaign_join_rules(client, admin, catalogue):
    mixed = catalogue["mixed"]["id"]
    for vehicle, allowed in (("AUTO", True), ("TWO_WHEELER", True), ("CYCLE", False), ("THREE_WHEELER", False)):
        _, headers = approved_rider(client, admin, vehicle)
        res = client.post(f"{API}/riders/me/campaigns/{mixed}/join", json={}, headers=headers)
        assert (res.status_code == 200) is allowed, (vehicle, res.text)


def test_live_campaign_stays_closed_even_for_eligible_riders(client, db_session, admin):
    brand = client.post(f"{API}/brands", json={"name": f"Live {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    live = _campaign(client, admin, brand["id"], ["AUTO"], start_offset=0)
    _, headers = approved_rider(client, admin, "AUTO")
    assert live["id"] not in {c["id"] for c in client.get(f"{API}/riders/me/campaigns", headers=headers).json()["available"]}
    res = client.post(f"{API}/riders/me/campaigns/{live['id']}/join", json={}, headers=headers)
    assert res.status_code == 400 and "already started" in res.json()["detail"]


def test_admin_sees_all_and_public_page_unaffected(client, admin, catalogue):
    all_ids = {c["id"] for c in client.get(f"{API}/campaigns", headers=admin).json()}
    expected = {c["id"] for c in catalogue["only"].values()} | {catalogue["mixed"]["id"], catalogue["everyone"]["id"]}
    assert expected <= all_ids
    detail = client.get(f"{API}/campaigns/{catalogue['only']['CYCLE']['id']}", headers=admin).json()
    assert detail["eligible_vehicle_categories"] == ["CYCLE"]
    # The public share page follows its own rules (no rider, so no vehicle filter).
    cid = catalogue["only"]["THREE_WHEELER"]["id"]
    slug = client.post(f"{API}/campaigns/{cid}/share", json={"enabled": True}, headers=admin).json()["slug"]
    assert client.get(f"{API}/public/campaigns/{slug}").status_code == 200


def test_a_rider_keeps_seeing_their_own_campaign(client, db_session, admin):
    """If an admin later narrows eligibility, riders already in the campaign still see it."""
    brand = client.post(f"{API}/brands", json={"name": f"Own {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    c = _campaign(client, admin, brand["id"], ["AUTO"])
    _, headers = approved_rider(client, admin, "AUTO")
    assert client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers).status_code == 200
    client.put(f"{API}/campaigns/{c['id']}", json={"eligible_vehicle_categories": ["CYCLE"]}, headers=admin)
    assert client.get(f"{API}/riders/me/campaigns/{c['id']}", headers=headers).status_code == 200
    assert client.get(f"{API}/riders/me/campaigns", headers=headers).json()["pending_request"]["id"] == c["id"]
