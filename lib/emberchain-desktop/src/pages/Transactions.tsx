import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownLeft, Clock } from "lucide-react";
import { api, Transaction } from "../lib/api";

const STORAGE_KEY = "embr_active_address";

function fmt(wei: string): string {
  try {
    return (Number(BigInt(wei)) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return "—";
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Pending";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function Transactions() {
  const active = localStorage.getItem(STORAGE_KEY) ?? "";

  const txs = useQuery({
    queryKey: ["transactions", active],
    queryFn: () => api.transactions(active || undefined),
    refetchInterval: 15_000,
  });

  const data: Transaction[] = txs.data ?? [];

  return (
    <div className="p-8 animate-fade-in">
      <h1 className="text-2xl font-bold uppercase tracking-tight mb-1" style={{ fontFamily: "var(--font-display)" }}>
        Transaction History
      </h1>
      <p className="text-[var(--muted-foreground)] text-xs uppercase tracking-widest mb-8">
        {active ? `${active.slice(0, 8)}…${active.slice(-6)}` : "All wallets"}
      </p>

      {txs.isLoading && (
        <p className="text-[var(--muted-foreground)] text-sm">Loading…</p>
      )}

      {data.length === 0 && !txs.isLoading && (
        <div className="border border-[var(--border)] rounded-sm p-12 text-center">
          <Clock className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-3" />
          <p className="text-[var(--muted-foreground)] text-sm">No transactions found</p>
        </div>
      )}

      {data.length > 0 && (
        <div className="border border-[var(--border)] rounded-sm overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-0 text-[10px] text-[var(--muted-foreground)] uppercase tracking-widest px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/30">
            <span className="w-8" />
            <span>From / To</span>
            <span className="text-right pr-8">Amount</span>
            <span className="text-right w-36">Time · Block</span>
          </div>

          {data.map((tx, i) => {
            const isSend = tx.from.toLowerCase() === active.toLowerCase();
            return (
              <div
                key={tx.hash}
                className={`grid grid-cols-[auto_1fr_auto_auto] gap-0 items-center px-4 py-3
                  ${i > 0 ? "border-t border-[var(--border)]" : ""}
                  hover:bg-[var(--muted)]/20 transition-colors`}
              >
                <div className={`w-7 h-7 rounded-sm flex items-center justify-center mr-3 flex-shrink-0 ${isSend ? "bg-red-500/10" : "bg-green-500/10"}`}>
                  {isSend
                    ? <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                    : <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />}
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[var(--foreground)] truncate">
                    {isSend
                      ? <><span className="text-[var(--muted-foreground)]">To </span>{tx.to}</>
                      : <><span className="text-[var(--muted-foreground)]">From </span>{tx.from}</>}
                  </p>
                  <p className="font-mono text-[10px] text-[var(--muted-foreground)] truncate" data-selectable="">{tx.hash}</p>
                </div>
                <p className={`font-mono font-bold text-sm px-8 flex-shrink-0 ${isSend ? "text-red-400" : "text-green-400"}`}>
                  {isSend ? "-" : "+"}{fmt(tx.value)}
                </p>
                <div className="text-right w-36 flex-shrink-0">
                  <p className="text-xs text-[var(--foreground)]">{fmtDate(tx.timestamp)}</p>
                  <p className="text-[10px] text-[var(--muted-foreground)]">#{tx.blockNumber ?? "pending"}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
