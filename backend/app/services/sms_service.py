"""SMS one-time codes sent through Twilio Verify (preferred when set), Fast2SMS or an SMS gateway phone (github.com/mdakashhossain1/SMS-Gateway-Free):
an Android phone with a SIM runs the gateway app, and this server calls its HTTP API, so the phone sends a
real SMS immediately:

    POST {SMS_GATEWAY_URL}/api/send   X-API-Key: {SMS_GATEWAY_API_KEY}
    {"phone_number": "+91XXXXXXXXXX", "message": "..."}

The gateway must be reachable from this server: the same Wi-Fi for a local backend, or a public HTTPS URL
(e.g. a Cloudflare Tunnel to the phone) for a hosted one. Codes are stored hashed in the one-time-code
table (with the email codes), expire, are single use and allow a few attempts.
"""
import hashlib
import hmac
import logging
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.all_models import EmailCode

log = logging.getLogger("app.sms")

VERIFY = "VERIFY_PHONE"  # Sign-up: prove the rider owns the number
LOGIN = "LOGIN_PHONE"  # OTP login
RESET = "RESET_PHONE"  # Forgot password by SMS
PHONE_PURPOSES = (VERIFY, LOGIN, RESET)
FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"
TWILIO_VERIFY_URL = "https://verify.twilio.com/v2/Services"
TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
TWILIO_CODE = "twilio-verify"  # Stored instead of a code hash: Twilio holds and checks the code
CODE_DIGITS = 4
CODE_TTL = timedelta(minutes=10)  # Same as Twilio Verify's code lifetime
MAX_ATTEMPTS = 5
PER_NUMBER_PER_HOUR = 3
PER_CLIENT_PER_HOUR = 10
PROOF_TTL_SECONDS = 30 * 60  # A verified number must be used to register within 30 minutes


class SmsError(RuntimeError):
    pass


class CodeError(ValueError):
    pass


def twilio() -> bool:
    return bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_VERIFY_SERVICE_SID)


def twilio_sms() -> bool:
    """Plain Twilio SMS from a Twilio number (the server makes the code)."""
    return bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER) and not twilio()


def code_length() -> int:
    """Digits in an SMS code (the app sizes its code boxes from this)."""
    return settings.TWILIO_VERIFY_CODE_LENGTH if twilio() else CODE_DIGITS


def fast2sms() -> bool:
    return bool(settings.FAST2SMS_API_KEY)


def real_provider() -> bool:
    return twilio() or twilio_sms() or fast2sms() or bool(settings.SMS_GATEWAY_URL and settings.SMS_GATEWAY_API_KEY)


def test_mode() -> bool:
    """Local testing only: codes are shown on screen, never on a hosted server or when real SMS is set up."""
    return bool(settings.SMS_TEST_MODE) and not settings.VERCEL and not real_provider()


def configured() -> bool:
    return real_provider() or test_mode()


def ten_digits(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 10 else ""


def e164(phone10: str) -> str:
    return f"{settings.SMS_COUNTRY_CODE}{phone10}"


def send_sms(phone10: str, message: str) -> None:
    """Sends one SMS through the gateway phone. Raises SmsError when it can't be sent."""
    if not configured():
        raise SmsError("SMS sending isn't set up.")
    try:
        res = httpx.post(
            settings.SMS_GATEWAY_URL.rstrip("/") + "/api/send",
            headers={"X-API-Key": settings.SMS_GATEWAY_API_KEY, "Content-Type": "application/json"},
            json={"phone_number": e164(phone10), "message": message},
            timeout=15,
        )
    except httpx.HTTPError as e:
        log.warning("SMS gateway unreachable: %s", e.__class__.__name__)
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")
    if res.status_code >= 300:
        log.warning("SMS gateway returned %s: %s", res.status_code, res.text[:200])
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")


def send_fast2sms_otp(phone10: str, code: str) -> None:
    """Sends the code through Fast2SMS: the DLT route with the approved sender ID and OTP template when they're
    set, else the OTP route (Fast2SMS's own fixed OTP message). Raises SmsError on failure."""
    if settings.FAST2SMS_SENDER_ID and settings.FAST2SMS_TEMPLATE_ID:
        body = {"route": "dlt", "sender_id": settings.FAST2SMS_SENDER_ID, "message": settings.FAST2SMS_TEMPLATE_ID,
                "variables_values": code, "numbers": phone10, "flash": "0"}
    else:
        body = {"route": "otp", "variables_values": code, "numbers": phone10, "flash": "0"}
    try:
        res = httpx.post(
            FAST2SMS_URL,
            headers={"authorization": settings.FAST2SMS_API_KEY, "Content-Type": "application/json"},
            json=body,
            timeout=15,
        )
        body = res.json() if res.content else {}
    except (httpx.HTTPError, ValueError) as e:
        log.warning("Fast2SMS unreachable: %s", e.__class__.__name__)
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")
    if res.status_code >= 300 or not body.get("return"):
        log.warning("Fast2SMS returned %s: %s", res.status_code, str(body.get("message"))[:200])
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")


def _twilio(path: str, data: dict) -> httpx.Response:
    try:
        return httpx.post(f"{TWILIO_VERIFY_URL}/{settings.TWILIO_VERIFY_SERVICE_SID}/{path}", data=data,
                          auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN), timeout=15)
    except httpx.HTTPError as e:
        log.warning("Twilio unreachable: %s", e.__class__.__name__)
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")


