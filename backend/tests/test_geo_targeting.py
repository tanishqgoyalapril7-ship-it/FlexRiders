"""Geo-targeted campaigns: radius expansion, rider matching (current location + working areas), slot
reservation, the brand request → approval → live flow, brand isolation and the public page."""
import uuid
from datetime import datetime, timedelta

import httpx
import pytest

from app.models.all_models import Rider, RiderStatus
from app.models.campaign_models import Campaign, CampaignActivityPhoto
from app.services import geo_service as geo
from app.services.campaign_service import today_ist
from tests.test_campaigns import admin_headers, brand_id, make_rider, uploads_dir  # noqa: F401  (fixtures)

API = "/api/v1"
TARGET = (28.4400, 77.1000)


def km_north(point, km):
    """A point `km` due north of `point` (1° latitude ≈ 111.2 km)."""
    return point[0] + km / 111.2, point[1]


def geo_campaign(client, headers, brand_id, slots=3, initial=2.0, maximum=5.0, step=1.0, interval=60, start_offset=2):
    start = today_ist() + timedelta(days=start_offset)
    res = client.post(
        f"{API}/campaigns",
        json={
            "name": f"Geo Campaign {uuid.uuid4().hex[:6]}", "brand_id": brand_id,
            "start_date": start.isoformat(), "end_date": (start + timedelta(days=9)).isoformat(),
            "total_slots": slots, "daily_rate": 450, "location_area": "Target Area",
            "target_lat": TARGET[0], "target_lng": TARGET[1], "initial_radius_km": initial, "max_radius_km": maximum,
            "expansion_step_km": step, "expansion_interval_min": interval, "visibility": "PUBLIC",
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    return res.json()


def listed(client, headers, point=None):
    params = {"lat": point[0], "lng": point[1]} if point else {}
    return client.get(f"{API}/riders/me/campaigns", params=params, headers=headers).json()


# ---------------------------------------------------------------------------
# Engine units
# ---------------------------------------------------------------------------

def test_haversine_and_bounding_box():
    assert geo.haversine_km(TARGET, km_north(TARGET, 3)) == pytest.approx(3.0, abs=0.02)
    min_lat, max_lat, min_lng, max_lng = geo.bounding_box(*TARGET, 2)
    assert min_lat < TARGET[0] < max_lat and min_lng < TARGET[1] < max_lng
    assert geo.path_length_km([TARGET, km_north(TARGET, 1), km_north(TARGET, 2)]) == pytest.approx(2.0, abs=0.02)
    assert not geo.valid_coords(0, 0) and not geo.valid_coords(None, 77) and geo.valid_coords(*TARGET)


def test_radius_expands_on_interval_until_max_and_stops_when_full_or_paused():
    c = Campaign(target_lat=TARGET[0], target_lng=TARGET[1], initial_radius_km=2, max_radius_km=4,
                 expansion_step_km=1, expansion_interval_min=60)
    t0 = datetime(2026, 10, 1, 9, 0)
    geo.start_expansion_clock(c, t0)
    assert geo.current_radius(c) == 2
    assert geo.advance_radius(c, 5, True, t0 + timedelta(minutes=59)) is None
    assert geo.advance_radius(c, 5, True, t0 + timedelta(minutes=61)) == (2, 3)
    assert geo.advance_radius(c, 0, True, t0 + timedelta(minutes=200)) is None  # Full: no expansion
    c.expansion_paused = True
    assert geo.advance_radius(c, 5, True, t0 + timedelta(minutes=400)) is None  # Paused
    c.expansion_paused = False
    assert geo.advance_radius(c, 5, True, t0 + timedelta(minutes=459)) is None  # A fresh interval after the pause
    assert geo.advance_radius(c, 5, True, t0 + timedelta(minutes=700)) == (3, 4)  # Capped at the maximum
    assert geo.advance_radius(c, 5, True, t0 + timedelta(minutes=2000)) is None
    assert geo.expansion_state(c, 5, True)["mode"] == "AT_MAX"


def test_match_tiers_prefer_location_plus_working_area():
    c = Campaign(target_lat=TARGET[0], target_lng=TARGET[1], initial_radius_km=2, current_radius_km=4, max_radius_km=8)
    near, far = km_north(TARGET, 1), km_north(TARGET, 3)
    home = [{"label": "Near area", "lat": near[0], "lng": near[1]}]
    other = [{"label": "Far area", "lat": km_north(TARGET, 20)[0], "lng": TARGET[1]}]
    assert geo.rider_match(c, near, home)["tier"] == 1  # Rider A: 1 km away + working area matches
    assert geo.rider_match(c, near, other)["tier"] == 2  # Rider B: 1 km away, working area elsewhere (not blocked)
    assert geo.rider_match(c, km_north(TARGET, 30), home)["tier"] == 3  # Far away now, but works there
    assert geo.rider_match(c, far, [])["tier"] == 4  # Only reached because the radius expanded
    assert geo.rider_match(c, km_north(TARGET, 6), [])["in_reach"] is False
    missing = geo.rider_match(c, None, [])
    assert missing["in_reach"] is False and "Location permission" in missing["reason"]
    untargeted = geo.rider_match(Campaign(), None, [])
    assert untargeted["targeted"] is False and untargeted["in_reach"] is True


# ---------------------------------------------------------------------------
# Rider discovery through the API
# ---------------------------------------------------------------------------

def test_rider_sees_campaign_only_in_reach_and_after_expansion(client, db_session, admin_headers, brand_id):
    campaign = geo_campaign(client, admin_headers, brand_id)
    _, near = make_rider(client, db_session, "9300000001")
    _, far = make_rider(client, db_session, "9300000002")
    _, nowhere = make_rider(client, db_session, "9300000003")

    card = next(c for c in listed(client, near, km_north(TARGET, 1))["available"] if c["id"] == campaign["id"])
    assert card["can_join"] and card["distance_km"] == pytest.approx(1.0, abs=0.05)
    assert card["code"] == f"CMP-{campaign['id']:06d}" and card["remaining_slots"] == 3
    assert card["target"]["radius_km"] == 2 and "_tier" not in card and "tier" not in card
    assert campaign["id"] not in [c["id"] for c in listed(client, far, km_north(TARGET, 3))["available"]]
    none = listed(client, nowhere)
    assert campaign["id"] not in [c["id"] for c in none["available"]] and "Location permission" in none["location_message"]
    # Joining out of reach is refused by the server, whatever the app shows.
    res = client.post(f"{API}/riders/me/campaigns/{campaign['id']}/join", json={"lat": km_north(TARGET, 3)[0], "lng": TARGET[1]}, headers=far)
    assert res.status_code == 400 and "outside your area" in res.json()["detail"]

    # An interval passes with slots still open: the radius grows and the far rider is reached.
    row = db_session.get(Campaign, campaign["id"])
    row.radius_updated_at = datetime.utcnow() - timedelta(minutes=61)
    db_session.commit()
    detail = client.get(f"{API}/campaigns/{campaign['id']}", headers=admin_headers).json()
    assert detail["geo"]["current_radius_km"] == 3 and detail["geo"]["expansion_mode"] == "AUTOMATIC"
    assert campaign["id"] in [c["id"] for c in listed(client, far, km_north(TARGET, 3))["available"]]


def test_working_areas_max_three_and_prioritise(client, db_session, admin_headers, brand_id):
    near_area = km_north(TARGET, 0.5)
    first = geo_campaign(client, admin_headers, brand_id)
    # A second campaign whose target is 1 km south: the rider is equally close to both.
    second = geo_campaign(client, admin_headers, brand_id)
    db_session.get(Campaign, second["id"]).target_lat = TARGET[0] - 2 / 111.2
    db_session.commit()
    _, headers = make_rider(client, db_session, "9300000004")
    areas = [{"label": f"Area {i}", "lat": near_area[0], "lng": near_area[1] + i * 0.001} for i in range(4)]
    assert client.put(f"{API}/riders/me/working-areas", json={"areas": areas}, headers=headers).status_code == 422
    res = client.put(f"{API}/riders/me/working-areas", json={"areas": areas[:1]}, headers=headers)
    assert res.status_code == 200 and res.json()["areas"][0]["label"] == "Area 0"
    # Standing 1 km south of `first` (1 km north of `second`): `first` matches the working area, so it's first.
    here = km_north(TARGET, -1)
    ids = [c["id"] for c in listed(client, headers, here)["available"]]
    assert ids.index(first["id"]) < ids.index(second["id"])
    card = next(c for c in listed(client, headers, here)["available"] if c["id"] == first["id"])
    assert card["in_my_area"] and card["my_area_label"] == "Area 0"


def test_registration_takes_working_areas_not_a_travel_radius(client, db_session):
    from tests.conftest import SELFIE

    res = client.post(f"{API}/auth/register", json={
        "selfie": SELFIE, "vehicle_category": "CYCLE", "accept_terms": True, "full_name": "Area Rider",
        "mobile_number": "9300000005", "password": "riderPass1",
        "working_areas": [{"label": "Sector 54, Gurugram", "lat": TARGET[0], "lng": TARGET[1]}],
    })
    assert res.status_code == 200, res.text
    rider = db_session.query(Rider).filter(Rider.mobile_number == "9300000005").first()
    assert [a.label for a in rider.working_areas] == ["Sector 54, Gurugram"] and rider.primary_area == "Sector 54, Gurugram"


def test_slot_freed_by_withdrawal_notifies_riders_in_reach(client, db_session, admin_headers, brand_id):
    campaign = geo_campaign(client, admin_headers, brand_id, slots=1)
    _, a = make_rider(client, db_session, "9300000006")
    _, b = make_rider(client, db_session, "9300000007")
    here = km_north(TARGET, 0.5)
    listed(client, b, here)  # b's location is now known to the server
    assert client.post(f"{API}/riders/me/campaigns/{campaign['id']}/join", json={"lat": here[0], "lng": here[1]}, headers=a).status_code == 200
    card = next(c for c in listed(client, b, here)["available"] if c["id"] == campaign["id"])
    assert card["remaining_slots"] == 0 and not card["can_join"]
    client.post(f"{API}/riders/me/campaigns/{campaign['id']}/withdraw", headers=a)
    notes = client.get(f"{API}/notifications", headers=b).json()
    assert any("1 slot is now available" in n["message"] for n in notes)


# ---------------------------------------------------------------------------
# Admin geo controls
# ---------------------------------------------------------------------------

def test_admin_geo_controls_and_matching(client, db_session, admin_headers, brand_id):
    campaign = geo_campaign(client, admin_headers, brand_id)
    rider, rider_headers = make_rider(client, db_session, "9300000008")
    listed(client, rider_headers, km_north(TARGET, 1))
    url = f"{API}/campaigns/{campaign['id']}/geo"
    assert client.post(url, json={"action": "expand"}, headers=admin_headers).json()["current_radius_km"] == 3
    assert client.post(url, json={"action": "pause"}, headers=admin_headers).json()["expansion_mode"] == "PAUSED"
    assert client.post(url, json={"action": "resume"}, headers=admin_headers).json()["expansion_mode"] == "AUTOMATIC"
    assert client.post(url, json={"action": "set", "radius_km": 9}, headers=admin_headers).status_code == 400  # Above max
    assert client.post(url, json={"action": "set", "radius_km": 2.5}, headers=admin_headers).json()["current_radius_km"] == 2.5
    matching = client.get(f"{API}/campaigns/{campaign['id']}/matching", headers=admin_headers).json()
    row = next(r for r in matching["riders"] if r["rider"]["id"] == rider.id)
    assert row["tier"] == 2 and row["distance_km"] == pytest.approx(1.0, abs=0.05) and row["can_join"]
    # Riders can't use admin geo controls or see matching.
    assert client.post(url, json={"action": "expand"}, headers=rider_headers).status_code == 403
    assert client.get(f"{API}/campaigns/{campaign['id']}/matching", headers=rider_headers).status_code == 403


def test_geo_search_uses_real_geocoder_results(client, monkeypatch):
    geo._cache.clear()
    calls = []

    def fake_get(url, params=None, headers=None, timeout=None):
        calls.append(params["q"])
        return httpx.Response(200, json=[{"lat": "28.44", "lon": "77.10", "display_name": "Sector 54, Gurugram, Haryana, India",
                                          "address": {"suburb": "Sector 54", "city": "Gurugram"}}], request=httpx.Request("GET", url))

    monkeypatch.setattr(geo.httpx, "get", fake_get)
    monkeypatch.setattr(geo.time_mod, "sleep", lambda s: None)
    res = client.get(f"{API}/geo/search", params={"q": "sector 54 gurugram"}).json()
    assert res == [{"label": "Sector 54, Gurugram", "description": "Sector 54, Gurugram, Haryana, India", "lat": 28.44, "lng": 77.10}]
    client.get(f"{API}/geo/search", params={"q": "sector 54 gurugram"})
    assert calls == ["sector 54 gurugram"]  # Cached

    def down(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(geo.httpx, "get", down)
    assert client.get(f"{API}/geo/search", params={"q": "cyber city"}).status_code == 503  # No made-up results


# ---------------------------------------------------------------------------
# Brand request → approval → live, isolation and public page
# ---------------------------------------------------------------------------

def brand_login(client, name):
    res = client.post(f"{API}/customer/auth/signup", json={
        "full_name": f"{name} Owner", "company_name": name, "mobile_number": f"97{uuid.uuid4().int % 10**8:08d}",
        "email": f"{uuid.uuid4().hex[:8]}@brand.in", "password": "BrandPass123",
    })
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_brand_request_approval_live_monitoring_and_isolation(client, db_session, admin_headers):
    abc = brand_login(client, f"ABC Restaurant {uuid.uuid4().hex[:4]}")
    other = brand_login(client, f"Other Brand {uuid.uuid4().hex[:4]}")
    start = today_ist() + timedelta(days=3)
    req = client.post(f"{API}/customer/campaigns", json={
        "name": "Sector 54 Promotion", "start_date": start.isoformat(), "end_date": (start + timedelta(days=9)).isoformat(),
        "total_riders": 2, "expected_rider_rate": 500, "estimated_budget": 20000, "target_label": "Sector 54, Gurugram",
        "target_lat": TARGET[0], "target_lng": TARGET[1], "initial_radius_km": 2, "max_radius_km": 8,
        "expansion_step_km": 1, "expansion_interval_min": 60, "submit": True,
    }, headers=abc)
    assert req.status_code == 200, req.text
    cid = req.json()["id"]
    assert req.json()["brand_status"] == "REQUESTED" and req.json()["status_label"] == "Pending Admin Review"

    # Brands can't review, publish, share or read admin data.
    for method, url, body in (("post", f"/campaigns/{cid}/review", {"action": "approve"}), ("post", f"/campaigns/{cid}/publish", None),
                              ("post", f"/campaigns/{cid}/share", {"enabled": True}), ("get", f"/campaigns/{cid}", None),
                              ("get", "/campaigns/photo-queue", None)):
        assert getattr(client, method)(f"{API}{url}", **({"json": body} if body else {}), headers=abc).status_code in (401, 403)
    # Another brand can't see it at all.
    for path in ("", "/riders", "/photos", "/map"):
        assert client.get(f"{API}/customer/campaigns/{cid}{path}", headers=other).status_code == 404
    assert cid not in [c["id"] for c in client.get(f"{API}/customer/campaigns", headers=other).json()]

    # Admin sees the request and approves it: same row, same ID and brand; not live yet.
    assert client.get(f"{API}/campaigns/summary", headers=admin_headers).json()["brand_requests"] >= 1
    approved = client.post(f"{API}/campaigns/{cid}/review", json={"action": "approve"}, headers=admin_headers).json()
    assert approved["id"] == cid and approved["brand_status"]["key"] == "APPROVED" and approved["visibility"] == "DRAFT"
    assert client.get(f"{API}/customer/campaigns/{cid}", headers=abc).json()["brand_status"] == "APPROVED"
    live = client.post(f"{API}/campaigns/{cid}/publish", headers=admin_headers).json()
    assert live["status"] == "OPEN" and live["geo"]["current_radius_km"] == 2
    assert client.get(f"{API}/customer/campaigns?status=LIVE", headers=abc).json()[0]["id"] == cid

    # A rider in the area joins; admin approves; brand, admin and public all see 1 / 2.
    _, rider_headers = make_rider(client, db_session, "9300000009")
    here = km_north(TARGET, 1)
    assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json={"lat": here[0], "lng": here[1]}, headers=rider_headers).status_code == 200
    app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin_headers).json()[0]["id"]
    client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin_headers)
    riders = client.get(f"{API}/customer/campaigns/{cid}/riders", headers=abc).json()
    assert riders["joined_riders"] == 1 and riders["required_riders"] == 2
    assert "mobile_number" not in riders["riders"][0] and riders["riders"][0]["name"] == "Rider 0009"
    assert client.get(f"{API}/campaigns/{cid}", headers=admin_headers).json()["stats"]["assigned_riders"] == 1

    # Proof photos: only approved ones reach the brand and the public page. (The campaign starts today.)
    row = db_session.get(Campaign, cid)
    row.start_date, row.end_date = today_ist(), today_ist() + timedelta(days=9)
    db_session.commit()
    for n in range(2):
        res = client.post(f"{API}/riders/me/campaigns/{cid}/activity",
                          files={"photo": ("proof.jpg", f"geo-proof-{n}".encode(), "image/jpeg")}, headers=rider_headers)
        assert res.status_code == 200, res.text
    queue = client.get(f"{API}/campaigns/photo-queue", headers=admin_headers).json()
    mine = [p for p in queue["photos"] if p["campaign_id"] == cid]
    assert len(mine) == 2 and mine[0]["campaign_code"] == f"CMP-{cid:06d}"
    assert client.get(f"{API}/customer/campaigns/{cid}/photos", headers=abc).json()["days"] == []  # Pending: hidden
    client.post(f"{API}/campaigns/{cid}/photos/{mine[0]['id']}/approve", headers=admin_headers)
    client.post(f"{API}/campaigns/{cid}/photos/{mine[1]['id']}/reject", json={"reason": "Blurry"}, headers=admin_headers)
    days = client.get(f"{API}/customer/campaigns/{cid}/photos", headers=abc).json()["days"]
    assert days == [{"date": today_ist().isoformat(), "approved_photos": 1}]
    day_photos = client.get(f"{API}/customer/campaigns/{cid}/photos", params={"date": today_ist().isoformat()}, headers=abc).json()["photos"]
    assert [p["id"] for p in day_photos] == [mine[0]["id"]]

    # Share (admin only) → public page with real, public-safe data.
    share = client.post(f"{API}/campaigns/{cid}/share", json={"enabled": True}, headers=admin_headers).json()
    page = client.get(f"{API}/public/campaigns/{share['slug']}").json()
    assert page["code"] == f"CMP-{cid:06d}" and page["riders"] == {"joined": 1, "required": 2}
    assert [p["id"] for p in page["approved_photos"]["items"]] == [mine[0]["id"]]
    assert "rider" not in page["approved_photos"]["items"][0] and page["area"]["radius_km"] == 2
    text = str(page)
    assert "9300000009" not in text and "mobile" not in text
    assert db_session.query(CampaignActivityPhoto).filter(CampaignActivityPhoto.campaign_id == cid).count() == 2


