from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel, EmailStr
from typing import Optional, Literal
import uuid
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'smart-scrap-secret-key-change-me')
JWT_ALG = 'HS256'
ADMIN_PASSKEY = "8762"
REFERRAL_BONUS = 50.0

TWILIO_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER', '')

# Emergent-managed Resend email proxy (hardcoded constant per playbook)
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get('EMERGENT_EMAIL_KEY', '')
EMAIL_FROM_NAME = os.environ.get('EMAIL_FROM_NAME', 'Smart Scrap')

DEFAULT_PRICES = {
    "Paper": 12, "Cardboard": 10, "Plastic": 18, "Metal": 45,
    "Iron": 30, "Copper": 550, "Aluminium": 120, "Glass": 5, "E-Waste": 80,
}

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------------- Models ----------------
class UserRegister(BaseModel):
    name: str
    mobile: str
    address: str
    password: str
    role: Literal["seller", "collector"] = "seller"
    company_name: Optional[str] = None
    referral_code: Optional[str] = None
    email: Optional[EmailStr] = None


class UserLogin(BaseModel):
    mobile: str
    password: str
    role: Literal["seller", "collector"] = "seller"


class OrderCreate(BaseModel):
    category: str
    weight_kg: float
    notes: Optional[str] = ""


class AdminVerify(BaseModel):
    passkey: str


class StatusToggle(BaseModel):
    online: bool


class PricingUpdate(BaseModel):
    category: str
    price_per_kg: float


class RatingCreate(BaseModel):
    rating: int  # 1-5
    comment: Optional[str] = ""


class EmailUpdate(BaseModel):
    email: EmailStr


# ---------------- Helpers ----------------
def mask_mobile(m: str) -> str:
    if not m:
        return ""
    m = m.strip()
    if len(m) < 4:
        return "XX XXXXXX XX"
    return f"91 XXXXXX{m[-2:]}"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def to_e164(mobile: str) -> str:
    m = str(mobile).strip().replace(" ", "").replace("-", "")
    if m.startswith("+"):
        return m
    if m.startswith("91") and len(m) > 10:
        return "+" + m
    return "+91" + m


def create_token(user_id: str, role: str) -> str:
    payload = {"sub": user_id, "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def generate_referral_code() -> str:
    return "SS" + secrets.token_hex(3).upper()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def public_user(u):
    return {k: v for k, v in u.items() if k not in ("password_hash", "_id")}


async def purge_stale_orders():
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    await db.orders.delete_many({"status": "pending", "created_at": {"$lt": cutoff}})


async def get_price(category: str) -> float:
    doc = await db.pricing.find_one({"category": category}, {"_id": 0})
    if doc:
        return float(doc["price_per_kg"])
    return float(DEFAULT_PRICES.get(category, 15))


async def ensure_pricing_seeded():
    for cat, price in DEFAULT_PRICES.items():
        await db.pricing.update_one(
            {"category": cat},
            {"$setOnInsert": {"category": cat, "price_per_kg": price, "updated_at": now_iso()}},
            upsert=True,
        )


# ---------------- Twilio ----------------
def twilio_configured() -> bool:
    return bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_NUMBER)


def get_twilio_client():
    if not twilio_configured():
        return None
    try:
        from twilio.rest import Client as TwilioClient
        return TwilioClient(TWILIO_SID, TWILIO_TOKEN)
    except Exception as e:
        logger.error(f"Twilio client init failed: {e}")
        return None


def send_sms_safe(to_mobile: str, body: str):
    tw = get_twilio_client()
    if not tw:
        logger.info(f"[SMS SKIP] to={to_mobile} body={body[:80]}")
        return
    try:
        tw.messages.create(from_=TWILIO_NUMBER, to=to_e164(to_mobile), body=body)
        logger.info(f"[SMS SENT] to={to_mobile}")
    except Exception as e:
        logger.error(f"[SMS FAIL] to={to_mobile} err={e}")


# ---------------- Email (Resend proxy) ----------------
def email_configured() -> bool:
    return bool(EMAIL_KEY)


