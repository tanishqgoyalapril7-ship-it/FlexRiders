"""Rider app onboarding additions: identity/vehicle documents (private, admin review), gender, payout
requests and the rider's own route."""
from datetime import datetime, timedelta

from app.models.all_models import Notification, Payment, Rider
from app.models.campaign_models import Campaign
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE
from tests.test_campaigns import admin_headers, brand_id, create_campaign, join_and_approve, make_rider, uploads_dir  # noqa: F401

API = "/api/v1"
JPEG = b"\xff\xd8\xff\xe0" + b"identity-document" * 20


def test_documents_upload_replace_review_and_privacy(client, db_session, admin_headers):
    rider, h = make_rider(client, db_session, "9400000001")
    bad = client.post(f"{API}/riders/me/documents", data={"doc_type": "AADHAAR"}, files={"file": ("a.txt", b"hello", "text/plain")}, headers=h)
    assert bad.status_code == 400 and "photo" in bad.json()["detail"]
    up = client.post(f"{API}/riders/me/documents", data={"doc_type": "AADHAAR"}, files={"file": ("aadhaar.jpg", JPEG, "image/jpeg")}, headers=h)
    assert up.status_code == 200, up.text
    doc = up.json()
    assert doc["status"] == "PENDING" and doc["label"] == "Aadhaar Card" and doc["group"] == "IDENTITY"
    # The file is private: the rider and admins get it through authenticated endpoints only.
    assert client.get(f"{API}{doc['file_path']}", headers=h).content == JPEG
    stored = db_session.query(Rider).get(rider.id).documents[0].file_url
    assert client.get(stored).status_code == 404
    other, oh = make_rider(client, db_session, "9400000002")
    assert client.get(f"{API}/riders/me/documents/{doc['id']}/file", headers=oh).status_code == 404

    # A new identity document replaces the old one; vehicle proof is separate.
    pan = client.post(f"{API}/riders/me/documents", data={"doc_type": "PAN"}, files={"file": ("pan.jpg", JPEG, "image/jpeg")}, headers=h).json()
    client.post(f"{API}/riders/me/documents", data={"doc_type": "VEHICLE_PROOF"}, files={"file": ("bill.pdf", b"%PDF-1.4 bill", "application/pdf")}, headers=h)
    mine = client.get(f"{API}/riders/me/documents", headers=h).json()
    assert [d["doc_type"] for d in mine] == ["PAN", "VEHICLE_PROOF"]

    # Admin review: reject needs a reason and tells the rider; riders can't review.
    base = f"{API}/admin/riders/{rider.id}/documents/{pan['id']}"
    assert client.post(f"{base}/verify", headers=h).status_code == 403
    assert client.post(f"{base}/reject", json={"note": ""}, headers=admin_headers).status_code == 400
    assert client.post(f"{base}/reject", json={"note": "Blurry photo"}, headers=admin_headers).json()["status"] == "REJECTED"
    assert client.get(f"{API}/riders/me/documents", headers=h).json()[0]["rejection_note"] == "Blurry photo"
    assert client.get(f"{API}{base.replace(API, '')}/file", headers=admin_headers).content == JPEG
    assert client.post(f"{base}/verify", headers=admin_headers).json()["status"] == "VERIFIED"
    notes = [n.title for n in db_session.query(Notification).filter(Notification.user_id == rider.user_id)]
    assert "PAN Card needs re-upload" in notes and "PAN Card verified" in notes


def test_gender_at_registration_and_profile(client, db_session):
    res = client.post(f"{API}/auth/register", json={"selfie": SELFIE, "vehicle_category": "CYCLE", "accept_terms": True,
                                                  "full_name": "Gender Rider", "mobile_number": "9400000003", "password": "riderPass1",
                                                  "gender": "FEMALE"})
    assert res.status_code == 200, res.text
    h = {"Authorization": f"Bearer {res.json()['access_token']}"}
    assert client.get(f"{API}/riders/me", headers=h).json()["gender"] == "FEMALE"
    assert client.patch(f"{API}/riders/me", json={"gender": "OTHER"}, headers=h).json()["gender"] == "OTHER"
    assert client.patch(f"{API}/riders/me", json={"gender": "ROBOT"}, headers=h).status_code == 422


def test_payout_request(client, db_session):
    rider, h = make_rider(client, db_session, "9400000004")
    assert client.post(f"{API}/riders/me/payout-request", headers=h).status_code == 400  # Nothing to pay
    db_session.add(Payment(rider_id=rider.id, amount=250, status="PENDING"))
    db_session.commit()
    assert "UPI" in client.post(f"{API}/riders/me/payout-request", headers=h).json()["detail"]
    client.patch(f"{API}/riders/me", json={"upi_id": "rider@upi"}, headers=h)
    first = client.post(f"{API}/riders/me/payout-request", headers=h).json()
    assert first["requested"] and first["amount"] == 250
    assert client.post(f"{API}/riders/me/payout-request", headers=h).json()["requested"] is False  # Once a day
    assert db_session.query(Notification).filter(Notification.is_admin_notification == True, Notification.title.like("Payout requested%")).count() == 1  # noqa: E712


