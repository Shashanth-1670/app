import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../components/ui/button";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { AuthModal } from "../components/AuthModal";
import { PickupModal } from "../components/PickupModal";
import { api, getUser } from "../lib/api";
import { PhoneOff, Navigation, Zap, Recycle, ArrowRight, Sparkles } from "lucide-react";

const HERO_IMG = "https://images.unsplash.com/photo-1561503412-852800622772?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHw0fHxyZWN5Y2xpbmclMjB3YXN0ZSUyMHNvcnRpbmd8ZW58MHx8fHwxNzgyOTQzNDQyfDA&ixlib=rb-4.1.0&q=85";
const FEATURE_IMG = "https://images.unsplash.com/photo-1722695510527-cc033e43be1b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwxfHxzY3JhcCUyMG1ldGFsJTIwZWxlY3Ryb25pY3MlMjByZWN5Y2xpbmd8ZW58MHx8fHwxNzg1ODU0NjE0fDA&ixlib=rb-4.1.0&q=85";
const ELEC_IMG = "https://images.unsplash.com/photo-1717667745934-53091623e8ee?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAxODF8MHwxfHNlYXJjaHwzfHxzY3JhcCUyMG1ldGFsJTIwZWxlY3Ryb25pY3MlMjByZWN5Y2xpbmd8ZW58MHx8fHwxNzg1ODU0NjE0fDA&ixlib=rb-4.1.0&q=85";

