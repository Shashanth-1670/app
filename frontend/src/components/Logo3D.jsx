import React from "react";
import { Recycle } from "lucide-react";

export const Logo3D = ({ size = "md" }) => {
  const sz = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const txt = size === "lg" ? "text-2xl" : "text-xl";
  return (
    <div className="flex items-center gap-3 select-none" data-testid="logo-3d">
      <div className="relative">
        <div className={`${sz} rounded-xl bg-gradient-to-br from-[#00FF66] to-[#00b348] flex items-center justify-center animate-3d glow-green`}>
          <span className="font-display font-black text-black text-lg">S</span>
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-display font-black ${txt} tracking-tight`}>
          Smart<span className="text-[#00FF66]">Scrap</span>
        </span>
        <Recycle className="h-4 w-4 text-[#00FF66] animate-spin-slow" data-testid="rotating-recycle-icon" />
      </div>
    </div>
  );
};
