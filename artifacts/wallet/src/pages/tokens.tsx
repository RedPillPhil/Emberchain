import React, { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Coins, Code2, Loader2, ExternalLink, CheckCircle2, RefreshCw } from "lucide-react";
import { cn, formatHash } from "@/lib/utils";
import { ledgerAddressUrl } from "@/lib/explorer-links";
import { chainNodeApi } from "@/lib/config";
import { resolveApiServer } from "@/lib/api-server";
import { ContractTools } from "@/components/tokens/contract-tools";

function formatTokenAmount(raw: string, decimals: number): string {
  if (!raw || raw === "0") return "0";
  const n = BigInt(raw);
  const d = BigInt(10) ** BigInt(decimals);
  const whole = n / d;
  const frac  = n % d;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

interface ContractEntry {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  isToken: boolean;
  creator: string | null;
  creatorTx: string | null;
  createdAt: string;
}

async function fetchRegistry(path: string): Promise<ContractEntry[]> {
  const urls = [
    `${resolveApiServer()}${path}`,
    chainNodeApi(path),
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch {
      /* try next */
    }
  }
  return [];
}

export default function TokensPage() {
  const [, setLocation] = useLocation();
  const [tokens, setTokens]         = useState<ContractEntry[]>([]);
  const [contracts, setContracts]   = useState<ContractEntry[]>([]);
  const [loadingTokens, setLoadingTokens]       = useState(true);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoadingTokens(true);
    setLoadingContracts(true);
    const [t, c] = await Promise.all([
      fetchRegistry("/api/tokens"),
      fetchRegistry("/api/contracts/list"),
    ]);
    setTokens(t);
    setContracts(c);
    setLoadingTokens(false);
    setLoadingContracts(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleRescan = async () => {
    setRescanning(true);
    setRescanMsg(null);
    try {
      const res = await fetch(chainNodeApi("/api/contracts/rescan"), { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && typeof json.discovered === "number") {
        setRescanMsg(`Indexed ${json.discovered} contract(s) via ${json.storage ?? "registry"}.`);
      } else {
        setRescanMsg(json.error ?? "Rescan finished — check node logs if still empty.");
      }
      await fetchAll();
    } catch {
      setRescanMsg("Rescan request failed — is chain-node running?");
      await fetchAll();
    } finally {
      setRescanning(false);
    }
  };

  return (
    <Shell requireWallet={false}>
      <div className="border-b border-border pb-6 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
            <Coins className="w-8 h-8 text-primary" /> Tokens / Contracts
          </h1>
          <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
            ERC-20 tokens and smart contracts deployed on Emberchain
          </p>
          {rescanMsg && (
            <p className="text-xs text-primary/90 mt-2 normal-case tracking-normal font-sans">{rescanMsg}</p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 shrink-0">
          <button
            onClick={() => void handleRescan()}
            disabled={rescanning || loadingTokens || loadingContracts}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border rounded-sm px-3 py-2 transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rescanning ? "animate-spin" : ""}`} />
            Rescan chain
          </button>
          <button
            onClick={() => void fetchAll()}
            disabled={loadingTokens || loadingContracts}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border rounded-sm px-3 py-2 transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loadingTokens || loadingContracts) ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Token Tracker ── */}
      <section className="mb-10">
        <h2 className="text-lg font-display font-bold uppercase tracking-wide text-primary border-l-4 border-primary pl-3 mb-4 flex items-center gap-2">
          <Coins className="w-4 h-4" />
          Token Tracker
          {!loadingTokens && (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full bg-primary/10 text-primary border border-primary/20">
              {tokens.length}
            </span>
          )}
        </h2>
        {loadingTokens ? (
          <LoadingRow />
        ) : tokens.length === 0 ? (
          <EmptyState
            icon={<Coins className="w-10 h-10 text-muted-foreground mx-auto mb-4" />}
            title="No Tokens Indexed Yet"
            body="Click Rescan chain to discover ERC-20 tokens from deployment history."
          />
        ) : (
          <TokenTable rows={tokens} onRowClick={(addr) => setLocation(`/tokens/${addr}`)} />
        )}
      </section>

      {/* ── All Contracts ── */}
      <section className="mb-10">
        <h2 className="text-lg font-display font-bold uppercase tracking-wide text-primary border-l-4 border-primary pl-3 mb-4 flex items-center gap-2">
          <Code2 className="w-4 h-4" />
          All Contracts
          {!loadingContracts && (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] rounded-full bg-secondary/80 text-muted-foreground border border-border">
              {contracts.length}
            </span>
          )}
        </h2>
        {loadingContracts ? (
          <LoadingRow />
        ) : contracts.length === 0 ? (
          <EmptyState
            icon={<Code2 className="w-10 h-10 text-muted-foreground mx-auto mb-4" />}
            title="No Contracts Indexed Yet"
            body="The chain scanner populates this list from deployment transactions. Try Rescan chain."
          />
        ) : (
          <ContractsTable
            rows={contracts}
            onRowClick={(addr) => setLocation(`/tokens/${addr}`)}
            onCreatorClick={(addr) => setLocation(ledgerAddressUrl(addr))}
          />
        )}
      </section>

      <ContractTools />
    </Shell>
  );
}

function TokenTable({
  rows,
  onRowClick,
}: {
  rows: ContractEntry[];
  onRowClick: (addr: string) => void;
}) {
  return (
    <Card className="border-border bg-card/80 rounded-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-secondary/50 border-b border-border font-sans uppercase tracking-widest text-muted-foreground text-[10px]">
            <tr>
              <th className="p-3 font-bold w-10">#</th>
              <th className="p-3 font-bold">Name</th>
              <th className="p-3 font-bold">Symbol</th>
              <th className="p-3 font-bold text-right">Total Supply</th>
              <th className="p-3 font-bold text-right">Decimals</th>
              <th className="p-3 font-bold">Contract</th>
              <th className="p-3 font-bold">Deployer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((token, i) => (
              <tr
                key={token.address}
                className="hover:bg-secondary/20 transition-colors cursor-pointer"
                onClick={() => onRowClick(token.address)}
              >
                <td className="p-3 font-mono text-muted-foreground text-xs">{i + 1}</td>
                <td className="p-3 font-bold text-foreground text-sm">{token.name || "—"}</td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-sans font-bold uppercase tracking-widest border bg-accent/10 text-accent border-accent/40">
                    {token.symbol || "—"}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-sm font-bold text-foreground">
                  {token.totalSupply && token.decimals != null
                    ? formatTokenAmount(token.totalSupply, token.decimals)
                    : "—"}
                </td>
                <td className="p-3 text-right font-mono text-sm text-muted-foreground">
                  {token.decimals ?? "—"}
                </td>
                <td className="p-3 font-mono text-xs">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRowClick(token.address); }}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {formatHash(token.address, 6)}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {token.creator ? formatHash(token.creator, 4) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ContractsTable({
  rows,
  onRowClick,
  onCreatorClick,
}: {
  rows: ContractEntry[];
  onRowClick: (addr: string) => void;
  onCreatorClick: (addr: string) => void;
}) {
  return (
    <Card className="border-border bg-card/80 rounded-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-secondary/50 border-b border-border font-sans uppercase tracking-widest text-muted-foreground text-[10px]">
            <tr>
              <th className="p-3 font-bold w-10">#</th>
              <th className="p-3 font-bold">Contract</th>
              <th className="p-3 font-bold">Type</th>
              <th className="p-3 font-bold">Name</th>
              <th className="p-3 font-bold">Symbol</th>
              <th className="p-3 font-bold text-right">Total Supply</th>
              <th className="p-3 font-bold">Deployer</th>
              <th className="p-3 font-bold">Deploy Tx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((c, i) => (
              <tr
                key={c.address}
                className="hover:bg-secondary/20 transition-colors cursor-pointer"
                onClick={() => onRowClick(c.address)}
              >
                <td className="p-3 font-mono text-muted-foreground text-xs">{i + 1}</td>
                <td className="p-3 font-mono text-xs">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRowClick(c.address); }}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {formatHash(c.address, 6)}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </td>
                <td className="p-3">
                  {c.isToken ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-sans font-bold uppercase tracking-widest border bg-accent/10 text-accent border-accent/40">
                      <CheckCircle2 className="w-2.5 h-2.5" /> ERC-20
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-sans font-bold uppercase tracking-widest border bg-secondary text-muted-foreground border-border">
                      <Code2 className="w-2.5 h-2.5" /> Contract
                    </span>
                  )}
                </td>
                <td className="p-3 text-sm text-foreground font-bold">
                  {c.name || <span className="text-muted-foreground font-normal">—</span>}
                </td>
                <td className="p-3">
                  {c.symbol ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-sans font-bold uppercase tracking-widest border bg-primary/10 text-primary border-primary/20">
                      {c.symbol}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="p-3 text-right font-mono text-sm text-foreground">
                  {c.totalSupply && c.decimals != null
                    ? formatTokenAmount(c.totalSupply, c.decimals)
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {c.creator ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCreatorClick(c.creator!); }}
                      className="text-primary hover:underline"
                    >
                      {formatHash(c.creator, 4)}
                    </button>
                  ) : "—"}
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {c.creatorTx ? formatHash(c.creatorTx, 4) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-3 p-6 border border-border rounded-sm bg-card/50 text-muted-foreground font-sans font-bold uppercase tracking-widest text-sm animate-pulse">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-12 border-border bg-card/50 rounded-sm text-center">
      {icon}
      <div className="text-foreground font-sans font-bold uppercase tracking-widest mb-2">{title}</div>
      <div className="text-muted-foreground font-sans text-sm">{body}</div>
    </Card>
  );
}
