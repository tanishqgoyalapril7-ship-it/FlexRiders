"""Real OTP by SMS through the gateway phone (SMS-Gateway-Free API): sign-up verification and OTP login."""
import re

import httpx
import pytest

from app.core.config import settings
from app.services import sms_service as sms
from tests.conftest import SELFIE

API = "/api/v1"


@pytest.fixture
def gateway(monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "http://gateway.test:8080")
    monkeypatch.setattr(settings, "SMS_GATEWAY_API_KEY", "gw-key")
    sent = []

    def fake_post(url, headers=None, json=None, timeout=None):
        sent.append({"url": url, "key": headers["X-API-Key"], **json})
        if sent[-1].get("fail"):
            return httpx.Response(500)
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(sms.httpx, "post", fake_post)
    return sent


def code_in(msg):
    return re.search(r"\b(\d{4})\b", msg["message"]).group(1)


def test_signup_needs_the_sms_code(client, db_session, gateway):
    assert client.get(f"{API}/public/app-config").json()["phone_verification"] is True
    res = client.post(f"{API}/auth/phone/verification-code", json={"phone": "+91 94100 00001"})
    assert res.status_code == 200, res.text
    msg = gateway[-1]
    assert msg["url"] == "http://gateway.test:8080/api/send" and msg["key"] == "gw-key" and msg["phone_number"] == "+919410000001"
    body = {"selfie": SELFIE, "vehicle_category": "CYCLE", "accept_terms": True, "full_name": "Sms Rider", "mobile_number": "9410000001", "password": "riderPass1"}
    assert "Verify your mobile" in client.post(f"{API}/auth/register", json=body).json()["detail"]
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000001", "code": "0000" if code_in(msg) != "0000" else "1111"}).status_code == 400
    proof = client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000001", "code": code_in(msg)}).json()["phone_proof"]
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000001", "code": code_in(msg)}).status_code == 400  # Single use
    assert client.post(f"{API}/auth/register", json={**body, "phone_proof": proof + "x"}).status_code == 400
    assert client.post(f"{API}/auth/register", json={**body, "phone_proof": proof}).status_code == 200
    # A registered number can't request a sign-up code again.
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000001"}).status_code == 400


def test_otp_login_by_sms_and_no_account_discovery(client, db_session, gateway):
    client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000002"})
    proof = client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000002", "code": code_in(gateway[-1])}).json()["phone_proof"]
    client.post(f"{API}/auth/register", json={"selfie": SELFIE, "vehicle_category": "CYCLE", "accept_terms": True, "full_name": "Otp Rider",
                                           "mobile_number": "9410000002", "password": "riderPass1", "phone_proof": proof})
    n = len(gateway)
    unknown = client.post(f"{API}/auth/otp/send", json={"phone": "9410009999"})
    assert unknown.status_code == 200 and len(gateway) == n  # Same reply, no SMS
    assert client.post(f"{API}/auth/otp/send", json={"phone": "9410000002"}).json()["message"] == unknown.json()["message"]
    code = code_in(gateway[-1])
    assert client.post(f"{API}/auth/otp/verify", json={"phone": "9410000002", "otp": "123456"}).status_code == 400  # No fixed code
    login = client.post(f"{API}/auth/otp/verify", json={"phone": "9410000002", "otp": code})
    assert login.status_code == 200 and login.json()["role"] == "RIDER"


def test_rate_limit_and_gateway_failure(client, db_session, gateway, monkeypatch):
    for _ in range(3):
        assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000003"}).status_code == 200
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000003"}).status_code == 429
    monkeypatch.setattr(sms.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("down")))
    res = client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000004"})
    assert res.status_code == 503 and "couldn't send" in res.json()["detail"]


def _registered(client, gateway, phone):
    client.post(f"{API}/auth/phone/verification-code", json={"phone": phone})
    proof = client.post(f"{API}/auth/phone/verify-code", json={"phone": phone, "code": code_in(gateway[-1])}).json()["phone_proof"]
    res = client.post(f"{API}/auth/register", json={"selfie": SELFIE, "vehicle_category": "CYCLE", "accept_terms": True, "full_name": "Reset Rider",
                                                  "mobile_number": phone, "password": "oldPass123", "phone_proof": proof})
    assert res.status_code == 200, res.text


