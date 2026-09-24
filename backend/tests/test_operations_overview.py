"""Dashboard operations overview: every figure comes from real records and existing calculations."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


def test_operations_overview_matches_detail_pages(client, db_session):
    admin, _ = make_admin(client, db_session)
    brand = client.post(f"{API}/brands", json={"name": f"Ops Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist()
    cid = client.post(
        f"{API}/campaigns",
        json={"name": "Sector 57 Promotion", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=9)).isoformat(), "total_slots": 2, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()["id"]
    riders = []
    for _ in range(2):
        body = rider_payload(status="APPROVED", upi_id="ops@upi")
        r = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
        client.post(f"{API}/campaigns/{cid}/riders", json={"rider_id": r["id"]}, headers=admin)
        token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
        riders.append((r, {"Authorization": f"Bearer {token}"}))

    # Rider 1 completes today's Photo-Day; rider 2 submits nothing.
    for slot in ("MORNING", "EVENING", "NIGHT"):
        client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", uuid.uuid4().bytes, "image/jpeg")}, data={"slot": slot}, headers=riders[0][1])
    for p in client.get(f"{API}/campaigns/{cid}/photos?status=PENDING", headers=admin).json():
        client.post(f"{API}/campaigns/{cid}/photos/{p['id']}/approve", headers=admin)
    # One paid manual payment and one failed one.
    paid = client.post(f"{API}/payments", json={"rider_id": riders[1][0]["id"], "amount": 40}, headers=admin).json()
    client.post(f"{API}/payments/{paid['id']}/process?action=PAID", headers=admin)
    failed = client.post(f"{API}/payments", json={"rider_id": riders[1][0]["id"], "amount": 15}, headers=admin).json()
    client.post(f"{API}/payments/{failed['id']}/process?action=FAILED", headers=admin)

    data = client.get(f"{API}/reports/operations", headers=admin).json()
    row = next(c for c in data["campaigns"] if c["id"] == cid)
    fulfillment = client.get(f"{API}/campaigns/{cid}/fulfillment", headers=admin).json()
    assert row["contracted_rider_days"] == fulfillment["contracted_rider_days"] == 20
    assert row["delivered_rider_days"] == fulfillment["contract_rider_days_delivered"] == 1
    assert row["fulfillment_pct"] == 5.0 and row["assigned_riders"] == 2 and row["brand"] == brand["name"]

    ra = data["rider_activity"]
    assert ra["active_today"] >= 2 and ra["completed_today"] >= 1
    # Rider 2 is missing today (the list shows at most 8 names, so check it or the count).
    assert ra["missing_today"] >= 1 and (
        any(m["rider_id"] == riders[1][0]["rider_id"] for m in ra["missing"]) or ra["missing_today"] > len(ra["missing"])
    )
    assert not any(m["rider_id"] == riders[0][0]["rider_id"] for m in ra["missing"])

    pay = data["payments"]
    assert pay["paid_today"] >= 40 and pay["failed_count"] >= 1 and pay["pending_payout"] >= 10  # ₹10 earned, unpaid
    assert any(p["id"] == paid["id"] and p["status"] == "PAID" for p in pay["recent"])
    assert any("photo" in e["title"] for e in data["activity"])
    # Riders can't read it.
    assert client.get(f"{API}/reports/operations", headers=riders[0][1]).status_code == 403
