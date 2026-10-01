"""Real-time signals over Supabase Realtime Broadcast.

The rider app and admin dashboard use FlexRiders' own logins (not Supabase Auth), so they can't join
Supabase *private* channels. Instead:
- The server broadcasts only a signal ("conversation 12 changed") — never message text or personal data.
- Each rider has their own channel and admins share one; channel names are HMACs of the server's
  SECRET_KEY, so they can't be guessed. They are handed out only through the authenticated API.
- On a signal, clients fetch the actual data from this API, which checks who is asking.
Broadcasting is best effort: a failure never fails the request, and clients also refresh on focus.
"""
import hashlib
import hmac
import logging
from datetime import datetime
from typing import Any, Dict, Iterable, Optional

import httpx

from app.core.config import settings

log = logging.getLogger("app.realtime")

# Public by design (Supabase "publishable" key): lets clients open a Realtime connection and nothing
# else here, since every table has RLS on with no policies. Can be overridden with an env var.
DEFAULT_PUBLISHABLE_KEY = "sb_publishable_YVJ9SdLjnTGXzWBcdHGvFw_kJ5PuZgy"


def enabled() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY)


def _topic(kind: str, ident: str) -> str:
    digest = hmac.new(settings.SECRET_KEY.encode(), f"{kind}:{ident}".encode(), hashlib.sha256).hexdigest()[:40]
    return f"support-{kind}-{digest}"


def rider_topic(rider_id: int) -> str:
    return _topic("rider", str(rider_id))


def admin_topic() -> str:
    return _topic("admins", "inbox")


def client_config(topic: str) -> Dict:
    """What a signed-in client needs to listen for its own signals."""
    return {
        "enabled": enabled(),
        "url": settings.SUPABASE_URL.rstrip("/") if enabled() else None,
        "key": (settings.SUPABASE_PUBLISHABLE_KEY or DEFAULT_PUBLISHABLE_KEY) if enabled() else None,
        "topic": topic,
        "event": "support",
    }


def campaign_discovery_topic() -> str:
    """Signals for the rider app's campaign lists (slots, status, radius). Payloads carry only a campaign id."""
    return _topic("campaigns", "discovery")


def brand_topic(brand_id: int) -> str:
    return _topic("brand", str(brand_id))


def campaign_realtime_config() -> Dict:
    """Client config for subscribing to campaign discovery updates."""
    return {**client_config(campaign_discovery_topic()), "event": "campaigns"}


def brand_realtime_config(brand_id: int) -> Dict:
    return {**client_config(brand_topic(brand_id)), "event": "campaigns"}


def broadcast(topics: Iterable[str], payload: Dict) -> bool:
    """Sends a support-chat signal to each topic (one request). Returns False when it couldn't be sent."""
    return _send(topics, payload, "support")


def _send(topics: Iterable[str], payload: Dict, event: str) -> bool:
    topics = list(dict.fromkeys(topics))
    if not topics or not enabled():
        return False
    try:
        res = httpx.post(
            settings.SUPABASE_URL.rstrip("/") + "/realtime/v1/api/broadcast",
            headers={"apikey": settings.SUPABASE_SECRET_KEY, "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}"},
            json={"messages": [{"topic": t, "event": event, "payload": payload, "private": False} for t in topics]},
            timeout=5,
        )
        return res.status_code < 300
    except httpx.HTTPError as e:
        log.warning("realtime broadcast failed: %s", e.__class__.__name__)
        return False


def broadcast_campaign_update(campaign, event_type: str) -> bool:
    """A campaign's slots, status or reach changed: tell rider apps, the owning brand and admins to refetch.
    The payload never contains personal data."""
    payload = {"campaign_id": campaign.id, "event_type": event_type, "timestamp": datetime.utcnow().isoformat() + "Z"}
    topics = [campaign_discovery_topic(), admin_topic()]
    if getattr(campaign, "brand_id", None):
        topics.append(brand_topic(campaign.brand_id))
    return _send(topics, payload, "campaigns")


def broadcast_admin_update(campaign, event_type: str, **extra) -> bool:
    """Tracking/review activity (route points uploaded, photo submitted): only admins and the owning brand
    need it, so rider apps aren't made to refetch on every GPS batch. No personal data in the payload."""
    payload = {"campaign_id": campaign.id, "event_type": event_type, "timestamp": datetime.utcnow().isoformat() + "Z", **extra}
    topics = [admin_topic()]
    if getattr(campaign, "brand_id", None):
        topics.append(brand_topic(campaign.brand_id))
    return _send(topics, payload, "campaigns")


def admin_campaign_config() -> Dict:
    """Where the admin dashboard listens for campaign signals (same admin channel, campaign event)."""
    return {**client_config(admin_topic()), "event": "campaigns"}
