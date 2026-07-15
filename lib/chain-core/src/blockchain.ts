import { createEVM } from "@ethereumjs/evm";
import type { EVM } from "@ethereumjs/evm";
import { Address, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import type { PrefixedHexString } from "@ethereumjs/util";
import type { SimpleStateManager } from "@ethereumjs/statemanager";
import { createEmberchainCommon } from "./common";
import { createStateManager, dumpState, loadState, getBalance, getNonce, credit, ensureAccount } from "./state";
import { generateWallet, walletFromPrivateKey, encodeTxPayload, signPayload, hashTransaction } from "./crypto";
import { mine, retargetDifficulty, type MinableHeader } from "./mining";
import { loadChainFile, saveChainFile, type PersistedChain } from "./persistence";
import type { StoredBlock, StoredTransaction, ChainConfig } from "./types";

export const EMBERCHAIN_CONFIG: ChainConfig = {
  chainName: "Emberchain",
  symbol: "EMBR",
  targetBlockTimeSeconds: 8,
  blockReward: "5000000000000000000", // 5 EMBR (18 decimals, like ether)
  genesisDifficulty: "60000",
  difficultyAdjustmentWindow: 1,
};

const ZERO_ADDRESS: PrefixedHexString = "0x0000000000000000000000000000000000000000".slice(0, 42) as PrefixedHexString;
const GENESIS_PARENT_HASH: PrefixedHexString = `0x${"0".repeat(64)}`;
const GENESIS_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z").toISOString();
const MAX_TXS_PER_BLOCK = 40;
const MAX_MEMPOOL_ITEMS = 500;

interface PendingTx {
  hash: PrefixedHexString;
  from: PrefixedHexString;
  to: PrefixedHexString | null;
  value: bigint;
  data: PrefixedHexString;
  gasLimit: bigint;
}

interface MiningState {
  active: boolean;
  minerAddress: PrefixedHexString | null;
  stopRequested: boolean;
  blocksMinedThisSession: number;
  hashRate: number;
  loop: Promise<void> | null;
}

function transactionsRootOf(hashes: string[]): PrefixedHexString {
  return bytesToHex(keccak256(new TextEncoder().encode(hashes.join(","))));
}

export class Blockchain {
  private common = createEmberchainCommon();
  private stateManager: SimpleStateManager;
  private evm!: EVM;
  private blocks: StoredBlock[] = [];
  private transactions = new Map<PrefixedHexString, StoredTransaction>();
  private mempool: PendingTx[] = [];
  private wallets: Map<PrefixedHexString, { createdAt: string }> = new Map();
  private difficulty: bigint;
  private readonly dataFile: string;
  private ready: Promise<void>;
  private mining: MiningState = {
    active: false,
    minerAddress: null,
    stopRequested: false,
    blocksMinedThisSession: 0,
    hashRate: 0,
    loop: null,
  };

  constructor(dataFile: string) {
    this.dataFile = dataFile;
    this.difficulty = BigInt(EMBERCHAIN_CONFIG.genesisDifficulty);
    this.stateManager = createStateManager(this.common);
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const persisted = loadChainFile(this.dataFile);
    if (persisted) {
      this.difficulty = BigInt(persisted.difficulty);
      this.blocks = persisted.blocks;
      for (const tx of persisted.transactions) this.transactions.set(tx.hash, tx);
      this.wallets = new Map(persisted.wallets);
      this.stateManager = loadState(this.common, persisted.state);
    } else {
      this.blocks = [
        {
          number: 0,
          hash: GENESIS_PARENT_HASH,
          parentHash: GENESIS_PARENT_HASH,
          timestamp: GENESIS_TIMESTAMP,
          miner: ZERO_ADDRESS,
          difficulty: this.difficulty.toString(),
          nonce: "0",
          stateRoot: `0x${"0".repeat(64)}`,
          reward: "0",
          transactionHashes: [],
        },
      ];
    }
    this.evm = await createEVM({ common: this.common, stateManager: this.stateManager });
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  private persist(): void {
    const data: PersistedChain = {
      version: 1,
      difficulty: this.difficulty.toString(),
      blocks: this.blocks,
      transactions: [...this.transactions.values()],
      wallets: [...this.wallets.entries()],
      state: dumpState(this.stateManager),
    };
    saveChainFile(this.dataFile, data);
  }

  // ---------- Wallets ----------

  async createWallet(importPrivateKey?: string | null) {
    const wallet = importPrivateKey ? walletFromPrivateKey(importPrivateKey) : generateWallet();
    await this.whenReady();
    await ensureAccount(this.stateManager, wallet.address);
    if (!this.wallets.has(wallet.address)) {
      this.wallets.set(wallet.address, { createdAt: new Date().toISOString() });
    }
    this.persist();
    const balance = await getBalance(this.stateManager, wallet.address);
    const nonce = await getNonce(this.stateManager, wallet.address);
    return { ...wallet, balance: balance.toString(), nonce };
  }

  async listWallets() {
    await this.whenReady();
    const result = [];
    for (const address of this.wallets.keys()) {
      const balance = await getBalance(this.stateManager, address);
      const nonce = await getNonce(this.stateManager, address);
      result.push({ address, balance: balance.toString(), nonce });
    }
    return result;
  }

  async getWallet(address: PrefixedHexString) {
    await this.whenReady();
    const balance = await getBalance(this.stateManager, address);
    const nonce = await getNonce(this.stateManager, address);
    return { address, balance: balance.toString(), nonce };
  }

  // ---------- Transactions ----------

  async submitTransaction(input: {
    fromPrivateKey: string;
    to: string | null;
    value: string;
    data: string;
    gasLimit: string;
  }): Promise<StoredTransaction> {
    await this.whenReady();
    const wallet = walletFromPrivateKey(input.fromPrivateKey);
    if (!this.wallets.has(wallet.address)) {
      this.wallets.set(wallet.address, { createdAt: new Date().toISOString() });
    }
    const nonce = await getNonce(this.stateManager, wallet.address);
    const data = (input.data && input.data !== "" ? input.data : "0x") as PrefixedHexString;
    const gasLimit = input.gasLimit && input.gasLimit !== "" ? input.gasLimit : "3000000";

    const payload = encodeTxPayload({
      nonce,
      to: input.to,
      value: input.value,
      data,
      gasLimit,
      chainId: 7773,
    });
    const { signature, hash: signingHash } = signPayload(input.fromPrivateKey, payload);
    const hash = hashTransaction(payload, signature);

    if (this.mempool.length >= MAX_MEMPOOL_ITEMS) {
      throw new Error("Mempool is full, try again shortly");
    }
    if (BigInt(input.value) < 0n) {
      throw new Error("Value must be non-negative");
    }

    const tx: StoredTransaction = {
      hash,
      from: wallet.address,
      to: input.to as PrefixedHexString | null,
      value: input.value,
      nonce,
      gasLimit,
      data,
      status: "pending",
      blockNumber: null,
      contractAddress: null,
      gasUsed: null,
      error: null,
      returnData: null,
      createdAt: new Date().toISOString(),
    };
    this.transactions.set(hash, tx);
    this.mempool.push({
      hash,
      from: wallet.address,
      to: input.to as PrefixedHexString | null,
      value: BigInt(input.value),
      data,
      gasLimit: BigInt(gasLimit),
    });
    this.persist();
    void signingHash; // retained for potential future signature verification
    return tx;
  }

  async getTransaction(hash: string): Promise<StoredTransaction | undefined> {
    await this.whenReady();
    return this.transactions.get(hash as PrefixedHexString);
  }

  async listTransactions(address?: string, limit = 20): Promise<StoredTransaction[]> {
    await this.whenReady();
    let all = [...this.transactions.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (address) {
      all = all.filter((tx) => tx.from === address || tx.to === address);
    }
    return all.slice(0, limit);
  }

  // ---------- Contract calls (read-only) ----------

  async callContract(input: {
    to: string;
    data: string;
    from?: string | null;
  }): Promise<{ success: boolean; returnData: PrefixedHexString; gasUsed: string; error: string | null }> {
    await this.whenReady();
    await this.stateManager.checkpoint();
    try {
      const result = await this.evm.runCall({
        caller: new Address(hexToBytes((input.from as PrefixedHexString) ?? ZERO_ADDRESS)),
        to: new Address(hexToBytes(input.to as PrefixedHexString)),
        data: hexToBytes((input.data as PrefixedHexString) ?? "0x"),
        gasLimit: 10_000_000n,
        skipBalance: true,
      });
      return {
        success: !result.execResult.exceptionError,
        returnData: bytesToHex(result.execResult.returnValue),
        gasUsed: result.execResult.executionGasUsed.toString(),
        error: result.execResult.exceptionError ? result.execResult.exceptionError.error : null,
      };
    } finally {
      await this.stateManager.revert();
    }
  }

  // ---------- Chain status ----------

  async getStatus() {
    await this.whenReady();
    const latest = this.blocks[this.blocks.length - 1];
    return {
      chainName: EMBERCHAIN_CONFIG.chainName,
      symbol: EMBERCHAIN_CONFIG.symbol,
      height: latest.number,
      latestBlockHash: latest.hash,
      difficulty: this.difficulty.toString(),
      targetBlockTimeSeconds: EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
      pendingTransactionCount: this.mempool.length,
      isMining: this.mining.active,
      minerAddress: this.mining.minerAddress,
      blockReward: EMBERCHAIN_CONFIG.blockReward,
    };
  }

  async listBlocks(limit = 20): Promise<StoredBlock[]> {
    await this.whenReady();
    return [...this.blocks].sort((a, b) => b.number - a.number).slice(0, limit);
  }

  async getBlock(number: number) {
    await this.whenReady();
    const block = this.blocks.find((b) => b.number === number);
    if (!block) return undefined;
    const transactions = block.transactionHashes
      .map((h) => this.transactions.get(h))
      .filter((tx): tx is StoredTransaction => Boolean(tx));
    return { ...block, transactions };
  }

  // ---------- Mining ----------

  getMiningStatus() {
    return {
      isMining: this.mining.active,
      minerAddress: this.mining.minerAddress,
      difficulty: this.difficulty.toString(),
      blocksMined: this.mining.blocksMinedThisSession,
      hashRate: this.mining.hashRate,
      blockReward: EMBERCHAIN_CONFIG.blockReward,
    };
  }

  async startMining(minerAddress: string) {
    await this.whenReady();
    if (!/^0x[0-9a-fA-F]{40}$/.test(minerAddress)) {
      throw new Error("Invalid miner address");
    }
    if (this.mining.active && this.mining.minerAddress === minerAddress) {
      return this.getMiningStatus();
    }
    this.mining.active = true;
    this.mining.stopRequested = false;
    this.mining.minerAddress = minerAddress as PrefixedHexString;
    this.mining.blocksMinedThisSession = 0;
    if (!this.wallets.has(minerAddress as PrefixedHexString)) {
      this.wallets.set(minerAddress as PrefixedHexString, { createdAt: new Date().toISOString() });
    }
    this.mining.loop = this.runMiningLoop();
    return this.getMiningStatus();
  }

  async stopMining() {
    this.mining.stopRequested = true;
    this.mining.active = false;
    if (this.mining.loop) await this.mining.loop;
    this.mining.loop = null;
    return this.getMiningStatus();
  }

  private async runMiningLoop(): Promise<void> {
    while (!this.mining.stopRequested) {
      const minerAddress = this.mining.minerAddress!;
      const parent = this.blocks[this.blocks.length - 1];
      const included = this.mempool.splice(0, MAX_TXS_PER_BLOCK);
      const header: MinableHeader = {
        number: parent.number + 1,
        parentHash: parent.hash,
        timestamp: Date.now(),
        miner: minerAddress,
        difficulty: this.difficulty,
        transactionsRoot: transactionsRootOf(included.map((t) => t.hash)),
      };
      const startedAt = Date.now();
      const result = await mine(
        header,
        () => this.mining.stopRequested,
        (hashes) => {
          const elapsed = (Date.now() - startedAt) / 1000;
          this.mining.hashRate = elapsed > 0 ? Math.round(hashes / elapsed) : 0;
        },
      );

      if (!result) {
        // Stopped mid-mine: return unmined transactions to the front of the mempool.
        this.mempool = [...included, ...this.mempool];
        break;
      }

      await this.applyBlock(header, included, result.nonce, result.hash);
      this.mining.blocksMinedThisSession += 1;

      const actualBlockTime = (Date.now() - startedAt) / 1000;
      this.difficulty = retargetDifficulty(
        this.difficulty,
        actualBlockTime,
        EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
      );
    }
    this.mining.active = false;
  }

  private async applyBlock(
    header: MinableHeader,
    included: PendingTx[],
    nonce: bigint,
    hash: PrefixedHexString,
  ): Promise<void> {
    for (const tx of included) {
      const stored = this.transactions.get(tx.hash);
      if (!stored) continue;
      try {
        const result = await this.evm.runCall({
          caller: new Address(hexToBytes(tx.from)),
          to: tx.to ? new Address(hexToBytes(tx.to)) : undefined,
          value: tx.value,
          data: hexToBytes(tx.data),
          gasLimit: tx.gasLimit,
        });
        stored.status = result.execResult.exceptionError ? "failed" : "success";
        stored.gasUsed = result.execResult.executionGasUsed.toString();
        stored.error = result.execResult.exceptionError ? result.execResult.exceptionError.error : null;
        stored.contractAddress = result.createdAddress ? (result.createdAddress.toString() as PrefixedHexString) : null;
        stored.returnData = bytesToHex(result.execResult.returnValue);
      } catch (err) {
        stored.status = "failed";
        stored.error = err instanceof Error ? err.message : "Execution failed";
      }
      stored.blockNumber = header.number;
    }

    await credit(this.stateManager, header.miner, BigInt(EMBERCHAIN_CONFIG.blockReward));

    const block: StoredBlock = {
      number: header.number,
      hash,
      parentHash: header.parentHash,
      timestamp: new Date(header.timestamp).toISOString(),
      miner: header.miner,
      difficulty: header.difficulty.toString(),
      nonce: nonce.toString(),
      stateRoot: hash, // pseudo state root: single-node chain, no external verifiers
      reward: EMBERCHAIN_CONFIG.blockReward,
      transactionHashes: included.map((t) => t.hash),
    };
    this.blocks.push(block);
    this.persist();
  }
}
