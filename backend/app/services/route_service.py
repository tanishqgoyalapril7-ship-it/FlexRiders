"""Rider routes: real GPS points from the rider app, drawn as a line on the admin map.

Only coordinates are exposed to admins; no distance, speed, duration or other statistics.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.campaign_models import AssignmentStatus, Campaign, CampaignAssignment, RoutePoint
from app.services import fulfillment_service as fs

MAX_POINTS_PER_BATCH = 500
MAX_ACCURACY_M = 100  # Fixes less precise than this are dropped (they make the line jump around)
MAX_MAP_POINTS = 2000  # Per rider per day, after thinning, so the map stays fast


class RouteError(ValueError):
    pass


def _to_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def record_points(db: Session, assignment: CampaignAssignment, points: List[Dict]) -> int:
    """Stores a batch of GPS fixes for the rider's active campaign. Returns how many were kept."""
    if assignment.status != AssignmentStatus.ACTIVE:
        raise RouteError("Routes are only recorded while you're active in a campaign.")
    if len(points) > MAX_POINTS_PER_BATCH:
        raise RouteError(f"Send at most {MAX_POINTS_PER_BATCH} points at a time.")
    campaign = assignment.campaign
    window_start, window_end = fs.rider_window(campaign, assignment)
    now = datetime.utcnow()
    existing = {
        t for (t,) in db.query(RoutePoint.recorded_at).filter(
            RoutePoint.assignment_id == assignment.id,
            RoutePoint.recorded_at.in_([_to_utc_naive(p["recorded_at"]) for p in points]),
        )
    } if points else set()

    kept = 0
    for p in points:
        recorded = _to_utc_naive(p["recorded_at"])
        if recorded > now + timedelta(minutes=5) or recorded in existing:
            continue  # Future timestamps and duplicates (retried uploads) are ignored
        if p.get("accuracy") is not None and p["accuracy"] > MAX_ACCURACY_M:
            continue
        day = fs.to_ist_date(recorded)
        if not (window_start <= day <= window_end) or not fs.is_eligible_date(campaign, day):
            continue  # Only campaign days count
        db.add(
            RoutePoint(
                campaign_id=campaign.id,
                assignment_id=assignment.id,
                rider_id=assignment.rider_id,
                route_date=day,
                recorded_at=recorded,
                latitude=p["latitude"],
                longitude=p["longitude"],
                accuracy_m=p.get("accuracy"),
            )
        )
        existing.add(recorded)
        kept += 1
    db.commit()
    return kept


def _thin(points: List[List[float]], limit: int = MAX_MAP_POINTS) -> List[List[float]]:
    """Keeps every n-th point (always the first and last) so long days stay light to draw."""
    if len(points) <= limit:
        return points
    step = len(points) / (limit - 1)
    thinned = [points[int(i * step)] for i in range(limit - 1)]
    return thinned + [points[-1]]


def route_dates(db: Session, campaign: Campaign, assignment_id: Optional[int] = None) -> List[str]:
    query = db.query(RoutePoint.route_date).filter(RoutePoint.campaign_id == campaign.id)
    if assignment_id:
        query = query.filter(RoutePoint.assignment_id == assignment_id)
    return sorted({d.isoformat() for (d,) in query.distinct()})


def routes_for_day(db: Session, campaign: Campaign, day: date, assignment_id: Optional[int] = None) -> List[Dict]:
    """[{assignment_id, rider, points: [[lat, lng], ...]}] for each rider with a route that day."""
    query = db.query(RoutePoint).filter(RoutePoint.campaign_id == campaign.id, RoutePoint.route_date == day)
    if assignment_id:
        query = query.filter(RoutePoint.assignment_id == assignment_id)
    by_assignment: Dict[int, List[RoutePoint]] = {}
    for point in query.order_by(RoutePoint.assignment_id, RoutePoint.recorded_at):
        by_assignment.setdefault(point.assignment_id, []).append(point)
    assignments = {a.id: a for a in campaign.assignments}
    routes = []
    for aid, pts in by_assignment.items():
        if len(pts) < 2:
            continue  # A single fix isn't a route
        rider = assignments[aid].rider if aid in assignments else None
        routes.append(
            {
                "assignment_id": aid,
                "rider": {"id": rider.id, "rider_id": rider.rider_id, "full_name": rider.full_name} if rider else None,
                "points": _thin([[round(p.latitude, 6), round(p.longitude, 6)] for p in pts]),
            }
        )
    return sorted(routes, key=lambda r: (r["rider"] or {}).get("full_name", ""))