def test_brand_signup_cannot_take_over_an_existing_brand(client, db_session, brand_id):
    res = client.post(f"{API}/customer/auth/signup", json={
        "full_name": "Impostor", "company_name": "campaign brand", "mobile_number": "9700000123",
        "email": "impostor@x.in", "password": "BrandPass123",
    })
    assert res.status_code == 400 and "already registered" in res.json()["detail"]


def test_realtime_signals_reach_the_right_audiences(client, db_session, admin_headers, monkeypatch):
    """Each action sends a data-free signal: rider apps (discovery) for slots/status/reach, admins and the
    owning brand for requests, reviews, GPS routes and photos. GPS route batches never wake every rider app."""
    from app.services import realtime_service as rt

    sent = []
    payloads = []
    monkeypatch.setattr(rt, "_send", lambda topics, payload, event: (sent.append((set(topics), payload["event_type"], event)), payloads.append(payload)) and True)
    discovery, admins = rt.campaign_discovery_topic(), rt.admin_topic()
    brand_h = brand_login(client, f"Signal Brand {uuid.uuid4().hex[:4]}")
    start = today_ist() + timedelta(days=2)
    cid = client.post(f"{API}/customer/campaigns", json={
        "name": "Signals", "start_date": start.isoformat(), "end_date": (start + timedelta(days=5)).isoformat(), "total_riders": 1,
        "expected_rider_rate": 300, "estimated_budget": 20000, "target_label": "T", "target_lat": TARGET[0], "target_lng": TARGET[1],
        "initial_radius_km": 2, "submit": True}, headers=brand_h).json()["id"]
    brand_topic = rt.brand_topic(db_session.get(Campaign, cid).brand_id)

    def last(event_type):
        return next(t for t, e, ev in reversed(sent) if e == event_type and ev == "campaigns")

    assert {admins, brand_topic} <= last("campaign_requested")
    client.post(f"{API}/campaigns/{cid}/review", json={"action": "approve"}, headers=admin_headers)
    assert brand_topic in last("campaign_reviewed")
    client.post(f"{API}/campaigns/{cid}/publish", headers=admin_headers)
    assert {discovery, admins, brand_topic} <= last("campaign_live")

    _, a = make_rider(client, db_session, "9300000051")
    _, b = make_rider(client, db_session, "9300000052")
    here = km_north(TARGET, 0.5)
    client.post(f"{API}/riders/me/location", json={"lat": here[0], "lng": here[1]}, headers=b)
    client.post(f"{API}/riders/me/campaigns/{cid}/join", json={"lat": here[0], "lng": here[1]}, headers=a)
    assert discovery in last("slot_requested")
    client.post(f"{API}/riders/me/campaigns/{cid}/withdraw", headers=a)
    assert discovery in last("slots_available")  # Freed slot: rider apps refetch, b also gets a notification
    client.post(f"{API}/campaigns/{cid}/geo", json={"action": "set", "radius_km": 1.5}, headers=admin_headers)
    assert discovery in last("radius_changed")

    # Rider joins and the campaign starts: routes and photos signal admins + brand only.
    client.post(f"{API}/riders/me/campaigns/{cid}/join", json={"lat": here[0], "lng": here[1]}, headers=b)
    app_id = client.get(f"{API}/campaigns/{cid}/applications", params={"status": "REQUESTED"}, headers=admin_headers).json()[0]["id"]
    client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin_headers)
    assert brand_topic in last("rider_joined")
    row = db_session.get(Campaign, cid)
    row.start_date, row.end_date = today_ist(), today_ist() + timedelta(days=5)
    db_session.commit()
    client.get(f"{API}/campaigns/{cid}", headers=admin_headers)  # Status sync: starts today → rider ACTIVE
    now = datetime.utcnow()
    pts = [{"latitude": here[0] + i * 0.001, "longitude": here[1], "recorded_at": (now - timedelta(minutes=5 - i)).isoformat()} for i in range(3)]
    up = client.post(f"{API}/riders/me/campaigns/{cid}/route-points", json={"points": pts}, headers=b)
    assert up.status_code == 200 and up.json()["stored"] == 3, up.text
    route_topics = last("route_points")
    assert route_topics == {admins, brand_topic} and discovery not in route_topics
    photo = client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", b"signal-proof", "image/jpeg")}, headers=b)
    assert photo.status_code == 200, photo.text
    assert last("photo_submitted") == {admins, brand_topic}
    pid = client.get(f"{API}/campaigns/photo-queue", params={"campaign_id": cid}, headers=admin_headers).json()["photos"][0]["id"]
    client.post(f"{API}/campaigns/{cid}/photos/{pid}/approve", headers=admin_headers)
    assert brand_topic in last("photo_approved")
    # No personal data in any payload.
    assert payloads and all(set(p) <= {"campaign_id", "event_type", "timestamp", "assignment_id"} for p in payloads)


