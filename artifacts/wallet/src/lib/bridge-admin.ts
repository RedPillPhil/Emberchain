import { Contract, Interface, JsonRpcProvider, Wallet } from "ethers";
import { chainNodeApi, chainNodeRpcUrl } from "@/lib/config";
import { submitChainTransaction } from "@/lib/chain-node";
import {
  BASE_BRIDGE_ABI,
  BASE_BRIDGE_FROM_BLOCK,
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

const DISMISSED_STORAGE_KEY = "emberchain-bridge-dismissed-v1";

function relayedKey(direction: PendingBridge["direction"], nonce: string): string {
  return `${direction}:${nonce}`;
}

function txRelayedKey(txHash: string): string {
  return `tx:${txHash.toLowerCase()}`;
}

function loadDismissedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is string => typeof k === "string"));
  } catch {
    return new Set();
  }
}

/** Keep completed bridges hidden even when chain-node mark-relayed fails. */
export function markBridgeDismissedLocally(item: PendingBridge): void {
  const keys = loadDismissedKeys();
  keys.add(relayedKey(item.direction, item.nonce));
  keys.add(txRelayedKey(item.txHash));
  localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...keys]));
}

function isBridgeDismissed(
  direction: PendingBridge["direction"],
  nonce: string,
  txHash: string,
  relayed: Set<string>,
): boolean {
  return relayed.has(relayedKey(direction, nonce)) || relayed.has(txRelayedKey(txHash));
}

async function fetchRelayedKeys(): Promise<Set<string>> {
  const merged = loadDismissedKeys();
  try {
    const res = await fetch(chainNodeApi("/api/bridge/relayed-keys"), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return merged;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return merged;
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) return merged;
    for (const k of body) {
      if (typeof k === "string") merged.add(k);
    }
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...merged]));
  } catch {
    /* local dismissals still apply */
  }
  return merged;
}

