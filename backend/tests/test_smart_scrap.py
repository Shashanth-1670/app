"""Smart Scrap MVP - Iteration 2 tests: pricing, referrals, twilio, admin."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get('REACT_APP_BACKEND_URL', 'https://waste-cash.preview.emergentagent.com').rstrip('/')
API = f"{BASE}/api"

# ---- helpers ----
def uniq_mobile():
    return "7" + str(int(time.time() * 1000))[-9:]

def register(role="seller", referral_code=None, name=None, company=None):
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
    if referral_code:
        payload["referral_code"] = referral_code
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    d = r.json()
    return d["token"], d["user"], mob

def login(mobile, password, role):
    r = requests.post(f"{API}/auth/login", json={"mobile": mobile, "password": password, "role": role}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]

def admin_token():
    r = requests.post(f"{API}/admin/verify", json={"passkey": "8762"}, timeout=30)
    assert r.status_code == 200
    return r.json()["token"]

def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---- pricing ----
class TestPricing:
    def test_default_categories_seeded(self):
        r = requests.get(f"{API}/pricing", timeout=30)
        assert r.status_code == 200
        docs = r.json()
        cats = {d["category"]: d["price_per_kg"] for d in docs}
        expected = {"Paper","Metal","Plastic","E-Waste","Cardboard","Glass","Iron","Copper","Aluminium"}
        assert expected.issubset(cats.keys()), f"missing cats. got: {list(cats.keys())}"
        # Metal must remain 45 (default). Paper may have been updated to 15 previously.
        assert cats["Metal"] == 45
        assert cats["Plastic"] == 18
        assert cats["E-Waste"] == 80
        assert cats["Copper"] == 550

    def test_order_uses_current_dynamic_price(self):
        tok, u, mob = register("seller")
        # Set Plastic price to 22
        atok = admin_token()
        r = requests.put(f"{API}/admin/pricing", json={"category": "Plastic", "price_per_kg": 22}, headers=auth(atok), timeout=30)
        assert r.status_code == 200
        # Create order for Plastic 5kg
        r = requests.post(f"{API}/orders", json={"category": "Plastic", "weight_kg": 5}, headers=auth(tok), timeout=30)
        assert r.status_code == 200, r.text
        order1 = r.json()
        assert order1["price_per_kg"] == 22
        assert order1["estimated_amount"] == 110

        # Update price to 25
        r = requests.put(f"{API}/admin/pricing", json={"category": "Plastic", "price_per_kg": 25}, headers=auth(atok), timeout=30)
        assert r.status_code == 200

        # New order gets 25; old still 22
        r = requests.post(f"{API}/orders", json={"category": "Plastic", "weight_kg": 5}, headers=auth(tok), timeout=30)
        order2 = r.json()
        assert order2["price_per_kg"] == 25
        assert order2["estimated_amount"] == 125

        # Verify old order unchanged
        r = requests.get(f"{API}/orders/mine", headers=auth(tok), timeout=30)
        mine = r.json()
        old = next(o for o in mine if o["id"] == order1["id"])
        assert old["price_per_kg"] == 22

        # restore Plastic=18
        requests.put(f"{API}/admin/pricing", json={"category": "Plastic", "price_per_kg": 18}, headers=auth(atok), timeout=30)

    def test_admin_pricing_invalid_price(self):
        atok = admin_token()
        r = requests.put(f"{API}/admin/pricing", json={"category": "Plastic", "price_per_kg": 0}, headers=auth(atok), timeout=30)
        assert r.status_code == 400
        r = requests.put(f"{API}/admin/pricing", json={"category": "Plastic", "price_per_kg": -5}, headers=auth(atok), timeout=30)
        assert r.status_code == 400

    def test_admin_pricing_requires_admin(self):
        # No token
        r = requests.get(f"{API}/admin/pricing", timeout=30)
        assert r.status_code == 401
        r = requests.put(f"{API}/admin/pricing", json={"category": "Plastic", "price_per_kg": 20}, timeout=30)
        assert r.status_code == 401
        # Seller token
        tok, _, _ = register("seller")
        r = requests.get(f"{API}/admin/pricing", headers=auth(tok), timeout=30)
        assert r.status_code == 403
        r = requests.put(f"{API}/admin/pricing", json={"category": "Plastic", "price_per_kg": 20}, headers=auth(tok), timeout=30)
        assert r.status_code == 403


# ---- referrals ----
class TestReferrals:
    def test_register_generates_referral_code(self):
        tok, u, _ = register("seller")
        code = u.get("referral_code")
        assert code and code.startswith("SS") and len(code) == 8
        # hex chars after SS
        assert all(c in "0123456789ABCDEF" for c in code[2:])

    def test_register_invalid_referral_code_no_error(self):
        tok, u, _ = register("seller", referral_code="SSDEADBE")  # unlikely to match
        # referred_by should be null (or missing)
        assert not u.get("referred_by")

    def test_seller_stats_fields(self):
        tok, u, _ = register("seller")
        r = requests.get(f"{API}/seller/stats", headers=auth(tok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["referral_code","referrals_count","referral_earnings","scrap_earnings","total_earnings"]:
            assert k in d, f"missing {k}"
        assert d["total_earnings"] == round(d["scrap_earnings"] + d["referral_earnings"], 2)

    def test_end_to_end_referral_flow(self):
        # Referrer
        r_tok, referrer, r_mob = register("seller")
        code = referrer["referral_code"]
        # Referee
        s_tok, referee, s_mob = register("seller", referral_code=code)
        assert referee.get("referred_by") == referrer["id"]

        # Collector
        c_tok, coll, c_mob = register("collector")

        # Referee creates order
        r = requests.post(f"{API}/orders", json={"category":"Metal","weight_kg":2}, headers=auth(s_tok), timeout=30)
        assert r.status_code == 200
        order_id = r.json()["id"]

        # Collector accepts
        r = requests.post(f"{API}/orders/{order_id}/accept", headers=auth(c_tok), timeout=30)
        assert r.status_code == 200
        # Complete
        r = requests.post(f"{API}/orders/{order_id}/complete", headers=auth(c_tok), timeout=30)
        assert r.status_code == 200

        # Referrer earnings should be 50
        r = requests.get(f"{API}/seller/stats", headers=auth(r_tok), timeout=30)
        stats = r.json()
        assert stats["referral_earnings"] == 50.0, stats
        assert stats["referrals_count"] == 1

        # Admin referrals shows the txn
        atok = admin_token()
        r = requests.get(f"{API}/admin/referrals", headers=auth(atok), timeout=30)
        assert r.status_code == 200
        refs = r.json()
        assert any(x["referrer_id"] == referrer["id"] and x["referee_id"] == referee["id"] and x["bonus"] == 50 for x in refs)

        # Second order by referee should NOT double-credit
        r = requests.post(f"{API}/orders", json={"category":"Paper","weight_kg":1}, headers=auth(s_tok), timeout=30)
        oid2 = r.json()["id"]
        requests.post(f"{API}/orders/{oid2}/accept", headers=auth(c_tok), timeout=30)
        requests.post(f"{API}/orders/{oid2}/complete", headers=auth(c_tok), timeout=30)
        r = requests.get(f"{API}/seller/stats", headers=auth(r_tok), timeout=30)
        assert r.json()["referral_earnings"] == 50.0  # unchanged


# ---- Twilio ----
class TestTwilio:
    def test_twilio_status_unconfigured(self):
        tok, _, _ = register("seller")
        r = requests.get(f"{API}/twilio/status", headers=auth(tok), timeout=30)
        assert r.status_code == 200
        assert r.json() == {"configured": False}

    def test_call_returns_503_when_unconfigured(self):
        # Setup: seller order, collector accepts
        s_tok, s, _ = register("seller")
        c_tok, c, _ = register("collector")
        r = requests.post(f"{API}/orders", json={"category":"Paper","weight_kg":1}, headers=auth(s_tok), timeout=30)
        oid = r.json()["id"]
        requests.post(f"{API}/orders/{oid}/accept", headers=auth(c_tok), timeout=30)
        r = requests.post(f"{API}/orders/{oid}/call", headers=auth(c_tok), timeout=30)
        assert r.status_code == 503
        assert "Twilio" in r.json().get("detail", "")

    def test_call_non_participant_403(self):
        s_tok, s, _ = register("seller")
        c_tok, c, _ = register("collector")
        c2_tok, _, _ = register("collector")
        r = requests.post(f"{API}/orders", json={"category":"Paper","weight_kg":1}, headers=auth(s_tok), timeout=30)
        oid = r.json()["id"]
        requests.post(f"{API}/orders/{oid}/accept", headers=auth(c_tok), timeout=30)
        # c2 didn't accept
        r = requests.post(f"{API}/orders/{oid}/call", headers=auth(c2_tok), timeout=30)
        assert r.status_code == 403

    def test_seller_call_before_accept_400(self):
        s_tok, s, _ = register("seller")
        r = requests.post(f"{API}/orders", json={"category":"Paper","weight_kg":1}, headers=auth(s_tok), timeout=30)
        oid = r.json()["id"]
        r = requests.post(f"{API}/orders/{oid}/call", headers=auth(s_tok), timeout=30)
        assert r.status_code == 400


# ---- Feed & Admin summary ----
class TestFeedAndSummary:
    def test_feed_masks_mobile(self):
        s_tok, s, s_mob = register("seller")
        c_tok, c, _ = register("collector")
        r = requests.post(f"{API}/orders", json={"category":"Paper","weight_kg":1}, headers=auth(s_tok), timeout=30)
        r = requests.get(f"{API}/orders/feed", headers=auth(c_tok), timeout=30)
        assert r.status_code == 200
        feed = r.json()
        # Find our order
        mine = [o for o in feed if o.get("seller_id") == s["id"]]
        assert mine, "seller's pending order missing in feed"
        o = mine[0]
        assert "seller_mobile" not in o, "raw seller_mobile leaked"
        assert o.get("seller_mobile_masked", "").startswith("91 XXXXXX")
        assert o["seller_mobile_masked"].endswith(s_mob[-2:])

    def test_admin_summary_has_twilio_flag(self):
        atok = admin_token()
        r = requests.get(f"{API}/admin/summary", headers=auth(atok), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "twilio_configured" in d
        assert d["twilio_configured"] is False
