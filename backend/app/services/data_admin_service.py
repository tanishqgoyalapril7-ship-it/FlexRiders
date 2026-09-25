"""Safe deletion, archiving and data reset.

Rule of thumb: a record is hard-deleted only when nothing historical (payments, payouts, campaign
activity, photos, brand money, assignments) depends on it. Otherwise it is archived / deactivated /
cancelled so reports, payouts and fulfilment figures stay intact.
"""
import os
import shutil
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import UserRole
from app.models.all_models import (
    RiderReferral,
    Brand,
    Notification,
    Payment,
    Rider,
    RiderBrandAssignment,
    RiderDocument,
    RiderStatus,
    SupportTicket,
    User,
)
from app.models.campaign_models import (
    ActivityChangeLog,
    ApplicationStatus,
    AssignmentStatus,
    BrandPaymentRecord,
    Campaign,
    CampaignActivityPhoto,
    CampaignApplication,
    CampaignAssignment,
    CampaignBrandKit,
    CampaignDailyActivity,
    CampaignExtension,
    CampaignFulfillmentSnapshot,
    CampaignPayout,
    CampaignPickupLocation,
    CampaignTermsAcceptance,
    CampaignStatus,
    FinancialAdjustment,
    PayoutStatus,
    RiderBrandKit,
    RoutePoint,
)
from app.services.audit_service import log_admin_action


class DataAdminError(ValueError):
    """A delete/reset that would break history or isn't allowed."""


def _count(db: Session, column, *filters) -> int:
    return db.query(func.count(column)).filter(*filters).scalar() or 0


# ---------------------------------------------------------------------------
# Riders
# ---------------------------------------------------------------------------

def rider_impact(db: Session, rider: Rider) -> Dict:
    """What deleting this rider would touch. History blocks a hard delete (archive instead)."""
    counts = {
        "payments": _count(db, Payment.id, Payment.rider_id == rider.id),
        "brand_assignments": _count(db, RiderBrandAssignment.id, RiderBrandAssignment.rider_id == rider.id),
        "campaign_assignments": _count(db, CampaignAssignment.id, CampaignAssignment.rider_id == rider.id),
        "campaign_days": _count(db, CampaignDailyActivity.id, CampaignDailyActivity.rider_id == rider.id),
        "campaign_photos": _count(db, CampaignActivityPhoto.id, CampaignActivityPhoto.rider_id == rider.id),
        "campaign_requests": _count(db, CampaignApplication.id, CampaignApplication.rider_id == rider.id),
        "terms_acceptances": _count(db, CampaignTermsAcceptance.id, CampaignTermsAcceptance.rider_id == rider.id),
        "documents": _count(db, RiderDocument.id, RiderDocument.rider_id == rider.id),
        "notifications": _count(db, Notification.id, Notification.user_id == rider.user_id) if rider.user_id else 0,
    }
    # Accepted terms are consent records, so they count as history (archive instead of deleting).
    history_keys = ("payments", "brand_assignments", "campaign_assignments", "campaign_days", "campaign_photos", "terms_acceptances")
    blockers = [k for k in history_keys if counts[k]]
    current_brand = next((a.brand.name for a in rider.brand_assignments if a.is_current and a.brand), None)
    current_campaign = (
        db.query(CampaignAssignment)
        .filter(CampaignAssignment.rider_id == rider.id, CampaignAssignment.status.in_(AssignmentStatus.CURRENT))
        .first()
    )
    return {
        "entity": "rider",
        "id": rider.id,
        "name": f"{rider.full_name} ({rider.rider_id})",
        "counts": counts,
        "can_hard_delete": not blockers,
        "blocked_by": blockers,
        "current_brand": current_brand,
        "current_campaign": current_campaign.campaign.name if current_campaign else None,
        "archived": rider.archived_at is not None,
        "recommended_action": "DELETE" if not blockers else "ARCHIVE",
    }


