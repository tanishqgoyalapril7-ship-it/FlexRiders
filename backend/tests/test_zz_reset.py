"""Data reset (runs last: it wipes application data in the shared test database)."""
import uuid
from datetime import timedelta

from app.core.security import UserRole
from app.models.all_models import AuditLog, Brand, Rider, User
from app.models.campaign_models import Campaign, CampaignActivityPhoto, CampaignDailyActivity
from app.services.campaign_service import today_ist
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


def _seed(client, admin):
    brand = client.post(f"{API}/brands", json={"name": f"Reset Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist()
    campaign = client.post(
        f"{API}/campaigns",
        json={"name": "Reset Campaign", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=3)).isoformat(), "total_slots": 1, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    client.post(f"{API}/campaigns/{campaign['id']}/riders", json={"rider_id": rider["id"]}, headers=admin)
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    upload = client.post(
        f"{API}/riders/me/campaigns/{campaign['id']}/activity",
        files={"photo": ("p.jpg", uuid.uuid4().bytes, "image/jpeg")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert upload.status_code == 200, upload.text
    return brand, campaign, rider


def test_reset_requires_super_admin_and_confirmation(client, db_session, tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    ops, _ = make_admin(client, db_session, role=UserRole.OPERATIONS_ADMIN)
    admin, _ = make_admin(client, db_session)
    assert client.post(f"{API}/admin/system/reset", json={"scope": "all", "confirmation": "RESET"}, headers=ops).status_code == 403
    assert client.post(f"{API}/admin/system/reset", json={"scope": "all", "confirmation": "reset"}, headers=admin).status_code == 400
    assert client.post(f"{API}/admin/system/reset", json={"scope": "nope", "confirmation": "RESET"}, headers=admin).status_code == 400

    _seed(client, admin)
    preview = client.get(f"{API}/admin/system/reset-preview", headers=admin).json()
    activity = next(s for s in preview["scopes"] if s["scope"] == "campaign_activity")
    assert activity["counts"]["photos"] >= 1

    # Activity reset keeps campaigns, riders and brands.
    res = client.post(f"{API}/admin/system/reset", json={"scope": "campaign_activity", "confirmation": "RESET"}, headers=admin).json()
    assert res["removed"]["campaign_activity_photos"] >= 1
    db_session.expire_all()
    assert db_session.query(CampaignActivityPhoto).count() == 0 and db_session.query(CampaignDailyActivity).count() == 0
    assert db_session.query(Campaign).count() >= 1 and db_session.query(Rider).count() >= 1

    # Everything: application data gone, admins and the audit log kept.
    admins_before = db_session.query(User).filter(User.role.in_(UserRole.ADMIN_ROLES)).count()
    res = client.post(f"{API}/admin/system/reset", json={"scope": "all", "confirmation": "RESET"}, headers=admin)
    assert res.status_code == 200, res.text
    db_session.expire_all()
    assert db_session.query(Rider).count() == 0 and db_session.query(Brand).count() == 0 and db_session.query(Campaign).count() == 0
    assert db_session.query(User).filter(User.role == UserRole.RIDER).count() == 0
    assert db_session.query(User).filter(User.role.in_(UserRole.ADMIN_ROLES)).count() == admins_before
    assert db_session.query(AuditLog).filter(AuditLog.action == "DATA_RESET").count() == 2
    # The admin can still work afterwards.
    assert client.get(f"{API}/admin/riders", headers=admin).json() == []
