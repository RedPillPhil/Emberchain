import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownLeft, Blocks, Zap, Clock } from "lucide-react";
import { api, Wallet, ChainStatus, Transaction } from "../lib/api";
import { Page } from "./WalletApp";

const STORAGE_KEY = "embr_active_address";

function fmt(wei: string, decimals = 4): string {
  try {
    const n = Number(BigInt(wei)) / 1e18;
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  } catch {
    return "—";
  }
}

function timeSince(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Overview({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const active = localStorage.getItem(STORAGE_KEY) ?? "";

  const wallets = useQuery({ queryKey: ["wallets"], queryFn: api.wallets, refetchInterval: 15_000 });
  const status = useQuery({ queryKey: ["chainStatus"], queryFn: api.chainStatus, refetchInterval: 8_000 });
  const txs = useQuery({
    queryKey: ["transactions", active],
    queryFn: () => api.transactions(active || undefined),
    enabled: true,
    refetchInterval: 15_000,
  });

  const activeWallet: Wallet | undefined = wallets.data?.find(
    (w) => w.address.toLowerCase() === active.toLowerCase()
  ) ?? wallets.data?.[0];

  const chainStatus: ChainStatus | undefined = status.data;
  const recentTxs: Transaction[] = txs.data?.slice(0, 8) ?? [];

  const setActive = (addr: string) => {
    localStorage.setItem(STORAGE_KEY, addr);
    wallets.refetch();
  };

  return (
    <div className="p-8 space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-[var(--foreground)]"
              style={{ fontFamily: "var(--font-display)" }}>
            Overview
          </h1>
          <p className="text-[var(--muted-foreground)] text-xs uppercase tracking-widest mt-1">
            Local Emberchain Node · Chain ID 7773
          </p>
        </div>

        {/* Wallet selector */}
        {wallets.data && wallets.data.length > 0 && (
          <select
            value={activeWallet?.address ?? ""}
            onChange={(e) => setActive(e.target.value)}
            className="bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-xs rounded-sm px-3 py-2 font-mono focus:outline-none focus:border-[var(--primary)]/40"
            style={{ userSelect: "text" } as React.CSSProperties}
          >
            {wallets.data.map((w) => (
              <option key={w.address} value={w.address}>
                {w.address.slice(0, 8)}…{w.address.slice(-6)}
                {w.label ? ` (${w.label})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Balance card */}
      <div className="border border-[var(--primary)]/20 bg-[var(--primary)]/5 rounded-sm p-6 glow">
        <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-2">Balance</p>
        <div className="text-4xl font-bold text-[var(--foreground)] glow-text font-mono">
          {activeWallet ? fmt(activeWallet.balance) : "—"}
          <span className="text-xl text-[var(--primary)] ml-2">EMBR</span>
        </div>
        <p className="text-[var(--muted-foreground)] font-mono text-xs mt-2 select-text" data-selectable="">
          {activeWallet?.address ?? "No wallet"}
        </p>
      </div>

      {/* Chain status */}
      {chainStatus && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Blocks, label: "Block Height", value: `#${chainStatus.height.toLocaleString()}` },
            { icon: Zap, label: "Difficulty", value: Number(chainStatus.difficulty).toLocaleString() },
            { icon: Clock, label: "Avg Block", value: chainStatus.avgBlockTime ? `${chainStatus.avgBlockTime.toFixed(1)}s` : "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="border border-[var(--border)] bg-[var(--card)] rounded-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-widest">{label}</span>
              </div>
              <p className="text-[var(--foreground)] font-mono font-bold text-sm">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
            Recent Transactions
          </h2>
          <button
            onClick={() => onNavigate("transactions")}
            className="text-xs text-[var(--primary)] uppercase tracking-widest hover:underline"
          >
            View all →
          </button>
        </div>

        {recentTxs.length === 0 ? (
          <div className="border border-[var(--border)] rounded-sm p-6 text-center">
            <p className="text-[var(--muted-foreground)] text-sm">No transactions yet</p>
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-sm overflow-hidden">
            {recentTxs.map((tx, i) => {
              const isSend = tx.from.toLowerCase() === activeWallet?.address.toLowerCase();
              return (
                <div
                  key={tx.hash}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <div className={`w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 ${isSend ? "bg-red-500/10" : "bg-green-500/10"}`}>
                    {isSend
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />
                      : <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-[var(--foreground)] truncate">
                      {isSend ? `→ ${tx.to}` : `← ${tx.from}`}
                    </p>
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      {tx.timestamp ? timeSince(tx.timestamp) : "pending"} · #{tx.blockNumber ?? "?"}
                    </p>
                  </div>
                  <p className={`font-mono font-bold text-sm flex-shrink-0 ${isSend ? "text-red-400" : "text-green-400"}`}>
                    {isSend ? "-" : "+"}{fmt(tx.value, 2)} EMBR
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
