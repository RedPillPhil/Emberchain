import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Shell } from "@/components/layout/shell";
import { Swords, ArrowLeft } from "lucide-react";
import { RetroTvShell } from "@/components/embermon/retro-tv-shell";
import { NiftyBoyShell } from "@/components/embermon/cryptoboy-shell";
import { DirectInvadersScreen } from "@/components/chain-invaders/screens";
import { TournamentPanel } from "@/components/chain-invaders/tournament-panel";
import { MobileLeaderboards } from "@/components/chain-invaders/leaderboard";
import { useChainInvadersCompetition } from "@/hooks/use-chain-invaders";
import { useAirdropVisitConfirm } from "@/hooks/use-airdrop-visit";
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
  useAirdropVisitConfirm();
  const handheld = useHandheldShell();
  const comp = useChainInvadersCompetition();
  const boardDay = comp.inWindow ? comp.currentDayId : comp.entryDayId;

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
              Practice anytime · tournament 16:00–24:00 UTC
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
          Jump in whenever you want for practice. When you&apos;re ready, pay{" "}
          <strong className="text-foreground">500 EMBR</strong> to enter the daily contest —
          available as soon as the previous day ends. During{" "}
          <strong className="text-foreground">16:00–24:00 UTC</strong>, entered players&apos;
          scores count toward the jackpot (75% cumulative / 25% best single run). Practice scores
          never appear on leaderboards.
        </p>

        <TournamentPanel
          handheld={handheld}
          formatJackpot={comp.formatJackpot}
          inWindow={comp.inWindow}
          entryStatus={comp.entryStatus}
          practiceMode={comp.practiceMode}
          windowLines={comp.windowLines}
          countdownLabel={comp.countdownLabel}
          countdownText={comp.countdownText}
          countdownMode={comp.countdownMode}
          settlePending={comp.settlePending}
          unsettledPotLabel={comp.unsettledPotLabel}
          busy={comp.busy}
          contractConfigured={comp.contractConfigured}
          onEnter={() => void comp.enterCompetition()}
          onSettle={() => void comp.settleWinners()}
        />

        {handheld ? (
          <>
            <p className="text-xs text-muted-foreground px-2 text-center leading-relaxed">
              Tip: slide your finger back and forth on the directional pad rather than lifting!
            </p>
            <NiftyBoyShell onPad={comp.pressPad}>
              <DirectInvadersScreen
                showJackpotOverlay={false}
                jackpotLabel={comp.jackpotLabel}
                onPadRef={comp.setPadHandler}
                onGameOver={(r) => void comp.submitScore(r)}
                roundSeedProvider={comp.fetchRoundSeed}
              />
            </NiftyBoyShell>
            <MobileLeaderboards dayId={boardDay > 0n ? boardDay : null} />
          </>
        ) : (
          <RetroTvShell>
            <DirectInvadersScreen
              showJackpotOverlay
              jackpotLabel={comp.jackpotLabel}
              onPadRef={comp.setPadHandler}
              onGameOver={(r) => void comp.submitScore(r)}
              leaderboardDayId={boardDay > 0n ? boardDay : null}
              showGameOverLeaderboard
              roundSeedProvider={comp.fetchRoundSeed}
            />
          </RetroTvShell>
        )}

        <p className="text-xs text-muted-foreground px-1 text-center">
          {handheld
            ? "NiftyBoy · D-pad move · A/B fire · Start to begin / pause"
            : "NiftyVision · ← → move · Z / X / Space fire · Enter start · P pause · Esc high scores"}
        </p>
      </div>
    </Shell>
  );
}
