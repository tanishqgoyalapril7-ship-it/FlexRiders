"""Password-login throttling: stops password guessing. Each failed login is recorded (in the one-time code
table, purpose LOGIN_FAIL, with only the normalised login name and a hashed client address); too many
failures for one account, or from one client, within LOGIN_FAILURE_WINDOW_MIN block further attempts for
that window. A successful login clears the account's failures."""
import re
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.all_models import EmailCode

PURPOSE = "LOGIN_FAIL"


def account_key(identifier: str) -> str:
    """Same key for every way of typing one login: email lower-cased, phone as its last 10 digits."""
    value = (identifier or "").strip().lower()
    if "@" in value:
        return value[:120]
    digits = re.sub(r"\D", "", value)
    return digits[-10:] if len(digits) >= 10 else value[:120]


def blocked(db: Session, identifier: str, client: str) -> bool:
    since = datetime.utcnow() - timedelta(minutes=settings.LOGIN_FAILURE_WINDOW_MIN)
    recent = db.query(func.count(EmailCode.id)).filter(EmailCode.purpose == PURPOSE, EmailCode.created_at >= since)
    by_account = recent.filter(EmailCode.email == account_key(identifier)).scalar()
    by_client = recent.filter(EmailCode.request_key == client).scalar()
    return by_account >= settings.LOGIN_MAX_FAILURES_PER_ACCOUNT or by_client >= settings.LOGIN_MAX_FAILURES_PER_CLIENT


def record_failure(db: Session, identifier: str, client: str) -> None:
    now = datetime.utcnow()
    db.add(EmailCode(purpose=PURPOSE, email=account_key(identifier), code_hash="-", request_key=client,
                     expires_at=now + timedelta(minutes=settings.LOGIN_FAILURE_WINDOW_MIN), created_at=now))
    db.commit()


def clear(db: Session, identifier: str) -> None:
    db.query(EmailCode).filter(EmailCode.purpose == PURPOSE, EmailCode.email == account_key(identifier)).delete(synchronize_session=False)
    db.commit()
