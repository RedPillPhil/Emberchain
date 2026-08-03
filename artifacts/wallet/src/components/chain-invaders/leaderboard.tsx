import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, Trophy } from "lucide-react";
import { resolveApiServer } from "@/lib/api-server";
import { cn } from "@/lib/utils";

export type LbPlayer = {
  player: string;
  cumulative: number;
  bestSingle: number;
};

export type AllTimeHigh = {
  player: string;
  score: number;
} | null;

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}.....${addr.slice(-4)}`;
}

async function fetchBoard(dayId: string | number, offset: number, limit = 10) {
  const api = resolveApiServer();
  const res = await fetch(
    `${api}/api/chain-invaders/leaderboard?dayId=${dayId}&offset=${offset}&limit=${limit}`,
  );
  if (!res.ok) throw new Error("leaderboard unavailable");
  return res.json() as Promise<{
    cumulative: { rows: LbPlayer[]; total: number };
    dailyBest: LbPlayer | null;
    allTime: { player: string; score: number } | null;
  }>;
}

export function useInvadersLeaderboard(dayId: bigint | number | null) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LbPlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [dailyBest, setDailyBest] = useState<LbPlayer | null>(null);
  const [allTime, setAllTime] = useState<AllTimeHigh>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (dayId === null || dayId === undefined) return;
    setLoading(true);
    try {
      const data = await fetchBoard(dayId.toString(), page * 10, 10);
      setRows(data.cumulative.rows ?? []);
      setTotal(Math.min(100, data.cumulative.total ?? 0));
      setDailyBest(data.dailyBest);
      setAllTime(data.allTime);
    } catch {
      /* keep last good */
    } finally {
      setLoading(false);
    }
  }, [dayId, page]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const maxPage = Math.max(0, Math.ceil(Math.min(100, total) / 10) - 1);

  return {
    page,
    setPage,
    maxPage,
    rows,
    total,
    dailyBest,
    allTime,
    loading,
    refresh,
  };
}

/** Mobile boards under the NiftyBoy */
export function MobileLeaderboards({
  dayId,
}: {
  dayId: bigint | number | null;
}) {
  const lb = useInvadersLeaderboard(dayId);

  return (
    <div className="space-y-3 px-1">
      <div className="text-center space-y-1 py-2 border border-primary/25 bg-primary/5 rounded-sm">
        <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-primary">
          <Crown className="w-3.5 h-3.5" />
          All-time high (tournament)
        </div>
        {lb.allTime ? (
          <p className="font-mono text-sm font-bold text-foreground">
            {shortAddr(lb.allTime.player)} · {lb.allTime.score.toLocaleString()}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No tournament scores yet</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BoardCard
          title="Daily cumulative"
          side="left"
          rows={lb.rows}
          page={lb.page}
          maxPage={lb.maxPage}
          onPrev={() => lb.setPage((p) => Math.max(0, p - 1))}
          onNext={() => lb.setPage((p) => Math.min(lb.maxPage, p + 1))}
          scoreKey="cumulative"
          empty="Enter & play in-window to rank"
        />
        <BoardCard
          title="Daily high score"
          side="right"
          highlight={lb.dailyBest}
          rows={lb.dailyBest ? [lb.dailyBest] : []}
          page={0}
          maxPage={0}
          onPrev={() => {}}
          onNext={() => {}}
          scoreKey="bestSingle"
          empty="—"
          hidePager
        />
      </div>
    </div>
  );
}

function BoardCard({
  title,
  rows,
  page,
  maxPage,
  onPrev,
  onNext,
  scoreKey,
  empty,
  highlight,
  hidePager,
}: {
  title: string;
  side?: "left" | "right";
  rows: LbPlayer[];
  page: number;
  maxPage: number;
  onPrev: () => void;
  onNext: () => void;
  scoreKey: "cumulative" | "bestSingle";
  empty: string;
  highlight?: LbPlayer | null;
  hidePager?: boolean;
}) {
  void highlight;
  const list = rows;
  return (
    <div className="border border-border/80 bg-card/50 rounded-sm p-2 space-y-1.5 min-h-[160px]">
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1">
        <Trophy className="w-3 h-3 text-primary" />
        {title}
      </div>
      {list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-snug">{empty}</p>
      ) : (
        <ol className="space-y-0.5">
          {list.map((r, i) => (
            <li
              key={r.player + i}
              className="flex justify-between gap-1 font-mono text-[10px] text-foreground"
            >
              <span className="truncate">
                {hidePager ? 1 : page * 10 + i + 1}. {shortAddr(r.player)}
              </span>
              <span className="font-bold text-primary shrink-0">
                {r[scoreKey].toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!hidePager && maxPage > 0 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            className="p-1 rounded-sm border border-border disabled:opacity-30"
            disabled={page <= 0}
            onClick={onPrev}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-muted-foreground">
            {page + 1}/{maxPage + 1}
          </span>
          <button
            type="button"
            className="p-1 rounded-sm border border-border disabled:opacity-30"
            disabled={page >= maxPage}
            onClick={onNext}
            aria-label="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Desktop game-over / Esc pause high-score overlay */
export function GameOverLeaderboardOverlay({
  open,
  dayId,
  mode = "gameover",
  onClose,
}: {
  open: boolean;
  dayId: bigint | number | null;
  mode?: "gameover" | "pause";
  onClose?: () => void;
}) {
  const lb = useInvadersLeaderboard(dayId);
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black/85 text-foreground flex flex-col p-3 sm:p-4 overflow-auto">
      <div className="text-center mb-3 space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold">
          {mode === "pause" ? "High Scores · Paused" : "Game Over"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Crown className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              All-time high
            </p>
            {lb.allTime ? (
              <p className="font-mono text-sm sm:text-base font-bold">
                {shortAddr(lb.allTime.player)} · {lb.allTime.score.toLocaleString()}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </div>
          <Crown className="w-5 h-5 text-amber-400" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <div className="border border-primary/30 bg-black/40 rounded-sm p-2 flex flex-col min-h-0">
          <p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-2">
            Cumulative (today)
          </p>
          <ol className="space-y-1 overflow-auto flex-1 text-[11px] font-mono">
            {lb.rows.length === 0 && (
              <li className="text-muted-foreground">No ranks yet</li>
            )}
            {lb.rows.map((r, i) => (
              <li key={r.player} className="flex justify-between gap-2">
                <span>
                  {lb.page * 10 + i + 1}. {shortAddr(r.player)}
                </span>
                <span className="text-primary">{r.cumulative.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          {lb.maxPage > 0 && (
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                className={cn("p-1 border border-border rounded-sm", lb.page <= 0 && "opacity-30")}
                disabled={lb.page <= 0}
                onClick={() => lb.setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] text-muted-foreground">
                {lb.page + 1}/{lb.maxPage + 1}
              </span>
              <button
                type="button"
                className={cn(
                  "p-1 border border-border rounded-sm",
                  lb.page >= lb.maxPage && "opacity-30",
                )}
                disabled={lb.page >= lb.maxPage}
                onClick={() => lb.setPage((p) => Math.min(lb.maxPage, p + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="border border-primary/30 bg-black/40 rounded-sm p-2">
          <p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-2">
            Daily high score
          </p>
          {lb.dailyBest ? (
            <p className="font-mono text-sm">
              {shortAddr(lb.dailyBest.player)}
              <br />
              <span className="text-primary font-bold text-lg">
                {lb.dailyBest.bestSingle.toLocaleString()}
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">—</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
            Tournament only — practice runs never rank.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 mx-auto text-xs uppercase tracking-widest font-bold text-primary border border-primary/40 px-3 py-1.5 rounded-sm"
      >
        {mode === "pause"
          ? "Esc / click to resume"
          : "Press Start / Enter to play again"}
      </button>
    </div>
  );
}
