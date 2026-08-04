/**
 * Chain Invaders auto-settler.
 *
 * After the daily competition window closes (8pm Eastern / 00:00 UTC in EDT),
 * anyone may call settleDay(dayId). Winners do NOT claim — settlement pays them
 * directly (75% cumulative leader, 25% best-single leader).
 *
 * This background job runs on api-server and settles the previous day once it
 * becomes eligible, so payouts happen automatically without waiting for a human.
 */

import { Contract, JsonRpcProvider, Wallet, Interface } from "ethers";
import { logger } from "./logger";

const ABI = [
  "function currentDayId() view returns (uint256)",
  "function days_(uint256) view returns (uint256 pot, uint256 bestCumulative, address cumulativeLeader, uint256 bestSingle, address singleLeader, bool settled, uint256 entrants)",
  "function settleDay(uint256 dayId)",
  "function inCompetitionWindow() view returns (bool)",
];

let timer: ReturnType<typeof setInterval> | null = null;

function getSettlerWallet(): Wallet | null {
  const key = (
    process.env.CHAIN_INVADERS_SETTLER_KEY ||
    process.env.CHAIN_INVADERS_SIGNER_KEY ||
    process.env.GAME_SIGNER_PRIVATE_KEY ||
    process.env.CHAIN_INVADERS_ORACLE_KEY ||
    ""
  ).trim();
  if (!key) return null;
  try {
    return new Wallet(key.startsWith("0x") ? key : `0x${key}`);
  } catch {
    return null;
  }
}

function getRpcUrl(): string {
  if (process.env.EMBR_RPC_URL?.trim()) return process.env.EMBR_RPC_URL.trim();
  if (process.env.EMBR_RPC?.trim()) return process.env.EMBR_RPC.trim();
  const node = process.env.CHAIN_NODE_URL?.trim().replace(/\/$/, "");
  if (node) return `${node}/api/rpc`;
  return "http://127.0.0.1:8080/api/rpc";
}

function getContractAddress(): string {
  return (process.env.CHAIN_INVADERS_ADDRESS || "").trim();
}

export async function settleEligibleDays(): Promise<{
  attempted: number[];
  settled: number[];
  skipped: string[];
}> {
  const address = getContractAddress();
  const wallet = getSettlerWallet();
  const attempted: number[] = [];
  const settled: number[] = [];
  const skipped: string[] = [];

  if (!address) {
    skipped.push("CHAIN_INVADERS_ADDRESS not set");
    return { attempted, settled, skipped };
  }
  if (!wallet) {
    skipped.push("settler key not set");
    return { attempted, settled, skipped };
  }

  const provider = new JsonRpcProvider(getRpcUrl(), 7773);
  const signer = wallet.connect(provider);
  const game = new Contract(address, ABI, signer);

  const currentDay: bigint = await game.currentDayId();
  const inWindow: boolean = await game.inCompetitionWindow();

  // After the window closes, currentDayId is STILL today's contest until the next
  // noon UTC offset — so we must settle i=0 when !inWindow. Previously we only
  // tried currentDay-1..-3 and permanently skipped the day that just ended.
  const offsets = inWindow ? [1, 2, 3] : [0, 1, 2, 3];

  for (const i of offsets) {
    const dayId = currentDay - BigInt(i);
    if (dayId < 0n) continue;
    const idNum = Number(dayId);
    attempted.push(idNum);

    try {
      const d = await game.days_(dayId);
      const pot: bigint = d.pot ?? d[0];
      const settledFlag: boolean = d.settled ?? d[5];
      const cumulativeLeader: string = d.cumulativeLeader ?? d[2];
      const singleLeader: string = d.singleLeader ?? d[4];

      if (settledFlag) {
        skipped.push(`day ${idNum}: already settled`);
        continue;
      }
      if (pot === 0n) {
        skipped.push(`day ${idNum}: empty pot`);
        continue;
      }
      if (!cumulativeLeader || cumulativeLeader === "0x0000000000000000000000000000000000000000") {
        skipped.push(`day ${idNum}: no cumulative winner`);
        continue;
      }
      if (!singleLeader || singleLeader === "0x0000000000000000000000000000000000000000") {
        skipped.push(`day ${idNum}: no single-run winner`);
        continue;
      }

      const tx = await game.settleDay(dayId, { gasLimit: 300_000n });
      await tx.wait();
      settled.push(idNum);
      logger.info(
        { dayId: idNum, tx: tx.hash, pot: pot.toString() },
        "Chain Invaders day settled — winners paid automatically",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Window still open is expected for the live day.
      if (/window still open/i.test(msg)) {
        skipped.push(`day ${idNum}: window still open`);
      } else {
        skipped.push(`day ${idNum}: ${msg}`);
        logger.warn({ err, dayId: idNum }, "Chain Invaders settleDay failed");
      }
    }
  }

  return { attempted, settled, skipped };
}

export function startChainInvadersSettler(): void {
  if (timer) return;
  if (!getContractAddress()) {
    logger.info("Chain Invaders settler idle — CHAIN_INVADERS_ADDRESS not set");
    return;
  }
  if (!getSettlerWallet()) {
    logger.info("Chain Invaders settler idle — no settler/signer key");
    return;
  }

  const tick = () => {
    void settleEligibleDays().catch((err) =>
      logger.warn({ err }, "Chain Invaders settler tick failed"),
    );
  };

  // Every 5 minutes — pays out soon after 8pm Eastern without a claim step.
  timer = setInterval(tick, 5 * 60 * 1000);
  // First attempt shortly after boot.
  setTimeout(tick, 20_000);
  logger.info("Chain Invaders auto-settler started (pays winners after window closes)");
}

export function stopChainInvadersSettler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const settleIface = new Interface(ABI);
