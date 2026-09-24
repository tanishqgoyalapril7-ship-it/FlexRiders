import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, lock_down_public_api, add_missing_columns, ensure_indexes
from app.api.v1.api import api_router
from app.services import slot_reminder_service, storage_service
from app.services.campaign_service import backfill_live_dates

_migrate = settings.RUN_STARTUP_MIGRATIONS.lower()
if _migrate == "true" or (_migrate != "false" and not settings.VERCEL):
    # Create new tables/columns/indexes and keep the public REST API locked (see core/database.py).
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
    allow_origins=settings.BACKEND_CORS_ORIGINS + [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Uploaded campaign banners and daily proof photos: local folder, or the private Supabase bucket via a
# short-lived signed link (the stored "/uploads/..." paths are the same either way).
if storage_service.remote():

    @app.get("/uploads/{path:path}", include_in_schema=False)
    def uploaded_file(path: str):
        url = storage_service.signed_url(path)
        if not url:
            raise HTTPException(status_code=404, detail="File not found")
        return RedirectResponse(url, status_code=302)

elif os.path.isdir(settings.UPLOAD_DIR):
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
