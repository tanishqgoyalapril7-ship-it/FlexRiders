"""Support chat between riders and FlexRiders support (admins).

Status flow: a rider message → WAITING_FOR_ADMIN; a support reply → WAITING_FOR_RIDER; support can
Resolve (the rider may still reply, which reopens it), Close (read-only for the rider) and Reopen (OPEN).
History is never deleted by status changes. Every change sends a data-free realtime signal to the rider's
channel and the admin inbox channel.
"""
from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.security import UserRole
from app.models.all_models import Rider, SupportConversation, SupportMessage, SupportStatus, User
from app.models.campaign_models import Campaign, CampaignApplication, CampaignAssignment
from app.services import realtime_service as rt
from app.services.audit_service import log_admin_action
from app.services.notification_service import send_notification

MAX_MESSAGE = 2000
PAGE_SIZE = 30
# Finance admins handle money, not rider conversations.
SUPPORT_ROLES = (UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.OPERATIONS_ADMIN)


class SupportError(ValueError):
    """Shown to the user (400)."""


def can_support(user: User) -> bool:
    return user.role in SUPPORT_ROLES


def _clean(text: Optional[str], limit: int, what: str) -> str:
    value = (text or "").strip()
    if not value:
        raise SupportError(f"Enter a {what}.")
    if len(value) > limit:
        raise SupportError(f"The {what} is too long (maximum {limit} characters).")
    return value


def _signal(conversation: SupportConversation, kind: str) -> None:
    rt.broadcast([rt.rider_topic(conversation.rider_id), rt.admin_topic()],
                 {"type": kind, "conversation_id": conversation.id, "status": conversation.status})


def campaign_options(db: Session, rider: Rider) -> List[Dict]:
    """Campaigns the rider is or was part of (assigned or requested), for linking a conversation."""
    ids = {a.campaign_id for a in db.query(CampaignAssignment.campaign_id).filter(CampaignAssignment.rider_id == rider.id)}
    ids |= {a.campaign_id for a in db.query(CampaignApplication.campaign_id).filter(CampaignApplication.rider_id == rider.id)}
    if not ids:
        return []
    return [{"id": c.id, "name": c.name} for c in db.query(Campaign).filter(Campaign.id.in_(ids)).order_by(Campaign.start_date.desc())]


def _add_message(db: Session, conversation: SupportConversation, sender_type: str, body: str,
                 user: Optional[User] = None, name: Optional[str] = None) -> SupportMessage:
    now = datetime.utcnow()
    message = SupportMessage(conversation_id=conversation.id, sender_type=sender_type, sender_user_id=user.id if user else None,
                             sender_name=name, body=body, created_at=now)
    db.add(message)
    db.flush()
    conversation.last_message_at = now
    conversation.updated_at = now
    conversation.last_message_preview = body[:157] + ("…" if len(body) > 157 else "")
    # The sender has read their own message (and everything before it).
    if sender_type == "RIDER":
        conversation.rider_last_read_id = message.id
    elif sender_type == "ADMIN":
        conversation.admin_last_read_id = message.id
    return message


def start_conversation(db: Session, rider: Rider, subject: str, body: str, campaign_id: Optional[int]) -> SupportConversation:
    subject = _clean(subject, 150, "subject")
    body = _clean(body, MAX_MESSAGE, "message")
    campaign_name = None
    if campaign_id:
        options = {c["id"]: c["name"] for c in campaign_options(db, rider)}
        if campaign_id not in options:
            raise SupportError("You can only link a campaign you are or were part of.")
        campaign_name = options[campaign_id]
    conversation = SupportConversation(rider_id=rider.id, campaign_id=campaign_id or None, campaign_name=campaign_name,
                                       subject=subject, status=SupportStatus.WAITING_FOR_ADMIN)
    db.add(conversation)
    db.flush()
    message = _add_message(db, conversation, "RIDER", body, rider.user, rider.full_name)
    db.commit()
    _notify_support(db, conversation, message, new=True)
    _signal(conversation, "created")
    return conversation


def rider_send(db: Session, rider: Rider, conversation: SupportConversation, body: str) -> SupportMessage:
    body = _clean(body, MAX_MESSAGE, "message")
    if conversation.status == SupportStatus.CLOSED:
        raise SupportError("This conversation is closed. Start a new conversation if you still need help.")
    was_waiting = conversation.status == SupportStatus.WAITING_FOR_ADMIN
    message = _add_message(db, conversation, "RIDER", body, rider.user, rider.full_name)
    conversation.status = SupportStatus.WAITING_FOR_ADMIN
    conversation.resolved_at = None
    db.commit()
    if not was_waiting:  # One admin notification per rider turn, not per message
        _notify_support(db, conversation, message, new=False)
    _signal(conversation, "message")
    return message


