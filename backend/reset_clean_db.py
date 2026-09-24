import os
import sys

# Ensure backend root is on python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, Base, engine, lock_down_public_api
from app.core.security import get_password_hash, UserRole
from app.models.all_models import (
    User,
    Brand,
)


def reset_clean_db():
    print("Dropping all existing database tables...")
    Base.metadata.drop_all(bind=engine)
    print("Creating clean database tables...")
    Base.metadata.create_all(bind=engine)
    lock_down_public_api()

    db = SessionLocal()
    try:
        print("Seeding standard Admin accounts...")
        super_admin = User(
            phone="+919999999999",
            email="admin@superriders.com",
            hashed_password=get_password_hash("admin123"),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        ops_admin = User(
            phone="+919999999998",
            email="ops@superriders.com",
            hashed_password=get_password_hash("ops123"),
            role=UserRole.OPERATIONS_ADMIN,
            is_active=True,
        )
        fin_admin = User(
            phone="+919999999997",
            email="finance@superriders.com",
            hashed_password=get_password_hash("finance123"),
            role=UserRole.FINANCE_ADMIN,
            is_active=True,
        )
        db.add_all([super_admin, ops_admin, fin_admin])
        db.flush()

        print("Seeding Brand Partners (Zepto, Zomato, Swiggy, Blinkit)...")
        brands_data = [
            {"name": "Zepto", "code": "zepto"},
            {"name": "Zomato", "code": "zomato"},
            {"name": "Swiggy", "code": "swiggy"},
            {"name": "Blinkit", "code": "blinkit"},
        ]
        for b in brands_data:
            brand = Brand(
                name=b["name"],
                code=b["code"],
                is_active=True,
            )
            db.add(brand)

        db.commit()
        print("✅ Database cleanly reset successfully!")
        print("  - 0 Riders (ready for real registrations)")
        print("  - 0 Payments (ready for real payouts)")
        print("  - 3 Admins (admin@superriders.com / admin123)")
        print("  - 4 Brand Partners (Zepto, Zomato, Swiggy, Blinkit)")
    except Exception as e:
        db.rollback()
        print(f"❌ Error resetting database: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    reset_clean_db()
