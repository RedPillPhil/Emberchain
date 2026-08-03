import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Shell } from "@/components/layout/shell";
import { Gamepad2, ArrowLeft } from "lucide-react";
import { ComingSoonScreen } from "@/components/embermon/coming-soon-screen";
import { RetroTvShell } from "@/components/embermon/retro-tv-shell";
import { CryptoboyShell } from "@/components/embermon/cryptoboy-shell";
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

export default function EmbermonPage() {
  const handheld = useHandheldShell();

  return (
    <Shell>
      <div className="space-y-4 -mx-2 sm:-mx-0">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold uppercase tracking-tighter text-foreground flex items-center gap-2">
              <Gamepad2 className="w-7 h-7 text-primary" />
              Embermon
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-sans uppercase tracking-widest font-bold mt-1">
              Catch · Battle · Explore the Wasteland
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
          An Emberchain-native monster MMO built on RPG Maker XP — wild encounters, AI NPCs,
          real-time multiplayer, and on-chain Embermon NFTs when the network goes live.
        </p>

        {handheld ? (
          <CryptoboyShell>
            <ComingSoonScreen variant="handheld" />
          </CryptoboyShell>
        ) : (
          <RetroTvShell>
            <ComingSoonScreen variant="tv" />
          </RetroTvShell>
        )}
      </div>
    </Shell>
  );
}