def hard_delete_rider(db: Session, rider: Rider, admin: Optional[User], reason: str = "") -> None:
    impact = rider_impact(db, rider)
    if not impact["can_hard_delete"]:
        raise DataAdminError(
            "This rider has payment, brand or campaign history, so they can't be permanently deleted. Archive them instead."
        )
    label, user, selfie = impact["name"], rider.user, rider.profile_photo
    db.query(CampaignApplication).filter(CampaignApplication.rider_id == rider.id).delete(synchronize_session=False)
    # Referral links to or from this rider (a rider with a rewarded referral has payments, so isn't deleted here).
    db.query(RiderReferral).filter(
        (RiderReferral.referred_rider_id == rider.id) | (RiderReferral.referrer_rider_id == rider.id)
    ).delete(synchronize_session=False)
    db.query(Rider).filter(Rider.referred_by_rider_id == rider.id).update({Rider.referred_by_rider_id: None}, synchronize_session=False)
    db.delete(rider)  # Cascades documents and support tickets
    db.flush()
    if user is not None:
        db.delete(user)  # Cascades the rider's notifications
    db.commit()
    _remove_upload(selfie)  # The driver selfie is personal data: it goes with the rider
    if admin is not None:
        log_admin_action(db=db, admin_user=admin, action="RIDER_DELETED", target_type="RIDER", target_id=label, details=f"{label} permanently deleted. {reason}".strip())


def archive_rider(db: Session, rider: Rider, admin: Optional[User], reason: str) -> Rider:
    """Soft delete: hides the rider and blocks login, ends current brand/campaign, keeps all history."""
    from app.services import campaign_service as svc  # Local import avoids a circular import

    if rider.archived_at:
        raise DataAdminError("This rider is already archived.")
    now = datetime.utcnow()
    for assignment in rider.brand_assignments:
        if assignment.is_current:
            assignment.is_current = False
            assignment.removal_date = now
    current = svc.current_assignment(db, rider.id)
    if current:
        # remove_assignment needs an admin for the audit trail; riders deleting themselves use the system path.
        current.status = AssignmentStatus.REMOVED
        current.ended_at = now
        current.removal_reason = f"Rider archived: {reason}"
    for application in db.query(CampaignApplication).filter(
        CampaignApplication.rider_id == rider.id, CampaignApplication.status == ApplicationStatus.REQUESTED
    ):
        application.status = ApplicationStatus.WITHDRAWN
    if rider.status == RiderStatus.ACTIVE:
        rider.status = RiderStatus.APPROVED  # No brand any more
    rider.archived_at = now
    rider.archive_reason = (reason or "Archived").strip()[:255]
    if rider.user:
        rider.user.is_active = False
    db.commit()
    if current:
        svc.sync_campaign_status(db, current.campaign)
    if admin is not None:
        log_admin_action(db=db, admin_user=admin, action="RIDER_ARCHIVED", target_type="RIDER", target_id=rider.rider_id, details=f"{rider.full_name} archived. Reason: {rider.archive_reason}")
    db.refresh(rider)
    return rider


def restore_rider(db: Session, rider: Rider, admin: User) -> Rider:
    if not rider.archived_at:
        raise DataAdminError("This rider is not archived.")
    rider.archived_at = None
    rider.archive_reason = None
    if rider.user:
        rider.user.is_active = True
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="RIDER_RESTORED", target_type="RIDER", target_id=rider.rider_id, details=f"{rider.full_name} restored from archive")
    db.refresh(rider)
    return rider


# ---------------------------------------------------------------------------
# Brands
# ---------------------------------------------------------------------------

def brand_impact(db: Session, brand: Brand) -> Dict:
    campaigns = db.query(Campaign).filter(Campaign.brand_id == brand.id).order_by(Campaign.id.desc()).all()
    current_riders = (
        db.query(Rider)
        .join(RiderBrandAssignment, RiderBrandAssignment.rider_id == Rider.id)
        .filter(RiderBrandAssignment.brand_id == brand.id, RiderBrandAssignment.is_current == True)  # noqa: E712
        .all()
    )
    counts = {
        "campaigns": len(campaigns),
        "current_riders": len(current_riders),
        "assignment_history": _count(db, RiderBrandAssignment.id, RiderBrandAssignment.brand_id == brand.id),
        "payments": _count(db, Payment.id, Payment.brand_id == brand.id),
    }
    blockers = [k for k in ("campaigns", "assignment_history", "payments") if counts[k]]
    return {
        "entity": "brand",
        "id": brand.id,
        "name": brand.name,
        "counts": counts,
        "can_hard_delete": not blockers,
        "blocked_by": blockers,
        "campaigns": [{"id": c.id, "name": c.name, "status": c.status} for c in campaigns[:20]],
        "riders": [{"id": r.id, "name": r.full_name, "rider_id": r.rider_id} for r in current_riders[:20]],
        "is_active": brand.is_active,
        "recommended_action": "DELETE" if not blockers else "DEACTIVATE",
    }


