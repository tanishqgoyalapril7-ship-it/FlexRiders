import time
from datetime import datetime, timedelta
from typing import Any, Union, Optional
from jose import jwt
import bcrypt
from app.core.config import settings


class UserRole:
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    FINANCE_ADMIN = "FINANCE_ADMIN"
    OPERATIONS_ADMIN = "OPERATIONS_ADMIN"
    RIDER = "RIDER"

    ADMIN_ROLES = [SUPER_ADMIN, ADMIN, FINANCE_ADMIN, OPERATIONS_ADMIN]
    ALL_ROLES = [SUPER_ADMIN, ADMIN, FINANCE_ADMIN, OPERATIONS_ADMIN, RIDER]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72],
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8")[:72], salt).decode("utf-8")


def password_fingerprint(hashed_password: Optional[str]) -> str:
    """Short keyed fingerprint of the stored password hash. Logins carry it, so any password change
    (reset, change, admin reset) invalidates every earlier login immediately."""
    import hashlib
    import hmac

    return hmac.new(settings.SECRET_KEY.encode(), (hashed_password or "").encode(), hashlib.sha256).hexdigest()[:16]


def create_access_token(
    subject: Union[str, Any],
    role: str,
    rider_id: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
    password_hash: Optional[str] = None,
) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {
        "exp": expire,
        "iat": int(time.time()),  # Epoch seconds; lets a password change sign out older logins
        "sub": str(subject),
        "role": role,
    }
    if rider_id:
        to_encode["rider_id"] = rider_id
    if password_hash is not None:
        to_encode["pwd"] = password_fingerprint(password_hash)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except Exception:
        return None
