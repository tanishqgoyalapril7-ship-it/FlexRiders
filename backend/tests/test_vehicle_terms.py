"""Four vehicle types, per-campaign vehicle eligibility, campaign categories, versioned campaign terms
with recorded acceptance, campaign isolation, and public-asset approval."""
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.models.all_models import Notification, Rider
from app.models.campaign_models import CampaignTermsAcceptance
from app.services.campaign_service import today_ist
from tests.conftest import SELFIE, before_start
from tests.test_crud import make_admin

API = "/api/v1"
NUMBERS = {"TWO_WHEELER": "HR26DK", "AUTO": "DL1RA", "THREE_WHEELER": "MH12LD"}
TERMS_V1 = "Riders must wear the campaign T-shirt on every campaign day and follow local traffic rules."
TERMS_V2 = TERMS_V1 + " Photos must show the campaign branding clearly."


@pytest.fixture(autouse=True)
def uploads_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))


@pytest.fixture
def admin(client, db_session):
    return make_admin(client, db_session)[0]


def _phone():
    return "9" + str(uuid.uuid4().int)[:9]


def register(client, category, **extra):
    phone = _phone()
    body = {"selfie": SELFIE, "full_name": f"{category} Rider", "mobile_number": phone, "password": "riderPass1", "vehicle_category": category, **extra}
    if category in NUMBERS and "vehicle_number" not in extra:
        body["vehicle_number"] = NUMBERS[category] + phone[-4:]
    return client.post(f"{API}/auth/register", json=body)


def approved_rider(client, admin, category):
    res = register(client, category)
    assert res.status_code == 200, res.text
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    me = client.get(f"{API}/riders/me", headers=headers).json()
    client.patch(f"{API}/admin/riders/{me['id']}/approve", headers=admin)
    return me, headers


def campaign(client, admin, vehicles=None, start_offset=5, **extra):
    brand = client.post(f"{API}/brands", json={"name": f"VT Brand {uuid.uuid4().hex[:5]}"}, headers=admin).json()
    start = today_ist() + timedelta(days=start_offset)
    res = client.post(
        f"{API}/campaigns",
        json={"name": f"VT Campaign {uuid.uuid4().hex[:4]}", "brand_id": brand["id"], "start_date": start.isoformat(),
              "end_date": (start + timedelta(days=4)).isoformat(), "total_slots": 5, "daily_rate": 10, "visibility": "PUBLIC",
              **({"eligible_vehicle_categories": vehicles} if vehicles is not None else {}), **extra},
        headers=admin,
    )
    assert res.status_code == 200, res.text
    return res.json()


# --------------------------------------------------------------------------- registration

@pytest.mark.parametrize("category", ["CYCLE", "TWO_WHEELER", "AUTO", "THREE_WHEELER"])
def test_each_vehicle_type_registers(client, category):
    res = register(client, category)
    assert res.status_code == 200, res.text
    me = client.get(f"{API}/riders/me", headers={"Authorization": f"Bearer {res.json()['access_token']}"}).json()
    assert me["vehicle_category"] == category
    assert (me["vehicle_number"] is None) == (category == "CYCLE")


def test_registration_vehicle_rules(client):
    base = {"selfie": SELFIE, "full_name": "No Type", "password": "riderPass1"}
    assert client.post(f"{API}/auth/register", json={"selfie": SELFIE, **base, "mobile_number": _phone()}).status_code == 422  # Missing
    assert client.post(f"{API}/auth/register", json={"selfie": SELFIE, **base, "mobile_number": _phone(), "vehicle_category": "TRUCK"}).status_code == 422  # Invalid
    # A registration number is required for everything except Cycle (existing number rules unchanged).
    for category in ("TWO_WHEELER", "AUTO", "THREE_WHEELER"):
        res = client.post(f"{API}/auth/register", json={"selfie": SELFIE, **base, "mobile_number": _phone(), "vehicle_category": category})
        assert res.status_code == 422 and "registration number" in res.text
    assert client.post(f"{API}/auth/register", json={"selfie": SELFIE, **base, "mobile_number": _phone(), "vehicle_category": "AUTO", "vehicle_number": "12345"}).status_code == 422
    # Labels and aliases map to the stored values.
    assert register(client, "Bike / Two Wheeler", vehicle_number="KA05MN" + _phone()[-4:]).status_code == 200
    # Vehicle numbers stay unique across riders.
    number = "UP16AB" + _phone()[-4:]
    assert register(client, "AUTO", vehicle_number=number).status_code == 200
    assert register(client, "THREE_WHEELER", vehicle_number=number).status_code == 400


