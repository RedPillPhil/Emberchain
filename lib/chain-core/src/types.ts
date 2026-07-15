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
