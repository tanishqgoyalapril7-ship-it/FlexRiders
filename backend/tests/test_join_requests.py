"""JOIN REQUEST ≠ ACTIVE CAMPAIGN RIDER: size → pending collection → admin marks collected → admin approves."""
import uuid
from datetime import timedelta

from app.models.all_models import AuditLog
from app.models.campaign_models import CampaignAssignment
from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


def _rider(client, admin):
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    return rider, {"Authorization": f"Bearer {token}"}


def _kit_campaign(client, admin, slots=2, tshirt=True):
    brand = client.post(f"{API}/brands", json={"name": f"Req Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=3)
    c = client.post(
        f"{API}/campaigns",
        json={"name": f"Req Campaign {uuid.uuid4().hex[:5]}", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=9)).isoformat(), "total_slots": slots, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()
    if tshirt:
        client.put(f"{API}/campaigns/{c['id']}/brand-kit", json={"tshirt_required": True, "size_options": "S,M,L"}, headers=admin)
        client.post(f"{API}/campaigns/{c['id']}/pickup-locations", json={"name": "Gurugram Office", "address": "Sector 44, Gurugram"}, headers=admin)
    return c


def test_full_request_flow_with_tshirt(client, db_session):
    admin, _ = make_admin(client, db_session)
    campaign = _kit_campaign(client, admin)
    cid = campaign["id"]
    rider, headers = _rider(client, admin)

    assert client.post(f"{API}/riders/me/campaigns/{cid}/join", json={"tshirt_size": "M"}, headers=headers).status_code == 200
    # Joining is only a request: no assignment yet.
    assert db_session.query(CampaignAssignment).filter(CampaignAssignment.rider_id == rider["id"]).count() == 0
    detail = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
    req = detail["my_request"]
    assert req["status_label"] == "Waiting for Admin Approval" and req["kit_status_label"] == "Pending Collection"
    assert req["tshirt_size"] == "M" and req["pickup_location"]["name"] == "Gurugram Office"
    assert detail["progress"] is None
    assert client.get(f"{API}/riders/me/campaigns", headers=headers).json()["active"] is None

    # Admin list across campaigns.
    pending = client.get(f"{API}/campaigns/join-requests", headers=admin).json()
    row = next(r for r in pending if r["campaign"]["id"] == cid)
    assert row["status_label"] == "Pending Admin Approval" and row["kit_status_label"] == "Pending Collection"
    assert row["can_approve"] is False and row["approve_blocked_reason"] == "Waiting for T-shirt collection"
    approve = f"{API}/campaigns/{cid}/applications/{row['id']}/approve"
    assert "collected" in client.post(approve, headers=admin).json()["detail"]

    # Mark collected (and undo, then redo) — each change audited with previous → new.
    kit = f"{API}/campaigns/{cid}/applications/{row['id']}/kit"
    assert client.post(kit, json={"collected": True}, headers=admin).json()["kit_status"] == "COLLECTED"
    assert client.post(kit, json={"collected": False}, headers=admin).json()["kit_status"] == "PENDING"
    marked = client.post(kit, json={"collected": True, "tshirt_size": "L"}, headers=admin).json()
    assert marked["kit_status_label"] == "Collected" and marked["tshirt_size"] == "L" and marked["can_approve"] is True
    assert client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["my_request"]["kit_status_label"] == "Collected"
    assert client.post(kit, json={"collected": True}, headers=headers).status_code == 403  # Riders can't do this

    assert client.post(approve, headers=admin).status_code == 200
    mine = client.get(f"{API}/riders/me/campaigns", headers=headers).json()
    assert mine["active"]["id"] == cid and mine["active"]["my_status"] == "ASSIGNED"  # Starts in 3 days
    detail = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
    assert detail["my_request"]["status"] == "APPROVED" and detail["my_kit"]["status"] == "COLLECTED"
    assert all(r["campaign"]["id"] != cid for r in client.get(f"{API}/campaigns/join-requests", headers=admin).json())  # No longer pending

    logs = [l.details for l in db_session.query(AuditLog).filter(AuditLog.target_id == str(cid)).all()]
    assert any("T-shirt: Pending Collection → Collected" in d for d in logs)
    assert any("T-shirt: Collected → Pending Collection" in d for d in logs)
    assert any("Pending Admin Approval → Approved" in d for d in logs)


def test_rejection_needs_reason_and_creates_no_assignment(client, db_session):
    admin, _ = make_admin(client, db_session)
    cid = _kit_campaign(client, admin)["id"]
    rider, headers = _rider(client, admin)
    client.post(f"{API}/riders/me/campaigns/{cid}/join", json={"tshirt_size": "S"}, headers=headers)
    app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]["id"]
    reject = f"{API}/campaigns/{cid}/applications/{app_id}/reject"
    assert client.post(reject, json={"reason": ""}, headers=admin).status_code == 400
    assert client.post(reject, json={"reason": "No T-shirt collected before start"}, headers=admin).status_code == 200
    req = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()["my_request"]
    assert req["status"] == "REJECTED" and req["rejection_reason"] == "No T-shirt collected before start"
    assert db_session.query(CampaignAssignment).filter(CampaignAssignment.rider_id == rider["id"]).count() == 0
    assert any("Pending Admin Approval → Rejected. Reason: No T-shirt" in (l.details or "") for l in db_session.query(AuditLog).all())


def test_approval_rechecks_capacity_and_conflicts(client, db_session):
    admin, _ = make_admin(client, db_session)
    one_slot = _kit_campaign(client, admin, slots=1, tshirt=False)["id"]
    (_, h1), (r2, h2) = _rider(client, admin), _rider(client, admin)
    for h in (h1, h2):
        assert client.post(f"{API}/riders/me/campaigns/{one_slot}/join", headers=h).status_code == 200
    rows = client.get(f"{API}/campaigns/{one_slot}/applications", headers=admin).json()
    assert all(r["kit_status"] == "NOT_REQUIRED" and r["can_approve"] for r in rows)  # No T-shirt: approve directly
    client.post(f"{API}/campaigns/{one_slot}/applications/{rows[0]['id']}/approve", headers=admin)
    blocked = client.post(f"{API}/campaigns/{one_slot}/applications/{rows[1]['id']}/approve", headers=admin)
    assert blocked.status_code == 400 and "slots" in blocked.json()["detail"]

    # A rider already assigned elsewhere can't be approved for a second campaign.
    other = _kit_campaign(client, admin, tshirt=False)["id"]
    busy_id = rows[0]["rider"]["id"]
    assert client.post(f"{API}/campaigns/{other}/riders", json={"rider_id": busy_id}, headers=admin).status_code == 400


def test_switching_tshirt_on_updates_pending_requests(client, db_session):
    admin, _ = make_admin(client, db_session)
    cid = _kit_campaign(client, admin, tshirt=False)["id"]
    _, headers = _rider(client, admin)
    client.post(f"{API}/riders/me/campaigns/{cid}/join", headers=headers)
    client.put(f"{API}/campaigns/{cid}/brand-kit", json={"tshirt_required": True, "size_options": "M,L"}, headers=admin)
    row = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]
    assert row["kit_status"] == "PENDING" and row["can_approve"] is False
    kit = f"{API}/campaigns/{cid}/applications/{row['id']}/kit"
    assert "size" in client.post(kit, json={"collected": True}, headers=admin).json()["detail"]  # Size needed first
    assert client.post(kit, json={"collected": True, "tshirt_size": "M"}, headers=admin).json()["can_approve"] is True
