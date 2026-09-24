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
