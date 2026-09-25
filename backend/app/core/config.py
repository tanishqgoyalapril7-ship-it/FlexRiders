from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, field_validator
import os


class Settings(BaseSettings):
    PROJECT_NAME: str = "FlexRiders API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "super-riders-secret-key-production-change-this-in-prod"  # Development only; hosted servers refuse it
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALGORITHM: str = "HS256"

    # Database
    DATABASE_URL: str = f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'super_riders.db')}"

    # CORS: browser origins allowed to call the API directly. The rider app (native) doesn't need CORS,
    # and the hosted dashboard reaches the API through the same domain (flexriders.in/api/v1), so this
    # only matters for local development and any extra origin listed in CORS_ORIGINS (comma separated).
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5180",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5180",
        "http://127.0.0.1:8000",
    ]
    CORS_ORIGINS: str = ""  # e.g. "https://flexriders.in,https://admin.flexriders.in"
    # Run schema checks/migrations when the app starts. Default: yes locally, no on Vercel (the database
    # is migrated once, not on every cold start). "true"/"false" overrides.
    RUN_STARTUP_MIGRATIONS: str = ""

    # Cloud Storage / Documents
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET: str = "super-riders-documents"

    # Business Config
    MULTI_BRAND_ASSIGNMENT: bool = False
    ENABLE_OTP_LOGIN: bool = True
    MOCK_OTP_CODE: str = "123456"

    # Campaign fulfilment thresholds
    FULFILLMENT_ON_TRACK_PCT: float = 95.0  # Actual ≥ this % of expected → On Track
    FULFILLMENT_AT_RISK_PCT: float = 80.0  # Actual below this % of expected → Behind Target
    LOW_SAMPLE_MIN_DAYS: int = 3  # Fewer elapsed campaign days → "Low sample"
    LOW_SAMPLE_MIN_RIDER_DAYS: int = 20  # Fewer possible rider-days → "Low sample"
    RIDER_BEHIND_PCT: float = 80.0  # Rider approved < this % of their elapsed days → Behind Target
    INACTIVE_MISSED_DAYS: int = 3  # Consecutive days with nothing submitted → Inactive
    # Log why each campaign is shown/hidden in the rider app's Available list (debugging aid).
    CAMPAIGN_VISIBILITY_LOG: bool = False
    # Refer & Earn: paid to the referrer once, when the referred rider completes their first Photo Streak.
    REFERRAL_REWARD_AMOUNT: float = 30.0
    # Base of the shareable referral link (a web page or app deep link that opens registration).
    REFERRAL_LINK_BASE: str = "superriders://register?ref="
    # Photos are taken in 3 daily slots (Morning / Evening / Night); all 3 approved = 1 Photo-Day.
    # When true, each slot only accepts photos inside its time window (IST).
    ENFORCE_PHOTO_SLOT_WINDOWS: bool = False
    # In-app reminders for the photo slots (sent by a background loop in the API process, IST).
    SLOT_NOTIFICATIONS_ENABLED: bool = True
    # Driver selfie at rider self-registration. TEMPORARILY OFF for testing (riders may skip it; a selfie that
    # is sent is still validated and stored privately). Set to True before the Play Store release: the rider
    # app reads this from GET /public/app-config, so no new app build is needed. Admin → Add Rider always requires one.
    REQUIRE_DRIVER_SELFIE: bool = False
    SLOT_REMINDER_MINUTES: int = 30  # "Closes soon" reminder this long before a slot ends
    SLOT_NOTIFICATION_INTERVAL_SECONDS: int = 60
    # Paid once per rider per campaign when an admin marks the campaign T-shirt as returned.
    TSHIRT_RETURN_INCENTIVE_DEFAULT: float = 50.0
    # Base URL of the public campaign page shared with brands, e.g. https://superriders.in/campaign/
    # Empty means the admin dashboard's own address + /campaign/.
    PUBLIC_CAMPAIGN_BASE_URL: str = ""

    # Uploads directory for local dev
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    # Hosted: photos and banners go to Supabase Storage instead of the local disk (see storage_service).
    SUPABASE_URL: str = ""  # e.g. https://<project-ref>.supabase.co
    SUPABASE_SECRET_KEY: str = ""  # sb_secret_... (server only, never in an app)
    STORAGE_BUCKET: str = "uploads"
    # Shared secret for POST /api/v1/internal/cron/slot-reminders (called every minute by Supabase pg_cron).
    CRON_SECRET: str = ""
    # Vercel sets VERCEL=1: serverless mode (no startup migrations, no background thread, no local disk).
    VERCEL: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )


settings = Settings()
DEFAULT_SECRET_KEY = "super-riders-secret-key-production-change-this-in-prod"
if settings.VERCEL and settings.SECRET_KEY == DEFAULT_SECRET_KEY:
    # The default key is published in this repository: anyone could sign valid login tokens with it.
    raise RuntimeError("SECRET_KEY is not set for this deployment. Set a long random SECRET_KEY in the hosting settings.")
if not (settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY):
    try:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)  # Local storage only
    except OSError:
        pass  # Read-only disk (serverless) without Supabase Storage configured: uploads will fail, the API still runs
