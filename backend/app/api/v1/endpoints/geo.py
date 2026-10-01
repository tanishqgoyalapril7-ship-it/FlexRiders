"""Area search, rider working areas and the rider's current location."""
import hashlib
import time
from collections import deque
from datetime import datetime
from typing import Deque, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_rider
from app.core.database import get_db
from app.models.all_models import Rider, RiderWorkingArea
from app.services import geo_service as geo

router = APIRouter()
rider_router = APIRouter()

# Area search is open to riders still registering (not signed in yet), so it is rate limited per client.
_SEARCH_LIMIT, _SEARCH_WINDOW = 30, 60.0
_recent: Dict[str, Deque[float]] = {}


def _client_key(request: Request) -> str:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "")
    return hashlib.sha256(ip.encode()).hexdigest()[:32]


@router.get("/search")
def search_areas(
    request: Request,
    q: str = Query(..., min_length=3, max_length=120),
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
):
    """Real places for a search such as "Sector 54 Gurugram" → [{label, description, lat, lng}]."""
    key, now = _client_key(request), time.time()
    hits = _recent.setdefault(key, deque())
    while hits and now - hits[0] > _SEARCH_WINDOW:
        hits.popleft()
    if len(hits) >= _SEARCH_LIMIT:
        raise HTTPException(status_code=429, detail="Too many searches. Please wait a minute and try again.")
    hits.append(now)
    try:
        return geo.search_areas(q, near=(lat, lng) if lat is not None and lng is not None else None)
    except geo.GeocoderError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/defaults")
def geo_defaults():
    """Radius settings prefilled on new campaigns (each campaign keeps its own copy, which can be changed)."""
    from app.core.config import settings

    return {
        "initial_radius_km": settings.CAMPAIGN_DEFAULT_INITIAL_RADIUS_KM,
        "max_radius_km": settings.CAMPAIGN_DEFAULT_MAX_RADIUS_KM,
        "expansion_step_km": settings.CAMPAIGN_DEFAULT_EXPANSION_STEP_KM,
        "expansion_interval_min": settings.CAMPAIGN_DEFAULT_EXPANSION_INTERVAL_MIN,
    }


class WorkingAreaIn(BaseModel):
    label: str = Field(..., min_length=2, max_length=200)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class WorkingAreasUpdate(BaseModel):
    areas: List[WorkingAreaIn] = Field(..., max_length=geo.MAX_WORKING_AREAS)


class LocationUpdate(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


def working_areas_payload(rider: Rider) -> List[dict]:
    return [{"id": a.id, "label": a.label, "lat": a.latitude, "lng": a.longitude} for a in rider.working_areas]


def replace_working_areas(db: Session, rider: Rider, areas: List[WorkingAreaIn]) -> None:
    """Stores up to three working areas (from the area search), replacing the previous ones."""
    if len(areas) > geo.MAX_WORKING_AREAS:
        raise HTTPException(status_code=400, detail=f"Select up to {geo.MAX_WORKING_AREAS} working areas.")
    labels = set()
    for a in areas:
        if not geo.valid_coords(a.lat, a.lng):
            raise HTTPException(status_code=400, detail=f"Pick “{a.label}” from the search results again.")
        if a.label.strip().lower() in labels:
            raise HTTPException(status_code=400, detail=f"“{a.label}” is selected twice.")
        labels.add(a.label.strip().lower())
    db.query(RiderWorkingArea).filter(RiderWorkingArea.rider_id == rider.id).delete()
    for i, a in enumerate(areas):
        db.add(RiderWorkingArea(rider_id=rider.id, label=a.label.strip(), latitude=a.lat, longitude=a.lng, position=i))
    # The first working area also fills the legacy "area" field shown in admin lists.
    if areas:
        rider.primary_area = areas[0].label.strip()[:120]
    db.commit()
    db.refresh(rider)


@rider_router.get("/me/working-areas")
def my_working_areas(rider: Rider = Depends(get_current_rider)):
    return {"max": geo.MAX_WORKING_AREAS, "areas": working_areas_payload(rider)}


@rider_router.put("/me/working-areas")
def update_my_working_areas(payload: WorkingAreasUpdate, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    replace_working_areas(db, rider, payload.areas)
    return {"max": geo.MAX_WORKING_AREAS, "areas": working_areas_payload(rider)}


@rider_router.post("/me/location")
def update_my_location(payload: LocationUpdate, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    """The device's current location while the app is open (for nearby campaigns). Only the latest fix is
    kept; campaign routes are recorded separately and only while the rider records one."""
    if not geo.valid_coords(payload.lat, payload.lng):
        raise HTTPException(status_code=400, detail="Invalid location.")
    rider.last_lat, rider.last_lng, rider.last_located_at = payload.lat, payload.lng, datetime.utcnow()
    db.commit()
    return {"ok": True, "located_at": rider.last_located_at}
