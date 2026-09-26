"""Forgot password by email, admin reset with a forced change, sign-out of old logins, email at registration."""
import re
import uuid
from datetime import datetime, timedelta

import pytest

from app.core.config import settings
from app.core.security import UserRole
from app.models.all_models import EmailCode, User
from app.services import email_service as mail
from tests.conftest import SELFIE
from tests.test_crud import make_admin

API = "/api/v1"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def outbox(monkeypatch):
    """Email sending switched on, with every email captured instead of sent."""
    sent = []
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(mail, "send", lambda to, subject, text, html: sent.append({"to": to, "subject": subject, "text": text}) or True)
    return sent


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _code(outbox, to):
    return re.search(r"\b(\d{6})\b", [m for m in outbox if m["to"] == to][-1]["text"]).group(1)


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def _register(client, outbox, email=None, **extra):
    phone = _phone()
    email = email or f"{uuid.uuid4().hex[:10]}@example.com"
    assert client.post(f"{API}/auth/email/verification-code", json={"email": email}).status_code == 200
    body = {"accept_terms": True, "full_name": "Mail Rider", "mobile_number": phone, "password": "oldPass123", "vehicle_category": "CYCLE",
            "selfie": SELFIE, "email": email, "email_code": _code(outbox, email), **extra}
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 200, res.text
    return phone, email, {"Authorization": "Bearer " + res.json()["access_token"]}


def _login(client, phone, password):
    return client.post(f"{API}/auth/login", json={"phone": phone, "password": password})


# --------------------------------------------------------------------------- registration email

def test_registration_email_is_verified_when_sending_is_on(client, db_session, outbox):
    email = f"{uuid.uuid4().hex[:8]}@Example.com"
    base = {"accept_terms": True, "full_name": "Reg", "mobile_number": _phone(), "password": "regPass123", "vehicle_category": "CYCLE", "selfie": SELFIE}
    assert client.post(f"{API}/auth/register", json=base).status_code == 422  # Email required
    assert client.post(f"{API}/auth/register", json={**base, "email": email, "email_code": "000000"}).status_code == 400
    assert client.post(f"{API}/auth/email/verification-code", json={"email": "not-an-email"}).status_code == 422
    assert client.post(f"{API}/auth/email/verification-code", json={"email": email}).status_code == 200
    code = _code(outbox, email.lower())
    assert "verification code" in outbox[-1]["subject"]
    res = client.post(f"{API}/auth/register", json={**base, "email": email, "email_code": code})
    assert res.status_code == 200, res.text
    db_session.expire_all()
    user = db_session.query(User).filter(User.email == email.lower()).one()
    assert user.email_verified_at is not None
    # The code worked once; the same email can't be used again.
    assert client.post(f"{API}/auth/email/verification-code", json={"email": email}).status_code == 400
    again = client.post(f"{API}/auth/register", json={**base, "mobile_number": _phone(), "email": email, "email_code": code})
    assert again.status_code == 400
    # Codes are never stored in readable form.
    assert all(code not in (r.code_hash or "") for r in db_session.query(EmailCode).all())


def test_without_email_sending_email_stays_optional(client):
    assert not mail.delivery_available()
    res = client.post(f"{API}/auth/register", json={"accept_terms": True, "full_name": "NoMail", "mobile_number": _phone(), "password": "regPass123",
                                                   "vehicle_category": "CYCLE", "selfie": SELFIE})
    assert res.status_code == 200
    assert client.post(f"{API}/auth/email/verification-code", json={"email": "a@b.co"}).status_code == 400


# --------------------------------------------------------------------------- forgot / reset

def test_forgot_and_reset_by_phone_or_email(client, db_session, outbox):
    phone, email, old_headers = _register(client, outbox)
    for identifier in (f"+91 {phone}", email.upper()):
        res = client.post(f"{API}/auth/password/forgot", json={"identifier": identifier})
        assert res.status_code == 200 and "6-digit code" in res.json()["message"]
    code = _code(outbox, email)
    assert "reset" in outbox[-1]["subject"]
    # Only the newest code works; wrong codes are refused.
    assert client.post(f"{API}/auth/password/reset", json={"identifier": phone, "code": "123456", "new_password": "newPass456"}).status_code == 400
    ok = client.post(f"{API}/auth/password/reset", json={"identifier": phone, "code": code, "new_password": "newPass456"})
    assert ok.status_code == 200
    # Single use; old password dead; old login signed out; new password works.
    assert client.post(f"{API}/auth/password/reset", json={"identifier": phone, "code": code, "new_password": "other789"}).status_code == 400
    assert _login(client, phone, "oldPass123").status_code == 401
    assert client.get(f"{API}/riders/me", headers=old_headers).status_code == 401
    assert _login(client, phone, "newPass456").status_code == 200


