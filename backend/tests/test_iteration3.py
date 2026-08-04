"""Smart Scrap Iteration 3 tests: Ratings + Weekly Summary Email."""
import os
import time
import pytest
import requests

BASE = (os.environ.get('REACT_APP_BACKEND_URL') or 'https://waste-cash.preview.emergentagent.com').rstrip('/')
API = f"{BASE}/api"


# ---- helpers ----
def uniq_mobile():
    return "7" + str(int(time.time() * 1000000))[-9:]

def register(role="seller", name=None, company=None, email=None):
    mob = uniq_mobile()
    payload = {
        "name": name or f"TEST_{role}_{mob[-4:]}",
        "mobile": mob,
        "address": "TEST addr",
        "password": "pass123",
        "role": role,
    }
    if role == "collector":
        payload["company_name"] = company or f"TEST_Co_{mob[-4:]}"
    if email:
        payload["email"] = email
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    d = r.json()
    return d["token"], d["user"], mob

def admin_token():
    r = requests.post(f"{API}/admin/verify", json={"passkey": "8762"}, timeout=30)
    assert r.status_code == 200
    return r.json()["token"]

def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def create_completed_order(s_tok, c_tok, category="Paper", weight=2):
    r = requests.post(f"{API}/orders", json={"category": category, "weight_kg": weight}, headers=auth(s_tok), timeout=30)
    assert r.status_code == 200, r.text
    oid = r.json()["id"]
    r = requests.post(f"{API}/orders/{oid}/accept", headers=auth(c_tok), timeout=30)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/orders/{oid}/complete", headers=auth(c_tok), timeout=30)
    assert r.status_code == 200, r.text
    return oid


