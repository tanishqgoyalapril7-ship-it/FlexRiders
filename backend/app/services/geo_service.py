"""Geo-targeting for campaigns: distances, the radius-expansion engine, rider matching and area search.

Only real coordinates are used: campaign targets and rider working areas come from the geocoder
(search_areas) or a map pin, and a rider's current location comes from their device. Nothing is guessed:
a campaign without target coordinates is *untargeted* (every eligible rider can see it, as before this
existed), and a rider without a recent location or working areas can't be matched to targeted campaigns.

Matching (see rider_match) uses two separate signals and never treats one as the other:
- current location: where the rider is now (reported by the app while in use, kept RIDER_LOCATION_MAX_AGE_MIN)
- working areas: up to three areas the rider usually works in (a prioritisation signal, not a restriction)
"""
import logging
import math
import re
import threading
import time as time_mod
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings

log = logging.getLogger("app.geo")

IST = timezone(timedelta(hours=5, minutes=30))
EARTH_RADIUS_KM = 6371.0088
MAX_WORKING_AREAS = 3


def now_ist() -> datetime:
    """Current time in Indian Standard Time (timezone-aware)."""
    return datetime.now(IST)


# ---------------------------------------------------------------------------
# Distances
# ---------------------------------------------------------------------------

def valid_coords(lat, lng) -> bool:
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    return -90 <= lat <= 90 and -180 <= lng <= 180 and not (lat == 0 and lng == 0)


def haversine_km(a: Tuple[float, float], b: Tuple[float, float]) -> float:
    """Great-circle distance in km."""
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def bounding_box(lat: float, lng: float, km: float) -> Tuple[float, float, float, float]:
    """(min_lat, max_lat, min_lng, max_lng) enclosing a circle: a cheap indexed SQL prefilter before the
    exact haversine check."""
    dlat = km / 111.32
    dlng = km / (111.32 * max(math.cos(math.radians(lat)), 0.01))
    return lat - dlat, lat + dlat, lng - dlng, lng + dlng


def path_length_km(points: Iterable[Tuple[float, float]]) -> float:
    total, prev = 0.0, None
    for p in points:
        if prev is not None:
            total += haversine_km(prev, p)
        prev = p
    return total


# ---------------------------------------------------------------------------
# Campaign times
# ---------------------------------------------------------------------------

