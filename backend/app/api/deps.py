from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token, password_fingerprint, UserRole
from app.models.all_models import User, Rider
from datetime import timezone
from typing import List, Optional

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive or not found")
    # A password reset or change signs out every login issued before it: logins carry a fingerprint of the
    # password they were issued with. (Older logins without it fall back to the time of the change.)
    changed = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your password was changed. Please log in again.")
    if "pwd" in payload:
        if payload["pwd"] != password_fingerprint(user.hashed_password):
            raise changed
    elif user.password_changed_at and int(payload.get("iat") or 0) <= int(user.password_changed_at.replace(tzinfo=timezone.utc).timestamp()):
        raise changed
    return user


PASSWORD_CHANGE_REQUIRED = "Please set a new password to continue."


def require_roles(allowed_roles: List[str]):
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of {allowed_roles}, your role is {current_user.role}",
            )
        return current_user
    return role_checker


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in UserRole.ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def get_current_rider(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Rider:
    if current_user.must_change_password:  # After an admin reset: nothing else until a new password is set
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PASSWORD_CHANGE_REQUIRED)
    rider = db.query(Rider).filter(Rider.user_id == current_user.id).first()
    if not rider:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rider profile not found for this account",
        )
    return rider
