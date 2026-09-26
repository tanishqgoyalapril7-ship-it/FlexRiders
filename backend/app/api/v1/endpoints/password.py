"""Password recovery by email, password change, and the email check at registration.

- Forgot password (riders): a 6-digit code goes to the email on the rider's account. The answer is always
  the same, so the form can't be used to find out whether a number or email has an account.
- Reset: the code + a new password; every earlier login is signed out.
- Change: for a logged-in user (required after an admin reset).
- Verification code: confirms a new rider's email at registration (when email sending is set up).
Admin accounts never reset by email; a super admin changes them under Admin Users.
"""
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import UserRole, create_access_token, get_password_hash, verify_password
from app.models.all_models import Rider, User
from app.schemas.all_schemas import normalize_email
from app.services import email_service as mail

router = APIRouter()

FORGOT_REPLY = (
    "If this account has an email address, we've sent a 6-digit code to it. It expires in 15 minutes. "
    "No email on your account? Contact FlexRiders support to reset your password."
)


class EmailIn(BaseModel):
    email: str = Field(..., max_length=120)


class ForgotIn(BaseModel):
    identifier: str = Field(..., max_length=120)  # Registered mobile number or email


class ResetIn(BaseModel):
    identifier: str = Field(..., max_length=120)
    code: str = Field(..., max_length=10)
    new_password: str = Field(..., min_length=6, max_length=128)


class ChangeIn(BaseModel):
    current_password: str = Field(..., max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)


def _client(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return mail.client_key(forwarded.split(",")[0].strip() or (request.client.host if request.client else "") or "unknown")


def _find_rider_user(db: Session, identifier: str) -> Optional[User]:
    """The rider login for a mobile number or email (admins are never matched)."""
    value = (identifier or "").strip()
    if "@" in value:
        try:
            email = normalize_email(value)
        except ValueError:
            return None
        user = db.query(User).filter(User.email == email).first()
    else:
        digits = re.sub(r"\D", "", value)
        if len(digits) < 10:
            return None
        user = db.query(User).filter(User.phone.like(f"%{digits[-10:]}"), User.role == UserRole.RIDER).first()
    return user if user and user.role == UserRole.RIDER and user.is_active else None


def set_password(db: Session, user: User, new_password: str) -> None:
    """New password; logins issued before now stop working."""
    user.hashed_password = get_password_hash(new_password)
    user.password_changed_at = datetime.utcnow().replace(microsecond=0)
    user.must_change_password = False


@router.post("/email/verification-code")
def send_verification_code(data: EmailIn, request: Request, db: Session = Depends(get_db)):
    if not mail.delivery_available():
        raise HTTPException(status_code=400, detail="Email verification isn't available right now. You can register without it.")
    try:
        email = normalize_email(data.email)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not email:
        raise HTTPException(status_code=422, detail="Enter your email address.")
    if db.query(User.id).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="This email is already used by another account. Log in, or use a different email.")
    key = _client(request)
    if mail.rate_limited(db, mail.VERIFY, email, key):
        raise HTTPException(status_code=429, detail="Too many codes requested. Please wait a while and try again.")
    code = mail.issue(db, mail.VERIFY, email, key)
    if not mail.send_code_email(email, code, mail.VERIFY):
        raise HTTPException(status_code=503, detail="We couldn't send the email just now. Please try again.")
    return {"success": True, "message": f"We've sent a 6-digit code to {email}. It expires in 15 minutes."}


@router.post("/password/forgot")
def forgot_password(data: ForgotIn, request: Request, db: Session = Depends(get_db)):
    user = _find_rider_user(db, data.identifier)
    if user and user.email and mail.delivery_available():
        key = _client(request)
        if not mail.rate_limited(db, mail.RESET, user.email, key):
            code = mail.issue(db, mail.RESET, user.email, key, user.id)
            mail.send_code_email(user.email, code, mail.RESET)
    # Same answer in every case (no account discovery).
    return {"success": True, "message": FORGOT_REPLY}


@router.post("/password/reset")
def reset_password(data: ResetIn, db: Session = Depends(get_db)):
    user = _find_rider_user(db, data.identifier)
    if not user or not user.email:
        raise HTTPException(status_code=400, detail="This code is incorrect or has expired. Request a new code.")
    try:
        mail.consume(db, mail.RESET, user.email, data.code)
    except mail.CodeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    set_password(db, user, data.new_password)
    db.commit()
    return {"success": True, "message": "Your password has been changed. Log in with your new password."}


@router.post("/password/change")
def change_password(data: ChangeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="Choose a new password that is different from the current one.")
    set_password(db, user, data.new_password)
    db.commit()
    rider = db.query(Rider).filter(Rider.user_id == user.id).first()
    # Other devices are signed out; this one gets a fresh login.
    return {
        "success": True,
        "access_token": create_access_token(subject=user.id, role=user.role, rider_id=rider.rider_id if rider else None, password_hash=user.hashed_password),
        "token_type": "bearer",
    }
