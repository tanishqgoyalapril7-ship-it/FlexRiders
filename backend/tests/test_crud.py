"""CRUD, soft delete and permission rules for riders, brands, campaigns, payments, notifications and admins."""
import uuid
from datetime import timedelta

import pytest

from app.core.security import UserRole, get_password_hash
from app.models.all_models import Notification, Rider, User
from app.services.campaign_service import today_ist

API = "/api/v1"


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def make_admin(client, db_session, role=UserRole.SUPER_ADMIN):
    phone = "+91" + _phone()
    db_session.add(User(phone=phone, email=f"{uuid.uuid4().hex[:8]}@admin.test", hashed_password=get_password_hash("adminPass123"), role=role))
    db_session.commit()
    token = client.post(f"{API}/auth/login", json={"phone": phone, "password": "adminPass123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, phone


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def rider_payload(**extra):
    return {"full_name": "Crud Rider", "mobile_number": _phone(), "password": "riderPass1", "primary_city": "Gurugram", **extra}


def login(client, phone, password="riderPass1"):
    return client.post(f"{API}/auth/login", json={"phone": phone, "password": password})


def test_admin_rider_create_edit_and_uniqueness(client, admin):
    body = rider_payload(vehicle_number="hr26 dk 8337", status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    assert rider["vehicle_number"] == "HR26DK8337" and rider["status"] == "APPROVED"
    assert login(client, body["mobile_number"]).status_code == 200

    # Duplicate vehicle / mobile, invalid vehicle.
    assert client.post(f"{API}/admin/riders", json=rider_payload(vehicle_number="HR26DK8337"), headers=admin).status_code == 400
    assert client.post(f"{API}/admin/riders", json=rider_payload(mobile_number=body["mobile_number"]), headers=admin).status_code == 400
    assert client.post(f"{API}/admin/riders", json=rider_payload(vehicle_number="123"), headers=admin).status_code == 422

    # Edit: new phone becomes the login, optional fields can be cleared.
    new_phone = _phone()
    edited = client.put(f"{API}/admin/riders/{rider['id']}", json={"mobile_number": new_phone, "full_name": "Renamed Rider", "vehicle_number": ""}, headers=admin).json()
    assert edited["mobile_number"] == new_phone and edited["full_name"] == "Renamed Rider" and edited["vehicle_number"] is None
    assert login(client, new_phone).status_code == 200
    assert client.put(f"{API}/admin/riders/{rider['id']}", json={"full_name": " "}, headers=admin).status_code == 400


def test_rider_delete_archive_restore(client, db_session, admin):
    # No history → permanent delete.
    fresh = client.post(f"{API}/admin/riders", json=rider_payload(), headers=admin).json()
    impact = client.get(f"{API}/admin/riders/{fresh['id']}/delete-impact", headers=admin).json()
    assert impact["can_hard_delete"] is True
    assert client.delete(f"{API}/admin/riders/{fresh['id']}", headers=admin).status_code == 200
    assert client.get(f"{API}/admin/riders/{fresh['id']}", headers=admin).status_code == 404

    # With a brand assignment → delete blocked, archive instead.
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    brand = client.post(f"{API}/brands", json={"name": f"Crud Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    assert client.post(f"{API}/brands/assign/{rider['id']}", json={"brand_id": brand["id"]}, headers=admin).status_code == 200
    impact = client.get(f"{API}/admin/riders/{rider['id']}/delete-impact", headers=admin).json()
    assert impact["can_hard_delete"] is False and "brand_assignments" in impact["blocked_by"]
    assert client.delete(f"{API}/admin/riders/{rider['id']}", headers=admin).status_code == 409

    assert client.post(f"{API}/admin/riders/{rider['id']}/archive", json={"reason": "Left the company"}, headers=admin).status_code == 200
    ids = [r["id"] for r in client.get(f"{API}/admin/riders", headers=admin).json()]
    assert rider["id"] not in ids
    archived = client.get(f"{API}/admin/riders?archived=only", headers=admin).json()
    assert any(r["id"] == rider["id"] and r["archive_reason"] == "Left the company" for r in archived)
    detail = client.get(f"{API}/admin/riders/{rider['id']}", headers=admin).json()
    assert detail["current_brand"] is None and len(detail["brand_history"]) == 1  # History kept
    assert login(client, body["mobile_number"]).status_code == 403

    assert client.post(f"{API}/admin/riders/{rider['id']}/restore", headers=admin).status_code == 200
    assert login(client, body["mobile_number"]).status_code == 200


def test_riders_cannot_use_admin_apis(client, admin):
    body = rider_payload()
    client.post(f"{API}/admin/riders", json=body, headers=admin)
    rider = {"Authorization": "Bearer " + login(client, body["mobile_number"]).json()["access_token"]}
    for method, path in (
        ("get", "/admin/riders"), ("post", "/admin/riders"), ("get", "/admin/users"), ("post", "/admin/system/reset"),
        ("delete", "/brands/1"), ("delete", "/campaigns/1"), ("put", "/payments/1"),
    ):
        assert getattr(client, method)(f"{API}{path}", headers=rider).status_code == 403, path
    assert client.get(f"{API}/admin/riders").status_code == 401


def test_otp_cannot_unlock_admin(client, db_session):
    _, phone = make_admin(client, db_session)
    res = client.post(f"{API}/auth/otp/verify", json={"phone": phone, "otp": "123456"})
    assert res.status_code == 403


def _campaign(client, admin, brand_id, **extra):
    start = today_ist()
    body = {"name": f"Crud Campaign {uuid.uuid4().hex[:5]}", "brand_id": brand_id, "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 2, "daily_rate": 10, **extra}
    return client.post(f"{API}/campaigns", json=body, headers=admin).json()


def test_brand_and_campaign_delete_rules(client, admin):
    empty = client.post(f"{API}/brands", json={"name": f"Empty Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    assert client.get(f"{API}/brands/{empty['id']}/delete-impact", headers=admin).json()["can_hard_delete"] is True
    assert client.delete(f"{API}/brands/{empty['id']}", headers=admin).status_code == 200

    brand = client.post(f"{API}/brands", json={"name": f"Busy Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    draft = _campaign(client, admin, brand["id"])
    impact = client.get(f"{API}/brands/{brand['id']}/delete-impact", headers=admin).json()
    assert impact["can_hard_delete"] is False and impact["campaigns"][0]["id"] == draft["id"]
    assert client.delete(f"{API}/brands/{brand['id']}", headers=admin).status_code == 409

    # Draft campaign: deletable.
    assert client.delete(f"{API}/campaigns/{draft['id']}", headers=admin).status_code == 200

    # Published → unpublish (no requests yet) → publish → rider added → no unpublish, no delete; cancel instead.
    live = _campaign(client, admin, brand["id"], visibility="PUBLIC")
    assert live["status"] in ("OPEN", "ACTIVE")
    assert client.post(f"{API}/campaigns/{live['id']}/unpublish", headers=admin).json()["status"] == "DRAFT"
    client.post(f"{API}/campaigns/{live['id']}/publish", headers=admin)
    rider = client.post(f"{API}/admin/riders", json=rider_payload(status="APPROVED"), headers=admin).json()
    added = client.post(f"{API}/campaigns/{live['id']}/riders", json={"rider_id": rider["id"]}, headers=admin)
    assert added.status_code == 200 and added.json()["rider"]["id"] == rider["id"]
    again = client.post(f"{API}/campaigns/{live['id']}/riders", json={"rider_id": rider["id"]}, headers=admin)
    assert again.status_code == 400 and "already part" in again.json()["detail"]
    assert client.post(f"{API}/campaigns/{live['id']}/unpublish", headers=admin).status_code == 400
    impact = client.get(f"{API}/campaigns/{live['id']}/delete-impact", headers=admin).json()
    assert impact["can_hard_delete"] is False and impact["recommended_action"] == "CANCEL"
    assert client.delete(f"{API}/campaigns/{live['id']}", headers=admin).status_code == 409


def test_payment_edit_and_cancel(client, admin):
    rider = client.post(f"{API}/admin/riders", json=rider_payload(status="APPROVED"), headers=admin).json()
    payment = client.post(f"{API}/payments", json={"rider_id": rider["id"], "amount": 500}, headers=admin).json()
    assert payment["payment_period"]  # Current month, no hardcoded default
    assert client.put(f"{API}/payments/{payment['id']}", json={"amount": 650, "notes": "Adjusted"}, headers=admin).json()["amount"] == 650
    assert client.post(f"{API}/payments/{payment['id']}/cancel", json={"reason": "Duplicate entry"}, headers=admin).json()["status"] == "CANCELLED"
    assert client.post(f"{API}/payments/{payment['id']}/process?action=PAID", headers=admin).status_code == 400

    paid = client.post(f"{API}/payments", json={"rider_id": rider["id"], "amount": 100}, headers=admin).json()
    client.post(f"{API}/payments/{paid['id']}/process?action=PAID", headers=admin)
    assert client.put(f"{API}/payments/{paid['id']}", json={"amount": 1}, headers=admin).status_code == 400
    assert client.post(f"{API}/payments/{paid['id']}/cancel", json={"reason": "Nope"}, headers=admin).status_code == 400


def test_notification_delete_is_scoped(client, db_session, admin):
    a, b = rider_payload(), rider_payload()
    for body in (a, b):
        client.post(f"{API}/admin/riders", json=body, headers=admin)
    users = {body["mobile_number"]: db_session.query(User).filter(User.phone == body["mobile_number"]).one() for body in (a, b)}
    for user in users.values():
        db_session.add(Notification(user_id=user.id, title="Hi", message="Hello"))
    db_session.commit()
    other_id = db_session.query(Notification).filter(Notification.user_id == users[b["mobile_number"]].id).first().id
    headers = {"Authorization": "Bearer " + login(client, a["mobile_number"]).json()["access_token"]}

    assert client.delete(f"{API}/notifications/{other_id}", headers=headers).status_code == 404
    mine = client.get(f"{API}/notifications", headers=headers).json()
    assert len(mine) == 1
    assert client.delete(f"{API}/notifications/{mine[0]['id']}", headers=headers).status_code == 200
    assert client.get(f"{API}/notifications", headers=headers).json() == []
    assert db_session.query(Notification).filter(Notification.id == other_id).count() == 1


def test_rider_profile_edit_and_account_deletion(client, db_session, admin):
    body = rider_payload(upi_id="crud@upi", status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    headers = {"Authorization": "Bearer " + login(client, body["mobile_number"]).json()["access_token"]}
    me = client.patch(f"{API}/riders/me", json={"upi_id": "", "primary_area": "Sector 29"}, headers=headers).json()
    assert me["upi_id"] is None and me["primary_area"] == "Sector 29"

    assert client.request("DELETE", f"{API}/riders/me", json={"password": "wrong"}, headers=headers).status_code == 400
    res = client.request("DELETE", f"{API}/riders/me", json={"password": "riderPass1"}, headers=headers).json()
    assert res["deleted"] is True  # No history: fully removed
    assert db_session.query(Rider).filter(Rider.id == rider["id"]).count() == 0
    assert login(client, body["mobile_number"]).status_code == 401

    # With history (a payment) the account is deactivated instead, and the payment is kept.
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    client.post(f"{API}/payments", json={"rider_id": rider["id"], "amount": 50}, headers=admin)
    headers = {"Authorization": "Bearer " + login(client, body["mobile_number"]).json()["access_token"]}
    res = client.request("DELETE", f"{API}/riders/me", json={"password": "riderPass1"}, headers=headers).json()
    assert res["deleted"] is False
    assert login(client, body["mobile_number"]).status_code == 403
    assert client.get(f"{API}/payments?rider_id={rider['id']}", headers=admin).json()[0]["amount"] == 50


def test_admin_accounts(client, db_session):
    super_headers, _ = make_admin(client, db_session)
    ops_headers, _ = make_admin(client, db_session, role=UserRole.OPERATIONS_ADMIN)
    body = {"email": f"{uuid.uuid4().hex[:6]}@team.test", "phone": _phone(), "password": "financePass1", "role": "FINANCE_ADMIN"}
    assert client.post(f"{API}/admin/users", json=body, headers=ops_headers).status_code == 403
    created = client.post(f"{API}/admin/users", json=body, headers=super_headers).json()
    assert created["role"] == "FINANCE_ADMIN"
    assert client.post(f"{API}/admin/users", json=body, headers=super_headers).status_code == 400  # Duplicate
    assert client.put(f"{API}/admin/users/{created['id']}", json={"role": "OPERATIONS_ADMIN"}, headers=super_headers).json()["role"] == "OPERATIONS_ADMIN"
    assert client.delete(f"{API}/admin/users/{created['id']}", headers=super_headers).json()["is_active"] is False
    assert client.post(f"{API}/auth/login", json={"phone": body["phone"], "password": "financePass1"}).status_code == 403

    me = client.get(f"{API}/admin/users/me", headers=super_headers).json()
    assert client.delete(f"{API}/admin/users/{me['id']}", headers=super_headers).status_code == 400  # Not yourself