# ---- Ratings ----
class TestRatings:
    def test_rate_success_updates_collector(self):
        s_tok, s, _ = register("seller")
        c_tok, c, _ = register("collector")
        oid = create_completed_order(s_tok, c_tok, "Metal", 3)
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 5, "comment": "Great!"}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 200, r.text
        # verify collector avg + count
        atok = admin_token()
        cols = requests.get(f"{API}/admin/collectors", headers=auth(atok), timeout=30).json()
        me = next(x for x in cols if x["id"] == c["id"])
        assert me["avg_rating"] == 5.0
        assert me["ratings_count"] == 1
        # order rating set
        mine = requests.get(f"{API}/orders/mine", headers=auth(s_tok), timeout=30).json()
        o = next(x for x in mine if x["id"] == oid)
        assert o["rating"] == 5
        assert o.get("collector_avg_rating") == 5.0
        assert o.get("collector_ratings_count") == 1

    def test_rate_invalid_range(self):
        s_tok, _, _ = register("seller")
        c_tok, _, _ = register("collector")
        oid = create_completed_order(s_tok, c_tok)
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 0}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 400
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 6}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 400

    def test_rate_already_rated_409(self):
        s_tok, _, _ = register("seller")
        c_tok, _, _ = register("collector")
        oid = create_completed_order(s_tok, c_tok)
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 4}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 200
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 3}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 409

    def test_rate_pending_order_404(self):
        s_tok, _, _ = register("seller")
        c_tok, _, _ = register("collector")
        r = requests.post(f"{API}/orders", json={"category": "Paper", "weight_kg": 1}, headers=auth(s_tok), timeout=30)
        oid = r.json()["id"]
        # pending
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 5}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 404
        # accepted (not completed)
        requests.post(f"{API}/orders/{oid}/accept", headers=auth(c_tok), timeout=30)
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 5}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 404

    def test_rate_collector_forbidden(self):
        s_tok, _, _ = register("seller")
        c_tok, _, _ = register("collector")
        oid = create_completed_order(s_tok, c_tok)
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 5}, headers=auth(c_tok), timeout=30)
        assert r.status_code == 403

    def test_rate_non_owner_seller_404(self):
        s_tok, _, _ = register("seller")
        c_tok, _, _ = register("collector")
        s2_tok, _, _ = register("seller")
        oid = create_completed_order(s_tok, c_tok)
        r = requests.post(f"{API}/orders/{oid}/rate", json={"rating": 5}, headers=auth(s2_tok), timeout=30)
        assert r.status_code == 404

    def test_top_collectors_public(self):
        # create some ratings
        s_tok, _, _ = register("seller")
        c_tok, c, _ = register("collector")
        oid = create_completed_order(s_tok, c_tok, "Paper", 1)
        requests.post(f"{API}/orders/{oid}/rate", json={"rating": 5}, headers=auth(s_tok), timeout=30)
        r = requests.get(f"{API}/collectors/top", timeout=30)  # no auth
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) <= 6
        # sorted desc
        ratings = [d["avg_rating"] for d in docs]
        assert ratings == sorted(ratings, reverse=True)
        assert all(d["ratings_count"] >= 1 for d in docs)
        # each has expected fields; no _id
        for d in docs:
            assert "_id" not in d
            assert "id" in d and "avg_rating" in d and "ratings_count" in d

    def test_collector_stats_has_rating(self):
        c_tok, _, _ = register("collector")
        r = requests.get(f"{API}/collector/stats", headers=auth(c_tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "avg_rating" in d
        assert "ratings_count" in d


class TestAdminRatings:
    def test_admin_ratings_unauth(self):
        r = requests.get(f"{API}/admin/ratings", timeout=30)
        assert r.status_code == 401
        s_tok, _, _ = register("seller")
        r = requests.get(f"{API}/admin/ratings", headers=auth(s_tok), timeout=30)
        assert r.status_code == 403

    def test_admin_ratings_list(self):
        # seed a rating
        s_tok, _, _ = register("seller")
        c_tok, _, _ = register("collector")
        oid = create_completed_order(s_tok, c_tok)
        requests.post(f"{API}/orders/{oid}/rate", json={"rating": 4, "comment": "ok"}, headers=auth(s_tok), timeout=30)
        atok = admin_token()
        r = requests.get(f"{API}/admin/ratings", headers=auth(atok), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert any(x["order_id"] == oid and x["rating"] == 4 for x in rows)

    def test_admin_summary_has_new_fields(self):
        atok = admin_token()
        r = requests.get(f"{API}/admin/summary", headers=auth(atok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_ratings", "sellers_with_email", "twilio_configured", "email_configured"]:
            assert k in d, f"missing {k}"
        assert d["email_configured"] is False
        assert d["twilio_configured"] is False


class TestEmailAndWeekly:
    def test_register_with_email(self):
        email = f"test{int(time.time()*1000)}@example.com"
        tok, u, _ = register("seller", email=email)
        r = requests.get(f"{API}/auth/me", headers=auth(tok), timeout=30)
        assert r.status_code == 200
        assert r.json().get("email") == email

    def test_patch_user_email(self):
        tok, _, _ = register("seller")
        new_email = f"upd{int(time.time()*1000)}@example.com"
        r = requests.patch(f"{API}/user/email", json={"email": new_email}, headers=auth(tok), timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == new_email
        r = requests.get(f"{API}/auth/me", headers=auth(tok), timeout=30)
        assert r.json()["email"] == new_email

    def test_email_status_unconfigured(self):
        tok, _, _ = register("seller")
        r = requests.get(f"{API}/email/status", headers=auth(tok), timeout=30)
        assert r.status_code == 200
        assert r.json() == {"configured": False}

    def test_send_now_no_email_400(self):
        tok, _, _ = register("seller")  # no email set
        r = requests.post(f"{API}/seller/weekly-summary/send-now", headers=auth(tok), timeout=30)
        assert r.status_code == 400

    def test_send_now_with_email_503(self):
        email = f"has{int(time.time()*1000)}@example.com"
        tok, _, _ = register("seller", email=email)
        r = requests.post(f"{API}/seller/weekly-summary/send-now", headers=auth(tok), timeout=30)
        assert r.status_code == 503

    def test_admin_broadcast_503(self):
        atok = admin_token()
        r = requests.post(f"{API}/admin/weekly-summary/broadcast", headers=auth(atok), timeout=30)
        assert r.status_code == 503
