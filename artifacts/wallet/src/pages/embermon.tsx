import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Shell } from "@/components/layout/shell";
import { Gamepad2, ArrowLeft, Swords } from "lucide-react";
import { RetroTvShell } from "@/components/embermon/retro-tv-shell";
import { NiftyBoyShell } from "@/components/embermon/cryptoboy-shell";
import { NiftyComingSoonHost, DirectInvadersScreen } from "@/components/chain-invaders/screens";
import { TournamentPanel } from "@/components/chain-invaders/tournament-panel";
import { MobileLeaderboards } from "@/components/chain-invaders/leaderboard";
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

export default function NiftyMonPage() {
  const handheld = useHandheldShell();
  const comp = useChainInvadersCompetition();
  const [playing, setPlaying] = useState(false);
  const boardDay = comp.inWindow ? comp.currentDayId : comp.entryDayId;

  return (
    <Shell>
      <div className="space-y-4 -mx-2 sm:-mx-0">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold uppercase tracking-tighter text-foreground flex items-center gap-2">
              <Gamepad2 className="w-7 h-7 text-primary" />
              NiftyMon
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-sans uppercase tracking-widest font-bold mt-1">
              Catch · Battle · Collect on-chain nifties
            </p>
          </div>
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary flex items-center gap-1 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
        </div>

        <p className="text-sm text-muted-foreground max-w-2xl px-1 leading-relaxed">
          An Emberchain-native monster MMO — wild encounters, AI NPCs, real-time multiplayer,
          and NiftyMon NFTs when the network goes live. Played on{" "}
          <strong className="text-foreground">{handheld ? "NiftyBoy" : "NiftyVision"}</strong>.
        </p>

        <TournamentPanel
          handheld={handheld}
          formatJackpot={comp.formatJackpot}
          inWindow={comp.inWindow}
          entryStatus={comp.entryStatus}
          practiceMode={comp.practiceMode}
          windowLabel={comp.windowLabel}
          busy={comp.busy}
          contractConfigured={comp.contractConfigured}
          onEnter={() => void comp.enterCompetition()}
        />

        {handheld ? (
          <>
            <NiftyBoyShell onPad={comp.pressPad}>
              <NiftyComingSoonHost variant="handheld" onStartGame={() => setPlaying(true)}>
                <DirectInvadersScreen
                  showJackpotOverlay={false}
                  jackpotLabel={comp.jackpotLabel}
                  onPadRef={comp.setPadHandler}
                  onGameOver={(r) => void comp.submitScore(r)}
                  roundSeedProvider={comp.fetchRoundSeed}
                />
              </NiftyComingSoonHost>
            </NiftyBoyShell>
            {playing && <MobileLeaderboards dayId={boardDay > 0n ? boardDay : null} />}
          </>
        ) : (
          <RetroTvShell>
            <NiftyComingSoonHost variant="tv" onStartGame={() => setPlaying(true)}>
              <DirectInvadersScreen
                showJackpotOverlay
                jackpotLabel={comp.jackpotLabel}
                onPadRef={comp.setPadHandler}
                onGameOver={(r) => void comp.submitScore(r)}
                leaderboardDayId={boardDay > 0n ? boardDay : null}
                showGameOverLeaderboard
                roundSeedProvider={comp.fetchRoundSeed}
              />
            </NiftyComingSoonHost>
          </RetroTvShell>
        )}

        {playing && (
          <p className="text-xs text-muted-foreground px-1 text-center">
            Chain Invaders ·{" "}
            {handheld
              ? "D-pad move · A fire · Start pause"
              : "← → move · Z/X/Space fire · Enter start · P pause · leaderboard on game over"}
          </p>
        )}

        <div className="px-1">
          <Link
            href="/chain-invaders"
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary hover:underline"
          >
            <Swords className="w-4 h-4" />
            Open Chain Invaders arcade
          </Link>
        </div>
      </div>
    </Shell>
  );
}
