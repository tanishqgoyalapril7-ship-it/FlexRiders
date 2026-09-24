from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.core.database import get_db
from app.models.all_models import Rider, Payment, Brand, RiderBrandAssignment, RiderStatus, PaymentStatus, User
from app.schemas.all_schemas import (
    DashboardOverview,
    DashboardStats,
    ChartPoint,
    BrandDistribution,
    RiderResponse,
    PaymentResponse,
)
from app.api.deps import get_current_admin
from app.services.earnings_service import NOT_A_CAMPAIGN_PAYOUT
from datetime import datetime, timedelta
import io
import csv

router = APIRouter()


@router.get("/dashboard", response_model=DashboardOverview)
def get_dashboard_analytics(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Calculates all live metrics for the Admin Web Dashboard from real database records"""
    # Archived riders are excluded from operational counts; their payments still count in money totals.
    riders_q = db.query(Rider).filter(Rider.archived_at.is_(None))
    total_riders = riders_q.count()
    pending_approvals = riders_q.filter(Rider.status == RiderStatus.PENDING).count()
    approved_riders = riders_q.filter(Rider.status.in_([RiderStatus.APPROVED, RiderStatus.ACTIVE])).count()
    active_riders = riders_q.filter(Rider.status == RiderStatus.ACTIVE).count()
    suspended_riders = riders_q.filter(Rider.status == RiderStatus.SUSPENDED).count()

    # Month boundaries for real month-over-month figures.
    now = datetime.utcnow()
    this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month = (this_month - timedelta(days=1)).replace(day=1)
    three_months_ago = ((last_month - timedelta(days=1)).replace(day=1))

    def paid_between(start, end=None):
        q = db.query(func.sum(Payment.amount)).filter(Payment.status == PaymentStatus.PAID, Payment.payment_date >= start)
        if end is not None:
            q = q.filter(Payment.payment_date < end)
        return float(q.scalar() or 0.0)

    def riders_between(start, end=None):
        q = db.query(func.count(Rider.id)).filter(Rider.created_at >= start)
        if end is not None:
            q = q.filter(Rider.created_at < end)
        return q.scalar() or 0

    def growth(current, previous):
        if previous == 0:
            return 0.0  # No baseline to compare with
        return round((current - previous) / previous * 100, 1)

    paid_this_month = paid_between(this_month)
    paid_last_month = paid_between(last_month, this_month)

    # Real Payments aggregation
    total_payments = float(db.query(func.sum(Payment.amount)).filter(Payment.status == PaymentStatus.PAID).scalar() or 0.0)
    pending_payments = float(db.query(func.sum(Payment.amount)).filter(Payment.status == PaymentStatus.PENDING).scalar() or 0.0)
    
    # Today's real payments
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_payments = float(db.query(func.sum(Payment.amount)).filter(
        Payment.status == PaymentStatus.PAID,
        Payment.created_at >= today_start
    ).scalar() or 0.0)

    stats = DashboardStats(
        total_riders=total_riders,
        pending_approvals=pending_approvals,
        approved_riders=approved_riders,
        active_riders=active_riders,
        suspended_riders=suspended_riders,
        total_payments=total_payments,
        pending_payments=pending_payments,
        today_payments=today_payments,
        growth_riders=growth(riders_between(this_month), riders_between(last_month, this_month)),
        growth_active=0.0,  # Needs historical status snapshots, which aren't stored
        growth_payments=growth(paid_this_month, paid_last_month),
    )

    # 7-day registration chart calculated from real registrations
    reg_chart = []
    now = datetime.utcnow()
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_str = day.strftime("%d %b")
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        day_count = db.query(Rider).filter(Rider.created_at >= start, Rider.created_at <= end).count()
        reg_chart.append(ChartPoint(date=day_str, count=day_count))

    # Payments chart (last 7 days real payments)
    pay_chart = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_str = day.strftime("%d %b")
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        paid_sum = float(db.query(func.sum(Payment.amount)).filter(
            Payment.status == PaymentStatus.PAID,
            Payment.created_at >= start,
            Payment.created_at <= end
        ).scalar() or 0.0)
        pending_sum = float(db.query(func.sum(Payment.amount)).filter(
            Payment.status == PaymentStatus.PENDING,
            Payment.created_at >= start,
            Payment.created_at <= end
        ).scalar() or 0.0)
        pay_chart.append(ChartPoint(date=day_str, paid=paid_sum, pending=pending_sum, failed=0.0))

    # Real brand-wise riders distribution
    brands = db.query(Brand).all()
    brand_dist = []
    for b in brands:
        r_count = db.query(RiderBrandAssignment).filter(
            RiderBrandAssignment.brand_id == b.id,
            RiderBrandAssignment.is_current == True
        ).count()
        pct = round((r_count / total_riders * 100), 1) if total_riders > 0 else 0.0
        brand_dist.append(BrandDistribution(brand_name=b.name, rider_count=r_count, percentage=pct))

    # Real Pending riders queue (first 5)
    pending_list = riders_q.filter(Rider.status == RiderStatus.PENDING).order_by(desc(Rider.id)).limit(5).all()
    pending_responses = []
    for r in pending_list:
        pending_responses.append(
            RiderResponse(
                id=r.id,
                rider_id=r.rider_id,
                full_name=r.full_name,
                mobile_number=r.mobile_number,
                email=r.email,
                current_company=r.current_company,
                current_role=r.current_role,
                primary_city=r.primary_city,
                primary_area=r.primary_area,
                status=r.status,
                created_at=r.created_at,
            )
        )

    # Real Recent registrations (last 6)
    recent_r_list = riders_q.order_by(desc(Rider.id)).limit(6).all()
    recent_registrations = [
        RiderResponse(
            id=r.id,
            rider_id=r.rider_id,
            full_name=r.full_name,
            mobile_number=r.mobile_number,
            email=r.email,
            current_company=r.current_company,
            current_role=r.current_role,
            primary_city=r.primary_city,
            primary_area=r.primary_area,
            status=r.status,
            created_at=r.created_at,
        )
        for r in recent_r_list
    ]

    # Real Recent payments (last 6)
    recent_p_list = db.query(Payment).order_by(desc(Payment.id)).limit(6).all()
    recent_payments = []
    for p in recent_p_list:
        recent_payments.append(
            PaymentResponse(
                id=p.id,
                rider_id=p.rider_id,
                rider_name=p.rider.full_name if p.rider else "Unknown",
                rider_sr_id=p.rider.rider_id if p.rider else "N/A",
                brand_id=p.brand_id,
                brand_name=p.brand.name if p.brand else "Direct",
                amount=p.amount,
                payment_date=p.created_at,
                payment_period=p.payment_period,
                payment_type=p.payment_type,
                upi_id=p.upi_id,
                payment_reference=p.payment_reference,
                transaction_id=p.transaction_id,
                status=p.status,
                notes=p.notes,
                category=p.category,
            )
        )

    monthly_report = {
        "this_month": paid_this_month,
        "last_month": paid_last_month,
        "last_3_months": paid_between(three_months_ago),
        "growth": growth(paid_this_month, paid_last_month),
    }

    return DashboardOverview(
        stats=stats,
        registration_chart=reg_chart,
        payments_chart=pay_chart,
        brand_distribution=brand_dist,
        pending_riders=pending_responses,
        recent_registrations=recent_registrations,
        recent_payments=recent_payments,
        monthly_report=monthly_report,
    )


@router.get("/export/riders")
def export_riders_csv(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Exports riders master database to CSV"""
    riders = db.query(Rider).order_by(Rider.id).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Rider ID", "Full Name", "Mobile Number", "Email", "DOB",
        "Company", "Role", "Vehicle", "City", "Area", "Preferred Radius",
        "UPI ID", "GPay Number", "Status", "Current Brand", "Registered Date"
    ])
    for r in riders:
        current_brand = "Unassigned"
        assignment = db.query(RiderBrandAssignment).filter(
            RiderBrandAssignment.rider_id == r.id,
            RiderBrandAssignment.is_current == True
        ).first()
        if assignment:
            current_brand = assignment.brand.name

        writer.writerow([
            r.rider_id, r.full_name, r.mobile_number, r.email or "", r.dob or "",
            r.current_company, r.current_role, r.vehicle_type, r.primary_city,
            r.primary_area or "", r.preferred_radius, r.upi_id or "",
            r.gpay_number or "", r.status, current_brand, r.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ])

    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=super_riders_export_{datetime.utcnow().strftime('%Y%m%d')}.csv"}
    )


