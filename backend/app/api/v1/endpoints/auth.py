from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, UserRole
from app.core.config import settings
from app.models.all_models import User, Rider
from app.schemas.all_schemas import Token, LoginRequest, OTPRequest, OTPVerifyRequest, RiderRegistrationRequest
from app.services.rider_service import register_new_rider
from app.api.deps import get_current_user

router = APIRouter()


@router.post("/login", response_model=Token)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user with phone + password, returns JWT token with role"""
    user = db.query(User).filter(User.phone == request.phone.strip()).first()
    # One message for an unknown number and a wrong password, so login can't be used to find accounts.
    bad_login = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect phone number or password")
    if request.password:
        if not user or not verify_password(request.password, user.hashed_password):
            raise bad_login
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required. Use OTP login endpoint for OTP auth.",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated. Contact support.")

    rider = db.query(Rider).filter(Rider.user_id == user.id).first()
    rider_sr_id = rider.rider_id if rider else None
    user_name = rider.full_name if rider else (user.email or user.phone)

    token = create_access_token(
        subject=user.id,
        role=user.role,
        rider_id=rider_sr_id,
    )

    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        rider_id=rider_sr_id,
        name=user_name,
    )


def _require_otp_enabled() -> None:
    # There is no SMS provider yet: the "OTP" is a fixed development code. It must be switched off
    # (ENABLE_OTP_LOGIN=false) wherever real riders use the system, or anyone could log in as them.
    # Hosted servers never allow it: there is no SMS provider, only a fixed development code.
    if not settings.ENABLE_OTP_LOGIN or settings.VERCEL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="OTP login is not available. Please log in with your password.")


@router.post("/otp/send")
def send_otp(request: OTPRequest, db: Session = Depends(get_db)):
    """Sends OTP for login/verification (in dev, fixed OTP 123456 is accepted)"""
    _require_otp_enabled()
    return {
        "success": True,
        "message": f"OTP successfully sent to {request.phone}. For testing, use code: {settings.MOCK_OTP_CODE}",
        "otp_hint": settings.MOCK_OTP_CODE,
    }


@router.post("/otp/verify", response_model=Token)
def verify_otp(request: OTPVerifyRequest, db: Session = Depends(get_db)):
    """Verify OTP and authenticate user"""
    _require_otp_enabled()
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
