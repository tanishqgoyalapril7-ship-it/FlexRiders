"""Email delivery (Resend) and one-time email codes.

Codes: 6 digits, stored only as an HMAC (keyed with SECRET_KEY), valid for 15 minutes, single use,
at most 5 wrong attempts, and rate limited per address and per client. Delivery needs RESEND_API_KEY;
without it nothing is sent (locally the code is written to the server log for development).
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.all_models import EmailCode

log = logging.getLogger("app.email")

CODE_TTL = timedelta(minutes=15)
MAX_ATTEMPTS = 5
PER_EMAIL_PER_HOUR = 3
PER_CLIENT_PER_HOUR = 10
RESET = "RESET_PASSWORD"
VERIFY = "VERIFY_EMAIL"


class CodeError(ValueError):
    """Shown to the user (400)."""


def delivery_available() -> bool:
    return bool(settings.RESEND_API_KEY)


def send(to: str, subject: str, text: str, html: str) -> bool:
    """Sends one email. Returns False if it couldn't be sent (never raises)."""
    if not delivery_available():
        if not settings.VERCEL:
            log.warning("Email not configured (RESEND_API_KEY); would send to %s: %s | %s", to, subject, text)
        return False
    try:
        res = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={"from": settings.EMAIL_FROM, "to": [to], "subject": subject, "text": text, "html": html},
            timeout=15,
        )
        if res.status_code >= 300:
            log.warning("Email to %s failed: HTTP %s", to.split("@")[-1], res.status_code)
            return False
        return True
    except httpx.HTTPError as e:
        log.warning("Email to %s failed: %s", to.split("@")[-1], e.__class__.__name__)
        return False


def _hash(code: str, purpose: str, email: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{purpose}:{email}:{code}".encode(), hashlib.sha256).hexdigest()


def client_key(address: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"client:{address}".encode(), hashlib.sha256).hexdigest()[:40]


def rate_limited(db: Session, purpose: str, email: str, request_key: str) -> bool:
    since = datetime.utcnow() - timedelta(hours=1)
    per_email = db.query(func.count(EmailCode.id)).filter(EmailCode.purpose == purpose, EmailCode.email == email, EmailCode.created_at >= since).scalar()
    per_client = db.query(func.count(EmailCode.id)).filter(EmailCode.request_key == request_key, EmailCode.created_at >= since).scalar()
    return per_email >= PER_EMAIL_PER_HOUR or per_client >= PER_CLIENT_PER_HOUR


def issue(db: Session, purpose: str, email: str, request_key: str, user_id: Optional[int] = None) -> str:
    """Creates a new code (older unused codes for the same purpose and address stop working) and returns it."""
    now = datetime.utcnow()
    db.query(EmailCode).filter(EmailCode.purpose == purpose, EmailCode.email == email, EmailCode.used_at.is_(None)).update(
        {EmailCode.used_at: now}, synchronize_session=False
    )
    code = f"{secrets.randbelow(10**6):06d}"
    db.add(EmailCode(purpose=purpose, email=email, user_id=user_id, code_hash=_hash(code, purpose, email),
                     expires_at=now + CODE_TTL, request_key=request_key, created_at=now))
    db.commit()
    return code


def consume(db: Session, purpose: str, email: str, code: str) -> EmailCode:
    """Checks a code and marks it used. Raises CodeError with a message for the user."""
    row = (
        db.query(EmailCode)
        .filter(EmailCode.purpose == purpose, EmailCode.email == email, EmailCode.used_at.is_(None))
        .order_by(EmailCode.id.desc())
        .first()
    )
    invalid = CodeError("This code is incorrect or has expired. Request a new code.")
    if not row or row.expires_at < datetime.utcnow() or row.attempts >= MAX_ATTEMPTS:
        raise invalid
    row.attempts += 1
    if not hmac.compare_digest(row.code_hash, _hash((code or "").strip(), purpose, email)):
        db.commit()
        raise invalid
    row.used_at = datetime.utcnow()
    db.commit()
    return row


def send_code_email(to: str, code: str, purpose: str) -> bool:
    if purpose == RESET:
        subject = "Your FlexRiders password reset code"
        intro = "Use this code to reset your FlexRiders password."
        outro = "If you didn't ask to reset your password, you can ignore this email; your password hasn't changed."
    else:
        subject = "Your FlexRiders verification code"
        intro = "Use this code to confirm your email address for your FlexRiders rider account."
        outro = "If you didn't sign up for FlexRiders, you can ignore this email."
    text = f"{intro}\n\n{code}\n\nThe code expires in 15 minutes and can be used once. Never share it with anyone.\n\n{outro}\n\nFlexRiders"
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">'
        '<h2 style="color:#0b1528">FlexRiders</h2>'
        f"<p>{intro}</p>"
        f'<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">{code}</p>'
        "<p>The code expires in 15 minutes and can be used once. Never share it with anyone.</p>"
        f'<p style="color:#64748b;font-size:13px">{outro}</p></div>'
    )
    return send(to, subject, text, html)
