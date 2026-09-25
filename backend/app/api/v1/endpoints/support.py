"""Support chat API. Riders only ever reach their own conversations; admins with a support role reach all.
Nothing here is public. Real-time: clients get a channel from /realtime and refetch on each signal."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_current_rider
from app.core.database import get_db
from app.models.all_models import Rider, SupportConversation, User
from app.services import realtime_service as rt
from app.services import support_service as sup

rider_router = APIRouter()
admin_router = APIRouter()


class NewConversationIn(BaseModel):
    subject: str = Field(..., max_length=150)
    message: str = Field(..., max_length=sup.MAX_MESSAGE)
    campaign_id: Optional[int] = None


class MessageIn(BaseModel):
    message: str = Field(..., max_length=sup.MAX_MESSAGE)


class ConversationUpdate(BaseModel):
    status: Optional[str] = None  # RESOLVED, CLOSED or OPEN (reopen)
    assigned_admin_id: Optional[int] = None
    unassign: bool = False


def _run(fn):
    try:
        return fn()
    except sup.SupportError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --------------------------------------------------------------------------- rider

def _own(db: Session, rider: Rider, conversation_id: int) -> SupportConversation:
    c = db.get(SupportConversation, conversation_id)
    if not c or c.rider_id != rider.id:  # Someone else's conversation looks exactly like a missing one
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


@rider_router.get("/realtime")
def rider_realtime(rider: Rider = Depends(get_current_rider)):
    return rt.client_config(rt.rider_topic(rider.id))


@rider_router.get("/unread")
def rider_unread(rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    """Total unread support replies (one query; the app shows it as a badge)."""
    from sqlalchemy import func

    from app.models.all_models import SupportMessage

    count = (
        db.query(func.count(SupportMessage.id))
        .join(SupportConversation, SupportConversation.id == SupportMessage.conversation_id)
        .filter(SupportConversation.rider_id == rider.id, SupportMessage.sender_type.in_(("ADMIN", "SYSTEM")),
                SupportMessage.id > SupportConversation.rider_last_read_id)
        .scalar()
    )
    return {"unread": count}


@rider_router.get("/campaign-options")
def rider_campaign_options(rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    return sup.campaign_options(db, rider)


@rider_router.get("/conversations")
def rider_conversations(rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    rows = db.query(SupportConversation).filter(SupportConversation.rider_id == rider.id).order_by(SupportConversation.updated_at.desc()).all()
    items = [sup.conversation_dict(db, c, "RIDER") for c in rows]
    return {"conversations": items, "unread": sum(i["unread"] for i in items)}


@rider_router.post("/conversations")
def rider_start(data: NewConversationIn, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    c = _run(lambda: sup.start_conversation(db, rider, data.subject, data.message, data.campaign_id))
    return sup.conversation_dict(db, c, "RIDER")


@rider_router.get("/conversations/{conversation_id}/messages")
def rider_messages(conversation_id: int, before_id: Optional[int] = None, limit: int = sup.PAGE_SIZE,
                   rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    c = _own(db, rider, conversation_id)
    return {"conversation": sup.conversation_dict(db, c, "RIDER"), **sup.messages_page(db, c, before_id, limit)}


@rider_router.post("/conversations/{conversation_id}/messages")
def rider_send(conversation_id: int, data: MessageIn, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    c = _own(db, rider, conversation_id)
    m = _run(lambda: sup.rider_send(db, rider, c, data.message))
    return {"message": sup.message_dict(m), "conversation": sup.conversation_dict(db, c, "RIDER")}


@rider_router.post("/conversations/{conversation_id}/read")
def rider_read(conversation_id: int, rider: Rider = Depends(get_current_rider), db: Session = Depends(get_db)):
    c = _own(db, rider, conversation_id)
    sup.mark_read(db, c, "RIDER")
    return sup.conversation_dict(db, c, "RIDER")


# --------------------------------------------------------------------------- admin

def get_support_admin(admin: User = Depends(get_current_admin)) -> User:
    if not sup.can_support(admin):
        raise HTTPException(status_code=403, detail="Your admin role doesn't include rider support.")
    return admin


def _get(db: Session, conversation_id: int) -> SupportConversation:
    c = db.get(SupportConversation, conversation_id)
    if not c:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


@admin_router.get("/realtime")
def admin_realtime(admin: User = Depends(get_support_admin)):
    return rt.client_config(rt.admin_topic())


@admin_router.get("/agents")
def support_agents(admin: User = Depends(get_support_admin), db: Session = Depends(get_db)):
    agents = db.query(User).filter(User.role.in_(sup.SUPPORT_ROLES), User.is_active == True).order_by(User.email).all()  # noqa: E712
    return [{"id": u.id, "email": u.email, "role": u.role} for u in agents]


@admin_router.get("/conversations")
def admin_conversations(
    status: Optional[str] = None, campaign_id: Optional[int] = None, rider_id: Optional[int] = None,
    assigned_admin_id: Optional[int] = None, search: Optional[str] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    limit: int = 50, offset: int = 0,
    admin: User = Depends(get_support_admin), db: Session = Depends(get_db),
):
    query = sup.admin_query(db, status, campaign_id, rider_id, assigned_admin_id, search, date_from, date_to)
    total = query.count()
    rows = query.order_by(SupportConversation.updated_at.desc()).offset(max(offset, 0)).limit(max(1, min(limit, 100))).all()
    return {"conversations": [sup.conversation_dict(db, c, "ADMIN") for c in rows], "total": total, "counts": sup.admin_counts(db)}


@admin_router.get("/conversations/{conversation_id}/messages")
def admin_messages(conversation_id: int, before_id: Optional[int] = None, limit: int = sup.PAGE_SIZE,
                   admin: User = Depends(get_support_admin), db: Session = Depends(get_db)):
    c = _get(db, conversation_id)
    return {"conversation": sup.conversation_dict(db, c, "ADMIN"), **sup.messages_page(db, c, before_id, limit)}


@admin_router.post("/conversations/{conversation_id}/messages")
def admin_send(conversation_id: int, data: MessageIn, admin: User = Depends(get_support_admin), db: Session = Depends(get_db)):
    c = _get(db, conversation_id)
    m = _run(lambda: sup.admin_send(db, admin, c, data.message))
    return {"message": sup.message_dict(m), "conversation": sup.conversation_dict(db, c, "ADMIN")}


@admin_router.post("/conversations/{conversation_id}/read")
def admin_read(conversation_id: int, admin: User = Depends(get_support_admin), db: Session = Depends(get_db)):
    c = _get(db, conversation_id)
    sup.mark_read(db, c, "ADMIN")
    return sup.conversation_dict(db, c, "ADMIN")


@admin_router.patch("/conversations/{conversation_id}")
def admin_update(conversation_id: int, data: ConversationUpdate, admin: User = Depends(get_support_admin), db: Session = Depends(get_db)):
    c = _get(db, conversation_id)
    if data.assigned_admin_id is not None or data.unassign:
        _run(lambda: sup.assign(db, admin, c, None if data.unassign else data.assigned_admin_id))
    if data.status:
        _run(lambda: sup.change_status(db, admin, c, data.status.strip().upper()))
    return sup.conversation_dict(db, c, "ADMIN")
