"use client";

import type { AirdropStatus } from "@/lib/api";

export function StatsBar({ status }: { status: AirdropStatus }) {
  const pct = Math.max(0, (status.poolRemaining / status.poolTotal) * 100);
  return (
    <section className="glass-panel grid gap-4 rounded-3xl p-5 md:grid-cols-4 md:p-6">
      <Stat label="Pool remaining" value={`${status.poolRemaining.toLocaleString()} EMBR`} sub={`of ${status.poolTotal.toLocaleString()}`} />
      <Stat label="Participants" value={String(status.participants)} sub={`~${status.perTaskReward} EMBR / task`} />
      <Stat label="Daily cap left" value={`${status.dailyRemaining.toFixed(1)} EMBR`} sub={`${status.dailyDistributed.toFixed(1)} / ${status.dailyCap} used`} />
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">Pool gauge</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-orange-100/55">Liquidity added November 1st</p>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-orange-100/45">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-orange-50">{value}</p>
      <p className="text-xs text-orange-100/55">{sub}</p>
    </div>
  );
}
