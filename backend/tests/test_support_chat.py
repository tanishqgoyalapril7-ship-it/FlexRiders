"""Support chat: rider ↔ admin conversations, access control, statuses, unread, pagination, realtime signals."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.security import UserRole
from app.models.all_models import Notification, SupportConversation, SupportMessage
from app.services import realtime_service as rt
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE, before_start
from tests.test_crud import make_admin

API = "/api/v1"
R = f"{API}/riders/me/support"
A = f"{API}/admin/support"


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def signals(monkeypatch):
    """Captures realtime broadcasts instead of calling Supabase."""
    sent = []
    monkeypatch.setattr(rt, "broadcast", lambda topics, payload: sent.append((list(topics), payload)) or True)
    return sent


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _rider(client, name="Chat Rider"):
    phone = "9" + str(uuid.uuid4().int)[:9]
    res = client.post(f"{API}/auth/register", json={"accept_terms": True, "full_name": name, "mobile_number": phone, "password": "riderPass1",
                                                   "vehicle_category": "CYCLE", "selfie": SELFIE})
    assert res.status_code == 200, res.text
    headers = {"Authorization": "Bearer " + res.json()["access_token"]}
    return client.get(f"{API}/riders/me", headers=headers).json(), headers


def test_full_conversation_flow_statuses_unread_and_signals(client, db_session, admin, signals):
    rider, rh = _rider(client)
    # Rider starts a conversation → waiting for support; admin inbox and rider channel are signalled.
    conv = client.post(f"{R}/conversations", json={"subject": "Payout not received", "message": "Hello"}, headers=rh).json()
    assert conv["status"] == "WAITING_FOR_ADMIN" and conv["unread"] == 0
    cid = conv["id"]
    topics, payload = signals[-1]
    assert set(topics) == {rt.rider_topic(rider["id"]), rt.admin_topic()}
    assert payload == {"type": "created", "conversation_id": cid, "status": "WAITING_FOR_ADMIN"}  # No message text

    # Admin inbox sees it, unread, with rider details; one admin notification.
    inbox = client.get(f"{A}/conversations", headers=admin).json()
    row = next(c for c in inbox["conversations"] if c["id"] == cid)
    assert row["unread"] == 1 and row["rider"]["full_name"] == "Chat Rider" and row["last_message_preview"] == "Hello"
    assert inbox["counts"]["WAITING_FOR_ADMIN"] >= 1 and inbox["counts"]["unread_messages"] >= 1
    db_session.expire_all()
    assert db_session.query(Notification).filter(Notification.category == "SUPPORT", Notification.reference_id == str(cid), Notification.user_id.is_(None)).count() == 1

    # Admin opens it (read) and replies → waiting for rider, auto-assigned, rider notified once, rider sees unread.
    assert client.post(f"{A}/conversations/{cid}/read", headers=admin).json()["unread"] == 0
    reply = client.post(f"{A}/conversations/{cid}/messages", json={"message": "Hi, how can we help?"}, headers=admin).json()
    assert reply["conversation"]["status"] == "WAITING_FOR_RIDER" and reply["conversation"]["assigned_admin"] is not None
    assert reply["message"]["sender_name"].startswith("FlexRiders Support")
    mine = client.get(f"{R}/conversations", headers=rh).json()
    assert mine["unread"] == 1 and mine["conversations"][0]["status"] == "WAITING_FOR_RIDER"
    assert client.get(f"{R}/unread", headers=rh).json() == {"unread": 1}
    db_session.expire_all()
    assert db_session.query(Notification).filter(Notification.title == "Support replied", Notification.reference_id == str(cid)).count() == 1
    # The rider's read receipt: support has read the rider's "Hello".
    page = client.get(f"{R}/conversations/{cid}/messages", headers=rh).json()
    assert [m["body"] for m in page["messages"]] == ["Hello", "Hi, how can we help?"]
    assert page["conversation"]["other_side_read_id"] >= page["messages"][0]["id"]
    client.post(f"{R}/conversations/{cid}/read", headers=rh)
    assert client.get(f"{R}/conversations", headers=rh).json()["unread"] == 0

    # Rider replies → waiting for admin again; two rider messages in a row notify admins only once.
    client.post(f"{R}/conversations/{cid}/messages", json={"message": "Still missing"}, headers=rh)
    client.post(f"{R}/conversations/{cid}/messages", json={"message": "For 3 days"}, headers=rh)
    assert client.get(f"{R}/conversations", headers=rh).json()["conversations"][0]["status"] == "WAITING_FOR_ADMIN"
    db_session.expire_all()
    assert db_session.query(Notification).filter(Notification.category == "SUPPORT", Notification.user_id.is_(None), Notification.reference_id == str(cid)).count() == 2

    # Resolve → rider sees it; rider reply reopens to waiting; close → rider can't send; reopen → OPEN.
    assert client.patch(f"{A}/conversations/{cid}", json={"status": "RESOLVED"}, headers=admin).json()["status"] == "RESOLVED"
    assert client.get(f"{R}/conversations", headers=rh).json()["conversations"][0]["status"] == "RESOLVED"
    assert signals[-1][1]["type"] == "status"
    client.post(f"{R}/conversations/{cid}/messages", json={"message": "One more thing"}, headers=rh)
    assert client.get(f"{R}/conversations", headers=rh).json()["conversations"][0]["status"] == "WAITING_FOR_ADMIN"
    assert client.patch(f"{A}/conversations/{cid}", json={"status": "CLOSED"}, headers=admin).json()["status"] == "CLOSED"
    res = client.post(f"{R}/conversations/{cid}/messages", json={"message": "hello?"}, headers=rh)
    assert res.status_code == 400 and "closed" in res.json()["detail"]
    assert client.post(f"{A}/conversations/{cid}/messages", json={"message": "x"}, headers=admin).status_code == 400  # Reopen first
    assert client.patch(f"{A}/conversations/{cid}", json={"status": "OPEN"}, headers=admin).json()["status"] == "OPEN"
    assert client.patch(f"{A}/conversations/{cid}", json={"status": "OPEN"}, headers=admin).status_code == 400  # Already open
    assert client.patch(f"{A}/conversations/{cid}", json={"status": "DELETED"}, headers=admin).status_code == 400

    # History is complete (system messages mark each status change).
    bodies = [m["body"] for m in client.get(f"{A}/conversations/{cid}/messages", params={"limit": 100}, headers=admin).json()["messages"]]
    assert bodies[:4] == ["Hello", "Hi, how can we help?", "Still missing", "For 3 days"] and len(bodies) == 8
    assert sum("resolved" in b for b in bodies) == 1 and sum("reopened" in b for b in bodies) == 1
    logs = client.get(f"{API}/audit-logs", headers=admin).json()
    logs = logs if isinstance(logs, list) else logs.get("items", logs.get("logs", []))
    assert {"SUPPORT_RESOLVED", "SUPPORT_CLOSED", "SUPPORT_REOPENED"} <= {r["action"] for r in logs}


def test_riders_only_see_and_write_their_own(client, db_session, admin, signals):
    a, ah = _rider(client, "Rider A")
    b, bh = _rider(client, "Rider B")
    conv = client.post(f"{R}/conversations", json={"subject": "Mine", "message": "private"}, headers=ah).json()
    assert client.get(f"{R}/conversations", headers=bh).json()["conversations"] == []
    assert client.get(f"{R}/conversations/{conv['id']}/messages", headers=bh).status_code == 404
    assert client.post(f"{R}/conversations/{conv['id']}/messages", json={"message": "hi"}, headers=bh).status_code == 404
    assert client.post(f"{R}/conversations/{conv['id']}/read", headers=bh).status_code == 404
    # Riders can't use admin endpoints; anonymous users get nothing.
    assert client.get(f"{A}/conversations", headers=ah).status_code == 403
    for path in (f"{R}/conversations", f"{A}/conversations", f"{R}/realtime", f"{A}/realtime", f"{A}/conversations/{conv['id']}/messages"):
        assert client.get(path).status_code == 401, path
    # Each rider gets their own unguessable channel; admins share another.
    ra = client.get(f"{R}/realtime", headers=ah).json()["topic"]
    rb = client.get(f"{R}/realtime", headers=bh).json()["topic"]
    assert ra != rb and ra != rt.admin_topic() and ra != f"support-rider-{a['id']}" and len(ra) > 40  # Not derivable from the id


def test_finance_admin_cannot_access_support(client, db_session, admin, signals):
    finance = make_admin(client, db_session, role=UserRole.FINANCE_ADMIN)[0]
    ops = make_admin(client, db_session, role=UserRole.OPERATIONS_ADMIN)[0]
    _, rh = _rider(client)
    cid = client.post(f"{R}/conversations", json={"subject": "Help", "message": "hi"}, headers=rh).json()["id"]
    for method, path in (("get", f"{A}/conversations"), ("get", f"{A}/conversations/{cid}/messages"), ("get", f"{A}/realtime")):
        assert getattr(client, method)(path, headers=finance).status_code == 403
    assert client.post(f"{A}/conversations/{cid}/messages", json={"message": "x"}, headers=finance).status_code == 403
    assert client.get(f"{A}/conversations", headers=ops).status_code == 200  # Operations admins handle support


def test_assignment_and_filters_and_search(client, db_session, admin, signals):
    ops_headers, _ = make_admin(client, db_session, role=UserRole.OPERATIONS_ADMIN)
    finance_headers, _ = make_admin(client, db_session, role=UserRole.FINANCE_ADMIN)
    agents = client.get(f"{A}/agents", headers=admin).json()
    assert agents and all(a["role"] != "FINANCE_ADMIN" for a in agents)
    ops_id = next(a["id"] for a in agents if a["role"] == "OPERATIONS_ADMIN")
    finance_id = client.get(f"{API}/auth/me", headers=finance_headers).json()["id"]

    _, rh = _rider(client, "Searchable Singh")
    cid = client.post(f"{R}/conversations", json={"subject": "T-shirt size wrong", "message": "hi"}, headers=rh).json()["id"]
    assert client.patch(f"{A}/conversations/{cid}", json={"assigned_admin_id": finance_id}, headers=admin).status_code == 400
    assigned = client.patch(f"{A}/conversations/{cid}", json={"assigned_admin_id": ops_id}, headers=admin).json()
    assert assigned["assigned_admin"]["id"] == ops_id and signals[-1][1]["type"] == "assigned"
    ids = lambda **p: [c["id"] for c in client.get(f"{A}/conversations", params=p, headers=admin).json()["conversations"]]
    assert cid in ids(assigned_admin_id=ops_id) and cid not in ids(assigned_admin_id=-1)
    assert cid in ids(search="searchable") and cid in ids(search="t-shirt") and cid not in ids(search="zzz-nothing")
    assert cid in ids(status="WAITING_FOR_ADMIN") and cid in ids(status="ACTIVE") and cid not in ids(status="RESOLVED")
    assert cid in ids(date_from=today_ist().isoformat()) and cid not in ids(date_to=(today_ist() - timedelta(days=3)).isoformat())
    assert client.patch(f"{A}/conversations/{cid}", json={"unassign": True}, headers=admin).json()["assigned_admin"] is None
    assert cid in ids(assigned_admin_id=-1)


def test_campaign_link_only_for_own_campaigns(client, db_session, admin, signals):
    rider, rh = _rider(client)
    client.patch(f"{API}/admin/riders/{rider['id']}/approve", headers=admin)
    brand = client.post(f"{API}/brands", json={"name": f"Chat Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=3)
    mk = lambda name: client.post(f"{API}/campaigns", json={"name": name, "brand_id": brand["id"], "start_date": start.isoformat(),
                                                             "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 3,
                                                             "daily_rate": 10, "visibility": "PUBLIC"}, headers=admin).json()
    joined, other = mk("Joined One"), mk("Not Mine")
    with before_start(db_session, joined["id"]):
        assert client.post(f"{API}/riders/me/campaigns/{joined['id']}/join", json={}, headers=rh).status_code == 200
    options = client.get(f"{R}/campaign-options", headers=rh).json()
    assert [o["id"] for o in options] == [joined["id"]]
    bad = client.post(f"{R}/conversations", json={"subject": "x", "message": "y", "campaign_id": other["id"]}, headers=rh)
    assert bad.status_code == 400
    conv = client.post(f"{R}/conversations", json={"subject": "Kit", "message": "Where is pickup?", "campaign_id": joined["id"]}, headers=rh).json()
    assert conv["campaign_name"] == "Joined One"
    ids = [c["id"] for c in client.get(f"{A}/conversations", params={"campaign_id": joined["id"]}, headers=admin).json()["conversations"]]
    assert ids == [conv["id"]]


def test_pagination_and_validation(client, db_session, admin, signals):
    _, rh = _rider(client)
    cid = client.post(f"{R}/conversations", json={"subject": "Many", "message": "m0"}, headers=rh).json()["id"]
    for i in range(1, 45):
        client.post(f"{R}/conversations/{cid}/messages", json={"message": f"m{i}"}, headers=rh)
    first = client.get(f"{R}/conversations/{cid}/messages", headers=rh).json()
    assert len(first["messages"]) == 30 and first["has_more"] and first["messages"][-1]["body"] == "m44"
    older = client.get(f"{R}/conversations/{cid}/messages", params={"before_id": first["messages"][0]["id"]}, headers=rh).json()
    assert len(older["messages"]) == 15 and not older["has_more"] and older["messages"][0]["body"] == "m0"
    assert client.post(f"{R}/conversations/{cid}/messages", json={"message": "   "}, headers=rh).status_code == 400
    assert client.post(f"{R}/conversations/{cid}/messages", json={"message": "x" * 2001}, headers=rh).status_code == 422
    assert client.post(f"{R}/conversations", json={"subject": "", "message": "hi"}, headers=rh).status_code == 400


def test_account_deletion_removes_support_chats(client, db_session, admin, signals):
    _, rh = _rider(client)
    cid = client.post(f"{R}/conversations", json={"subject": "Bye", "message": "delete me"}, headers=rh).json()["id"]
    res = client.request("DELETE", f"{API}/riders/me", json={"password": "riderPass1"}, headers=rh)
    assert res.status_code == 200
    db_session.expire_all()
    assert db_session.get(SupportConversation, cid) is None
    assert db_session.query(SupportMessage).filter(SupportMessage.conversation_id == cid).count() == 0


def test_realtime_config_and_payload_safety(client, admin, monkeypatch):
    _, rh = _rider(client)
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    assert client.get(f"{R}/realtime", headers=rh).json()["enabled"] is False  # Local/tests: no Supabase
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "sb_secret_test")
    cfg = client.get(f"{R}/realtime", headers=rh).json()
    assert cfg["enabled"] and cfg["key"].startswith("sb_publishable_") and "secret" not in cfg["key"]
    sent = {}

    class Resp:
        status_code = 200

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return Resp()

    monkeypatch.setattr(rt.httpx, "post", fake_post)
    assert rt.broadcast([rt.admin_topic()], {"type": "message", "conversation_id": 1, "status": "OPEN"}) is True
    assert sent["url"].endswith("/realtime/v1/api/broadcast") and sent["json"]["messages"][0]["private"] is False
    assert set(sent["json"]["messages"][0]["payload"]) == {"type", "conversation_id", "status"}