def test_rider_cannot_change_vehicle_type_and_admin_change_is_audited(client, db_session, admin):
    me, headers = approved_rider(client, admin, "CYCLE")
    assert client.patch(f"{API}/riders/me", json={"vehicle_category": "TWO_WHEELER"}, headers=headers).status_code == 400
    assert client.put(f"{API}/admin/riders/{me['id']}", json={"vehicle_category": "AUTO"}, headers=admin).status_code == 400  # No number yet
    assert client.put(f"{API}/admin/riders/{me['id']}", json={"vehicle_category": "AUTO", "vehicle_number": "DL1RA" + _phone()[-4:]}, headers=admin).status_code == 200
    logs = client.get(f"{API}/audit-logs", headers=admin).json()
    rows = logs if isinstance(logs, list) else logs.get("items", logs.get("logs", []))
    assert any(r.get("action") == "RIDER_VEHICLE_TYPE_CHANGED" and "Cycle → Auto" in (r.get("details") or "") for r in rows)
    # Admin filter by vehicle type.
    listed = client.get(f"{API}/admin/riders?vehicle_category=AUTO", headers=admin).json()
    assert me["id"] in [r["id"] for r in listed] and all(r["vehicle_category"] == "AUTO" for r in listed)


# --------------------------------------------------------------------------- eligibility

@pytest.mark.parametrize("category", ["CYCLE", "TWO_WHEELER", "AUTO", "THREE_WHEELER"])
def test_each_type_joins_only_eligible_campaigns(client, admin, category):
    _, headers = approved_rider(client, admin, category)
    mine = campaign(client, admin, [category])
    others = [c for c in ("CYCLE", "TWO_WHEELER", "AUTO", "THREE_WHEELER") if c != category]
    not_mine = campaign(client, admin, others)
    # Hidden from this rider (list and direct link); a direct join is still refused.
    assert not_mine["id"] not in [c["id"] for c in client.get(f"{API}/riders/me/campaigns", headers=headers).json()["available"]]
    card = client.get(f"{API}/riders/me/campaigns/{not_mine['id']}", headers=headers)
    assert card.status_code == 404 and "not available for your vehicle" in card.json()["detail"]
    res = client.post(f"{API}/riders/me/campaigns/{not_mine['id']}/join", json={}, headers=headers)  # Direct API call
    assert res.status_code == 400 and "only for" in res.json()["detail"]
    assert client.post(f"{API}/riders/me/campaigns/{mine['id']}/join", json={}, headers=headers).status_code == 200


def test_changing_eligibility_and_all_vehicle_campaigns(client, admin):
    _, headers = approved_rider(client, admin, "AUTO")
    c = campaign(client, admin, ["CYCLE", "TWO_WHEELER"], campaign_category="CYCLE")
    assert c["campaign_category"] == "CYCLE" and c["campaign_category_label"] == "Cycle"
    assert client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers).status_code == 400
    edit = {k: c[k] for k in ("name", "brand_id", "start_date", "end_date", "total_slots", "daily_rate")}
    updated = client.put(f"{API}/campaigns/{c['id']}", json={**edit, "eligible_vehicle_categories": ["CYCLE", "TWO_WHEELER", "AUTO"]}, headers=admin).json()
    assert updated["eligible_vehicle_label"] == "Cycle, Bike / Two Wheeler, Auto" and updated["campaign_category"] == "CYCLE"
    assert client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers).status_code == 200
    logs = client.get(f"{API}/audit-logs", headers=admin).json()
    rows = logs if isinstance(logs, list) else logs.get("items", logs.get("logs", []))
    assert any("eligible vehicles: Cycle, Bike / Two Wheeler → Cycle, Bike / Two Wheeler, Auto" in (r.get("details") or "") for r in rows)
    # No selection (or all four) = everyone.
    open_to_all = campaign(client, admin, None)
    assert open_to_all["eligible_vehicle_label"] == "All vehicles"
    assert client.get(f"{API}/campaigns?category=CYCLE", headers=admin).json()[0]["campaign_category"] == "CYCLE"
    assert client.post(f"{API}/campaigns", json={**edit, "name": "Bad category", "campaign_category": "SPACE"}, headers=admin).status_code == 422


