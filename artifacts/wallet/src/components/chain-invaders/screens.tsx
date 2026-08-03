import { useEffect, useState, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ComingSoonScreen } from "@/components/embermon/coming-soon-screen";
import { ChainInvadersGame } from "@/components/chain-invaders/game";
import type { PadButton, PlayResult, GamePhase } from "@/components/chain-invaders/engine";

type ScreenMode = "boot" | "prompt" | "game";

export function NiftyComingSoonHost({
  variant,
  onStartGame,
  children,
}: {
  variant: "tv" | "handheld";
  onStartGame?: () => void;
  children?: ReactNode;
}) {
  const [mode, setMode] = useState<ScreenMode>("boot");
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Coming Soon visible ~2s after it pops in (power-on ends ~2.2s, then +2s)
    const t = window.setTimeout(() => setShowPrompt(true), 4200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showPrompt || mode !== "boot") return;
    setMode("prompt");
  }, [showPrompt, mode]);

  const launch = useCallback(() => {
    setMode("game");
    onStartGame?.();
  }, [onStartGame]);

  useEffect(() => {
    if (mode !== "prompt") return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "enter" || k === " " || e.code === "Space") {
        e.preventDefault();
        launch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, launch]);

  if (mode === "game") {
    return <>{children}</>;
  }

  return (
    <div className="relative w-full h-full">
      <ComingSoonScreen variant={variant} />
      {mode === "prompt" && (
        <div className="absolute inset-x-0 bottom-[12%] z-30 px-3 text-center pointer-events-none">
          <p
            className={cn(
              "font-mono font-bold uppercase tracking-wide text-primary animate-embermon-pulse-sub",
              variant === "handheld" ? "text-[9px] leading-tight" : "text-sm sm:text-base",
            )}
          >
            {variant === "handheld"
              ? "Play Chain Invaders instead? Press Start"
              : "Play Chain Invaders instead? Press Enter / Space"}
          </p>
        </div>
      )}
      {/* Hidden Start catcher for pad wiring from parent */}
      {mode === "prompt" && (
        <button
          type="button"
          data-nifty-start
          className="absolute inset-0 z-20 opacity-0"
          aria-label="Start Chain Invaders"
          onClick={launch}
        />
      )}
    </div>
  );
}

export function DirectInvadersScreen({
  showJackpotOverlay,
  jackpotLabel,
  onPadRef,
  onGameOver,
  onPhase,
}: {
  showJackpotOverlay: boolean;
  jackpotLabel: string;
  onPadRef?: (press: (button: PadButton, active: boolean) => void) => void;
  onGameOver?: (result: PlayResult) => void;
  onPhase?: (phase: GamePhase) => void;
}) {
  return (
    <ChainInvadersGame
      showJackpotOverlay={showJackpotOverlay}
      jackpotLabel={jackpotLabel}
      onPadRef={onPadRef}
      onGameOver={onGameOver}
      onPhase={onPhase}
    />
  );
}
