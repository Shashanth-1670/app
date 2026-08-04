import React, { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AuthModal } from "../components/AuthModal";
import { api, getUser, saveAuth } from "../lib/api";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Badge } from "../components/ui/badge";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Package, Phone, Navigation, CheckCircle2, X, Building2, TrendingUp, Weight, Coins, Clock } from "lucide-react";

export default function Collector() {
  const [user, setUser] = useState(getUser());
  const [authOpen, setAuthOpen] = useState(!user || user?.role !== "collector");
  const [online, setOnline] = useState(false);
  const [feed, setFeed] = useState([]);
  const [accepted, setAccepted] = useState([]);
  const [stats, setStats] = useState({ total_pickups: 0, total_weight_kg: 0, total_profit: 0 });

  useEffect(() => { if (user?.role === "collector") setOnline(!!user.online); }, [user]);

  const load = async () => {
    if (!user || user.role !== "collector") return;
    try {
      const [f, a, s] = await Promise.all([
        api.get("/orders/feed"),
        api.get("/orders/accepted"),
        api.get("/collector/stats"),
      ]);
      setFeed(f.data); setAccepted(a.data); setStats(s.data);
    } catch (e) {}
  };

  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [user, online]);

  const toggleOnline = async (v) => {
    setOnline(v);
    try {
      await api.post("/collector/status", { online: v });
      const nu = { ...user, online: v }; saveAuth(localStorage.getItem("ss_token"), nu); setUser(nu);
      toast.success(v ? "You are now Online" : "You are Offline");
    } catch { toast.error("Failed to update status"); }
  };

  const accept = async (id) => {
    try {
      await api.post(`/orders/${id}/accept`);
      toast.success("Order accepted!");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to accept");
      load();
    }
  };
  const reject = async (id) => {
    try { await api.post(`/orders/${id}/reject`); toast.message("Order rejected"); load(); } catch { toast.error("Failed"); }
  };
  const complete = async (id) => {
    try { await api.post(`/orders/${id}/complete`); toast.success("Order completed! Metrics updated."); load(); } catch { toast.error("Failed"); }
  };

  const maskedCall = (mobile) => toast.message(`Connecting via masked proxy: ${mobile}`, { description: "Real number stays private." });
  const navigateTo = (address) => window.open(`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`, "_blank");

  return (
    <div className="min-h-screen bg-[#050505] text-white grain">
      <Header />
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-28 pb-16 relative z-10">
        {!user || user?.role !== "collector" ? (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-center">
              <h1 className="font-display text-4xl font-bold mb-3">Collector Portal</h1>
              <p className="text-white/60 mb-6">Log in or register to start accepting pickups.</p>
              <Button data-testid="collector-login-cta" onClick={() => setAuthOpen(true)} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055]">Login / Register</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-[#00FF66]"/>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66]">Collector Hub</div>
                  <h1 className="font-display text-3xl font-bold" data-testid="collector-hub-name">{user.company_name || user.name}</h1>
                  <p className="text-white/50 text-sm">{user.address}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-full border border-white/10 bg-white/[0.02]">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-[#00FF66] animate-pulse" : "bg-white/30"}`}/>
                <span className="text-sm font-medium" data-testid="online-status-label">{online ? "Online" : "Offline"}</span>
                <Switch data-testid="online-toggle" checked={online} onCheckedChange={toggleOnline} />
              </div>
            </div>

            {stats.total_pickups > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-8" data-testid="collector-stats">
                <StatCard icon={CheckCircle2} label="Completed Pickups" value={stats.total_pickups} testId="c-stat-pickups"/>
                <StatCard icon={Weight} label="Volume Processed" value={`${stats.total_weight_kg} kg`} testId="c-stat-weight"/>
                <StatCard icon={Coins} label="Total Profit" value={`₹${stats.total_profit}`} highlight testId="c-stat-profit"/>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Feed */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-[#00FF66]"/>Incoming Requests</h2>
                  <span className="text-xs text-white/40">{feed.length} available</span>
                </div>
                <div data-testid="collector-feed" className="max-h-[70vh] overflow-y-auto no-scrollbar">
                  {!online && (
                    <div className="p-8 text-center text-white/50 text-sm">
                      Toggle <span className="text-[#00FF66]">Online</span> to view live requests.
                    </div>
                  )}
                  {online && feed.length === 0 && (
                    <div className="p-8 text-center text-white/50 text-sm">No requests right now. Sit tight!</div>
                  )}
                  {online && feed.map((o, i) => (
                    <motion.div key={o.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} data-testid={`feed-order-${o.id}`} className="p-5 border-b border-white/5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-[#00FF66]"/>{o.category} · {o.weight_kg} kg</div>
                          <div className="text-xs text-white/50 mt-1 flex items-center gap-1"><Clock className="h-3 w-3"/>{new Date(o.created_at).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/50">Value</div>
                          <div className="text-[#00FF66] font-bold">₹{o.estimated_amount}</div>
                        </div>
                      </div>
                      <div className="text-sm text-white/70 mb-3">
                        <div><span className="text-white/40">From:</span> {o.seller_name}</div>
                        <div className="text-xs">{o.seller_address}</div>
                        <div className="text-xs font-mono text-white/50 mt-1">📞 {o.seller_mobile_masked}</div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button data-testid={`accept-${o.id}`} onClick={() => accept(o.id)} size="sm" className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold"><CheckCircle2 className="h-4 w-4 mr-1"/>Accept</Button>
                        <Button data-testid={`reject-${o.id}`} onClick={() => reject(o.id)} variant="outline" size="sm" className="rounded-full border-white/15 bg-white/5 hover:bg-white/10"><X className="h-4 w-4 mr-1"/>Reject</Button>
                        <Button data-testid={`call-${o.id}`} onClick={() => maskedCall(o.seller_mobile_masked)} variant="outline" size="sm" className="rounded-full border-white/15 bg-white/5 hover:bg-white/10"><Phone className="h-4 w-4 mr-1"/>Masked Call</Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Accepted */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-[#00FF66]"/>My Active Pickups</h2>
                  <span className="text-xs text-white/40">{accepted.length} ongoing</span>
                </div>
                <div data-testid="collector-accepted" className="max-h-[70vh] overflow-y-auto no-scrollbar">
                  {accepted.length === 0 ? (
                    <div className="p-8 text-center text-white/50 text-sm">No active pickups yet.</div>
                  ) : accepted.map((o) => (
                    <div key={o.id} data-testid={`accepted-${o.id}`} className="p-5 border-b border-white/5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold">{o.category} · {o.weight_kg} kg</div>
                          <div className="text-xs text-white/50">{o.seller_name} · {o.seller_address}</div>
                          <div className="text-xs font-mono text-white/50 mt-1">📞 {o.seller_mobile_masked}</div>
                        </div>
                        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/30">accepted</Badge>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button data-testid={`navigate-${o.id}`} onClick={() => navigateTo(o.seller_address)} size="sm" variant="outline" className="rounded-full border-white/15 bg-white/5 hover:bg-white/10"><Navigation className="h-4 w-4 mr-1"/>Navigate</Button>
                        <Button data-testid={`call-a-${o.id}`} onClick={() => maskedCall(o.seller_mobile_masked)} size="sm" variant="outline" className="rounded-full border-white/15 bg-white/5 hover:bg-white/10"><Phone className="h-4 w-4 mr-1"/>Masked Call</Button>
                        <Button data-testid={`complete-${o.id}`} onClick={() => complete(o.id)} size="sm" className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold"><CheckCircle2 className="h-4 w-4 mr-1"/>Complete Order</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <Footer />
      <AuthModal open={authOpen} onOpenChange={(v) => { setAuthOpen(v); if (!v) setUser(getUser()); }} role="collector" onSuccess={(u) => setUser(u)} />
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
