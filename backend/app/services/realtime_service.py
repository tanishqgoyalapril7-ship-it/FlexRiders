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
from typing import Dict, Iterable

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


def broadcast(topics: Iterable[str], payload: Dict) -> bool:
    """Sends the signal to each topic (one request). Returns False when it couldn't be sent."""
    topics = list(dict.fromkeys(topics))
    if not topics or not enabled():
        return False
    try:
        res = httpx.post(
            settings.SUPABASE_URL.rstrip("/") + "/realtime/v1/api/broadcast",
            headers={"apikey": settings.SUPABASE_SECRET_KEY, "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}"},
            json={"messages": [{"topic": t, "event": "support", "payload": payload, "private": False} for t in topics]},
            timeout=5,
        )
        return res.status_code < 300
    except httpx.HTTPError as e:
        log.warning("realtime broadcast failed: %s", e.__class__.__name__)
        return False
