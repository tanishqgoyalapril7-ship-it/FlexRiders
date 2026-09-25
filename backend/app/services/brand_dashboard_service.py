"""Customer (brand) dashboard: one brand's profile, campaigns, delivery, money and activity.

Brands are FlexRiders' customers. Every figure here comes from the existing sources of truth:
campaign_fulfillment() for rider-days and fulfilment, campaign_stats() for riders / requests / photos,
brand_financials() and rider_financials() for money, and the audit log for activity. Nothing is
recalculated a second way or estimated.
"""
from datetime import date, datetime
from typing import Dict, List, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.all_models import AuditLog, Brand, Payment
from app.models.campaign_models import (
    BrandPaymentRecord,
    Campaign,
    CampaignActivityPhoto,
    CampaignCategory,
    PhotoStatus,
    VehicleCategory,
)
from app.services import campaign_service as svc
from app.services import fulfillment_service as fs
from app.services import terms_service

ACTIVITY_LIMIT = 200


def _vehicle_label(allowed: List[str]) -> str:
    if not allowed or set(allowed) == set(VehicleCategory.ALL):
        return "All vehicles"
    return ", ".join(VehicleCategory.LABELS[c] for c in allowed)


def filter_campaigns(
    campaigns: List[Campaign],
    status: Optional[str] = None,
    category: Optional[str] = None,
    vehicle: Optional[str] = None,
    campaign_id: Optional[int] = None,
    start_from: Optional[date] = None,
    end_to: Optional[date] = None,
) -> List[Campaign]:
    """The same filter rules as the campaign list (vehicle = campaigns this vehicle type can join)."""
    result = []
    for c in campaigns:
        if campaign_id and c.id != campaign_id:
            continue
        if status and status != "ALL" and c.status != status:
            continue
        if category and category != "ALL" and (c.campaign_category or CampaignCategory.STANDARD) != category:
            continue
        if vehicle and vehicle != "ALL":
            allowed = svc.eligible_categories(c)
            if allowed and vehicle not in allowed:
                continue
        if start_from and c.start_date < start_from:
            continue
        if end_to and c.end_date > end_to:
            continue
        result.append(c)
    return result


def campaign_row(db: Session, campaign: Campaign) -> Dict:
    f = fs.campaign_fulfillment(db, campaign)
    stats = svc.campaign_stats(db, campaign)
    allowed = svc.eligible_categories(campaign)
    rejected_photos = (
        db.query(CampaignActivityPhoto)
        .filter(CampaignActivityPhoto.campaign_id == campaign.id, CampaignActivityPhoto.status == PhotoStatus.REJECTED)
        .count()
    )
    perf = f["rider_performance"].values()
    return {
        "id": campaign.id,
        "name": campaign.name,
        "campaign_category": campaign.campaign_category or CampaignCategory.STANDARD,
        "campaign_category_label": CampaignCategory.LABELS.get(campaign.campaign_category or CampaignCategory.STANDARD),
        "status": campaign.status,
        "lifecycle": svc.lifecycle(campaign),
        "start_date": campaign.start_date.isoformat(),
        "end_date": campaign.end_date.isoformat(),
        "effective_end_date": f["effective_end"],
        "eligible_vehicle_categories": allowed,
        "eligible_vehicle_label": _vehicle_label(allowed),
        "terms_version": (lambda t: t.version if t else None)(terms_service.current_terms(db, campaign.id)),
        # Rider-days (source of truth: campaign_fulfillment)
        "contracted_rider_days": f["contracted_rider_days"],
        "delivered_rider_days": f["delivered_rider_days"],
        "remaining_rider_days": f["remaining_rider_days"],
        "fulfillment_pct": f["fulfillment_pct"],
        "delivery_status": f["delivery_status"],
        # Riders and review queues (source of truth: campaign_stats)
        "assigned_riders": stats["assigned_riders"],
        "active_riders": stats["active_riders"],
        "completed_riders": stats["completed_riders"],
        "pending_requests": stats["requested_riders"],
        "pending_photos": stats.get("pending_photos", 0),
        "rejected_photos": rejected_photos,
        # Past eligible rider-days (to yesterday) that have no approved proof: missed, rejected or still in review.
        "rider_days_without_approval": sum(max(p["elapsed_eligible_days"] - p["approved_days_so_far"], 0) for p in perf),
        "excused_rider_days": f["excused_rider_days"],
        # Money
        "brand": f["brand"],
        "rider_payout": f["rider_payout"],
    }


def _sum(rows: List[Dict], key: str, sub: Optional[str] = None) -> float:
    return round(sum((r[sub][key] if sub else r[key]) or 0 for r in rows), 2)