# --------------------------------------------------------------------------- isolation

def test_registrations_stay_in_their_campaign(client, admin):
    _, headers = approved_rider(client, admin, "TWO_WHEELER")
    a = campaign(client, admin)
    b = campaign(client, admin)
    assert client.post(f"{API}/riders/me/campaigns/{a['id']}/join", json={}, headers=headers).status_code == 200
    in_a = client.get(f"{API}/campaigns/{a['id']}/applications", headers=admin).json()
    in_b = client.get(f"{API}/campaigns/{b['id']}/applications", headers=admin).json()
    assert len(in_a) == 1 and in_a[0]["rider"]["vehicle_category"] == "TWO_WHEELER" and in_b == []
    # The rider can't be in two campaigns' requests at once (existing rule) and the other campaign stays empty.
    assert client.post(f"{API}/riders/me/campaigns/{b['id']}/join", json={}, headers=headers).status_code == 400
    assert client.get(f"{API}/campaigns/{b['id']}/applications", headers=admin).json() == []


# --------------------------------------------------------------------------- terms

def test_versioned_terms_acceptance(client, db_session, admin):
    c = campaign(client, admin, start_offset=0)
    cid = c["id"]
    rider, headers = approved_rider(client, admin, "CYCLE")
    late, late_h = approved_rider(client, admin, "CYCLE")

    # Admin publishes v1; too-short or unchanged text is refused.
    assert client.post(f"{API}/campaigns/{cid}/terms", json={"body": "short"}, headers=admin).status_code == 400
    overview = client.post(f"{API}/campaigns/{cid}/terms", json={"body": TERMS_V1}, headers=admin).json()
    assert overview["current"]["version"] == 1
    assert client.post(f"{API}/campaigns/{cid}/terms", json={"body": TERMS_V1}, headers=admin).status_code == 400
    assert client.post(f"{API}/campaigns/{cid}/terms", json={"body": TERMS_V1}, headers=headers).status_code == 403  # Riders can't publish

    with before_start(db_session, cid):
        card = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
        assert card["terms"]["version"] == 1 and card["terms"]["needs_acceptance"] is True and card["terms"]["body"] == TERMS_V1
        # Joining needs the current version: none, or a made-up one, is refused.
        join = f"{API}/riders/me/campaigns/{cid}/join"
        assert "Terms & Conditions" in client.post(join, json={}, headers=headers).json()["detail"]
        assert client.post(join, json={"terms_version": 7}, headers=headers).status_code == 400
        assert client.post(join, json={"terms_version": 1}, headers=headers).status_code == 200
        acc = db_session.query(CampaignTermsAcceptance).filter_by(rider_id=rider["id"], campaign_id=cid).one()
        assert acc.terms_version == 1 and acc.accepted_at is not None and acc.application_id is not None and acc.source == "JOIN"
        app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]["id"]
        assert client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin).status_code == 200

        # A second rider requests under v1, then v2 is published before approval.
        client.post(join, json={"terms_version": 1}, headers=late_h)
        v2 = client.post(f"{API}/campaigns/{cid}/terms", json={"body": TERMS_V2, "change_note": "Branding in photos"}, headers=admin).json()
        assert [v["version"] for v in v2["versions"]] == [2, 1] and v2["versions"][1]["acceptances"] == 2  # History kept
        late_app = next(a for a in client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json() if a["rider"]["id"] == late["id"])
        assert late_app["can_approve"] is False and "terms" in late_app["approve_blocked_reason"]
        res = client.post(f"{API}/campaigns/{cid}/applications/{late_app['id']}/approve", headers=admin)
        assert res.status_code == 400 and "version 2" in res.json()["detail"]

    # The active rider is told, not blocked: photos still upload while v2 is pending.
    db_session.expire_all()
    note = db_session.query(Notification).filter(Notification.title == "Campaign terms updated", Notification.reference_id == str(cid)).all()
    assert len(note) == 1  # Only the assigned rider, once
    card = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
    assert card["terms"]["needs_acceptance"] is True and card["terms"]["accepted_version"] == 1
    up = client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", b"morning", "image/jpeg")}, data={"slot": "MORNING"}, headers=headers)
    assert up.status_code == 200, up.text

    # Accepting a stale version is refused; the current one adds a new row (v1 row untouched).
    accept = f"{API}/riders/me/campaigns/{cid}/terms/accept"
    assert client.post(accept, json={"version": 1}, headers=headers).status_code == 400
    status = client.post(accept, json={"version": 2}, headers=headers).json()
    assert status["needs_acceptance"] is False and status["accepted_version"] == 2
    rows = db_session.query(CampaignTermsAcceptance).filter_by(rider_id=rider["id"], campaign_id=cid).order_by(CampaignTermsAcceptance.terms_version).all()
    assert [(r.terms_version, r.source) for r in rows] == [(1, "JOIN"), (2, "UPDATE")]
    assert client.post(accept, json={"version": 2}, headers=headers).status_code == 200  # Idempotent
    assert db_session.query(CampaignTermsAcceptance).filter_by(rider_id=rider["id"], campaign_id=cid).count() == 2

    # The late rider accepts v2; the admin overview counts current riders who accepted the current version.
    client.post(accept, json={"version": 2}, headers=late_h)
    overview = client.get(f"{API}/campaigns/{cid}/terms", headers=admin).json()
    assert overview["current_riders"] == 1 and overview["current_riders_accepted"] == 1

    # Terms are campaign-specific: another campaign has none, and accepting there is refused.
    other = campaign(client, admin)
    assert client.get(f"{API}/riders/me/campaigns/{other['id']}", headers=late_h).json()["terms"] is None
    assert client.post(f"{API}/riders/me/campaigns/{other['id']}/terms/accept", json={"version": 1}, headers=late_h).status_code == 400
    # A rider with accepted terms has consent history: archive, not hard delete.
    impact = client.get(f"{API}/admin/riders/{late['id']}/delete-impact", headers=admin).json()
    assert impact["can_hard_delete"] is False and "terms_acceptances" in impact["blocked_by"]


