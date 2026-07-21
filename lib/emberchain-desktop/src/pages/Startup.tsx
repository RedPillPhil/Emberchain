import { invoke } from "@tauri-apps/api/core";
import { NodeStatusPayload } from "../App";

const STATE_LABELS: Record<string, string> = {
  checking: "Checking for Node.js…",
  syncing: "Syncing chain data…",
  starting: "Starting local node…",
  ready: "Ready!",
  error: "Something went wrong",
  "no-node": "Node.js required",
};

const ICONS: Record<string, string> = {
  checking: "◌",
  syncing: "⬇",
  starting: "◌",
  ready: "✓",
  error: "✗",
  "no-node": "✗",
};

export default function Startup({ status }: { status: NodeStatusPayload }) {
  const isError = status.state === "error" || status.state === "no-node";
  const isSpinning = status.state === "checking" || status.state === "starting";
  const label = STATE_LABELS[status.state] ?? status.state;

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-[var(--background)] select-none">

      {/* Ember logo */}
      <div className="mb-10 text-center">
        <div className="text-6xl mb-4 glow-text">🔥</div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] uppercase"
            style={{ fontFamily: "var(--font-display)", letterSpacing: "0.15em" }}>
          EMBERCHAIN
        </h1>
        <p className="text-[var(--muted-foreground)] text-xs uppercase tracking-widest mt-1">
          DESKTOP WALLET · FULL NODE
        </p>
      </div>

      {/* Status card */}
      <div className={`
        w-96 border rounded-sm p-6 space-y-5 animate-fade-in
        ${isError
          ? "border-red-500/40 bg-red-500/5"
          : "border-[var(--border)] bg-[var(--card)]"}
      `}>

        {/* Icon + state label */}
        <div className="flex items-center gap-3">
          <span className={`
            text-xl font-mono
            ${isSpinning ? "animate-spin" : ""}
            ${isError ? "text-red-400" : "text-[var(--primary)]"}
          `}>
            {ICONS[status.state] ?? "◌"}
          </span>
          <span className={`text-sm font-semibold uppercase tracking-widest ${isError ? "text-red-400" : "text-[var(--primary)]"}`}>
            {label}
          </span>
        </div>

        {/* Message */}
        <p className="text-[var(--muted-foreground)] text-sm leading-relaxed font-mono">
          {status.message}
        </p>

        {/* Progress bar (only when syncing/starting) */}
        {!isError && status.progress > 0 && status.progress < 1 && (
          <div className="w-full h-1 bg-[var(--muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] transition-all duration-500 rounded-full"
              style={{ width: `${Math.round(status.progress * 100)}%` }}
            />
          </div>
        )}

        {/* Error actions */}
        {status.state === "no-node" && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">
              Emberchain Desktop requires Node.js v20 or newer to run the local chain node.
            </p>
            <a
              href="https://nodejs.org/en/download"
              target="_blank"
              rel="noreferrer"
              className="block w-full text-center py-2 border border-[var(--primary)]/40 text-[var(--primary)] text-xs uppercase tracking-widest rounded-sm hover:bg-[var(--primary)]/10 transition-colors"
            >
              Download Node.js →
            </a>
          </div>
        )}

        {status.state === "error" && (
          <button
            onClick={() => invoke("resync_chain")}
            className="w-full py-2 border border-[var(--border)] text-[var(--muted-foreground)] text-xs uppercase tracking-widest rounded-sm hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      {/* Footer */}
      <p className="mt-10 text-[var(--muted-foreground)] text-xs">
        v0.1.0 · emberchain.org
      </p>
    </div>
  );
}
