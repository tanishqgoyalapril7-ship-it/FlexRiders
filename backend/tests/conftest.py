import pytest
from contextlib import contextmanager
import os
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Tests must never touch the real (Supabase) database: point the app at the test SQLite file
# before it is imported, since importing it creates and migrates tables.
os.environ["DATABASE_URL"] = "sqlite:///./test_super_riders.db"
os.environ["SLOT_NOTIFICATIONS_ENABLED"] = "false"  # Tests call the reminder service directly
# Never reach production services from tests, whatever backend/.env contains: photo storage stays on a
# temporary local folder, and no production secrets are used.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["CRON_SECRET"] = ""
os.environ["RESEND_API_KEY"] = ""  # Tests never send real email
os.environ["SECRET_KEY"] = "test-only-secret-key"

from app.main import app
from app.core.database import Base, get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_super_riders.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_super_riders.db"):
        os.remove("./test_super_riders.db")


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@contextmanager
def before_start(db, campaign_id):
    """Time travel for tests: inside the block the campaign is upcoming (Open for Joining), so riders
    can join and be approved; afterwards its real dates return and the next request makes it Live."""
    from datetime import timedelta

    from app.models.campaign_models import AssignmentStatus, Campaign, CampaignAssignment, CampaignStatus
    from app.services.campaign_service import today_ist

    campaign = db.get(Campaign, campaign_id)
    db.refresh(campaign)
    start, end = campaign.start_date, campaign.end_date
    shift = today_ist() + timedelta(days=1) - start
    campaign.start_date, campaign.end_date = start + shift, end + shift
    campaign.live_at = None
    if campaign.status in CampaignStatus.PUBLISHED:
        campaign.status = CampaignStatus.OPEN
    db.query(CampaignAssignment).filter(
        CampaignAssignment.campaign_id == campaign_id, CampaignAssignment.status == AssignmentStatus.ACTIVE
    ).update({CampaignAssignment.status: AssignmentStatus.ASSIGNED}, synchronize_session=False)
    db.commit()
    try:
        yield campaign
    finally:
        db.refresh(campaign)
        campaign.start_date, campaign.end_date = start, end
        db.commit()


# A valid driver selfie for registration requests (a small JPEG-shaped payload, base64).
import base64 as _b64

SELFIE_BYTES = b"\xff\xd8\xff\xe0" + b"selfie-test-image " * 80
SELFIE = _b64.b64encode(SELFIE_BYTES).decode()
