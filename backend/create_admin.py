"""Create (or reset) an admin account, with details typed in at the prompt. Nothing is stored in code.

Normally admins are added from the dashboard (Admin Users → Add Admin). Use this only to create the
first admin on a new database, or to regain access if every admin password is lost.

    cd backend
    venv/bin/python create_admin.py

It uses the database in backend/.env (DATABASE_URL). The password is typed hidden and never printed.
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import UserRole, get_password_hash  # noqa: E402
from app.models.all_models import User  # noqa: E402
from app.schemas.all_schemas import normalize_email  # noqa: E402

ROLES = {"1": UserRole.SUPER_ADMIN, "2": UserRole.OPERATIONS_ADMIN, "3": UserRole.FINANCE_ADMIN, "4": UserRole.ADMIN}
MIN_PASSWORD = 10


def ask(prompt: str) -> str:
    value = input(prompt).strip()
    if not value:
        sys.exit("Cancelled: a value is required.")
    return value


def main() -> None:
    print("Create a FlexRiders admin account\n")
    phone = ask("Phone number (with country code, e.g. +919812345678): ").replace(" ", "")
    try:
        email = normalize_email(ask("Email: "))
    except ValueError as e:
        sys.exit(str(e))
    print("Role: 1) Super Admin  2) Operations Admin  3) Finance Admin  4) Admin")
    role = ROLES.get(input("Choose 1-4 [1]: ").strip() or "1")
    if not role:
        sys.exit("Cancelled: choose 1, 2, 3 or 4.")
    password = getpass.getpass(f"Password (at least {MIN_PASSWORD} characters, hidden): ")
    if len(password) < MIN_PASSWORD:
        sys.exit(f"Cancelled: the password must be at least {MIN_PASSWORD} characters.")
    if getpass.getpass("Repeat password: ") != password:
        sys.exit("Cancelled: the passwords don't match.")

    db = SessionLocal()
    try:
        existing = db.query(User).filter((User.phone == phone) | (User.email == email)).all()
        if any(u.role not in UserRole.ADMIN_ROLES for u in existing):
            sys.exit("Cancelled: that phone or email belongs to a rider account.")
        if len(existing) > 1:
            sys.exit("Cancelled: the phone and email belong to two different admin accounts.")
        if existing:
            user = existing[0]
            if input(f"{user.email} already exists. Reset its password, role and reactivate it? [y/N]: ").strip().lower() != "y":
                sys.exit("Cancelled.")
            user.phone, user.email = phone, email
        else:
            user = User(phone=phone, email=email)
            db.add(user)
        user.role = role
        user.hashed_password = get_password_hash(password)
        user.is_active = True
        db.commit()
        print(f"\nDone: {email} ({role}) can now sign in at <your site>/admin with {phone}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