def test_forgot_password_by_sms_resets_and_logs_in(client, db_session, gateway):
    _registered(client, gateway, "9410000005")
    n = len(gateway)
    unknown = client.post(f"{API}/auth/password/forgot", json={"identifier": "9410009998"}).json()
    assert len(gateway) == n and unknown["channel"] == "SMS"  # No SMS, same answer
    sent = client.post(f"{API}/auth/password/forgot", json={"identifier": "+91 94100 00005"}).json()
    assert sent["message"] == unknown["message"] and sent["code_length"] == 4 and len(gateway) == n + 1
    code = code_in(gateway[-1])
    wrong = "0000" if code != "0000" else "1111"
    assert client.post(f"{API}/auth/password/reset", json={"identifier": "9410000005", "code": wrong, "new_password": "newPass123"}).status_code == 400
    # A code for this number can't reset another number's password.
    assert client.post(f"{API}/auth/password/reset", json={"identifier": "9410009998", "code": code, "new_password": "newPass123"}).status_code == 400
    res = client.post(f"{API}/auth/password/reset", json={"identifier": "9410000005", "code": code, "new_password": "newPass123"})
    assert res.status_code == 200 and res.json()["role"] == "RIDER"
    me = client.get(f"{API}/riders/me", headers={"Authorization": f"Bearer {res.json()['access_token']}"})
    assert me.status_code == 200
    assert client.post(f"{API}/auth/password/reset", json={"identifier": "9410000005", "code": code, "new_password": "again1234"}).status_code == 400  # Single use
    assert client.post(f"{API}/auth/login", json={"phone": "9410000005", "password": "oldPass123"}).status_code == 401
    assert client.post(f"{API}/auth/login", json={"phone": "9410000005", "password": "newPass123"}).status_code == 200


def test_fast2sms_is_used_when_its_key_is_set(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "")
    monkeypatch.setattr(settings, "FAST2SMS_API_KEY", "f2s-key")
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)  # Earlier tests in this file already used this client's codes
    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "key": headers["authorization"], **json})
        return httpx.Response(200, json={"return": not json.get("fail"), "message": ["SMS sent successfully."]})

    monkeypatch.setattr(sms.httpx, "post", fake_post)
    assert client.get(f"{API}/public/app-config").json()["phone_verification"] is True
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000006"}).status_code == 200
    c = calls[-1]
    assert c["url"] == sms.FAST2SMS_URL and c["key"] == "f2s-key" and c["route"] == "otp" and c["numbers"] == "9410000006"
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000006", "code": c["variables_values"]}).status_code == 200
    # Fast2SMS refusing the message (e.g. no balance) is reported, not silently accepted.
    monkeypatch.setattr(sms.httpx, "post", lambda *a, **k: httpx.Response(200, json={"return": False, "message": "Insufficient balance"}))
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000007"}).status_code == 503


def test_fast2sms_dlt_route_uses_the_approved_sender_and_template(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "")
    monkeypatch.setattr(settings, "FAST2SMS_API_KEY", "f2s-key")
    monkeypatch.setattr(settings, "FAST2SMS_SENDER_ID", "FLXRDR")
    monkeypatch.setattr(settings, "FAST2SMS_TEMPLATE_ID", "171234")
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)
    calls = []
    monkeypatch.setattr(sms.httpx, "post", lambda url, headers=None, json=None, timeout=None: calls.append(json) or httpx.Response(200, json={"return": True}))
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000008"}).status_code == 200
    c = calls[-1]
    assert c["route"] == "dlt" and c["sender_id"] == "FLXRDR" and c["message"] == "171234" and c["numbers"] == "9410000008"
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000008", "code": c["variables_values"]}).status_code == 200


