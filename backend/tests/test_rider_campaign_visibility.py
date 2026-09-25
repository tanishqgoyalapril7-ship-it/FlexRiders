"""Admin → database → rider app: which campaigns riders see, and the join → approve flow."""
import logging
import uuid
from datetime import timedelta

from app.core.config import settings
from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


def _rider(client, admin, status="APPROVED"):
    body = rider_payload(status=status)
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    return rider, {"Authorization": f"Bearer {token}"}


def _campaign(client, admin, brand_id, start_offset=0, days=10, visibility="DRAFT", slots=2):
    start = today_ist() + timedelta(days=start_offset)
    return client.post(
        f"{API}/campaigns",
        json={"name": f"Visible {uuid.uuid4().hex[:5]}", "brand_id": brand_id, "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=days - 1)).isoformat(), "total_slots": slots, "daily_rate": 10, "visibility": visibility},
        headers=admin,
    ).json()


def available_ids(client, headers):
    return {c["id"]: c for c in client.get(f"{API}/riders/me/campaigns", headers=headers).json()["available"]}


def test_draft_hidden_until_published_then_join_approve_flow(client, db_session, caplog, monkeypatch):
    admin, _ = make_admin(client, db_session)
    brand = client.post(f"{API}/brands", json={"name": f"Vis Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    draft = _campaign(client, admin, brand["id"], start_offset=1)  # Saved as draft, like the reported campaign
    rider, headers = _rider(client, admin)

    assert draft["id"] not in available_ids(client, headers)
    check = client.get(f"{API}/campaigns/{draft['id']}/rider-visibility", headers=admin).json()
    assert check["visible_to_riders"] is False and check["hidden_reason"].startswith("Draft")

    # Logging explains the decision when switched on.
    monkeypatch.setattr(settings, "CAMPAIGN_VISIBILITY_LOG", True)
    records = []
    handler = logging.Handler()
    handler.emit = records.append
    logging.getLogger("app.campaigns.visibility").addHandler(handler)
    available_ids(client, headers)
    logging.getLogger("app.campaigns.visibility").removeHandler(handler)
    assert any(str(draft["id"]) in r.getMessage() and "Draft" in r.getMessage() for r in records)

    # Publish → visible and joinable, whatever the rider's brand/assignment situation.
    client.post(f"{API}/campaigns/{draft['id']}/publish", headers=admin)
    listed = available_ids(client, headers)
    assert draft["id"] in listed and listed[draft["id"]]["can_join"] is True
    check = client.get(f"{API}/campaigns/{draft['id']}/rider-visibility", headers=admin).json()
    assert check["visible_to_riders"] and any(r["rider"]["id"] == rider["id"] and r["can_join"] for r in check["riders"])

    detail = client.get(f"{API}/riders/me/campaigns/{draft['id']}", headers=headers).json()
    assert detail["name"] == draft["name"] and detail["can_join"] is True
    assert client.post(f"{API}/riders/me/campaigns/{draft['id']}/join", headers=headers).status_code == 200
    mine = client.get(f"{API}/riders/me/campaigns", headers=headers).json()
    assert mine["pending_request"]["id"] == draft["id"]

    application = client.get(f"{API}/campaigns/{draft['id']}/applications", headers=admin).json()[0]
    assert client.post(f"{API}/campaigns/{draft['id']}/applications/{application['id']}/approve", headers=admin).status_code == 200
    mine = client.get(f"{API}/riders/me/campaigns", headers=headers).json()
    assert mine["active"]["id"] == draft["id"] and mine["active"]["my_status"] == "ASSIGNED"  # Starts tomorrow

    # A second upcoming campaign is still visible to the assigned rider, but they can't join it.
    other = _campaign(client, admin, brand["id"], start_offset=3, visibility="PUBLIC")
    listed = available_ids(client, headers)
    assert other["id"] in listed and listed[other["id"]]["can_join"] is False
    assert "already assigned" in listed[other["id"]]["join_blocked_reason"]
    assert client.post(f"{API}/riders/me/campaigns/{other['id']}/join", headers=headers).status_code == 400


def test_visibility_rules_for_dates_status_and_rider_state(client, db_session):
    admin, _ = make_admin(client, db_session)
    brand = client.post(f"{API}/brands", json={"name": f"Vis Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    upcoming = _campaign(client, admin, brand["id"], start_offset=5, visibility="PUBLIC")
    started = _campaign(client, admin, brand["id"], visibility="PUBLIC")  # Starts today: live
    ended = _campaign(client, admin, brand["id"], start_offset=2, days=3, visibility="PUBLIC")
    from app.models.campaign_models import Campaign  # Move it into the past (an ended campaign can't be published)

    row = db_session.get(Campaign, ended["id"])
    row.start_date, row.end_date = today_ist() - timedelta(days=10), today_ist() - timedelta(days=8)
    db_session.commit()
    paused = _campaign(client, admin, brand["id"], start_offset=4, visibility="PUBLIC")
    client.post(f"{API}/campaigns/{paused['id']}/pause", headers=admin)
    cancelled = _campaign(client, admin, brand["id"], visibility="PUBLIC")
    client.post(f"{API}/campaigns/{cancelled['id']}/cancel", headers=admin)

    # A rider still awaiting approval sees campaigns but can't join yet.
    pending_rider, pending_headers = _rider(client, admin, status="PENDING")
    listed = available_ids(client, pending_headers)
    # Only upcoming campaigns are listed: never ones that have started, ended, been paused or cancelled.
    assert set(listed) & {upcoming["id"], started["id"], ended["id"], paused["id"], cancelled["id"]} == {upcoming["id"]}
    assert listed[upcoming["id"]]["can_join"] is False and "approved" in listed[upcoming["id"]]["join_blocked_reason"]

    _, headers = _rider(client, admin)
    listed = available_ids(client, headers)
    assert listed[upcoming["id"]]["can_join"] is True  # Joining before the start date is allowed
    assert started["id"] not in listed and paused["id"] not in listed and ended["id"] not in listed
    # Nor can they be opened directly (e.g. an old link or notification).
    res = client.get(f"{API}/riders/me/campaigns/{started['id']}", headers=headers)
    assert res.status_code == 404 and "already started" in res.json()["detail"]
    assert client.get(f"{API}/riders/me/campaigns/{ended['id']}", headers=headers).status_code == 404
    assert client.post(f"{API}/riders/me/campaigns/{started['id']}/join", json={}, headers=headers).status_code == 400
    # The admin's "who can see this" check gives the same reason.
    check = client.get(f"{API}/campaigns/{started['id']}/rider-visibility", headers=admin).json()
    assert check["visible_to_riders"] is False and check["hidden_reason"].startswith("Started")