def totals(rows: List[Dict]) -> Dict:
    contracted = sum(r["contracted_rider_days"] for r in rows)
    delivered_in_contract = sum(min(r["delivered_rider_days"], r["contracted_rider_days"]) for r in rows)
    return {
        "campaigns": len(rows),
        "live_campaigns": sum(1 for r in rows if r["status"] == "ACTIVE"),
        "contracted_rider_days": contracted,
        "delivered_rider_days": sum(r["delivered_rider_days"] for r in rows),
        "remaining_rider_days": sum(r["remaining_rider_days"] for r in rows),
        # Weighted by contract size: delivered within contract / contracted, across the brand's campaigns.
        "fulfillment_pct": round(delivered_in_contract / contracted * 100, 2) if contracted else 0.0,
        "assigned_riders": sum(r["assigned_riders"] for r in rows),
        "active_riders": sum(r["active_riders"] for r in rows),
        "completed_riders": sum(r["completed_riders"] for r in rows),
        "pending_requests": sum(r["pending_requests"] for r in rows),
        "pending_photos": sum(r["pending_photos"] for r in rows),
        "rejected_photos": sum(r["rejected_photos"] for r in rows),
        "rider_days_without_approval": sum(r["rider_days_without_approval"] for r in rows),
        "contract_value": _sum(rows, "contract_value", "brand"),
        "received": _sum(rows, "net_received", "brand"),
        "outstanding": _sum(rows, "outstanding", "brand"),
        "rider_earned": _sum(rows, "earned", "rider_payout"),
        "rider_paid": _sum(rows, "paid", "rider_payout"),
        "rider_pending": _sum(rows, "pending", "rider_payout"),
    }


def payments(db: Session, campaigns: List[Campaign]) -> List[Dict]:
    """Money from the customer (brand payment records) and payouts made to riders, newest first."""
    ids = [c.id for c in campaigns]
    names = {c.id: c.name for c in campaigns}
    if not ids:
        return []
    rows = [
        {
            "type": "BRAND_" + r.kind,  # BRAND_RECEIVED / BRAND_REFUND / BRAND_CREDIT
            "campaign_id": r.campaign_id,
            "campaign_name": names.get(r.campaign_id),
            "amount": r.amount,
            "date": r.record_date.isoformat(),
            "reference": r.reference,
            "note": r.note,
            "status": None,
            "rider_name": None,
        }
        for r in db.query(BrandPaymentRecord).filter(BrandPaymentRecord.campaign_id.in_(ids)).all()
    ] + [
        {
            "type": "RIDER_PAYOUT",
            "campaign_id": p.campaign_id,
            "campaign_name": names.get(p.campaign_id),
            "amount": p.amount,
            "date": (p.payment_date.date() if isinstance(p.payment_date, datetime) else p.payment_date).isoformat() if p.payment_date else None,
            "reference": p.transaction_id or p.payment_reference,
            "note": p.notes,
            "status": p.status,
            "rider_name": p.rider.full_name if p.rider else None,
        }
        for p in db.query(Payment).filter(Payment.campaign_id.in_(ids)).all()
    ]
    return sorted(rows, key=lambda r: r["date"] or "", reverse=True)


def activity(db: Session, brand: Brand, campaigns: List[Campaign]) -> List[Dict]:
    """Audit-log entries for the brand and its campaigns, plus the campaigns' own recorded milestones."""
    ids = [str(c.id) for c in campaigns]
    conditions = [and_(AuditLog.target_type == "BRAND", AuditLog.target_id == str(brand.id))]
    if ids:
        conditions.append(and_(AuditLog.target_type == "CAMPAIGN", AuditLog.target_id.in_(ids)))
    names = {str(c.id): c.name for c in campaigns}
    events = [
        {
            "at": log.created_at,
            "action": log.action,
            "details": log.details,
            "by": log.admin_email,
            "campaign_id": int(log.target_id) if log.target_type == "CAMPAIGN" and log.target_id.isdigit() else None,
            "campaign_name": names.get(log.target_id) if log.target_type == "CAMPAIGN" else None,
        }
        for log in db.query(AuditLog).filter(or_(*conditions)).order_by(AuditLog.created_at.desc()).limit(ACTIVITY_LIMIT)
    ]
    # Milestones the system records on the campaign itself (going live and completing happen by date, not by an admin).
    logged = {(e["campaign_id"], e["action"]) for e in events}
    for c in campaigns:
        for action, at, text in (
            ("CAMPAIGN_LIVE", c.live_at, "went live"),
            ("CAMPAIGN_COMPLETED", c.completed_at, "completed"),
            ("CAMPAIGN_CANCELLED", c.cancelled_at, "was cancelled"),
        ):
            if at and (c.id, action) not in logged:
                events.append({"at": at, "action": action, "details": f"{c.name} {text}", "by": None, "campaign_id": c.id, "campaign_name": c.name})
    return sorted(events, key=lambda e: e["at"] or datetime.min, reverse=True)[:ACTIVITY_LIMIT]


def dashboard(db: Session, brand: Brand, **filters) -> Dict:
    all_campaigns = db.query(Campaign).filter(Campaign.brand_id == brand.id).order_by(Campaign.start_date.desc(), Campaign.id.desc()).all()
    all_campaigns = [svc.sync_campaign_status(db, c) for c in all_campaigns]
    shown = filter_campaigns(all_campaigns, **filters)
    rows = [campaign_row(db, c) for c in shown]
    return {
        "campaigns": rows,
        "totals": totals(rows),
        "payments": payments(db, shown),
        "activity": activity(db, brand, shown),
        # For the filter dropdown: every campaign of this customer, whatever the filters.
        "campaign_options": [{"id": c.id, "name": c.name} for c in all_campaigns],
        "filtered": len(shown) != len(all_campaigns),
    }
