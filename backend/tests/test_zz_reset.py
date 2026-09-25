"""Data reset (runs last: it wipes application data in the shared test database)."""
import uuid
from datetime import timedelta

from app.core.security import UserRole
from app.models.all_models import AuditLog, Brand, Rider, User
from app.models.campaign_models import Campaign, CampaignActivityPhoto, CampaignDailyActivity, CampaignTerms, CampaignTermsAcceptance
from app.services.campaign_service import today_ist
from tests.conftest import before_start
from tests.test_crud import make_admin, rider_payload

TERMS = "Retention test terms: riders wear the campaign T-shirt on every campaign day."

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


def _seed_terms(client, db_session, admin):
    """A campaign with published terms and a rider who accepted them while joining."""
    brand = client.post(f"{API}/brands", json={"name": f"Terms Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=3)
    campaign = client.post(
        f"{API}/campaigns",
        json={"name": "Terms Retention Campaign", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=3)).isoformat(), "total_slots": 2, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()
    assert client.post(f"{API}/campaigns/{campaign['id']}/terms", json={"body": TERMS}, headers=admin).status_code == 200
    body = rider_payload(status="APPROVED")
    rider = client.post(f"{API}/admin/riders", json=body, headers=admin).json()
    token = client.post(f"{API}/auth/login", json={"phone": body["mobile_number"], "password": "riderPass1"}).json()["access_token"]
    joined = client.post(f"{API}/riders/me/campaigns/{campaign['id']}/join", json={"terms_version": 1}, headers={"Authorization": f"Bearer {token}"})
    assert joined.status_code == 200, joined.text
    return campaign, rider


def _history(db_session):
    db_session.expire_all()
    return (
        sorted((t.campaign_id, t.version, t.body) for t in db_session.query(CampaignTerms).all()),
        sorted((a.rider_id, a.terms_version, a.rider_code, a.campaign_name) for a in db_session.query(CampaignTermsAcceptance).all()),
    )


def test_reset_requires_super_admin_and_confirmation(client, db_session, tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    ops, _ = make_admin(client, db_session, role=UserRole.OPERATIONS_ADMIN)
    admin, _ = make_admin(client, db_session)
    assert client.post(f"{API}/admin/system/reset", json={"scope": "all", "confirmation": "RESET"}, headers=ops).status_code == 403
    assert client.post(f"{API}/admin/system/reset", json={"scope": "all", "confirmation": "reset"}, headers=admin).status_code == 400
    assert client.post(f"{API}/admin/system/reset", json={"scope": "nope", "confirmation": "RESET"}, headers=admin).status_code == 400

    _seed(client, admin)
    _seed_terms(client, db_session, admin)
    history_before = _history(db_session)
    assert history_before[0] and history_before[1]
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
    # Terms versions and acceptances are permanent: the full reset removed none of them.
    assert _history(db_session) == history_before


def test_campaign_and_rider_resets_keep_terms_history(client, db_session):
    admin, _ = make_admin(client, db_session)
    campaign, rider = _seed_terms(client, db_session, admin)
    before = _history(db_session)
    mine = [a for a in before[1] if a[0] == rider["id"]]
    assert mine == [(rider["id"], 1, rider["rider_id"], "Terms Retention Campaign")]  # Snapshot of who and what
    for scope in ("campaign_activity", "campaigns", "riders"):
        res = client.post(f"{API}/admin/system/reset", json={"scope": scope, "confirmation": "RESET"}, headers=admin)
        assert res.status_code == 200, res.text
        assert _history(db_session) == before, scope
    db_session.expire_all()
    assert db_session.query(Campaign).filter(Campaign.id == campaign["id"]).count() == 0  # The campaign itself is gone
    assert db_session.query(Rider).filter(Rider.id == rider["id"]).count() == 0  # ...and the rider