def test_twilio_verify_sends_and_checks_the_code(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "tw-token")
    monkeypatch.setattr(settings, "TWILIO_VERIFY_SERVICE_SID", "VA456")
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)
    calls = []

    def fake_post(url, data=None, auth=None, timeout=None, **kw):
        calls.append({"url": url, "auth": auth, **data})
        if url.endswith("/VerificationCheck"):
            return httpx.Response(200, json={"status": "approved" if data["Code"] == "123456" else "pending"})
        if data["To"] == "+919410000099":
            return httpx.Response(400, json={"code": 21608, "message": "The number is unverified. Trial accounts cannot send messages to unverified numbers"})
        return httpx.Response(201, json={"status": "pending"})

    monkeypatch.setattr(sms.httpx, "post", fake_post)
    config = client.get(f"{API}/public/app-config").json()
    assert config["phone_verification"] is True and config["sms_code_length"] == 6
    sent = client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000009"})
    assert sent.status_code == 200 and sent.json()["code_length"] == 6
    assert calls[-1] == {"url": "https://verify.twilio.com/v2/Services/VA456/Verifications", "auth": ("AC123", "tw-token"), "To": "+919410000009", "Channel": "sms"}
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000009", "code": "000000"}).status_code == 400
    ok = client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000009", "code": "123 456"})
    assert ok.status_code == 200 and ok.json()["phone_proof"]
    assert calls[-1]["url"].endswith("/VerificationCheck") and calls[-1]["Code"] == "123456"
    # Single use on our side too.
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000009", "code": "123456"}).status_code == 400
    # A trial account can't text unverified numbers: a clear error, and no usable code is left behind.
    res = client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000099"})
    assert res.status_code == 503 and "couldn't send" in res.json()["detail"]


def test_plain_twilio_sms_with_a_twilio_number(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC123")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "tw-token")
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "+15550001111")
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)
    calls = []

    def fake_post(url, data=None, auth=None, timeout=None, **kw):
        calls.append({"url": url, "auth": auth, **data})
        return httpx.Response(201, json={"sid": "SM1", "status": "queued"})

    monkeypatch.setattr(sms.httpx, "post", fake_post)
    assert client.get(f"{API}/public/app-config").json()["sms_code_length"] == 4
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000010"}).status_code == 200
    c = calls[-1]
    assert c["url"] == "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json" and c["auth"] == ("AC123", "tw-token")
    assert c["To"] == "+919410000010" and c["From"] == "+15550001111"
    code = re.search(r"\b(\d{4})\b", c["Body"]).group(1)
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000010", "code": code}).status_code == 200


def test_local_test_mode_shows_the_code_and_never_runs_hosted(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "")
    monkeypatch.setattr(settings, "SMS_TEST_MODE", True)
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)
    monkeypatch.setattr(sms.httpx, "post", lambda *a, **k: pytest.fail("test mode must not send anything"))
    assert client.get(f"{API}/public/app-config").json()["phone_verification"] is True
    res = client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000011"}).json()
    proof = client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000011", "code": res["test_code"]}).json()["phone_proof"]
    client.post(f"{API}/auth/register", json={"selfie": SELFIE, "vehicle_category": "CYCLE", "accept_terms": True, "full_name": "Test Mode",
                                           "mobile_number": "9410000011", "password": "riderPass1", "phone_proof": proof})
    login = client.post(f"{API}/auth/otp/send", json={"phone": "9410000011"}).json()
    assert client.post(f"{API}/auth/otp/verify", json={"phone": "9410000011", "otp": login["otp_hint"]}).json()["role"] == "RIDER"
    assert "otp_hint" not in client.post(f"{API}/auth/otp/send", json={"phone": "9410009997"}).json()  # Unknown number: nothing
    forgot = client.post(f"{API}/auth/password/forgot", json={"identifier": "9410000011"}).json()
    assert client.post(f"{API}/auth/password/reset", json={"identifier": "9410000011", "code": forgot["test_code"], "new_password": "newPass123"}).status_code == 200
    # Never on a hosted server.
    monkeypatch.setattr(settings, "VERCEL", "1")
    assert sms.test_mode() is False


