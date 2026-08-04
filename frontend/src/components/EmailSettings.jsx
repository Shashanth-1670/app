import React, { useEffect, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Mail, Send, Sparkles } from "lucide-react";

export const EmailSettings = ({ stats, onUpdated }) => {
  const [emailCfg, setEmailCfg] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/email/status").then(({ data }) => setEmailCfg(data.configured)).catch(() => {});
  }, []);

  useEffect(() => { setEmail(stats?.email || ""); }, [stats?.email]);

  const saveEmail = async () => {
    if (!email || !email.includes("@")) { toast.error("Enter a valid email"); return; }
    setSaving(true);
    try {
      await api.patch("/user/email", { email });
      toast.success("Email saved");
      onUpdated && onUpdated();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const { data } = await api.post("/seller/weekly-summary/send-now");
      toast.success(data.message || "Weekly summary sent");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to send"); }
    finally { setSending(false); }
  };

  return (
    <div data-testid="email-settings" className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-10 w-10 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center">
          <Mail className="h-5 w-5 text-[#00FF66]"/>
        </div>
        <div>
          <div className="font-display text-lg font-bold">Sunday Weekly Recap</div>
          <div className="text-xs text-white/50">One email every Sunday with your scrap + referral earnings.</div>
        </div>
      </div>

      {!emailCfg && (
        <div data-testid="email-cfg-warning" className="mt-3 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-yellow-200 text-xs">
          Email delivery is not configured yet. Admin must add EMERGENT_EMAIL_KEY. You can still save your email address.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          data-testid="email-input"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-black/40 border-white/10 flex-1 min-w-[200px]"
        />
        <Button data-testid="email-save-btn" onClick={saveEmail} disabled={saving} className="rounded-full bg-white text-black hover:bg-white/90 font-semibold">
          {saving ? "Saving..." : (stats?.email ? "Update" : "Save")}
        </Button>
        {stats?.email && emailCfg && (
          <Button data-testid="email-send-now-btn" onClick={sendNow} disabled={sending} className="rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">
            {sending ? "Sending..." : <><Sparkles className="h-4 w-4 mr-1"/>Preview now</>}
          </Button>
        )}
      </div>

      {stats?.last_weekly_email && (
        <div className="mt-3 text-xs text-white/40 flex items-center gap-1">
          <Send className="h-3 w-3"/>Last sent {new Date(stats.last_weekly_email).toLocaleString()}
        </div>
      )}
    </div>
  );
};
