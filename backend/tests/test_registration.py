"""Rider registration: vehicle number validation and normalisation."""
import pytest
from tests.conftest import SELFIE

from app.schemas.all_schemas import normalize_vehicle_number

API = "/api/v1"


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("HR26DK8337", "HR26DK8337"),
        ("hr 26 dk 8337", "HR26DK8337"),
        ("DL-3C-1234", "DL3C1234"),
        ("MH12AB1234", "MH12AB1234"),
        ("KA01A1234", "KA01A1234"),
        ("22 BH 1234 AA", "22BH1234AA"),
        ("", None),
    ],
)
def test_valid_vehicle_numbers(raw, expected):
    assert normalize_vehicle_number(raw) == expected


@pytest.mark.parametrize("raw", ["1234", "HR26", "ABCDEFG", "HR26DK83", "HR26DKA83371", "22BH12AA"])
def test_invalid_vehicle_numbers(raw):
    with pytest.raises(ValueError):
        normalize_vehicle_number(raw)


def test_registration_stores_normalised_vehicle_number(client):
    body = {"selfie": SELFIE, "full_name": "Plate Rider", "mobile_number": "9100000123", "password": "riderPass1", "vehicle_number": "hr 26 dk 8337", "vehicle_category": "TWO_WHEELER"}
    res = client.post(f"{API}/auth/register", json=body)
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    me = client.get(f"{API}/riders/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["vehicle_number"] == "HR26DK8337"

    bad = client.post(f"{API}/auth/register", json={"selfie": SELFIE, "vehicle_category": "CYCLE", **body, "mobile_number": "9100000124", "vehicle_number": "12345"})
    assert bad.status_code == 422
    dup = client.post(f"{API}/auth/register", json={"selfie": SELFIE, "vehicle_category": "CYCLE", **body, "mobile_number": "9100000125", "vehicle_number": "HR-26-DK-8337"})
    assert dup.status_code == 400 and "already registered" in dup.json()["detail"]
