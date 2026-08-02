import { Contract, Interface, JsonRpcProvider, Wallet } from "ethers";
import { chainNodeApi, chainNodeRpcUrl } from "@/lib/config";
import { submitChainTransaction } from "@/lib/chain-node";
import {
  BASE_BRIDGE_ABI,
  BASE_RPC_URL,
  EMBR_BRIDGE_ABI,
  EMBER_BRIDGE_ADDRESS,
  EMBERCHAIN_BRIDGE_ADDRESS,
} from "@/lib/bridge-contracts";
import { getBaseBlockTimestamp, isBridgeLegComplete, isNonceAlreadyUsedError, isNonceUsedOnBase, isNonceUsedOnEmbr } from "@/lib/bridge-read";

export interface EmbrToBasePending {
  direction: "embr_to_base";
  nonce: string;
  sender: string;
  baseRecipient: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  submittedAt?: string;
  completed: boolean;
}

export interface BaseToEmbrPending {
  direction: "base_to_embr";
  nonce: string;
  sender: string;
  embrRecipient: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  submittedAt?: string;
  completed: boolean;
}

export type PendingBridge = EmbrToBasePending | BaseToEmbrPending;

function relayedKey(direction: PendingBridge["direction"], nonce: string): string {
  return `${direction}:${nonce}`;
}

async function fetchRelayedKeys(): Promise<Set<string>> {
  try {
    const res = await fetch(chainNodeApi("/api/bridge/relayed-keys"), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return new Set();
    const keys = (await res.json()) as string[];
    return new Set(keys);
  } catch {
    return new Set();
  }
}

/** Tell chain-node this bridge was handled — never show in admin again. */
export async function markBridgeRelayedOnServer(
  item: PendingBridge,
  txHashDst?: string,
): Promise<void> {
  try {
    await fetch(chainNodeApi("/api/bridge/mark-relayed"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        direction: item.direction,
        nonce: item.nonce,
        txHashSrc: item.txHash,
        txHashDst,
        sender: item.sender,
        recipient: item.direction === "embr_to_base" ? item.baseRecipient : item.embrRecipient,
        amount: item.amount,
      }),
    });
  } catch {
    /* best-effort — on-chain completion still applies on next refresh */
  }
}

async function isBridgeCompleted(
  direction: PendingBridge["direction"],
  nonce: string,
  relayed: Set<string>,
): Promise<boolean> {
  if (relayed.has(relayedKey(direction, nonce))) return true;
  return isBridgeLegComplete(direction, nonce);
}

const embrBridgeIface = new Interface([...EMBR_BRIDGE_ABI]);
const LOCK_EMBR_SELECTOR = embrBridgeIface.getFunction("lockEMBR")!.selector;

interface ChainTxSummary {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  status: string;
  blockNumber: number;
  data?: string | null;
  createdAt?: string;
}

interface ChainTxFull extends ChainTxSummary {
  data?: string | null;
  createdAt?: string;
}

async function embrProvider(): Promise<JsonRpcProvider> {
  return new JsonRpcProvider(chainNodeRpcUrl());
}

async function baseProvider(): Promise<JsonRpcProvider> {
  return new JsonRpcProvider(BASE_RPC_URL);
}

function normalizeAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const cleaned = addr.replace(/^=+/, "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(cleaned) ? cleaned : null;
}

/** Emberchain JSON-RPC stubs eth_getLogs → always []. Scan via REST instead. */
async function fetchEmbrToBaseLocks(
  relayed: Set<string>,
  limit = 500,
): Promise<EmbrToBasePending[]> {
  const res = await fetch(
    `${chainNodeApi("/api/transactions")}?address=${EMBER_BRIDGE_ADDRESS}&limit=${limit}`,
    { headers: { Accept: "application/json" } },
  );
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok || !ct.includes("application/json")) {
    throw new Error(`Failed to list EMBR transactions (HTTP ${res.status})`);
  }
  const summaries = (await res.json()) as ChainTxSummary[];

  const locks: EmbrToBasePending[] = [];

  for (const summary of summaries) {
    if (summary.status !== "success") continue;
    const to = normalizeAddress(summary.to);
    if (to !== EMBER_BRIDGE_ADDRESS.toLowerCase()) continue;
    if (BigInt(summary.value) <= 0n) continue;

    let tx: ChainTxFull;
    if (summary.data) {
      tx = summary as ChainTxFull;
    } else {
      const detailRes = await fetch(chainNodeApi(`/api/transactions/${encodeURIComponent(summary.hash)}`), {
        headers: { Accept: "application/json" },
      });
      if (!detailRes.ok) continue;
      tx = (await detailRes.json()) as ChainTxFull;
    }

    const parsed = parseLockEmbrTx(tx);
    if (!parsed) continue;

    const completed = await isBridgeCompleted("embr_to_base", parsed.nonce, relayed);
    locks.push({
      direction: "embr_to_base",
      nonce: parsed.nonce,
      sender: summary.from,
      baseRecipient: parsed.baseRecipient,
      amount: parsed.amount,
      txHash: summary.hash,
      blockNumber: summary.blockNumber,
      submittedAt: tx.createdAt,
      completed,
    });
  }

  return locks;
}

