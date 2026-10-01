"""Password recovery by email, password change, and the email check at registration.

- Forgot password (riders): with a mobile number and SMS set up, a code is texted to that number;
  otherwise a 6-digit code goes to the email on the rider's account. The answer is always the same, so the
  form can't be used to find out whether a number or email has an account.
- Reset: the code + a new password; every earlier login is signed out. An SMS reset also logs the rider in.
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
from app.services import sms_service as sms

router = APIRouter()

FORGOT_REPLY = (
    "If this account has an email address, we've sent a 6-digit code to it. It expires in 15 minutes. "
    "No email on your account? Contact FlexRiders support to reset your password."
)


FORGOT_SMS_REPLY = "If this number has a FlexRiders account, a code is on its way by SMS. It expires in 10 minutes."


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


def _by_sms(identifier: str) -> bool:
    """A mobile number (not an email) while SMS sending is set up: the reset code goes by SMS."""
    return "@" not in (identifier or "") and bool(sms.ten_digits(identifier)) and sms.configured()


@router.post("/password/forgot")
def forgot_password(data: ForgotIn, request: Request, db: Session = Depends(get_db)):
    user = _find_rider_user(db, data.identifier)
    if _by_sms(data.identifier):
        phone = sms.ten_digits(data.identifier)
        test_code = None
        if user:
            key = _client(request)
            if sms.rate_limited(db, sms.RESET, phone, key):
                raise HTTPException(status_code=429, detail="Too many codes requested. Please wait a while and try again.")
            try:
                test_code = sms.send_code(db, sms.RESET, phone, key, user.id)
            except sms.SmsError as e:
                raise HTTPException(status_code=503, detail=str(e))
        # Same answer in every case (no account discovery).
        reply = {"success": True, "channel": "SMS", "code_length": sms.code_length(), "message": FORGOT_SMS_REPLY}
        return {**reply, "test_code": test_code} if test_code else reply
    if user and user.email and mail.delivery_available():
        key = _client(request)
        if not mail.rate_limited(db, mail.RESET, user.email, key):
            code = mail.issue(db, mail.RESET, user.email, key, user.id)
            mail.send_code_email(user.email, code, mail.RESET)
    # Same answer in every case (no account discovery).
    return {"success": True, "channel": "EMAIL", "code_length": 6, "message": FORGOT_REPLY}


@router.post("/password/reset")
def reset_password(data: ResetIn, db: Session = Depends(get_db)):
    user = _find_rider_user(db, data.identifier)
    if _by_sms(data.identifier):
        invalid = HTTPException(status_code=400, detail="This code is incorrect or has expired. Request a new code.")
        try:
            row = sms.consume(db, sms.RESET, sms.ten_digits(data.identifier), data.code)
        except sms.CodeError:
            raise invalid
        if not user or row.user_id != user.id:
            raise invalid
        set_password(db, user, data.new_password)
        db.commit()
        # The code proved the rider owns the number, so they're logged in straight away.
        rider = db.query(Rider).filter(Rider.user_id == user.id).first()
        token = create_access_token(subject=user.id, role=user.role, rider_id=rider.rider_id if rider else None,
                                    password_hash=user.hashed_password)
        return {"success": True, "message": "Your password has been changed. You're now logged in.",
                "access_token": token, "token_type": "bearer", "role": user.role, "user_id": user.id,
                "rider_id": rider.rider_id if rider else None, "name": rider.full_name if rider else user.phone}
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


# ---------------------------------------------------------------------------------- SMS (gateway phone)

class PhoneIn(BaseModel):
    phone: str = Field(..., max_length=20)


class PhoneCodeIn(BaseModel):
    phone: str = Field(..., max_length=20)
    code: str = Field(..., max_length=10)


@router.post("/phone/verification-code")
def send_phone_code(data: PhoneIn, request: Request, db: Session = Depends(get_db)):
    """Sign-up: texts a code to the number (Twilio Verify, Fast2SMS or the SMS gateway phone)."""
    from app.services import sms_service as sms

    if not sms.configured():
        raise HTTPException(status_code=400, detail="Phone verification isn't available right now. You can register without it.")
    phone = sms.ten_digits(data.phone)
    if not phone:
        raise HTTPException(status_code=422, detail="Enter your 10-digit mobile number.")
    if db.query(User.id).filter(User.phone.like(f"%{phone}")).first():
        raise HTTPException(status_code=400, detail="This mobile number is already registered. Please log in instead.")
    key = _client(request)
    if sms.rate_limited(db, sms.VERIFY, phone, key):
        raise HTTPException(status_code=429, detail="Too many codes requested. Please wait a while and try again.")
    try:
        test_code = sms.send_code(db, sms.VERIFY, phone, key)
    except sms.SmsError as e:
        raise HTTPException(status_code=503, detail=str(e))
    reply = {"success": True, "code_length": sms.code_length(), "message": f"We've sent a {sms.code_length()}-digit code to +91 {phone[:2]}••••••{phone[-2:]}."}
    return {**reply, "test_code": test_code} if test_code else reply


@router.post("/phone/verify-code")
def verify_phone_code(data: PhoneCodeIn, db: Session = Depends(get_db)):
    """Checks the sign-up code; returns proof to send with the registration (valid for 30 minutes)."""
    from app.services import sms_service as sms

    phone = sms.ten_digits(data.phone)
    try:
        sms.consume(db, sms.VERIFY, phone, data.code)
    except sms.CodeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "phone_proof": sms.issue_proof(phone)}
