import React, { useState } from "react";
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { adminApi } from "../lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export const Footer = () => {
  const [open, setOpen] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.post("/admin/verify", { passkey });
      localStorage.setItem("ss_admin_token", data.token);
      toast.success("Admin access granted");
      setOpen(false);
      navigate("/admin");
    } catch (e) {
      toast.error("Invalid passkey");
    } finally { setLoading(false); }
  };

  return (
    <footer data-testid="site-footer" className="border-t border-white/10 bg-[#050505] py-12 mt-24 relative z-10">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 grid md:grid-cols-3 gap-8">
        <div>
          <div className="font-display font-black text-2xl mb-2">Smart<span className="text-[#00FF66]">Scrap</span></div>
          <p className="text-white/50 text-sm max-w-sm">Turning household waste into wealth. Cleaner cities, greener planet.</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">Company</div>
          <ul className="space-y-2 text-sm text-white/70">
            <li>About Us</li>
            <li>How It Works</li>
            <li>Terms &amp; Conditions</li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">Get In Touch</div>
          <ul className="space-y-2 text-sm text-white/70">
            <li>hello@smartscrap.io</li>
            <li>+91 XXXXXX XX</li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 mt-10 flex items-center justify-between text-xs text-white/40">
        <span>© {new Date().getFullYear()} Smart Scrap. All rights reserved.</span>
        <button
          onClick={() => setOpen(true)}
          data-testid="admin-lock-icon"
          className="p-2 rounded-md hover:bg-white/5 transition-colors"
          aria-label="Admin access"
        >
          <Lock className="h-4 w-4 text-white/30 hover:text-[#00FF66] transition-colors" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="admin-passkey-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2"><Lock className="h-5 w-5 text-[#00FF66]"/>Admin Access</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="admin-passkey-input"
            type="password"
            placeholder="Enter passkey"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="bg-black/40 border-white/10 focus-visible:ring-[#00FF66]"
          />
          <Button data-testid="admin-passkey-submit" onClick={submit} disabled={loading} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">
            {loading ? "Verifying..." : "Unlock"}
          </Button>
        </DialogContent>
      </Dialog>
    </footer>
  );
};