function parseLockEmbrTx(tx: ChainTxFull): { baseRecipient: string; nonce: string; amount: string } | null {
  const data = tx.data?.toLowerCase();
  if (!data || !data.startsWith(LOCK_EMBR_SELECTOR)) return null;
  try {
    const decoded = embrBridgeIface.decodeFunctionData("lockEMBR", data);
    const baseRecipient = decoded[0] as string;
    const nonce = (decoded[1] as bigint).toString();
    return { baseRecipient, nonce, amount: tx.value };
  } catch {
    return null;
  }
}

/** Look up a single EMBR lock tx by hash (for manual admin completion). */
export async function fetchEmbrLockByTxHash(txHash: string): Promise<EmbrToBasePending | null> {
  const relayed = await fetchRelayedKeys();
  const res = await fetch(chainNodeApi(`/api/transactions/${encodeURIComponent(txHash)}`), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const tx = (await res.json()) as ChainTxFull;
  if (tx.status !== "success") return null;
  const parsed = parseLockEmbrTx(tx);
  if (!parsed) return null;

  const completed = await isBridgeCompleted("embr_to_base", parsed.nonce, relayed);
  return {
    direction: "embr_to_base",
    nonce: parsed.nonce,
    sender: tx.from,
    baseRecipient: parsed.baseRecipient,
    amount: parsed.amount,
    txHash: tx.hash,
    blockNumber: tx.blockNumber,
    submittedAt: tx.createdAt,
    completed,
  };
}

/** Most public RPC nodes cap eth_getLogs to a 10k block window. */
const LOG_CHUNK_SIZE = 10_000;

async function queryFilterChunked(
  contract: Contract,
  filter: ReturnType<Contract["filters"]["BridgeOut"]>,
  fromBlock: number,
  toBlock: number,
): Promise<Awaited<ReturnType<Contract["queryFilter"]>>> {
  const logs: Awaited<ReturnType<Contract["queryFilter"]>> = [];
  for (let from = fromBlock; from <= toBlock; from += LOG_CHUNK_SIZE) {
    const to = Math.min(from + LOG_CHUNK_SIZE - 1, toBlock);
    const chunk = await contract.queryFilter(filter, from, to);
    logs.push(...chunk);
  }
  return logs;
}

/** Look up a single Base bridgeOut tx by hash (for manual admin completion). */
export async function fetchBaseOutByTxHash(txHash: string): Promise<BaseToEmbrPending | null> {
  const relayed = await fetchRelayedKeys();
  const res = await fetch(chainNodeApi(`/api/bridge/base-out/${encodeURIComponent(txHash)}`), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const ev = (await res.json()) as {
    nonce: string;
    sender: string;
    embrRecipient: string;
    amount: string;
    txHash: string;
    blockNumber: number;
  };

  const embrRecipient = ev.embrRecipient.startsWith("0x")
    ? ev.embrRecipient
    : `0x${ev.embrRecipient.replace(/^0x/i, "")}`;

  const completed = await isBridgeCompleted("base_to_embr", ev.nonce, relayed);
  return {
    direction: "base_to_embr",
    nonce: ev.nonce,
    sender: ev.sender,
    embrRecipient,
    amount: ev.amount,
    txHash: ev.txHash,
    blockNumber: ev.blockNumber,
    completed,
  };
}

async function fetchBaseToEmbrOuts(
  relayed: Set<string>,
  lookbackBlocks = 50_000,
): Promise<BaseToEmbrPending[]> {
  try {
    const res = await fetch(
      `${chainNodeApi("/api/bridge/base-outs")}?lookback=${lookbackBlocks}`,
      { headers: { Accept: "application/json" } },
    );
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const events = (await res.json()) as Array<{
          nonce: string;
          sender: string;
          embrRecipient: string;
          amount: string;
          txHash: string;
          blockNumber: number;
          submittedAt?: string;
        }>;
        const pending: BaseToEmbrPending[] = [];
        for (const ev of events) {
          const embrRecipient = ev.embrRecipient.startsWith("0x")
            ? ev.embrRecipient
            : `0x${ev.embrRecipient.replace(/^0x/i, "")}`;
          const completed = await isBridgeCompleted("base_to_embr", ev.nonce, relayed);
          pending.push({
            direction: "base_to_embr",
            nonce: ev.nonce,
            sender: ev.sender,
            embrRecipient,
            amount: ev.amount,
            txHash: ev.txHash,
            blockNumber: ev.blockNumber,
            submittedAt: ev.submittedAt,
            completed,
          });
        }
        return pending;
      }
    }
  } catch {
    /* fall through to browser RPC */
  }

  const provider = await baseProvider();
  const baseBridge = new Contract(EMBERCHAIN_BRIDGE_ADDRESS, BASE_BRIDGE_ABI, provider);
  const baseHeight = await provider.getBlockNumber();
  const baseFrom = Math.max(0, baseHeight - lookbackBlocks);

  let baseLogs: Awaited<ReturnType<Contract["queryFilter"]>>;
  try {
    baseLogs = await queryFilterChunked(
      baseBridge,
      baseBridge.filters.BridgeOut(),
      baseFrom,
      baseHeight,
    );
  } catch {
    return [];
  }

  const pending: BaseToEmbrPending[] = [];
  for (const log of baseLogs) {
    if (!("args" in log) || !log.args) continue;
    const nonce = (log.args[3] as bigint).toString();
    const embrRecipientRaw = log.args[1] as string;
    const embrRecipient = embrRecipientRaw.startsWith("0x")
      ? embrRecipientRaw
      : `0x${embrRecipientRaw.replace(/^0x/i, "")}`;
    const completed = await isBridgeCompleted("base_to_embr", nonce, relayed);
    const blockTs = await getBaseBlockTimestamp(log.blockNumber);
    pending.push({
      direction: "base_to_embr",
      nonce,
      sender: log.args[0] as string,
      embrRecipient,
      amount: (log.args[2] as bigint).toString(),
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      submittedAt: blockTs ? new Date(blockTs).toISOString() : undefined,
      completed,
    });
  }
  return pending;
}