def hard_delete_brand(db: Session, brand: Brand, admin: User) -> None:
    impact = brand_impact(db, brand)
    if not impact["can_hard_delete"]:
        raise DataAdminError("This brand has campaigns, rider assignments or payments. Deactivate it instead to keep that history.")
    name = brand.name
    db.delete(brand)
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="BRAND_DELETED", target_type="BRAND", target_id=str(impact["id"]), details=f"Brand {name} permanently deleted")


# ---------------------------------------------------------------------------
# Campaigns
# ---------------------------------------------------------------------------

def campaign_impact(db: Session, campaign: Campaign) -> Dict:
    counts = {
        "requests": _count(db, CampaignApplication.id, CampaignApplication.campaign_id == campaign.id),
        "riders": _count(db, CampaignAssignment.id, CampaignAssignment.campaign_id == campaign.id),
        "campaign_days": _count(db, CampaignDailyActivity.id, CampaignDailyActivity.campaign_id == campaign.id),
        "photos": _count(db, CampaignActivityPhoto.id, CampaignActivityPhoto.campaign_id == campaign.id),
        "payouts_paid": _count(db, CampaignPayout.id, CampaignPayout.campaign_id == campaign.id, CampaignPayout.paid_amount > 0),
        "brand_payment_records": _count(db, BrandPaymentRecord.id, BrandPaymentRecord.campaign_id == campaign.id),
        "extensions": _count(db, CampaignExtension.id, CampaignExtension.campaign_id == campaign.id),
    }
    blockers = [k for k in ("riders", "campaign_days", "photos", "payouts_paid", "brand_payment_records") if counts[k]]
    if campaign.status not in (CampaignStatus.DRAFT, CampaignStatus.CANCELLED):
        blockers.insert(0, "status")
    can_cancel = campaign.status not in (CampaignStatus.COMPLETED, CampaignStatus.CANCELLED)
    return {
        "entity": "campaign",
        "id": campaign.id,
        "name": campaign.name,
        "status": campaign.status,
        "counts": counts,
        "can_hard_delete": not blockers,
        "blocked_by": blockers,
        "can_cancel": can_cancel,
        "recommended_action": "DELETE" if not blockers else ("CANCEL" if can_cancel else "KEEP"),
    }


def hard_delete_campaign(db: Session, campaign: Campaign, admin: User) -> None:
    impact = campaign_impact(db, campaign)
    if not impact["can_hard_delete"]:
        if "status" in impact["blocked_by"]:
            raise DataAdminError("Only draft or cancelled campaigns can be deleted. Cancel the campaign first.")
        raise DataAdminError("This campaign has riders, activity or money records. Cancel it instead to keep that history.")
    cid, name = campaign.id, campaign.name
    # Terms versions and acceptances are permanent consent history and are deliberately NOT deleted.
    for model in (CampaignFulfillmentSnapshot, CampaignApplication, CampaignExtension, CampaignBrandKit, CampaignPickupLocation):
        db.query(model).filter(model.campaign_id == cid).delete(synchronize_session=False)
    image = campaign.image_url
    db.delete(campaign)
    db.commit()
    _remove_upload(image)
    log_admin_action(db=db, admin_user=admin, action="CAMPAIGN_DELETED", target_type="CAMPAIGN", target_id=str(cid), details=f"Campaign {name} permanently deleted")


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

RESET_SCOPES = {
    "campaign_activity": "Campaign activity & photos",
    "campaigns": "Campaigns",
    "brands": "Brands",
    "riders": "Riders",
    "all": "All application data",
}
RESET_CONFIRMATION = "RESET"


