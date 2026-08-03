import { Trophy, Clock, CheckCircle2, CircleDashed, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EntryStatus } from "@/hooks/use-chain-invaders";

export function TournamentPanel({
  handheld,
  formatJackpot,
  inWindow,
  entryStatus,
  practiceMode,
  windowLines,
  busy,
  contractConfigured,
  onEnter,
}: {
  handheld: boolean;
  formatJackpot: string;
  inWindow: boolean;
  entryStatus: EntryStatus;
  practiceMode: boolean;
  windowLines: string[];
  busy: boolean;
  contractConfigured: boolean;
  onEnter: () => void;
}) {
  const entered = entryStatus === "entered_live" || entryStatus === "entered_next";

  return (
    <div className="border border-border/80 bg-card/60 rounded-sm p-4 space-y-3 mx-1">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-display font-bold uppercase tracking-wide text-foreground">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            Daily tournament
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Scoring window:</strong> 16:00–24:00 UTC daily.
          </p>
          {contractConfigured && windowLines.length > 0 && (
            <div className="font-mono text-[11px] text-muted-foreground/90 leading-relaxed space-y-0.5 pt-0.5">
              {windowLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter anytime after the last contest ends (500 EMBR). Play for fun anytime —
            practice scores don&apos;t count until you&apos;re entered and the window is live.
          </p>
        </div>

        {handheld && (
          <div className="flex items-center gap-2 text-sm font-mono font-bold text-primary border border-primary/30 bg-primary/10 px-3 py-1.5 rounded-sm shrink-0">
            <Trophy className="w-4 h-4" />
            {formatJackpot}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {inWindow ? (
          <span className="inline-flex items-center gap-1.5 bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-1 rounded-sm font-bold uppercase tracking-wide">
            Tournament live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-secondary text-muted-foreground border border-border px-2 py-1 rounded-sm font-bold uppercase tracking-wide">
            Between contests · opens 16:00 UTC
          </span>
        )}

        {entryStatus === "entered_live" && (
          <span className="inline-flex items-center gap-1.5 bg-primary/15 text-primary border border-primary/30 px-2 py-1 rounded-sm font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Entered — scores count
          </span>
        )}
        {entryStatus === "entered_next" && (
          <span className="inline-flex items-center gap-1.5 bg-primary/15 text-primary border border-primary/30 px-2 py-1 rounded-sm font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Entered for next contest
          </span>
        )}
        {entryStatus === "not_entered" && contractConfigured && (
          <span className="inline-flex items-center gap-1.5 bg-secondary text-muted-foreground border border-border px-2 py-1 rounded-sm font-bold">
            <CircleDashed className="w-3.5 h-3.5" />
            Not entered yet
          </span>
        )}
        {practiceMode && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground px-1">
            <Gamepad2 className="w-3.5 h-3.5" />
            Practice mode — play freely
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {!handheld && (
          <div className="flex items-center gap-2 text-sm font-mono font-bold text-primary">
            <Trophy className="w-4 h-4" />
            Jackpot: {formatJackpot}
          </div>
        )}
        {contractConfigured ? (
          <Button
            size="sm"
            disabled={busy || entered}
            onClick={onEnter}
            className="ml-auto"
          >
            {entered
              ? entryStatus === "entered_next"
                ? "Registered for next contest"
                : "Entered — good luck"
              : busy
                ? "Entering…"
                : inWindow
                  ? "Enter today's contest — 500 EMBR"
                  : "Enter next contest — 500 EMBR"}
          </Button>
        ) : (
          <span className="text-xs text-amber-400 ml-auto">
            Contract pending deploy · practice anytime
          </span>
        )}
      </div>
    </div>
  );
}
