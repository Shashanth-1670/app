import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Leaf, Search, MousePointerClick, Truck, Wallet, Sparkles, HeartHandshake, Globe } from "lucide-react";

const FOUNDER_IMG = "https://customer-assets-cm19k8pv.emergentagent.net/job_waste-cash/artifacts/l4jwx65a_Screenshot_2026_0214_094710.jpg";

export const AboutModal = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="about-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl flex items-center gap-2"><Leaf className="h-6 w-6 text-[#00FF66]"/>About Smart Scrap</DialogTitle>
      </DialogHeader>
      <div className="text-white/80 leading-relaxed space-y-4">
        <p className="text-lg">Turning our city into a greener, cleaner environment while monetizing household waste.</p>
        <p className="text-sm text-white/60">Smart Scrap bridges households with local collectors — every kilo you sell becomes a step toward a zero-waste future.</p>

        <div className="mt-6 pt-6 border-t border-white/10">
          <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66] mb-4 flex items-center gap-2">
            <Sparkles className="h-3 w-3"/> Meet the Founder
          </div>
          <div className="flex flex-col sm:flex-row gap-5" data-testid="founder-section">
            <div className="flex-shrink-0">
              <div className="relative">
                <img
                  src={FOUNDER_IMG}
                  alt="Shashanth KS — Founder & CEO"
                  data-testid="founder-photo"
                  className="w-32 h-40 sm:w-40 sm:h-48 rounded-xl object-cover border border-[#00FF66]/30"
                  style={{ objectPosition: "center 30%" }}
                />
                <div className="absolute -bottom-2 -right-2 bg-[#00FF66] text-black text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md">
                  CEO
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-2xl font-bold" data-testid="founder-name">Shashanth KS</div>
              <div className="text-xs uppercase tracking-[0.2em] text-[#00FF66] mt-1">Founder &amp; CEO</div>
              <p className="mt-3 text-sm text-white/75">
                Shashanth is the visionary behind Smart Scrap — a young thinker whose heart beats for the planet and the well‑being of the people around him. Where most see clutter, he sees opportunity; where others see waste, he sees a chance to help someone earn.
              </p>
              <p className="mt-2 text-sm text-white/75">
                From a simple idea — "no scrap should ever be trash" — he is building a movement that pays households for the things they throw away, empowers local collectors with dignified livelihoods, and quietly cleans up our cities one pickup at a time.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg border border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[#00FF66]"/>
                  <span className="text-xs text-white/70">Planet first</span>
                </div>
                <div className="p-2 rounded-lg border border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <HeartHandshake className="h-4 w-4 text-[#00FF66]"/>
                  <span className="text-xs text-white/70">People first</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export const HowItWorksModal = ({ open, onOpenChange }) => {
  const steps = [
    { icon: Search, title: "Step 1", text: "Notice waste lying around your house." },
    { icon: MousePointerClick, title: "Step 2", text: "Open our website and select the scrap category." },
    { icon: Truck, title: "Step 3", text: "Request a pickup." },
    { icon: Wallet, title: "Step 4", text: "Get paid instantly on fulfillment!" },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="how-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">How It Works</DialogTitle>
          <DialogDescription className="text-white/50">Four simple steps to turn scrap into cash.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 mt-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="h-10 w-10 rounded-lg bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center flex-shrink-0">
                <s.icon className="h-5 w-5 text-[#00FF66]" />
              </div>
              <div>
                <div className="font-display font-bold">{s.title}</div>
                <div className="text-sm text-white/70">{s.text}</div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const TermsModal = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="terms-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-2xl">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">Terms &amp; Conditions</DialogTitle>
      </DialogHeader>
      <div className="text-sm text-white/70 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
        <p>By using Smart Scrap you agree to fair, honest weighing and honest disclosure of scrap categories. Prices are estimates and are settled based on final collector-side weighing.</p>
        <p><span className="text-white font-semibold">Privacy:</span> All phone numbers are masked in public views. We never share your unmasked contact with third parties.</p>
        <p><span className="text-white font-semibold">Pickups:</span> Requests unaccepted for 24 hours are auto-purged. Collectors may reject requests; rejected requests remain visible to other collectors.</p>
        <p><span className="text-white font-semibold">Payments:</span> Payments are made on fulfillment. All disputes are resolved on a best-effort basis.</p>
        <p>By continuing, you confirm you have read and agree to our privacy and service policies.</p>
      </div>
    </DialogContent>
  </Dialog>
);
