"""Tests for Brand Payment Tracking System:
1. Create Brand -> payment account available.
2. Record first payment.
3. Record second payment.
4. Partial payment calculation.
5. Full payment calculation.
6. Multiple payment history.
7. Remaining amount calculation.
8. Payment status calculation.
9. Invalid amount rejected.
10. Payment exceeding remaining amount rejected.
11. Unauthorized user cannot create payment.
12. Unauthorized user cannot view payment.
13. Cancel payment record recalculates financials.
14. Campaign-linked payment.
15. Brand-level payment.
16. Admin dashboard totals match payment records.
17. Brand/customer dashboard totals match Admin totals.
"""
import uuid
from datetime import timedelta
import pytest

from app.core.config import settings
from app.models.all_models import Payment, User
from app.models.campaign_models import BrandPaymentRecord, BrandPaymentRecordStatus
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE
from tests.test_crud import make_admin

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _rider(client, admin):
    body = {
        "accept_terms": True,
        "full_name": "Rider Auth",
        "mobile_number": _phone(),
        "password": "riderPass1",
        "vehicle_category": "CYCLE",
        "selfie": SELFIE,
    }
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 200, res.text
    return {"Authorization": "Bearer " + res.json()["access_token"]}


def test_brand_creation_with_payment_account(client, admin):
    """1. Create Brand -> payment account available."""
    res = client.post(
        f"{API}/brands",
        json={"name": f"Brand {uuid.uuid4().hex[:6]}", "contract_amount": 50000},
        headers=admin,
    )
    assert res.status_code == 200
    b = res.json()
    assert b["contract_amount"] == 50000
    assert b["total_contract_value"] == 50000
    assert b["total_paid"] == 0
    assert b["remaining_amount"] == 50000
    assert b["payment_status"] == "PENDING"

    # Detail endpoint also includes payment account
    detail = client.get(f"{API}/brands/{b['id']}", headers=admin).json()
    assert detail["payment_account"]["contract_value"] == 50000
    assert detail["payment_account"]["remaining_amount"] == 50000
    assert detail["payment_account"]["total_paid"] == 0
    assert detail["payment_account"]["payment_status"] == "PENDING"


def test_record_multiple_payments_and_financials(client, admin):
    """2. Record first payment, 3. Record second payment, 4. Partial payment,
    5. Full payment, 6. History, 7. Remaining, 8. Status calculation."""
    b = client.post(
        f"{API}/brands",
        json={"name": f"Brand {uuid.uuid4().hex[:6]}", "contract_amount": 50000},
        headers=admin,
    ).json()
    brand_id = b["id"]
    day = today_ist().isoformat()

    # Initial state
    summary = client.get(f"{API}/brands/{brand_id}/payment-summary", headers=admin).json()
    assert summary["contract_value"] == 50000
    assert summary["total_paid"] == 0
    assert summary["remaining_amount"] == 50000
    assert summary["payment_status"] == "PENDING"

    # Payment #1: ₹20,000 via UPI
    pay1 = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={
            "kind": "RECEIVED",
            "amount": 20000,
            "payment_mode": "UPI",
            "record_date": day,
            "reference": "UPI-12345",
            "note": "Advance payment",
        },
        headers=admin,
    )
    assert pay1.status_code == 200, pay1.text
    data1 = pay1.json()
    s1 = data1["summary"]
    assert s1["contract_value"] == 50000
    assert s1["total_paid"] == 20000
    assert s1["remaining_amount"] == 30000
    assert s1["payment_status"] == "PARTIALLY_PAID"
    assert len(data1["records"]) == 1
    assert data1["records"][0]["amount"] == 20000
    assert data1["records"][0]["payment_mode"] == "UPI"
    assert data1["records"][0]["reference"] == "UPI-12345"
    assert data1["records"][0]["status"] == "RECORDED"

    # Payment #2: ₹30,000 via Bank Transfer (Paid in full)
    pay2 = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={
            "kind": "RECEIVED",
            "amount": 30000,
            "payment_mode": "BANK_TRANSFER",
            "record_date": day,
            "reference": "NEFT-67890",
            "note": "Final settlement",
        },
        headers=admin,
    )
    assert pay2.status_code == 200, pay2.text
    data2 = pay2.json()
    s2 = data2["summary"]
    assert s2["contract_value"] == 50000
    assert s2["total_paid"] == 50000
    assert s2["remaining_amount"] == 0
    assert s2["payment_status"] == "PAID"
    assert len(data2["records"]) == 2
    # Check history ordering (newest first)
    assert [r["amount"] for r in data2["records"]] == [30000, 20000]
    assert [r["payment_mode"] for r in data2["records"]] == ["BANK_TRANSFER", "UPI"]


def test_payment_validation_amount_and_exceeding_remaining(client, admin):
    """9. Invalid amount rejected, 10. Payment exceeding remaining amount rejected."""
    b = client.post(
        f"{API}/brands",
        json={"name": f"Brand {uuid.uuid4().hex[:6]}", "contract_amount": 50000},
        headers=admin,
    ).json()
    brand_id = b["id"]
    day = today_ist().isoformat()

    # Zero amount rejected
    res = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={"kind": "RECEIVED", "amount": 0, "payment_mode": "UPI", "record_date": day},
        headers=admin,
    )
    assert res.status_code == 422

    # Negative amount rejected
    res = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={"kind": "RECEIVED", "amount": -100, "payment_mode": "UPI", "record_date": day},
        headers=admin,
    )
    assert res.status_code == 422

    # Missing payment mode for RECEIVED rejected
    res = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={"kind": "RECEIVED", "amount": 1000, "record_date": day},
        headers=admin,
    )
    assert res.status_code == 422

    # Payment exceeding contract amount (₹60,000 > ₹50,000 remaining)
    res = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={"kind": "RECEIVED", "amount": 60000, "payment_mode": "UPI", "record_date": day},
        headers=admin,
    )
    assert res.status_code == 400
    assert "exceeds remaining amount" in res.json()["detail"]


