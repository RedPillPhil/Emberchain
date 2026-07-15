import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
}

export function loadChainFile(filePath: string): PersistedChain | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as PersistedChain;
}

export function saveChainFile(filePath: string, data: PersistedChain): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data));
  writeFileSync(filePath, JSON.stringify(data));
}
