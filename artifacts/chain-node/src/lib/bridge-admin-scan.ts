/**
 * Server-side bridge admin queue — excludes relayed/completed bridges using the file store.
 */

import { Interface } from "ethers";
import { chain } from "./chain";
import { listRelayedKeys, listPendingByDirection } from "./bridge-store";
import { scanBaseBridgeOuts } from "./base-bridge-scan";

const EMBER_BRIDGE_ADDRESS = (
  process.env.EMBER_BRIDGE_ADDRESS ?? "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4"
).toLowerCase();

const LOCK_EMBR_IFACE = new Interface([
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
]);
const LOCK_EMBR_SELECTOR = LOCK_EMBR_IFACE.getFunction("lockEMBR")!.selector;

export interface AdminPendingBridgeRow {
  direction: "embr_to_base" | "base_to_embr";
  nonce: string;
  sender: string;
  baseRecipient?: string;
  embrRecipient?: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  submittedAt?: string;
  completed: false;
}

function relayedSet(): Set<string> {
  return new Set(listRelayedKeys());
}

function isRelayed(relayed: Set<string>, direction: string, nonce: string, txHash: string): boolean {
  return (
    relayed.has(`${direction}:${nonce}`)
    || relayed.has(`tx:${txHash.toLowerCase()}`)
  );
}

export async function scanAdminPendingEmbrLocks(limit = 500): Promise<AdminPendingBridgeRow[]> {
  const relayed = relayedSet();
  const txs = await chain.listTransactions(EMBER_BRIDGE_ADDRESS, limit);
  const rows: AdminPendingBridgeRow[] = [];

  for (const tx of txs) {
    if (tx.status !== "success") continue;
    if (!tx.to || tx.to.toLowerCase() !== EMBER_BRIDGE_ADDRESS) continue;
    if (BigInt(tx.value ?? "0") <= 0n) continue;

    const data = (tx.data ?? "0x").toLowerCase();
    if (!data.startsWith(LOCK_EMBR_SELECTOR)) continue;

    let baseRecipient: string;
    let nonce: string;
    try {
      const decoded = LOCK_EMBR_IFACE.parseTransaction({ data: tx.data ?? "0x", value: BigInt(tx.value) });
      if (!decoded || decoded.name !== "lockEMBR") continue;
      baseRecipient = (decoded.args[0] as string).toLowerCase();
      nonce = (decoded.args[1] as bigint).toString();
    } catch {
      continue;
    }

    if (isRelayed(relayed, "embr_to_base", nonce, tx.hash)) continue;

    rows.push({
      direction: "embr_to_base",
      nonce,
      sender: tx.from ?? "",
      baseRecipient,
      amount: tx.value,
      txHash: tx.hash,
      blockNumber: tx.blockNumber ?? 0,
      submittedAt: tx.createdAt,
      completed: false,
    });
  }

  return rows;
}

export async function scanAdminPendingBaseOuts(lookback = 1_000_000): Promise<AdminPendingBridgeRow[]> {
  const relayed = relayedSet();
  const rows: AdminPendingBridgeRow[] = [];
  const seen = new Set<string>();

  const registered = await listPendingByDirection("base_to_embr");
  for (const e of registered) {
    const txHash = e.txHashSrc ?? "";
    if (isRelayed(relayed, "base_to_embr", e.nonce, txHash)) continue;
    seen.add(e.nonce);
    rows.push({
      direction: "base_to_embr",
      nonce: e.nonce,
      sender: e.sender,
      embrRecipient: e.recipient,
      amount: e.amount,
      txHash,
      blockNumber: 0,
      submittedAt: e.createdAt,
      completed: false,
    });
  }

  try {
    const chainEvents = await scanBaseBridgeOuts(lookback);
    for (const ev of chainEvents) {
      if (seen.has(ev.nonce)) continue;
      if (isRelayed(relayed, "base_to_embr", ev.nonce, ev.txHash)) continue;
      seen.add(ev.nonce);
      rows.push({
        direction: "base_to_embr",
        nonce: ev.nonce,
        sender: ev.sender,
        embrRecipient: ev.embrRecipient,
        amount: ev.amount,
        txHash: ev.txHash,
        blockNumber: ev.blockNumber,
        completed: false,
      });
    }
  } catch (err) {
    console.error("[bridge-admin-scan] base outs failed:", (err as Error).message);
  }

  return rows;
}

export async function listAdminPendingBridges(): Promise<AdminPendingBridgeRow[]> {
  const [embr, base] = await Promise.all([
    scanAdminPendingEmbrLocks(500),
    scanAdminPendingBaseOuts(1_000_000),
  ]);
  return [...embr, ...base].sort((a, b) => {
    const ta = a.submittedAt ? Date.parse(a.submittedAt) : a.blockNumber;
    const tb = b.submittedAt ? Date.parse(b.submittedAt) : b.blockNumber;
    return tb - ta;
  });
}