def test_my_route_is_the_riders_own(client, db_session, admin_headers, brand_id):
    campaign = create_campaign(client, admin_headers, brand_id)
    rider, h = make_rider(client, db_session, "9400000005")
    join_and_approve(client, admin_headers, campaign["id"], h, db_session)
    client.get(f"{API}/campaigns/{campaign['id']}", headers=admin_headers)
    empty = client.get(f"{API}/riders/me/campaigns/{campaign['id']}/my-route", headers=h).json()
    assert empty["points"] == [] and empty["distance_km"] == 0
    now = datetime.utcnow()
    pts = [{"latitude": 28.44 + i * 0.002, "longitude": 77.10, "recorded_at": (now - timedelta(minutes=10 - i)).isoformat()} for i in range(4)]
    assert client.post(f"{API}/riders/me/campaigns/{campaign['id']}/route-points", json={"points": pts}, headers=h).json()["stored"] == 4
    route = client.get(f"{API}/riders/me/campaigns/{campaign['id']}/my-route", headers=h).json()
    assert route["point_count"] == 4 and 0.6 < route["distance_km"] < 0.7 and route["started_at"] < route["ended_at"]
    _, other = make_rider(client, db_session, "9400000006")
    assert client.get(f"{API}/riders/me/campaigns/{campaign['id']}/my-route", headers=other).status_code == 404


def test_rider_changes_vehicle_in_settings(client, db_session, admin_headers, brand_id):
    rider, h = make_rider(client, db_session, "9400000077")  # Registered with a cycle
    client.post(f"{API}/riders/me/documents", data={"doc_type": "VEHICLE_PROOF"}, files={"file": ("bill.pdf", b"%PDF-1.4 bill", "application/pdf")}, headers=h)
    _, other = make_rider(client, db_session, "9400000078")
    client.put(f"{API}/riders/me/vehicle", json={"vehicle_category": "TWO_WHEELER", "vehicle_number": "HR26DK1111"}, headers=other)

    # A motor vehicle needs a valid, unused registration number.
    for body, err in (({"vehicle_category": "TWO_WHEELER"}, "registration number is required"),
                      ({"vehicle_category": "TWO_WHEELER", "vehicle_number": "HR26 DK 1111"}, "already registered"),
                      ({"vehicle_category": "TWO_WHEELER", "vehicle_number": "12345"}, "valid vehicle number"),
                      ({"vehicle_category": "BOAT"}, None)):
        res = client.put(f"{API}/riders/me/vehicle", json=body, headers=h)
        assert res.status_code in (400, 422) and (err is None or err in res.text), res.text

    res = client.put(f"{API}/riders/me/vehicle", json={"vehicle_category": "Bike", "vehicle_type": "Honda Activa", "vehicle_number": "hr26 dk 2222"}, headers=h)
    assert res.status_code == 200, res.text
    db_session.refresh(rider)
    assert (rider.vehicle_category, rider.vehicle_type, rider.vehicle_number) == ("TWO_WHEELER", "Honda Activa", "HR26DK2222")
    # The cycle bill no longer counts for the rider; admins still see it, marked replaced, and are told to verify.
    assert [d for d in client.get(f"{API}/riders/me/documents", headers=h).json() if d["group"] == "VEHICLE"] == []
    assert [d["status"] for d in client.get(f"{API}/admin/riders/{rider.id}/documents", headers=admin_headers).json()] == ["SUPERSEDED"]
    assert db_session.query(Notification).filter(Notification.is_admin_notification == True, Notification.title == f"Vehicle changed: {rider.full_name}").count() == 1  # noqa: E712
    # Uploading the new RC replaces the old proof: one current vehicle document.
    client.post(f"{API}/riders/me/documents", data={"doc_type": "VEHICLE_RC"}, files={"file": ("rc.jpg", JPEG, "image/jpeg")}, headers=h)
    assert [(d["doc_type"], d["status"]) for d in client.get(f"{API}/admin/riders/{rider.id}/documents", headers=admin_headers).json()] == [("VEHICLE_RC", "PENDING")]

    # Changing only the model is always fine; a new vehicle isn't while in a campaign.
    campaign = create_campaign(client, admin_headers, brand_id, start_offset=1)
    join_and_approve(client, admin_headers, campaign["id"], h)
    assert client.put(f"{API}/riders/me/vehicle", json={"vehicle_category": "TWO_WHEELER", "vehicle_type": "TVS Jupiter", "vehicle_number": "HR26DK2222"}, headers=h).status_code == 200
    blocked = client.put(f"{API}/riders/me/vehicle", json={"vehicle_category": "CYCLE"}, headers=h)
    assert blocked.status_code == 400 and "current campaign" in blocked.json()["detail"]
