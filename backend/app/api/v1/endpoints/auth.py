from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, UserRole
from app.core.config import settings
from app.models.all_models import User, Rider, Brand
from app.schemas.all_schemas import Token, LoginRequest, OTPRequest, OTPVerifyRequest, RiderRegistrationRequest
from app.services.rider_service import register_new_rider
from app.api.deps import get_current_user

router = APIRouter()


@router.post("/login", response_model=Token)
def login(request: LoginRequest, http: Request, db: Session = Depends(get_db)):
    """Authenticate user with phone or email + password, returns JWT token with role"""
    from app.api.v1.endpoints.password import _client
    from app.services import login_guard

    ident = request.phone.strip()
    client = _client(http)
    if login_guard.blocked(db, ident, client):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"Too many failed login attempts. Please wait {settings.LOGIN_FAILURE_WINDOW_MIN} minutes and try again, or reset your password.")
    user = db.query(User).filter(or_(User.phone == ident, func.lower(User.email) == ident.lower())).first()
    # One message for an unknown number and a wrong password, so login can't be used to find accounts.
    bad_login = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect phone number or password")
    if request.password:
        if not user or not verify_password(request.password, user.hashed_password):
            login_guard.record_failure(db, ident, client)
            raise bad_login
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required. Use OTP login endpoint for OTP auth.",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated. Contact support.")

    login_guard.clear(db, ident)
    rider = db.query(Rider).filter(Rider.user_id == user.id).first()
    rider_sr_id = rider.rider_id if rider else None
    brand = db.query(Brand).filter(Brand.id == user.brand_id).first() if user.brand_id else None
    user_name = brand.contact_person or brand.name if brand else (rider.full_name if rider else (user.email or user.phone))

    token = create_access_token(
        subject=user.id,
        role=user.role,
        rider_id=rider_sr_id,
        password_hash=user.hashed_password,
    )

    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        rider_id=rider_sr_id,
        brand_id=user.brand_id,
        brand_name=brand.name if brand else None,
        name=user_name,
        must_change_password=bool(user.must_change_password),
    )


def _sms_login() -> bool:
    from app.services import sms_service as sms

    return sms.configured()


def _require_otp_enabled() -> None:
    if _sms_login():
        return  # Real SMS codes through the gateway phone
    # There is no SMS provider yet: the "OTP" is a fixed development code. It must be switched off
    # (ENABLE_OTP_LOGIN=false) wherever real riders use the system, or anyone could log in as them.
    # Hosted servers never allow it: there is no SMS provider, only a fixed development code.
    if not settings.ENABLE_OTP_LOGIN or settings.VERCEL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="OTP login is not available. Please log in with your password.")


@router.post("/otp/send")
def send_otp(request: OTPRequest, http: Request, db: Session = Depends(get_db)):
    """Texts a login code (SMS gateway). Without a gateway, local development accepts a fixed code."""
    _require_otp_enabled()
    if _sms_login():
        from app.services import sms_service as sms
        from app.api.v1.endpoints.password import _client

        phone = sms.ten_digits(request.phone)
        user = db.query(User).filter(User.phone.like(f"%{phone}"), User.role == UserRole.RIDER, User.is_active == True).first() if phone else None  # noqa: E712
        reply = {"success": True, "message": "If this number has a rider account, a code is on its way by SMS."}
        if not user:
            return reply  # Same answer: login can't be used to find accounts
        key = _client(http)
        if sms.rate_limited(db, sms.LOGIN, phone, key):
            raise HTTPException(status_code=429, detail="Too many codes requested. Please wait a while and try again.")
        try:
            test_code = sms.send_code(db, sms.LOGIN, phone, key, user.id)
        except sms.SmsError as e:
            raise HTTPException(status_code=503, detail=str(e))
        return {**reply, "otp_hint": test_code} if test_code else reply
    return {
        "success": True,
        "message": f"OTP successfully sent to {request.phone}. For testing, use code: {settings.MOCK_OTP_CODE}",
        "otp_hint": settings.MOCK_OTP_CODE,
    }


@router.post("/otp/verify", response_model=Token)
def verify_otp(request: OTPVerifyRequest, db: Session = Depends(get_db)):
    """Verify OTP and authenticate user"""
    _require_otp_enabled()
    if _sms_login():
        from app.services import sms_service as sms

        phone = sms.ten_digits(request.phone)
        try:
            row = sms.consume(db, sms.LOGIN, phone, request.otp)
        except sms.CodeError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        user = db.query(User).filter(User.id == row.user_id).first()
    else:
        if request.otp != settings.MOCK_OTP_CODE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OTP code. Please enter the 6-digit code received.",
            )
        user = db.query(User).filter(User.phone == request.phone.strip()).first()
    # The OTP is a fixed development code, so it must never unlock an admin account.
    if user and user.role in UserRole.ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin accounts must log in with a password.")
    if user and not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated. Contact support.")
    if not user:
        # OTP never creates accounts (that left logins without a rider profile, blocking later registration,
        # with a known default password). New riders register with a password and selfie.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This number isn't registered yet. Please register first.")

    rider = db.query(Rider).filter(Rider.user_id == user.id).first()
    rider_sr_id = rider.rider_id if rider else None
    user_name = rider.full_name if rider else user.phone

    token = create_access_token(
        subject=user.id,
        role=user.role,
        rider_id=rider_sr_id,
        password_hash=user.hashed_password,
    )

    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        rider_id=rider_sr_id,
        name=user_name,
    )


@router.post("/register")
def register_rider(request: RiderRegistrationRequest, db: Session = Depends(get_db)):
    """Full 6-step registration endpoint for new riders"""
    rider = register_new_rider(db=db, reg=request)
    token = create_access_token(
        subject=rider.user_id,
        role="RIDER",
        rider_id=rider.rider_id,
        password_hash=rider.user.hashed_password if rider.user else None,
    )
    return {
        "success": True,
        "message": "Your registration has been submitted successfully. Our team will review your application.",
        "rider_id": rider.rider_id,
        "status": rider.status,
        "access_token": token,
        "token_type": "bearer",
    }


@router.get("/me")
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns profile for currently authenticated user/rider"""
    rider = db.query(Rider).filter(Rider.user_id == current_user.id).first()
    return {
        "id": current_user.id,
        "phone": current_user.phone,
        "email": current_user.email,
        "role": current_user.role,
        "is_active": current_user.is_active,
        "rider_id": rider.rider_id if rider else None,
        "full_name": rider.full_name if rider else None,
        "status": rider.status if rider else None,
    }