def test_brand_request_lives_in_requests_until_approved_then_joins_campaigns(client, db_session, admin_headers, brand_id):
    brand = brand_login(client, f"Lifecycle Brand {uuid.uuid4().hex[:4]}")
    start = today_ist() + timedelta(days=2)
    body = {"name": "Lifecycle Promo", "start_date": start.isoformat(), "end_date": (start + timedelta(days=6)).isoformat(),
            "total_riders": 2, "expected_rider_rate": 400, "estimated_budget": 20000, "target_label": "Sector 54, Gurugram",
            "target_lat": TARGET[0], "target_lng": TARGET[1], "initial_radius_km": 2}
    draft = client.post(f"{API}/customer/campaigns", json=body, headers=brand).json()["id"]  # Saved, not submitted
    res = client.post(f"{API}/customer/campaigns", json={**body, "submit": True}, headers=brand)
    assert res.status_code == 200, res.text
    cid = res.json()["id"]
    admin_made = client.post(f"{API}/campaigns", json={
        "brand_id": brand_id, "name": "Admin Campaign", "start_date": start.isoformat(), "end_date": (start + timedelta(days=6)).isoformat(),
        "total_slots": 2, "daily_rate": 300,
    }, headers=admin_headers)
    assert admin_made.status_code == 200, admin_made.text
    admin_cid = admin_made.json()["id"]

    def ids(**params):
        return [c["id"] for c in client.get(f"{API}/campaigns", params=params, headers=admin_headers).json()]

    def dashboard():
        ops = client.get(f"{API}/reports/operations", headers=admin_headers).json()
        return {c["id"]: c["status"] for c in ops["campaigns"]}, ops["kpis"]

    # Pending: only in Campaign Requests. The brand's unsubmitted draft is in neither, and can't be published.
    assert cid not in ids() and cid in ids(scope="requests", status="PENDING_APPROVAL")
    assert admin_cid in ids() and admin_cid not in ids(scope="requests")
    assert draft not in ids() and draft not in ids(scope="requests")
    assert "Approve it" in client.post(f"{API}/campaigns/{draft}/publish", headers=admin_headers).json()["detail"]
    before = client.get(f"{API}/campaigns/summary", headers=admin_headers).json()
    board, kpis = dashboard()
    assert cid not in board and draft not in board and kpis["campaign_requests"] >= 1

    # Approve: the same row moves from Requests to Campaigns, approved but not live; riders can't see it yet.
    client.post(f"{API}/campaigns/{cid}/review", json={"action": "approve"}, headers=admin_headers)
    assert cid in ids() and cid not in ids(scope="requests")
    row = next(c for c in client.get(f"{API}/campaigns", headers=admin_headers).json() if c["id"] == cid)
    assert row["status"] == "DRAFT" and row["brand_status"]["key"] == "APPROVED" and row["requested_by_brand"] and row["approved_at"]
    assert client.get(f"{API}/customer/campaigns/{cid}", headers=brand).json()["brand_status"] == "APPROVED"
    after = client.get(f"{API}/campaigns/summary", headers=admin_headers).json()
    assert after["brand_requests"] == before["brand_requests"] - 1 and after["total_campaigns"] == before["total_campaigns"] + 1
    assert db_session.query(Campaign).filter(Campaign.name == "Lifecycle Promo").count() == 2  # No copy: request + draft only
    board, after_kpis = dashboard()
    assert board[cid] == "APPROVED" and after_kpis["campaign_requests"] == kpis["campaign_requests"] - 1 and after_kpis["ready_to_publish"] >= 1

    # Only an admin publish makes it live, still with the same ID.
    assert client.post(f"{API}/campaigns/{cid}/publish", headers=brand).status_code in (401, 403)
    live = client.post(f"{API}/campaigns/{cid}/publish", headers=admin_headers).json()
    assert live["id"] == cid and live["status"] == "OPEN" and dashboard()[0][cid] == "OPEN"
    assert client.get(f"{API}/customer/campaigns/{cid}", headers=brand).json()["brand_status"] == "LIVE"

    # Rejected requests stay in Requests (Rejected tab), never in Campaigns.
    rid = client.post(f"{API}/customer/campaigns", json={**body, "name": "Rejected Promo", "submit": True}, headers=brand).json()["id"]
    client.post(f"{API}/campaigns/{rid}/review", json={"action": "reject", "note": "Not a fit"}, headers=admin_headers)
    assert rid in ids(scope="requests", status="REJECTED") and rid not in ids() and rid not in dashboard()[0]