def test_unauthorized_user_cannot_access_or_create_payment(client, admin):
    """11. Unauthorized user cannot create payment, 12. Cannot view payment."""
    b = client.post(
        f"{API}/brands",
        json={"name": f"Brand {uuid.uuid4().hex[:6]}", "contract_amount": 50000},
        headers=admin,
    ).json()
    brand_id = b["id"]
    rider_headers = _rider(client, admin)

    # Rider cannot view brand payments
    assert client.get(f"{API}/brands/{brand_id}/payments", headers=rider_headers).status_code == 403
    assert client.get(f"{API}/brands/{brand_id}/payment-summary", headers=rider_headers).status_code == 403

    # Unauthenticated cannot view brand payments
    assert client.get(f"{API}/brands/{brand_id}/payments").status_code == 401

    # Rider cannot create brand payment
    res = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={"kind": "RECEIVED", "amount": 5000, "payment_mode": "CASH", "record_date": today_ist().isoformat()},
        headers=rider_headers,
    )
    assert res.status_code == 403


def test_payment_cancellation_and_recalculation(client, admin):
    """13. Erroneous payment cancellation recalculates financials."""
    b = client.post(
        f"{API}/brands",
        json={"name": f"Brand {uuid.uuid4().hex[:6]}", "contract_amount": 50000},
        headers=admin,
    ).json()
    brand_id = b["id"]
    day = today_ist().isoformat()

    pay = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={"kind": "RECEIVED", "amount": 25000, "payment_mode": "IMPS", "record_date": day},
        headers=admin,
    ).json()
    record_id = pay["records"][0]["id"]
    assert pay["summary"]["remaining_amount"] == 25000
    assert pay["summary"]["payment_status"] == "PARTIALLY_PAID"

    # Cancel the payment entry
    cancel_res = client.post(
        f"{API}/brands/{brand_id}/payments/{record_id}/cancel",
        json={"reason": "Incorrect amount keyed in"},
        headers=admin,
    )
    assert cancel_res.status_code == 200, cancel_res.text
    after_cancel = cancel_res.json()
    assert after_cancel["summary"]["total_paid"] == 0
    assert after_cancel["summary"]["remaining_amount"] == 50000
    assert after_cancel["summary"]["payment_status"] == "PENDING"
    cancelled_rec = next(r for r in after_cancel["records"] if r["id"] == record_id)
    assert cancelled_rec["status"] == "CANCELLED"
    assert cancelled_rec["cancel_reason"] == "Incorrect amount keyed in"


def test_campaign_linked_and_brand_level_payments(client, admin):
    """14. Campaign-linked payment, 15. Brand-level payment, 16. Admin & 17. Brand dashboard consistency."""
    brand = client.post(
        f"{API}/brands",
        json={"name": f"Brand {uuid.uuid4().hex[:6]}", "contract_amount": 50000},
        headers=admin,
    ).json()
    brand_id = brand["id"]

    start = today_ist() + timedelta(days=2)
    campaign = client.post(
        f"{API}/campaigns",
        json={
            "name": "Summer Boost",
            "brand_id": brand_id,
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=7)).isoformat(),
            "total_slots": 5,
            "daily_rate": 60,
            "brand_contract_value": 30000,
            "visibility": "PUBLIC",
        },
        headers=admin,
    ).json()
    campaign_id = campaign["id"]

    day = today_ist().isoformat()

    # Record Campaign-specific payment
    pay_camp = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={
            "kind": "RECEIVED",
            "amount": 15000,
            "payment_mode": "Card",
            "campaign_id": campaign_id,
            "record_date": day,
            "reference": "CARD-999",
        },
        headers=admin,
    ).json()
    assert pay_camp["records"][0]["campaign_id"] == campaign_id
    assert pay_camp["records"][0]["campaign_name"] == "Summer Boost"
    assert pay_camp["records"][0]["payment_mode"] == "CARD"

    # Record General Brand payment (no campaign_id)
    pay_gen = client.post(
        f"{API}/brands/{brand_id}/payments",
        json={
            "kind": "RECEIVED",
            "amount": 20000,
            "payment_mode": "CHEQUE",
            "record_date": day,
            "reference": "CHQ-1001",
        },
        headers=admin,
    ).json()
    assert pay_gen["records"][0]["campaign_id"] is None
    assert pay_gen["records"][0]["campaign_name"] == "General Brand Payment"

    # Total paid = 15000 + 20000 = 35000; Contract = 50000; Remaining = 15000
    summary = client.get(f"{API}/brands/{brand_id}/payment-summary", headers=admin).json()
    assert summary["total_paid"] == 35000
    assert summary["remaining_amount"] == 15000
    assert summary["payment_status"] == "PARTIALLY_PAID"

    # Customer/Brand dashboard totals match Admin totals
    dash = client.get(f"{API}/brands/{brand_id}/dashboard", headers=admin).json()
    assert dash["totals"]["contract_value"] == 50000
    assert dash["totals"]["received"] == 35000
    assert dash["totals"]["outstanding"] == 15000
    assert dash["totals"]["payment_status"] == "PARTIALLY_PAID"

    # Brand payments in customer dashboard include both payments
    brand_dash_records = [p for p in dash["payments"] if p["type"] == "BRAND_RECEIVED"]
    assert len(brand_dash_records) == 2
    assert {p["amount"] for p in brand_dash_records} == {15000, 20000}
