"""Photo slot notifications: "slot is open" when a slot starts and "closes soon" before it ends.

Runs every minute inside the API process (see start_background_loop). Each notification has a dedupe
key (assignment + date + slot + kind), so restarts, overlapping runs or several server processes never
send the same reminder twice. Only riders actively assigned to a live campaign that is running today
are notified, and never for a slot that already has a pending or approved photo.
"""
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.all_models import Notification
from app.models.campaign_models import (
    AssignmentStatus,
    Campaign,
    CampaignAssignment,
    CampaignDailyActivity,
    CampaignStatus,
    PhotoSlot,
    PhotoStatus,
)
from app.services import campaign_service as svc
from app.services.fulfillment_service import IST_OFFSET
from app.services.notification_service import send_notification

log = logging.getLogger("app.slot_reminders")


def _fmt(hhmm: str) -> str:
    """"17:00" → "5:00 PM"."""
    return datetime.strptime(hhmm, "%H:%M").strftime("%I:%M %p").lstrip("0")


def due_notifications(now_ist: datetime, windows: Dict[str, tuple], submitted: set) -> List[tuple]:
    """(slot, kind) pairs due at now_ist. kind is OPEN (inside the window) or CLOSING (in its last
    SLOT_REMINDER_MINUTES). Slots with a pending or approved photo get nothing."""
    clock = now_ist.strftime("%H:%M")
    due = []
    for slot in PhotoSlot.ALL:
        if slot in submitted:
            continue
        start, end = windows[slot]
        if not (start <= clock < end):
            continue
        closing_from = (datetime.strptime(end, "%H:%M") - timedelta(minutes=settings.SLOT_REMINDER_MINUTES)).strftime("%H:%M")
        # Near the end only the "closes soon" reminder goes out (never both at once after a restart).
        due.append((slot, "CLOSING" if clock >= closing_from else "OPEN"))
    return due


def run_once(db: Session, now_utc: Optional[datetime] = None) -> int:
    """Sends whatever is due right now. Returns how many notifications were created."""
    now_ist = (now_utc or datetime.utcnow()) + IST_OFFSET
    today = now_ist.date()
    campaigns = (
        db.query(Campaign)
        .filter(Campaign.status.in_(CampaignStatus.PUBLISHED), Campaign.live_at.isnot(None))
        .all()
    )
    sent = 0
    for campaign in campaigns:
        if not svc.is_running(campaign, today):
            continue
        windows = svc.slot_windows(campaign)
        assignments = (
            db.query(CampaignAssignment)
            .options(joinedload(CampaignAssignment.rider))
            .filter(CampaignAssignment.campaign_id == campaign.id, CampaignAssignment.status == AssignmentStatus.ACTIVE)
            .all()
        )
        if not assignments:
            continue
        activities = {
            a.assignment_id: a
            for a in db.query(CampaignDailyActivity)
            .options(joinedload(CampaignDailyActivity.photos))
            .filter(CampaignDailyActivity.campaign_id == campaign.id, CampaignDailyActivity.activity_date == today)
        }
        due = []
        for assignment in assignments:
            rider = assignment.rider
            if not rider or not rider.user_id:
                continue
            view = svc.slot_view(activities.get(assignment.id))
            submitted = {slot for slot, photo in view.items() if photo is not None and photo.status != PhotoStatus.REJECTED}
            for slot, kind in due_notifications(now_ist, windows, submitted):
                due.append((rider, slot, kind, f"SLOT_{kind}:{assignment.id}:{today.isoformat()}:{slot}"))
        if not due:
            continue
        # One lookup for everything already sent, instead of one per rider.
        already = {k for (k,) in db.query(Notification.dedupe_key).filter(Notification.dedupe_key.in_([d[3] for d in due]))}
        for rider, slot, kind, key in due:
            if key in already:
                continue
            label = PhotoSlot.LABELS[slot]
            start, end = (_fmt(t) for t in windows[slot])
            if kind == "OPEN":
                title = f"{label} selfie slot is open"
                message = f"{label} selfie slot is now open for {campaign.name}. Submit your photo between {start} and {end}."
            else:
                title = f"{label} slot closes soon"
                message = f"Your {label.lower()} selfie slot for {campaign.name} closes soon. Submit your photo before {end}."
            if send_notification(
                db=db, user_id=rider.user_id, title=title, message=message,
                category="CAMPAIGN", reference_id=str(campaign.id), dedupe_key=key,
            ):
                sent += 1
    return sent


_started = False


def start_background_loop(session_factory) -> None:
    """Starts the once-a-minute loop in a daemon thread (once per process)."""
    global _started
    if _started or not settings.SLOT_NOTIFICATIONS_ENABLED:
        return
    _started = True

    def loop():
        while True:
            db = session_factory()
            try:
                # Campaigns whose start date arrived go live here too, so their riders get the notice.
                for campaign in db.query(Campaign).filter(Campaign.status.in_(CampaignStatus.PUBLISHED), Campaign.live_at.is_(None)).all():
                    svc.sync_campaign_status(db, campaign)
                count = run_once(db)
                if count:
                    log.info("sent %s photo slot notifications", count)
            except Exception:  # Never let one bad run stop the reminders
                log.exception("photo slot notification run failed")
                db.rollback()
            finally:
                db.close()
            time.sleep(settings.SLOT_NOTIFICATION_INTERVAL_SECONDS)

    threading.Thread(target=loop, name="slot-reminders", daemon=True).start()
