import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { adminApi } from "../lib/api";
import { toast } from "sonner";

const USER_FIELDS_SELLER = ["name", "mobile", "address", "email"];
const USER_FIELDS_COLLECTOR = ["name", "mobile", "address", "company_name", "email"];

export const AdminEditUserModal = ({ open, onOpenChange, user, onSaved }) => {
  const [form, setForm] = useState({});
  useEffect(() => { setForm(user || {}); }, [user]);
  if (!user) return null;
  const fields = user.role === "collector" ? USER_FIELDS_COLLECTOR : USER_FIELDS_SELLER;
  const save = async () => {
    try {
      const patch = fields.reduce((a, f) => ({ ...a, [f]: form[f] ?? "" }), {});
      await adminApi.put(`/admin/users/${user.id}`, patch);
      toast.success("User updated");
      onOpenChange(false);
      onSaved && onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Update failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="admin-edit-user-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit {user.role}</DialogTitle>
          <DialogDescription className="text-white/50">Changes apply immediately and propagate to related orders.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f}>
              <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">{f.replace("_", " ")}</label>
              {f === "address" ? (
                <Textarea data-testid={`edit-user-${f}`} value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="bg-black/40 border-white/10 min-h-[70px]"/>
              ) : (
                <Input data-testid={`edit-user-${f}`} value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} className="bg-black/40 border-white/10"/>
              )}
            </div>
          ))}
        </div>
        <Button data-testid="edit-user-save-btn" onClick={save} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">Save changes</Button>
      </DialogContent>
    </Dialog>
  );
};

export const AdminEditOrderModal = ({ open, onOpenChange, order, pricing, onSaved }) => {
  const [form, setForm] = useState({});
  useEffect(() => { setForm(order || {}); }, [order]);
  if (!order) return null;
  const rate = pricing?.find(p => p.category === form.category)?.price_per_kg || form.price_per_kg;
  const est = form.weight_kg && rate ? (parseFloat(form.weight_kg) * rate).toFixed(2) : "—";
  const save = async () => {
    try {
      await adminApi.put(`/admin/orders/${order.id}`, {
        category: form.category,
        weight_kg: parseFloat(form.weight_kg),
        status: form.status,
        notes: form.notes || "",
      });
      toast.success("Order updated");
      onOpenChange(false); onSaved && onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Update failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="admin-edit-order-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit order</DialogTitle>
          <DialogDescription className="text-white/50">{order.seller_name} · id {order.id.slice(0, 8)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Category</label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger data-testid="edit-order-category" className="bg-black/40 border-white/10"><SelectValue/></SelectTrigger>
              <SelectContent className="bg-[#0a0a0a] border-white/10 text-white">
                {(pricing || []).map(p => <SelectItem key={p.category} value={p.category}>{p.category} · ₹{p.price_per_kg}/kg</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Weight (kg)</label>
            <Input data-testid="edit-order-weight" type="number" min="0.1" step="0.5" value={form.weight_kg || ""} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} className="bg-black/40 border-white/10"/>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Status</label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="edit-order-status" className="bg-black/40 border-white/10"><SelectValue/></SelectTrigger>
              <SelectContent className="bg-[#0a0a0a] border-white/10 text-white">
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="accepted">accepted</SelectItem>
                <SelectItem value="completed">completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Notes</label>
            <Textarea data-testid="edit-order-notes" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-black/40 border-white/10 min-h-[60px]"/>
          </div>
          <div className="p-3 rounded-lg border border-[#00FF66]/30 bg-[#00FF66]/5 flex items-center justify-between">
            <span className="text-xs text-white/60 uppercase tracking-widest">New estimate</span>
            <span className="font-display text-xl font-black text-[#00FF66]">₹{est}</span>
          </div>
        </div>
        <Button data-testid="edit-order-save-btn" onClick={save} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">Save changes</Button>
      </DialogContent>
    </Dialog>
  );
};
