import type { PrefixedHexString } from "@ethereumjs/util";

export type TxStatus = "pending" | "success" | "failed";

export interface StoredTransaction {
  hash: PrefixedHexString;
  from: PrefixedHexString;
  to: PrefixedHexString | null;
  value: string; // decimal string, wei-like smallest unit
  nonce: number;
  gasLimit: string;
  data: PrefixedHexString;
  status: TxStatus;
  blockNumber: number | null;
  contractAddress: PrefixedHexString | null;
  gasUsed: string | null;
  error: string | null;
  returnData: PrefixedHexString | null;
  createdAt: string; // ISO date
}

export interface StoredBlock {
  number: number;
  hash: PrefixedHexString;
  parentHash: PrefixedHexString;
  timestamp: string; // ISO date
  miner: PrefixedHexString;
  difficulty: string;
  nonce: string;
  stateRoot: PrefixedHexString;
  reward: string;
  transactionHashes: PrefixedHexString[];
}

export interface ChainConfig {
  chainName: string;
  symbol: string;
  targetBlockTimeSeconds: number;
  blockReward: string;
  genesisDifficulty: string;
  difficultyAdjustmentWindow: number;
}

// ---------- Shielded pool (private transactions) ----------

export type NoteStatus = "unspent" | "spent";
export type NoteSource = "shield" | "private-send";

/**
 * A shielded note: an opaque, on-chain commitment to a hidden amount owned
 * by a one-time stealth address. Nothing here identifies the owner or the
 * amount to an outside observer — only someone holding the owning wallet's
 * private key can recognize, decrypt, and later spend it.
 */
export interface PrivateNote {
  id: string;
  ephemeralPublicKey: PrefixedHexString;
  stealthPublicKey: PrefixedHexString;
  commitment: PrefixedHexString;
  encryptedPayload: PrefixedHexString;
  status: NoteStatus;
  keyImage: PrefixedHexString | null;
  source: NoteSource;
  createdAtBlockHeight: number;
  createdAt: string;
}

export type ShieldedTxType = "shield" | "private-send" | "unshield";

/**
 * Public, listable record of a shielded-pool operation. For "shield" and
 * "unshield" the public address/amount fields are intentionally populated
 * — that boundary crossing is visible by design. For "private-send" they
 * are always null: no observer of this record can learn the sender,
 * recipient, or amount.
 */
export interface ShieldedTxRecord {
  id: string;
  type: ShieldedTxType;
  createdAt: string;
  publicAddress: PrefixedHexString | null;
  publicAmount: string | null;
  fee: string;
  noteIdsCreated: string[];
  noteIdsSpent: string[];
}

export interface StealthMeta {
  spendPublicKey: PrefixedHexString;
  viewPublicKey: PrefixedHexString;
}

export interface WalletRecord {
  createdAt: string;
  spendPublicKey?: PrefixedHexString;
  viewPublicKey?: PrefixedHexString;
}
