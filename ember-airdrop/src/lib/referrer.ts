import { isAddress, type Address } from "viem";

export const DEFAULT_REFERRER =
  "0x9954146017aCE1994BC076243Ed49EC28C64D77B" as const;

export function resolveReferrer(ref: string | null | undefined, wallet?: string | null): Address {
  const referrer =
    ref && isAddress(ref) ? (ref as Address) : (DEFAULT_REFERRER as Address);
  if (wallet && isAddress(wallet) && wallet.toLowerCase() === referrer.toLowerCase()) {
    return "0x0000000000000000000000000000000000000000";
  }
  return referrer;
}

export const REFERRAL_TIER_LABELS = [
  "Tier 1 — direct referrals",
  "Tier 2 — friends of friends",
  "Tier 3 — third degree",
  "Tier 4 — fourth degree",
  "Tier 5 — fifth degree",
] as const;