def parse_clock(text: Optional[str]) -> Optional[Tuple[int, int]]:
    """'10:00 AM' / '18:30' → (hour, minute); None when absent or unreadable."""
    if not text:
        return None
    m = re.search(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", text.strip(), re.IGNORECASE)
    if not m:
        return None
    h, minute, meridiem = int(m.group(1)), int(m.group(2)), (m.group(3) or "").upper()
    if meridiem == "PM" and h < 12:
        h += 12
    elif meridiem == "AM" and h == 12:
        h = 0
    if h > 23 or minute > 59:
        return None
    return h, minute


def parse_campaign_start_datetime(start_date: date, daily_start_time: Optional[str] = None) -> datetime:
    """When the campaign starts, in IST: its start date at its daily start time, or at the start of that
    day when no daily time was set."""
    h, m = parse_clock(daily_start_time) or (0, 0)
    return datetime(start_date.year, start_date.month, start_date.day, h, m, tzinfo=IST)


# ---------------------------------------------------------------------------
# Radius expansion engine
# ---------------------------------------------------------------------------

def is_targeted(campaign) -> bool:
    return valid_coords(campaign.target_lat, campaign.target_lng) and bool(campaign.initial_radius_km)


def target_of(campaign) -> Optional[Tuple[float, float]]:
    return (float(campaign.target_lat), float(campaign.target_lng)) if is_targeted(campaign) else None


def current_radius(campaign) -> Optional[float]:
    if not is_targeted(campaign):
        return None
    return float(campaign.current_radius_km or campaign.initial_radius_km)


def _expansion_configured(campaign) -> bool:
    return bool(campaign.expansion_step_km and campaign.expansion_interval_min and campaign.max_radius_km)


def expansion_state(campaign, remaining_slots: int, accepting: bool) -> Dict:
    """What the engine is doing right now, for the admin geo panel (and the brand)."""
    radius = current_radius(campaign)
    if radius is None:
        return {"mode": "UNTARGETED", "label": "Not geo-targeted: visible to all eligible riders", "next_expansion_at": None}
    max_r = float(campaign.max_radius_km or radius)
    if not _expansion_configured(campaign):
        mode, label = "FIXED", "Fixed radius (automatic expansion not configured)"
    elif radius >= max_r:
        mode, label = "AT_MAX", "Maximum radius reached"
    elif campaign.expansion_paused:
        mode, label = "PAUSED", "Automatic expansion paused by admin"
    elif remaining_slots <= 0:
        mode, label = "FILLED", "All slots taken: expansion stopped"
    elif not accepting:
        mode, label = "WAITING", "Expansion runs only while the campaign is live and accepting riders"
    else:
        mode, label = "AUTOMATIC", "Automatic expansion"
    next_at = None
    if mode == "AUTOMATIC" and campaign.radius_updated_at:
        next_at = campaign.radius_updated_at + timedelta(minutes=int(campaign.expansion_interval_min))
    return {"mode": mode, "label": label, "next_expansion_at": next_at.isoformat() + "Z" if next_at else None}


def start_expansion_clock(campaign, now: Optional[datetime] = None) -> None:
    """Called when a campaign becomes visible to riders (and on resume): the first interval starts now."""
    if not is_targeted(campaign):
        return
    if campaign.current_radius_km is None:
        campaign.current_radius_km = float(campaign.initial_radius_km)
    campaign.radius_updated_at = now or datetime.utcnow()


def advance_radius(campaign, remaining_slots: int, accepting: bool, now: Optional[datetime] = None) -> Optional[Tuple[float, float]]:
    """Applies any expansion steps that are due. Returns (old_radius, new_radius) when it grew, else None.
    The caller commits. Time spent full, paused or not accepting riders doesn't count towards an interval."""
    if not is_targeted(campaign):
        return None
    now = now or datetime.utcnow()
    if campaign.current_radius_km is None or campaign.radius_updated_at is None:
        start_expansion_clock(campaign, now)
        return None
    radius = float(campaign.current_radius_km)
    if not _expansion_configured(campaign) or radius >= float(campaign.max_radius_km):
        return None
    if campaign.expansion_paused or remaining_slots <= 0 or not accepting:
        # Restart the interval so a slot that frees up later doesn't trigger a burst of banked steps.
        campaign.radius_updated_at = now
        return None
    interval = timedelta(minutes=int(campaign.expansion_interval_min))
    steps = int((now - campaign.radius_updated_at) / interval)
    if steps <= 0:
        return None
    new_radius = min(float(campaign.max_radius_km), radius + steps * float(campaign.expansion_step_km))
    campaign.current_radius_km = round(new_radius, 3)
    campaign.radius_updated_at = campaign.radius_updated_at + steps * interval
    return radius, campaign.current_radius_km


def validate_geo_config(initial: Optional[float], maximum: Optional[float], step: Optional[float], interval: Optional[int]) -> Optional[str]:
    """Why a campaign's geo settings are invalid, or None."""
    if initial is None:
        return None
    if initial <= 0:
        return "Initial radius must be more than 0 km."
    if maximum is not None and maximum < initial:
        return "Maximum radius can't be smaller than the initial radius."
    if (step is None) != (interval is None):
        return "Set both the expansion step and the expansion interval, or neither."
    if step is not None and step <= 0:
        return "Expansion step must be more than 0 km."
    if interval is not None and interval < 5:
        return "Expansion interval must be at least 5 minutes."
    if maximum is not None and maximum > 100:
        return "Maximum radius can't exceed 100 km."
    return None


# ---------------------------------------------------------------------------
# Rider matching
# ---------------------------------------------------------------------------

TIER_LABELS = {
    1: "In campaign area and a working-area match",
    2: "In campaign area",
    3: "Working-area match (currently farther away)",
    4: "Reached by radius expansion",
}


def fresh_rider_location(rider, now: Optional[datetime] = None) -> Optional[Tuple[float, float]]:
    """The rider's last reported location if it is recent enough to count as current."""
    if not rider.last_located_at or not valid_coords(rider.last_lat, rider.last_lng):
        return None
    now = now or datetime.utcnow()
    if now - rider.last_located_at > timedelta(minutes=settings.RIDER_LOCATION_MAX_AGE_MIN):
        return None
    return float(rider.last_lat), float(rider.last_lng)


def rider_match(
    campaign,
    current: Optional[Tuple[float, float]],
    working_areas: List[Dict],
) -> Dict:
    """How a rider relates to a campaign's target. working_areas: [{"label", "lat", "lng"}].

    Tiers (lower is better): 1 inside the initial radius *and* a working-area match; 2 inside the initial
    radius; 3 a working area inside the current radius while the rider is farther away now; 4 inside the
    current radius only because it expanded. in_reach is False for riders the campaign hasn't reached."""
    target = target_of(campaign)
    if target is None:
        return {"targeted": False, "in_reach": True, "tier": None, "distance_km": None,
                "working_area": None, "working_area_distance_km": None, "reason": None}
    initial = float(campaign.initial_radius_km)
    radius = current_radius(campaign)
    distance = haversine_km(current, target) if current else None
    wa_best, wa_dist = None, None
    for area in working_areas or []:
        if not valid_coords(area.get("lat"), area.get("lng")):
            continue
        d = haversine_km((float(area["lat"]), float(area["lng"])), target)
        if wa_dist is None or d < wa_dist:
            wa_best, wa_dist = area.get("label"), d
    wa_match = wa_dist is not None and wa_dist <= radius
    in_initial = distance is not None and distance <= initial
    in_current = distance is not None and distance <= radius

    if in_initial and wa_match:
        tier = 1
    elif in_initial:
        tier = 2
    elif wa_match:
        tier = 3
    elif in_current:
        tier = 4
    else:
        tier = None
    if tier is not None:
        reason = None
    elif current is None and not working_areas:
        reason = "Location permission is required to show campaigns near you."
    else:
        reason = "This campaign is outside your area right now."
    return {
        "targeted": True,
        "in_reach": tier is not None,
        "tier": tier,
        "distance_km": round(distance, 2) if distance is not None else None,
        "working_area": wa_best if wa_match else None,
        "working_area_distance_km": round(wa_dist, 2) if wa_dist is not None else None,
        "reason": reason,
    }


def working_areas_of(rider) -> List[Dict]:
    return [{"label": a.label, "lat": a.latitude, "lng": a.longitude} for a in (rider.working_areas or [])]


def riders_in_reach(db: Session, campaign, rider_filter=None, limit: int = 1000) -> List[Tuple[object, Dict]]:
    """Riders the campaign currently reaches, best tier first, then nearest. Uses an indexed bounding-box
    prefilter on current locations and working areas, then the exact rule in rider_match."""
    from app.models.all_models import Rider, RiderWorkingArea

    target = target_of(campaign)
    if target is None:
        return []
    radius = current_radius(campaign)
    min_lat, max_lat, min_lng, max_lng = bounding_box(target[0], target[1], radius)
    fresh_after = datetime.utcnow() - timedelta(minutes=settings.RIDER_LOCATION_MAX_AGE_MIN)
    by_location = db.query(Rider.id).filter(
        Rider.last_lat.between(min_lat, max_lat), Rider.last_lng.between(min_lng, max_lng), Rider.last_located_at >= fresh_after,
    )
    by_area = db.query(RiderWorkingArea.rider_id).filter(
        RiderWorkingArea.latitude.between(min_lat, max_lat), RiderWorkingArea.longitude.between(min_lng, max_lng),
    )
    ids = {r for (r,) in by_location} | {r for (r,) in by_area}
    if not ids:
        return []
    query = db.query(Rider).filter(Rider.id.in_(ids), Rider.archived_at.is_(None))
    if rider_filter is not None:
        query = query.filter(rider_filter)
    matches = []
    for rider in query.all():
        m = rider_match(campaign, fresh_rider_location(rider), working_areas_of(rider))
        if m["in_reach"]:
            matches.append((rider, m))
    matches.sort(key=lambda rm: (rm[1]["tier"], rm[1]["distance_km"] if rm[1]["distance_km"] is not None else 1e9))
    return matches[:limit]


# ---------------------------------------------------------------------------
# Area search (geocoding)
# ---------------------------------------------------------------------------

class GeocoderError(RuntimeError):
    pass


_cache: Dict[str, Tuple[float, List[Dict]]] = {}
_cache_lock = threading.Lock()
_last_call = [0.0]
CACHE_SECONDS = 24 * 3600


def _label(item: Dict) -> str:
    addr = item.get("address") or {}
    primary = (
        addr.get("suburb") or addr.get("neighbourhood") or addr.get("quarter") or addr.get("residential")
        or addr.get("road") or item.get("name") or ""
    )
    city = addr.get("city") or addr.get("town") or addr.get("state_district") or addr.get("county") or ""
    parts = [p for p in (primary, city) if p]
    if not parts or (len(parts) == 2 and parts[0] == parts[1]):
        parts = [p.strip() for p in (item.get("display_name") or "").split(",")[:2]]
    return ", ".join(dict.fromkeys(parts))


def search_areas(query: str, limit: int = 6, near: Optional[Tuple[float, float]] = None) -> List[Dict]:
    """Real places matching the query: [{"label", "description", "lat", "lng"}]. With `near` (the searcher's
    real location), places within ~45 km come first ("Sector 56" finds the one in your city); otherwise the
    whole country is searched. Results are cached and calls are spaced to respect the geocoder's policy."""
    q = re.sub(r"\s+", " ", (query or "").strip())
    if len(q) < 3:
        return []
    if near and valid_coords(*near):
        lat, lng = round(near[0], 2), round(near[1], 2)  # Rounded: cache-friendly and no precise location sent
        local = _geocode(q, limit, {"viewbox": f"{lng - 0.4},{lat + 0.4},{lng + 0.4},{lat - 0.4}", "bounded": 1}, f"{lat},{lng}")
        if local:
            return local
    return _geocode(q, limit, {}, "")


def _geocode(q: str, limit: int, extra: Dict, scope: str) -> List[Dict]:
    key = f"{q.lower()}|{limit}|{scope}"
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time_mod.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
        wait = 1.0 - (time_mod.time() - _last_call[0])
        if wait > 0:
            time_mod.sleep(wait)
        _last_call[0] = time_mod.time()
    params = {"q": q, "format": "jsonv2", "addressdetails": 1, "limit": limit, **extra}
    if settings.GEOCODER_COUNTRY_CODES:
        params["countrycodes"] = settings.GEOCODER_COUNTRY_CODES
    try:
        res = httpx.get(settings.GEOCODER_URL, params=params, headers={"User-Agent": settings.GEOCODER_USER_AGENT}, timeout=8)
        res.raise_for_status()
        items = res.json()
    except (httpx.HTTPError, ValueError) as e:
        log.warning("geocoder failed: %s", e.__class__.__name__)
        raise GeocoderError("Area search is unavailable right now. Please try again.")
    results, seen = [], set()
    for item in items if isinstance(items, list) else []:
        try:
            lat, lng = float(item["lat"]), float(item["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        label = _label(item)
        if not label or label in seen:
            continue
        seen.add(label)
        results.append({"label": label[:200], "description": (item.get("display_name") or "")[:300], "lat": lat, "lng": lng})
    with _cache_lock:
        _cache[key] = (time_mod.time(), results)
    return results
