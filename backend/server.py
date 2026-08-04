from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, Literal
import uuid
import bcrypt
import jwt
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
    """Convert Indian mobile to E.164 format."""
    m = str(mobile).strip().replace(" ", "").replace("-", "")
    if m.startswith("+"):
        return m
    if m.startswith("91") and len(m) > 10:
        return "+" + m
    return "+91" + m


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
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
    """Delete pending orders older than 24h. Real-time cleanup."""
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


# ---------------- Twilio Helpers ----------------
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
    """Send SMS; log and swallow errors so it never blocks main flow."""
    tw = get_twilio_client()
    if not tw:
        logger.info(f"[SMS SKIPPED - no Twilio creds] to={to_mobile} body={body[:80]}")
        return
    try:
        tw.messages.create(from_=TWILIO_NUMBER, to=to_e164(to_mobile), body=body)
        logger.info(f"[SMS SENT] to={to_mobile}")
    except Exception as e:
        logger.error(f"[SMS FAIL] to={to_mobile} err={e}")


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
        "online": False,
        "password_hash": pw_hash,
        "created_at": now_iso(),
        "referral_code": generate_referral_code(),
        "referred_by": referrer_id,
        "referral_earnings": 0.0,
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


# ---------------- Pricing ----------------
@api_router.get("/pricing")
async def get_pricing():
    await ensure_pricing_seeded()
    docs = await db.pricing.find({}, {"_id": 0}).to_list(100)
    return docs


# ---------------- Seller Orders ----------------
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
    }
    await db.orders.insert_one(order)
    return {k: v for k, v in order.items() if k != "_id"}


@api_router.get("/orders/mine")
async def my_orders(user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Seller only")
    docs = await db.orders.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        if d.get("collector_mobile"):
            d["collector_mobile"] = mask_mobile(d["collector_mobile"])
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
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "referral_earnings": 1, "referral_code": 1})
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
    # Only pending, real-time orders — not yet claimed and not rejected by this collector
    docs = await db.orders.find(
        {"status": "pending", "rejected_by": {"$ne": user["id"]}},
        {"_id": 0, "seller_mobile": 0},  # never leak real mobile
    ).sort("created_at", -1).to_list(200)
    for d in docs:
        d["seller_mobile_masked"] = mask_mobile("XXXXXXXXXX")  # generic mask, no real number leak
        # For UI: still expose last-2 mask
        real = await db.orders.find_one({"id": d["id"]}, {"_id": 0, "seller_mobile": 1})
        if real and real.get("seller_mobile"):
            d["seller_mobile_masked"] = mask_mobile(real["seller_mobile"])
    return docs


@api_router.get("/orders/accepted")
async def accepted_orders(user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    docs = await db.orders.find(
        {"collector_id": user["id"], "status": "accepted"},
        {"_id": 0, "seller_mobile": 0},
    ).sort("accepted_at", -1).to_list(200)
    for d in docs:
        real = await db.orders.find_one({"id": d["id"]}, {"_id": 0, "seller_mobile": 1})
        d["seller_mobile_masked"] = mask_mobile((real or {}).get("seller_mobile", ""))
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
    # SMS seller
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if order:
        send_sms_safe(
            order["seller_mobile"],
            f"Smart Scrap: {user.get('company_name') or user['name']} accepted your {order['category']} pickup. Est ₹{order['estimated_amount']}. They will contact you shortly."
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

    # Referral bonus: first-completed order by the seller triggers ₹50 credit to referrer
    completed_count = await db.orders.count_documents({"seller_id": order["seller_id"], "status": "completed"})
    seller = await db.users.find_one({"id": order["seller_id"]}, {"_id": 0})
    if completed_count == 1 and seller and seller.get("referred_by"):
        await db.users.update_one(
            {"id": seller["referred_by"]},
            {"$inc": {"referral_earnings": REFERRAL_BONUS}},
        )
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
            send_sms_safe(referrer["mobile"], f"Smart Scrap: You earned ₹{int(REFERRAL_BONUS)} — {seller['name']} just completed their first pickup!")

    # SMS to seller
    send_sms_safe(
        order["seller_mobile"],
        f"Smart Scrap: Pickup complete! ₹{order['estimated_amount']} for {order['weight_kg']}kg of {order['category']}. Thanks for going green!"
    )
    return {"ok": True}


@api_router.get("/collector/stats")
async def collector_stats(user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    docs = await db.orders.find({"collector_id": user["id"], "status": "completed"}, {"_id": 0}).to_list(1000)
    total_pickups = len(docs)
    total_weight = sum(d["weight_kg"] for d in docs)
    total_profit = sum(d.get("estimated_amount", 0) * 0.25 for d in docs)
    return {
        "total_pickups": total_pickups,
        "total_weight_kg": round(total_weight, 2),
        "total_profit": round(total_profit, 2),
    }


# ---------------- Twilio Masked Calling ----------------
@api_router.post("/orders/{order_id}/call")
async def masked_call(order_id: str, user=Depends(get_current_user)):
    """Initiate a Twilio proxy call. Collector -> Twilio number -> Seller. Neither sees the other's real number."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Determine caller (the one requesting) and callee
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
        raise HTTPException(
            status_code=503,
            detail="Masked calling requires Twilio credentials. Ask admin to configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER."
        )

    tw = get_twilio_client()
    if not tw:
        raise HTTPException(status_code=503, detail="Twilio client unavailable")

    # Inline TwiML: Twilio calls the caller (collector/seller), then dials callee via same Twilio number
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Connecting your Smart Scrap call. Please hold.</Say><Dial callerId="{TWILIO_NUMBER}">{to_e164(callee_number)}</Dial></Response>'
    try:
        call = tw.calls.create(
            to=to_e164(caller_number),
            from_=TWILIO_NUMBER,
            twiml=twiml,
            timeout=25,
        )
        await db.call_logs.insert_one({
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "caller_id": user["id"],
            "call_sid": call.sid,
            "created_at": now_iso(),
        })
        return {"ok": True, "call_sid": call.sid, "message": "Your phone will ring shortly. Answer to connect."}
    except Exception as e:
        logger.error(f"Twilio call error: {e}")
        raise HTTPException(status_code=502, detail=f"Twilio call failed: {str(e)[:200]}")


@api_router.get("/twilio/status")
async def twilio_status(user=Depends(get_current_user)):
    return {"configured": twilio_configured()}


# ---------------- Public metrics ----------------
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
    return {
        "total_users": total_users,
        "total_sellers": total_sellers,
        "total_collectors": total_collectors,
        "active_collectors": active_collectors,
        "total_orders": total_orders,
        "pending_orders": pending,
        "completed_orders": completed,
        "twilio_configured": twilio_configured(),
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


@api_router.get("/")
async def root():
    return {"service": "Smart Scrap API", "status": "ok", "twilio": twilio_configured()}


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
    # Backfill referral_code for existing users
    async for u in db.users.find({"referral_code": {"$exists": False}}, {"_id": 0, "id": 1}):
        await db.users.update_one({"id": u["id"]}, {"$set": {
            "referral_code": generate_referral_code(),
            "referred_by": None,
            "referral_earnings": 0.0,
        }})


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
