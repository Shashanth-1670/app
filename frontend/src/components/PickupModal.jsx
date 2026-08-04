import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Package } from "lucide-react";

export const PickupModal = ({ open, onOpenChange, user, onCreated }) => {
  const [category, setCategory] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState([]);

  useEffect(() => {
    if (open) api.get("/pricing").then(({ data }) => setPricing(data)).catch(() => {});
  }, [open]);

  const rate = pricing.find(p => p.category === category)?.price_per_kg;
  const estimate = (rate && weight) ? (parseFloat(weight) * rate).toFixed(2) : null;

  const submit = async () => {
    if (!category || !weight) { toast.error("Please select category and weight"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/orders", { category, weight_kg: parseFloat(weight), notes });
      toast.success(`Pickup broadcast! Est. ₹${data.estimated_amount}`);
      onOpenChange(false);
      setCategory(""); setWeight(""); setNotes("");
      onCreated && onCreated(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create request");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="pickup-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2"><Package className="h-6 w-6 text-[#00FF66]"/>Request Pickup</DialogTitle>
          <DialogDescription className="text-white/50">We'll broadcast this to online collectors near you.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {user && (
            <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02] text-sm">
              <div className="text-white/50 text-xs uppercase tracking-widest mb-1">Pickup From</div>
              <div className="text-white font-medium">{user.name}</div>
              <div className="text-white/60">{user.address}</div>
              <div className="text-white/60">{user.mobile}</div>
            </div>
          )}

          <div>
            <label className="text-xs text-white/60 uppercase tracking-widest mb-2 block">Scrap Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="pickup-category" className="bg-black/40 border-white/10">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0a] border-white/10 text-white max-h-72">
                {pricing.map(p => (
                  <SelectItem key={p.category} value={p.category} data-testid={`category-${p.category}`}>
                    <span className="flex items-center justify-between gap-6 w-full">
                      <span>{p.category}</span>
                      <span className="text-[#00FF66] text-xs">₹{p.price_per_kg}/kg</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-white/60 uppercase tracking-widest mb-2 block">Estimated Weight (kg)</label>
            <Input data-testid="pickup-weight" type="number" min="0.5" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g., 5.5" className="bg-black/40 border-white/10" />
          </div>

          <div>
            <label className="text-xs text-white/60 uppercase tracking-widest mb-2 block">Notes (optional)</label>
            <Input data-testid="pickup-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., Ring bell twice" className="bg-black/40 border-white/10" />
          </div>

          {estimate && (
            <div data-testid="pickup-estimate" className="p-3 rounded-lg border border-[#00FF66]/30 bg-[#00FF66]/5 flex items-center justify-between">
              <span className="text-xs text-white/60 uppercase tracking-widest">Estimated Payout</span>
              <span className="font-display text-2xl font-black text-[#00FF66]">₹{estimate}</span>
            </div>
          )}

          <Button data-testid="pickup-submit-btn" onClick={submit} disabled={loading} className="w-full rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">
            {loading ? "Broadcasting..." : "Broadcast Pickup Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