def admin_send(db: Session, admin: User, conversation: SupportConversation, body: str) -> SupportMessage:
    body = _clean(body, MAX_MESSAGE, "message")
    if conversation.status == SupportStatus.CLOSED:
        raise SupportError("Reopen the conversation before replying.")
    first_name = (admin.email or "Support").split("@")[0].split(".")[0].capitalize()
    message = _add_message(db, conversation, "ADMIN", body, admin, f"FlexRiders Support ({first_name})")
    conversation.status = SupportStatus.WAITING_FOR_RIDER
    conversation.resolved_at = None
    if conversation.assigned_admin_id is None:
        conversation.assigned_admin_id = admin.id  # Whoever answers first owns it until reassigned
    db.commit()
    rider = conversation.rider
    if rider and rider.user_id:
        send_notification(
            db=db, user_id=rider.user_id, category="SUPPORT", reference_id=str(conversation.id),
            title="Support replied", message=f"Re: {conversation.subject}: {message.body[:120]}",
            dedupe_key=f"SUPPORT_REPLY:{message.id}",
        )
    _signal(conversation, "message")
    return message


def _notify_support(db: Session, conversation: SupportConversation, message: SupportMessage, new: bool) -> None:
    rider = conversation.rider
    send_notification(
        db=db, is_admin=True, category="SUPPORT", reference_id=str(conversation.id),
        title="New support conversation" if new else "Rider replied in support",
        message=f"{rider.full_name if rider else 'A rider'} ({rider.rider_id if rider else '-'}): {conversation.subject}",
        dedupe_key=f"SUPPORT_ADMIN:{message.id}",
    )


STATUS_CHANGES = {
    # target: (allowed from, system message, audit action)
    SupportStatus.RESOLVED: ({SupportStatus.OPEN, SupportStatus.WAITING_FOR_ADMIN, SupportStatus.WAITING_FOR_RIDER},
                             "Support marked this conversation as resolved. Reply here if you still need help.", "SUPPORT_RESOLVED"),
    SupportStatus.CLOSED: ({SupportStatus.OPEN, SupportStatus.WAITING_FOR_ADMIN, SupportStatus.WAITING_FOR_RIDER, SupportStatus.RESOLVED},
                           "Support closed this conversation. Start a new conversation if you need more help.", "SUPPORT_CLOSED"),
    SupportStatus.OPEN: ({SupportStatus.RESOLVED, SupportStatus.CLOSED}, "Support reopened this conversation.", "SUPPORT_REOPENED"),
}


def change_status(db: Session, admin: User, conversation: SupportConversation, status: str) -> None:
    if status not in STATUS_CHANGES:
        raise SupportError("Status must be RESOLVED, CLOSED or OPEN (reopen).")
    allowed, text, action = STATUS_CHANGES[status]
    if conversation.status not in allowed:
        raise SupportError(f"A conversation that is {SupportStatus.LABELS[conversation.status].lower()} can't be changed to {SupportStatus.LABELS[status].lower()}.")
    now = datetime.utcnow()
    conversation.status = status
    conversation.resolved_at = now if status == SupportStatus.RESOLVED else None
    conversation.closed_at = now if status == SupportStatus.CLOSED else None
    _add_message(db, conversation, "SYSTEM", text)
    db.commit()
    log_admin_action(db=db, admin_user=admin, action=action, target_type="SUPPORT_CONVERSATION", target_id=str(conversation.id),
                     details=f"Support conversation #{conversation.id} ({conversation.subject}) → {SupportStatus.LABELS[status]}")
    _signal(conversation, "status")


def assign(db: Session, admin: User, conversation: SupportConversation, assignee_id: Optional[int]) -> None:
    assignee = None
    if assignee_id:
        assignee = db.get(User, assignee_id)
        if not assignee or not assignee.is_active or not can_support(assignee):
            raise SupportError("Choose an active admin who can handle support.")
    conversation.assigned_admin_id = assignee.id if assignee else None
    conversation.updated_at = datetime.utcnow()
    db.commit()
    log_admin_action(db=db, admin_user=admin, action="SUPPORT_ASSIGNED", target_type="SUPPORT_CONVERSATION", target_id=str(conversation.id),
                     details=f"Support conversation #{conversation.id} assigned to {assignee.email if assignee else 'nobody'}")
    _signal(conversation, "assigned")


def mark_read(db: Session, conversation: SupportConversation, side: str) -> None:
    latest = db.query(func.max(SupportMessage.id)).filter(SupportMessage.conversation_id == conversation.id).scalar() or 0
    field = "rider_last_read_id" if side == "RIDER" else "admin_last_read_id"
    if getattr(conversation, field) < latest:
        setattr(conversation, field, latest)
        db.commit()
        _signal(conversation, "read")


