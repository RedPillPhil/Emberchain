/**
 * Instant EMBR payouts from the airdrop distributor wallet via chain-node.
 *
 * AIRDROP_DISTRIBUTOR_PRIVATE_KEY must live ONLY in /etc/emberchain/api-server.env
 * on the production server — never commit or log the value.
 */

import { Wallet, parseEther } from "ethers";
import * as chainClient from "@workspace/chain-client";
import { logger } from "./logger";

function distributorKey(): string {
  const key = (process.env.AIRDROP_DISTRIBUTOR_PRIVATE_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "AIRDROP_DISTRIBUTOR_PRIVATE_KEY is not configured — set it in /etc/emberchain/api-server.env on the server",
    );
  }
  return key.startsWith("0x") ? key : `0x${key}`;
}

export function distributorAddress(): string | null {
  const key = (process.env.AIRDROP_DISTRIBUTOR_PRIVATE_KEY ?? "").trim();
  if (!key) return null;
  try {
    return new Wallet(key.startsWith("0x") ? key : `0x${key}`).address;
  } catch {
    return null;
  }
}

export function treasuryAddress(): string {
  return (
    process.env.AIRDROP_TREASURY_ADDRESS?.trim() ||
    process.env.AIRDROP_LIQUIDITY_TREASURY?.trim() ||
    distributorAddress() ||
    "0x9954146017aCE1994BC076243Ed49EC28C64D77B"
  ).toLowerCase();
}

/** Send native EMBR on Emberchain. Returns tx hash or null when amount is 0. */
export async function sendEmbrReward(to: string, amountEmbr: number): Promise<string | null> {
  if (amountEmbr <= 0) return null;

  const wei = parseEther(amountEmbr.toFixed(8));
  if (wei <= 0n) return null;

  try {
    const result = await chainClient.submitTransaction({
      fromPrivateKey: distributorKey(),
      to: to.toLowerCase(),
      value: wei.toString(),
    });
    logger.info(
      { to: to.toLowerCase(), amountEmbr, hash: result.hash },
      "[airdrop] EMBR reward sent",
    );
    return result.hash;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), to, amountEmbr },
      "[airdrop] EMBR payout failed",
    );
    throw err;
  }
}

export async function sendEmbrRewards(
  payouts: { to: string; amountEmbr: number }[],
): Promise<(string | null)[]> {
  const hashes: (string | null)[] = [];
  for (const p of payouts) {
    hashes.push(await sendEmbrReward(p.to, p.amountEmbr));
  }
  return hashes;
}
