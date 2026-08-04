import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Leaf, Search, MousePointerClick, Truck, Wallet } from "lucide-react";

export const AboutModal = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="about-modal" className="bg-[#0a0a0a] border-white/10 text-white max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl flex items-center gap-2"><Leaf className="h-6 w-6 text-[#00FF66]"/>About Smart Scrap</DialogTitle>
      </DialogHeader>
      <div className="text-white/80 leading-relaxed space-y-3">
        <p className="text-lg">Turning our city into a greener, cleaner environment while monetizing household waste.</p>
        <p className="text-sm text-white/60">Smart Scrap bridges households with local collectors — every kilo you sell becomes a step toward a zero-waste future.</p>
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
