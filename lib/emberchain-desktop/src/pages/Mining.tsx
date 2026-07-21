import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Cpu, Flame, Square, Zap } from "lucide-react";
import { api } from "../lib/api";

const STORAGE_KEY = "embr_active_address";

export default function Mining() {
  const qc = useQueryClient();
  const active = localStorage.getItem(STORAGE_KEY) ?? "";

  const status = useQuery({
    queryKey: ["miningStatus"],
    queryFn: api.miningStatus,
    refetchInterval: 3_000,
  });

  const start = useMutation({
    mutationFn: () => api.startMining(active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["miningStatus"] }),
  });

  const stop = useMutation({
    mutationFn: api.stopMining,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["miningStatus"] }),
  });

  const isMining = status.data?.isMining ?? false;
  const blocks = status.data?.blocksMinedThisSession ?? 0;
  const hashRate = status.data?.hashRate;

  return (
    <div className="p-8 animate-fade-in">
      <h1 className="text-2xl font-bold uppercase tracking-tight mb-1 flex items-center gap-3"
          style={{ fontFamily: "var(--font-display)" }}>
        <Flame className={`w-6 h-6 ${isMining ? "text-[var(--primary)] animate-pulse-slow" : "text-[var(--muted-foreground)]"}`} />
        Forge · Mine EMBR
      </h1>
      <p className="text-[var(--muted-foreground)] text-xs uppercase tracking-widest mb-8">
        CPU mining on your local node
      </p>

      {/* Status card */}
      <div className={`border rounded-sm p-6 mb-6 ${
        isMining
          ? "border-[var(--primary)]/30 bg-[var(--primary)]/5"
          : "border-[var(--border)] bg-[var(--card)]"
      }`}>
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-12 h-12 rounded-sm flex items-center justify-center ${
            isMining ? "bg-[var(--primary)]/20" : "bg-[var(--muted)]"
          }`}>
            <Cpu className={`w-6 h-6 ${isMining ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`} />
          </div>
          <div>
            <p className={`font-bold text-sm uppercase tracking-widest ${isMining ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}>
              {isMining ? "Mining Active" : "Mining Stopped"}
            </p>
            <p className="text-[var(--muted-foreground)] text-xs mt-0.5">
              {isMining
                ? `Mining to ${status.data?.minerAddress?.slice(0, 10)}…`
                : "Start mining to earn block rewards"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-[var(--border)] rounded-sm p-3">
            <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-widest mb-1">Blocks Found</p>
            <p className="font-mono font-bold text-xl text-[var(--foreground)]">{blocks}</p>
          </div>
          <div className="border border-[var(--border)] rounded-sm p-3">
            <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-widest mb-1">Hash Rate</p>
            <p className="font-mono font-bold text-xl text-[var(--foreground)]">
              {hashRate ? `${(hashRate / 1000).toFixed(1)} KH/s` : "—"}
            </p>
          </div>
        </div>

        {isMining ? (
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className="w-full h-11 rounded-sm font-bold text-sm uppercase tracking-widest border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4" />
            Stop Mining
          </button>
        ) : (
          <button
            onClick={() => start.mutate()}
            disabled={!active || start.isPending}
            className="w-full h-11 rounded-sm font-bold text-sm uppercase tracking-widest bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {start.isPending ? "Starting…" : "Start Mining"}
          </button>
        )}

        {!active && (
          <p className="text-xs text-[var(--muted-foreground)] text-center mt-2">
            Select a wallet in Overview first
          </p>
        )}
      </div>

      {/* Info */}
      <div className="border border-[var(--border)] rounded-sm p-4 space-y-2">
        <p className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-widest">How it works</p>
        <ul className="space-y-1 text-xs text-[var(--muted-foreground)]">
          <li>• Your local node mines against the full chain it downloaded</li>
          <li>• Block rewards (50 EMBR) go directly to your selected wallet</li>
          <li>• Shares are submitted to emberchain.org for pool rewards too</li>
          <li>• Mining stops automatically when you close the app</li>
        </ul>
      </div>
    </div>
  );
}
