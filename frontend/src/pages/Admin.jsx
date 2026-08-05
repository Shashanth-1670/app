import React, { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { adminApi } from "../lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { useNavigate } from "react-router-dom";
import { Users, Truck, Package, Activity, LogOut, Coins, Check, Gift, Star, Mail, Pencil, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { AdminEditUserModal, AdminEditOrderModal } from "../components/AdminEditModals";

export default function Admin() {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [broadcasting, setBroadcasting] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [s, u, o, c, p, r, rt] = await Promise.all([
        adminApi.get("/admin/summary"),
        adminApi.get("/admin/users"),
        adminApi.get("/admin/orders"),
        adminApi.get("/admin/collectors"),
        adminApi.get("/admin/pricing"),
        adminApi.get("/admin/referrals"),
        adminApi.get("/admin/ratings"),
      ]);
      setSummary(s.data); setUsers(u.data); setOrders(o.data); setCollectors(c.data); setPricing(p.data); setReferrals(r.data); setRatings(rt.data);
    } catch (e) {
      localStorage.removeItem("ss_admin_token");
      navigate("/");
    }
  };
  useEffect(() => {
    if (!localStorage.getItem("ss_admin_token")) { navigate("/"); return; }
    load(); const t = setInterval(load, 4000); return () => clearInterval(t);
  }, []);

  const logout = () => { localStorage.removeItem("ss_admin_token"); navigate("/"); };

  const savePricing = async (category) => {
    const val = parseFloat(drafts[category]);
    if (!val || val <= 0) { toast.error("Enter a positive rate"); return; }
    try {
      await adminApi.put("/admin/pricing", { category, price_per_kg: val });
      toast.success(`${category} rate updated to ₹${val}/kg`);
      setDrafts({ ...drafts, [category]: "" });
      load();
    } catch { toast.error("Failed to update rate"); }
  };

  const del = async (path, label) => {
    if (!window.confirm(`Delete ${label}? This is permanent and will cascade to related records.`)) return;
    try {
      await adminApi.delete(path);
      toast.success(`${label} deleted`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white grain">
      <Header />
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-28 pb-16 relative z-10">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66]">Admin Control</div>
            <h1 className="font-display text-4xl font-bold">Master Panel</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {summary && (
              <>
                <Badge data-testid="badge-twilio" className={summary.twilio_configured ? "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/30" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/30"}>
                  Twilio: {summary.twilio_configured ? "Active" : "Off"}
                </Badge>
                <Badge data-testid="badge-email" className={summary.email_configured ? "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/30" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/30"}>
                  Email: {summary.email_configured ? "Active" : "Off"}
                </Badge>
              </>
            )}
            {summary?.email_configured && (
              <Button data-testid="admin-broadcast-weekly-btn" size="sm" variant="outline" onClick={async () => {
                setBroadcasting(true);
                try {
                  const { data } = await adminApi.post("/admin/weekly-summary/broadcast");
                  toast.success(`Broadcast: ${data.sent} sent, ${data.failed} failed`);
                } catch (e) {
                  toast.error(e.response?.data?.detail || "Broadcast failed");
                } finally { setBroadcasting(false); }
              }} disabled={broadcasting} className="rounded-full border-white/15 bg-white/5">
                <Mail className="h-4 w-4 mr-1"/>{broadcasting ? "Sending..." : "Broadcast Weekly"}
              </Button>
            )}
            <Button data-testid="admin-logout-btn" onClick={logout} variant="outline" className="rounded-full border-white/15 bg-white/5"><LogOut className="h-4 w-4 mr-1"/>Exit</Button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="admin-summary">
            <SumCard icon={Users} label="Total Users" value={summary.total_users}/>
            <SumCard icon={Truck} label="Active Collectors" value={summary.active_collectors} highlight/>
            <SumCard icon={Package} label="Pending Orders" value={summary.pending_orders}/>
            <SumCard icon={Activity} label="Completed" value={summary.completed_orders}/>
          </div>
        )}

        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="bg-white/5 mb-4 flex-wrap h-auto" data-testid="admin-tabs">
            <TabsTrigger value="orders" data-testid="tab-orders">Live Orders</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="collectors" data-testid="tab-collectors">Collectors</TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing</TabsTrigger>
            <TabsTrigger value="referrals" data-testid="tab-referrals">Referrals</TabsTrigger>
            <TabsTrigger value="ratings" data-testid="tab-ratings">Ratings</TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <table className="w-full text-sm" data-testid="admin-orders-table">
                <thead className="text-xs uppercase tracking-widest text-white/40 border-b border-white/10">
                  <tr><th className="p-4 text-left">Order</th><th className="p-4 text-left">Seller</th><th className="p-4 text-left">Collector</th><th className="p-4 text-left">Status</th><th className="p-4 text-right">Amount</th><th className="p-4 text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-white/5">
                      <td className="p-4">{o.category} · {o.weight_kg}kg</td>
                      <td className="p-4">{o.seller_name}</td>
                      <td className="p-4">{o.collector_name || "-"}</td>
                      <td className="p-4"><Badge className="border border-white/10 bg-white/5">{o.status}</Badge></td>
                      <td className="p-4 text-right text-[#00FF66] font-bold">₹{o.estimated_amount}</td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <Button data-testid={`edit-order-btn-${o.id}`} size="icon" variant="ghost" onClick={() => setEditingOrder(o)} className="h-8 w-8 mr-1 text-white/60 hover:text-[#00FF66]"><Pencil className="h-4 w-4"/></Button>
                        <Button data-testid={`delete-order-btn-${o.id}`} size="icon" variant="ghost" onClick={() => del(`/admin/orders/${o.id}`, "order")} className="h-8 w-8 text-white/60 hover:text-red-400"><Trash2 className="h-4 w-4"/></Button>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-white/40">No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <table className="w-full text-sm" data-testid="admin-users-table">
                <thead className="text-xs uppercase tracking-widest text-white/40 border-b border-white/10">
                  <tr><th className="p-4 text-left">Name</th><th className="p-4 text-left">Mobile</th><th className="p-4 text-left">Role</th><th className="p-4 text-left">Referral</th><th className="p-4 text-left">Joined</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-white/5">
                      <td className="p-4">{u.name}</td>
                      <td className="p-4 font-mono">{u.mobile}</td>
                      <td className="p-4"><Badge className={u.role === "collector" ? "bg-blue-500/10 text-blue-300 border-blue-500/30" : "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/30"}>{u.role}</Badge></td>
                      <td className="p-4 font-mono text-xs text-white/60">{u.referral_code || "—"}</td>
                      <td className="p-4 text-xs text-white/50">{new Date(u.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {users.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-white/40">No users yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="collectors">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="admin-collectors-grid">
              {collectors.map(c => (
                <div key={c.id} className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-display font-bold">{c.company_name || c.name}</div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${c.online ? "bg-[#00FF66] animate-pulse" : "bg-white/20"}`}/>
                      <Button data-testid={`edit-coll-btn-${c.id}`} size="icon" variant="ghost" onClick={() => setEditingUser(c)} className="h-7 w-7 text-white/50 hover:text-[#00FF66]"><Pencil className="h-3.5 w-3.5"/></Button>
                      <Button data-testid={`delete-coll-btn-${c.id}`} size="icon" variant="ghost" onClick={() => del(`/admin/users/${c.id}`, `collector "${c.company_name || c.name}"`)} className="h-7 w-7 text-white/50 hover:text-red-400"><Trash2 className="h-3.5 w-3.5"/></Button>
                    </div>
                  </div>
                  <div className="text-xs text-white/50">{c.name} · {c.mobile}</div>
                  <div className="text-xs text-white/50 mt-1">{c.address}</div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-white/40">Rating</span>
                    <span className="inline-flex items-center gap-1 text-[#00FF66] font-semibold">
                      <Star className="h-3 w-3 fill-[#00FF66]"/>{c.avg_rating ? c.avg_rating.toFixed(1) : "—"} <span className="text-white/40 font-normal">({c.ratings_count || 0})</span>
                    </span>
                  </div>
                </div>
              ))}
              {collectors.length === 0 && <div className="text-white/40 col-span-full text-center p-8">No collectors yet.</div>}
            </div>
          </TabsContent>

          <TabsContent value="pricing">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6" data-testid="admin-pricing-panel">
              <div className="mb-4 flex items-center gap-2">
                <Coins className="h-5 w-5 text-[#00FF66]"/>
                <h3 className="font-display text-lg font-bold">Per-Kg Rates</h3>
                <span className="text-xs text-white/40">· Updates apply to new orders only</span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {pricing.map(p => (
                  <div key={p.category} data-testid={`pricing-${p.category}`} className="flex items-center justify-between gap-3 p-4 rounded-lg border border-white/10 bg-black/40">
                    <div>
                      <div className="font-semibold">{p.category}</div>
                      <div className="text-xs text-white/50">Current: <span className="text-[#00FF66] font-bold">₹{p.price_per_kg}/kg</span></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        data-testid={`pricing-input-${p.category}`}
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="New rate"
                        value={drafts[p.category] || ""}
                        onChange={(e) => setDrafts({ ...drafts, [p.category]: e.target.value })}
                        className="bg-black/60 border-white/10 max-w-[110px] h-9"
                      />
                      <Button data-testid={`pricing-save-${p.category}`} size="sm" onClick={() => savePricing(p.category)} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold"><Check className="h-4 w-4"/></Button>
                      <Button data-testid={`pricing-delete-${p.category}`} size="icon" variant="ghost" onClick={() => del(`/admin/pricing/${p.category}`, `${p.category} rate`)} className="h-8 w-8 text-white/50 hover:text-red-400"><Trash2 className="h-4 w-4"/></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ratings">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden" data-testid="admin-ratings-panel">
              <div className="p-4 border-b border-white/10 flex items-center gap-2">
                <Star className="h-5 w-5 text-[#00FF66]"/>
                <h3 className="font-display text-lg font-bold">Seller Ratings</h3>
                <span className="text-xs text-white/40">· {ratings.length} total</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-white/40 border-b border-white/10">
                  <tr><th className="p-4 text-left">Collector</th><th className="p-4 text-left">Stars</th><th className="p-4 text-left">Comment</th><th className="p-4 text-left">Date</th></tr>
                </thead>
                <tbody>
                  {ratings.map(rt => {
                    const c = collectors.find(x => x.id === rt.collector_id);
                    return (
                      <tr key={rt.id} className="border-b border-white/5">
                        <td className="p-4">{c?.company_name || c?.name || rt.collector_id.slice(0, 8)}</td>
                        <td className="p-4 text-[#00FF66] font-bold inline-flex items-center gap-1"><Star className="h-3 w-3 fill-[#00FF66]"/>{rt.rating}</td>
                        <td className="p-4 text-white/60 max-w-md">{rt.comment || "—"}</td>
                        <td className="p-4 text-xs text-white/50">{new Date(rt.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {ratings.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-white/40">No ratings yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="referrals">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden" data-testid="admin-referrals-panel">
              <div className="p-4 border-b border-white/10 flex items-center gap-2">
                <Gift className="h-5 w-5 text-[#00FF66]"/>
                <h3 className="font-display text-lg font-bold">Referral Payouts</h3>
                <span className="text-xs text-white/40">· ₹50 per first-completed pickup</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-white/40 border-b border-white/10">
                  <tr><th className="p-4 text-left">Referrer</th><th className="p-4 text-left">Referee</th><th className="p-4 text-right">Bonus</th><th className="p-4 text-left">Date</th><th className="p-4 text-right">Actions</th></tr>
                </thead>
                <tbody>
                  {referrals.map(r => {
                    const referrer = users.find(u => u.id === r.referrer_id);
                    const referee = users.find(u => u.id === r.referee_id);
                    return (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="p-4">{referrer?.name || r.referrer_id.slice(0, 8)}</td>
                        <td className="p-4">{referee?.name || r.referee_id.slice(0, 8)}</td>
                        <td className="p-4 text-right text-[#00FF66] font-bold">₹{r.bonus}</td>
                        <td className="p-4 text-xs text-white/50">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="p-4 text-right">
                          <Button data-testid={`delete-ref-btn-${r.id}`} size="icon" variant="ghost" onClick={() => del(`/admin/referrals/${r.id}`, "referral (bonus will be reversed)")} className="h-8 w-8 text-white/60 hover:text-red-400"><Trash2 className="h-4 w-4"/></Button>
                        </td>
                      </tr>
                    );
                  })}
                  {referrals.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-white/40">No referral payouts yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
      <AdminEditUserModal open={!!editingUser} onOpenChange={(v) => !v && setEditingUser(null)} user={editingUser} onSaved={load} />
      <AdminEditOrderModal open={!!editingOrder} onOpenChange={(v) => !v && setEditingOrder(null)} order={editingOrder} pricing={pricing} onSaved={load} />
    </div>
  );
}

const SumCard = ({ icon: Icon, label, value, highlight }) => (
  <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
    <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-widest mb-3"><Icon className="h-4 w-4"/>{label}</div>
    <div className={`font-display text-3xl font-black ${highlight ? "text-[#00FF66]" : "text-white"}`}>{value}</div>
  </div>
);
