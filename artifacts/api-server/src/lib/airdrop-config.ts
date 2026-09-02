/** Airdrop campaign constants — shared logic for routes + tests. */

export const AIRDROP_POOL_TOTAL = 100_000;
export const AIRDROP_DAILY_CAP = 500;
export const LIQUIDITY_BASE_REWARD = 500;
export const LIQUIDITY_DECAY = 0.99;
export const LOCK_DAYS = 60;
export const LIQUIDITY_LOCK_MS = LOCK_DAYS * 24 * 60 * 60 * 1000;

/** Referral bonus bps per tier (direct + 4 indirect). */
export const REFERRAL_TIER_BPS = [500, 300, 200, 100, 50] as const;

export const DEFAULT_REFERRER =
  "0x9954146017aCE1994BC076243Ed49EC28C64D77B" as const;

export const EMBER_LOTTERY =
  (process.env.AIRDROP_EMBER_LOTTERY ?? "0x6e0dc9421292a72d9bbb8ccb41e33448b96ff28e").toLowerCase();

export const BASE_LOTTERY =
  (process.env.AIRDROP_BASE_LOTTERY ?? "0x53be2a4c134ed203cd0b683d8e66bef4a0f490b6").toLowerCase();

export const SOCIAL_LINKS = {
  telegramGroup: "https://t.me/emberchainorg",
  twitter: "https://x.com/emberchainorg",
  twitterIntent: (text: string) =>
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
} as const;

export type TaskId =
  | "connect_wallet"
  | "daily_checkin"
  | "share_referral"
  | "share_x"
  | "share_telegram"
  | "join_telegram"
  | "follow_x"
  | "visit_drip"
  | "play_invaders"
  | "visit_niftytracks"
  | "visit_lotto"
  | "ember_lotto_ticket"
  | "base_lotto_ticket"
  | "liquidity_donation";

export type TaskDef = {
  id: TaskId;
  title: string;
  description: string;
  category: "wallet" | "social" | "visit" | "onchain" | "liquidity";
  rewardMultiplier?: number;
  locked?: boolean;
  href?: string;
  external?: boolean;
};

export const TASKS: TaskDef[] = [
  {
    id: "connect_wallet",
    title: "Connect wallet",
    description: "Link your Emberchain wallet to join the campaign.",
    category: "wallet",
  },
  {
    id: "daily_checkin",
    title: "Daily check-in",
    description: "Sign once every 24 hours to keep your streak alive.",
    category: "wallet",
  },
  {
    id: "share_referral",
    title: "Share your referral link",
    description: "Copy your ?ref= link — earn from 5 tiers when friends complete tasks.",
    category: "social",
  },
  {
    id: "share_x",
    title: "Share on X (Twitter)",
    description: "Post about the Ember airdrop, then attest completion.",
    category: "social",
    href: SOCIAL_LINKS.twitterIntent(
      "Mining is live on @emberchainorg — join the EMBR airdrop before liquidity lands Nov 1! https://emberchain.org/airdrop",
    ),
    external: true,
  },
  {
    id: "share_telegram",
    title: "Share on Telegram",
    description: "Forward the airdrop to a Telegram chat, then verify.",
    category: "social",
    href: SOCIAL_LINKS.telegramGroup,
    external: true,
  },
  {
    id: "join_telegram",
    title: "Join Telegram group",
    description: "Join the official Emberchain Telegram community.",
    category: "social",
    href: SOCIAL_LINKS.telegramGroup,
    external: true,
  },
  {
    id: "follow_x",
    title: "Follow on X",
    description: "Follow @emberchainorg, then confirm here.",
    category: "social",
    href: SOCIAL_LINKS.twitter,
    external: true,
  },
  {
    id: "visit_drip",
    title: "Visit Ember Drip",
    description: "Explore the mining drip faucet on Emberchain.",
    category: "visit",
    href: "/drip",
  },
  {
    id: "play_invaders",
    title: "Play Chain Invaders once",
    description: "Complete one Chain Invaders run in the web wallet.",
    category: "visit",
    href: "/chain-invaders",
  },
  {
    id: "visit_niftytracks",
    title: "Visit NiftyTracks (DEMO)",
    description: "Preview the NiftyTracks music NFT demo experience.",
    category: "visit",
    href: "/niftytracks",
  },
  {
    id: "visit_lotto",
    title: "Visit Ember Lotto",
    description: "Open the lotto board and explore weekly jackpots.",
    category: "visit",
    href: "/lotto/",
  },
  {
    id: "ember_lotto_ticket",
    title: "Enter Ember Lotto ticket",
    description: "Buy at least one ticket on Emberchain mainnet.",
    category: "onchain",
    href: "/lotto/",
  },
  {
    id: "base_lotto_ticket",
    title: "Enter Base Lotto ticket",
    description: "Buy a Base mainnet lotto ticket — higher reward tier.",
    category: "onchain",
    rewardMultiplier: 2,
    href: "/lotto/",
  },
  {
    id: "liquidity_donation",
    title: "$1 liquidity donation",
    description:
      "Send ~$1 ETH to the treasury — first donor earns 500 EMBR (1% less each time). Rewards unlock after 60 days.",
    category: "liquidity",
    locked: true,
  },
];

/** Dynamic per-task reward based on registered participant count. */
export function taskRewardEmbr(participantCount: number, multiplier = 1): number {
  const n = Math.max(1, Math.floor(participantCount));
  let base: number;
  if (n <= 10) base = 5;
  else if (n <= 25) base = 2.5;
  else if (n <= 50) base = 1.25;
  else if (n <= 100) base = 0.625;
  else if (n <= 250) base = 0.3125;
  else base = 0.15625;
  return Math.round(base * multiplier * 1e6) / 1e6;
}

/** Liquidity donor reward: 500 * 0.99^n (n = prior donation count). */
export function liquidityRewardEmbr(priorDonationCount: number): number {
  const n = Math.max(0, Math.floor(priorDonationCount));
  return Math.round(LIQUIDITY_BASE_REWARD * LIQUIDITY_DECAY ** n * 1e6) / 1e6;
}

export function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
