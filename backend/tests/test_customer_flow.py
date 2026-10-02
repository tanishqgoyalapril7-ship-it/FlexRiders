import json
import uuid
import pytest
from datetime import date, timedelta
from app.models.campaign_models import CampaignStatus, VehicleCategory
from tests.test_crud import make_admin

API = "/api/v1"


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def test_customer_signup_and_login_flow(client):
    # 1. Customer Signup
    res = client.post(
        f"{API}/customer/auth/signup",
        json={
            "full_name": "Vikram Singh",
            "company_name": "Organic Harvest Ltd",
            "mobile_number": "9811223344",
            "email": "vikram@organicharvest.in",
            "password": "CustomerSecret123", "accept_terms": True,
            "gst_number": "07AAAAA0000A1Z5",
            "company_address": "Cyber Hub, Gurugram, Haryana",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["role"] == "CUSTOMER"
    assert data["brand_id"] is not None
    assert data["brand_name"] == "Organic Harvest Ltd"
    assert data["name"] == "Vikram Singh"
    assert data["access_token"] is not None
    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Duplicate mobile number rejected
    dup = client.post(
        f"{API}/customer/auth/signup",
        json={
            "full_name": "Another Person",
            "company_name": "Organic Harvest Ltd",
            "mobile_number": "9811223344",
            "password": "Password123", "accept_terms": True,
        },
    )
    assert dup.status_code == 400
    assert "already exists" in dup.json()["detail"]

    # 3. Customer Login with mobile number
    login_phone = client.post(
        f"{API}/auth/login",
        json={"phone": "9811223344", "password": "CustomerSecret123"},
    )
    assert login_phone.status_code == 200
    assert login_phone.json()["role"] == "CUSTOMER"
    assert login_phone.json()["brand_id"] == data["brand_id"]

    # 4. Customer Login with email
    login_email = client.post(
        f"{API}/auth/login",
        json={"phone": "vikram@organicharvest.in", "password": "CustomerSecret123"},
    )
    assert login_email.status_code == 200
    assert login_email.json()["role"] == "CUSTOMER"
    assert login_email.json()["brand_name"] == "Organic Harvest Ltd"

    # 5. Check Customer Profile
    prof = client.get(f"{API}/customer/profile", headers=headers)
    assert prof.status_code == 200
    pdata = prof.json()
    assert pdata["company_name"] == "Organic Harvest Ltd"
    assert pdata["gst_number"] == "07AAAAA0000A1Z5"


def test_customer_campaign_creation_draft_and_submission(client, admin):
    # Signup customer
    signup = client.post(
        f"{API}/customer/auth/signup",
        json={
            "full_name": "Meera Patel",
            "company_name": "QuickBite Foods",
            "mobile_number": "9877001122",
            "email": "meera@quickbite.com",
            "password": "SecurePassword999", "accept_terms": True,
        },
    ).json()
    headers = {"Authorization": f"Bearer {signup['access_token']}"}

    today = date.today()
    # 1. Save Draft
    draft_res = client.post(
        f"{API}/customer/campaigns",
        json={
            "name": "Summer Drink Activation",
            "campaign_type": "Product Promotion",
            "campaign_objective": "Drive trial for new iced teas",
            "locations": [
                {"city": "Delhi", "area": "Connaught Place", "address": "Block B", "riders_count": 10},
                {"city": "Gurugram", "area": "Cyber City", "address": "DLF Phase 2", "riders_count": 15},
            ],
            "start_date": (today + timedelta(days=5)).isoformat(),
            "end_date": (today + timedelta(days=15)).isoformat(),
            "daily_start_time": "10:00 AM",
            "daily_end_time": "06:00 PM",
            "total_riders": 25,
            "rider_requirements": {
                "vehicle_type": VehicleCategory.TWO_WHEELER,
                "driving_license_required": True,
                "experience": "1_YEAR",
                "languages": ["Hindi", "English"],
            },
            "budget_type": "PER_DAY",
            "expected_rider_rate": 800,
            "estimated_budget": 200000,
            "instructions": "Distribute sample cans and record daily customer interactions",
            "submit": False,
        },
        headers=headers,
    )
    assert draft_res.status_code == 200, draft_res.text
    draft = draft_res.json()
    assert draft["status"] == "DRAFT"
    assert draft["status_label"] == "Draft"
    assert draft["total_riders"] == 25
    assert len(draft["locations"]) == 2
    assert draft["campaign_code"] == f"CMP-{draft['id']:06d}"  # The same ID the admin and riders see

    # 2. Customer Dashboard shows draft
    dash = client.get(f"{API}/customer/dashboard", headers=headers).json()
    assert dash["company_name"] == "QuickBite Foods"
    assert len(dash["recent_campaigns"]) == 1

    # 3. Submit campaign for review
    submit_res = client.put(
        f"{API}/customer/campaigns/{draft['id']}",
        json={"submit": True},
        headers=headers,
    )
    assert submit_res.status_code == 200
    submitted = submit_res.json()
    assert submitted["status"] == "PENDING_APPROVAL"
    assert submitted["status_label"] == "Pending Admin Review"
    assert submitted["brand_status"] == "REQUESTED"

    # 4. Customer notifications received
    notifs = client.get(f"{API}/customer/notifications", headers=headers).json()
    assert any("Submitted" in n["title"] for n in notifs)

    # 5. Existing Admin Dashboard views the campaign
    admin_view = client.get(f"{API}/campaigns/{draft['id']}", headers=admin)
    assert admin_view.status_code == 200
    c_data = admin_view.json()
    assert c_data["name"] == "Summer Drink Activation"
    assert c_data["status"] == CampaignStatus.PENDING_APPROVAL
    assert c_data["brand_id"] == signup["brand_id"]

    # 6. Admin requests changes
    # Status can't be changed through a plain edit; reviews go through /review.
    client.put(f"{API}/campaigns/{draft['id']}", json={"status": "OPEN"}, headers=admin)
    assert client.get(f"{API}/campaigns/{draft['id']}", headers=admin).json()["status"] == CampaignStatus.PENDING_APPROVAL
    admin_req = client.post(
        f"{API}/campaigns/{draft['id']}/review",
        json={"action": "request_changes", "note": "Please extend campaign duration by 5 more days."},
        headers=admin,
    )
    assert admin_req.status_code == 200

    # 7. Customer sees CHANGES_REQUIRED and feedback
    cust_view = client.get(f"{API}/customer/campaigns/{draft['id']}", headers=headers).json()
    assert cust_view["status"] == "CHANGES_REQUIRED"
    assert "extend campaign duration" in cust_view["admin_feedback"]

    # 8. Customer updates and resubmits
    resubmitted = client.put(
        f"{API}/customer/campaigns/{draft['id']}",
        json={
            "end_date": (today + timedelta(days=20)).isoformat(),
            "submit": True,
        },
        headers=headers,
    ).json()
    assert resubmitted["status"] == "PENDING_APPROVAL"

    # 9. Admin sets commercial terms and approves: the same campaign row becomes an approved draft
    client.put(f"{API}/campaigns/{draft['id']}", json={"brand_contract_value": 220000, "daily_rate": 750}, headers=admin)
    approved = client.post(f"{API}/campaigns/{draft['id']}/review", json={"action": "approve"}, headers=admin).json()
    assert approved["id"] == draft["id"] and approved["brand_id"] == signup["brand_id"]
    assert approved["status"] == CampaignStatus.DRAFT and approved["brand_status"]["key"] == "APPROVED"
    cust = client.get(f"{API}/customer/campaigns/{draft['id']}", headers=headers).json()
    assert cust["brand_status"] == "APPROVED" and cust["status_label"] == "Approved"

    # 10. Approval isn't live: the admin publishes, then the brand sees LIVE and the confirmed contract
    live = client.post(f"{API}/campaigns/{draft['id']}/publish", headers=admin).json()
    assert live["status"] == CampaignStatus.OPEN
    final_cust = client.get(f"{API}/customer/campaigns/{draft['id']}", headers=headers).json()
    assert final_cust["brand_status"] == "LIVE" and final_cust["status_label"] == "Live"
    assert final_cust["contract_amount"] == 220000


def test_customer_security_and_tenant_isolation(client, admin):
    # Customer A
    user_a = client.post(
        f"{API}/customer/auth/signup",
        json={"full_name": "User A", "company_name": "Company Alpha", "mobile_number": "9900112233", "password": "Password123", "accept_terms": True},
    ).json()
    headers_a = {"Authorization": f"Bearer {user_a['access_token']}"}

    # Customer B
    user_b = client.post(
        f"{API}/customer/auth/signup",
        json={"full_name": "User B", "company_name": "Company Beta", "mobile_number": "9900112244", "password": "Password123", "accept_terms": True},
    ).json()
    headers_b = {"Authorization": f"Bearer {user_b['access_token']}"}

    today = date.today()
    # Customer A creates Campaign
    camp_a = client.post(
        f"{API}/customer/campaigns",
        json={
            "name": "Alpha Confidential Promo",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=7)).isoformat(),
            "total_riders": 5,
        },
        headers=headers_a,
    ).json()

    # 1. Customer B attempts to access Customer A's campaign -> MUST BE 404
    idor_view = client.get(f"{API}/customer/campaigns/{camp_a['id']}", headers=headers_b)
    assert idor_view.status_code == 404

    # 2. Customer B attempts to edit Customer A's campaign -> MUST BE 404
    idor_edit = client.put(f"{API}/customer/campaigns/{camp_a['id']}", json={"name": "Hacked"}, headers=headers_b)
    assert idor_edit.status_code == 404

    # 3. Customer A cannot access Admin APIs -> MUST BE 403
    admin_access = client.get(f"{API}/admin/riders", headers=headers_a)
    assert admin_access.status_code == 403

    # 4. Customer A cannot access Rider APIs -> MUST BE 403/404
    rider_access = client.get(f"{API}/riders/me/profile", headers=headers_a)
    assert rider_access.status_code in (403, 404)


def test_brand_signup_requires_and_records_terms(client, db_session):
    from app.models.all_models import PlatformConsent, User

    body = {"full_name": "Terms Owner", "company_name": f"Terms Brand {uuid.uuid4().hex[:5]}", "mobile_number": "9900112299",
            "email": f"{uuid.uuid4().hex[:8]}@brand.in", "password": "Password123"}
    res = client.post(f"{API}/customer/auth/signup", json=body)
    assert res.status_code == 422 and "Terms" in res.json()["detail"]
    assert client.post(f"{API}/customer/auth/signup", json={**body, "accept_terms": True}).status_code == 200
    user = db_session.query(User).filter(User.phone == "9900112299").first()
    consent = db_session.query(PlatformConsent).filter(PlatformConsent.user_id == user.id).first()
    assert consent is not None and consent.terms_version and consent.privacy_version
