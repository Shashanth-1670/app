import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Package } from "lucide-react";

const CATEGORIES = ["Paper", "Cardboard", "Plastic", "Metal", "Iron", "Copper", "Aluminium", "Glass", "E-Waste"];

export const PickupModal = ({ open, onOpenChange, user, onCreated }) => {
  const [category, setCategory] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!category || !weight) { toast.error("Please select category and weight"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/orders", { category, weight_kg: parseFloat(weight), notes });
      toast.success(`Pickup requested! Est. ₹${data.estimated_amount}`);
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
          <DialogDescription className="text-white/50">We'll broadcast this to collectors near you.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {user && (
            <div className="p-3 rounded-lg border border-white/10 bg-white/[0.02] text-sm">
              <div className="text-white/50 text-xs uppercase tracking-widest mb-1">Pickup From</div>
              <div className="text-white font-medium">{user.name}</div>
              <div className="text-white/60">{user.address}</div>
              <div className="text-white/60">📱 {user.mobile}</div>
            </div>
          )}

          <div>
            <label className="text-xs text-white/60 uppercase tracking-widest mb-2 block">Scrap Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="pickup-category" className="bg-black/40 border-white/10">
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0a] border-white/10 text-white">
                {CATEGORIES.map((c) => <SelectItem key={c} value={c} data-testid={`category-${c}`}>{c}</SelectItem>)}
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

          <Button data-testid="pickup-submit-btn" onClick={submit} disabled={loading} className="w-full rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">
            {loading ? "Broadcasting..." : "Broadcast Pickup Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