def twilio_start(phone10: str) -> None:
    """Twilio creates the code and texts it. Raises SmsError when it can't be sent."""
    res = _twilio("Verifications", {"To": e164(phone10), "Channel": "sms"})
    if res.status_code >= 300:
        log.warning("Twilio Verify returned %s: %s", res.status_code, res.text[:200])
        if res.status_code == 400 and "unverified" in res.text.lower():
            # Trial accounts can text only the numbers verified in the Twilio console.
            raise SmsError("We couldn't send an SMS to this number yet. Please try again later or contact FlexRiders support.")
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")


def twilio_check(phone10: str, code: str) -> bool:
    try:
        res = _twilio("VerificationCheck", {"To": e164(phone10), "Code": code})
    except SmsError:
        return False
    return res.status_code == 200 and res.json().get("status") == "approved"


def send_twilio_sms(phone10: str, message: str) -> None:
    try:
        res = httpx.post(TWILIO_MESSAGES_URL.format(sid=settings.TWILIO_ACCOUNT_SID),
                         data={"To": e164(phone10), "From": settings.TWILIO_FROM_NUMBER, "Body": message},
                         auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN), timeout=15)
    except httpx.HTTPError as e:
        log.warning("Twilio unreachable: %s", e.__class__.__name__)
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")
    if res.status_code >= 300:
        log.warning("Twilio SMS returned %s: %s", res.status_code, res.text[:200])
        raise SmsError("We couldn't send the SMS right now. Please try again in a minute.")


def deliver_code(phone10: str, code: str) -> None:
    if twilio_sms():
        send_twilio_sms(phone10, f"{code} is your FlexRiders verification code. It expires in 10 minutes. Never share it with anyone.")
    elif fast2sms():
        send_fast2sms_otp(phone10, code)
    else:
        send_sms(phone10, f"{code} is your FlexRiders verification code. It expires in 10 minutes. Never share it with anyone.")


def _hash(code: str, purpose: str, phone10: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{purpose}:{phone10}:{code}".encode(), hashlib.sha256).hexdigest()


def rate_limited(db: Session, purpose: str, phone10: str, request_key: str) -> bool:
    since = datetime.utcnow() - timedelta(hours=1)
    per_number = db.query(func.count(EmailCode.id)).filter(EmailCode.purpose == purpose, EmailCode.email == phone10, EmailCode.created_at >= since).scalar()
    per_client = db.query(func.count(EmailCode.id)).filter(EmailCode.purpose.in_(PHONE_PURPOSES), EmailCode.request_key == request_key, EmailCode.created_at >= since).scalar()
    return per_number >= PER_NUMBER_PER_HOUR or per_client >= PER_CLIENT_PER_HOUR


def send_code(db: Session, purpose: str, phone10: str, request_key: str, user_id: Optional[int] = None) -> Optional[str]:
    """Creates a code (earlier unused codes for this number stop working) and texts it to the number. In
    test mode nothing is texted and the code is returned, for the reply to show on screen."""
    now = datetime.utcnow()
    db.query(EmailCode).filter(EmailCode.purpose == purpose, EmailCode.email == phone10, EmailCode.used_at.is_(None)).update(
        {EmailCode.used_at: now}, synchronize_session=False
    )
    code = None if twilio() else f"{secrets.randbelow(10 ** CODE_DIGITS):0{CODE_DIGITS}d}"
    row = EmailCode(purpose=purpose, email=phone10, user_id=user_id, code_hash=_hash(code, purpose, phone10) if code else TWILIO_CODE,
                    expires_at=now + CODE_TTL, request_key=request_key, created_at=now)
    db.add(row)
    db.commit()
    try:
        if test_mode():
            log.warning("SMS test mode: code %s for %s (not texted)", code, phone10)
            return code
        if code:
            deliver_code(phone10, code)
        else:
            twilio_start(phone10)
    except SmsError:
        row.used_at = datetime.utcnow()  # An unsent code can never be used
        db.commit()
        raise


def consume(db: Session, purpose: str, phone10: str, code: str) -> EmailCode:
    row = (
        db.query(EmailCode)
        .filter(EmailCode.purpose == purpose, EmailCode.email == phone10, EmailCode.used_at.is_(None))
        .order_by(EmailCode.id.desc())
        .first()
    )
    invalid = CodeError("This code is incorrect or has expired. Request a new code.")
    if not row or row.expires_at < datetime.utcnow() or row.attempts >= MAX_ATTEMPTS:
        raise invalid
    row.attempts += 1
    entered = re.sub(r"\D", "", code or "")
    if row.code_hash == TWILIO_CODE:
        good = bool(entered) and twilio_check(phone10, entered)
    else:
        good = hmac.compare_digest(row.code_hash, _hash(entered, purpose, phone10))
    if not good:
        db.commit()
        raise invalid
    row.used_at = datetime.utcnow()
    db.commit()
    return row


def issue_proof(phone10: str) -> str:
    """Signed, short-lived proof that this number was just verified (sent with the registration)."""
    exp = int(time.time()) + PROOF_TTL_SECONDS
    sig = hmac.new(settings.SECRET_KEY.encode(), f"phone-verified:{phone10}:{exp}".encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def check_proof(phone10: str, proof: Optional[str]) -> bool:
    try:
        exp_s, sig = (proof or "").split(".", 1)
        exp = int(exp_s)
    except ValueError:
        return False
    if exp < time.time():
        return False
    good = hmac.new(settings.SECRET_KEY.encode(), f"phone-verified:{phone10}:{exp}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, good)