def _remove_upload(url: Optional[str]) -> None:
    from app.services import storage_service  # Local import: storage is only needed for deletes

    storage_service.delete(url)


def _clear_upload_folder(folder: str) -> None:
    from app.services import storage_service

    storage_service.delete_folder(folder)


def _delete_all(db: Session, *models) -> Dict[str, int]:
    """Deletes every row of each model, in the given (child-first) order."""
    return {m.__tablename__: db.query(m).delete(synchronize_session=False) for m in models}


# Never deleted by any reset or deletion here: CampaignTerms and CampaignTermsAcceptance (permanent
# consent history; they don't reference campaigns or riders by foreign key, so nothing blocks either).


def _reset_activity(db: Session) -> Dict[str, int]:
    """Photos, rider-days, corrections and snapshots; payouts back to zero and their payments removed."""
    removed = _delete_all(db, ActivityChangeLog, CampaignActivityPhoto, FinancialAdjustment, CampaignFulfillmentSnapshot, CampaignDailyActivity, RoutePoint)
    db.query(CampaignPayout).update(
        {
            CampaignPayout.eligible_days: 0,
            CampaignPayout.total_amount: 0.0,
            CampaignPayout.paid_amount: 0.0,
            CampaignPayout.status: PayoutStatus.PENDING,
            CampaignPayout.approved_at: None,
            CampaignPayout.paid_at: None,
            CampaignPayout.payment_id: None,
        },
        synchronize_session=False,
    )
    # Payout payments only; campaign credits like the T-shirt return incentive go with the campaign itself.
    removed["payments"] = db.query(Payment).filter(Payment.campaign_id.isnot(None), Payment.category.is_(None)).delete(synchronize_session=False)
    return removed


def _delete_rider_kits(db: Session) -> Dict[str, int]:
    """Rider kits, then the return-incentive credits they point to."""
    removed = _delete_all(db, RiderBrandKit)
    removed["payments"] = removed.get("payments", 0) + db.query(Payment).filter(Payment.campaign_id.isnot(None)).delete(synchronize_session=False)
    return removed


def _reset_campaigns(db: Session) -> Dict[str, int]:
    removed = _reset_activity(db)
    payout_payments = removed["payments"]
    removed.update(_delete_rider_kits(db))
    removed["payments"] += payout_payments
    removed.update(
        _delete_all(
            db, CampaignPayout, CampaignAssignment, CampaignApplication,
            BrandPaymentRecord, CampaignExtension, CampaignBrandKit, CampaignPickupLocation, Campaign,
        )
    )
    return removed


def _reset_riders(db: Session) -> Dict[str, int]:
    """Every rider and their login, documents, payments, brand assignments and campaign participation."""
    removed = _reset_activity(db)
    payout_payments = removed["payments"]
    removed.update(_delete_rider_kits(db))
    removed["payments"] += payout_payments
    removed.update(_delete_all(db, CampaignPayout, CampaignAssignment, CampaignApplication))
    rider_user_ids = [uid for (uid,) in db.query(Rider.user_id).filter(Rider.user_id.isnot(None))]
    removed.update(_delete_all(db, RiderReferral, Payment, RiderBrandAssignment, RiderDocument, SupportTicket, Rider))
    removed["notifications"] = (
        db.query(Notification).filter(Notification.user_id.in_(rider_user_ids)).delete(synchronize_session=False) if rider_user_ids else 0
    )
    removed["users"] = db.query(User).filter(User.role == UserRole.RIDER).delete(synchronize_session=False)
    return removed


def _reset_brands(db: Session) -> Dict[str, int]:
    """Brands can't exist without their campaigns, so campaigns go too. Rider payments are kept (brand unlinked)."""
    removed = _reset_campaigns(db)
    db.query(Payment).filter(Payment.brand_id.isnot(None)).update({Payment.brand_id: None}, synchronize_session=False)
    removed.update(_delete_all(db, RiderBrandAssignment))
    db.query(Rider).filter(Rider.status == RiderStatus.ACTIVE).update({Rider.status: RiderStatus.APPROVED}, synchronize_session=False)
    removed.update(_delete_all(db, Brand))
    return removed


