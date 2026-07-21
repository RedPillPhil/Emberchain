import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send as SendIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../lib/api";

const STORAGE_KEY = "embr_active_address";

export default function Send() {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [pk, setPk] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const active = localStorage.getItem(STORAGE_KEY) ?? "";
  const wallet = useQuery({
    queryKey: ["wallet", active],
    queryFn: () => api.wallet(active),
    enabled: !!active,
  });

  const send = useMutation({
    mutationFn: () => {
      const valueWei = BigInt(Math.round(parseFloat(amount) * 1e18)).toString();
      return api.send(active, to, valueWei, pk);
    },
    onSuccess: (data) => {
      setDone(data.hash);
      setTo(""); setAmount(""); setPk("");
    },
  });

  const balance = wallet.data
    ? (Number(BigInt(wallet.data.balance)) / 1e18).toFixed(4)
    : "—";

  return (
    <div className="p-8 max-w-md animate-fade-in">
      <h1 className="text-2xl font-bold uppercase tracking-tight mb-1" style={{ fontFamily: "var(--font-display)" }}>
        Transfer EMBR
      </h1>
      <p className="text-[var(--muted-foreground)] text-xs uppercase tracking-widest mb-8">
        Balance: {balance} EMBR
      </p>

      {done && (
        <div className="mb-6 p-4 border border-green-500/30 bg-green-500/5 rounded-sm flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-green-400 font-bold text-xs uppercase tracking-widest">Sent!</p>
            <p className="font-mono text-xs text-[var(--muted-foreground)] mt-1 break-all" data-selectable="">{done}</p>
          </div>
        </div>
      )}

      {send.error && (
        <div className="mb-6 p-4 border border-red-500/30 bg-red-500/5 rounded-sm flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-red-400 text-xs">{send.error.message}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-1.5">
            Recipient address
          </label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="0x…"
            className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-[var(--primary)]/40 placeholder:text-[var(--muted-foreground)]"
            style={{ userSelect: "text" } as React.CSSProperties}
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-1.5">
            Amount (EMBR)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="any"
            className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-[var(--primary)]/40 placeholder:text-[var(--muted-foreground)]"
            style={{ userSelect: "text" } as React.CSSProperties}
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-1.5">
            Private key
          </label>
          <input
            type="password"
            value={pk}
            onChange={(e) => setPk(e.target.value)}
            placeholder="0x… (never stored or sent)"
            className="w-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-sm px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-[var(--primary)]/40 placeholder:text-[var(--muted-foreground)]"
            style={{ userSelect: "text" } as React.CSSProperties}
          />
          <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
            Used locally to sign the transaction. Never leaves your machine.
          </p>
        </div>

        <button
          onClick={() => send.mutate()}
          disabled={!to || !amount || !pk || send.isPending}
          className="w-full h-11 rounded-sm font-bold text-sm uppercase tracking-widest bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
        >
          <SendIcon className="w-4 h-4" />
          {send.isPending ? "Sending…" : "Send EMBR"}
        </button>
      </div>
    </div>
  );
}
