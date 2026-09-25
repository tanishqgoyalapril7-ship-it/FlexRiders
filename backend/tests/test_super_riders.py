import pytest
from app.core.security import get_password_hash, UserRole
from app.models.all_models import User, Brand, Rider, RiderStatus


def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_auth_and_registration_flow(client, db_session):
    # 1. Create Admin User
    admin = User(
        phone="+919999000001",
        email="testadmin@superriders.com",
        hashed_password=get_password_hash("adminPass123"),
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()

    # 2. Login as Admin
    login_res = client.post(
        "/api/v1/auth/login",
        json={"phone": "+919999000001", "password": "adminPass123"},
    )
    assert login_res.status_code == 200
    admin_token = login_res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 3. Create Brand
    brand_res = client.post(
        "/api/v1/brands",
        json={"name": "Test Quick Brand", "code": "tqb", "description": "Quick logistics"},
        headers=admin_headers,
    )
    assert brand_res.status_code == 200
    brand_id = brand_res.json()["id"]

    # 4. Register New Rider (Multi-Step payload)
    reg_payload = {
        "full_name": "Kavita Rao",
        "mobile_number": "+919811002233",
        "email": "kavita@example.com",
        "dob": "10-02-1999",
        "current_company": "LogiExpress",
        "vehicle_type": "Scooter",
        "vehicle_category": "TWO_WHEELER",
        "vehicle_number": "KA01AB1234",
        "primary_city": "Gurugram",
        "primary_area": "Sector 43",
        "upi_id": "kavita@upi",
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 200
    assert reg_res.json()["status"] == "PENDING"
    sr_id = reg_res.json()["rider_id"]
    assert sr_id.startswith("SR-")

    # 5. Fetch Rider in Admin Pending List
    riders_res = client.get("/api/v1/admin/riders?status_filter=PENDING", headers=admin_headers)
    assert riders_res.status_code == 200
    riders_list = riders_res.json()
    kavita = next((r for r in riders_list if r["rider_id"] == sr_id), None)
    assert kavita is not None
    assert kavita["status"] == "PENDING"

    # 6. Admin Approves Rider
    approve_res = client.patch(f"/api/v1/admin/riders/{kavita['id']}/approve", headers=admin_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "APPROVED"

    # 7. Admin Assigns Brand -> Rider becomes ACTIVE
    assign_res = client.post(
        f"/api/v1/brands/assign/{kavita['id']}",
        json={"brand_id": brand_id, "notes": "Primary partner"},
        headers=admin_headers,
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["rider_status"] == "ACTIVE"

    # 8. Create Payment for Rider
    pay_res = client.post(
        "/api/v1/payments",
        json={"rider_id": kavita["id"], "brand_id": brand_id, "amount": 1500.0, "payment_period": "September 2026"},
        headers=admin_headers,
    )
    assert pay_res.status_code == 200
    payment_id = pay_res.json()["id"]
    assert pay_res.json()["status"] == "PENDING"

    # 9. Process Payment -> Marked PAID with TXN ID
    proc_res = client.post(
        f"/api/v1/payments/{payment_id}/process?action=PAID",
        headers=admin_headers,
    )
    assert proc_res.status_code == 200
    assert proc_res.json()["status"] == "PAID"
    assert proc_res.json()["transaction_id"].startswith("TXN")

    # 10. Rider Login via OTP
    otp_req = client.post("/api/v1/auth/otp/send", json={"phone": "+919811002233"})
    assert otp_req.status_code == 200
    otp_code = otp_req.json()["otp_hint"]

    otp_verify = client.post("/api/v1/auth/otp/verify", json={"phone": "+919811002233", "otp": otp_code})
    assert otp_verify.status_code == 200
    rider_token = otp_verify.json()["access_token"]
    rider_headers = {"Authorization": f"Bearer {rider_token}"}

    # 11. Rider Checks Dashboard & Payment History
    me_res = client.get("/api/v1/riders/me", headers=rider_headers)
    assert me_res.status_code == 200
    assert me_res.json()["status"] == "ACTIVE"
    assert me_res.json()["current_brand"] == "Test Quick Brand"
    assert me_res.json()["paid_earnings"] == 1500.0

    # 12. Admin Dashboard Stats
    dash_res = client.get("/api/v1/reports/dashboard", headers=admin_headers)
    assert dash_res.status_code == 200
    assert dash_res.json()["stats"]["total_riders"] >= 1
