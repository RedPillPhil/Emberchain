import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Shell } from "@/components/layout/shell";
import { Swords, ArrowLeft, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RetroTvShell } from "@/components/embermon/retro-tv-shell";
import { NiftyBoyShell } from "@/components/embermon/cryptoboy-shell";
import { DirectInvadersScreen } from "@/components/chain-invaders/screens";
import { useChainInvadersCompetition } from "@/hooks/use-chain-invaders";
import "@/components/embermon/embermon.css";

const MOBILE_SHELL_QUERY = "(max-width: 820px)";

function useHandheldShell() {
  const [handheld, setHandheld] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_SHELL_QUERY);
    const update = () => setHandheld(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return handheld;
}

export default function ChainInvadersPage() {
  const handheld = useHandheldShell();
  const comp = useChainInvadersCompetition();

  return (
    <Shell>
      <div className="space-y-4 -mx-2 sm:-mx-0">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold uppercase tracking-tighter text-foreground flex items-center gap-2">
              <Swords className="w-7 h-7 text-primary" />
              Chain Invaders
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-sans uppercase tracking-widest font-bold mt-1">
              Daily jackpot arcade · 75% cumulative · 25% best run
            </p>
          </div>
          <Link
            href="/embermon"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary flex items-center gap-1 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            NiftyMon
          </Link>
        </div>

        <p className="text-sm text-muted-foreground max-w-2xl px-1 leading-relaxed">
          Pay <strong className="text-foreground">500 EMBR</strong> to enter the daily competition
          (noon–8pm Eastern). <strong className="text-foreground">75%</strong> of the pot goes to
          highest cumulative score, <strong className="text-foreground">25%</strong> to highest
          single-run score (same wallet can win both). Each run is locked with{" "}
          <strong className="text-foreground">commit–reveal</strong> plus an{" "}
          <strong className="text-foreground">ECDSA signature</strong> from the game server — players
          cannot forge scores.
        </p>

        <div className="flex flex-wrap items-center gap-3 px-1">
          {handheld && (
            <div className="flex items-center gap-2 text-sm font-mono font-bold text-primary border border-primary/30 bg-primary/10 px-3 py-1.5 rounded-sm">
              <Trophy className="w-4 h-4" />
              Daily jackpot: {comp.formatJackpot}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {comp.inWindow ? (
              <span className="text-green-400 font-bold uppercase">Live now</span>
            ) : (
              <span className="uppercase">Closed · opens noon Eastern</span>
            )}
            {comp.hasEntered && (
              <span className="ml-2 text-primary font-bold">· You&apos;re in</span>
            )}
          </div>
          {comp.contractConfigured && (
            <Button
              size="sm"
              disabled={comp.busy || !comp.inWindow || comp.hasEntered}
              onClick={() => void comp.enterCompetition()}
              className="ml-auto"
            >
              {comp.hasEntered ? "Entered today" : comp.busy ? "Entering…" : "Enter for 500 EMBR"}
            </Button>
          )}
          {!comp.contractConfigured && (
            <span className="text-xs text-amber-400 ml-auto">
              Contract pending deploy · play locally meanwhile
            </span>
          )}
        </div>

        {handheld ? (
          <NiftyBoyShell onPad={comp.pressPad}>
            <DirectInvadersScreen
              showJackpotOverlay={false}
              jackpotLabel={comp.jackpotLabel}
              onPadRef={comp.setPadHandler}
              onGameOver={(r) => void comp.submitScore(r)}
            />
          </NiftyBoyShell>
        ) : (
          <RetroTvShell>
            <DirectInvadersScreen
              showJackpotOverlay
              jackpotLabel={comp.jackpotLabel}
              onPadRef={comp.setPadHandler}
              onGameOver={(r) => void comp.submitScore(r)}
            />
          </RetroTvShell>
        )}

        <p className="text-xs text-muted-foreground px-1 text-center">
          {handheld
            ? "NiftyBoy · D-pad move · A/B fire · Start to begin / pause"
            : "NiftyVision · ← → move · Z / X / Space fire · Enter start · P pause"}
        </p>
      </div>
    </Shell>
  );
}