def test_brand_request_carries_the_same_details_as_the_admin_form(client, db_session, admin_headers, uploads_dir):
    brand = brand_login(client, f"Spec Brand {uuid.uuid4().hex[:4]}")
    start = today_ist() + timedelta(days=3)
    body = {"name": "Full Spec Promo", "start_date": start.isoformat(), "end_date": (start + timedelta(days=6)).isoformat(),
            "total_riders": 4, "expected_rider_rate": 450, "estimated_budget": 20000, "target_label": "Sector 62, Gurugram",
            "target_lat": TARGET[0], "target_lng": TARGET[1], "initial_radius_km": 2,
            "campaign_category": "Bike", "eligible_vehicle_categories": ["TWO_WHEELER", "Auto"],
            "photo_slot_windows": {"MORNING": ["07:00", "10:00"], "EVENING": ["12:00", "15:00"], "NIGHT": ["17:00", "20:00"]},
            "rules": "Wear the T-shirt\nRide 4 hours a day"}
    bad = client.post(f"{API}/customer/campaigns", json={**body, "photo_slot_windows": {"MORNING": ["10:00", "07:00"], "EVENING": ["12:00", "15:00"], "NIGHT": ["17:00", "20:00"]}}, headers=brand)
    assert bad.status_code == 400 and "end after it starts" in bad.json()["detail"]
    assert client.post(f"{API}/customer/campaigns", json={**body, "campaign_category": "Radio"}, headers=brand).status_code == 422

    res = client.post(f"{API}/customer/campaigns", json=body, headers=brand)
    assert res.status_code == 200, res.text
    mine = res.json()
    assert mine["campaign_category"] == "BIKE" and sorted(mine["eligible_vehicle_categories"]) == ["AUTO", "TWO_WHEELER"]
    assert mine["photo_slot_windows"]["MORNING"] == ["07:00", "10:00"] and mine["rules"].startswith("Wear")
    cid = mine["id"]

    # Banner while it's still a request; the admin sees exactly the same details.
    up = client.post(f"{API}/customer/campaigns/{cid}/image", files={"image": ("banner.jpg", b"\xff\xd8\xff\xe0banner", "image/jpeg")}, headers=brand)
    assert up.status_code == 200 and up.json()["image_url"], up.text
    admin = client.get(f"{API}/campaigns/{cid}", headers=admin_headers).json()
    assert admin["campaign_category"] == "BIKE" and sorted(admin["eligible_vehicle_categories"]) == ["AUTO", "TWO_WHEELER"]
    assert admin["photo_slot_windows"]["MORNING"] == ["07:00", "10:00"] and admin["rules"] == ["Wear the T-shirt", "Ride 4 hours a day"]
    assert admin["daily_rate"] == 450 and admin["total_slots"] == 4 and admin["image_url"] == up.json()["image_url"]

    # Edits: "any vehicle" clears the restriction; default slot times are stored as defaults.
    edited = client.put(f"{API}/customer/campaigns/{cid}", json={"eligible_vehicle_categories": [], "photo_slot_windows": None, "campaign_category": "Standard"}, headers=brand).json()
    assert edited["eligible_vehicle_categories"] == [] and edited["campaign_category"] == "STANDARD" and edited["photo_slot_windows"]["MORNING"] == ["06:00", "11:00"]

    # After approval the banner is the admin's to change.
    client.put(f"{API}/customer/campaigns/{cid}", json={"submit": True}, headers=brand)
    client.post(f"{API}/campaigns/{cid}/review", json={"action": "approve"}, headers=admin_headers)
    assert client.post(f"{API}/customer/campaigns/{cid}/image", files={"image": ("b.jpg", b"\xff\xd8x", "image/jpeg")}, headers=brand).status_code == 400