def test_terms_on_draft_campaign_not_accessible_to_riders(client, admin):
    draft = campaign(client, admin, visibility="DRAFT")
    client.post(f"{API}/campaigns/{draft['id']}/terms", json={"body": TERMS_V1}, headers=admin)
    _, headers = approved_rider(client, admin, "CYCLE")
    assert client.post(f"{API}/riders/me/campaigns/{draft['id']}/terms/accept", json={"version": 1}, headers=headers).status_code == 404


# --------------------------------------------------------------------------- public page / assets

def test_public_page_hides_unapproved_assets_and_private_data(client, admin):
    c = campaign(client, admin, ["CYCLE"], campaign_category="TV", location_area="Sector 57, Gurugram")
    client.post(f"{API}/campaigns/{c['id']}/terms", json={"body": TERMS_V1}, headers=admin)
    brand_id = c["brand_id"]
    client.put(f"{API}/brands/{brand_id}", json={"logo": "https://example.com/logo.png"}, headers=admin)
    rider, headers = approved_rider(client, admin, "CYCLE")
    client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={"terms_version": 1}, headers=headers)
    slug = client.post(f"{API}/campaigns/{c['id']}/share", json={"enabled": True}, headers=admin).json()["slug"]

    page = client.get(f"{API}/public/campaigns/{slug}")
    data = page.json()
    assert data["brand"]["logo_url"] is None and data["image_url"] is None  # Not approved yet
    assert data["category"] == "TV" and data["eligible_vehicles"] == "Cycle" and data["terms"]["version"] == 1
    for private in (rider["mobile_number"], rider["full_name"], "upi", "daily_rate", "payout"):
        assert private not in page.text

    # Admin confirms rights: the logo appears (and the change is audited).
    assert client.put(f"{API}/brands/{brand_id}", json={"public_assets_approved": True}, headers=admin).json()["public_assets_approved"] is True
    assert client.get(f"{API}/public/campaigns/{slug}").json()["brand"]["logo_url"] == "https://example.com/logo.png"
    logs = client.get(f"{API}/audit-logs", headers=admin).json()
    rows = logs if isinstance(logs, list) else logs.get("items", logs.get("logs", []))
    assert any(r.get("action") == "BRAND_PUBLIC_ASSETS_APPROVED" for r in rows)


# --------------------------------------------------------------------------- admin vehicle-number rules

def _admin_create(client, admin, category, number=None):
    body = {"selfie": SELFIE, "full_name": "Admin Made", "mobile_number": _phone(), "password": "riderPass1", "primary_city": "Gurugram",
            "vehicle_category": category, "status": "APPROVED", **({"vehicle_number": number} if number else {})}
    return client.post(f"{API}/admin/riders", json=body, headers=admin)


