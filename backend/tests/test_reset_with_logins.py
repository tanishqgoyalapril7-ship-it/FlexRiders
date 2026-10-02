"""Reset and delete with brand logins and self-made audit entries, with foreign keys ENFORCED (like Postgres).
SQLite ignores foreign keys unless asked, which is how a live-only reset failure slipped through before."""
import uuid

from sqlalchemy.orm import sessionmaker

from app.models.all_models import AuditLog, Brand, Rider, User
from app.services import data_admin_service as das
from tests.conftest import engine
from tests.test_crud import make_admin

API = "/api/v1"


def _strict_session():
    conn = engine.connect()
    conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    return conn, sessionmaker(bind=conn)()


def _brand_signup(client, phone):
    res = client.post(f"{API}/customer/auth/signup", json={
        "full_name": "Owner", "company_name": f"Reset Brand {uuid.uuid4().hex[:5]}", "mobile_number": phone,
        "email": f"{uuid.uuid4().hex[:8]}@brand.in", "password": "Password123", "accept_terms": True})
    assert res.status_code == 200, res.text
    return res.json()


def test_reset_all_with_brand_logins_and_rider_audit_entries(client, db_session):
    make_admin(client, db_session)
    _brand_signup(client, "9911000001")  # A brand login + an audit entry made by that login
    customer = db_session.query(User).filter(User.phone == "9911000001").first()
    db_session.add(AuditLog(admin_id=customer.id, admin_email="brand-login", action="TEST_SELF_ACTION", target_type="BRAND", target_id="x", details="made by the brand login"))
    db_session.commit()

    conn, strict = _strict_session()
    try:
        admin = strict.query(User).filter(User.role == "SUPER_ADMIN").first()
        das.reset_data(strict, "all", "RESET", admin)
        assert strict.query(Brand).count() == 0 and strict.query(Rider).count() == 0
        assert strict.query(User).filter(User.role.in_(("CUSTOMER", "RIDER"))).count() == 0
        kept = strict.query(AuditLog).filter(AuditLog.action == "TEST_SELF_ACTION").first()
        assert kept is not None and kept.admin_id is None  # The audit log is kept, just unlinked
    finally:
        strict.close()
        conn.close()


def test_single_brand_delete_removes_its_logins(client, db_session):
    make_admin(client, db_session)
    _brand_signup(client, "9911000002")
    customer = db_session.query(User).filter(User.phone == "9911000002").first()
    brand_id = customer.brand_id
    conn, strict = _strict_session()
    try:
        admin = strict.query(User).filter(User.role == "SUPER_ADMIN").first()
        das.hard_delete_brand(strict, strict.get(Brand, brand_id), admin)
        assert strict.get(Brand, brand_id) is None
        assert strict.query(User).filter(User.phone == "9911000002").first() is None
    finally:
        strict.close()
        conn.close()