async def send_email_safe(to: str, subject: str, html: str) -> bool:
    """Send email via Emergent Resend proxy. Returns True on success, False otherwise."""
    if not email_configured():
        logger.info(f"[EMAIL SKIP] to={to} subject={subject[:60]}")
        return False
    payload = {
        "to": [to],
        "subject": subject,
        "html": html,
        "from_name": EMAIL_FROM_NAME,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        r.raise_for_status()
        logger.info(f"[EMAIL SENT] to={to} subject={subject[:40]}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL FAIL] to={to} err={e}")
        return False


def render_weekly_summary_html(user: dict, orders: list, referral_earnings_week: float, referrals_count: int) -> str:
    scrap_total = sum(o.get("estimated_amount", 0) for o in orders)
    weight_total = sum(o.get("weight_kg", 0) for o in orders)
    combined = scrap_total + referral_earnings_week
    rows = "".join([
        f'<tr><td style="padding:10px;border-bottom:1px solid #27272A;">{o["category"]} · {o["weight_kg"]}kg</td>'
        f'<td style="padding:10px;border-bottom:1px solid #27272A;text-align:right;color:#00FF66;font-weight:700;">₹{o["estimated_amount"]}</td></tr>'
        for o in orders
    ]) or f'<tr><td colspan="2" style="padding:14px;color:#71717A;text-align:center;">No pickups completed this week.</td></tr>'
    return f'''<!doctype html><html><body style="margin:0;padding:0;background:#050505;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border:1px solid #27272A;border-radius:16px;">
<tr><td style="padding:32px 32px 16px;">
<div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#00FF66;">Your Weekly Recap</div>
<h1 style="margin:8px 0 4px;font-size:28px;font-weight:900;">Hi {user.get("name", "there")},</h1>
<p style="color:#A1A1AA;margin:0;">Here's what you earned with Smart Scrap this week.</p>
</td></tr>
<tr><td style="padding:0 32px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="background:#111;border:1px solid #27272A;border-radius:12px;padding:16px;text-align:center;width:33%;">
  <div style="color:#71717A;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Scrap</div>
  <div style="font-size:24px;font-weight:900;color:#00FF66;">₹{scrap_total:.0f}</div>
</td><td style="width:8px;"></td>
<td style="background:#111;border:1px solid #27272A;border-radius:12px;padding:16px;text-align:center;width:33%;">
  <div style="color:#71717A;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Referrals</div>
  <div style="font-size:24px;font-weight:900;color:#00FF66;">₹{referral_earnings_week:.0f}</div>
</td><td style="width:8px;"></td>
<td style="background:#00FF66;border-radius:12px;padding:16px;text-align:center;width:33%;">
  <div style="color:#000;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Combined</div>
  <div style="font-size:24px;font-weight:900;color:#000;">₹{combined:.0f}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 32px 24px;">
<div style="font-size:12px;color:#71717A;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">This week's pickups</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #27272A;border-radius:12px;overflow:hidden;">
{rows}
<tr><td style="padding:10px 12px;background:#111;color:#A1A1AA;font-size:13px;">Total weight</td>
<td style="padding:10px 12px;background:#111;text-align:right;font-weight:700;">{weight_total:.1f} kg</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 32px 32px;">
<div style="padding:14px;border:1px solid #00FF66;border-radius:12px;background:rgba(0,255,102,0.05);">
<div style="font-size:12px;color:#00FF66;letter-spacing:2px;text-transform:uppercase;">Refer &amp; earn</div>
<div style="color:#fff;margin-top:4px;">Share your code <b style="color:#00FF66;letter-spacing:2px;">{user.get("referral_code","")}</b> — you earned <b>{referrals_count}</b> referral bonuses this week.</div>
</div>
<p style="color:#52525B;font-size:11px;margin-top:20px;text-align:center;">You received this email because you have weekly summaries enabled at Smart Scrap.</p>
</td></tr>
</table>
</td></tr></table></body></html>'''


async def build_and_send_weekly_summary(user: dict) -> bool:
    if not user.get("email"):
        return False
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    orders = await db.orders.find(
        {"seller_id": user["id"], "status": "completed", "completed_at": {"$gte": week_ago}},
        {"_id": 0},
    ).to_list(200)
    refs_week = await db.referrals.find(
        {"referrer_id": user["id"], "created_at": {"$gte": week_ago}},
        {"_id": 0},
    ).to_list(200)
    ref_earnings_week = sum(r.get("bonus", 0) for r in refs_week)
    html = render_weekly_summary_html(user, orders, ref_earnings_week, len(refs_week))
    ok = await send_email_safe(user["email"], "Your Smart Scrap weekly recap", html)
    if ok:
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_weekly_email": now_iso()}})
    return ok


async def weekly_summary_loop():
    """Hourly loop: on Sunday, send weekly summary to sellers with email who haven't received one in 6 days."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            if now.weekday() == 6 and email_configured():  # Sunday
                cutoff = (now - timedelta(days=6)).isoformat()
                async for u in db.users.find(
                    {"role": "seller", "email": {"$exists": True, "$ne": ""}, "$or": [
                        {"last_weekly_email": {"$exists": False}},
                        {"last_weekly_email": {"$lt": cutoff}},
                    ]},
                    {"_id": 0, "password_hash": 0},
                ):
                    await build_and_send_weekly_summary(u)
        except Exception as e:
            logger.error(f"weekly_summary_loop error: {e}")
        await asyncio.sleep(3600)  # 1h


# ---------------- Rating aggregation ----------------
async def recompute_collector_rating(collector_id: str):
    docs = await db.ratings.find({"collector_id": collector_id}, {"_id": 0, "rating": 1}).to_list(2000)
    count = len(docs)
    avg = round(sum(d["rating"] for d in docs) / count, 2) if count else 0.0
    await db.users.update_one({"id": collector_id}, {"$set": {"avg_rating": avg, "ratings_count": count}})


# ---------------- Auth ----------------
@api_router.post("/auth/register")
async def register(payload: UserRegister):
    existing = await db.users.find_one({"mobile": payload.mobile, "role": payload.role})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists with this mobile and role")

    referrer_id = None
    if payload.referral_code:
        ref = await db.users.find_one({"referral_code": payload.referral_code.strip().upper()}, {"_id": 0, "id": 1})
        if ref:
            referrer_id = ref["id"]

    pw_hash = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    user = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "mobile": payload.mobile,
        "address": payload.address,
        "role": payload.role,
        "company_name": payload.company_name or "",
        "email": payload.email or "",
        "online": False,
        "password_hash": pw_hash,
        "created_at": now_iso(),
        "referral_code": generate_referral_code(),
        "referred_by": referrer_id,
        "referral_earnings": 0.0,
        "avg_rating": 0.0,
        "ratings_count": 0,
    }
    await db.users.insert_one(user)
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": public_user(user)}


@api_router.post("/auth/login")
async def login(payload: UserLogin):
    user = await db.users.find_one({"mobile": payload.mobile, "role": payload.role})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(payload.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["role"])
    return {"token": token, "user": public_user({k: v for k, v in user.items() if k != "_id"})}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api_router.patch("/user/email")
async def update_email(payload: EmailUpdate, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"email": payload.email}})
    return {"ok": True, "email": payload.email}


# ---------------- Pricing ----------------
@api_router.get("/pricing")
async def get_pricing():
    await ensure_pricing_seeded()
    docs = await db.pricing.find({}, {"_id": 0}).to_list(100)
    return docs


# ---------------- Orders ----------------
@api_router.post("/orders")
async def create_order(payload: OrderCreate, user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can create orders")
    rate = await get_price(payload.category)
    order = {
        "id": str(uuid.uuid4()),
        "seller_id": user["id"],
        "seller_name": user["name"],
        "seller_mobile": user["mobile"],
        "seller_address": user["address"],
        "category": payload.category,
        "weight_kg": float(payload.weight_kg),
        "notes": payload.notes,
        "status": "pending",
        "collector_id": None,
        "collector_name": None,
        "collector_mobile": None,
        "rejected_by": [],
        "created_at": now_iso(),
        "accepted_at": None,
        "completed_at": None,
        "price_per_kg": rate,
        "estimated_amount": round(float(payload.weight_kg) * rate, 2),
        "rating": None,
        "rating_comment": "",
    }
    await db.orders.insert_one(order)
    return {k: v for k, v in order.items() if k != "_id"}


@api_router.get("/orders/mine")
async def my_orders(user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Seller only")
    docs = await db.orders.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Attach collector rating + mask collector mobile
    collector_ids = list({d["collector_id"] for d in docs if d.get("collector_id")})
    coll_map = {}
    if collector_ids:
        async for c in db.users.find({"id": {"$in": collector_ids}}, {"_id": 0, "id": 1, "avg_rating": 1, "ratings_count": 1}):
            coll_map[c["id"]] = {"avg_rating": c.get("avg_rating", 0), "ratings_count": c.get("ratings_count", 0)}
    for d in docs:
        if d.get("collector_mobile"):
            d["collector_mobile"] = mask_mobile(d["collector_mobile"])
        cm = coll_map.get(d.get("collector_id"))
        if cm:
            d["collector_avg_rating"] = cm["avg_rating"]
            d["collector_ratings_count"] = cm["ratings_count"]
    return docs


@api_router.get("/seller/stats")
async def seller_stats(user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Seller only")
    docs = await db.orders.find({"seller_id": user["id"], "status": "completed"}, {"_id": 0}).to_list(1000)
    total_weight = sum(d["weight_kg"] for d in docs)
    total_earnings = sum(d.get("estimated_amount", 0) for d in docs)
    total_orders_completed = len(docs)
    all_orders = await db.orders.count_documents({"seller_id": user["id"]})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    ref_earnings = float((fresh or {}).get("referral_earnings", 0) or 0)
    referrals_count = await db.users.count_documents({"referred_by": user["id"]})
    return {
        "total_orders_completed": total_orders_completed,
        "total_orders": all_orders,
        "total_weight_kg": round(total_weight, 2),
        "scrap_earnings": round(total_earnings, 2),
        "referral_earnings": round(ref_earnings, 2),
        "total_earnings": round(total_earnings + ref_earnings, 2),
        "referral_code": (fresh or {}).get("referral_code"),
        "referrals_count": referrals_count,
        "email": (fresh or {}).get("email", ""),
        "last_weekly_email": (fresh or {}).get("last_weekly_email"),
    }


# ---------------- Collector ----------------
@api_router.post("/collector/status")
async def collector_status(payload: StatusToggle, user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    await db.users.update_one({"id": user["id"]}, {"$set": {"online": payload.online}})
    return {"online": payload.online}


@api_router.get("/orders/feed")
async def order_feed(user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    await purge_stale_orders()
    docs = await db.orders.find(
        {"status": "pending", "rejected_by": {"$ne": user["id"]}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)
    for d in docs:
        d["seller_mobile_masked"] = mask_mobile(d.get("seller_mobile", ""))
        d.pop("seller_mobile", None)
    return docs


@api_router.get("/orders/accepted")
async def accepted_orders(user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    docs = await db.orders.find(
        {"collector_id": user["id"], "status": "accepted"},
        {"_id": 0},
    ).sort("accepted_at", -1).to_list(200)
    for d in docs:
        d["seller_mobile_masked"] = mask_mobile(d.get("seller_mobile", ""))
        d.pop("seller_mobile", None)
    return docs


@api_router.post("/orders/{order_id}/accept")
async def accept_order(order_id: str, user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    result = await db.orders.update_one(
        {"id": order_id, "status": "pending"},
        {"$set": {
            "status": "accepted",
            "collector_id": user["id"],
            "collector_name": user.get("company_name") or user["name"],
            "collector_mobile": user["mobile"],
            "accepted_at": now_iso(),
        }},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Order already claimed or unavailable")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if order:
        send_sms_safe(
            order["seller_mobile"],
            f"Smart Scrap: {user.get('company_name') or user['name']} accepted your {order['category']} pickup. Est ₹{order['estimated_amount']}."
        )
    return {"ok": True}


@api_router.post("/orders/{order_id}/reject")
async def reject_order(order_id: str, user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    await db.orders.update_one({"id": order_id}, {"$addToSet": {"rejected_by": user["id"]}})
    return {"ok": True}


@api_router.post("/orders/{order_id}/complete")
async def complete_order(order_id: str, user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    order = await db.orders.find_one({"id": order_id, "collector_id": user["id"], "status": "accepted"})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found or not accepted by you")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed", "completed_at": now_iso()}})

    completed_count = await db.orders.count_documents({"seller_id": order["seller_id"], "status": "completed"})
    seller = await db.users.find_one({"id": order["seller_id"]}, {"_id": 0})
    if completed_count == 1 and seller and seller.get("referred_by"):
        await db.users.update_one({"id": seller["referred_by"]}, {"$inc": {"referral_earnings": REFERRAL_BONUS}})
        await db.referrals.insert_one({
            "id": str(uuid.uuid4()),
            "referrer_id": seller["referred_by"],
            "referee_id": seller["id"],
            "order_id": order["id"],
            "bonus": REFERRAL_BONUS,
            "created_at": now_iso(),
        })
        referrer = await db.users.find_one({"id": seller["referred_by"]}, {"_id": 0, "mobile": 1})
        if referrer:
            send_sms_safe(referrer["mobile"], f"Smart Scrap: You earned ₹{int(REFERRAL_BONUS)} — {seller['name']} completed their first pickup!")

    send_sms_safe(
        order["seller_mobile"],
        f"Smart Scrap: Pickup complete! ₹{order['estimated_amount']} for {order['weight_kg']}kg of {order['category']}."
    )
    return {"ok": True}


@api_router.post("/orders/{order_id}/rate")
async def rate_order(order_id: str, payload: RatingCreate, user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can rate")
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    order = await db.orders.find_one({"id": order_id, "seller_id": user["id"], "status": "completed"})
    if not order:
        raise HTTPException(status_code=404, detail="Completed order not found")
    if order.get("rating"):
        raise HTTPException(status_code=409, detail="Order already rated")
    if not order.get("collector_id"):
        raise HTTPException(status_code=400, detail="No collector on this order")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"rating": payload.rating, "rating_comment": payload.comment or "", "rated_at": now_iso()}},
    )
    await db.ratings.insert_one({
        "id": str(uuid.uuid4()),
        "order_id": order_id,
        "seller_id": user["id"],
        "collector_id": order["collector_id"],
        "rating": payload.rating,
        "comment": payload.comment or "",
        "created_at": now_iso(),
    })
    await recompute_collector_rating(order["collector_id"])
    return {"ok": True}


@api_router.get("/collector/stats")
async def collector_stats(user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    docs = await db.orders.find({"collector_id": user["id"], "status": "completed"}, {"_id": 0}).to_list(1000)
    total_pickups = len(docs)
    total_weight = sum(d["weight_kg"] for d in docs)
    total_profit = sum(d.get("estimated_amount", 0) * 0.25 for d in docs)
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "avg_rating": 1, "ratings_count": 1})
    return {
        "total_pickups": total_pickups,
        "total_weight_kg": round(total_weight, 2),
        "total_profit": round(total_profit, 2),
        "avg_rating": (fresh or {}).get("avg_rating", 0),
        "ratings_count": (fresh or {}).get("ratings_count", 0),
    }


@api_router.get("/collectors/top")
async def top_collectors():
    docs = await db.users.find(
        {"role": "collector", "ratings_count": {"$gte": 2}},
        {"_id": 0, "id": 1, "name": 1, "company_name": 1, "avg_rating": 1, "ratings_count": 1, "address": 1},
    ).sort([("avg_rating", -1), ("ratings_count", -1)]).limit(6).to_list(6)
    return docs


# ---------------- Twilio Masked Calling ----------------
@api_router.post("/orders/{order_id}/call")
async def masked_call(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if user["role"] == "collector":
        if order["collector_id"] and order["collector_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your order")
        caller_number = user["mobile"]
        callee_number = order["seller_mobile"]
    elif user["role"] == "seller":
        if order["seller_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your order")
        if not order.get("collector_mobile"):
            raise HTTPException(status_code=400, detail="No collector assigned yet")
        caller_number = user["mobile"]
        callee_number = order["collector_mobile"]
    else:
        raise HTTPException(status_code=403, detail="Forbidden")

    if not twilio_configured():
        raise HTTPException(status_code=503, detail="Masked calling requires Twilio credentials.")

    tw = get_twilio_client()
    if not tw:
        raise HTTPException(status_code=503, detail="Twilio client unavailable")

    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Connecting your Smart Scrap call. Please hold.</Say><Dial callerId="{TWILIO_NUMBER}">{to_e164(callee_number)}</Dial></Response>'
    try:
        call = tw.calls.create(to=to_e164(caller_number), from_=TWILIO_NUMBER, twiml=twiml, timeout=25)
        await db.call_logs.insert_one({
            "id": str(uuid.uuid4()), "order_id": order_id, "caller_id": user["id"],
            "call_sid": call.sid, "created_at": now_iso(),
        })
        return {"ok": True, "call_sid": call.sid, "message": "Your phone will ring shortly. Answer to connect."}
    except Exception as e:
        logger.error(f"Twilio call error: {e}")
        raise HTTPException(status_code=502, detail=f"Twilio call failed: {str(e)[:200]}")


@api_router.get("/twilio/status")
async def twilio_status(user=Depends(get_current_user)):
    return {"configured": twilio_configured()}


@api_router.get("/email/status")
async def email_status(user=Depends(get_current_user)):
    return {"configured": email_configured()}


@api_router.post("/seller/weekly-summary/send-now")
async def send_weekly_now(user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Seller only")
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    if not fresh or not fresh.get("email"):
        raise HTTPException(status_code=400, detail="Add an email to your profile first")
    if not email_configured():
        raise HTTPException(status_code=503, detail="Email delivery not configured. Ask admin to add EMERGENT_EMAIL_KEY.")
    ok = await build_and_send_weekly_summary(fresh)
    if not ok:
        raise HTTPException(status_code=502, detail="Email delivery failed. Check server logs.")
    return {"ok": True, "message": f"Weekly summary sent to {fresh['email']}."}


# ---------------- Public ----------------
@api_router.get("/public/metrics")
async def public_metrics():
    tot_weight_doc = await db.orders.aggregate([
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "w": {"$sum": "$weight_kg"}}}
    ]).to_list(1)
    total_weight = tot_weight_doc[0]["w"] if tot_weight_doc else 0
    sellers = await db.users.count_documents({"role": "seller"})
    collectors = await db.users.count_documents({"role": "collector"})
    return {
        "tons_recycled": max(1000, int(1000 + total_weight / 1000)),
        "happy_customers": max(100, 100 + sellers),
        "trusted_collectors": max(50, 50 + collectors),
    }


# ---------------- Admin ----------------
@api_router.post("/admin/verify")
async def admin_verify(payload: AdminVerify):
    if payload.passkey != ADMIN_PASSKEY:
        raise HTTPException(status_code=401, detail="Invalid passkey")
    admin_token = jwt.encode(
        {"sub": "admin", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=6)},
        JWT_SECRET, algorithm=JWT_ALG,
    )
    return {"token": admin_token}


async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return True


@api_router.get("/admin/users")
async def admin_users(_=Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(2000)
    return users


@api_router.get("/admin/orders")
async def admin_orders(_=Depends(require_admin)):
    await purge_stale_orders()
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return orders


@api_router.get("/admin/collectors")
async def admin_collectors(_=Depends(require_admin)):
    collectors = await db.users.find({"role": "collector"}, {"_id": 0, "password_hash": 0}).to_list(500)
    return collectors


@api_router.get("/admin/summary")
async def admin_summary(_=Depends(require_admin)):
    total_users = await db.users.count_documents({})
    total_sellers = await db.users.count_documents({"role": "seller"})
    total_collectors = await db.users.count_documents({"role": "collector"})
    active_collectors = await db.users.count_documents({"role": "collector", "online": True})
    total_orders = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"status": "pending"})
    completed = await db.orders.count_documents({"status": "completed"})
    total_ratings = await db.ratings.count_documents({})
    sellers_with_email = await db.users.count_documents({"role": "seller", "email": {"$exists": True, "$ne": ""}})
    return {
        "total_users": total_users,
        "total_sellers": total_sellers,
        "total_collectors": total_collectors,
        "active_collectors": active_collectors,
        "total_orders": total_orders,
        "pending_orders": pending,
        "completed_orders": completed,
        "total_ratings": total_ratings,
        "sellers_with_email": sellers_with_email,
        "twilio_configured": twilio_configured(),
        "email_configured": email_configured(),
    }


@api_router.get("/admin/pricing")
async def admin_pricing(_=Depends(require_admin)):
    await ensure_pricing_seeded()
    docs = await db.pricing.find({}, {"_id": 0}).to_list(100)
    return docs


@api_router.put("/admin/pricing")
async def admin_update_pricing(payload: PricingUpdate, _=Depends(require_admin)):
    if payload.price_per_kg <= 0:
        raise HTTPException(status_code=400, detail="Price must be positive")
    await db.pricing.update_one(
        {"category": payload.category},
        {"$set": {"category": payload.category, "price_per_kg": float(payload.price_per_kg), "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/admin/referrals")
async def admin_referrals(_=Depends(require_admin)):
    refs = await db.referrals.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return refs


@api_router.get("/admin/ratings")
async def admin_ratings(_=Depends(require_admin)):
    rows = await db.ratings.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


# ---------------- Admin CRUD (full control) ----------------
class UserAdminUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    company_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[Literal["seller", "collector"]] = None
    online: Optional[bool] = None


class OrderAdminUpdate(BaseModel):
    category: Optional[str] = None
    weight_kg: Optional[float] = None
    price_per_kg: Optional[float] = None
    status: Optional[Literal["pending", "accepted", "completed"]] = None
    notes: Optional[str] = None


@api_router.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, payload: UserAdminUpdate, _=Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    r = await db.users.update_one({"id": user_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    # Propagate name/mobile/company changes to related orders
    prop = {}
    if "name" in updates: prop["seller_name"] = updates["name"]
    if "mobile" in updates:
        prop["seller_mobile"] = updates["mobile"]
        await db.orders.update_many({"collector_id": user_id}, {"$set": {"collector_mobile": updates["mobile"]}})
    if "company_name" in updates or "name" in updates:
        new_name = updates.get("company_name") or updates.get("name")
        if new_name:
            await db.orders.update_many({"collector_id": user_id}, {"$set": {"collector_name": new_name}})
    if prop:
        await db.orders.update_many({"seller_id": user_id}, {"$set": prop})
    return {"ok": True}


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, _=Depends(require_admin)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    # Cascade
    del_orders = await db.orders.delete_many({"$or": [{"seller_id": user_id}, {"collector_id": user_id}]})
    del_ratings = await db.ratings.delete_many({"$or": [{"seller_id": user_id}, {"collector_id": user_id}]})
    # Roll back referral bonuses that referred this user
    async for r in db.referrals.find({"referee_id": user_id}, {"_id": 0}):
        await db.users.update_one({"id": r["referrer_id"]}, {"$inc": {"referral_earnings": -float(r.get("bonus", 0))}})
    del_refs = await db.referrals.delete_many({"$or": [{"referrer_id": user_id}, {"referee_id": user_id}]})
    await db.call_logs.delete_many({"caller_id": user_id})
    await db.rtc_signals.delete_many({"$or": [{"from_id": user_id}, {"to_id": user_id}]})
    await db.users.update_many({"referred_by": user_id}, {"$set": {"referred_by": None}})
    await db.users.delete_one({"id": user_id})
    # Recompute all collector ratings (in case ratings removed involved others)
    async for c in db.users.find({"role": "collector"}, {"_id": 0, "id": 1}):
        await recompute_collector_rating(c["id"])
    return {"ok": True, "deleted": {"orders": del_orders.deleted_count, "ratings": del_ratings.deleted_count, "referrals": del_refs.deleted_count}}


@api_router.put("/admin/orders/{order_id}")
async def admin_update_order(order_id: str, payload: OrderAdminUpdate, _=Depends(require_admin)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Recompute estimated_amount if pricing-affecting fields change
    new_weight = updates.get("weight_kg", order["weight_kg"])
    new_price = updates.get("price_per_kg", order.get("price_per_kg") or await get_price(updates.get("category", order["category"])))
    updates["weight_kg"] = float(new_weight)
    updates["price_per_kg"] = float(new_price)
    updates["estimated_amount"] = round(float(new_weight) * float(new_price), 2)
    if updates.get("status") == "completed" and not order.get("completed_at"):
        updates["completed_at"] = now_iso()
    if updates.get("status") == "accepted" and not order.get("accepted_at"):
        updates["accepted_at"] = now_iso()
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    return {"ok": True}


@api_router.delete("/admin/orders/{order_id}")
async def admin_delete_order(order_id: str, _=Depends(require_admin)):
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.delete_one({"id": order_id})
    await db.ratings.delete_many({"order_id": order_id})
    await db.call_logs.delete_many({"order_id": order_id})
    await db.rtc_signals.delete_many({"order_id": order_id})
    # Rollback referral bonus if this order triggered one
    ref = await db.referrals.find_one({"order_id": order_id}, {"_id": 0})
    if ref:
        await db.users.update_one({"id": ref["referrer_id"]}, {"$inc": {"referral_earnings": -float(ref.get("bonus", 0))}})
        await db.referrals.delete_one({"id": ref["id"]})
    if o.get("collector_id"):
        await recompute_collector_rating(o["collector_id"])
    return {"ok": True}


@api_router.delete("/admin/ratings/{rating_id}")
async def admin_delete_rating(rating_id: str, _=Depends(require_admin)):
    r = await db.ratings.find_one({"id": rating_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Rating not found")
    await db.ratings.delete_one({"id": rating_id})
    await db.orders.update_one({"id": r["order_id"]}, {"$set": {"rating": None, "rating_comment": ""}})
    await recompute_collector_rating(r["collector_id"])
    return {"ok": True}


@api_router.delete("/admin/referrals/{ref_id}")
async def admin_delete_referral(ref_id: str, _=Depends(require_admin)):
    r = await db.referrals.find_one({"id": ref_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Referral not found")
    await db.users.update_one({"id": r["referrer_id"]}, {"$inc": {"referral_earnings": -float(r.get("bonus", 0))}})
    await db.referrals.delete_one({"id": ref_id})
    return {"ok": True}


@api_router.delete("/admin/pricing/{category}")
async def admin_delete_pricing(category: str, _=Depends(require_admin)):
    r = await db.pricing.delete_one({"category": category})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"ok": True}


# ---------------- WebRTC Signaling (real browser-to-browser voice) ----------------
class RTCSignal(BaseModel):
    to_id: str
    order_id: Optional[str] = None
    type: Literal["call", "answer", "ice", "hangup", "reject", "busy"]
    payload: Optional[dict] = None


@api_router.post("/rtc/call/{order_id}")
async def rtc_start_call(order_id: str, user=Depends(get_current_user)):
    """Initiate a WebRTC call for a real order. Determines the other party from the order."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "collector":
        if order.get("collector_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Not your order")
        to_id = order["seller_id"]
    elif user["role"] == "seller":
        if order["seller_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your order")
        if not order.get("collector_id"):
            raise HTTPException(status_code=400, detail="No collector assigned yet")
        to_id = order["collector_id"]
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    # Ensure callee exists and is not the same
    if to_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot call yourself")
    sig = {
        "id": str(uuid.uuid4()),
        "from_id": user["id"],
        "from_name": user.get("company_name") or user["name"],
        "to_id": to_id,
        "order_id": order_id,
        "type": "call",
        "payload": {},
        "created_at": now_iso(),
    }
    await db.rtc_signals.insert_one(sig)
    return {"ok": True, "call_id": sig["id"], "to_id": to_id}


@api_router.post("/rtc/signal")
async def rtc_send_signal(payload: RTCSignal, user=Depends(get_current_user)):
    sig = {
        "id": str(uuid.uuid4()),
        "from_id": user["id"],
        "from_name": user.get("company_name") or user["name"],
        "to_id": payload.to_id,
        "order_id": payload.order_id,
        "type": payload.type,
        "payload": payload.payload or {},
        "created_at": now_iso(),
    }
    await db.rtc_signals.insert_one(sig)
    return {"ok": True}


@api_router.get("/rtc/inbox")
async def rtc_inbox(user=Depends(get_current_user)):
    """Fetch and CONSUME all pending signals for this user (delete after read)."""
    cursor = db.rtc_signals.find({"to_id": user["id"]}, {"_id": 0}).sort("created_at", 1)
    signals = await cursor.to_list(200)
    if signals:
        ids = [s["id"] for s in signals]
        await db.rtc_signals.delete_many({"id": {"$in": ids}})
    return signals


@app.on_event("startup")
async def ensure_rtc_ttl():
    # Auto-clean signals older than 2 minutes
    try:
        await db.rtc_signals.create_index("created_at", expireAfterSeconds=120)
    except Exception:
        pass


@api_router.post("/admin/weekly-summary/broadcast")
async def broadcast_weekly(_=Depends(require_admin)):
    """Manually trigger weekly summary send to all sellers with email."""
    if not email_configured():
        raise HTTPException(status_code=503, detail="Email delivery not configured")
    sent, failed = 0, 0
    async for u in db.users.find({"role": "seller", "email": {"$exists": True, "$ne": ""}}, {"_id": 0, "password_hash": 0}):
        ok = await build_and_send_weekly_summary(u)
        if ok: sent += 1
        else: failed += 1
    return {"sent": sent, "failed": failed}


@api_router.get("/")
async def root():
    return {"service": "Smart Scrap API", "status": "ok", "twilio": twilio_configured(), "email": email_configured()}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await ensure_pricing_seeded()
    async for u in db.users.find({"referral_code": {"$exists": False}}, {"_id": 0, "id": 1}):
        await db.users.update_one({"id": u["id"]}, {"$set": {
            "referral_code": generate_referral_code(),
            "referred_by": None,
            "referral_earnings": 0.0,
        }})
    async for u in db.users.find({"role": "collector", "avg_rating": {"$exists": False}}, {"_id": 0, "id": 1}):
        await db.users.update_one({"id": u["id"]}, {"$set": {"avg_rating": 0.0, "ratings_count": 0}})
    asyncio.create_task(weekly_summary_loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
