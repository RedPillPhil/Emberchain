import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Phase = "off" | "static" | "power" | "live";

export function ComingSoonScreen({ variant = "tv" }: { variant?: "tv" | "handheld" }) {
  const [phase, setPhase] = useState<Phase>("off");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("static"), 400);
    const t2 = window.setTimeout(() => setPhase("power"), 1400);
    const t3 = window.setTimeout(() => setPhase("live"), 2200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, []);

  return (
    <div
      className={cn(
        "relative w-full h-full overflow-hidden bg-black select-none",
        phase === "off" && "opacity-30",
        (phase === "power" || phase === "live") && "embermon-screen-on",
        variant === "handheld" && "embermon-handheld-screen",
      )}
    >
      {/* CRT power-on line */}
      <div
        className={cn(
          "absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-white/90 z-20 pointer-events-none transition-opacity duration-300",
          phase === "power" ? "opacity-100 animate-embermon-power-line" : "opacity-0",
        )}
      />

      {/* Static burst */}
      <div
        className={cn(
          "absolute inset-0 z-10 pointer-events-none embermon-static-noise",
          phase === "static" ? "opacity-90" : "opacity-0 transition-opacity duration-500",
        )}
      />

      {/* Scanlines */}
      <div
        className={cn(
          "absolute inset-0 z-[5] pointer-events-none embermon-scanlines transition-opacity duration-700",
          phase === "live" || phase === "power" ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Vignette */}
      <div className="absolute inset-0 z-[6] pointer-events-none shadow-[inset_0_0_80px_rgba(0,0,0,0.85)]" />

      {/* Main message */}
      <div
        className={cn(
          "absolute inset-0 z-[15] flex flex-col items-center justify-center gap-3 px-4 text-center transition-all duration-700",
          phase === "live" ? "opacity-100 scale-100" : "opacity-0 scale-95",
        )}
      >
        <p className="text-[10px] sm:text-xs font-mono tracking-[0.55em] text-primary/80 uppercase animate-embermon-flicker">
          Signal acquired
        </p>
        <h1 className="embermon-coming-soon font-display font-black uppercase tracking-tighter leading-none">
          Coming
          <br />
          Soon
        </h1>
        <p className="text-[11px] sm:text-sm font-mono text-orange-400/90 tracking-widest uppercase animate-embermon-pulse-sub">
          NiftyMon · Emberchain MMO
        </p>
      </div>
    </div>
  );
}
