import { apiUrl } from "./utils";

export type AirdropStatus = {
  poolTotal: number;
  poolRemaining: number;
  participants: number;
  perTaskReward: number;
  dailyCap: number;
  dailyDistributed: number;
  dailyRemaining: number;
  liquidityDonors: number;
  nextLiquidityReward: number;
  distributor: string | null;
  treasury: string;
  liquidityLaunchDate: string;
  tasks: number;
};

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  rewardMultiplier?: number;
  locked?: boolean;
  href?: string;
  external?: boolean;
  reward: number;
  completed: boolean;
  completion: { rewardEmbr: number; txHash: string | null; lockedUntil: string | null } | null;
};

export async function fetchStatus(): Promise<AirdropStatus> {
  const res = await fetch(apiUrl("/status"), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load airdrop status");
  return res.json();
}

export async function registerWallet(wallet: string, ref?: string | null) {
  const res = await fetch(apiUrl("/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, ref }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Register failed");
  return res.json();
}

export async function fetchProfile(wallet: string): Promise<{
  registered: boolean;
  tasks: TaskRow[];
  totalEarned: number;
  lockedRewards: { taskId: string; rewardEmbr: number; lockedUntil: string; claimable: boolean }[];
}> {
  const res = await fetch(apiUrl(`/profile?wallet=${wallet}`), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load profile");
  return res.json();
}

export async function verifyTask(wallet: string, taskId: string, body: Record<string, unknown> = {}) {
  const res = await fetch(apiUrl("/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, taskId, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Verification failed");
  return data;
}

export async function checkIn(wallet: string, signature: string, dayKey: string) {
  const res = await fetch(apiUrl("/check-in"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, signature, dayKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Check-in failed");
  return data;
}

export async function fetchVisitLink(wallet: string, task: string): Promise<{ token: string }> {
  const res = await fetch(apiUrl(`/visit-link?wallet=${wallet}&task=${task}`));
  if (!res.ok) throw new Error("Visit link failed");
  return res.json();
}

export async function fetchReferrals(wallet: string) {
  const res = await fetch(apiUrl(`/referrals?wallet=${wallet}`));
  if (!res.ok) throw new Error("Referrals failed");
  return res.json();
}
