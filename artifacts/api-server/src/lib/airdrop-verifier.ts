/**
 * Task verification helpers for the airdrop campaign.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { JsonRpcProvider, verifyMessage, formatEther } from "ethers";
import {
  BASE_LOTTERY,
  EMBER_LOTTERY,
  type TaskId,
} from "./airdrop-config";
import { treasuryAddress } from "./airdrop-distributor";

const ticketPurchasedTopic =
  "0x" +
  createHash("sha256")
    .update("TicketPurchased(uint256,uint256,address,uint8,uint8,uint8,uint8,uint8,uint256)")
    .digest("hex")
    .slice(0, 8);

function visitSecret(): string {
  return (
    process.env.AIRDROP_VISIT_SECRET ||
    process.env.SESSION_SECRET ||
    "ember-airdrop-visit-dev"
  );
}

export function buildCheckinMessage(wallet: string, dayKey: string): string {
  return `Ember Airdrop daily check-in\nwallet:${wallet.toLowerCase()}\nday:${dayKey}\nchain:7773`;
}

export function verifyCheckinSignature(
  wallet: string,
  dayKey: string,
  signature: string,
): boolean {
  try {
    const recovered = verifyMessage(buildCheckinMessage(wallet, dayKey), signature);
    return recovered.toLowerCase() === wallet.toLowerCase();
  } catch {
    return false;
  }
}

export function issueVisitToken(wallet: string, taskId: TaskId): string {
  const exp = Date.now() + 30 * 60 * 1000;
  const payload = `${wallet.toLowerCase()}:${taskId}:${exp}`;
  const sig = createHmac("sha256", visitSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function parseVisitToken(token: string): { wallet: string; taskId: TaskId } | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 4) return null;
    const [wallet, taskId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Date.now()) return null;
    const payload = `${wallet}:${taskId}:${expStr}`;
    const expected = createHmac("sha256", visitSecret()).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { wallet, taskId: taskId as TaskId };
  } catch {
    return null;
  }
}

async function hasLottoTicket(
  rpcUrl: string,
  lotteryAddress: string,
  wallet: string,
): Promise<boolean> {
  const provider = new JsonRpcProvider(rpcUrl);
  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - 500_000);
  const topicPlayer = "0x" + "0".repeat(24) + wallet.toLowerCase().slice(2);

  const logs = await provider.getLogs({
    address: lotteryAddress,
    fromBlock: from,
    toBlock: latest,
    topics: [null, null, topicPlayer],
  });

  return logs.length > 0;
}

export async function verifyEmberLottoTicket(wallet: string): Promise<boolean> {
  const rpc =
    process.env.EMBR_RPC_URL ||
    process.env.CHAIN_NODE_URL?.replace(/\/$/, "") + "/api/rpc" ||
    "http://127.0.0.1:8080/api/rpc";
  return hasLottoTicket(rpc, EMBER_LOTTERY, wallet);
}

export async function verifyBaseLottoTicket(wallet: string): Promise<boolean> {
  const rpc = process.env.BASE_RPC_URL || "https://mainnet.base.org";
  return hasLottoTicket(rpc, BASE_LOTTERY, wallet);
}

export async function verifyChainInvadersPlay(wallet: string): Promise<boolean> {
  try {
    const pg = await import("pg");
    const pool = new pg.default.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
    });
    const { rows } = await pool.query<{ ok: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM chain_invaders_scores WHERE lower(player) = $1) AS ok",
      [wallet.toLowerCase()],
    );
    await pool.end();
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

/** Verify ~$1 ETH donation to treasury on Base or Emberchain. */
export async function verifyLiquidityDonation(
  txHash: string,
  fromWallet: string,
): Promise<{ ok: boolean; chain: string; amountWei: bigint; error?: string }> {
  const hash = txHash.toLowerCase();
  const treasury = treasuryAddress();
  const minWei = BigInt(process.env.AIRDROP_LIQUIDITY_MIN_WEI ?? "800000000000000"); // ~$0.80

  for (const { chain, rpc } of [
    {
      chain: "base",
      rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    },
    {
      chain: "ember",
      rpc:
        process.env.EMBR_RPC_URL ||
        (process.env.CHAIN_NODE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8080") +
          "/api/rpc",
    },
  ]) {
    try {
      const provider = new JsonRpcProvider(rpc);
      const tx = await provider.getTransaction(hash);
      if (!tx) continue;
      if (tx.from?.toLowerCase() !== fromWallet.toLowerCase()) {
        return { ok: false, chain, amountWei: 0n, error: "Transaction sender mismatch" };
      }
      if (tx.to?.toLowerCase() !== treasury) {
        return { ok: false, chain, amountWei: 0n, error: "Send ETH to the airdrop treasury address" };
      }
      const receipt = await provider.getTransactionReceipt(hash);
      if (!receipt || receipt.status !== 1) {
        return { ok: false, chain, amountWei: 0n, error: "Transaction not confirmed" };
      }
      const value = tx.value;
      if (value < minWei) {
        return {
          ok: false,
          chain,
          amountWei: value,
          error: `Minimum ~$1 ETH required (got ${formatEther(value)} ETH)`,
        };
      }
      return { ok: true, chain, amountWei: value };
    } catch {
      /* try next chain */
    }
  }

  return { ok: false, chain: "unknown", amountWei: 0n, error: "Transaction not found on Base or Emberchain" };
}

export function hasReferralShareCompleted(referralCount: number): boolean {
  return referralCount >= 1;
}
