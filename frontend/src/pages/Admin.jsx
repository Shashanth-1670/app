import React, { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { adminApi } from "../lib/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Users, Truck, Package, Activity, LogOut } from "lucide-react";
import { Button } from "../components/ui/button";

export default function Admin() {
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [s, u, o, c] = await Promise.all([
        adminApi.get("/admin/summary"),
        adminApi.get("/admin/users"),
        adminApi.get("/admin/orders"),
        adminApi.get("/admin/collectors"),
      ]);
      setSummary(s.data); setUsers(u.data); setOrders(o.data); setCollectors(c.data);
    } catch (e) {
      localStorage.removeItem("ss_admin_token");
      navigate("/");
    }
  };
  useEffect(() => {
    if (!localStorage.getItem("ss_admin_token")) { navigate("/"); return; }
    load(); const t = setInterval(load, 5000); return () => clearInterval(t);
  }, []);

  const logout = () => { localStorage.removeItem("ss_admin_token"); navigate("/"); };

  return (
    <div className="min-h-screen bg-[#050505] text-white grain">
      <Header />
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-28 pb-16 relative z-10">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66]">Admin Control</div>
            <h1 className="font-display text-4xl font-bold">Master Panel</h1>
          </div>
          <Button data-testid="admin-logout-btn" onClick={logout} variant="outline" className="rounded-full border-white/15 bg-white/5"><LogOut className="h-4 w-4 mr-1"/>Exit</Button>
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
          <TabsList className="bg-white/5 mb-4" data-testid="admin-tabs">
            <TabsTrigger value="orders" data-testid="tab-orders">Live Orders</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="collectors" data-testid="tab-collectors">Collectors</TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <table className="w-full text-sm" data-testid="admin-orders-table">
                <thead className="text-xs uppercase tracking-widest text-white/40 border-b border-white/10">
                  <tr><th className="p-4 text-left">Order</th><th className="p-4 text-left">Seller</th><th className="p-4 text-left">Collector</th><th className="p-4 text-left">Status</th><th className="p-4 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-white/5">
                      <td className="p-4">{o.category} · {o.weight_kg}kg</td>
                      <td className="p-4">{o.seller_name}</td>
                      <td className="p-4">{o.collector_name || "-"}</td>
                      <td className="p-4"><Badge className="border border-white/10 bg-white/5">{o.status}</Badge></td>
                      <td className="p-4 text-right text-[#00FF66] font-bold">₹{o.estimated_amount}</td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-white/40">No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <table className="w-full text-sm" data-testid="admin-users-table">
                <thead className="text-xs uppercase tracking-widest text-white/40 border-b border-white/10">
                  <tr><th className="p-4 text-left">Name</th><th className="p-4 text-left">Mobile</th><th className="p-4 text-left">Role</th><th className="p-4 text-left">Address</th><th className="p-4 text-left">Joined</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b border-white/5">
                      <td className="p-4">{u.name}</td>
                      <td className="p-4 font-mono">{u.mobile}</td>
                      <td className="p-4"><Badge className={u.role === "collector" ? "bg-blue-500/10 text-blue-300 border-blue-500/30" : "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/30"}>{u.role}</Badge></td>
                      <td className="p-4 text-white/60">{u.address}</td>
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
                    <span className={`h-2 w-2 rounded-full ${c.online ? "bg-[#00FF66] animate-pulse" : "bg-white/20"}`}/>
                  </div>
                  <div className="text-xs text-white/50">{c.name} · {c.mobile}</div>
                  <div className="text-xs text-white/50 mt-1">{c.address}</div>
                </div>
              ))}
              {collectors.length === 0 && <div className="text-white/40 col-span-full text-center p-8">No collectors yet.</div>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
    </div>
  );
}

const SumCard = ({ icon: Icon, label, value, highlight }) => (
  <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
    <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-widest mb-3"><Icon className="h-4 w-4"/>{label}</div>
    <div className={`font-display text-3xl font-black ${highlight ? "text-[#00FF66]" : "text-white"}`}>{value}</div>
  </div>
);
