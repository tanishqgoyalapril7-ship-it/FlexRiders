from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    riders,
    admin_riders,
    brands,
    payments,
    notifications,
    audit_logs,
    reports,
    campaigns,
    admin_system,
    internal,
    account_deletion,
    support,
    enquiries,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(riders.router, prefix="/riders", tags=["Rider App"])
api_router.include_router(admin_riders.router, prefix="/admin/riders", tags=["Admin Rider Management"])
api_router.include_router(brands.router, prefix="/brands", tags=["Brand Management & Assignment"])
api_router.include_router(payments.router, prefix="/payments", tags=["Payment Management"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(audit_logs.router, prefix="/audit-logs", tags=["Audit Trail"])
api_router.include_router(reports.router, prefix="/reports", tags=["Analytics & Reports"])
api_router.include_router(campaigns.router, prefix="/campaigns", tags=["Campaign Management"])
api_router.include_router(campaigns.rider_router, prefix="/riders/me/campaigns", tags=["Rider Campaigns"])
api_router.include_router(campaigns.public_router, prefix="/public/campaigns", tags=["Public Campaign Page"])
api_router.include_router(admin_system.users_router, prefix="/admin/users", tags=["Admin Accounts"])
api_router.include_router(admin_system.system_router, prefix="/admin/system", tags=["System"])
api_router.include_router(internal.router, prefix="/internal", tags=["Scheduled jobs"])
api_router.include_router(account_deletion.public_router, prefix="/public", tags=["Account Deletion (public)"])
api_router.include_router(account_deletion.admin_router, prefix="/admin/deletion-requests", tags=["Account Deletion (admin)"])
api_router.include_router(support.rider_router, prefix="/riders/me/support", tags=["Rider Support Chat"])
api_router.include_router(support.admin_router, prefix="/admin/support", tags=["Admin Support Inbox"])
api_router.include_router(enquiries.public_router, prefix="/public", tags=["Website enquiries (public submit)"])
api_router.include_router(enquiries.admin_router, prefix="/admin/enquiries", tags=["Website enquiries (admin)"])
