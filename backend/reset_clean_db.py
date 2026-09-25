import os
import sys

# Ensure backend root is on python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import Base, engine, lock_down_public_api


def reset_clean_db():
    print("Dropping all existing database tables...")
    Base.metadata.drop_all(bind=engine)
    print("Creating clean database tables...")
    Base.metadata.create_all(bind=engine)
    lock_down_public_api()

    # No built-in admin accounts or passwords: create your own with create_admin.py.
    print("✅ Database cleanly reset successfully!")
    print("  - 0 admins: run `venv/bin/python create_admin.py` to create the first one")
    print("  - 0 riders, 0 payments, 0 brands (ready for real data)")


if __name__ == "__main__":
    reset_clean_db()