def test_forgot_gives_the_same_answer_for_every_account(client, db_session, outbox, admin):
    phone, email, _ = _register(client, outbox)
    answers = {client.post(f"{API}/auth/password/forgot", json={"identifier": x}).json()["message"]
               for x in (phone, "9000000000", "nobody@example.com", "junk")}
    assert len(answers) == 1  # Registered, unknown and invalid all look the same
    # Admin accounts are never reset by email.
    admin_user = db_session.query(User).filter(User.role == UserRole.SUPER_ADMIN).first()
    admin_user.email = "boss@example.com"
    db_session.commit()
    before = len(outbox)
    client.post(f"{API}/auth/password/forgot", json={"identifier": "boss@example.com"})
    assert len(outbox) == before


def test_code_expiry_attempts_and_rate_limits(client, db_session, outbox):
    phone, email, _ = _register(client, outbox)
    client.post(f"{API}/auth/password/forgot", json={"identifier": phone})
    code = _code(outbox, email)
    for _ in range(5):
        client.post(f"{API}/auth/password/reset", json={"identifier": phone, "code": "000000", "new_password": "newPass456"})
    # After 5 wrong tries even the right code is refused.
    assert client.post(f"{API}/auth/password/reset", json={"identifier": phone, "code": code, "new_password": "newPass456"}).status_code == 400
    # Expired codes are refused.
    client.post(f"{API}/auth/password/forgot", json={"identifier": phone})
    fresh = _code(outbox, email)
    db_session.expire_all()
    row = db_session.query(EmailCode).filter(EmailCode.email == email, EmailCode.purpose == mail.RESET, EmailCode.used_at.is_(None)).one()
    row.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db_session.commit()
    assert client.post(f"{API}/auth/password/reset", json={"identifier": phone, "code": fresh, "new_password": "newPass456"}).status_code == 400
    # At most 3 reset emails per address per hour (the answer stays the same).
    sent_before = len([m for m in outbox if m["to"] == email and "reset" in m["subject"]])
    for _ in range(3):
        assert client.post(f"{API}/auth/password/forgot", json={"identifier": phone}).status_code == 200
    sent_after = len([m for m in outbox if m["to"] == email and "reset" in m["subject"]])
    assert sent_after - sent_before <= 1 and sent_after == 3


# --------------------------------------------------------------------------- admin reset + forced change

def test_admin_reset_forces_a_new_password(client, db_session, admin):
    phone = _phone()
    reg = client.post(f"{API}/auth/register", json={"accept_terms": True, "full_name": "Forgetful", "mobile_number": phone, "password": "oldPass123",
                                                   "vehicle_category": "CYCLE", "selfie": SELFIE}).json()
    old = {"Authorization": "Bearer " + reg["access_token"]}
    rider_id = client.get(f"{API}/riders/me", headers=old).json()["id"]

    assert client.post(f"{API}/admin/riders/{rider_id}/reset-password", headers=old).status_code == 403  # Riders can't
    res = client.post(f"{API}/admin/riders/{rider_id}/reset-password", headers=admin)
    temp = res.json()["temporary_password"]
    assert res.status_code == 200 and len(temp) == 10
    assert client.get(f"{API}/riders/me", headers=old).status_code == 401  # Old login signed out
    assert _login(client, phone, "oldPass123").status_code == 401

    login = _login(client, phone, temp).json()
    assert login["must_change_password"] is True
    tmp = {"Authorization": "Bearer " + login["access_token"]}
    blocked = client.get(f"{API}/riders/me/campaigns", headers=tmp)
    assert blocked.status_code == 403 and "new password" in blocked.json()["detail"]
    assert client.post(f"{API}/auth/password/change", json={"current_password": "wrong", "new_password": "fresh789"}, headers=tmp).status_code == 400
    assert client.post(f"{API}/auth/password/change", json={"current_password": temp, "new_password": temp}, headers=tmp).status_code == 400
    changed = client.post(f"{API}/auth/password/change", json={"current_password": temp, "new_password": "fresh789"}, headers=tmp)
    assert changed.status_code == 200
    fresh = {"Authorization": "Bearer " + changed.json()["access_token"]}
    assert client.get(f"{API}/riders/me/campaigns", headers=fresh).status_code == 200
    assert _login(client, phone, "fresh789").json()["must_change_password"] is False
    logs = client.get(f"{API}/audit-logs", headers=admin).json()
    logs = logs if isinstance(logs, list) else logs.get("items", logs.get("logs", []))
    assert any(r["action"] == "RIDER_PASSWORD_RESET" for r in logs)
