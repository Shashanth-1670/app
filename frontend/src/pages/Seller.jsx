import React, { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AuthModal } from "../components/AuthModal";
import { PickupModal } from "../components/PickupModal";
import { RatingModal } from "../components/RatingModal";
import { EmailSettings } from "../components/EmailSettings";
import { api, getUser } from "../lib/api";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Package, TrendingUp, Coins, Weight, PlusCircle, Clock, CheckCircle2, Truck, Gift, Copy, Users, Star } from "lucide-react";

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
  const [stats, setStats] = useState({
    total_orders_completed: 0, total_orders: 0, total_weight_kg: 0, scrap_earnings: 0,
    referral_earnings: 0, total_earnings: 0, referral_code: "", referrals_count: 0, email: "",
  });
  const [ratingOrder, setRatingOrder] = useState(null);

  const load = async () => {
    if (!user || user.role !== "seller") return;
    try {
      const [o, s] = await Promise.all([api.get("/orders/mine"), api.get("/seller/stats")]);
      setOrders(o.data); setStats(s.data);
    } catch (e) {}
  };

  useEffect(() => { load(); const t = setInterval(load, 3500); return () => clearInterval(t); }, [user]);

  const copyReferral = () => {
    const link = `${window.location.origin}/?ref=${stats.referral_code}`;
    navigator.clipboard.writeText(link);
    toast.success("Referral link copied!");
  };

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
            <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66] mb-2">Seller Dashboard</div>
                <h1 className="font-display text-4xl font-bold">Hi, {user.name}</h1>
                <p className="text-white/50 mt-1 text-sm">{user.address}</p>
              </div>
              <Button data-testid="seller-new-pickup-btn" onClick={() => setPickupOpen(true)} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">
                <PlusCircle className="h-4 w-4 mr-2"/>New Pickup Request
              </Button>
            </div>

            <div className="grid md:grid-cols-4 gap-4 mb-6" data-testid="seller-stats">
              <StatCard icon={Package} label="Total Orders" value={stats.total_orders} testId="stat-total-orders"/>
              <StatCard icon={CheckCircle2} label="Completed" value={stats.total_orders_completed} testId="stat-completed"/>
              <StatCard icon={Weight} label="Weight Sold" value={`${stats.total_weight_kg} kg`} testId="stat-weight"/>
              <StatCard icon={Coins} label="Total Earnings" value={`₹${stats.total_earnings}`} highlight testId="stat-earnings"/>
            </div>

            <EmailSettings stats={stats} onUpdated={load} />

            <div className="mb-8 rounded-2xl border border-[#00FF66]/30 bg-gradient-to-br from-[#00FF66]/10 via-[#00FF66]/5 to-transparent p-6" data-testid="referral-card">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[#00FF66]/20 border border-[#00FF66]/40 flex items-center justify-center">
                    <Gift className="h-6 w-6 text-[#00FF66]"/>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[#00FF66] mb-1">Refer &amp; Earn</div>
                    <div className="font-display text-xl font-bold">Get ₹50 for every friend who books their first pickup.</div>
                    <div className="text-xs text-white/60 mt-1 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3"/>{stats.referrals_count} referred</span>
                      <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3 text-[#00FF66]"/>₹{stats.referral_earnings} earned</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div data-testid="referral-code" className="font-mono tracking-widest bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-[#00FF66]">
                    {stats.referral_code || "—"}
                  </div>
                  <Button data-testid="copy-referral-btn" onClick={copyReferral} variant="outline" className="rounded-full border-white/15 bg-white/5"><Copy className="h-4 w-4 mr-1"/>Copy link</Button>
                </div>
              </div>
            </div>

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
                        {o.collector_name && (
                          <div className="text-xs text-white/60 mt-1 flex items-center gap-2">
                            <span>Collector: {o.collector_name}</span>
                            {o.collector_ratings_count >= 2 && o.collector_avg_rating > 0 && (
                              <span className="inline-flex items-center gap-1 text-[#00FF66]"><Star className="h-3 w-3 fill-[#00FF66]"/>{o.collector_avg_rating.toFixed(1)} ({o.collector_ratings_count})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {o.status === "completed" && !o.rating && (
                        <Button data-testid={`rate-${o.id}`} size="sm" variant="outline" onClick={() => setRatingOrder(o)} className="rounded-full border-[#00FF66]/40 bg-[#00FF66]/10 text-[#00FF66] hover:bg-[#00FF66]/20">
                          <Star className="h-3 w-3 mr-1"/>Rate pickup
                        </Button>
                      )}
                      {o.rating && (
                        <div data-testid={`rated-${o.id}`} className="inline-flex items-center gap-1 text-xs text-white/60">
                          You rated: <span className="text-[#00FF66] inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-[#00FF66]"/>{o.rating}</span>
                        </div>
                      )}
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
      <RatingModal open={!!ratingOrder} onOpenChange={(v) => !v && setRatingOrder(null)} order={ratingOrder} onRated={load} />
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
