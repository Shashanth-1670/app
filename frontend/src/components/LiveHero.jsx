import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Recycle, Leaf, Coins } from "lucide-react";

// Public recycling video (Pexels CDN) — muted, looped, autoplay, playsinline
const HERO_VIDEO = "https://videos.pexels.com/video-files/6963744/6963744-hd_1920_1080_30fps.mp4";
const HERO_POSTER = "https://images.unsplash.com/photo-1561503412-852800622772?crop=entropy&cs=srgb&fm=jpg&w=1920&q=80";

const FloatingIcon = ({ Icon, delay, left, size = 20 }) => (
  <motion.div
    initial={{ y: "110vh", opacity: 0 }}
    animate={{ y: "-20vh", opacity: [0, 0.6, 0.6, 0] }}
    transition={{ duration: 14 + delay * 0.7, delay, repeat: Infinity, ease: "linear" }}
    className="absolute pointer-events-none"
    style={{ left: `${left}%`, filter: "drop-shadow(0 0 12px rgba(0,255,102,0.6))" }}
  >
    <Icon className="text-[#00FF66]" style={{ height: size, width: size }} />
  </motion.div>
);

export const LiveHero = () => {
  const floaters = useMemo(() => {
    const items = [];
    const icons = [Recycle, Leaf, Coins];
    for (let i = 0; i < 14; i++) {
      items.push({
        Icon: icons[i % icons.length],
        delay: i * 1.1,
        left: 4 + ((i * 17) % 92),
        size: 14 + ((i * 7) % 18),
      });
    }
    return items;
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="live-hero-bg">
      {/* Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        poster={HERO_POSTER}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "saturate(1.15) contrast(1.05)" }}
      >
        <source src={HERO_VIDEO} type="video/mp4" />
      </video>

      {/* Deep dark scrim so text stays readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/70 via-[#050505]/60 to-[#050505]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/30 to-transparent" />

      {/* Animated color blobs (liquid feel) */}
      <motion.div
        aria-hidden
        className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle,#00FF66 0%,transparent 60%)", opacity: 0.35 }}
        animate={{ scale: [1, 1.2, 1], x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute top-1/4 -right-40 w-[600px] h-[600px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle,#10b981 0%,transparent 60%)", opacity: 0.25 }}
        animate={{ scale: [1.1, 1, 1.1], x: [0, -40, 0], y: [0, 60, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle,#22d3ee 0%,transparent 60%)", opacity: 0.15 }}
        animate={{ scale: [1, 1.15, 1], x: [0, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Grid mesh overlay */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,255,102,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,102,0.5) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
        }}
      />

      {/* Floating eco icons */}
      <div className="absolute inset-0 pointer-events-none">
        {floaters.map((f, i) => <FloatingIcon key={i} {...f} />)}
      </div>

      {/* Bottom vignette to blend with page */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050505] to-transparent" />
    </div>
  );
};