@pytest.mark.parametrize("category", ["TWO_WHEELER", "AUTO", "THREE_WHEELER"])
def test_admin_create_requires_number_except_cycle(client, admin, category):
    res = _admin_create(client, admin, category)
    assert res.status_code == 422 and "registration number is required" in res.text
    ok = _admin_create(client, admin, category, "mh 12 ld " + _phone()[-4:])
    assert ok.status_code == 200 and ok.json()["vehicle_number"].startswith("MH12LD")  # Existing normalisation unchanged
    assert _admin_create(client, admin, category, "12345").status_code == 422  # Existing format validation unchanged


def test_admin_create_cycle_without_number(client, admin):
    res = _admin_create(client, admin, "CYCLE")
    assert res.status_code == 200 and res.json()["vehicle_number"] is None


@pytest.mark.parametrize("target", ["TWO_WHEELER", "AUTO", "THREE_WHEELER"])
def test_admin_edit_vehicle_type_and_number_rules(client, admin, target):
    rider = _admin_create(client, admin, "CYCLE").json()
    url = f"{API}/admin/riders/{rider['id']}"
    # Cycle → motor vehicle without a (valid) number: refused, nothing saved.
    assert client.put(url, json={"vehicle_category": target}, headers=admin).status_code == 400
    assert client.put(url, json={"vehicle_category": target, "vehicle_number": "ABC"}, headers=admin).status_code == 422
    assert client.get(url, headers=admin).json()["vehicle_category"] == "CYCLE"
    number = "KA05MN" + _phone()[-4:]
    changed = client.put(url, json={"vehicle_category": target, "vehicle_number": number}, headers=admin)
    assert changed.status_code == 200 and changed.json()["vehicle_category"] == target and changed.json()["vehicle_number"] == number
    # Clearing the number of a motor vehicle is refused.
    assert client.put(url, json={"vehicle_number": ""}, headers=admin).status_code == 400
    assert client.get(url, headers=admin).json()["vehicle_number"] == number
    # Motor vehicle → Cycle: allowed, and the number may then be cleared.
    assert client.put(url, json={"vehicle_category": "CYCLE"}, headers=admin).status_code == 200
    assert client.put(url, json={"vehicle_number": ""}, headers=admin).json()["vehicle_number"] is None


def test_rider_profile_cannot_pick_motor_vehicle_without_number(client, db_session, admin):
    me, headers = approved_rider(client, admin, "CYCLE")
    legacy = db_session.get(Rider, me["id"])
    legacy.vehicle_category = None  # A rider from before vehicle types were required
    db_session.commit()
    res = client.patch(f"{API}/riders/me", json={"vehicle_category": "AUTO"}, headers=headers)
    assert res.status_code == 400 and "registration number" in res.json()["detail"]
    assert client.patch(f"{API}/riders/me", json={"vehicle_category": "CYCLE"}, headers=headers).status_code == 200


# --------------------------------------------------------------------------- terms retention (delete / archive)

def test_campaign_delete_and_rider_archive_keep_terms_history(client, db_session, admin):
    c = campaign(client, admin)
    client.post(f"{API}/campaigns/{c['id']}/terms", json={"body": TERMS_V1}, headers=admin)
    rider, headers = approved_rider(client, admin, "CYCLE")
    assert client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={"terms_version": 1}, headers=headers).status_code == 200
    acceptance = lambda: db_session.query(CampaignTermsAcceptance).filter_by(rider_id=rider["id"], campaign_id=c["id"]).one()

    # Cancel (rejects the pending request) and permanently delete the campaign: consent history stays.
    assert client.post(f"{API}/campaigns/{c['id']}/cancel", headers=admin).status_code == 200
    assert client.delete(f"{API}/campaigns/{c['id']}", headers=admin).status_code == 200
    db_session.expire_all()
    kept = acceptance()
    assert kept.terms_version == 1 and kept.campaign_name == c["name"] and kept.rider_code == rider["rider_id"]
    from app.models.campaign_models import CampaignTerms

    assert db_session.query(CampaignTerms).filter_by(campaign_id=c["id"], version=1).one().body == TERMS_V1

    # Archiving the rider keeps it too; a rider with consent history can't be hard-deleted (archive instead).
    assert client.post(f"{API}/admin/riders/{rider['id']}/archive", json={"reason": "Left the program"}, headers=admin).status_code == 200
    db_session.expire_all()
    assert acceptance().terms_version == 1
    impact = client.get(f"{API}/admin/riders/{rider['id']}/delete-impact", headers=admin).json()
    assert impact["can_hard_delete"] is False and "terms_acceptances" in impact["blocked_by"]


