"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Gift } from "lucide-react";
import { toast } from "sonner";
import { fetchStatus, registerWallet, fetchProfile } from "@/lib/api";
import { StatsBar } from "@/components/stats-bar";
import { WalletConnect } from "@/components/wallet-connect";
import { ReferralPanel, TaskList } from "@/components/task-board";
import { appUrl } from "@/lib/utils";

export function AirdropPage() {
  const { address, isConnected } = useAccount();
  const params = useSearchParams();
  const ref = params.get("ref");
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["airdrop-status"],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!isConnected || !address) return;
    registerWallet(address, ref)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["profile", address] });
      })
      .catch(() => {
        /* already registered */
      });
  }, [isConnected, address, ref, queryClient]);

  const profileQuery = useQuery({
    queryKey: ["profile", address],
    queryFn: () => fetchProfile(address!),
    enabled: !!address,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-950/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-orange-200">
            <Flame className="size-3.5 text-orange-400" /> Emberchain Airdrop
          </div>
          <h1 className="text-glow font-[family-name:var(--font-display)] text-4xl tracking-wide text-orange-50 md:text-5xl">
            Grow the network.<br />Earn EMBR before trading.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-orange-100/65 md:text-base">
            Mining is live to build the network. Complete verified tasks for instant EMBR rewards from a{" "}
            <strong className="text-orange-200">100,000 EMBR pool</strong>. Liquidity lands{" "}
            <strong className="text-amber-300">November 1st</strong> — grow the userbase now.
          </p>
        </div>
        <WalletConnect />
      </header>

      {statusQuery.data ? <StatsBar status={statusQuery.data} /> : null}

      <section className="glass-panel mt-6 rounded-3xl border-orange-400/20 p-5 md:p-6">
        <div className="flex items-start gap-3">
          <Gift className="mt-1 size-5 text-amber-300" />
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg text-orange-50">How it works</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-orange-100/60">
              <li>Connect wallet — rewards scale down as more users join (5 → 2.5 → 1.25 EMBR…)</li>
              <li>Max <strong className="text-orange-200">500 EMBR/day</strong> distributed (liquidity donors exempt)</li>
              <li>Share your <code className="text-orange-200">?ref=</code> link — 5-tier referral bonuses on every task</li>
              <li>$1 liquidity donations: <strong className="text-orange-200">500 × 0.99ⁿ EMBR</strong>, locked 60 days</li>
            </ul>
          </div>
        </div>
      </section>

      {isConnected && address ? (
        <>
          <div className="mt-8 mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-orange-50">Your tasks</h2>
              {profileQuery.data ? (
                <p className="text-sm text-orange-100/55">
                  Earned so far: <strong className="text-orange-200">{profileQuery.data.totalEarned.toFixed(2)} EMBR</strong>
                </p>
              ) : null}
            </div>
            <a href={appUrl()} className="text-xs uppercase tracking-wider text-orange-300/70 hover:text-orange-200">
              Share {appUrl(`?ref=${address}`)}
            </a>
          </div>
          <ReferralPanel />
          <div className="mt-6">
            <TaskList wallet={address} />
          </div>
        </>
      ) : (
        <section className="glass-panel mt-8 rounded-3xl p-10 text-center">
          <p className="text-orange-100/60">Connect your wallet to view tasks and claim EMBR rewards.</p>
        </section>
      )}

      <footer className="mt-12 border-t border-white/8 pt-6 text-center text-xs text-orange-100/40">
        <a href="https://emberchain.org" className="hover:text-orange-200">emberchain.org</a>
        {" · "}
        Professional airdrop campaign · Liquidity November 1st, 2025
      </footer>
    </div>
  );
}
