import { mkdirSync, readFileSync, existsSync, renameSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrefixedHexString } from "@ethereumjs/util";
import type { SerializedState } from "./state";
import type { StoredBlock, StoredTransaction, PrivateNote, ShieldedTxRecord, WalletRecord, ExchangeListing } from "./types";

export interface PersistedChain {
  version: 1 | 2 | 3;
  difficulty: string;
  blocks: StoredBlock[];
  transactions: StoredTransaction[];
  wallets: [PrefixedHexString, WalletRecord][];
  state: SerializedState;
  privateNotes?: PrivateNote[];
  shieldedTxs?: ShieldedTxRecord[];
  exchangeListings?: ExchangeListing[];
  /** Persisted set of `${currency}:${txHash}` strings used to prevent payment-proof replay. */
  usedPaymentProofs?: string[];
  /** address → last-template-fetch timestamp (ms). Persisted so active-miner count survives restarts. */
  recentMiners?: [string, number][];
  /** address → share count for the current (in-progress) round. Persisted so in-flight rounds survive restarts. */
  currentRoundShares?: [string, number][];
  /** "tipHash:nonce" keys of shares already accepted this round. Prevents replay after a server restart. */
  submittedShareNonces?: string[];
}

export function loadChainFile(filePath: string): PersistedChain | null {
  if (!existsSync(filePath)) return null;
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    console.warn("[chain] Could not read chain file — treating as absent.");
    return null;
  }
  // Guard against truncated writes (crash mid-write leaves invalid JSON).
  // The DB is the authoritative store; a corrupt local file is treated as absent
  // so the chain boots from the DB on next startup.
  try {
    return JSON.parse(raw) as PersistedChain;
  } catch {
    console.warn("[chain] chain.json appears corrupt (truncated write?) — treating as absent.");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Async file writer — minimises event-loop stall on every block commit
//
// Design:
//  1. saveChainFile() serialises the current snapshot synchronously with
//     JSON.stringify.  This must stay synchronous because many fields in
//     PersistedChain hold mutable objects (StoredTransaction, ExchangeListing,
//     shieldedTxs array) that can be mutated by the next operation once the
//     EVM lock is released.  Capturing the JSON string immediately gives us a
//     safe, immutable snapshot.
//
//  2. The actual disk write (writeFile) is async and fire-and-forget.  A
//     "pending" slot coalesces rapid calls: only the most-recent JSON string
//     is written when the current write finishes, so at most one extra write
//     is ever queued regardless of how many persist() calls arrive in a burst.
//
//  3. mkdirSync is guarded by a per-path flag so the syscall only fires once.
//
// The DB path (asyncPersistHook in blockchain.ts) is separately debounced
// with a 4-second timer in db.ts — it is already non-blocking.
// ---------------------------------------------------------------------------

interface WriterState {
  writing: boolean;
  /** Latest serialised snapshot waiting to be flushed to disk. */
  pending: string | null;
  /** Set to true after the first mkdirSync so we pay the syscall only once. */
  dirReady: boolean;
}

const _writers = new Map<string, WriterState>();

function getWriter(filePath: string): WriterState {
  if (!_writers.has(filePath)) {
    _writers.set(filePath, { writing: false, pending: null, dirReady: false });
  }
  return _writers.get(filePath)!;
}

async function drainWriter(filePath: string): Promise<void> {
  const w = getWriter(filePath);
  while (w.pending !== null) {
    const payload = w.pending;
    w.pending = null;
    const tmp = filePath + ".tmp";
    try {
      // Write to a sibling temp file first, then atomically rename it over
      // the target.  On POSIX this is a single syscall (rename(2)) that is
      // guaranteed to be atomic — readers never see a partially-written file.
      // On Windows, rename is best-effort but still far safer than direct write.
      await writeFile(tmp, payload, "utf-8");
      renameSync(tmp, filePath);
    } catch {
      // Best-effort — the DB is the authoritative store; the local file is a
      // warm-start cache.  A missed write will be retried on the next persist.
    }
  }
  w.writing = false;
}

/**
 * Enqueues a chain snapshot for async disk write.
 *
 * JSON serialisation happens synchronously to capture an immutable snapshot
 * of the current state before any future mutations.  The writeFile() call
 * happens asynchronously, freeing the event loop immediately so that pending
 * RPC responses and mining template requests are not delayed.
 *
 * Rapid successive calls are coalesced: if a write is already in flight,
 * only the freshest JSON string is kept and written once the current write
 * finishes.
 */
/**
 * Returns a Promise that resolves once all pending writes for the given file
 * path have been flushed to disk.  Useful when a fresh Blockchain instance
 * needs to load a file that may have been written asynchronously by an earlier
 * instance in the same process (e.g. in tests that simulate a restart without
 * actually killing the process).  In a real multi-process restart the writers
 * map is empty for the new process, so this resolves immediately.
 */
export async function flushChainFile(filePath: string): Promise<void> {
  const w = _writers.get(filePath);
  if (!w?.writing) return;
  // Poll via setImmediate until the drain finishes — fast (typically 1–2 ticks).
  await new Promise<void>((resolve) => {
    const check = () => {
      if (!w.writing) return resolve();
      setImmediate(check);
    };
    setImmediate(check);
  });
}

export function saveChainFile(filePath: string, data: PersistedChain): void {
  const w = getWriter(filePath);

  // Ensure parent directory exists — paid only once per unique filePath.
  if (!w.dirReady) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    w.dirReady = true;
  }

  // Serialise NOW to snapshot mutable state before the lock is released.
  // Keep only the latest snapshot; any previously queued string is discarded.
  w.pending = JSON.stringify(data);

  if (!w.writing) {
    w.writing = true;
    // Kick off the async drain without awaiting — returns to the caller immediately.
    drainWriter(filePath).catch(() => {
      w.writing = false;
    });
  }
}