def test_new_campaign_never_inherits_old_terms(client, db_session, admin):
    """History is kept by plain id; a campaign only sees versions published after it was created."""
    from datetime import datetime

    from app.models.campaign_models import CampaignTerms

    from sqlalchemy import func

    c = campaign(client, admin)
    # Old history stored under the same id (e.g. a deleted campaign whose id a test database reused).
    old = (db_session.query(func.max(CampaignTerms.version)).filter(CampaignTerms.campaign_id == c["id"]).scalar() or 0) + 1
    db_session.add(CampaignTerms(campaign_id=c["id"], version=old, body="Old history from a deleted campaign that had this id.",
                                 published_at=datetime(2020, 1, 1)))
    db_session.commit()
    _, headers = approved_rider(client, admin, "CYCLE")
    assert client.get(f"{API}/riders/me/campaigns/{c['id']}", headers=headers).json()["terms"] is None
    assert client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers).status_code == 200
    published = client.post(f"{API}/campaigns/{c['id']}/terms", json={"body": TERMS_V1}, headers=admin).json()
    assert published["current"]["version"] == old + 1 and [v["version"] for v in published["versions"]] == [old + 1]  # Old rows untouched
    assert db_session.query(CampaignTerms).filter_by(campaign_id=c["id"], version=old).one().body.startswith("Old history")


# --------------------------------------------------------------------------- FlexRiders standard terms

STANDARD_TERMS_SHA256 = "d94e9c6d762ef8aa1c1ac00c5f0d31edce6342383f5ab843ce45b91792bdad43"


def test_standard_terms_wording_is_the_approved_text():
    """Guards the approved wording: any edit to the text fails here and needs the owner's approval."""
    import hashlib

    from app.services.standard_terms import STANDARD_TERMS

    assert hashlib.sha256(STANDARD_TERMS.encode()).hexdigest() == STANDARD_TERMS_SHA256
    assert STANDARD_TERMS.startswith("I AGREE TO THE FOLLOWING TERMS\n\nI voluntarily choose")
    assert STANDARD_TERMS.endswith("voluntarily choose to participate in this campaign.")


def test_standard_terms_published_as_a_version_and_accepted(client, db_session, admin):
    from app.services.standard_terms import STANDARD_TERMS

    # Never applied silently: a campaign created without the option has no terms.
    plain = campaign(client, admin)
    overview = client.get(f"{API}/campaigns/{plain['id']}/terms", headers=admin).json()
    assert overview["current"] is None and overview["standard_body"] == STANDARD_TERMS  # Admin can preview it

    c = campaign(client, admin, start_offset=0, publish_standard_terms=True)
    cid = c["id"]
    overview = client.get(f"{API}/campaigns/{cid}/terms", headers=admin).json()
    v1 = overview["current"]["version"]
    assert overview["current"]["body"] == STANDARD_TERMS and overview["current"]["published_at"]
    assert c["terms_version"] == v1

    rider, headers = approved_rider(client, admin, "CYCLE")
    newcomer, newcomer_h = approved_rider(client, admin, "CYCLE")
    join = f"{API}/riders/me/campaigns/{cid}/join"
    with before_start(db_session, cid):
        # The rider sees exactly the stored text, and can't join without accepting that version.
        card = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
        assert card["terms"]["body"] == STANDARD_TERMS and card["terms"]["needs_acceptance"] is True
        assert client.post(join, json={}, headers=headers).status_code == 400
        assert client.post(join, json={"terms_version": v1 + 5}, headers=headers).status_code == 400
        assert client.post(join, json={"terms_version": v1}, headers=headers).status_code == 200
        acc = db_session.query(CampaignTermsAcceptance).filter_by(rider_id=rider["id"], campaign_id=cid).one()
        assert acc.terms_version == v1 and acc.accepted_at and acc.application_id and acc.campaign_id == cid
        app_id = client.get(f"{API}/campaigns/{cid}/applications", headers=admin).json()[0]["id"]
        assert client.post(f"{API}/campaigns/{cid}/applications/{app_id}/approve", headers=admin).status_code == 200
        # Accepting the same version again doesn't add a second record.
        assert client.post(f"{API}/riders/me/campaigns/{cid}/terms/accept", json={"version": v1}, headers=headers).status_code == 200
        assert db_session.query(CampaignTermsAcceptance).filter_by(rider_id=rider["id"], campaign_id=cid).count() == 1

        # An edit is a new version; the published standard version stays exactly as it was.
        edited = STANDARD_TERMS + "\n\nPhotos must show the campaign branding clearly."
        after = client.post(f"{API}/campaigns/{cid}/terms", json={"body": edited, "change_note": "Photo rule"}, headers=admin).json()
        assert after["current"]["version"] == v1 + 1
        old = next(v for v in after["versions"] if v["version"] == v1)
        assert old["body"] == STANDARD_TERMS and old["acceptances"] == 1  # Still available for review
        # New riders must accept the new version to join.
        assert client.post(join, json={"terms_version": v1}, headers=newcomer_h).status_code == 400
        assert client.post(join, json={"terms_version": v1 + 1}, headers=newcomer_h).status_code == 200

    # The rider already in the campaign keeps uploading photos and can still see what they accepted.
    up = client.post(f"{API}/riders/me/campaigns/{cid}/activity", files={"photo": ("p.jpg", b"morning", "image/jpeg")}, data={"slot": "MORNING"}, headers=headers)
    assert up.status_code == 200, up.text
    card = client.get(f"{API}/riders/me/campaigns/{cid}", headers=headers).json()
    assert card["terms"]["accepted_version"] == v1 and card["terms"]["needs_acceptance"] is True
    assert card["terms"]["accepted_terms"]["body"] == STANDARD_TERMS and card["terms"]["accepted_terms"]["version"] == v1

    # The public page shows only the terms, never who accepted them.
    slug = client.post(f"{API}/campaigns/{cid}/share", json={"enabled": True}, headers=admin).json()["slug"]
    page = client.get(f"{API}/public/campaigns/{slug}")
    assert set(page.json()["terms"]) == {"version", "body", "change_note", "published_at"}
    for private in (rider["full_name"], rider["mobile_number"], newcomer["full_name"], "accepted_at", "application_id"):
        assert private not in page.text


