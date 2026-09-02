/**
 * Airdrop REST API — tasks, referrals, instant EMBR rewards.
 *
 * POST /api/airdrop/register
 * GET  /api/airdrop/status
 * GET  /api/airdrop/profile?wallet=
 * POST /api/airdrop/verify
 * POST /api/airdrop/check-in
 * GET  /api/airdrop/visit-link?wallet=&task=
 * POST /api/airdrop/confirm-visit
 * GET  /api/airdrop/referrals?wallet=
 */

import { Router, type Request, type Response } from "express";
import { isAddress } from "ethers";
import {
  TASKS,
  AIRDROP_POOL_TOTAL,
  AIRDROP_DAILY_CAP,
  LIQUIDITY_LOCK_MS,
  REFERRAL_TIER_BPS,
  DEFAULT_REFERRER,
  taskRewardEmbr,
  liquidityRewardEmbr,
  utcDayKey,
  type TaskId,
} from "../lib/airdrop-config";
import {
  ensureAirdropTables,
  countParticipants,
  getPoolRemaining,
  getDailyDistributed,
  registerUser,
  getUser,
  listCompletions,
  isTaskComplete,
  countLiquidityDonations,
  getReferralTree,
  getDirectReferrals,
  recordPayout,
  recordLiquidityDonation,
  getLockedRewards,
  hasCheckinToday,
  recordCheckin,
} from "../lib/airdrop-db";
import {
  verifyCheckinSignature,
  issueVisitToken,
  parseVisitToken,
  verifyEmberLottoTicket,
  verifyBaseLottoTicket,
  verifyChainInvadersPlay,
  verifyLiquidityDonation,
} from "../lib/airdrop-verifier";
import { sendEmbrReward, distributorAddress, treasuryAddress } from "../lib/airdrop-distributor";
import { logger } from "../lib/logger";

const router = Router();

function walletParam(req: Request): string | null {
  const w = String(req.query.wallet ?? req.body?.wallet ?? "").trim();
  return isAddress(w) ? w.toLowerCase() : null;
}

async function resolveReferrer(ref: string | undefined, wallet: string): Promise<string | null> {
  if (!ref || !isAddress(ref)) return DEFAULT_REFERRER.toLowerCase();
  const r = ref.toLowerCase();
  return r === wallet ? null : r;
}

async function payReferralBonuses(
  wallet: string,
  baseReward: number,
): Promise<{ wallet: string; rewardEmbr: number; txHash: string | null }[]> {
  const payouts: { wallet: string; rewardEmbr: number; txHash: string | null }[] = [];
  let current = await getUser(wallet);
  let tier = 0;

  while (current?.referrer && tier < REFERRAL_TIER_BPS.length) {
    const bps = REFERRAL_TIER_BPS[tier];
    const bonus = Math.round((baseReward * bps) / 10_000 * 1e6) / 1e6;
    if (bonus > 0) {
      let txHash: string | null = null;
      try {
        txHash = await sendEmbrReward(current.referrer, bonus);
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), referrer: current.referrer },
          "referral bonus payout failed",
        );
      }
      payouts.push({ wallet: current.referrer, rewardEmbr: bonus, txHash });
    }
    current = await getUser(current.referrer);
    tier++;
  }

  return payouts;
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "airdrop" });
});

router.get("/status", async (_req, res) => {
  try {
    await ensureAirdropTables();
    const [participants, poolRemaining, dailyUsed] = await Promise.all([
      countParticipants(),
      getPoolRemaining(),
      getDailyDistributed(),
    ]);
    const perTask = taskRewardEmbr(participants);
    res.json({
      poolTotal: AIRDROP_POOL_TOTAL,
      poolRemaining,
      participants,
      perTaskReward: perTask,
      dailyCap: AIRDROP_DAILY_CAP,
      dailyDistributed: dailyUsed,
      dailyRemaining: Math.max(0, AIRDROP_DAILY_CAP - dailyUsed),
      liquidityDonors: await countLiquidityDonations(),
      nextLiquidityReward: liquidityRewardEmbr(await countLiquidityDonations()),
      distributor: distributorAddress(),
      treasury: treasuryAddress(),
      liquidityLaunchDate: "2025-11-01",
      tasks: TASKS.length,
    });
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : "Unavailable" });
  }
});

