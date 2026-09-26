"""Website enquiries: public submit only, admin follow-up, conversion to an existing Brand; rider approval gate."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import UserRole
from app.models.all_models import BrandEnquiry, Notification
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE
from tests.test_crud import make_admin

API = "/api/v1"
PUB = f"{API}/public/enquiries"
ADM = f"{API}/admin/enquiries"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _brand_lead(**extra):
    return {"kind": "business", "intent": "advertise", "name": "Priya Nair", "company_name": f"Chai Co {uuid.uuid4().hex[:4]}",
            "phone": "+91 " + _phone(), "email": "priya@example.com", "vehicle_interest": "AUTO",
            "campaign_requirement": "Autos in Gurugram for 4 weeks", "campaign_duration": "1 month", "message": "Launching in October", **extra}


def test_public_submit_validation_and_privacy(client, db_session, admin):
    ok = client.post(PUB, json=_brand_lead(), headers={"x-forwarded-for": "203.0.113.1"})
    assert ok.status_code == 200 and ok.json()["message"].startswith("Thank you! Your enquiry has been submitted.")
    for bad, why in (
        ({"name": ""}, "name"),
        ({"phone": "123"}, "phone"),
        ({"email": "not-an-email"}, "email"),
        ({"company_name": ""}, "company"),
        ({"vehicle_interest": "TRUCK"}, "vehicle"),
        ({"campaign_requirement": "", "message": ""}, "requirement"),
        ({"kind": "alien"}, "kind"),
    ):
        res = client.post(PUB, json=_brand_lead(**bad), headers={"x-forwarded-for": "203.0.113.2"})
        assert res.status_code == 422, (why, res.text)
    # Rider / driver interest: needs a city, not a company.
    assert client.post(PUB, json={"kind": "driver", "name": "Ramesh", "phone": _phone(), "city": ""}).status_code == 422
    assert client.post(PUB, json={"kind": "driver", "name": "Ramesh", "phone": _phone(), "city": "Gurugram"}).status_code == 200
    # Nothing about enquiries is readable without an admin login.
    assert client.get(ADM).status_code == 401
    assert client.get(PUB).status_code == 405
    db_session.expire_all()
    assert db_session.query(Notification).filter(Notification.category == "ENQUIRY").count() >= 2  # Admins told


def test_honeypot_and_rate_limits(client, db_session, admin):
    before = db_session.query(BrandEnquiry).count()
    bot = client.post(PUB, json=_brand_lead(website="http://spam.example"))
    assert bot.status_code == 200  # Looks accepted to the bot…
    db_session.expire_all()
    assert db_session.query(BrandEnquiry).count() == before  # …but nothing is stored

    same = _brand_lead()
    codes = [client.post(PUB, json=same, headers={"x-forwarded-for": "198.51.100.7"}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]  # 3 per number per day
    codes = [client.post(PUB, json=_brand_lead(), headers={"x-forwarded-for": "198.51.100.9"}).status_code for _ in range(6)]
    assert codes == [200] * 5 + [429]  # 5 per address per hour


def test_admin_follow_up_status_notes_and_convert(client, db_session, admin):
    lead = _brand_lead()
    client.post(PUB, json=lead, headers={"x-forwarded-for": "192.0.2.10"})
    data = client.get(ADM, params={"status": "NEW", "search": lead["company_name"]}, headers=admin).json()
    e = data["enquiries"][0]
    assert e["company_name"] == lead["company_name"] and e["phone"] == lead["phone"][-10:] and e["vehicle_interest_label"] == "Auto"
    assert data["counts"]["NEW"] >= 1

    assert client.patch(f"{ADM}/{e['id']}", json={"status": "CONTACTED", "notes": "Called, wants a quote"}, headers=admin).json()["status"] == "CONTACTED"
    assert client.patch(f"{ADM}/{e['id']}", json={"status": "IN_PROGRESS"}, headers=admin).json()["notes"] == "Called, wants a quote"
    assert client.patch(f"{ADM}/{e['id']}", json={"status": "WON"}, headers=admin).status_code == 400
    assert client.patch(f"{ADM}/{e['id']}", json={"status": "CONVERTED"}, headers=admin).status_code == 400  # Must link a brand

    converted = client.post(f"{ADM}/{e['id']}/convert", json={}, headers=admin).json()
    assert converted["status"] == "CONVERTED" and converted["brand"]["name"] == lead["company_name"]
    brand = client.get(f"{API}/brands/{converted['brand']['id']}", headers=admin).json()
    assert brand["contact_person"] == "Priya Nair" and brand["contact_number"] == lead["phone"][-10:]
    assert client.post(f"{ADM}/{e['id']}/convert", json={}, headers=admin).status_code == 400  # Once

    # A second enquiry from the same company links to the existing customer instead of duplicating it.
    client.post(PUB, json={**_brand_lead(), "company_name": lead["company_name"]}, headers={"x-forwarded-for": "192.0.2.11"})
    second = next(x for x in client.get(ADM, params={"status": "NEW"}, headers=admin).json()["enquiries"] if x["company_name"] == lead["company_name"])
    assert client.post(f"{ADM}/{second['id']}/convert", json={}, headers=admin).status_code == 400  # Name taken
    linked = client.post(f"{ADM}/{second['id']}/convert", json={"brand_id": brand["id"]}, headers=admin).json()
    assert linked["brand"]["id"] == brand["id"]

    # Deleting the brand keeps the leads (link cleared).
    client.put(f"{API}/brands/{brand['id']}", json={"is_active": False}, headers=admin)
    assert client.delete(f"{API}/brands/{brand['id']}", headers=admin).status_code == 200
    db_session.expire_all()
    assert db_session.get(BrandEnquiry, e["id"]).brand_id is None

    logs = client.get(f"{API}/audit-logs", headers=admin).json()
    logs = logs if isinstance(logs, list) else logs.get("items", logs.get("logs", []))
    assert {"ENQUIRY_UPDATED", "ENQUIRY_CONVERTED"} <= {r["action"] for r in logs}


def test_riders_cannot_read_enquiries(client, db_session):
    phone = _phone()
    token = client.post(f"{API}/auth/register", json={"full_name": "Nosy Rider", "mobile_number": phone, "password": "riderPass1",
                                                     "vehicle_category": "CYCLE", "selfie": SELFIE}).json()["access_token"]
    assert client.get(ADM, headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_pending_rider_cannot_join_until_approved(client, db_session, admin):
    """The approval gate is enforced by the server, whatever the app shows."""
    phone = _phone()
    reg = client.post(f"{API}/auth/register", json={"full_name": "Pending Rider", "mobile_number": phone, "password": "riderPass1",
                                                   "vehicle_category": "CYCLE", "selfie": SELFIE}).json()
    headers = {"Authorization": f"Bearer {reg['access_token']}"}
    assert reg["status"] == "PENDING"
    brand = client.post(f"{API}/brands", json={"name": f"Gate {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=3)
    c = client.post(f"{API}/campaigns", json={"name": "Gate test", "brand_id": brand["id"], "start_date": start.isoformat(),
                                              "end_date": (start + timedelta(days=3)).isoformat(), "total_slots": 2, "daily_rate": 10,
                                              "visibility": "PUBLIC"}, headers=admin).json()
    res = client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers)
    assert res.status_code == 400 and "approved" in res.json()["detail"]
    card = next(x for x in client.get(f"{API}/riders/me/campaigns", headers=headers).json()["available"] if x["id"] == c["id"])
    assert card["can_join"] is False and "approved" in card["join_blocked_reason"]
    me = client.get(f"{API}/riders/me", headers=headers).json()
    client.patch(f"{API}/admin/riders/{me['id']}/approve", headers=admin)
    assert client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers).status_code == 200


def test_join_refusal_explains_each_rider_status(client, db_session, admin):
    brand = client.post(f"{API}/brands", json={"name": f"Why {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=3)
    c = client.post(f"{API}/campaigns", json={"name": "Why test", "brand_id": brand["id"], "start_date": start.isoformat(),
                                              "end_date": (start + timedelta(days=3)).isoformat(), "total_slots": 2, "daily_rate": 10,
                                              "visibility": "PUBLIC"}, headers=admin).json()
    for action, expected in (("reject", "wasn't approved"), ("suspend", "suspended")):
        reg = client.post(f"{API}/auth/register", json={"full_name": "Status Rider", "mobile_number": _phone(), "password": "riderPass1",
                                                       "vehicle_category": "CYCLE", "selfie": SELFIE}).json()
        headers = {"Authorization": f"Bearer {reg['access_token']}"}
        me = client.get(f"{API}/riders/me", headers=headers).json()
        if action == "suspend":
            client.patch(f"{API}/admin/riders/{me['id']}/approve", headers=admin)
        status = {"reject": "REJECTED", "suspend": "SUSPENDED"}[action]
        assert client.patch(f"{API}/admin/riders/{me['id']}/{action}", json={"status": status, "reason": "Test"}, headers=admin).status_code == 200
        res = client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers)
        assert res.status_code == 400 and expected in res.json()["detail"], (action, res.text)