export async function fetchPendingBridges(lookbackBlocks = 50_000): Promise<PendingBridge[]> {
  const relayed = await fetchRelayedKeys();
  const [embrLocks, baseOuts] = await Promise.all([
    fetchEmbrToBaseLocks(relayed, 500),
    fetchBaseToEmbrOuts(relayed, lookbackBlocks).catch(() => [] as BaseToEmbrPending[]),
  ]);
  return [...embrLocks, ...baseOuts].sort((a, b) => {
    const ta = a.submittedAt ? Date.parse(a.submittedAt) : a.blockNumber;
    const tb = b.submittedAt ? Date.parse(b.submittedAt) : b.blockNumber;
    return tb - ta;
  });
}

export async function completeEmbrToBase(
  relayerPrivateKey: string,
  item: EmbrToBasePending,
): Promise<string> {
  if (await isNonceUsedOnBase(item.nonce)) {
    return "already_completed";
  }

  const provider = await baseProvider();
  const wallet = new Wallet(relayerPrivateKey, provider);
  const bridge = new Contract(EMBERCHAIN_BRIDGE_ADDRESS, BASE_BRIDGE_ABI, wallet);
  try {
    const tx = await bridge.bridgeIn(item.baseRecipient, BigInt(item.amount), BigInt(item.nonce));
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status === 0) throw new Error("bridgeIn reverted on Base");
    return receipt.hash as string;
  } catch (err) {
    if (isNonceAlreadyUsedError(err)) return "already_completed";
    throw err;
  }
}

export async function completeBaseToEmbr(
  relayerPrivateKey: string,
  item: BaseToEmbrPending,
): Promise<string> {
  const recipient = item.embrRecipient.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    throw new Error("Invalid EMBR recipient address on Base bridge event");
  }

  // Release marks nonce used on EMBR; lock uses the same mapping — only skip if release already ran.
  if (await isBridgeLegComplete("base_to_embr", item.nonce)) {
    return "already_completed";
  }

  const data = embrBridgeIface.encodeFunctionData("releaseEMBR", [
    recipient,
    BigInt(item.amount),
    BigInt(item.nonce),
  ]);

  const normalized = relayerPrivateKey.startsWith("0x") ? relayerPrivateKey : `0x${relayerPrivateKey}`;
  try {
    const tx = await submitChainTransaction({
      fromPrivateKey: normalized,
      to: EMBER_BRIDGE_ADDRESS,
      value: "0",
      data,
      gasLimit: "300000",
    });
    return tx.hash;
  } catch (err) {
    if (isNonceAlreadyUsedError(err)) return "already_completed";
    throw err;
  }
}

export function formatEmbr(amountWei: string): string {
  const n = BigInt(amountWei);
  const whole = n / 10n ** 18n;
  const frac = (n % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export { formatBridgeTime } from "@/lib/bridge-read";
