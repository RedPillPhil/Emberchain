import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChainInvadersEngine,
  type PadButton,
  type PlayResult,
  type GamePhase,
  type RoundSeedProvider,
} from "./engine";
import { GameOverLeaderboardOverlay } from "./leaderboard";
import { cn } from "@/lib/utils";

export interface ChainInvadersGameProps {
  /** Desktop shows jackpot inside the canvas; mobile hides it here. */
  showJackpotOverlay?: boolean;
  jackpotLabel?: string;
  autoStart?: boolean;
  className?: string;
  /** Current tournament day for game-over leaderboard */
  leaderboardDayId?: bigint | number | null;
  /** Show cumulative boards overlay on game over (desktop) */
  showGameOverLeaderboard?: boolean;
  roundSeedProvider?: RoundSeedProvider | null;
  onPadRef?: (press: (button: PadButton, active: boolean) => void) => void;
  onGameOver?: (result: PlayResult) => void;
  onPhase?: (phase: GamePhase) => void;
}

export function ChainInvadersGame({
  showJackpotOverlay = true,
  jackpotLabel = "",
  autoStart = false,
  className,
  leaderboardDayId = null,
  showGameOverLeaderboard = false,
  roundSeedProvider = null,
  onPadRef,
  onGameOver,
  onPhase,
}: ChainInvadersGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ChainInvadersEngine | null>(null);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<GamePhase>("title");
  const seedProviderRef = useRef(roundSeedProvider);
  seedProviderRef.current = roundSeedProvider;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new ChainInvadersEngine(canvas, {
      onScore: setScore,
      onGameOver: (r) => onGameOver?.(r),
      onPhase: (p) => {
        setPhase(p);
        onPhase?.(p);
      },
    });
    engine.setRoundSeedProvider(async () => seedProviderRef.current?.() ?? null);
    engineRef.current = engine;
    engine.attachKeyboard();
    engine.startLoop();
    if (autoStart) engine.beginPlay();
    else engine.showTitle();

    onPadRef?.((button, active) => engine.pressPad(button, active));

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const label = showJackpotOverlay ? jackpotLabel : "";
    engineRef.current?.setJackpotLabel(label);
  }, [jackpotLabel, showJackpotOverlay]);

  const start = useCallback(() => {
    engineRef.current?.beginPlay();
  }, []);

  return (
    <div className={cn("relative w-full h-full bg-black", className)}>
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain image-rendering-pixelated"
        style={{ imageRendering: "pixelated" }}
        tabIndex={0}
      />
      <span className="sr-only">
        Score {score}, phase {phase}
      </span>
      {phase === "title" && (
        <button type="button" className="sr-only" onClick={start}>
          Start Chain Invaders
        </button>
      )}
      {showGameOverLeaderboard && (
        <GameOverLeaderboardOverlay
          open={phase === "gameover"}
          dayId={leaderboardDayId}
          onClose={start}
        />
      )}
    </div>
  );
}