def test_last_known_location_reaches_rider_after_six_hours_with_free_slots(client, db_session, admin_headers, brand_id):
    campaign = geo_campaign(client, admin_headers, brand_id, slots=1)
    rider, stale_headers = make_rider(client, db_session, "9300000091")
    _, other_headers = make_rider(client, db_session, "9300000092")
    # The rider last had the app open 1 km from the target, 5 hours ago (too old to count as current),
    # and has no working area there.
    rider.last_lat, rider.last_lng = km_north(TARGET, 1)
    rider.last_located_at = datetime.utcnow() - timedelta(hours=5)
    row = db_session.get(Campaign, campaign["id"])

    def live_for(hours):
        row.published_at = datetime.utcnow() - timedelta(hours=hours)
        row.radius_updated_at = datetime.utcnow()  # Keep the radius at 2 km
        db_session.commit()

    def ids(headers):
        return [c["id"] for c in listed(client, headers)["available"]]

    live_for(2)
    assert campaign["id"] not in ids(stale_headers)  # Live less than 6 hours: current location / working areas only
    live_for(7)
    card = next(c for c in listed(client, stale_headers)["available"] if c["id"] == campaign["id"])
    assert card["can_join"] and card["distance_km"] == pytest.approx(1.0, abs=0.05)

    # Once the last slot is taken, the last-known location no longer reaches the rider.
    here = km_north(TARGET, 1)
    assert client.post(f"{API}/riders/me/campaigns/{campaign['id']}/join", json={"lat": here[0], "lng": here[1]}, headers=other_headers).status_code == 200
    assert campaign["id"] not in ids(stale_headers)

    # A last location older than the limit never counts.
    match = geo.rider_match(row, None, [], last_known=None)
    assert not match["in_reach"]
    rider.last_located_at = datetime.utcnow() - timedelta(days=31)
    db_session.commit()
    assert geo.last_known_location(rider) is None