@router.get("/export/payments")
def export_payments_csv(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Exports payment ledger to CSV"""
    payments = db.query(Payment).order_by(desc(Payment.id)).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Payment ID", "Rider ID", "Rider Name", "Brand", "Amount (INR)",
        "Settlement Period", "Payment Type", "UPI ID", "Reference", "Transaction ID", "Status", "Timestamp"
    ])
    for p in payments:
        writer.writerow([
            f"PAY-{p.id:06d}",
            p.rider.rider_id if p.rider else "N/A",
            p.rider.full_name if p.rider else "Unknown",
            p.brand.name if p.brand else "Direct",
            f"{p.amount:.2f}",
            p.payment_period,
            p.payment_type,
            p.upi_id or "",
            p.payment_reference,
            p.transaction_id or "",
            p.status,
            p.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ])

    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=super_riders_payments_{datetime.utcnow().strftime('%Y%m%d')}.csv"}
    )


# ---------------------------------------------------------------------------
# Operations overview for the admin dashboard.
# Batched: a fixed ~15 queries however many campaigns/riders exist, because every round trip to a
# remote database costs ~0.2 s. Same rules as the detail pages (tests compare them).
# ---------------------------------------------------------------------------

@router.get("/operations")
def operations_overview(db: Session = Depends(get_db), admin: User = Depends(get_current_admin)):
    from sqlalchemy import case
    from sqlalchemy.orm import joinedload, selectinload

    from app.models.all_models import AuditLog, Notification, PaymentCategory
    from app.models.campaign_models import (
        ActivityStatus,
        AssignmentStatus,
        Campaign,
        CampaignActivityPhoto,
        CampaignApplication,
        CampaignAssignment,
        CampaignDailyActivity,
        CampaignPayout,
        CampaignStatus,
        PhotoStatus,
    )
    from app.services import campaign_service as svc
    from app.services import fulfillment_service as fs

    today = fs.today_ist()
    now = datetime.utcnow()

    # --- Riders (1 query) --------------------------------------------------------------------
    by_status = dict(
        db.query(Rider.status, func.count(Rider.id)).filter(Rider.archived_at.is_(None)).group_by(Rider.status).all()
    )
    total_riders = sum(by_status.values())

    # --- Campaigns (4 queries) ----------------------------------------------------------------
    campaigns = (
        db.query(Campaign)
        .options(joinedload(Campaign.brand), selectinload(Campaign.extensions))
        .filter(Campaign.status.notin_((CampaignStatus.DRAFT, CampaignStatus.CANCELLED)))
        .order_by(Campaign.start_date.desc())
        .all()
    )
    recent_cutoff = now - timedelta(days=14)
    campaigns = [c for c in campaigns if not (c.status == CampaignStatus.COMPLETED and (c.completed_at or datetime.min) < recent_cutoff)]
    ids = [c.id for c in campaigns] or [0]
    used = dict(
        db.query(CampaignAssignment.campaign_id, func.count(CampaignAssignment.id))
        .filter(CampaignAssignment.campaign_id.in_(ids), CampaignAssignment.status.in_(AssignmentStatus.SLOT_HOLDING))
        .group_by(CampaignAssignment.campaign_id)
        .all()
    )
    approved_days: dict = {}
    for cid, rid, day in (
        db.query(CampaignDailyActivity.campaign_id, CampaignDailyActivity.rider_id, CampaignDailyActivity.activity_date)
        .filter(CampaignDailyActivity.campaign_id.in_(ids), CampaignDailyActivity.photo_status == PhotoStatus.APPROVED)
        .all()
    ):
        approved_days.setdefault(cid, set()).add((rid, day))

    campaign_rows = []
    for c in campaigns:
        slots = used.get(c.id, 0)
        status = c.status
        if status in CampaignStatus.PUBLISHED:  # Same rule as sync_campaign_status, without writing
            status = CampaignStatus.FULL if slots >= svc.slot_capacity(c) else CampaignStatus.ACTIVE if c.start_date <= today else CampaignStatus.OPEN
        contracted = fs.contracted_rider_days(c)
        # Delivered = approved days, one per rider per date, on eligible dates (as the Delivery tab counts).
        delivered = min(sum(1 for _, day in approved_days.get(c.id, ()) if fs.is_eligible_date(c, day)), contracted)
        campaign_rows.append(
            {
                "id": c.id,
                "name": c.name,
                "brand": c.brand.name if c.brand else "",
                "brand_logo": c.brand.logo if c.brand else None,
                "status": status,
                "required_riders": c.total_slots,
                "assigned_riders": slots,
                "contracted_rider_days": contracted,
                "delivered_rider_days": delivered,
                "fulfillment_pct": round(delivered / contracted * 100, 1) if contracted else 0.0,
                "start_date": c.start_date.isoformat(),
                "end_date": fs.effective_end_date(c).isoformat(),
            }
        )
    live = [r for r in campaign_rows if r["status"] in CampaignStatus.PUBLISHED]

    # --- Rider activity today (3 queries) -----------------------------------------------------
    working = [
        a
        for a in db.query(CampaignAssignment)
        .options(joinedload(CampaignAssignment.rider), joinedload(CampaignAssignment.campaign).selectinload(Campaign.extensions))
        .filter(CampaignAssignment.status == AssignmentStatus.ACTIVE)
        .all()
        if a.campaign.status in CampaignStatus.PUBLISHED and fs.is_eligible_date(a.campaign, today)
    ]
    todays = {
        a.assignment_id: a
        for a in db.query(CampaignDailyActivity)
        .options(selectinload(CampaignDailyActivity.photos))
        .filter(CampaignDailyActivity.activity_date == today, CampaignDailyActivity.assignment_id.in_([w.id for w in working] or [0]))
    }
    submitted = completed = 0
    missing = []
    for a in working:
        day = todays.get(a.id)
        if day and day.status == ActivityStatus.EXCUSED:
            continue
        if day and svc.photo_counts(day)["uploaded"]:
            submitted += 1
            completed += day.status == ActivityStatus.COMPLETED
        else:
            missing.append({"rider": a.rider.full_name, "rider_id": a.rider.rider_id, "campaign": a.campaign.name, "campaign_id": a.campaign_id})
    counts = db.query(
        db.query(func.count(CampaignApplication.id)).filter(CampaignApplication.status == "REQUESTED").scalar_subquery(),
        db.query(func.count(CampaignActivityPhoto.id)).filter(CampaignActivityPhoto.status == PhotoStatus.PENDING).scalar_subquery(),
    ).one()

    # --- Payments (4 queries) -----------------------------------------------------------------
    today_start_utc = datetime.combine(today, datetime.min.time()) - timedelta(hours=5, minutes=30)
    month_start = today.replace(day=1)
    last_month = (month_start - timedelta(days=1)).replace(day=1)
    three_months = (last_month - timedelta(days=1)).replace(day=1)
    to_utc = lambda d: datetime.combine(d, datetime.min.time()) - timedelta(hours=5, minutes=30)
    paid = Payment.status == PaymentStatus.PAID
    money = db.query(
        func.coalesce(func.sum(case((paid, Payment.amount), else_=0)), 0),
        func.coalesce(func.sum(case(((Payment.status == PaymentStatus.PENDING) & NOT_A_CAMPAIGN_PAYOUT, Payment.amount), else_=0)), 0),
        func.coalesce(func.sum(case((paid & (Payment.payment_date >= today_start_utc), Payment.amount), else_=0)), 0),
        func.coalesce(func.sum(case((paid & (Payment.payment_date >= today_start_utc), 1), else_=0)), 0),
        func.coalesce(func.sum(case((Payment.status == PaymentStatus.FAILED, Payment.amount), else_=0)), 0),
        func.coalesce(func.sum(case((Payment.status == PaymentStatus.FAILED, 1), else_=0)), 0),
        func.coalesce(func.sum(case((paid & (Payment.payment_date >= to_utc(month_start)), Payment.amount), else_=0)), 0),
        func.coalesce(func.sum(case((paid & (Payment.payment_date >= to_utc(last_month)) & (Payment.payment_date < to_utc(month_start)), Payment.amount), else_=0)), 0),
        func.coalesce(func.sum(case((paid & (Payment.payment_date >= to_utc(three_months)), Payment.amount), else_=0)), 0),
    ).one()
    total_paid, manual_pending, paid_today, paid_today_n, failed_amt, failed_n, this_month, last_month_amt, last_3 = [float(v or 0) for v in money]
    # Pending payout: earned but unpaid campaign money (never negative per rider) + pending manual payments.
    campaign_pending = float(
        db.query(
            func.coalesce(func.sum(case((CampaignPayout.total_amount > CampaignPayout.paid_amount, CampaignPayout.total_amount - CampaignPayout.paid_amount), else_=0)), 0)
        ).scalar()
        or 0
    )
    recent_payments = db.query(Payment).options(joinedload(Payment.rider)).order_by(desc(Payment.payment_date)).limit(6).all()
    names = {c.id: c.name for c in campaigns}
    missing_ids = {p.campaign_id for p in recent_payments if p.campaign_id and p.campaign_id not in names}
    if missing_ids:
        names.update(dict(db.query(Campaign.id, Campaign.name).filter(Campaign.id.in_(missing_ids)).all()))

    # --- Activity feed (3 queries) ------------------------------------------------------------
    feed = [
        {"kind": n.category or "SYSTEM", "title": n.title, "at": n.created_at}
        for n in db.query(Notification).filter(Notification.is_admin_notification == True).order_by(desc(Notification.created_at)).limit(10)  # noqa: E712
    ]
    feed += [
        {"kind": log.target_type, "title": (log.details or log.action.replace("_", " ").title())[:140], "at": log.created_at, "by": log.admin_email}
        for log in db.query(AuditLog).order_by(desc(AuditLog.created_at)).limit(10)
    ]
    for photo, rider_name, campaign_name in (
        db.query(CampaignActivityPhoto, Rider.full_name, Campaign.name)
        .join(Rider, Rider.id == CampaignActivityPhoto.rider_id)
        .join(Campaign, Campaign.id == CampaignActivityPhoto.campaign_id)
        .order_by(desc(CampaignActivityPhoto.uploaded_at))
        .limit(10)
    ):
        slot = (photo.slot or "").title()
        feed.append({"kind": "PHOTO", "title": f"{rider_name} submitted {('a ' + slot + ' photo') if slot else 'a photo'} for {campaign_name}", "at": photo.uploaded_at})
    feed.sort(key=lambda e: e["at"] or datetime.min, reverse=True)

    return {
        "today": today.isoformat(),
        "kpis": {
            "total_riders": total_riders,
            "active_riders": by_status.get(RiderStatus.ACTIVE, 0),
            "approved_riders": by_status.get(RiderStatus.APPROVED, 0) + by_status.get(RiderStatus.ACTIVE, 0),
            "pending_approvals": by_status.get(RiderStatus.PENDING, 0),
            "suspended_riders": by_status.get(RiderStatus.SUSPENDED, 0),
            "active_campaigns": len(live),
            "running_campaigns": sum(1 for r in live if r["status"] == CampaignStatus.ACTIVE),
            "pending_join_requests": counts[0],
        },
        "campaigns": campaign_rows,
        "rider_activity": {
            "active_today": len(working),
            "submitted_today": submitted,
            "completed_today": completed,
            "missing_today": len(missing),
            "missing": missing[:8],
            "pending_rider_approvals": by_status.get(RiderStatus.PENDING, 0),
            "pending_join_requests": counts[0],
            "photos_to_review": counts[1],
        },
        "payments": {
            "total_paid": round(total_paid, 2),
            "pending_payout": round(campaign_pending + manual_pending, 2),
            "paid_today": round(paid_today, 2),
            "paid_today_count": int(paid_today_n),
            "failed_count": int(failed_n),
            "failed_amount": round(failed_amt, 2),
            "this_month": round(this_month, 2),
            "last_month": round(last_month_amt, 2),
            "last_3_months": round(last_3, 2),
            "recent": [
                {
                    "id": p.id,
                    "rider": p.rider.full_name if p.rider else "",
                    "rider_id": p.rider.rider_id if p.rider else "",
                    "for": names.get(p.campaign_id) if p.campaign_id else ("Referral reward" if p.category == PaymentCategory.REFERRAL_REWARD else "Manual payment"),
                    "amount": p.amount,
                    "status": p.status,
                    "date": p.payment_date,
                }
                for p in recent_payments
            ],
        },
        "activity": feed[:12],
    }