router.post("/register", async (req, res) => {
  const wallet = walletParam(req);
  if (!wallet) {
    res.status(400).json({ error: "Invalid wallet" });
    return;
  }

  try {
    await ensureAirdropTables();
    const referrer = await resolveReferrer(req.body?.ref, wallet);
    const user = await registerUser(wallet, referrer);

    let connectTx: string | null = null;
    if (!(await isTaskComplete(wallet, "connect_wallet"))) {
      const participants = await countParticipants();
      const reward = taskRewardEmbr(participants);
      connectTx = await sendEmbrReward(wallet, reward);
      await recordPayout({
        wallet,
        taskId: "connect_wallet",
        rewardEmbr: reward,
        txHash: connectTx,
        lockedUntil: null,
      });
    }

    res.json({ user, connectRewardTx: connectTx });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Register failed" });
  }
});

router.get("/profile", async (req, res) => {
  const wallet = walletParam(req);
  if (!wallet) {
    res.status(400).json({ error: "Invalid wallet" });
    return;
  }

  try {
    await ensureAirdropTables();
    const user = await getUser(wallet);
    const completions = user ? await listCompletions(wallet) : [];
    const completedIds = new Set(completions.map((c) => c.taskId));
    const checkedInToday = user ? await hasCheckinToday(wallet) : false;
    const participants = await countParticipants();
    const perTask = taskRewardEmbr(participants);

    res.json({
      registered: !!user,
      user,
      tasks: TASKS.map((t) => ({
        ...t,
        reward: taskRewardEmbr(participants, t.rewardMultiplier ?? 1),
        completed:
          t.id === "daily_checkin"
            ? checkedInToday
            : completedIds.has(t.id),
        completion: completions.find((c) => c.taskId === t.id) ?? null,
      })),
      perTaskReward: perTask,
      lockedRewards: user ? await getLockedRewards(wallet) : [],
      totalEarned: completions.reduce((s, c) => s + c.rewardEmbr, 0),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Profile failed" });
  }
});

router.post("/check-in", async (req, res) => {
  const wallet = walletParam(req);
  const signature = String(req.body?.signature ?? "").trim();
  const dayKey = String(req.body?.dayKey ?? utcDayKey()).trim();

  if (!wallet || !signature) {
    res.status(400).json({ error: "wallet and signature required" });
    return;
  }

  if (!verifyCheckinSignature(wallet, dayKey, signature)) {
    res.status(401).json({ error: "Invalid check-in signature" });
    return;
  }

  try {
    await ensureAirdropTables();
    const user = await getUser(wallet);
    if (!user) {
      res.status(404).json({ error: "Register first" });
      return;
    }

    if (await hasCheckinToday(wallet, dayKey)) {
      res.status(409).json({ error: "Already checked in today" });
      return;
    }

    const participants = await countParticipants();
    const reward = taskRewardEmbr(participants);
    const txHash = await sendEmbrReward(wallet, reward);
    const referralPayouts = await payReferralBonuses(wallet, reward);

    await recordCheckin({ wallet, dayKey, rewardEmbr: reward, txHash, referralPayouts });

    const { setLastCheckin } = await import("../lib/airdrop-db");
    await setLastCheckin(wallet, new Date());

    res.json({ ok: true, reward, txHash, referralPayouts });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Check-in failed" });
  }
});

router.get("/visit-link", async (req, res) => {
  const wallet = walletParam(req);
  const taskId = String(req.query.task ?? "").trim() as TaskId;
  if (!wallet || !TASKS.some((t) => t.id === taskId)) {
    res.status(400).json({ error: "Invalid wallet or task" });
    return;
  }

  const token = issueVisitToken(wallet, taskId);
  res.json({ token, expiresInSec: 1800 });
});

router.post("/confirm-visit", async (req, res) => {
  const token = String(req.body?.token ?? req.query.token ?? "").trim();
  const parsed = parseVisitToken(token);
  if (!parsed) {
    res.status(400).json({ error: "Invalid or expired visit token" });
    return;
  }

  try {
    await ensureAirdropTables();
    if (await isTaskComplete(parsed.wallet, parsed.taskId)) {
      res.json({ ok: true, alreadyComplete: true });
      return;
    }

    const user = await getUser(parsed.wallet);
    if (!user) {
      res.status(404).json({ error: "Register on airdrop first" });
      return;
    }

    const participants = await countParticipants();
    const task = TASKS.find((t) => t.id === parsed.taskId)!;
    const reward = taskRewardEmbr(participants, task.rewardMultiplier ?? 1);
    const txHash = await sendEmbrReward(parsed.wallet, reward);
    const referralPayouts = await payReferralBonuses(parsed.wallet, reward);

    await recordPayout({
      wallet: parsed.wallet,
      taskId: parsed.taskId,
      rewardEmbr: reward,
      txHash,
      lockedUntil: null,
      referralPayouts,
    });

    res.json({ ok: true, reward, txHash, taskId: parsed.taskId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Visit confirm failed" });
  }
});

router.post("/verify", async (req, res) => {
  const wallet = walletParam(req);
  const taskId = String(req.body?.taskId ?? "").trim() as TaskId;
  const txHashInput = String(req.body?.txHash ?? "").trim();

  if (!wallet || !TASKS.some((t) => t.id === taskId)) {
    res.status(400).json({ error: "Invalid wallet or taskId" });
    return;
  }

  try {
    await ensureAirdropTables();
    if (await isTaskComplete(wallet, taskId)) {
      res.json({ ok: true, alreadyComplete: true });
      return;
    }

    const user = await getUser(wallet);
    if (!user) {
      res.status(404).json({ error: "Register on airdrop first" });
      return;
    }

    const task = TASKS.find((t) => t.id === taskId)!;
    const participants = await countParticipants();

    // Verification gates
    if (taskId === "share_referral") {
      if (!req.body?.attest) {
        res.status(412).json({ error: "Copy your referral link and attest after sharing" });
        return;
      }
    } else if (
      taskId === "share_x" ||
      taskId === "share_telegram" ||
      taskId === "join_telegram" ||
      taskId === "follow_x"
    ) {
      if (!req.body?.attest) {
        res.status(412).json({
          error: "Open the social link, complete the action, then attest: true",
          manualReview: "Social tasks use good-faith attestation in v1",
        });
        return;
      }
    } else if (taskId === "ember_lotto_ticket") {
      if (!(await verifyEmberLottoTicket(wallet))) {
        res.status(412).json({ error: "No Ember Lotto ticket found for this wallet" });
        return;
      }
    } else if (taskId === "base_lotto_ticket") {
      if (!(await verifyBaseLottoTicket(wallet))) {
        res.status(412).json({ error: "No Base Lotto ticket found for this wallet" });
        return;
      }
    } else if (taskId === "play_invaders") {
      if (!(await verifyChainInvadersPlay(wallet))) {
        res.status(412).json({ error: "Play Chain Invaders at least once first" });
        return;
      }
    } else if (taskId === "liquidity_donation") {
      if (!txHashInput) {
        res.status(400).json({ error: "txHash required for liquidity donation" });
        return;
      }
      const verified = await verifyLiquidityDonation(txHashInput, wallet);
      if (!verified.ok) {
        res.status(412).json({ error: verified.error ?? "Donation not verified" });
        return;
      }
      const donorCount = await countLiquidityDonations();
      const reward = liquidityRewardEmbr(donorCount);
      const lockedUntil = new Date(Date.now() + LIQUIDITY_LOCK_MS);

      await recordLiquidityDonation({
        wallet,
        txHash: txHashInput,
        chain: verified.chain,
        amountWei: verified.amountWei,
        rewardEmbr: reward,
        lockedUntil,
      });

      await recordPayout({
        wallet,
        taskId,
        rewardEmbr: reward,
        txHash: null,
        lockedUntil,
        exemptDailyCap: true,
        meta: { donationTx: txHashInput, chain: verified.chain },
      });

      res.json({
        ok: true,
        reward,
        lockedUntil: lockedUntil.toISOString(),
        message: "Liquidity reward locked for 60 days before EMBR transfer",
      });
      return;
    } else if (task.category === "visit") {
      res.status(412).json({
        error: "Use visit-link flow — open the destination page with your token",
      });
      return;
    }

    const reward = taskRewardEmbr(participants, task.rewardMultiplier ?? 1);
    const txHash = await sendEmbrReward(wallet, reward);
    const referralPayouts = await payReferralBonuses(wallet, reward);

    await recordPayout({
      wallet,
      taskId,
      rewardEmbr: reward,
      txHash,
      lockedUntil: null,
      referralPayouts,
    });

    res.json({ ok: true, reward, txHash, referralPayouts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verify failed";
    const code = msg.includes("cap") || msg.includes("exhausted") ? 429 : 500;
    res.status(code).json({ error: msg });
  }
});

router.get("/referrals", async (req, res) => {
  const wallet = walletParam(req);
  if (!wallet) {
    res.status(400).json({ error: "Invalid wallet" });
    return;
  }

  try {
    await ensureAirdropTables();
    const tierCounts = await getReferralTree(wallet);
    const direct = await getDirectReferrals(wallet);
    const link = `https://emberchain.org/airdrop?ref=${wallet}`;
    res.json({ tierCounts, directReferrals: direct, referralLink: link, tierBps: REFERRAL_TIER_BPS });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Referrals failed" });
  }
});

export default router;
