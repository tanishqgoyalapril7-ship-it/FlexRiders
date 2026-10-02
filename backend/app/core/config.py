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
    CORS_ORIGINS: str = ""  # Extra origins, comma separated

    def cors_origins(self) -> List[str]:
        """Hosted: only the FlexRiders domains (plus CORS_ORIGINS). Local: the development servers too."""
        production = ["https://flexriders.in", "https://www.flexriders.in", "https://admin.flexriders.in"]
        extra = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return list(dict.fromkeys(production + extra + ([] if self.VERCEL else self.BACKEND_CORS_ORIGINS)))
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
    # SMS gateway phone (github.com/mdakashhossain1/SMS-Gateway-Free) for real OTP SMS: its API address
    # (e.g. http://192.168.1.50:8080 on the same Wi-Fi, or a public tunnel URL) and the API key shown in the app.
    SMS_GATEWAY_URL: str = ""
    SMS_GATEWAY_API_KEY: str = ""
    SMS_COUNTRY_CODE: str = "+91"
    # Or Fast2SMS (fast2sms.com, Indian numbers, OTP route): works from a hosted server without a gateway
    # phone. When set, it is used instead of the gateway phone.
    FAST2SMS_API_KEY: str = ""
    # Or Twilio Verify (twilio.com → Verify → Services): Twilio creates, texts and checks the code itself and
    # handles India's SMS rules. Preferred over the others when set. Codes are TWILIO_VERIFY_CODE_LENGTH digits,
    # which must match the Verify service's "Code length" setting (Twilio's default is 6).
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_VERIFY_SERVICE_SID: str = ""
    TWILIO_VERIFY_CODE_LENGTH: int = 6
    # Or plain Twilio SMS (e.g. the trial's free SMS, no Verify service): the Twilio number to send from. The
    # server makes the code itself, like the other providers. Used when no Verify service SID is set.
    TWILIO_FROM_NUMBER: str = ""
    # Free local testing without any SMS provider: codes are made and checked exactly as for SMS, but shown on
    # the phone screen (and in the server log) instead of being texted. Ignored on hosted servers (VERCEL) and
    # whenever a real SMS provider is set.
    SMS_TEST_MODE: bool = False
    # SMS codes allowed per number and per device/network each hour (0 = no limit, e.g. for local testing).
    # Keep them on wherever real riders use the app: they stop SMS spam and protect the SMS balance.
    SMS_PER_NUMBER_PER_HOUR: int = 3
    SMS_PER_CLIENT_PER_HOUR: int = 10
    # Password login: failures allowed per account and per client within the window before login is
    # blocked for that window (stops password guessing).
    LOGIN_MAX_FAILURES_PER_ACCOUNT: int = 8
    LOGIN_MAX_FAILURES_PER_CLIENT: int = 30
    LOGIN_FAILURE_WINDOW_MIN: int = 15
    # Or 2Factor (2factor.in, Indian numbers): the API key from its dashboard; it texts the code the server
    # makes, using 2Factor's OTP template (or TWOFACTOR_TEMPLATE, the name of your own approved template).
    TWOFACTOR_API_KEY: str = ""
    # Or MSG91 (msg91.com → OTP → Templates): the Auth Key (profile → Authkey) and the MSG91 Template ID of an
    # approved OTP template whose code placeholder is ##OTP##. MSG91 texts the code the server makes. Used
    # before 2Factor when both are set.
    MSG91_AUTH_KEY: str = ""
    MSG91_TEMPLATE_ID: str = ""
    TWOFACTOR_TEMPLATE: str = ""
    # DLT route (needed when the account has no OTP route): the approved sender ID (header, e.g. FLXRDR) and
    # the Fast2SMS message ID of the approved OTP template, whose only variable {#var#} is the code.
    FAST2SMS_SENDER_ID: str = ""
    FAST2SMS_TEMPLATE_ID: str = ""
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
    # Geo-targeting defaults, prefilled on new campaigns. Every campaign stores its own values, which the
    # brand/admin can change; these are never applied to a campaign behind the scenes.
    CAMPAIGN_DEFAULT_INITIAL_RADIUS_KM: float = 2.0
    CAMPAIGN_DEFAULT_MAX_RADIUS_KM: float = 8.0
    CAMPAIGN_DEFAULT_EXPANSION_STEP_KM: float = 1.0
    CAMPAIGN_DEFAULT_EXPANSION_INTERVAL_MIN: int = 60
    # Rider app: campaigns starting within this many hours are shown as "Opening soon" (with a countdown).
    OPENING_SOON_HOURS: int = 48
    # A rider's reported location counts as "current" for this long; older fixes are ignored.
    RIDER_LOCATION_MAX_AGE_MIN: int = 180
    # Last-known location: once a geo-targeted campaign has been live this many hours and still has free
    # slots, it also reaches riders whose last location (where they last had the app open, up to
    # RIDER_LAST_LOCATION_MAX_AGE_DAYS old) is inside its current radius, even if that is older than the
    # RIDER_LOCATION_MAX_AGE_MIN window and no working area matches.
    LAST_LOCATION_REACH_AFTER_HOURS: int = 6
    RIDER_LAST_LOCATION_MAX_AGE_DAYS: int = 30
    # Area search (working areas, campaign targets). Nominatim/OpenStreetMap by default; no key needed,
    # but its usage policy requires an identifying User-Agent and at most ~1 request per second.
    GEOCODER_URL: str = "https://nominatim.openstreetmap.org/search"
    GEOCODER_USER_AGENT: str = "FlexRiders/1.0 (support@flexriders.in)"
    GEOCODER_COUNTRY_CODES: str = "in"
    # Refer & Earn: paid to the referrer once, when the referred rider completes their first Photo Streak.
    REFERRAL_REWARD_AMOUNT: float = 30.0
    # Base of the shareable referral link (a web page or app deep link that opens registration).
    REFERRAL_LINK_BASE: str = "superriders://register?ref="
    # Photos are taken in 3 daily slots (Morning / Evening / Night); all 3 approved = 1 Photo-Day.
    # When true, each slot only accepts photos inside its time window (IST).
    ENFORCE_PHOTO_SLOT_WINDOWS: bool = False
    # In-app reminders for the photo slots (sent by a background loop in the API process, IST).
    SLOT_NOTIFICATIONS_ENABLED: bool = True
    # Driver selfie at rider self-registration (front camera). Required; set to False only for local testing.
    # The rider app reads this from GET /public/app-config. Admin → Add Rider always requires one.
    REQUIRE_DRIVER_SELFIE: bool = True
    # Platform Terms & Conditions and Privacy Policy that riders accept at registration. Change a version when
    # the published text changes: riders are then asked to accept the new version (earlier acceptances are kept).
    PLATFORM_TERMS_VERSION: str = "2026-09-26"
    PRIVACY_POLICY_VERSION: str = "2026-09-26"
    TERMS_URL: str = "https://flexriders.in/terms"
    PRIVACY_URL: str = "https://flexriders.in/privacy"
    SLOT_REMINDER_MINUTES: int = 30  # "Closes soon" reminder this long before a slot ends
    SLOT_NOTIFICATION_INTERVAL_SECONDS: int = 60
    # Paid once per rider per campaign when an admin marks the campaign T-shirt as returned.
    TSHIRT_RETURN_INCENTIVE_DEFAULT: float = 50.0
    # Base URL of the public campaign page shared with brands, e.g. https://superriders.in/campaign/
    # Empty means the admin dashboard's own address + /campaign/.
    PUBLIC_CAMPAIGN_BASE_URL: str = ""
    # Campaign Planning & Minimum Budget Configuration (Centralized Single Source of Truth)
    MINIMUM_CAMPAIGN_BUDGET: float = 10000.0
    DEFAULT_PLANNING_RIDER_RATE: float = 500.0  # Configurable baseline planning rate (₹/rider-day) used for estimation

    # Uploads directory for local dev
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
    # Hosted: photos and banners go to Supabase Storage instead of the local disk (see storage_service).
    SUPABASE_URL: str = ""  # e.g. https://<project-ref>.supabase.co
    SUPABASE_SECRET_KEY: str = ""  # sb_secret_... (server only, never in an app)
    # Email (password reset codes, email verification): Resend (resend.com). Without a key nothing is sent,
    # and email at registration stays optional. The key is a server secret (Vercel env), never in an app.
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "FlexRiders <noreply@flexriders.in>"
    SUPABASE_PUBLISHABLE_KEY: str = ""  # sb_publishable_... (public by design; for Realtime in the apps)
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