def unread_count(db: Session, conversation: SupportConversation, side: str) -> int:
    """Messages from the other side (support/system for riders; the rider for admins) not yet read."""
    senders = ("ADMIN", "SYSTEM") if side == "RIDER" else ("RIDER",)
    last_read = conversation.rider_last_read_id if side == "RIDER" else conversation.admin_last_read_id
    return (
        db.query(func.count(SupportMessage.id))
        .filter(SupportMessage.conversation_id == conversation.id, SupportMessage.id > last_read, SupportMessage.sender_type.in_(senders))
        .scalar()
    )


def messages_page(db: Session, conversation: SupportConversation, before_id: Optional[int], limit: int = PAGE_SIZE) -> Dict:
    """Newest first page, or the page before `before_id` (for scrolling back). Returned oldest → newest."""
    limit = max(1, min(limit, 100))
    query = db.query(SupportMessage).filter(SupportMessage.conversation_id == conversation.id)
    if before_id:
        query = query.filter(SupportMessage.id < before_id)
    rows = query.order_by(SupportMessage.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = list(reversed(rows[:limit]))
    return {"messages": [message_dict(m) for m in rows], "has_more": has_more}


def message_dict(m: SupportMessage) -> Dict:
    return {"id": m.id, "sender_type": m.sender_type, "sender_name": m.sender_name, "body": m.body, "created_at": m.created_at}


def conversation_dict(db: Session, c: SupportConversation, side: str) -> Dict:
    data = {
        "id": c.id,
        "subject": c.subject,
        "status": c.status,
        "status_label": SupportStatus.LABELS.get(c.status, c.status),
        "campaign_id": c.campaign_id,
        "campaign_name": c.campaign_name,
        "last_message_at": c.last_message_at,
        "last_message_preview": c.last_message_preview,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "unread": unread_count(db, c, side),
        # Read receipt for the viewer's own messages: the other side has read up to this message id.
        "other_side_read_id": c.admin_last_read_id if side == "RIDER" else c.rider_last_read_id,
    }
    if side == "ADMIN":
        rider = c.rider
        data["rider"] = {"id": rider.id, "rider_id": rider.rider_id, "full_name": rider.full_name, "mobile_number": rider.mobile_number} if rider else None
        data["assigned_admin"] = {"id": c.assigned_admin.id, "email": c.assigned_admin.email} if c.assigned_admin else None
    return data


def admin_query(db: Session, status=None, campaign_id=None, rider_id=None, assigned_admin_id=None, search=None, date_from=None, date_to=None):
    query = db.query(SupportConversation).join(Rider, SupportConversation.rider_id == Rider.id)
    if status and status != "ALL":
        if status == "ACTIVE":  # Everything not resolved/closed
            query = query.filter(SupportConversation.status.in_((SupportStatus.OPEN, SupportStatus.WAITING_FOR_ADMIN, SupportStatus.WAITING_FOR_RIDER)))
        else:
            query = query.filter(SupportConversation.status == status)
    if campaign_id:
        query = query.filter(SupportConversation.campaign_id == campaign_id)
    if rider_id:
        query = query.filter(SupportConversation.rider_id == rider_id)
    if assigned_admin_id == -1:
        query = query.filter(SupportConversation.assigned_admin_id.is_(None))
    elif assigned_admin_id:
        query = query.filter(SupportConversation.assigned_admin_id == assigned_admin_id)
    if date_from:
        query = query.filter(SupportConversation.updated_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(SupportConversation.updated_at <= datetime.combine(date_to, datetime.max.time()))
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(Rider.full_name.ilike(term), Rider.mobile_number.ilike(term), Rider.rider_id.ilike(term),
                                 SupportConversation.subject.ilike(term), SupportConversation.campaign_name.ilike(term)))
    return query


def admin_counts(db: Session) -> Dict:
    counts = dict(db.query(SupportConversation.status, func.count(SupportConversation.id)).group_by(SupportConversation.status).all())
    unread = (
        db.query(func.count(SupportMessage.id))
        .join(SupportConversation, SupportConversation.id == SupportMessage.conversation_id)
        .filter(SupportMessage.sender_type == "RIDER", SupportMessage.id > SupportConversation.admin_last_read_id)
        .scalar()
    )
    return {**{s: counts.get(s, 0) for s in SupportStatus.ALL}, "unread_messages": unread}


def delete_for_rider(db: Session, rider_id: int) -> int:
    """Account deletion only: a rider's support conversations are personal data and go with the account."""
    ids = [cid for (cid,) in db.query(SupportConversation.id).filter(SupportConversation.rider_id == rider_id)]
    if not ids:
        return 0
    db.query(SupportMessage).filter(SupportMessage.conversation_id.in_(ids)).delete(synchronize_session=False)
    return db.query(SupportConversation).filter(SupportConversation.id.in_(ids)).delete(synchronize_session=False)
