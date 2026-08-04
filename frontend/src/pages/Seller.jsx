import React, { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AuthModal } from "../components/AuthModal";
import { PickupModal } from "../components/PickupModal";
import { api, getUser } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { motion } from "framer-motion";
import { Package, TrendingUp, Coins, Weight, PlusCircle, Clock, CheckCircle2, Truck } from "lucide-react";

const statusColors = {
  pending: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
  accepted: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  completed: "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/30",
};

export default function Seller() {
  const [user, setUser] = useState(getUser());
  const [authOpen, setAuthOpen] = useState(!user || user?.role !== "seller");
  const [pickupOpen, setPickupOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ total_orders_completed: 0, total_orders: 0, total_weight_kg: 0, total_earnings: 0 });

  const load = async () => {
    if (!user || user.role !== "seller") return;
    try {
      const [o, s] = await Promise.all([api.get("/orders/mine"), api.get("/seller/stats")]);
      setOrders(o.data); setStats(s.data);
    } catch (e) {}
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [user]);

  const hasCompleted = stats.total_orders_completed > 0;

  return (
    <div className="min-h-screen bg-[#050505] text-white grain">
      <Header />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-28 pb-16 relative z-10">
        {!user || user?.role !== "seller" ? (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-center">
              <h1 className="font-display text-4xl font-bold mb-3">Seller Portal</h1>
              <p className="text-white/60 mb-6">Please log in to access your dashboard.</p>
              <Button data-testid="seller-login-cta" onClick={() => setAuthOpen(true)} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055]">Login / Register</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66] mb-2">Seller Dashboard</div>
                <h1 className="font-display text-4xl font-bold">Hi, {user.name} 👋</h1>
                <p className="text-white/50 mt-1 text-sm">{user.address}</p>
              </div>
              <Button data-testid="seller-new-pickup-btn" onClick={() => setPickupOpen(true)} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">
                <PlusCircle className="h-4 w-4 mr-2"/>New Pickup Request
              </Button>
            </div>

            {hasCompleted && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10" data-testid="seller-stats">
                <StatCard icon={Package} label="Total Orders" value={stats.total_orders} testId="stat-total-orders"/>
                <StatCard icon={CheckCircle2} label="Completed" value={stats.total_orders_completed} testId="stat-completed"/>
                <StatCard icon={Weight} label="Weight Sold" value={`${stats.total_weight_kg} kg`} testId="stat-weight"/>
                <StatCard icon={Coins} label="Total Earnings" value={`₹${stats.total_earnings}`} highlight testId="stat-earnings"/>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-[#00FF66]"/>My Requests</h2>
                <div className="text-xs text-white/40">Live · auto-refreshing</div>
              </div>
              <div data-testid="seller-orders-list">
                {orders.length === 0 ? (
                  <div className="p-12 text-center text-white/50">
                    <Truck className="h-10 w-10 mx-auto mb-3 text-white/30"/>
                    No requests yet. Click "New Pickup Request" to start.
                  </div>
                ) : orders.map((o, i) => (
                  <motion.div key={o.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} data-testid={`order-${o.id}`} className="p-5 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center">
                        <Package className="h-5 w-5 text-[#00FF66]"/>
                      </div>
                      <div>
                        <div className="font-semibold">{o.category} · {o.weight_kg} kg</div>
                        <div className="text-xs text-white/50 flex items-center gap-2"><Clock className="h-3 w-3"/>{new Date(o.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-white/50">Est. amount</div>
                        <div className="text-[#00FF66] font-bold">₹{o.estimated_amount}</div>
                      </div>
                      <Badge className={`border ${statusColors[o.status] || "bg-white/5 text-white/60 border-white/10"}`}>{o.status}</Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <Footer />

      <AuthModal open={authOpen} onOpenChange={(v) => { setAuthOpen(v); if (!v) setUser(getUser()); }} role="seller" onSuccess={(u) => setUser(u)} />
      <PickupModal open={pickupOpen} onOpenChange={setPickupOpen} user={user} onCreated={load} />
    </div>
  );
}

const StatCard = ({ icon: Icon, label, value, highlight, testId }) => (
  <div data-testid={testId} className="p-6 rounded-2xl border border-white/10 bg-white/[0.02]">
    <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-widest mb-3">
      <Icon className="h-4 w-4"/>{label}
    </div>
    <div className={`font-display text-3xl font-black ${highlight ? "text-[#00FF66]" : "text-white"}`}>{value}</div>
  </div>
);
