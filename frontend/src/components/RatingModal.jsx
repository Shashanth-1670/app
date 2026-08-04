import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Star } from "lucide-react";

export const RatingModal = ({ open, onOpenChange, order, onRated }) => {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (rating < 1) { toast.error("Please select a rating"); return; }
    setLoading(true);
    try {
      await api.post(`/orders/${order.id}/rate`, { rating, comment });
      toast.success("Thanks — rating submitted!");
      onOpenChange(false); setRating(0); setComment("");
      onRated && onRated();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to submit rating");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="rating-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Rate your pickup</DialogTitle>
          <DialogDescription className="text-white/50">
            {order?.collector_name} · {order?.category} · {order?.weight_kg} kg
          </DialogDescription>
        </DialogHeader>

        <div data-testid="rating-stars" className="flex items-center justify-center gap-2 py-4">
          {[1,2,3,4,5].map(n => (
            <button
              key={n}
              data-testid={`star-${n}`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
              className="p-1 transition-transform hover:scale-110 active:scale-95"
              aria-label={`${n} star`}
            >
              <Star
                className={`h-9 w-9 ${(hover || rating) >= n ? "fill-[#00FF66] text-[#00FF66]" : "text-white/25"}`}
              />
            </button>
          ))}
        </div>

        <Textarea
          data-testid="rating-comment"
          placeholder="What went well? (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="bg-black/40 border-white/10 min-h-[80px]"
        />

        <Button
          data-testid="rating-submit-btn"
          onClick={submit}
          disabled={loading || rating < 1}
          className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold"
        >
          {loading ? "Submitting..." : `Submit ${rating} star${rating === 1 ? "" : "s"}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
