import React, { useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Coins, Loader2, ExternalLink } from "lucide-react";
import { cn, formatHash } from "@/lib/utils";

function formatTokenAmount(raw: string, decimals: number, symbol?: string): string {
  if (!raw || raw === "0") return symbol ? `0 ${symbol}` : "0";
  const n = BigInt(raw);
  const d = BigInt(10) ** BigInt(decimals);
  const whole = n / d;
  const frac  = n % d;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  const formatted = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return symbol ? `${formatted} ${symbol}` : formatted;
}

interface TokenEntry {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  isToken: boolean;
  creator?: string;
  createdAt?: string;
}

export default function Tokens() {
  const [, setLocation] = useLocation();
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTokens = () => {
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((data) => setTokens(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Shell requireWallet={false}>
      {/* Header */}
      <div className="border-b border-border pb-6 mb-8">
        <h1 className="text-4xl font-display font-bold uppercase tracking-tighter text-foreground mb-2 flex items-center gap-3">
          <Coins className="w-8 h-8 text-primary" /> Token Explorer
        </h1>
        <p className="text-muted-foreground font-sans text-sm uppercase tracking-widest font-bold">
          All ERC-20 compatible tokens deployed on Emberchain
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 p-6 border border-border rounded-sm bg-card/50 text-muted-foreground font-sans font-bold uppercase tracking-widest text-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading tokens…
        </div>
      ) : tokens.length === 0 ? (
        <Card className="p-12 border-border bg-card/50 rounded-sm text-center">
          <Coins className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <div className="text-foreground font-sans font-bold uppercase tracking-widest mb-2">No Tokens Found</div>
          <div className="text-muted-foreground font-sans text-sm">
            No ERC-20 tokens have been deployed on this network yet.
          </div>
        </Card>
      ) : (
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
                  <th className="p-3 font-bold">Contract Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {tokens.map((token, i) => (
                  <tr
                    key={token.address}
                    className="hover:bg-secondary/20 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/tokens/${token.address}`)}
                  >
                    <td className="p-3 font-mono text-muted-foreground text-xs">{i + 1}</td>
                    <td className="p-3">
                      <span className="font-bold text-foreground text-sm">{token.name || "—"}</span>
                    </td>
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
                        onClick={(e) => { e.stopPropagation(); setLocation(`/tokens/${token.address}`); }}
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        {formatHash(token.address, 6)}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Shell>
  );
}
