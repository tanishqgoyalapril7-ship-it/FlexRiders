"""Security hardening: password-guessing throttle, real image content on upload, response headers."""
from app.core.config import settings
from tests.test_crud import make_admin, rider_payload

API = "/api/v1"


def test_password_guessing_is_throttled_and_success_clears_it(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES_PER_ACCOUNT", 3)
    monkeypatch.setattr(settings, "LOGIN_MAX_FAILURES_PER_CLIENT", 1000)
    admin, _ = make_admin(client, db_session)
    body = rider_payload(status="APPROVED")
    client.post(f"{API}/admin/riders", json=body, headers=admin)
    phone = body["mobile_number"]
    for _ in range(3):
        assert client.post(f"{API}/auth/login", json={"phone": phone, "password": "wrong-pass"}).status_code == 401
    # Blocked now, even with the right password (the guesser can't tell it was right).
    blocked = client.post(f"{API}/auth/login", json={"phone": phone, "password": "riderPass1"})
    assert blocked.status_code == 429 and "Too many failed login attempts" in blocked.json()["detail"]
    # Typing the number differently doesn't get around it.
    assert client.post(f"{API}/auth/login", json={"phone": f"+91 {phone[:5]} {phone[5:]}", "password": "x"}).status_code == 429
    # Once the window passes, the right password works and clears the failures.
    monkeypatch.setattr(settings, "LOGIN_FAILURE_WINDOW_MIN", 0)
    assert client.post(f"{API}/auth/login", json={"phone": phone, "password": "riderPass1"}).status_code == 200


def test_uploads_must_really_be_images(client, db_session):
    from app.api.v1.endpoints.campaigns import _looks_like

    assert _looks_like(b"\xff\xd8\xff\xe0rest", ".jpg")
    assert _looks_like(b"\x89PNG\r\n\x1a\nrest", ".png")
    assert _looks_like(b"RIFF\x00\x00\x00\x00WEBPVP8 ", ".webp")
    assert _looks_like(b"\x00\x00\x00\x18ftypheic", ".heic")
    assert not _looks_like(b"<html><script>alert(1)</script>", ".jpg")
    assert not _looks_like(b"<svg onload=alert(1)>", ".png")


def test_security_headers_on_api_responses(client):
    res = client.get(f"{API}/public/app-config")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "strict-origin-when-cross-origin"
