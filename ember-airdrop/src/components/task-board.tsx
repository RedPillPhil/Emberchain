"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { TaskRow } from "@/lib/api";
import {
  checkIn,
  fetchProfile,
  fetchReferrals,
  fetchVisitLink,
  verifyTask,
} from "@/lib/api";
import { checkinMessage, utcDayKey } from "@/lib/chain";
import { cn, siteUrl } from "@/lib/utils";

export function ReferralPanel() {
  const { address } = useAccount();
  const { data } = useQuery({
    queryKey: ["referrals", address],
    queryFn: () => fetchReferrals(address!),
    enabled: !!address,
  });
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    if (!address) return "";
    return `https://emberchain.org/airdrop?ref=${address}`;
  }, [address]);

  if (!address) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="glass-panel rounded-3xl p-5 md:p-6">
      <h2 className="font-[family-name:var(--font-display)] text-xl text-orange-50">Five-tier referral empire</h2>
      <p className="mt-1 text-sm text-orange-100/55">
        Earn bonus EMBR when your network completes tasks — 5 levels deep.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 truncate rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs">{link}</div>
        <button type="button" onClick={() => void copy()} className="ember-cta rounded-xl px-4 py-2 text-sm">
          {copied ? <Check className="inline size-4" /> : <Copy className="inline size-4" />} Copy
        </button>
      </div>
      {data?.tierCounts ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {data.tierCounts.map((n: number, i: number) => (
            <div key={i} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-orange-100/45">Tier {i + 1}</p>
              <p className="font-[family-name:var(--font-display)] text-xl text-orange-100">{n}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TaskList({ wallet }: { wallet: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [liquidityTx, setLiquidityTx] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["profile", wallet],
    queryFn: () => fetchProfile(wallet),
    enabled: !!wallet,
  });

  const run = async (task: TaskRow, action: () => Promise<void>) => {
    setBusy(task.id);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["profile", wallet] });
      toast.success(`${task.title} verified — EMBR sent`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Task failed");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {data?.tasks.map((task) => (
        <article
          key={task.id}
          className={cn(
            "glass-panel flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between",
            task.completed && "border-emerald-400/25",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-[family-name:var(--font-display)] text-lg text-orange-50">{task.title}</h3>
              {task.completed ? (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-200">
                  Done
                </span>
              ) : (
                <span className="rounded-full border border-orange-400/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-orange-200">
                  +{task.reward} EMBR
                </span>
              )}
              {task.locked ? (
                <span className="text-[10px] uppercase text-amber-300/80">60-day lock</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-orange-100/55">{task.description}</p>
            {task.completion?.txHash ? (
              <a
                href={`https://emberchain.org/tx/${task.completion.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-orange-300/80 hover:text-orange-200"
              >
                View payout tx <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {!task.completed && task.href ? (
              <a
                href={task.external ? task.href : siteUrl(task.href)}
                target={task.external ? "_blank" : undefined}
                rel={task.external ? "noreferrer" : undefined}
                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wide text-orange-100/80 hover:border-orange-400/40"
              >
                Open
              </a>
            ) : null}

            {!task.completed && task.category === "visit" ? (
              <button
                type="button"
                disabled={busy === task.id}
                className="ember-cta rounded-xl px-3 py-2 text-xs uppercase"
                onClick={() =>
                  void run(task, async () => {
                    const { token } = await fetchVisitLink(wallet, task.id);
                    const dest = task.href?.startsWith("http")
                      ? task.href
                      : siteUrl(`${task.href}?airdrop_vt=${encodeURIComponent(token)}`);
                    window.open(dest, "_blank");
                    toast.message("Complete the visit, then confirm on that page");
                  })
                }
              >
                Get visit link
              </button>
            ) : null}

            {!task.completed && task.id === "daily_checkin" ? (
              <button
                type="button"
                disabled={busy === task.id}
                className="ember-cta rounded-xl px-3 py-2 text-xs uppercase"
                onClick={() =>
                  void run(task, async () => {
                    const dayKey = utcDayKey();
                    const msg = checkinMessage(wallet, dayKey);
                    const sig = await (window as Window & { ethereum?: { request: (a: unknown) => Promise<string> } }).ethereum?.request({
                      method: "personal_sign",
                      params: [msg, wallet],
                    });
                    if (!sig) throw new Error("Signature rejected");
                    await checkIn(wallet, sig, dayKey);
                  })
                }
              >
                Check in
              </button>
            ) : null}

            {!task.completed && (task.category === "social" || task.id === "share_referral") ? (
              <button
                type="button"
                disabled={busy === task.id}
                className="ember-cta rounded-xl px-3 py-2 text-xs uppercase"
                onClick={() => void run(task, () => verifyTask(wallet, task.id, { attest: true }))}
              >
                I completed this
              </button>
            ) : null}

            {!task.completed && (task.id === "ember_lotto_ticket" || task.id === "base_lotto_ticket" || task.id === "play_invaders") ? (
              <button
                type="button"
                disabled={busy === task.id}
                className="ember-cta rounded-xl px-3 py-2 text-xs uppercase"
                onClick={() => void run(task, () => verifyTask(wallet, task.id))}
              >
                Verify on-chain
              </button>
            ) : null}

            {!task.completed && task.id === "liquidity_donation" ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={liquidityTx}
                  onChange={(e) => setLiquidityTx(e.target.value)}
                  placeholder="Paste donation tx hash"
                  className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-orange-50"
                />
                <button
                  type="button"
                  disabled={busy === task.id || !liquidityTx}
                  className="ember-cta rounded-xl px-3 py-2 text-xs uppercase"
                  onClick={() =>
                    void run(task, () => verifyTask(wallet, task.id, { txHash: liquidityTx.trim() }))
                  }
                >
                  Verify $1 ETH
                </button>
              </div>
            ) : null}

            {task.completed ? <Sparkles className="size-5 text-emerald-400" /> : null}
          </div>
        </article>
      ))}
    </section>
  );
}