export default function Landing() {
  const [authOpen, setAuthOpen] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [metrics, setMetrics] = useState({ tons_recycled: 1000, happy_customers: 100, trusted_collectors: 50 });

  useEffect(() => {
    api.get("/public/metrics").then(({ data }) => setMetrics(data)).catch(() => {});
  }, []);

  const requestPickup = () => {
    const u = getUser();
    if (u && u.role === "seller") setPickupOpen(true);
    else setAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white grain relative overflow-x-hidden">
      <Header onRequestPickup={requestPickup} />

      {/* HERO */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-32 px-5 sm:px-8" data-testid="hero-section">
        <div className="absolute inset-0 -z-0">
          <img src={HERO_IMG} alt="Recycling operations" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/60 via-[#050505]/70 to-[#050505]" />
        </div>

        <div className="relative max-w-6xl mx-auto z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00FF66]/10 border border-[#00FF66]/30 text-[#00FF66] text-xs tracking-wider uppercase mb-6">
              <Sparkles className="h-3 w-3" /> Eco Marketplace · Live
            </div>
            <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
              Turn your scrap<br/>
              into <span className="text-[#00FF66] text-glow">cash</span> today.
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl">
              Book a doorstep pickup in seconds. Verified local collectors, transparent weights, instant payments — a greener city, powered by you.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button data-testid="hero-request-pickup-btn" size="lg" onClick={requestPickup} className="rounded-full bg-[#00FF66] hover:bg-[#00E055] text-black font-bold px-8 py-6 text-base glow-green">
                Request Pickup <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button data-testid="hero-collector-btn" variant="outline" size="lg" onClick={() => window.location.href = "/collector"} className="rounded-full border-white/20 bg-white/5 hover:bg-white/10 text-white px-8 py-6 text-base">
                I'm a Collector
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* METRICS */}
      <section className="relative border-y border-white/10 bg-black/40 py-10 z-10" data-testid="metrics-bar">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 grid grid-cols-3 gap-6">
          {[
            { n: `${metrics.tons_recycled.toLocaleString()}+`, l: "Tons Scrap Recycled", t: "tons-metric" },
            { n: `${metrics.happy_customers.toLocaleString()}+`, l: "Happy Customers", t: "customers-metric" },
            { n: `${metrics.trusted_collectors.toLocaleString()}+`, l: "Trusted Collectors", t: "collectors-metric" },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center md:text-left" data-testid={s.t}>
              <div className="font-display text-4xl md:text-5xl font-black text-[#00FF66]">{s.n}</div>
              <div className="text-xs tracking-[0.2em] uppercase text-white/50 mt-1">{s.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-24 relative z-10" data-testid="features-section">
        <div className="mb-14 max-w-2xl">
          <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66] mb-3">Built for trust</div>
          <h2 className="font-display text-4xl md:text-5xl font-bold">Everything you need, nothing you don't.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:border-[#00FF66]/50 transition-colors">
            <PhoneOff className="h-8 w-8 text-[#00FF66] mb-4" />
            <h3 className="font-display text-2xl font-bold mb-2">Masked Phone Calling</h3>
            <p className="text-white/60 max-w-md">Complete privacy for both sellers and collectors. All calls are routed through our proxy — real numbers are never revealed.</p>
            <div className="mt-6 inline-flex items-center gap-2 text-xs font-mono text-white/50 bg-black/40 border border-white/10 px-3 py-2 rounded-md">
              91 XXXXXX 42 <span className="text-[#00FF66]">· Masked</span>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:border-[#00FF66]/50 transition-colors">
            <Navigation className="h-8 w-8 text-[#00FF66] mb-4" />
            <h3 className="font-display text-2xl font-bold mb-2">In-Built Navigation</h3>
            <p className="text-white/60">Turn-by-turn routes to seller's doorstep — no app switching.</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-2xl border border-white/10 overflow-hidden">
            <img src={FEATURE_IMG} alt="Metal scrap operations" className="w-full h-56 object-cover" />
            <div className="p-6">
              <div className="text-xs tracking-widest uppercase text-[#00FF66]">Live Ops</div>
              <h4 className="font-display text-xl font-bold mt-1">Real-Time Broadcast</h4>
              <p className="text-white/60 text-sm mt-2">Requests reach every online collector instantly. First accept wins.</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="md:col-span-2 rounded-2xl border border-white/10 bg-gradient-to-br from-[#00FF66]/5 to-transparent p-8">
            <Zap className="h-8 w-8 text-[#00FF66] mb-4" />
            <h3 className="font-display text-2xl font-bold mb-2">Instant Payouts</h3>
            <p className="text-white/60 max-w-md">Get paid the moment your scrap is weighed and collected. No waiting, no calls, no chasing.</p>
            <div className="mt-6 grid grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-black/40 border border-white/10"><span className="text-white/50">Paper</span><div className="text-[#00FF66] font-bold">₹12/kg</div></div>
              <div className="p-3 rounded-lg bg-black/40 border border-white/10"><span className="text-white/50">Metal</span><div className="text-[#00FF66] font-bold">₹45/kg</div></div>
              <div className="p-3 rounded-lg bg-black/40 border border-white/10"><span className="text-white/50">E-Waste</span><div className="text-[#00FF66] font-bold">₹80/kg</div></div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-5 sm:px-8 py-20 relative z-10" data-testid="how-it-works-section">
        <div className="mb-14 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-[#00FF66] mb-3">Simple as 1-2-3-4</div>
            <h2 className="font-display text-4xl md:text-5xl font-bold">How it works</h2>
          </div>
          <img src={ELEC_IMG} alt="" className="h-16 w-24 object-cover rounded-lg opacity-60"/>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            "Notice waste lying around your house.",
            "Open our website and select the scrap category.",
            "Request a pickup.",
            "Get paid instantly on fulfillment!",
          ].map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="relative p-6 rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="font-display text-6xl font-black text-[#00FF66]/20 leading-none">0{i+1}</div>
              <div className="mt-4 text-white/80">{t}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-5 sm:px-8 py-24 text-center relative z-10">
        <Recycle className="h-12 w-12 text-[#00FF66] mx-auto animate-spin-slow" />
        <h2 className="font-display text-4xl md:text-5xl font-black mt-6">Ready to declutter?</h2>
        <p className="text-white/60 mt-3 max-w-lg mx-auto">Turn today's scrap into tomorrow's savings. And a cleaner planet.</p>
        <Button data-testid="footer-cta-btn" onClick={requestPickup} size="lg" className="mt-8 rounded-full bg-[#00FF66] hover:bg-[#00E055] text-black font-bold px-10 py-6">
          Request Pickup Now
        </Button>
      </section>

      <Footer />

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} role="seller" onSuccess={() => setPickupOpen(true)} />
      <PickupModal open={pickupOpen} onOpenChange={setPickupOpen} user={getUser()} />
    </div>
  );
}