def reset_data(db: Session, scope: str, confirmation: str, admin: User) -> Dict:
    """Deletes application data for the scope. Never touches admin accounts, audit logs or the schema."""
    if admin.role != UserRole.SUPER_ADMIN:
        raise DataAdminError("Only a super admin can reset data.")
    if scope not in RESET_SCOPES:
        raise DataAdminError("Unknown reset scope.")
    if (confirmation or "").strip() != RESET_CONFIRMATION:
        raise DataAdminError(f'Type {RESET_CONFIRMATION} to confirm the reset.')

    try:
        if scope == "campaign_activity":
            removed = _reset_activity(db)
        elif scope == "campaigns":
            removed = _reset_campaigns(db)
        elif scope == "brands":
            removed = _reset_brands(db)
        elif scope == "riders":
            removed = _reset_riders(db)
        else:
            removed = _reset_riders(db)
            removed.update({k: removed.get(k, 0) + v for k, v in _reset_brands(db).items()})
            removed["admin_notifications"] = db.query(Notification).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        raise

    if scope in ("campaign_activity", "campaigns", "riders", "all"):
        _clear_upload_folder("campaign-proofs")
    if scope in ("riders", "all"):
        _clear_upload_folder("selfies")  # Driver selfies go with their riders
    if scope in ("campaigns", "brands", "all"):
        _clear_upload_folder("campaigns")

    removed = {k: v for k, v in removed.items() if v}
    summary = ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in sorted(removed.items())) or "nothing to remove"
    log_admin_action(db=db, admin_user=admin, action="DATA_RESET", target_type="SYSTEM", target_id=scope, details=f"Reset {RESET_SCOPES[scope]}: {summary}")
    return {"scope": scope, "label": RESET_SCOPES[scope], "removed": removed}


def reset_preview(db: Session) -> List[Dict]:
    """Current row counts, so the confirmation modal can say exactly what each scope removes."""
    n = lambda model, *f: _count(db, model.id, *f)
    activity = {
        "photos": n(CampaignActivityPhoto),
        "rider_days": n(CampaignDailyActivity),
        "campaign_payments": n(Payment, Payment.campaign_id.isnot(None)),
        "corrections": n(ActivityChangeLog) + n(FinancialAdjustment),
        "route_points": n(RoutePoint),
    }
    campaigns = {"campaigns": n(Campaign), "rider_assignments": n(CampaignAssignment), "join_requests": n(CampaignApplication), "brand_payment_records": n(BrandPaymentRecord), **activity}
    riders = {"riders": n(Rider), "payments": n(Payment), "brand_assignments": n(RiderBrandAssignment), "documents": n(RiderDocument), "rider_assignments": n(CampaignAssignment), **activity}
    brands = {"brands": n(Brand), "brand_assignments": n(RiderBrandAssignment), **campaigns}
    everything = {**riders, **brands, "notifications": n(Notification)}
    return [
        {"scope": "campaign_activity", "label": RESET_SCOPES["campaign_activity"], "counts": activity,
         "description": "Deletes every campaign photo, rider-day, route, correction and closing snapshot, and resets campaign payouts to ₹0 (removing their payment records). Campaigns, riders and brands stay."},
        {"scope": "campaigns", "label": RESET_SCOPES["campaigns"], "counts": campaigns,
         "description": "Deletes every campaign with its riders, requests, extensions, brand kit, brand payment records, payouts and activity. Riders and brands stay."},
        {"scope": "brands", "label": RESET_SCOPES["brands"], "counts": brands,
         "description": "Deletes every brand, rider brand assignment and campaign (campaigns belong to brands). Riders stay and return to Approved; their payment records are kept without a brand."},
        {"scope": "riders", "label": RESET_SCOPES["riders"], "counts": riders,
         "description": "Deletes every rider with their login, documents, payments, brand assignments, notifications and campaign participation. Brands and campaigns stay (with free slots)."},
        {"scope": "all", "label": RESET_SCOPES["all"], "counts": everything,
         "description": "Deletes all riders, brands, campaigns, payments and notifications. Admin accounts and the audit log are kept."},
    ]
