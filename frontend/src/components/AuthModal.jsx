import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { api, saveAuth } from "../lib/api";
import { toast } from "sonner";
import { ShieldCheck, Gift } from "lucide-react";

const genCaptcha = () => {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  return { a, b, answer: a + b };
};

const readReferralFromUrl = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get("ref") || "").trim().toUpperCase();
  } catch { return ""; }
};

export const AuthModal = ({ open, onOpenChange, role = "seller", onSuccess }) => {
  const [mode, setMode] = useState("login");
  const [captcha, setCaptcha] = useState(() => genCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", mobile: "", address: "", password: "", company_name: "",
    referral_code: readReferralFromUrl(),
  });

  const refreshCaptcha = () => { setCaptcha(genCaptcha()); setCaptchaInput(""); };

  const submit = async () => {
    if (parseInt(captchaInput, 10) !== captcha.answer) {
      toast.error("Captcha incorrect. Try again.");
      refreshCaptcha();
      return;
    }
    if (!form.mobile || !form.password) { toast.error("Mobile and password required"); return; }
    if (mode === "register" && (!form.name || !form.address)) { toast.error("Name and address required"); return; }
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login"
        ? { mobile: form.mobile, password: form.password, role }
        : { ...form, role, referral_code: form.referral_code?.trim().toUpperCase() || undefined };
      const { data } = await api.post(endpoint, payload);
      saveAuth(data.token, data.user);
      toast.success(mode === "login" ? "Welcome back!" : "Registration successful!");
      onOpenChange(false);
      onSuccess && onSuccess(data.user);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Something went wrong");
      refreshCaptcha();
    } finally { setLoading(false); }
  };

  const titleRole = role === "collector" ? "Collector" : "Seller";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`auth-modal-${role}`} className="bg-[#0a0a0a] border-white/10 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{titleRole} Access</DialogTitle>
          <DialogDescription className="text-white/50">Login or create an account to continue</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={setMode} className="w-full">
          <TabsList data-testid="auth-tabs" className="grid grid-cols-2 bg-white/5">
            <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
            <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="space-y-3 mt-4">
            <Input data-testid="login-mobile" placeholder="Mobile Number" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="bg-black/40 border-white/10" />
            <Input data-testid="login-password" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-black/40 border-white/10" />
          </TabsContent>
          <TabsContent value="register" className="space-y-3 mt-4">
            <Input data-testid="register-name" placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-black/40 border-white/10" />
            <Input data-testid="register-mobile" placeholder="Mobile Number (10 digits)" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="bg-black/40 border-white/10" />
            <Textarea data-testid="register-address" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-black/40 border-white/10 min-h-[70px]" />
            {role === "collector" && (
              <Input data-testid="register-company" placeholder="Hub / Company Name (e.g., Chandrashekhar Scrap)" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="bg-black/40 border-white/10" />
            )}
            <Input data-testid="register-password" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-black/40 border-white/10" />
            {role === "seller" && (
              <div className="relative">
                <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#00FF66]"/>
                <Input data-testid="register-referral" placeholder="Referral code (optional)" value={form.referral_code} onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase() })} className="bg-black/40 border-white/10 pl-9 tracking-wider" />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-4 p-3 rounded-lg border border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 text-xs text-white/60 mb-2"><ShieldCheck className="h-4 w-4 text-[#00FF66]"/>2-Step Verification</div>
          <div className="flex items-center gap-3">
            <div data-testid="captcha-question" className="px-3 py-2 bg-black/60 rounded-md font-mono tracking-wider text-[#00FF66]">{captcha.a} + {captcha.b} = ?</div>
            <Input data-testid="captcha-input" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} placeholder="Answer" className="bg-black/40 border-white/10 max-w-[100px]" />
            <button onClick={refreshCaptcha} data-testid="captcha-refresh" className="text-xs text-white/50 hover:text-[#00FF66] transition-colors">Refresh</button>
          </div>
        </div>

        <Button data-testid="auth-submit-btn" onClick={submit} disabled={loading} className="mt-3 rounded-full bg-[#00FF66] text-black hover:bg-[#00E055] font-semibold">
          {loading ? "Please wait..." : (mode === "login" ? "Login" : "Create Account")}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
