"""Registration must never log anyone into an existing account (rider or admin)."""
import uuid

from app.core.security import UserRole, get_password_hash
from app.models.all_models import Rider, User

API = "/api/v1"


def _body(phone, name="Victim Rider"):
    return {"full_name": name, "mobile_number": phone, "password": "riderPass1", "vehicle_category": "CYCLE"}


def test_existing_rider_number_is_refused(client, db_session):
    phone = "9" + str(uuid.uuid4().int)[:9]
    assert client.post(f"{API}/auth/register", json=_body(phone)).status_code == 200
    res = client.post(f"{API}/auth/register", json={**_body(phone, "Attacker"), "password": "attacker1"})
    assert res.status_code == 400 and "access_token" not in res.json()


def test_admin_number_is_refused_and_nothing_attached(client, db_session):
    phone = "9" + str(uuid.uuid4().int)[:9]
    db_session.add(User(phone=phone, email=f"{phone}@a.test", hashed_password=get_password_hash("adminSecret1"), role=UserRole.SUPER_ADMIN))
    db_session.commit()
    res = client.post(f"{API}/auth/register", json=_body(phone, "Evil"))
    assert res.status_code == 400 and "access_token" not in res.json()
    db_session.expire_all()
    admin = db_session.query(User).filter(User.phone == phone).one()
    assert db_session.query(Rider).filter(Rider.user_id == admin.id).first() is None


def test_password_required(client):
    body = _body("9" + str(uuid.uuid4().int)[:9])
    body.pop("password")
    assert client.post(f"{API}/auth/register", json=body).status_code == 422
