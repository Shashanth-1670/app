from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
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

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ---------------- Models ----------------
class UserRegister(BaseModel):
    name: str
    mobile: str
    address: str
    password: str
    role: Literal["seller", "collector"] = "seller"
    company_name: Optional[str] = None


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


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


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
    """Delete orders that are pending for more than 24h."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    await db.orders.delete_many({"status": "pending", "created_at": {"$lt": cutoff}})


# ---------------- Auth ----------------
@api_router.post("/auth/register")
async def register(payload: UserRegister):
    existing = await db.users.find_one({"mobile": payload.mobile, "role": payload.role})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists with this mobile and role")
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


# ---------------- Seller Orders ----------------
@api_router.post("/orders")
async def create_order(payload: OrderCreate, user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Only sellers can create orders")
    order = {
        "id": str(uuid.uuid4()),
        "seller_id": user["id"],
        "seller_name": user["name"],
        "seller_mobile": user["mobile"],
        "seller_address": user["address"],
        "category": payload.category,
        "weight_kg": float(payload.weight_kg),
        "notes": payload.notes,
        "status": "pending",  # pending -> accepted -> completed | expired
        "collector_id": None,
        "collector_name": None,
        "rejected_by": [],
        "created_at": now_iso(),
        "accepted_at": None,
        "completed_at": None,
        "estimated_amount": round(float(payload.weight_kg) * price_per_kg(payload.category), 2),
    }
    await db.orders.insert_one(order)
    return {k: v for k, v in order.items() if k != "_id"}


def price_per_kg(category: str) -> float:
    prices = {
        "Paper": 12, "Metal": 45, "Plastic": 18, "E-Waste": 80,
        "Cardboard": 10, "Glass": 5, "Iron": 30, "Copper": 550, "Aluminium": 120,
    }
    return prices.get(category, 15)


@api_router.get("/orders/mine")
async def my_orders(user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Seller only")
    docs = await db.orders.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@api_router.get("/seller/stats")
async def seller_stats(user=Depends(get_current_user)):
    if user["role"] != "seller":
        raise HTTPException(status_code=403, detail="Seller only")
    docs = await db.orders.find({"seller_id": user["id"], "status": "completed"}, {"_id": 0}).to_list(1000)
    total_weight = sum(d["weight_kg"] for d in docs)
    total_earnings = sum(d.get("estimated_amount", 0) for d in docs)
    total_orders = len(docs)
    all_orders = await db.orders.count_documents({"seller_id": user["id"]})
    return {
        "total_orders_completed": total_orders,
        "total_orders": all_orders,
        "total_weight_kg": round(total_weight, 2),
        "total_earnings": round(total_earnings, 2),
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
    # Mask seller mobile
    for d in docs:
        d["seller_mobile_masked"] = mask_mobile(d.get("seller_mobile", ""))
        d["seller_mobile"] = d["seller_mobile_masked"]
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
        d["seller_mobile"] = d["seller_mobile_masked"]
    return docs


@api_router.post("/orders/{order_id}/accept")
async def accept_order(order_id: str, user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    result = await db.orders.update_one(
        {"id": order_id, "status": "pending"},
        {"$set": {"status": "accepted", "collector_id": user["id"],
                  "collector_name": user.get("company_name") or user["name"],
                  "accepted_at": now_iso()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Order already claimed or unavailable")
    return {"ok": True}


@api_router.post("/orders/{order_id}/reject")
async def reject_order(order_id: str, user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    await db.orders.update_one(
        {"id": order_id},
        {"$addToSet": {"rejected_by": user["id"]}},
    )
    return {"ok": True}


@api_router.post("/orders/{order_id}/complete")
async def complete_order(order_id: str, user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    order = await db.orders.find_one({"id": order_id, "collector_id": user["id"], "status": "accepted"})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found or not accepted by you")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": "completed", "completed_at": now_iso()}},
    )
    return {"ok": True}


@api_router.get("/collector/stats")
async def collector_stats(user=Depends(get_current_user)):
    if user["role"] != "collector":
        raise HTTPException(status_code=403, detail="Collector only")
    docs = await db.orders.find({"collector_id": user["id"], "status": "completed"}, {"_id": 0}).to_list(1000)
    total_pickups = len(docs)
    total_weight = sum(d["weight_kg"] for d in docs)
    total_profit = sum(d.get("estimated_amount", 0) * 0.25 for d in docs)  # 25% margin
    return {
        "total_pickups": total_pickups,
        "total_weight_kg": round(total_weight, 2),
        "total_profit": round(total_profit, 2),
    }


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
    }


@api_router.get("/")
async def root():
    return {"service": "Smart Scrap API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
