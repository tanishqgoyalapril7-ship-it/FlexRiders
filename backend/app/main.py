from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, lock_down_public_api, add_missing_columns, ensure_indexes
from app.api.v1.api import api_router
from app.services import slot_reminder_service
from app.services.campaign_service import backfill_live_dates

# Initialize database tables
Base.metadata.create_all(bind=engine)
add_missing_columns()
ensure_indexes()
lock_down_public_api()
backfill_live_dates()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    description="Production REST API for Super Riders Rider Management & Payment Tracking Platform",
    version="1.0.0",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development and preview
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Uploaded campaign banners and daily proof photos
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def start_slot_reminders():
    # Photo slot open / closing-soon notifications (and campaigns going live on their start date).
    slot_reminder_service.start_background_loop(SessionLocal)


@app.get("/", include_in_schema=False)
def root_redirect():
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": "1.0.0",
    }