def test_standard_terms_preview_is_admin_only(client, admin):
    from app.services.standard_terms import STANDARD_TERMS

    assert client.get(f"{API}/campaigns/standard-terms", headers=admin).json() == {"body": STANDARD_TERMS}
    _, headers = approved_rider(client, admin, "CYCLE")
    assert client.get(f"{API}/campaigns/standard-terms", headers=headers).status_code == 403


# --------------------------------------------------------------------------- number plate in photos

@pytest.mark.parametrize("category,plate", [("CYCLE", False), ("TWO_WHEELER", False), ("AUTO", True), ("THREE_WHEELER", True)])
def test_auto_and_three_wheeler_photos_must_show_number_plate(client, db_session, admin, category, plate):
    rider, headers = approved_rider(client, admin, category)
    c = campaign(client, admin, start_offset=0)
    with before_start(db_session, c["id"]):
        assert client.post(f"{API}/riders/me/campaigns/{c['id']}/join", json={}, headers=headers).status_code == 200
        app_id = client.get(f"{API}/campaigns/{c['id']}/applications", headers=admin).json()[0]["id"]
        assert client.post(f"{API}/campaigns/{c['id']}/applications/{app_id}/approve", headers=admin).status_code == 200

    # The rider is told, with their registered number.
    card = client.get(f"{API}/riders/me/campaigns/{c['id']}", headers=headers).json()
    assert card["plate_in_photos"] is plate
    assert card["my_vehicle_number"] == rider["vehicle_number"]
    if plate:
        assert rider["vehicle_number"]  # Compulsory for Auto / Three Wheeler

    # The reviewer sees the number to match against the plate in the photo.
    up = client.post(f"{API}/riders/me/campaigns/{c['id']}/activity", files={"photo": ("p.jpg", b"plate-" + category.encode(), "image/jpeg")}, data={"slot": "MORNING"}, headers=headers)
    assert up.status_code == 200, up.text
    photos = client.get(f"{API}/campaigns/{c['id']}/photos", headers=admin).json()
    items = photos if isinstance(photos, list) else photos.get("items", photos.get("photos", []))
    mine = [p for p in items if p["rider"]["id"] == rider["id"]]
    assert mine and mine[0]["rider"]["plate_in_photos"] is plate and mine[0]["rider"]["vehicle_number"] == rider["vehicle_number"]
