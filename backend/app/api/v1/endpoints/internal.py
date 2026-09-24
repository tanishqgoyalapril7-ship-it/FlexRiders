"""Endpoints called by scheduled jobs, not by people. Protected by a shared secret header."""
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services import slot_reminder_service

router = APIRouter()


def require_cron_secret(x_cron_secret: str = Header(default="")) -> None:
    if not settings.CRON_SECRET or not hmac.compare_digest(x_cron_secret, settings.CRON_SECRET):
        raise HTTPException(status_code=401, detail="Not allowed")


@router.post("/cron/slot-reminders", dependencies=[Depends(require_cron_secret)])
def run_slot_reminders(db: Session = Depends(get_db)):
    """Every minute (Supabase pg_cron): campaigns going live on their start date, and photo-slot
    open / closing-soon reminders. Idempotent: each notification has a unique dedupe key."""
    return slot_reminder_service.tick(db)
