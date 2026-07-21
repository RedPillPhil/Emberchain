import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";

export default function Settings() {
  const [resyncing, setResyncing] = useState(false);
  const [dataPath, setDataPath] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["chainStatus"], queryFn: api.chainStatus });

  // Get chain data path from Rust
  invoke<string>("chain_data_path").then(setDataPath).catch(() => {});

  async function handleResync() {
    if (!confirm("This will delete your local chain data and re-download it from emberchain.org. Continue?")) return;
    setResyncing(true);
    try {
      await invoke("resync_chain");
    } catch (e) {
      alert(`Resync failed: ${e}`);
      setResyncing(false);
    }
  }

  return (
    <div className="p-8 max-w-lg animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold uppercase tracking-tight mb-1" style={{ fontFamily: "var(--font-display)" }}>
          Settings
        </h1>
        <p className="text-[var(--muted-foreground)] text-xs uppercase tracking-widest">
          Local node configuration
        </p>
      </div>

      {/* Node info */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
          Node Status
        </h2>
        <div className="border border-[var(--border)] rounded-sm divide-y divide-[var(--border)]">
          {[
            { label: "RPC URL", value: "http://localhost:8545/api/rpc" },
            { label: "Chain ID", value: "7773" },
            { label: "Block Height", value: status.data ? `#${status.data.height.toLocaleString()}` : "—" },
            { label: "Network", value: status.data?.network ?? "emberchain" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-[var(--muted-foreground)] uppercase tracking-widest">{label}</span>
              <span className="font-mono text-xs text-[var(--foreground)] select-text" data-selectable="">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* MetaMask instructions */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
          Connect MetaMask
        </h2>
        <div className="border border-[var(--border)] rounded-sm p-4 space-y-2">
          {[
            ["Network name", "Emberchain"],
            ["RPC URL", "http://localhost:8545/api/rpc"],
            ["Chain ID", "7773"],
            ["Currency symbol", "EMBR"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">{k}</span>
              <span className="font-mono text-[var(--foreground)] select-text" data-selectable="">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Chain data */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
          Chain Data
        </h2>
        <div className="border border-[var(--border)] rounded-sm p-4 space-y-3">
          <div className="flex items-start gap-3">
            <HardDrive className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-1">Data file</p>
              <p className="font-mono text-xs text-[var(--foreground)] break-all select-text" data-selectable="">
                {dataPath ?? "…"}
              </p>
            </div>
          </div>
          <button
            onClick={handleResync}
            disabled={resyncing}
            className="w-full h-9 rounded-sm border border-[var(--border)] text-[var(--muted-foreground)] text-xs uppercase tracking-widest hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${resyncing ? "animate-spin" : ""}`} />
            {resyncing ? "Resyncing…" : "Re-sync from emberchain.org"}
          </button>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-[var(--muted-foreground)]">
              Re-sync deletes local chain data and re-downloads from emberchain.org. The node will restart automatically.
            </p>
          </div>
        </div>
      </section>

      {/* Links */}
      <section className="space-y-2">
        {[
          { label: "Emberchain Website", href: "https://emberchain.org" },
          { label: "Block Explorer", href: "https://emberchain.org/ledger" },
        ].map(({ label, href }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-4 py-3 border border-[var(--border)] rounded-sm hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5 transition-colors text-xs"
          >
            <span className="text-[var(--muted-foreground)] uppercase tracking-widest">{label}</span>
            <ExternalLink className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          </a>
        ))}
      </section>

      <p className="text-[10px] text-[var(--muted-foreground)] text-center">
        Emberchain Desktop v0.1.0
      </p>
    </div>
  );
}
