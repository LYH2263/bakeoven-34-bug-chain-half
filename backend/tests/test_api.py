"""End-to-end API tests for chain-group scheduling rules.

Runs entirely on in-memory SQLite with get_db overridden; the FastAPI
lifespan (Postgres-specific ensure_columns/seed) is never entered because
TestClient is used without a ``with`` block.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.models import Oven, Product

BASE = "/api"


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = TestSession()
    product = Product(name="测试面包", ferment_min=20, bake_min=40)  # total 60
    oven1 = Oven(label="炉1", capacity_note="")
    oven2 = Oven(label="炉2", capacity_note="")
    db.add_all([product, oven1, oven2])
    db.commit()

    def override_get_db():
        try:
            yield TestSession()
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    db.close()
    engine.dispose()


def _post(client, **kw):
    body = {"product_id": 1, "oven_id": 1, "start_min": 0}
    body.update(kw)
    return client.post(BASE + "/batches", json=body)


def _codes(client):
    return {b["code"] for b in client.get(BASE + "/batches").json()}


def _gantt_codes(client):
    return {b["code"] for b in client.get(BASE + "/gantt").json()}


# ---------- ungrouped single-batch collision ----------

def test_single_batch_collision_rejected_with_code(client):
    r = _post(client, code="A", start_min=0)
    assert r.status_code == 200
    # half-open touch (ends 60, next starts 60) is fine
    r = _post(client, code="B", start_min=60)
    assert r.status_code == 200
    # one-minute overlap is rejected
    r = _post(client, code="C", oven_id=1, start_min=119)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "撞炉" in detail and "B" in detail
    assert "C" not in _codes(client)


def test_single_batch_on_other_oven_ok(client):
    assert _post(client, code="A", start_min=0).status_code == 200
    assert _post(client, code="X", oven_id=2, start_min=0).status_code == 200


# ---------- chain groups: back-to-back / gap limit ----------

def test_tight_chain_gap_zero_ok(client):
    assert _post(client, code="A", start_min=0, chain_group="G0", chain_max_gap_min=0).status_code == 200
    assert _post(client, code="B", start_min=60, chain_group="G0", chain_max_gap_min=0).status_code == 200


def test_gap_zero_one_minute_late_whole_group_rejected(client):
    assert _post(client, code="A", start_min=0, chain_group="G0", chain_max_gap_min=0).status_code == 200
    r = _post(client, code="B", start_min=61, chain_group="G0", chain_max_gap_min=0)
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "空档超限" in detail and "A" in detail and "B" in detail
    # nothing half-persisted: batch absent, gantt clean, conflict logged
    assert "B" not in _codes(client)
    assert "B" not in _gantt_codes(client)
    conflicts = client.get(BASE + "/conflicts").json()
    assert any("空档超限" in c["detail"] for c in conflicts)


def test_gap_over_limit_rejected(client):
    assert _post(client, code="A", start_min=0, chain_group="G1", chain_max_gap_min=15).status_code == 200
    r = _post(client, code="B", start_min=80, chain_group="G1")  # gap 20 > 15
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "空档超限" in detail and "20" in detail and "15" in detail
    assert "B" not in _codes(client)


def test_gap_at_limit_and_chain_not_treated_as_collision(client):
    assert _post(client, code="A", start_min=0, chain_group="G1", chain_max_gap_min=15).status_code == 200
    # gap exactly 15: valid chain, and not a same-oven collision
    r = _post(client, code="B", start_min=75, chain_group="G1")
    assert r.status_code == 200


# ---------- cross oven ----------

def test_cross_oven_rejected_and_no_half_group_on_gantt(client):
    assert _post(client, code="A", oven_id=1, start_min=0, chain_group="G1", chain_max_gap_min=0).status_code == 200
    r = _post(client, code="B", oven_id=2, start_min=60, chain_group="G1")
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "跨炉" in detail and "炉1" in detail and "炉2" in detail
    assert "B" not in _codes(client)
    gantt = client.get(BASE + "/gantt").json()
    b_blocks = [b for b in gantt if b["code"] == "B"]
    assert b_blocks == []


# ---------- PATCH ----------

def _make_two_group_batches(client, gap=0, start_b=60, oven_b=1):
    _post(client, code="A", oven_id=1, start_min=0, chain_group="G1", chain_max_gap_min=gap)
    _post(client, code="B", oven_id=oven_b, start_min=start_b, chain_group="G1")
    _post(client, code="C", oven_id=2, start_min=0)  # ungrouped


def _batch_id(client, code):
    return next(b["id"] for b in client.get(BASE + "/batches").json() if b["code"] == code)


def test_patch_assign_to_cross_oven_group_rejected(client):
    _make_two_group_batches(client)
    cid = _batch_id(client, "C")
    r = client.patch(BASE + f"/batches/{cid}", json={"chain_group": "G1", "chain_max_gap_min": 0})
    assert r.status_code == 409
    assert "跨炉" in r.json()["detail"]
    # association untouched
    assert client.get(BASE + "/batches").json()  # sanity
    fresh = next(b for b in client.get(BASE + "/batches").json() if b["code"] == "C")
    assert fresh["chain_group"] is None


def test_patch_tighten_gap_rejected_and_gap_unchanged(client):
    _make_two_group_batches(client, gap=20, start_b=80)  # gap exactly 20
    aid = _batch_id(client, "A")
    r = client.patch(BASE + f"/batches/{aid}", json={"chain_group": "G1", "chain_max_gap_min": 10})
    assert r.status_code == 409
    assert "空档超限" in r.json()["detail"]
    group = next(g for g in client.get(BASE + "/chain-groups").json() if g["name"] == "G1")
    assert group["max_gap_min"] == 20


def test_patch_leave_group_making_remainder_invalid_rejected(client):
    # A@0, B@60, C@130 in G1 gap 60 (gaps 0,70 bridged by B); removing B leaves A->C gap 70 > 60
    _post(client, code="A", start_min=0, chain_group="G1", chain_max_gap_min=60)
    _post(client, code="B", start_min=60, chain_group="G1")
    _post(client, code="C", start_min=130, chain_group="G1")  # A.end 60 -> gap 70 > 60 once B leaves
    bid = _batch_id(client, "B")
    r = client.patch(BASE + f"/batches/{bid}", json={"chain_group": None})
    assert r.status_code == 409
    fresh = next(b for b in client.get(BASE + "/batches").json() if b["code"] == "B")
    assert fresh["chain_group"] == "G1"


def test_patch_leave_group_valid_and_empty_group_deleted(client):
    _make_two_group_batches(client)
    bid = _batch_id(client, "B")
    r = client.patch(BASE + f"/batches/{bid}", json={"chain_group": None})
    assert r.status_code == 200
    # B still collides with nothing: it keeps its slot at 60 on oven 1; group G1 still has A
    groups = {g["name"]: g for g in client.get(BASE + "/chain-groups").json()}
    assert "G1" in groups and groups["G1"]["member_codes"] == ["A"]
    # removing A too dissolves the now-empty group
    aid = _batch_id(client, "A")
    assert client.patch(BASE + f"/batches/{aid}", json={"chain_group": None}).status_code == 200
    assert "G1" not in {g["name"] for g in client.get(BASE + "/chain-groups").json()}


def test_patch_move_between_groups_when_old_group_would_break_rejected(client):
    # G1: A@0, B@60 (gap 0). Removing A leaves a single member, fine — this one succeeds.
    _make_two_group_batches(client)
    aid = _batch_id(client, "A")
    r = client.patch(BASE + f"/batches/{aid}", json={"chain_group": "G2", "chain_max_gap_min": 0})
    assert r.status_code == 200
    assert next(g for g in client.get(BASE + "/chain-groups").json() if g["name"] == "G2")


# ---------- dissolve escape hatch ----------

def test_dissolve_group_splits_members(client):
    _make_two_group_batches(client)
    r = client.post(BASE + "/chain-groups/G1/dissolve")
    assert r.status_code == 200
    body = r.json()
    assert body["dissolved"] == "G1"
    assert set(body["member_codes"]) == {"A", "B"}
    groups = client.get(BASE + "/chain-groups").json()
    assert all(g["name"] != "G1" for g in groups)
    for b in client.get(BASE + "/batches").json():
        if b["code"] in ("A", "B"):
            assert b["chain_group"] is None


def test_dissolve_missing_group_404(client):
    assert client.post(BASE + "/chain-groups/nope/dissolve").status_code == 404


def test_conflict_log_rows_for_chain_violations(client):
    _post(client, code="A", start_min=0, chain_group="G1", chain_max_gap_min=0)
    assert _post(client, code="B", oven_id=2, start_min=60, chain_group="G1").status_code == 409
    rows = client.get(BASE + "/conflicts").json()
    assert any(c["batch_code"] == "B" and "跨炉" in c["detail"] for c in rows)