def test_twofactor_texts_our_code(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "")
    monkeypatch.setattr(settings, "TWOFACTOR_API_KEY", "2f-key")
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)
    urls = []

    def fake_post(url, timeout=None, **kw):
        urls.append(url)
        return httpx.Response(200, json={"Status": "Success", "Details": "session-1"})

    monkeypatch.setattr(sms.httpx, "post", fake_post)
    assert client.get(f"{API}/public/app-config").json()["sms_code_length"] == 4
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000012"}).status_code == 200
    m = re.fullmatch(r"https://2factor\.in/API/V1/2f-key/SMS/919410000012/(\d{4})", urls[-1])
    assert m
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000012", "code": m.group(1)}).status_code == 200
    # An error reply from 2Factor (e.g. no balance) is reported, not treated as sent.
    monkeypatch.setattr(sms.httpx, "post", lambda *a, **k: httpx.Response(200, json={"Status": "Error", "Details": "Insufficient balance"}))
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000013"}).status_code == 503


def test_limits_can_be_switched_off_for_local_testing(client, db_session, gateway, monkeypatch):
    monkeypatch.setattr(settings, "SMS_PER_NUMBER_PER_HOUR", 0)
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 0)
    for _ in range(5):
        assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000014"}).status_code == 200


def test_brand_signup_needs_the_sms_code(client, db_session, gateway, monkeypatch):
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)  # Earlier tests in this file used this client's codes
    body = {"full_name": "Brand Owner", "company_name": f"Sms Brand {len(gateway)}", "mobile_number": "9410000015",
            "email": "owner9410000015@example.com", "password": "brandPass1", "accept_terms": True}
    assert "Verify your mobile" in client.post(f"{API}/customer/auth/signup", json=body).json()["detail"]
    client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000015"})
    proof = client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000015", "code": code_in(gateway[-1])}).json()["phone_proof"]
    # A proof for one number can't be used for another.
    assert client.post(f"{API}/customer/auth/signup", json={**body, "mobile_number": "9410000016", "phone_proof": proof}).status_code == 400
    res = client.post(f"{API}/customer/auth/signup", json={**body, "phone_proof": proof})
    assert res.status_code == 200 and res.json()["role"] == "CUSTOMER"
    # The number now has an account, so no new sign-up code is sent for it.
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000015"}).status_code == 400


def test_msg91_texts_our_code_with_the_approved_template(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "SMS_GATEWAY_URL", "")
    monkeypatch.setattr(settings, "TWOFACTOR_API_KEY", "2f-key")  # MSG91 is used before 2Factor
    monkeypatch.setattr(settings, "MSG91_AUTH_KEY", "m91-key")
    monkeypatch.setattr(settings, "MSG91_TEMPLATE_ID", "tmpl-1")
    monkeypatch.setattr(settings, "SMS_PER_CLIENT_PER_HOUR", 100)
    calls = []

    def fake_post(url, params=None, headers=None, json=None, timeout=None, **kw):
        calls.append({"url": url, "key": (headers or {}).get("authkey"), **(params or {})})
        return httpx.Response(200, json={"type": "success", "request_id": "r1"})

    monkeypatch.setattr(sms.httpx, "post", fake_post)
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000017"}).status_code == 200
    c = calls[-1]
    assert c["url"] == sms.MSG91_OTP_URL and c["key"] == "m91-key" and c["template_id"] == "tmpl-1"
    assert c["mobile"] == "919410000017" and c["otp_expiry"] == 10
    assert client.post(f"{API}/auth/phone/verify-code", json={"phone": "9410000017", "code": c["otp"]}).status_code == 200
    monkeypatch.setattr(sms.httpx, "post", lambda *a, **k: httpx.Response(200, json={"type": "error", "message": "Invalid template"}))
    assert client.post(f"{API}/auth/phone/verification-code", json={"phone": "9410000018"}).status_code == 503
