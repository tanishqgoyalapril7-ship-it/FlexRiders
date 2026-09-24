"""End-to-end brand flow, starting from a completely empty database."""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, get_db
from app.core.security import UserRole, get_password_hash
from app.main import app
from app.models.all_models import User

API = "/api/v1"


@pytest.fixture
def empty_client(tmp_path):
    """A client backed by a brand-new, empty SQLite database (only one admin user)."""
    engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()
    db.add(User(phone="+919000000001", email="fresh@admin.com", hashed_password=get_password_hash("adminPass1"), role=UserRole.SUPER_ADMIN))
    db.commit()

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    db.close()
    engine.dispose()


def test_empty_database_to_campaign(empty_client):
    c = empty_client
    admin = {"Authorization": "Bearer " + c.post(f"{API}/auth/login", json={"phone": "+919000000001", "password": "adminPass1"}).json()["access_token"]}

    # 1. Empty database: no brands, riders or campaigns, and nothing on the dashboard.
    assert c.get(f"{API}/brands").json() == []
    assert c.get(f"{API}/admin/riders", headers=admin).json() == []
    assert c.get(f"{API}/campaigns", headers=admin).json() == []
    assert c.get(f"{API}/reports/dashboard", headers=admin).json()["brand_distribution"] == []

    # 2. Admin creates Brand A.
    brand = c.post(f"{API}/brands", json={"name": "Brand A", "code": "BRA-001", "description": "Test partner"}, headers=admin).json()
    assert [b["name"] for b in c.get(f"{API}/brands").json()] == ["Brand A"]
    assert c.post(f"{API}/brands", json={"name": "brand a"}, headers=admin).status_code == 400  # duplicate name

    # 3. A new rider registers; a pending rider cannot be assigned.
    reg = c.post(f"{API}/auth/register", json={"full_name": "Rahul Sharma", "mobile_number": "9876500001", "password": "riderPass1", "primary_city": "Gurugram"}).json()
    rider_headers = {"Authorization": f"Bearer {reg['access_token']}"}
    rider_id = c.get(f"{API}/admin/riders", headers=admin).json()[0]["id"]
    res = c.post(f"{API}/brands/assign/{rider_id}", json={"brand_id": brand["id"]}, headers=admin)
    assert res.status_code == 400 and "approved" in res.json()["detail"]

    # 4. Admin approves the rider: the app shows "approved", no brand yet.
    c.patch(f"{API}/admin/riders/{rider_id}/approve", headers=admin)
    me = c.get(f"{API}/riders/me", headers=rider_headers).json()
    assert me["status"] == "APPROVED" and me["current_brand"] is None

    # 5. Assignment rules: brand must exist and date cannot be in the future.
    assert c.post(f"{API}/brands/assign/{rider_id}", json={"brand_id": 999}, headers=admin).status_code == 404
    future = (date.today() + timedelta(days=1)).isoformat()
    assert c.post(f"{API}/brands/assign/{rider_id}", json={"brand_id": brand["id"], "assignment_date": future}, headers=admin).status_code == 400

    # 6. Admin assigns Brand A; the rider app receives it.
    res = c.post(f"{API}/brands/assign/{rider_id}", json={"brand_id": brand["id"]}, headers=admin)
    assert res.status_code == 200, res.text
    me = c.get(f"{API}/riders/me", headers=rider_headers).json()
    assert me["current_brand"] == "Brand A" and me["status"] == "ACTIVE"
    assert me["brand_history"][0]["brand_name"] == "Brand A"
    titles = [n["title"] for n in c.get(f"{API}/notifications", headers=rider_headers).json()]
    assert "Brand Assigned" in titles
    assert c.get(f"{API}/brands").json()[0]["active_riders_count"] == 1
    assert c.post(f"{API}/brands/assign/{rider_id}", json={"brand_id": brand["id"]}, headers=admin).status_code == 400  # already assigned

    # 7. Admin creates a campaign for Brand A (starting tomorrow); the rider sees it and can join.
    start = (date.today() + timedelta(days=1)).isoformat()
    end = (date.today() + timedelta(days=29)).isoformat()
    campaign = c.post(
        f"{API}/campaigns",
        json={"name": "Brand A Launch", "brand_id": brand["id"], "start_date": start, "end_date": end, "total_slots": 5, "daily_rate": 10, "visibility": "PUBLIC"},
        headers=admin,
    ).json()
    assert campaign["brand_name"] == "Brand A"
    available = c.get(f"{API}/riders/me/campaigns", headers=rider_headers).json()["available"]
    assert available[0]["id"] == campaign["id"] and available[0]["can_join"] is True

    # 8. A deactivated brand is hidden from pickers and blocked for new work; history is kept.
    c.put(f"{API}/brands/{brand['id']}", json={"is_active": False}, headers=admin)
    assert c.get(f"{API}/brands?active_only=true").json() == []
    assert len(c.get(f"{API}/brands").json()) == 1
    res = c.post(
        f"{API}/campaigns",
        json={"name": "Blocked", "brand_id": brand["id"], "start_date": start, "end_date": end, "total_slots": 1, "daily_rate": 10},
        headers=admin,
    )
    assert res.status_code == 400 and "inactive" in res.json()["detail"]
    assert c.get(f"{API}/riders/me", headers=rider_headers).json()["current_brand"] == "Brand A"

    # 9. Ending the assignment keeps the brand and history; the rider is approved again.
    assert c.delete(f"{API}/brands/unassign/{rider_id}", headers=admin).json()["rider_status"] == "APPROVED"
    me = c.get(f"{API}/riders/me", headers=rider_headers).json()
    assert me["current_brand"] is None and me["status"] == "APPROVED"
    detail = c.get(f"{API}/brands/{brand['id']}", headers=admin).json()
    assert len(detail["assignments"]) == 1 and detail["assignments"][0]["is_current"] is False
