"""Rider routes: GPS points uploaded by the rider app, drawn as lines on the admin map."""
import uuid
from datetime import datetime, timedelta

from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


def _setup(client, db_session, riders=1):
    admin, _ = make_admin(client, db_session)
    brand = client.post(f"{API}/brands", json={"name": f"Route Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() - timedelta(days=1)
    cid = client.post(
        f"{API}/campaigns",
        json={"name": "Sector 57 Promotion", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=9)).isoformat(), "total_slots": riders, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()["id"]
    people = []
    for _ in range(riders):
        body = rider_payload(status="APPROVED")
        rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
        client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": rider["id"]}, headers=admin)
        token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
        people.append((rider, {"Authorization": f"Bearer {token}"}))
    return admin, cid, people


def _walk(start_lat, n=5, minutes_ago=30, **extra):
    now = datetime.utcnow()
    # Keep the walk inside today's IST date (just after midnight, "30 minutes ago" is yesterday).
    ist_midnight_utc = datetime.combine(today_ist(), datetime.min.time()) - timedelta(hours=5, minutes=30)
    base = max(now - timedelta(minutes=minutes_ago), min(ist_midnight_utc + timedelta(seconds=30), now - timedelta(minutes=n)))
    return [
        {"latitude": start_lat + i * 0.001, "longitude": 77.05 + i * 0.001, "recorded_at": (base + timedelta(minutes=i)).isoformat() + "Z", "accuracy": 12, **extra}
        for i in range(n)
    ]


def test_route_upload_and_single_rider_map(client, db_session):
    admin, cid, [(rider, headers)] = _setup(client, db_session)
    url = f"{API}/riders/me/campaigns/{cid}/route-points"
    points = _walk(28.40)
    bad = [
        {"latitude": 28.5, "longitude": 77.1, "recorded_at": (datetime.utcnow() - timedelta(minutes=2)).isoformat() + "Z", "accuracy": 450},  # Imprecise
        {"latitude": 28.5, "longitude": 77.1, "recorded_at": (datetime.utcnow() + timedelta(hours=2)).isoformat() + "Z"},  # Future
        {"latitude": 28.5, "longitude": 77.1, "recorded_at": (datetime.utcnow() - timedelta(days=5)).isoformat() + "Z"},  # Before the campaign
    ]
    res = client.post(url, json={"points": points + bad}, headers=headers).json()
    assert res == {"received": 8, "stored": 5}
    assert client.post(url, json={"points": points}, headers=headers).json()["stored"] == 0  # Retried upload: no duplicates
    assert client.post(url, json={"points": [{"latitude": 99, "longitude": 0, "recorded_at": datetime.utcnow().isoformat()}]}, headers=headers).status_code == 422

    assignment_id = client.get(f"{API}/campaigns/{cid}/riders", headers=admin).json()[0]["assignment_id"]
    today = today_ist().isoformat()
    assert client.get(f"{API}/campaigns/{cid}/route-dates?assignment_id={assignment_id}", headers=admin).json() == [today]
    data = client.get(f"{API}/campaigns/{cid}/routes?date={today}&assignment_id={assignment_id}", headers=admin).json()
    assert data["campaign"]["name"] == "Sector 57 Promotion" and data["date"] == today
    route = data["routes"][0]
    assert route["rider"]["full_name"] == rider["full_name"]
    assert route["points"][0] == [28.4, 77.05] and len(route["points"]) == 5  # In recorded order: start → end
    assert set(route) == {"assignment_id", "rider", "points"}  # Coordinates only: no distance, speed or time

    yesterday = (today_ist() - timedelta(days=1)).isoformat()
    assert client.get(f"{API}/campaigns/{cid}/routes?date={yesterday}&assignment_id={assignment_id}", headers=admin).json()["routes"] == []
    # Riders can't read routes.
    assert client.get(f"{API}/campaigns/{cid}/routes?date={today}", headers=headers).status_code == 403


def test_all_rider_routes_and_upload_rules(client, db_session):
    admin, cid, [(r1, h1), (r2, h2)] = _setup(client, db_session, riders=2)
    url = f"{API}/riders/me/campaigns/{cid}/route-points"
    client.post(url, json={"points": _walk(28.40)}, headers=h1)
    client.post(url, json={"points": _walk(28.50)}, headers=h2)
    routes = client.get(f"{API}/campaigns/{cid}/routes?date={today_ist().isoformat()}", headers=admin).json()["routes"]
    assert {r["rider"]["full_name"] for r in routes} == {r1["full_name"], r2["full_name"]} and len(routes) == 2

    # A rider who isn't active in the campaign can't upload.
    other_body = rider_payload(status="APPROVED")
    client.post(f"{API}/admin/riders", json=other_body, headers=admin)
    token = client.post(f"{API}/auth/login", json={"phone": other_body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    assert client.post(url, json={"points": _walk(28.6)}, headers={"Authorization": f"Bearer {token}"}).status_code == 400