/** Tell chain-node this bridge was handled — never show in admin again. */
export async function markBridgeRelayedOnServer(
  item: PendingBridge,
  txHashDst?: string,
): Promise<void> {
  markBridgeDismissedLocally(item);
  try {
    const res = await fetch(chainNodeApi("/api/bridge/mark-relayed"), {
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
    if (!res.ok) {
      console.warn("[bridge-admin] mark-relayed failed:", res.status);
    }
  } catch {
    /* local dismiss still applied */
  }
}

async function isBridgeCompleted(
  direction: PendingBridge["direction"],
  nonce: string,
  relayed: Set<string>,
  txHash?: string,
): Promise<boolean> {
  if (txHash && isBridgeDismissed(direction, nonce, txHash, relayed)) return true;
  if (isBridgeDismissed(direction, nonce, txHash ?? "", relayed)) return true;
  // EMBR usedNonces is shared by lockEMBR + releaseEMBR — only Base nonce is reliable for EMBR→Base.
  if (direction === "embr_to_base") return isNonceUsedOnBase(nonce);
  return false;
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

    if (isBridgeDismissed("embr_to_base", parsed.nonce, summary.hash, relayed)) continue;

    const completed = await isBridgeCompleted("embr_to_base", parsed.nonce, relayed, summary.hash);
    if (completed) continue;
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

  const completed = await isBridgeCompleted("embr_to_base", parsed.nonce, relayed, tx.hash);
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

  let ev: {
    nonce: string;
    sender: string;
    embrRecipient: string;
    amount: string;
    txHash: string;
    blockNumber: number;
  } | null = null;

  try {
    const res = await fetch(chainNodeApi(`/api/bridge/base-out/${encodeURIComponent(txHash)}`), {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      ev = (await res.json()) as typeof ev;
    }
  } catch {
    /* try browser Base RPC */
  }

  if (!ev) {
    try {
      const provider = await baseProvider();
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1) return null;
      const baseBridge = new Contract(EMBERCHAIN_BRIDGE_ADDRESS, BASE_BRIDGE_ABI, provider);
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== EMBERCHAIN_BRIDGE_ADDRESS.toLowerCase()) continue;
        try {
          const parsed = baseBridge.interface.parseLog(log);
          if (!parsed || parsed.name !== "BridgeOut") continue;
          ev = {
            nonce: (parsed.args[3] as bigint).toString(),
            sender: parsed.args[0] as string,
            embrRecipient: parsed.args[1] as string,
            amount: (parsed.args[2] as bigint).toString(),
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
          };
          break;
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }
  }

  if (!ev) return null;

  const embrRecipient = ev.embrRecipient.startsWith("0x")
    ? ev.embrRecipient
    : `0x${ev.embrRecipient.replace(/^0x/i, "")}`;

  const completed = await isBridgeCompleted("base_to_embr", ev.nonce, relayed, ev.txHash);
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

async function fetchBaseOutEventsFromApi(
  lookbackBlocks: number,
): Promise<Array<{
  nonce: string;
  sender: string;
  embrRecipient: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  submittedAt?: string;
}>> {
  const parseJsonList = async (res: Response) => {
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !ct.includes("application/json")) return null;
    const body = await res.json();
    return Array.isArray(body) ? body : null;
  };

  try {
    const res = await fetch(
      `${chainNodeApi("/api/bridge/base-outs")}?lookback=${lookbackBlocks}`,
      { headers: { Accept: "application/json" } },
    );
    const events = await parseJsonList(res);
    if (events) return events;
  } catch {
    /* try store-only endpoint */
  }

  try {
    const res = await fetch(chainNodeApi("/api/bridge/pending-base-outs"), {
      headers: { Accept: "application/json" },
    });
    const events = await parseJsonList(res);
    if (events) return events;
  } catch {
    /* fall through to browser RPC */
  }

  return [];
}

async function fetchBaseToEmbrOuts(
  relayed: Set<string>,
  lookbackBlocks = 1_000_000,
): Promise<BaseToEmbrPending[]> {
  const events = await fetchBaseOutEventsFromApi(lookbackBlocks);
  if (events.length > 0) {
    const pending: BaseToEmbrPending[] = [];
    for (const ev of events) {
      const embrRecipient = ev.embrRecipient.startsWith("0x")
        ? ev.embrRecipient
        : `0x${ev.embrRecipient.replace(/^0x/i, "")}`;
      const completed = await isBridgeCompleted("base_to_embr", ev.nonce, relayed, ev.txHash);
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

  const provider = await baseProvider();
  const baseBridge = new Contract(EMBERCHAIN_BRIDGE_ADDRESS, BASE_BRIDGE_ABI, provider);
  const baseHeight = await provider.getBlockNumber();
  const baseFrom = Math.max(BASE_BRIDGE_FROM_BLOCK, baseHeight - lookbackBlocks);

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
    const completed = await isBridgeCompleted("base_to_embr", nonce, relayed, log.transactionHash);
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

type AdminPendingRow = {
  direction: PendingBridge["direction"];
  nonce: string;
  sender: string;
  baseRecipient?: string;
  embrRecipient?: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  submittedAt?: string;
};

function mapAdminPendingRow(row: AdminPendingRow, relayed: Set<string>): PendingBridge | null {
  if (isBridgeDismissed(row.direction, row.nonce, row.txHash, relayed)) return null;
  if (row.direction === "embr_to_base") {
    return {
      direction: "embr_to_base",
      nonce: row.nonce,
      sender: row.sender,
      baseRecipient: row.baseRecipient ?? "",
      amount: row.amount,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      submittedAt: row.submittedAt,
      completed: false,
    };
  }
  const embrRecipient = row.embrRecipient ?? "";
  return {
    direction: "base_to_embr",
    nonce: row.nonce,
    sender: row.sender,
    embrRecipient: embrRecipient.startsWith("0x") ? embrRecipient : `0x${embrRecipient.replace(/^0x/i, "")}`,
    amount: row.amount,
    txHash: row.txHash,
    blockNumber: row.blockNumber,
    submittedAt: row.submittedAt,
    completed: false,
  };
}

export async function fetchPendingBridges(lookbackBlocks = 1_000_000): Promise<PendingBridge[]> {
  const relayed = await fetchRelayedKeys();

  try {
    const res = await fetch(chainNodeApi("/api/bridge/admin-pending"), {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const rows = (await res.json()) as AdminPendingRow[];
        if (Array.isArray(rows)) {
          return rows
            .map((r) => mapAdminPendingRow(r, relayed))
            .filter((r): r is PendingBridge => r !== null);
        }
      }
    }
  } catch {
    /* fall back to client scan */
  }

  const [embrLocks, baseOuts] = await Promise.all([
    fetchEmbrToBaseLocks(relayed, 500),
    fetchBaseToEmbrOuts(relayed, lookbackBlocks).catch(() => [] as BaseToEmbrPending[]),
  ]);
  return [...embrLocks, ...baseOuts]
    .filter((r) => !isBridgeDismissed(r.direction, r.nonce, r.txHash, relayed))
    .sort((a, b) => {
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
