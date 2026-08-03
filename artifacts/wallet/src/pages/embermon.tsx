import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Shell } from "@/components/layout/shell";
import { Gamepad2, ArrowLeft, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RetroTvShell } from "@/components/embermon/retro-tv-shell";
import { NiftyBoyShell } from "@/components/embermon/cryptoboy-shell";
import { NiftyComingSoonHost, DirectInvadersScreen } from "@/components/chain-invaders/screens";
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

function CompetitionBar({
  handheld,
  formatJackpot,
  inWindow,
  hasEntered,
  busy,
  contractConfigured,
  onEnter,
}: {
  handheld: boolean;
  formatJackpot: string;
  inWindow: boolean;
  hasEntered: boolean;
  busy: boolean;
  contractConfigured: boolean;
  onEnter: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-1">
      {handheld && (
        <div className="flex items-center gap-2 text-sm font-mono font-bold text-primary border border-primary/30 bg-primary/10 px-3 py-1.5 rounded-sm">
          <Trophy className="w-4 h-4" />
          Daily jackpot: {formatJackpot}
        </div>
      )}
      <div className="text-xs text-muted-foreground font-sans">
        {inWindow ? (
          <span className="text-green-400 font-bold uppercase tracking-wide">Competition live</span>
        ) : (
          <span className="uppercase tracking-wide">Window closed · noon–8pm Eastern</span>
        )}
        {" · "}500 EMBR · 75% cumulative / 25% best run · ECDSA-signed
      </div>
      {contractConfigured && (
        <Button
          size="sm"
          disabled={busy || !inWindow || hasEntered}
          onClick={onEnter}
          className="ml-auto"
        >
          {hasEntered ? "Entered today" : busy ? "Entering…" : "Enter for 500 EMBR"}
        </Button>
      )}
    </div>
  );
}

export default function NiftyMonPage() {
  const handheld = useHandheldShell();
  const comp = useChainInvadersCompetition();
  const [playing, setPlaying] = useState(false);

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

        <CompetitionBar
          handheld={handheld}
          formatJackpot={comp.formatJackpot}
          inWindow={comp.inWindow}
          hasEntered={comp.hasEntered}
          busy={comp.busy}
          contractConfigured={comp.contractConfigured}
          onEnter={() => void comp.enterCompetition()}
        />

        {handheld ? (
          <NiftyBoyShell onPad={comp.pressPad}>
            <NiftyComingSoonHost variant="handheld" onStartGame={() => setPlaying(true)}>
              <DirectInvadersScreen
                showJackpotOverlay={false}
                jackpotLabel={comp.jackpotLabel}
                onPadRef={comp.setPadHandler}
                onGameOver={(r) => void comp.submitScore(r)}
              />
            </NiftyComingSoonHost>
          </NiftyBoyShell>
        ) : (
          <RetroTvShell>
            <NiftyComingSoonHost variant="tv" onStartGame={() => setPlaying(true)}>
              <DirectInvadersScreen
                showJackpotOverlay
                jackpotLabel={comp.jackpotLabel}
                onPadRef={comp.setPadHandler}
                onGameOver={(r) => void comp.submitScore(r)}
              />
            </NiftyComingSoonHost>
          </RetroTvShell>
        )}

        {playing && (
          <p className="text-xs text-muted-foreground px-1 text-center">
            Chain Invaders · {handheld ? "D-pad move · A fire · Start pause" : "← → move · Z/X/Space fire · Enter start · P pause"}
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
