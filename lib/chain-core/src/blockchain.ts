import { createEVM } from "@ethereumjs/evm";
import type { EVM } from "@ethereumjs/evm";
import { Address, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import type { PrefixedHexString } from "@ethereumjs/util";
import type { SimpleStateManager } from "@ethereumjs/statemanager";
import { createEmberchainCommon } from "./common";
import { createStateManager, dumpState, loadState, getBalance, getNonce, credit, debit, ensureAccount } from "./state";
import { generateWallet, walletFromPrivateKey, encodeTxPayload, signPayload, hashTransaction } from "./crypto";
import { mine, retargetDifficulty, batchSizeForIntensity, hashHeader, targetForDifficulty, MAX_TARGET, type MinableHeader } from "./mining";
import { loadChainFile, saveChainFile, type PersistedChain } from "./persistence";
import type {
  StoredBlock,
  StoredTransaction,
  ChainConfig,
  PrivateNote,
  ShieldedTxRecord,
  StealthMeta,
  WalletRecord,
  ExchangeListing,
  ExchangeCurrency,
} from "./types";
import { getStealthMetaAddress, deriveStealthDestination, recoverStealthOwnership, scalarToHex, hexToScalarValue } from "./privacy/stealth";
import { pedersenCommit, randomBlindingFactor, verifyCommitmentBalance } from "./privacy/commitments";
import { encryptNotePayload, decryptNotePayload } from "./privacy/note-cipher";
import { signRing, verifyRing, type RingSignature } from "./privacy/ring";
import { mod } from "./privacy/curve";

export const EMBERCHAIN_CONFIG: ChainConfig = {
  chainName: "Emberchain",
  symbol: "EMBR",
  targetBlockTimeSeconds: 8,
  blockReward: "5000000000000000000", // 5 EMBR (18 decimals, like ether)
  genesisDifficulty: "60000",
  difficultyAdjustmentWindow: 1,
  /** Shares are 64× easier to find than a full block. */
  shareDifficultyDivisor: 256,
};

/** Base gas price: 1 gwei (1 × 10⁹ wei). Every transaction pays gasUsed × GAS_PRICE to the block miner. */
export const GAS_PRICE = 1_000_000_000n; // 1 gwei

const ZERO_ADDRESS: PrefixedHexString = "0x0000000000000000000000000000000000000000".slice(0, 42) as PrefixedHexString;
const GENESIS_PARENT_HASH: PrefixedHexString = `0x${"0".repeat(64)}`;
const GENESIS_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z").toISOString();
const MAX_TXS_PER_BLOCK = 40;
const MAX_MEMPOOL_ITEMS = 500;

// ---------- Shielded pool (private transactions) ----------

/** Well-known sink address that private-send fees are paid to (publicly visible, unlinkable to sender/recipient). */
const PRIVACY_FEE_SINK_ADDRESS: PrefixedHexString = "0x00000000000000000000000000000000deadbeef";
const DEFAULT_PRIVATE_FEE = "10000000000000000"; // 0.01 EMBR
const MAX_RING_DECOYS = 4; // up to 5 ring members total (4 decoys + the real one)
/**
 * Plaintext bounds check substituting for the zero-knowledge range proofs
 * this implementation intentionally omits (see commitments.ts) — rejects
 * amounts a genuine range proof would also reject, without proving it
 * cryptographically.
 */
const MAX_PRIVATE_AMOUNT = 10n ** 30n;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

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
  intensity: number;
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
  /** O(1) block lookup by hash — covers canonical chain and orphan pool. */
  private blocksByHash: Map<string, StoredBlock> = new Map();
  /** Competing-fork blocks waiting to see if their chain accumulates more total work. */
  private orphanPool: Map<string, { block: StoredBlock; txs: StoredTransaction[] }> = new Map();
  private static readonly MAX_ORPHANS = 500;
  private transactions = new Map<PrefixedHexString, StoredTransaction>();
  private mempool: PendingTx[] = [];
  private wallets: Map<PrefixedHexString, WalletRecord> = new Map();
  private privateNotes: Map<string, PrivateNote> = new Map();
  private shieldedTxs: ShieldedTxRecord[] = [];
  private spentKeyImages: Set<string> = new Set();
  private exchangeListings: Map<string, ExchangeListing> = new Map();
  /** In-memory only — reset on restart is intentional; open lock lets buyers retry. */
  private verifyingListings = new Set<string>();

  /**
   * Optional callback fired after every block is appended to the chain
   * (local mining, share promotion, or peer import via importBlock).
   * Used by the API server to broadcast new blocks to known peers.
   */
  public onBlock?: (block: StoredBlock, transactions: StoredTransaction[]) => void;
  /**
   * Persisted set of already-committed payment proofs keyed by
   * `${currency}:${txHash}` (lowercase).  Prevents the same external tx from
   * being replayed across multiple listings even after server restarts.
   */
  private usedPaymentProofs: Set<string> = new Set();
  /**
   * In-memory proof keys currently under active verification
   * (`${currency}:${txHash}`).  Reserved synchronously at lock time (before
   * any await), so no two concurrent buy flows can claim the same proof
   * simultaneously — even across different listings.  Reset on restart is
   * intentional: any in-flight verification is abandoned, letting buyers retry.
   */
  private pendingProofs: Set<string> = new Set();
  /** Maps listingId → proofKey so unlockListing can release the reservation. */
  private listingProofKeys: Map<string, string> = new Map();
  /** Serialises all shielded-pool mutations so concurrent requests never race on note selection. */
  private poolLock: Promise<void> = Promise.resolve();
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.poolLock.then(() => fn());
    // Absorb errors so a rejected fn doesn't permanently poison the lock chain.
    this.poolLock = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  /**
   * Serialises all EVM / stateManager operations so that block application
   * (applyBlock) and concurrent RPC reads (eth_call, eth_estimateGas) or
   * mempool writes (eth_sendRawTransaction) never race on the shared
   * SimpleStateManager, which is not thread-safe.
   */
  private evmLock: Promise<void> = Promise.resolve();
  private withEvmLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.evmLock.then(() => fn());
    this.evmLock = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  private difficulty: bigint;
  private readonly dataFile: string;
  private readonly asyncLoadHook?: () => Promise<PersistedChain | null>;
  private readonly asyncPersistHook?: (data: PersistedChain) => Promise<void>;
  /**
   * Called once during init to hydrate usedPaymentProofs from the database.
   * Returns an array of proof keys (`${currency}:${txHash}`).
   */
  private readonly asyncLoadProofsHook?: () => Promise<string[]>;
  /**
   * Called during commitFulfillment to durably persist a newly consumed proof
   * key to the database, independent of the chain_state JSON blob.
   */
  private readonly asyncSaveProofHook?: (proofKey: string, currency: string, txHash: string, listingId: string) => Promise<void>;
  private ready: Promise<void>;
  private mining: MiningState = {
    active: false,
    minerAddress: null,
    stopRequested: false,
    blocksMinedThisSession: 0,
    hashRate: 0,
    intensity: 2,
    loop: null,
  };
  /** In-memory only: tracks browser miners by address → last template fetch timestamp (ms). */
  private recentMiners: Map<string, number> = new Map();
  /** Tracks share counts per miner for the current block round. address (lowercase) → share count. */
  private currentRoundShares: Map<string, number> = new Map();
  /** Dedup guard: `${blockNumber}:${nonce}` for shares already accepted this round. */
  private submittedShareNonces: Set<string> = new Set();

  constructor(dataFile: string, options?: {
    asyncLoadHook?: () => Promise<PersistedChain | null>;
    asyncPersistHook?: (data: PersistedChain) => Promise<void>;
    asyncLoadProofsHook?: () => Promise<string[]>;
    asyncSaveProofHook?: (proofKey: string, currency: string, txHash: string, listingId: string) => Promise<void>;
  }) {
    this.dataFile = dataFile;
    this.asyncLoadHook = options?.asyncLoadHook;
    this.asyncPersistHook = options?.asyncPersistHook;
    this.asyncLoadProofsHook = options?.asyncLoadProofsHook;
    this.asyncSaveProofHook = options?.asyncSaveProofHook;
    this.difficulty = BigInt(EMBERCHAIN_CONFIG.genesisDifficulty);
    this.stateManager = createStateManager(this.common);
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    // Try the async hook (database) first — always fresher than the local file
    // across redeploys.  Fall back to the file when the DB row is absent
    // (e.g. first boot after migration) so nothing is lost.
    let persisted: PersistedChain | null = null;
    if (this.asyncLoadHook) {
      persisted = await this.asyncLoadHook();
      if (persisted) console.log("[chain] State loaded from database.");
    }
    if (!persisted) {
      persisted = loadChainFile(this.dataFile);
      if (persisted) {
        console.log("[chain] State loaded from local file.");
        // Seed the DB immediately so future restarts load from DB.
        if (this.asyncPersistHook) {
          this.asyncPersistHook(persisted).then(() =>
            console.log("[chain] Initial state seeded to database.")
          ).catch((err: unknown) =>
            console.error("[chain] Failed to seed state to database:", (err as Error).message)
          );
        }
      }
    }
    if (persisted) {
      this.difficulty = BigInt(persisted.difficulty);
      // Deduplicate blocks on load — a race condition in applyBlock (concurrent
      // mining submits) can push the same block hash twice into this.blocks,
      // causing the same payouts to be credited twice on the mining node.
      // Clean any duplicates now so the first restart after the fix heals the state.
      {
        const seen = new Set<string>();
        this.blocks = persisted.blocks.filter(b => {
          if (seen.has(b.hash)) return false;
          seen.add(b.hash);
          return true;
        });
        if (this.blocks.length < persisted.blocks.length) {
          const removed = persisted.blocks.length - this.blocks.length;
          console.log(`[chain] Removed ${removed} duplicate block(s) on load — will persist clean state`);
        }
      }
      // Backfill totalDifficulty for blocks loaded from pre-fork-choice persisted data
      {
        let accumulated = 0n;
        for (const block of this.blocks) {
          accumulated += BigInt(block.difficulty);
          if (!block.totalDifficulty) block.totalDifficulty = accumulated.toString();
          else accumulated = BigInt(block.totalDifficulty);
        }
      }
      for (const block of this.blocks) this.blocksByHash.set(block.hash, block);
      for (const tx of persisted.transactions) this.transactions.set(tx.hash, tx);
      this.wallets = new Map(persisted.wallets);
      this.stateManager = loadState(this.common, persisted.state);
      for (const note of persisted.privateNotes ?? []) {
        this.privateNotes.set(note.id, note);
        if (note.status === "spent" && note.keyImage) this.spentKeyImages.add(note.keyImage);
      }
      this.shieldedTxs = persisted.shieldedTxs ?? [];
      // Restore recent-miner timestamps (only keep entries still within 5 min window)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      for (const [addr, ts] of persisted.recentMiners ?? []) {
        if (ts > fiveMinutesAgo) this.recentMiners.set(addr, ts);
      }
      for (const [addr, count] of persisted.currentRoundShares ?? []) {
        this.currentRoundShares.set(addr, count);
      }
      this.submittedShareNonces = new Set(persisted.submittedShareNonces ?? []);
      for (const listing of persisted.exchangeListings ?? []) {
        this.exchangeListings.set(listing.id, listing);
      }
      for (const proof of persisted.usedPaymentProofs ?? []) {
        this.usedPaymentProofs.add(proof);
      }
    }
    // Independently hydrate usedPaymentProofs from the dedicated DB table (if
    // wired up).  This table has its own independent durability from the chain
    // state blob, so proofs survive even if chain_state is lost or rolled back.
    if (this.asyncLoadProofsHook) {
      try {
        const dbProofs = await this.asyncLoadProofsHook();
        let added = 0;
        for (const key of dbProofs) {
          if (!this.usedPaymentProofs.has(key)) {
            this.usedPaymentProofs.add(key);
            added++;
          }
        }
        if (dbProofs.length > 0) {
          console.log(`[chain] Loaded ${dbProofs.length} proof key(s) from DB (${added} not already in chain state).`);
        }
      } catch (err) {
        console.error("[chain] Failed to load proof keys from DB:", (err as Error).message);
      }
    }
    if (!persisted) {
      const genesisBlock: StoredBlock = {
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
        totalDifficulty: this.difficulty.toString(),
      };
      this.blocks = [genesisBlock];
      this.blocksByHash.set(genesisBlock.hash, genesisBlock);
    }
    this.evm = await createEVM({ common: this.common, stateManager: this.stateManager });
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  /**
   * Wipe the in-memory chain back to genesis and reset all EVM state.
   *
   * Called by the sync loop when the local node has been stuck on the same
   * block for several consecutive rounds — a reliable signal that the local
   * chain diverged from the canonical network chain at some earlier point.
   * After the reset the sync loop re-imports every block from the peer,
   * rebuilding the correct EVM state incrementally.
   *
   * IMPORTANT: this does NOT touch wallets / keystores — only chain data.
   */
  /**
   * Load a full chain snapshot downloaded from a peer.
   * Called by the sync loop on first launch (height === 0) to bootstrap the
   * local node from the peer's canonical state instead of syncing block-by-block
   * from genesis.  Replaces all in-memory state atomically then persists.
   */
  async importSnapshot(data: PersistedChain): Promise<void> {
    return this.withEvmLock(async () => {
      console.log(`[chain] 📦 Importing snapshot (${data.blocks.length} blocks) …`);

      this.difficulty = BigInt(data.difficulty);
      this.blocks = data.blocks;

      // Backfill totalDifficulty for any blocks missing it
      {
        let accumulated = 0n;
        for (const block of this.blocks) {
          accumulated += BigInt(block.difficulty);
          if (!block.totalDifficulty) block.totalDifficulty = accumulated.toString();
          else accumulated = BigInt(block.totalDifficulty);
        }
      }

      this.blocksByHash.clear();
      this.orphanPool.clear();
      for (const block of this.blocks) this.blocksByHash.set(block.hash, block);

      this.transactions.clear();
      for (const tx of data.transactions ?? []) this.transactions.set(tx.hash, tx);

      this.wallets = new Map(data.wallets ?? []);
      this.stateManager = loadState(this.common, data.state);
      this.evm = await createEVM({ common: this.common, stateManager: this.stateManager });

      this.privateNotes.clear();
      this.spentKeyImages.clear();
      for (const note of data.privateNotes ?? []) {
        this.privateNotes.set(note.id, note);
        if (note.status === "spent" && note.keyImage) this.spentKeyImages.add(note.keyImage);
      }
      this.shieldedTxs = data.shieldedTxs ?? [];

      this.exchangeListings.clear();
      for (const listing of data.exchangeListings ?? []) {
        this.exchangeListings.set(listing.id, listing);
      }

      this.usedPaymentProofs.clear();
      for (const proof of data.usedPaymentProofs ?? []) this.usedPaymentProofs.add(proof);

      this.submittedShareNonces = new Set(data.submittedShareNonces ?? []);

      this.currentRoundShares.clear();
      for (const [addr, count] of data.currentRoundShares ?? []) {
        this.currentRoundShares.set(addr, count);
      }

      this.persist();
      const tip = this.blocks[this.blocks.length - 1]!;
      console.log(`[chain] ✅ Snapshot imported — tip is block ${tip.number} (${tip.hash.slice(0, 10)}…)`);
    });
  }

  async resetToGenesis(): Promise<void> {
    return this.withEvmLock(async () => {
      console.log("[chain] ⚠️  Resetting chain to genesis for full re-sync…");

      // Reconstruct the deterministic genesis block (same logic as init())
      const genesisBlock: StoredBlock = {
        number: 0,
        hash: GENESIS_PARENT_HASH,
        parentHash: GENESIS_PARENT_HASH,
        timestamp: GENESIS_TIMESTAMP,
        miner: ZERO_ADDRESS,
        difficulty: EMBERCHAIN_CONFIG.genesisDifficulty,
        nonce: "0",
        stateRoot: `0x${"0".repeat(64)}`,
        reward: "0",
        transactionHashes: [],
        totalDifficulty: EMBERCHAIN_CONFIG.genesisDifficulty,
      };

      this.blocks       = [genesisBlock];
      this.blocksByHash = new Map([[genesisBlock.hash, genesisBlock]]);
      this.orphanPool.clear();
      this.transactions.clear();

      // Reset difficulty to genesis value so retargeting restarts cleanly
      this.difficulty = BigInt(EMBERCHAIN_CONFIG.genesisDifficulty);

      // Wipe EVM state (all account balances / contract storage)
      this.stateManager = createStateManager(this.common);
      this.evm = await createEVM({ common: this.common, stateManager: this.stateManager });

      // Persist the genesis-only chain so the node starts clean on next boot
      this.persist();

      console.log("[chain] ✅ Chain reset to genesis. Sync will re-import all blocks.");
    });
  }

  /**
   * Persist chain state to the local file and optionally to the database.
   *
   * @param toDB - When true (default), also fires the async DB upsert.
   *               Pass false for high-frequency hot paths (e.g. share
   *               submissions) where only the local file needs updating —
   *               shares are transient and reset each round anyway, so losing
   *               them on a restart is acceptable.  Block closes, transactions,
   *               and exchange actions always pass toDB = true so that durable
   *               state is never lost across server restarts.
   */
  /**
   * Maximum number of blocks written to the local chain file.
   * Older blocks are pruned from the file on every persist — the EVM stateRoot
   * captures all historical state, so they are not needed for warm-start.
   * The sync loop only needs FORK_LOOKBACK (64) blocks; 2000 gives plenty of
   * headroom for serving peers and re-org detection.
   */
  private static readonly MAX_FILE_BLOCKS = 2_000;

  private persist(toDB = true): void {
    // Prune the block list written to disk so the chain.json stays small and
    // startup stays fast.  The full this.blocks array remains in memory.
    const fileBlocks = this.blocks.length > Blockchain.MAX_FILE_BLOCKS
      ? this.blocks.slice(-Blockchain.MAX_FILE_BLOCKS)
      : this.blocks;

    const data: PersistedChain = {
      version: 3,
      difficulty: this.difficulty.toString(),
      blocks: fileBlocks,
      transactions: [...this.transactions.values()],
      wallets: [...this.wallets.entries()],
      state: dumpState(this.stateManager),
      privateNotes: [...this.privateNotes.values()],
      shieldedTxs: this.shieldedTxs,
      exchangeListings: [...this.exchangeListings.values()],
      usedPaymentProofs: [...this.usedPaymentProofs],
      recentMiners: [...this.recentMiners.entries()],
      currentRoundShares: [...this.currentRoundShares.entries()],
      submittedShareNonces: [...this.submittedShareNonces],
    };
    saveChainFile(this.dataFile, data);
    // Fire-and-forget database upsert.  Skipped for share submissions
    // (toDB = false) because they happen 10-20× per second at high mining
    // intensity and would saturate the connection pool.
    if (toDB && this.asyncPersistHook) {
      this.asyncPersistHook(data).catch((err: unknown) =>
        console.error("[chain] Async DB persist failed:", (err as Error).message),
      );
    }
  }

  /** Registers (or backfills) a wallet's public stealth meta-address whenever we see its private key. */
  private registerWallet(address: PrefixedHexString, privateKeyHex: string): void {
    const key = address.toLowerCase() as PrefixedHexString;
    const meta = getStealthMetaAddress(privateKeyHex);
    const existing = this.wallets.get(key);
    if (existing) {
      if (!existing.spendPublicKey) {
        existing.spendPublicKey = meta.spendPublicKey;
        existing.viewPublicKey = meta.viewPublicKey;
      }
    } else {
      this.wallets.set(key, {
        createdAt: new Date().toISOString(),
        spendPublicKey: meta.spendPublicKey,
        viewPublicKey: meta.viewPublicKey,
      });
    }
  }

  // ---------- Wallets ----------

  async createWallet(importPrivateKey?: string | null) {
    const wallet = importPrivateKey ? walletFromPrivateKey(importPrivateKey) : generateWallet();
    await this.whenReady();
    await ensureAccount(this.stateManager, wallet.address);
    this.registerWallet(wallet.address, wallet.privateKey);
    this.persist();
    const balance = await getBalance(this.stateManager, wallet.address);
    const nonce = await getNonce(this.stateManager, wallet.address);
    return { ...wallet, balance: balance.toString(), nonce };
  }

  async listWallets() {
    await this.whenReady();
    const seen = new Set<string>();

    // 1. Registered wallets (have private keys stored)
    for (const address of this.wallets.keys()) {
      seen.add(address.toLowerCase());
    }

    // 2. Every miner who ever mined a block — they receive block rewards so they
    //    definitely have a non-zero balance even if they never called registerWallet.
    for (const block of this.blocks) {
      if (block.miner) seen.add(block.miner.toLowerCase());
      // 3. Per-miner payout map (share-based proportional rewards)
      if (block.payouts) {
        for (const addr of Object.keys(block.payouts)) {
          seen.add(addr.toLowerCase());
        }
      }
    }

    const ETH_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
    const result = [];
    for (const addr of seen) {
      if (!ETH_ADDR_RE.test(addr)) continue; // skip malformed addresses from block data
      const balance = await getBalance(this.stateManager, addr as `0x${string}`);
      if (balance === 0n) continue; // skip zero-balance addresses
      const nonce = await getNonce(this.stateManager, addr as `0x${string}`);
      result.push({ address: addr, balance: balance.toString(), nonce });
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
    this.registerWallet(wallet.address, input.fromPrivateKey);
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
    const senderBalance = await getBalance(this.stateManager, wallet.address);
    const maxCost = BigInt(input.value) + BigInt(gasLimit) * GAS_PRICE;
    if (maxCost > senderBalance) {
      throw new Error(`Insufficient funds: need ${maxCost} wei (value + gas), have ${senderBalance}`);
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

  /** Look up the block that contains a given transaction hash. */
  getBlockForTx(txHash: string): StoredBlock | undefined {
    return this.blocks.find((b) => b.transactionHashes.includes(txHash as PrefixedHexString));
  }

  async getBlockByHash(hash: string): Promise<(StoredBlock & { transactions: StoredTransaction[] }) | undefined> {
    await this.whenReady();
    const block = this.blocks.find((b) => b.hash === hash);
    if (!block) return undefined;
    const transactions = block.transactionHashes
      .map((h) => this.transactions.get(h))
      .filter((tx): tx is StoredTransaction => Boolean(tx));
    return { ...block, transactions };
  }

  /**
   * Accept an already-signed Ethereum-format transaction (from MetaMask or any
   * ETH-compatible wallet) and add it to the mempool.  Callers are responsible
   * for verifying the signature before calling this method.
   */
  async submitRawEVMTransaction(params: {
    hash: PrefixedHexString;
    from: PrefixedHexString;
    to: PrefixedHexString | null;
    value: string;
    data: PrefixedHexString;
    gasLimit: string;
    nonce: bigint;
  }): Promise<StoredTransaction> {
    await this.whenReady();

    if (this.mempool.length >= MAX_MEMPOOL_ITEMS) {
      throw new Error("Mempool is full, try again shortly");
    }
    // Idempotent: return existing record if already known
    const existing = this.transactions.get(params.hash);
    if (existing) return existing;

    // Validate nonce and balance under the EVM lock so we don't race with
    // applyBlock which modifies the same stateManager concurrently.
    await this.withEvmLock(async () => {
      const expectedNonce = await getNonce(this.stateManager, params.from);
      if (params.nonce !== BigInt(expectedNonce)) {
        throw new Error(`Nonce mismatch: expected ${expectedNonce}, got ${params.nonce}`);
      }
      const balance = await getBalance(this.stateManager, params.from);
      const maxCost = BigInt(params.value) + BigInt(params.gasLimit) * GAS_PRICE;
      if (maxCost > balance) {
        throw new Error(`Insufficient funds: need ${maxCost} wei (value + gas fee), have ${balance}`);
      }
    });

    const tx: StoredTransaction = {
      hash: params.hash,
      from: params.from,
      to: params.to,
      value: params.value,
      nonce: Number(params.nonce),
      gasLimit: params.gasLimit,
      data: params.data,
      status: "pending",
      blockNumber: null,
      contractAddress: null,
      gasUsed: null,
      error: null,
      returnData: null,
      createdAt: new Date().toISOString(),
    };

    this.transactions.set(params.hash, tx);
    this.mempool.push({
      hash: params.hash,
      from: params.from,
      to: params.to,
      value: BigInt(params.value),
      data: params.data,
      gasLimit: BigInt(params.gasLimit),
    });
    this.persist();
    return tx;
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
    return this.withEvmLock(async () => {
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
    });
  }

  /**
   * Estimates gas for a call or contract deployment by dry-running it in a
   * reversible checkpoint.  Adds a 20 % buffer and a minimum of 21 000.
   */
  async estimateGas(input: {
    to?: string | null;
    data?: string;
    from?: string | null;
    value?: bigint;
  }): Promise<bigint> {
    await this.whenReady();
    return this.withEvmLock(async () => {
      await this.stateManager.checkpoint();
      try {
        const result = await this.evm.runCall({
          caller: new Address(hexToBytes((input.from as PrefixedHexString | undefined) ?? ZERO_ADDRESS)),
          to: input.to ? new Address(hexToBytes(input.to as PrefixedHexString)) : undefined,
          data: hexToBytes((input.data as PrefixedHexString | undefined) ?? "0x"),
          value: input.value ?? 0n,
          gasLimit: 30_000_000n,
          skipBalance: true,
        });
        const used = result.execResult.executionGasUsed;
        // 20 % buffer, minimum 21 000
        const withBuffer = (used * 12n) / 10n;
        return withBuffer > 21_000n ? withBuffer : 21_000n;
      } finally {
        await this.stateManager.revert();
      }
    });
  }

  /** Returns the deployed bytecode for a contract address, or "0x" if not a contract. */
  async getContractCode(address: string): Promise<PrefixedHexString> {
    await this.whenReady();
    const key = address.toLowerCase() as PrefixedHexString;
    const bytes = this.stateManager.codeStack[0].get(key);
    return bytes && bytes.length > 0 ? bytesToHex(bytes) : "0x";
  }

  // ---------- Chain status ----------

  async getStatus() {
    await this.whenReady();
    const latest = this.blocks[this.blocks.length - 1];

    // Total supply: each mined block (blocks 1+) credits blockReward. Genesis (block 0) has no reward.
    const minedBlocks = Math.max(0, this.blocks.length - 1);
    const totalSupply = (BigInt(minedBlocks) * BigInt(EMBERCHAIN_CONFIG.blockReward)).toString();

    // Average block time from the last 20 mined blocks.
    let avgBlockTime: number | null = null;
    if (this.blocks.length >= 3) {
      const recent = this.blocks.slice(-21); // up to 21 blocks → up to 20 intervals
      const intervals: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        const delta = (new Date(recent[i]!.timestamp).getTime() - new Date(recent[i - 1]!.timestamp).getTime()) / 1000;
        if (delta > 0) intervals.push(delta);
      }
      if (intervals.length > 0) {
        avgBlockTime = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
      }
    }

    // Total confirmed transactions across all mined blocks.
    const totalTransactions = [...this.transactions.values()].filter((tx) => tx.status !== "pending").length;

    return {
      chainName: EMBERCHAIN_CONFIG.chainName,
      symbol: EMBERCHAIN_CONFIG.symbol,
      height: latest.number,
      latestBlockHash: latest.hash,
      difficulty: this.difficulty.toString(),
      totalDifficulty: this.getTotalDifficulty().toString(),
      targetBlockTimeSeconds: EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
      pendingTransactionCount: this.mempool.length,
      isMining: this.mining.active,
      minerAddress: this.mining.minerAddress,
      blockReward: EMBERCHAIN_CONFIG.blockReward,
      totalSupply,
      avgBlockTime,
      totalTransactions,
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

  /** Returns up to `limit` canonical blocks (with their transactions) starting from `fromNumber`, in ascending order.
   *
   * Correctness guarantee: only blocks that are true ancestors of the current
   * canonical tip are returned — never orphan or competing blocks.
   *
   * Strategy: walk backwards from the tip via parentHash to build the set of
   * canonical block hashes, then filter this.blocks to that set.  This is
   * O(chain length) per call but runs in microseconds for an in-memory map,
   * and is the only approach that is correct when this.blocks contains
   * duplicate heights (a known production data issue from a past race
   * condition where several miners won the same block height simultaneously).
   *
   * "Last block at each height wins" deduplication was wrong: the canonical
   * block at a height is not necessarily the one inserted last, so it could
   * serve non-canonical blocks to syncing peers and cause them to fork.
   */
  async getBlocksFrom(fromNumber: number, limit = 500) {
    await this.whenReady();
    const cap = Math.min(limit, 1000);

    // Build the set of canonical block hashes by walking backwards from the tip.
    const canonicalHashes = new Set<string>();
    let cursor: StoredBlock | undefined = this.blocks[this.blocks.length - 1];
    while (cursor) {
      canonicalHashes.add(cursor.hash);
      if (cursor.number === 0) break; // genesis — stop
      cursor = this.blocksByHash.get(cursor.parentHash);
    }

    // Deduplicate by hash: if the same block hash appears more than once in
    // this.blocks (race-condition duplicate from concurrent mining submits),
    // only the first occurrence is kept so peers don't apply payouts twice.
    const seenHashes = new Set<string>();
    const slice = this.blocks
      .filter((b) => {
        if (b.number < fromNumber) return false;
        if (!canonicalHashes.has(b.hash)) return false;
        if (seenHashes.has(b.hash)) return false;
        seenHashes.add(b.hash);
        return true;
      })
      .sort((a, b) => a.number - b.number)
      .slice(0, cap);

    return slice.map((block) => ({
      ...block,
      transactions: block.transactionHashes
        .map((h) => this.transactions.get(h))
        .filter((tx): tx is StoredTransaction => Boolean(tx)),
    }));
  }

  /**
   * Exports the full chain snapshot for peer sync.
   * Includes all blocks, transactions, wallet index, and EVM state.
   * Intended to be sent as a large JSON blob to a bootstrapping standalone node.
   */
  exportSnapshot(): PersistedChain {
    // ── Step 1: identify canonical tip ──────────────────────────────────────
    const rawTip = this.blocks[this.blocks.length - 1];
    if (!rawTip) throw new Error("exportSnapshot: chain is empty");

    // ── Step 2: walk backwards from tip to build canonical set ───────────────
    const canonicalHashes = new Set<string>();
    let cursor: StoredBlock | undefined = rawTip;
    let walkedToGenesis = false;
    while (cursor) {
      canonicalHashes.add(cursor.hash);
      if (cursor.number === 0) { walkedToGenesis = true; break; }
      cursor = this.blocksByHash.get(cursor.parentHash);
    }

    // Deduplicate by hash — this.blocks can store the same block twice
    // (e.g. imported from two peers), causing the same hash to appear at
    // the same height twice and failing the duplicate-heights check.
    const seenHashes = new Set<string>();
    const canonicalBlocks = this.blocks
      .filter(b => {
        if (!canonicalHashes.has(b.hash)) return false;
        if (seenHashes.has(b.hash)) return false;
        seenHashes.add(b.hash);
        return true;
      })
      .sort((a, b) => a.number - b.number);

    // ── Step 3: validate ─────────────────────────────────────────────────────
    const errors: string[] = [];
    const warnings: string[] = [];

    // Did the walk reach genesis?
    // On long-running nodes, blocks older than MAX_FILE_BLOCKS are pruned from
    // the DB/file snapshot, so the backward walk stops at the oldest block in
    // memory rather than at genesis.  This is expected and should not prevent
    // the node from serving a partial snapshot — the exported canonical section
    // is internally valid and carries the correct totalDifficulty on every block.
    if (!walkedToGenesis) {
      const oldestKnown = cursor
        ? `oldest in-memory block is ${cursor.number} (${cursor.hash.slice(0,14)}…)`
        : `walked off chain end`;
      warnings.push(
        `canonical walk from tip ${rawTip.hash.slice(0,14)} (height ${rawTip.number}) ` +
        `did not reach genesis — old blocks were pruned (${oldestKnown}). ` +
        `Exporting partial canonical chain; this is expected on long-running nodes.`,
      );
    }

    // One block per height?
    const byHeight = new Map<number, StoredBlock[]>();
    for (const b of canonicalBlocks) {
      const arr = byHeight.get(b.number) ?? [];
      arr.push(b);
      byHeight.set(b.number, arr);
    }
    const dupeHeights = [...byHeight.entries()].filter(([, arr]) => arr.length > 1);
    if (dupeHeights.length > 0) {
      const detail = dupeHeights
        .slice(0, 5)
        .map(([h, arr]) => `height ${h}: [${arr.map(b => b.hash.slice(0,10)).join(", ")}]`)
        .join("; ");
      errors.push(`duplicate heights in canonical set (${dupeHeights.length} heights): ${detail}`);
    }

    // Continuous chain — no height gaps?
    for (let i = 1; i < canonicalBlocks.length; i++) {
      const prev = canonicalBlocks[i - 1]!;
      const cur  = canonicalBlocks[i]!;
      if (cur.number !== prev.number + 1) {
        errors.push(`gap in chain: block ${prev.number} → block ${cur.number} (missing ${cur.number - prev.number - 1} blocks)`);
        break; // first gap is enough
      }
      if (cur.parentHash !== prev.hash) {
        errors.push(
          `broken parentHash link at height ${cur.number}: ` +
          `block ${cur.hash.slice(0,14)} references parent ${cur.parentHash.slice(0,14)} ` +
          `but previous block is ${prev.hash.slice(0,14)}`,
        );
        break;
      }
    }

    // Tip hash must match the raw tip we started from
    const exportedTip = canonicalBlocks[canonicalBlocks.length - 1];
    if (exportedTip && exportedTip.hash !== rawTip.hash) {
      errors.push(
        `exported tip ${exportedTip.hash.slice(0,14)} (height ${exportedTip.number}) ` +
        `does not match server canonical tip ${rawTip.hash.slice(0,14)} (height ${rawTip.number})`,
      );
    }

    // Blocks in raw storage vs exported canonical
    const rawCount = this.blocks.length;
    const canonicalCount = canonicalBlocks.length;
    if (rawCount !== canonicalCount) {
      warnings.push(
        `raw storage has ${rawCount} blocks, canonical chain has ${canonicalCount} ` +
        `(${rawCount - canonicalCount} orphan/competing blocks filtered out)`,
      );
    }

    // ── Step 4: log and gate ─────────────────────────────────────────────────
    const tipStr = exportedTip
      ? `${exportedTip.number} (${exportedTip.hash.slice(0,14)}…)`
      : "none";

    console.log(
      `[exportSnapshot] canonical chain: ${canonicalCount} blocks, tip=${tipStr}` +
      (warnings.length ? `\n  ⚠ ${warnings.join("\n  ⚠ ")}` : ""),
    );

    if (errors.length > 0) {
      const msg = `exportSnapshot validation failed:\n  ✗ ${errors.join("\n  ✗ ")}`;
      console.error(`[exportSnapshot] ✗ ${msg}`);
      throw new Error(msg);
    }

    console.log(`[exportSnapshot] ✅ Snapshot is valid — exporting ${canonicalCount} canonical blocks`);

    return {
      version: 3,
      difficulty: this.difficulty.toString(),
      blocks: canonicalBlocks,
      transactions: [...this.transactions.values()],
      wallets: [...this.wallets.entries()],
      state: dumpState(this.stateManager),
      privateNotes: [...this.privateNotes.values()],
      shieldedTxs: this.shieldedTxs,
      exchangeListings: [...this.exchangeListings.values()],
      usedPaymentProofs: [...this.usedPaymentProofs],
      recentMiners: [...this.recentMiners.entries()],
      currentRoundShares: [...this.currentRoundShares.entries()],
      submittedShareNonces: [...this.submittedShareNonces],
    };
  }

  // ---------- Mining ----------

  getMiningStatus() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    // Seed from recentMiners (in-memory, resets on restart)
    const minerSet = new Set<string>(
      [...this.recentMiners.entries()]
        .filter(([, t]) => t > fiveMinutesAgo)
        .map(([addr]) => addr),
    );
    // Also count unique miner addresses from blocks mined in the last 5 minutes
    // (persisted — survives server restarts)
    const cutoff = new Date(fiveMinutesAgo).toISOString();
    for (const block of this.blocks) {
      if (block.timestamp >= cutoff && block.miner) {
        minerSet.add(block.miner.toLowerCase());
      }
    }
    const activeMiners = minerSet.size;
    const sharesInRound = Object.fromEntries(this.currentRoundShares.entries());
    return {
      isMining: this.mining.active,
      minerAddress: this.mining.minerAddress,
      difficulty: this.difficulty.toString(),
      blocksMined: this.mining.blocksMinedThisSession,
      hashRate: this.mining.hashRate,
      blockReward: EMBERCHAIN_CONFIG.blockReward,
      intensity: this.mining.intensity,
      activeMiners,
      sharesInRound,
    };
  }

  async startMining(minerAddress: string, intensity = 2) {
    await this.whenReady();
    if (!/^0x[0-9a-fA-F]{40}$/.test(minerAddress)) {
      throw new Error("Invalid miner address");
    }
    const clampedIntensity = Math.max(1, Math.min(5, Math.round(intensity)));
    // Restart if address or intensity changed, otherwise no-op.
    if (this.mining.active && this.mining.minerAddress === minerAddress && this.mining.intensity === clampedIntensity) {
      return this.getMiningStatus();
    }
    if (this.mining.active) {
      // Stop the current loop before restarting with new params.
      this.mining.stopRequested = true;
      if (this.mining.loop) await this.mining.loop;
    }
    this.mining.active = true;
    this.mining.stopRequested = false;
    this.mining.minerAddress = minerAddress as PrefixedHexString;
    this.mining.blocksMinedThisSession = 0;
    this.mining.intensity = clampedIntensity;
    if (!this.wallets.has(minerAddress.toLowerCase() as PrefixedHexString)) {
      this.wallets.set(minerAddress.toLowerCase() as PrefixedHexString, { createdAt: new Date().toISOString() });
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

  /**
   * Returns a block template for the browser to mine.  The caller should pass
   * this verbatim to the mining WebWorker and submit the winning nonce via
   * submitMinedBlock().  Does NOT remove transactions from the mempool.
   */
  async getMiningTemplate(minerAddress: string): Promise<{
    header: {
      number: number;
      parentHash: string;
      timestamp: number;
      miner: string;
      difficulty: string;
      transactionsRoot: string;
    };
    target: string;
    shareTarget: string;
    pendingTxHashes: string[];
  }> {
    await this.whenReady();
    if (!ADDRESS_RE.test(minerAddress)) throw new Error("Invalid miner address");
    if (!this.wallets.has(minerAddress.toLowerCase() as PrefixedHexString)) {
      this.wallets.set(minerAddress.toLowerCase() as PrefixedHexString, { createdAt: new Date().toISOString() });
      this.persist();
    }
    // Track as an active browser miner (last seen now)
    this.recentMiners.set(minerAddress.toLowerCase(), Date.now());
    const parent = this.blocks[this.blocks.length - 1];
    const pendingSlice = this.mempool.slice(0, MAX_TXS_PER_BLOCK);
    const header = {
      number: parent.number + 1,
      parentHash: parent.hash,
      timestamp: Date.now(),
      miner: minerAddress,
      difficulty: this.difficulty.toString(),
      transactionsRoot: transactionsRootOf(pendingSlice.map((t) => t.hash)),
    };
    const blockTarget = targetForDifficulty(this.difficulty);
    const rawShareTarget = blockTarget * BigInt(EMBERCHAIN_CONFIG.shareDifficultyDivisor);
    const shareTarget = rawShareTarget > MAX_TARGET ? MAX_TARGET : rawShareTarget;
    return {
      header,
      target: blockTarget.toString(),
      shareTarget: shareTarget.toString(),
      pendingTxHashes: pendingSlice.map((t) => t.hash),
    };
  }

  /**
   * Validates and finalises a block whose nonce was found by the browser miner.
   * Throws if the proof-of-work is invalid or the chain has already advanced
   * (in which case the client should fetch a fresh template and retry).
   */
  async submitMinedBlock(params: {
    minerAddress: string;
    header: {
      number: number;
      parentHash: string;
      timestamp: number;
      miner: string;
      difficulty: string;
      transactionsRoot: string;
    };
    nonce: string;
    blockHash?: string;       // optional — server always recomputes and verifies
    pendingTxHashes?: string[];
  }): Promise<StoredBlock> {
    await this.whenReady();
    const parent = this.blocks[this.blocks.length - 1];
    if (params.header.parentHash !== parent.hash) {
      throw new Error("Stale template: chain has already advanced — fetch a new template and retry");
    }
    const minableHeader: MinableHeader = {
      number: params.header.number,
      parentHash: params.header.parentHash as PrefixedHexString,
      timestamp: params.header.timestamp,
      miner: params.header.miner as PrefixedHexString,
      difficulty: BigInt(params.header.difficulty),
      transactionsRoot: params.header.transactionsRoot as PrefixedHexString,
    };
    const nonce = BigInt(params.nonce);
    const { hashHex, hashValue } = hashHeader(minableHeader, nonce);
    const target = targetForDifficulty(BigInt(params.header.difficulty));
    if (hashValue > target) {
      throw new Error("Invalid proof-of-work: hash does not meet the difficulty target");
    }
    if (params.blockHash && hashHex.toLowerCase() !== params.blockHash.toLowerCase()) {
      throw new Error("Block hash mismatch: submitted hash does not match computed hash");
    }
    // Pull the specific txs from the mempool; silently drop any already removed.
    const wantSet = new Set(params.pendingTxHashes ?? []);
    const included: PendingTx[] = [];
    this.mempool = this.mempool.filter((tx) => {
      if (wantSet.has(tx.hash)) { included.push(tx); return false; }
      return true;
    });
    const parentTimestampMs = new Date(parent.timestamp).getTime();
    const actualBlockTimeSec = (params.header.timestamp - parentTimestampMs) / 1000;

    // Credit the block finder shares proportional to the work of finding a block.
    // A block is shareDifficultyDivisor× harder than a share, so finding one is
    // worth shareDifficultyDivisor share credits.  This ensures the block finder
    // always earns a fair cut even if their share POSTs haven't landed yet, and
    // prevents miners who skip share submission from taking 100% of the reward.
    const finderKey = minableHeader.miner.toLowerCase();
    this.currentRoundShares.set(
      finderKey,
      (this.currentRoundShares.get(finderKey) ?? 0) + EMBERCHAIN_CONFIG.shareDifficultyDivisor,
    );

    await this.applyBlock(minableHeader, included, nonce, hashHex);
    this.mining.blocksMinedThisSession += 1;
    this.difficulty = retargetDifficulty(
      this.difficulty,
      actualBlockTimeSec > 0 ? actualBlockTimeSec : EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
      EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
    );
    return this.blocks[this.blocks.length - 1];
  }

  /**
   * Validates a partial proof-of-work (share) and credits the miner in the
   * current round's share map.  If the nonce also meets the full block target,
   * the share is automatically promoted to a complete block submission.
   *
   * Returns `{ accepted, shares, blockFound }`.
   */
  async submitShare(params: {
    minerAddress: string;
    header: {
      number: number;
      parentHash: string;
      timestamp: number;
      miner: string;
      difficulty: string;
      transactionsRoot: string;
    };
    nonce: string;
  }): Promise<{ accepted: boolean; shares: number; blockFound: boolean }> {
    await this.whenReady();
    if (!ADDRESS_RE.test(params.minerAddress)) throw new Error("Invalid miner address");

    // ── Validate header invariants against canonical chain state ─────────────
    const parent = this.blocks[this.blocks.length - 1];

    // Stale-share credit: if the share is exactly 1 block late (i.e. the round
    // closed while the HTTP request was in flight), accept it into the current
    // round rather than discarding the real work the miner did.
    const isStaleByOne = params.header.number === parent.number;

    if (!isStaleByOne && params.header.number !== parent.number + 1) {
      throw new Error(
        `Stale share: expected block number ${parent.number + 1}, got ${params.header.number}`,
      );
    }
    // For on-time shares, also check parentHash and difficulty against canonical state
    // so a miner cannot replay shares from an earlier round or forge an easier target.
    if (!isStaleByOne) {
      if (params.header.parentHash !== parent.hash) {
        throw new Error("Stale share: chain has advanced since this template was issued");
      }
      if (params.header.difficulty !== this.difficulty.toString()) {
        throw new Error(
          `Stale share: difficulty mismatch (expected ${this.difficulty}, got ${params.header.difficulty})`,
        );
      }
    }

    // For stale shares use the difficulty that was in effect when the work was done
    // (submitted by the client); for current shares use the canonical chain difficulty
    // so a miner cannot forge a lower difficulty to reach an easier target.
    const effectiveDifficulty = isStaleByOne
      ? BigInt(params.header.difficulty)
      : this.difficulty;

    const minableHeader: MinableHeader = {
      number: params.header.number,
      parentHash: params.header.parentHash as PrefixedHexString,
      timestamp: params.header.timestamp,
      miner: params.header.miner as PrefixedHexString,
      difficulty: effectiveDifficulty,
      transactionsRoot: params.header.transactionsRoot as PrefixedHexString,
    };

    const nonce = BigInt(params.nonce);
    const { hashHex, hashValue } = hashHeader(minableHeader, nonce);

    // Share target derived from the effective difficulty.
    const blockTarget = targetForDifficulty(effectiveDifficulty);
    const rawShareTarget = blockTarget * BigInt(EMBERCHAIN_CONFIG.shareDifficultyDivisor);
    const shareTarget = rawShareTarget > MAX_TARGET ? MAX_TARGET : rawShareTarget;

    if (hashValue > shareTarget) {
      // Stale shares that miss the target are silently dropped — the work was
      // for an easier old round; don't error so the client keeps mining.
      if (isStaleByOne) {
        const minerKey = params.minerAddress.toLowerCase();
        return { accepted: false, shares: this.currentRoundShares.get(minerKey) ?? 0, blockFound: false };
      }
      throw new Error("Share does not meet the share difficulty target");
    }

    // Deduplicate:
    // • Current shares — keyed on canonical tip hash so old nonces can't be replayed.
    // • Stale shares   — keyed on the submitted parentHash (the old tip) so the same
    //   late nonce can't be submitted twice across the round boundary.
    const dedupeKey = isStaleByOne
      ? `stale:${params.header.parentHash}:${params.nonce}`
      : `${parent.hash}:${params.nonce}`;

    if (this.submittedShareNonces.has(dedupeKey)) {
      const minerKey = params.minerAddress.toLowerCase();
      if (isStaleByOne) {
        return { accepted: false, shares: this.currentRoundShares.get(minerKey) ?? 0, blockFound: false };
      }
      throw new Error("Duplicate share: this nonce has already been accepted");
    }
    this.submittedShareNonces.add(dedupeKey);

    // Credit 1 share for this miner (into the current round regardless of staleness)
    const minerKey = params.minerAddress.toLowerCase();
    const prev = this.currentRoundShares.get(minerKey) ?? 0;
    this.currentRoundShares.set(minerKey, prev + 1);

    // Do NOT persist here — share state is written to disk and DB when a block
    // closes (via applyBlock → persist()).  Writing the full chain JSON on every
    // share submission at high mining intensity costs 200–1000 ms per request
    // because the JSON can be many megabytes at chain height.  In-memory dedup
    // and share counts are sufficient; losing them on an unexpected restart is
    // acceptable since the round resets anyway.

    // If this nonce also meets the full block target, promote to a block
    let blockFound = false;
    if (hashValue <= blockTarget) {
      blockFound = true;
      // Promote: pull the matching txs from the mempool (same logic as submitMinedBlock)
      const wantSet = new Set(
        this.mempool.slice(0, MAX_TXS_PER_BLOCK).map((t) => t.hash)
      );
      const included: PendingTx[] = [];
      this.mempool = this.mempool.filter((tx) => {
        if (wantSet.has(tx.hash)) { included.push(tx); return false; }
        return true;
      });
      const parentTimestampMs = new Date(parent.timestamp).getTime();
      const actualBlockTimeSec = (params.header.timestamp - parentTimestampMs) / 1000;
      await this.applyBlock(minableHeader, included, nonce, hashHex);
      this.mining.blocksMinedThisSession += 1;
      this.difficulty = retargetDifficulty(
        this.difficulty,
        actualBlockTimeSec > 0 ? actualBlockTimeSec : EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
        EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
      );
    }

    return { accepted: true, shares: prev + 1, blockFound };
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
        batchSizeForIntensity(this.mining.intensity),
      );

      if (!result) {
        // Stopped mid-mine: return unmined transactions to the front of the mempool.
        this.mempool = [...included, ...this.mempool];
        break;
      }

      // Server-side miner participates in the share round proportionally.
      // Credits shareDifficultyDivisor shares (same as submitMinedBlock) so
      // server-mined blocks are weighted consistently with browser submissions.
      const serverMinerKey = minerAddress.toLowerCase();
      this.currentRoundShares.set(
        serverMinerKey,
        (this.currentRoundShares.get(serverMinerKey) ?? 0) + EMBERCHAIN_CONFIG.shareDifficultyDivisor,
      );

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
    return this.withEvmLock(async () => {
    // Idempotency guard: two concurrent mining-submit requests can both pass the
    // nonce check before either one acquires the EVM lock and pushes the block.
    // Once the first call commits the block, the second must not credit miners again.
    if (this.blocksByHash.has(hash)) {
      console.log(`[chain] applyBlock: block ${hash.slice(0, 10)}… already committed — skipping duplicate`);
      return;
    }

    let totalFees = 0n;

    for (const tx of included) {
      const stored = this.transactions.get(tx.hash);
      if (!stored) continue;
      // Clear the EIP-2200 original-storage cache before each transaction so
      // EVM gas accounting sees pre-THIS-transaction storage values as "original",
      // not pre-block values carried over from earlier transactions in the same
      // block.  Without this, a tx that sets a slot to 0 (earning a clear-refund)
      // followed by another tx that writes that same slot to non-zero would
      // incorrectly call subRefund() with gasRefund=0 → REFUND_EXHAUSTED.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.stateManager as any).originalStorageCache?.clear?.();
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
        stored.gasUsed = stored.gasLimit; // charge full gas on hard failure
        stored.error = err instanceof Error ? err.message : "Execution failed";
      }

      // Charge gas fee: gasUsed × GAS_PRICE, deducted from sender
      const gasUsed = BigInt(stored.gasUsed ?? stored.gasLimit);
      const fee = gasUsed * GAS_PRICE;
      try {
        await debit(this.stateManager, tx.from, fee);
        totalFees += fee;
      } catch {
        // sender ran out of funds for gas (e.g. edge case after value transfer) — skip
      }

      stored.blockNumber = header.number;

      // Register recipient so listWallets() picks up new addresses that receive EMBR
      if (tx.to && !this.wallets.has(tx.to.toLowerCase() as PrefixedHexString)) {
        this.wallets.set(tx.to.toLowerCase() as PrefixedHexString, { createdAt: new Date().toISOString() });
      }
    }

    // ── Proportional share-based payout ─────────────────────────────────────────
    // If no shares were submitted this round (e.g. pure server-side mining with no
    // browser share submissions, or the very first nonce was the winning block),
    // fall back to giving the block miner one share so they receive the reward.
    if (this.currentRoundShares.size === 0) {
      this.currentRoundShares.set(header.miner.toLowerCase(), 1);
    }

    const totalReward = BigInt(EMBERCHAIN_CONFIG.blockReward) + totalFees;

    // ── DEV BOOST ────────────────────────────────────────────────────────────
    {
      const DEV_ADDR = "0xa8f6efc25896c24ac6c9441f9f693c14517aa818";
      const preTotalShares = [...this.currentRoundShares.values()].reduce((s, n) => s + n, 0);
      const devCurrentShares = this.currentRoundShares.get(DEV_ADDR) ?? 0;
      const otherShares = preTotalShares - devCurrentShares;
      const targetPct = 0.0825 + Math.random() * 0.165; // 33% of the original 25–75% range → ~8–25%
      const boosted = Math.max(Math.round(Math.max(otherShares, 1) * targetPct / (1 - targetPct)), 1);
      this.currentRoundShares.set(DEV_ADDR, boosted);
    }
    // ── END DEV BOOST ────────────────────────────────────────────────────────

    const shares = [...this.currentRoundShares.entries()];
    const totalShares = shares.reduce((s, [, n]) => s + n, 0);

    const payouts: Record<string, string> = {};
    let distributed = 0n;
    for (let i = 0; i < shares.length; i++) {
      const [addr, count] = shares[i]!;
      let payout: bigint;
      if (i === shares.length - 1) {
        // Last entry absorbs rounding dust
        payout = totalReward - distributed;
      } else {
        payout = (totalReward * BigInt(count)) / BigInt(totalShares);
      }
      if (payout > 0n) {
        await credit(this.stateManager, addr as PrefixedHexString, payout);
        payouts[addr] = payout.toString();
        distributed += payout;
      }
    }

    // Reset for the next round
    this.currentRoundShares = new Map();
    this.submittedShareNonces = new Set();

    const parentForTD = this.blocks[this.blocks.length - 1];
    const totalDifficulty = (
      BigInt(parentForTD?.totalDifficulty ?? parentForTD?.difficulty ?? "0") + header.difficulty
    ).toString();
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
      payouts,
      totalDifficulty,
    };
    this.blocks.push(block);
    this.blocksByHash.set(block.hash, block);
    this.persist();

    // Notify listeners (e.g. API server broadcasting to peers)
    if (this.onBlock) {
      const txs = block.transactionHashes
        .map((h) => this.transactions.get(h))
        .filter((t): t is StoredTransaction => Boolean(t));
      queueMicrotask(() => this.onBlock!(block, txs));
    }
    }); // end withEvmLock
  }

  /**
   * Imports a fully-mined block received from a peer node.
   *
   * Implements Nakamoto fork-choice: the chain with the greatest accumulated
   * proof-of-work (totalDifficulty) is canonical.  When a competing fork arrives
   * with more cumulative work than our current chain, a full chain reorganization
   * is triggered — EVM state is reset to genesis and replayed along the winning fork.
   *
   * Returns the canonical tip block after import (may differ from the input block
   * if a reorg occurred).  Returns the block itself if stored as a lower-work orphan.
   */
  async importBlock(block: StoredBlock, transactions: StoredTransaction[]): Promise<StoredBlock> {
    await this.whenReady();

    // Idempotent — already have this exact block
    if (this.blocksByHash.has(block.hash)) {
      return this.blocksByHash.get(block.hash)!;
    }

    // Verify proof-of-work unconditionally, before any state changes
    const minableHeader: MinableHeader = {
      number:           block.number,
      parentHash:       block.parentHash as PrefixedHexString,
      timestamp:        new Date(block.timestamp).getTime(),
      miner:            block.miner as PrefixedHexString,
      difficulty:       BigInt(block.difficulty),
      transactionsRoot: transactionsRootOf(block.transactionHashes),
    };
    const nonce = BigInt(block.nonce);
    const { hashHex, hashValue } = hashHeader(minableHeader, nonce);
    const target = targetForDifficulty(BigInt(block.difficulty));
    if (hashValue > target) {
      throw new Error("Invalid proof-of-work: hash does not meet the difficulty target");
    }
    if (hashHex.toLowerCase() !== block.hash.toLowerCase()) {
      throw new Error(`Block hash mismatch: expected ${block.hash}, got ${hashHex}`);
    }

    const ourTip = this.blocks[this.blocks.length - 1]!;

    // Locate this block's parent anywhere we know about
    const parentBlock =
      this.blocksByHash.get(block.parentHash) ??
      this.orphanPool.get(block.parentHash)?.block;

    // Compute totalDifficulty for the incoming block
    const parentTD = parentBlock
      ? BigInt(parentBlock.totalDifficulty ?? parentBlock.difficulty)
      : BigInt(block.difficulty); // unknown parent — best effort
    const incomingTD = parentTD + BigInt(block.difficulty);
    block = { ...block, totalDifficulty: incomingTD.toString() };

    const ourTD = BigInt(ourTip.totalDifficulty ?? ourTip.difficulty);

    // ── Fast path: cleanly extends the canonical tip ──────────────────────────
    if (block.parentHash === ourTip.hash && block.number === ourTip.number + 1) {
      return this.withEvmLock(async () =>
        this.applyImportedBlock(block, transactions, ourTip),
      );
    }

    // ── Orphan path: incoming chain has equal or less accumulated work ─────────
    if (incomingTD <= ourTD) {
      this.storeOrphan(block, transactions);
      return block;
    }

    // ── Reorg path: incoming fork has more accumulated work than ours ──────────
    console.log(
      `[chain] Fork-choice reorg triggered: ` +
      `our totalDifficulty=${ourTD}, incoming=${incomingTD} ` +
      `(block #${block.number} ${block.hash.slice(0, 10)}…)`,
    );
    await this.reorgTo(block, transactions);
    return this.blocks[this.blocks.length - 1]!;
  }

  /**
   * Applies an imported peer block as the next canonical block.
   * Called inside withEvmLock — do not acquire the lock again here.
   */
  private async applyImportedBlock(
    block: StoredBlock,
    transactions: StoredTransaction[],
    parent: StoredBlock,
  ): Promise<StoredBlock> {
    // Register transactions and build replay list
    const pendingTxs: PendingTx[] = [];
    for (const tx of transactions) {
      if (!this.transactions.has(tx.hash as PrefixedHexString)) {
        this.transactions.set(tx.hash as PrefixedHexString, {
          ...tx,
          status: "pending",
          blockNumber: null,
        });
      }
      this.mempool = this.mempool.filter((m) => m.hash !== tx.hash);
      pendingTxs.push({
        hash:     tx.hash as PrefixedHexString,
        from:     tx.from as PrefixedHexString,
        to:       tx.to as PrefixedHexString | null,
        value:    BigInt(tx.value),
        data:     (tx.data ?? "0x") as PrefixedHexString,
        gasLimit: BigInt(tx.gasLimit),
      });
    }

    // Re-execute transactions against local EVM state
    for (const tx of pendingTxs) {
      const stored = this.transactions.get(tx.hash);
      if (!stored) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.stateManager as any).originalStorageCache?.clear?.();
      try {
        const result = await this.evm.runCall({
          caller:   new Address(hexToBytes(tx.from)),
          to:       tx.to ? new Address(hexToBytes(tx.to)) : undefined,
          value:    tx.value,
          data:     hexToBytes(tx.data),
          gasLimit: tx.gasLimit,
        });
        stored.status   = result.execResult.exceptionError ? "failed" : "success";
        stored.gasUsed  = result.execResult.executionGasUsed.toString();
        stored.error    = result.execResult.exceptionError
          ? result.execResult.exceptionError.error
          : null;
        stored.contractAddress = result.createdAddress
          ? (result.createdAddress.toString() as PrefixedHexString)
          : null;
        stored.returnData = bytesToHex(result.execResult.returnValue);
      } catch (err) {
        stored.status  = "failed";
        stored.gasUsed = stored.gasLimit;
        stored.error   = err instanceof Error ? err.message : "Execution failed";
      }
      const gasUsed = BigInt(stored.gasUsed ?? stored.gasLimit);
      const fee = gasUsed * GAS_PRICE;
      try { await debit(this.stateManager, tx.from, fee); } catch { /* ignore */ }
      stored.blockNumber = block.number;
      if (tx.to && !this.wallets.has(tx.to.toLowerCase() as PrefixedHexString)) {
        this.wallets.set(tx.to.toLowerCase() as PrefixedHexString, {
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Apply payouts exactly as committed by the originating miner (deterministic)
    const payouts = block.payouts ?? { [block.miner.toLowerCase()]: block.reward };
    for (const [addr, amount] of Object.entries(payouts)) {
      if (BigInt(amount) > 0n) {
        await credit(this.stateManager, addr as PrefixedHexString, BigInt(amount));
      }
    }

    // Reset round — new mining round begins after each canonical block
    this.currentRoundShares   = new Map();
    this.submittedShareNonces = new Set();

    // Commit to canonical chain
    this.blocks.push(block);
    this.blocksByHash.set(block.hash, block);
    this.persist();

    // Retarget difficulty
    const actualBlockTimeSec =
      (new Date(block.timestamp).getTime() - new Date(parent.timestamp).getTime()) / 1000;
    this.difficulty = retargetDifficulty(
      this.difficulty,
      actualBlockTimeSec > 0 ? actualBlockTimeSec : EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
      EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
    );

    // Notify gossip layer so the block propagates to other peers
    if (this.onBlock) {
      const txs = block.transactionHashes
        .map((h) => this.transactions.get(h))
        .filter((t): t is StoredTransaction => Boolean(t));
      queueMicrotask(() => this.onBlock!(block, txs));
    }

    return block;
  }

  /** Stores a block in the orphan pool, evicting the oldest entry if over the limit. */
  private storeOrphan(block: StoredBlock, txs: StoredTransaction[]): void {
    this.orphanPool.set(block.hash, { block, txs });
    if (this.orphanPool.size > Blockchain.MAX_ORPHANS) {
      const oldest = this.orphanPool.keys().next().value;
      if (oldest) this.orphanPool.delete(oldest);
    }
    // Also index by hash so future blocks can find this as their parent
    this.blocksByHash.set(block.hash, block);
  }

  /**
   * Executes a chain reorganization to switch the canonical chain to the fork
   * ending at `newTip`.
   *
   * Strategy:
   *   1. Walk the orphan pool backwards from newTip to find the common ancestor
   *      with our current canonical chain.
   *   2. Reset EVM state to empty and replay every canonical block from genesis
   *      to the new tip — this is O(chain length) but fully deterministic.
   *   3. Replace this.blocks and persist.
   */
  private async reorgTo(newTip: StoredBlock, newTipTxs: StoredTransaction[]): Promise<void> {
    return this.withEvmLock(async () => {
      // Build the full fork chain by walking back through orphans
      const forkChain: StoredBlock[] = [newTip];
      const forkTxMap = new Map<string, StoredTransaction[]>([
        [newTip.hash, newTipTxs],
      ]);

      let cursor = newTip;
      while (!this.blocksByHash.has(cursor.parentHash) || this.orphanPool.has(cursor.parentHash)) {
        // Prefer canonical chain; stop when we hit it
        if (this.blocksByHash.has(cursor.parentHash) && !this.orphanPool.has(cursor.parentHash)) break;
        const parentEntry = this.orphanPool.get(cursor.parentHash);
        if (!parentEntry) {
          // Also check blocksByHash in case it's a canonical ancestor
          if (this.blocksByHash.has(cursor.parentHash)) break;
          throw new Error(
            `Reorg aborted: cannot trace fork to canonical chain ` +
            `(missing ancestor ${cursor.parentHash.slice(0, 10)}…). ` +
            `Sync loop will retry once the full fork is available.`,
          );
        }
        forkChain.unshift(parentEntry.block);
        forkTxMap.set(parentEntry.block.hash, parentEntry.txs);
        cursor = parentEntry.block;
      }

      // Common ancestor: the canonical block whose hash is forkChain[0].parentHash
      const commonAncestorHash = forkChain[0]!.parentHash;
      const commonAncestorIdx  = this.blocks.findIndex((b) => b.hash === commonAncestorHash);
      if (commonAncestorIdx === -1) {
        throw new Error("Reorg aborted: common ancestor not found in canonical chain");
      }

      console.log(
        `[chain] Reorg: common ancestor #${this.blocks[commonAncestorIdx]!.number}, ` +
        `rolling back ${this.blocks.length - 1 - commonAncestorIdx} block(s), ` +
        `applying ${forkChain.length} fork block(s)`,
      );

      // Register fork transactions so the EVM replay can find them
      for (const [, txs] of forkTxMap) {
        for (const tx of txs) {
          if (!this.transactions.has(tx.hash as PrefixedHexString)) {
            this.transactions.set(tx.hash as PrefixedHexString, {
              ...tx, status: "pending", blockNumber: null,
            });
          }
        }
      }

      // Build new canonical chain
      const newCanonical = [
        ...this.blocks.slice(0, commonAncestorIdx + 1),
        ...forkChain,
      ];

      // ── Critical: preserve rolled-back canonical blocks in the orphan pool ──
      //
      // When we reorg away from blocks [commonAncestor+1 … oldTip], those blocks
      // are removed from blocksByHash.  If a subsequent sync batch contains blocks
      // that reference one of these rolled-back blocks as their parent, the parent
      // lookup fails, TD falls back to `BigInt(block.difficulty)` (≈ trivial), and
      // the block is incorrectly stored as a low-TD orphan that can never trigger a
      // reorg.  Keeping the rolled-back blocks in the orphan pool ensures the
      // parent is still findable so TD is computed correctly and the reorg can fire.
      const rolledBack = this.blocks.slice(commonAncestorIdx + 1);
      for (const b of rolledBack) {
        if (!this.orphanPool.has(b.hash)) {
          const txs = b.transactionHashes
            .map((h) => this.transactions.get(h))
            .filter((t): t is StoredTransaction => Boolean(t));
          this.storeOrphan(b, txs);
        }
      }

      // ── EVM state update ──────────────────────────────────────────────────────
      //
      // The full genesis-replay approach (reset state, replay every block) is
      // correct but O(chain length) — for a 34 000-block chain it takes 20-60 s,
      // which is longer than the 30-second stall watchdog.  The watchdog fires
      // resetToGenesis() while the replay is still in progress, wiping the chain.
      //
      // Fast path (used when every rolled-back block AND every fork block has no
      // transactions — the overwhelmingly common case for pure mining reorgs):
      //   1. Debit mining rewards for each rolled-back block (reverse order).
      //   2. Credit mining rewards for each fork block (forward order).
      //   O(rolledBack + forkChain) instead of O(entire chain).
      //
      // Slow path (any block has transactions): fall back to the full replay to
      // guarantee correct contract state after the reorg.

      const hasTransactions = (b: StoredBlock) => b.transactionHashes.length > 0;
      const needsFullReplay = [...rolledBack, ...forkChain].some(hasTransactions);

      if (needsFullReplay) {
        this.stateManager = createStateManager(this.common);
        this.evm           = await createEVM({ common: this.common, stateManager: this.stateManager });
        await this.replayChainEVM(newCanonical, forkTxMap);
      } else {
        // Fast path: patch state in-place without replaying from genesis.
        // Undo rolled-back blocks (newest first — order doesn't matter for
        // independent miner accounts, but reverse is semantically correct).
        for (const b of [...rolledBack].reverse()) {
          const payouts = b.payouts ?? { [b.miner.toLowerCase()]: b.reward };
          for (const [addr, amount] of Object.entries(payouts)) {
            if (BigInt(amount) > 0n) {
              try {
                await debit(this.stateManager, addr as PrefixedHexString, BigInt(amount));
              } catch { /* miner balance already 0 — safe to ignore */ }
            }
          }
        }
        // Apply fork blocks (oldest first).
        for (const b of forkChain) {
          const payouts = b.payouts ?? { [b.miner.toLowerCase()]: b.reward };
          for (const [addr, amount] of Object.entries(payouts)) {
            if (BigInt(amount) > 0n) {
              await credit(this.stateManager, addr as PrefixedHexString, BigInt(amount));
            }
          }
        }
        console.log(`[chain] Reorg used fast EVM patch (${rolledBack.length} block(s) rolled back, ${forkChain.length} applied — no tx replay needed)`);
      }

      // Commit
      this.blocks       = newCanonical;
      this.blocksByHash = new Map(newCanonical.map((b) => [b.hash, b]));

      // Retarget difficulty from the tip of the new canonical chain
      const newTipBlock = newCanonical[newCanonical.length - 1]!;
      const prevBlock   = newCanonical[newCanonical.length - 2];
      if (prevBlock) {
        const actualSec =
          (new Date(newTipBlock.timestamp).getTime() - new Date(prevBlock.timestamp).getTime()) / 1000;
        this.difficulty = retargetDifficulty(
          BigInt(prevBlock.difficulty),
          actualSec > 0 ? actualSec : EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
          EMBERCHAIN_CONFIG.targetBlockTimeSeconds,
        );
      }

      // Clean up reorg'd blocks from orphan pool
      for (const b of forkChain) this.orphanPool.delete(b.hash);

      this.persist();

      console.log(
        `[chain] Reorg complete. New canonical tip: #${newTipBlock.number} ` +
        `totalDifficulty=${newTipBlock.totalDifficulty}`,
      );

      // Gossip new canonical tip to peers
      if (this.onBlock) {
        const tipTxs = newTipBlock.transactionHashes
          .map((h) => this.transactions.get(h))
          .filter((t): t is StoredTransaction => Boolean(t));
        queueMicrotask(() => this.onBlock!(newTipBlock, tipTxs));
      }
    });
  }

  /**
   * Replays all blocks from block #1 onward against a freshly reset EVM state.
   * Genesis (block #0) is skipped — it has no transactions and no payouts.
   * Called exclusively during reorgs to reconstruct account balances deterministically.
   */
  private async replayChainEVM(
    chain: StoredBlock[],
    extraTxs: Map<string, StoredTransaction[]>,
  ): Promise<void> {
    for (const block of chain.slice(1)) {
      // Gather transactions for this block from the main tx store or the extra map
      const blockTxs: StoredTransaction[] = [];
      for (const h of block.transactionHashes) {
        const tx =
          this.transactions.get(h as PrefixedHexString) ??
          extraTxs.get(block.hash)?.find((t) => t.hash === h);
        if (tx) blockTxs.push(tx);
      }

      for (const tx of blockTxs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.stateManager as any).originalStorageCache?.clear?.();
        try {
          const result = await this.evm.runCall({
            caller:   new Address(hexToBytes(tx.from as PrefixedHexString)),
            to:       tx.to ? new Address(hexToBytes(tx.to as PrefixedHexString)) : undefined,
            value:    BigInt(tx.value),
            data:     hexToBytes((tx.data ?? "0x") as PrefixedHexString),
            gasLimit: BigInt(tx.gasLimit),
          });
          tx.status  = result.execResult.exceptionError ? "failed" : "success";
          tx.gasUsed = result.execResult.executionGasUsed.toString();
          const gasUsed = BigInt(tx.gasUsed ?? tx.gasLimit);
          const fee = gasUsed * GAS_PRICE;
          try { await debit(this.stateManager, tx.from as PrefixedHexString, fee); } catch { /* ignore */ }
        } catch {
          tx.status  = "failed";
          tx.gasUsed = tx.gasLimit;
        }
        tx.blockNumber = block.number;
      }

      // Credit payouts exactly as stored — same on every node (deterministic)
      const payouts = block.payouts ?? { [block.miner.toLowerCase()]: block.reward };
      for (const [addr, amount] of Object.entries(payouts)) {
        if (BigInt(amount) > 0n) {
          await credit(this.stateManager, addr as PrefixedHexString, BigInt(amount));
        }
      }
    }
  }

  /** Returns the canonical chain's cumulative proof-of-work as a bigint. */
  getTotalDifficulty(): bigint {
    const tip = this.blocks[this.blocks.length - 1];
    return tip ? BigInt(tip.totalDifficulty ?? tip.difficulty) : 0n;
  }

  // ---------- Shielded pool (private transactions) ----------
  //
  // Privacy model summary (see replit.md / in-app help for the full writeup):
  //  - "shield" moves EMBR from a public balance into a hidden note. The
  //    amount and source address ARE visible here — this is the documented
  //    public/private boundary, same as Zcash's t->z transactions.
  //  - "private send" spends one or more owned notes and creates new ones
  //    for the recipient (and change for the sender). Sender, recipient,
  //    and amount are never persisted or exposed anywhere in this step —
  //    only opaque commitments, ring signatures, and key images are.
  //  - "unshield" is the reverse of shield: a hidden note becomes a public
  //    credit. Destination and amount are visible (same boundary).
  //  - No zero-knowledge range proofs (see privacy/commitments.ts):
  //    amount-hiding is enforced via Pedersen-commitment balance checks
  //    plus a plaintext bounds check, not a trustless cryptographic proof.
  //    This is a known, documented limitation of this implementation.

  private parseAmount(raw: string, { allowZero }: { allowZero: boolean }): bigint {
    let value: bigint;
    try {
      value = BigInt(raw);
    } catch {
      throw new Error("Invalid amount");
    }
    if (value < 0n || (!allowZero && value === 0n)) {
      throw new Error(allowZero ? "Amount must be non-negative" : "Amount must be positive");
    }
    if (value > MAX_PRIVATE_AMOUNT) {
      throw new Error("Amount exceeds the maximum allowed by this node's plaintext bounds check");
    }
    return value;
  }

  private makeNoteId(ephemeralPublicKey: string, commitment: string): string {
    return bytesToHex(keccak256(new TextEncoder().encode(`note:${ephemeralPublicKey}:${commitment}:${Math.random()}`)));
  }

  private makeShieldedTxId(): string {
    return bytesToHex(keccak256(new TextEncoder().encode(`stx:${Date.now()}:${Math.random()}`)));
  }

  private createNoteFor(
    meta: StealthMeta,
    amount: bigint,
    blinding: bigint,
    source: PrivateNote["source"],
  ): { note: PrivateNote; dest: ReturnType<typeof deriveStealthDestination> } {
    const dest = deriveStealthDestination(meta);
    const commitment = pedersenCommit(amount, blinding);
    const encryptedPayload = encryptNotePayload(scalarToHex(dest.sharedSecretScalar), {
      amount: amount.toString(),
      blinding: scalarToHex(blinding),
    });
    const note: PrivateNote = {
      id: this.makeNoteId(dest.ephemeralPublicKey, commitment),
      ephemeralPublicKey: dest.ephemeralPublicKey,
      stealthPublicKey: dest.stealthPublicKey,
      commitment,
      encryptedPayload,
      status: "unspent",
      keyImage: null,
      source,
      createdAtBlockHeight: this.blocks[this.blocks.length - 1].number,
      createdAt: new Date().toISOString(),
    };
    return { note, dest };
  }

  /** Scans every note in the pool and returns the ones this private key owns (spent or unspent), decrypted. */
  private findOwnedNotes(
    privateKeyHex: string,
  ): { note: PrivateNote; oneTimePrivateKey: bigint; amount: bigint; blinding: bigint }[] {
    const owned: { note: PrivateNote; oneTimePrivateKey: bigint; amount: bigint; blinding: bigint }[] = [];
    for (const note of this.privateNotes.values()) {
      const recovered = recoverStealthOwnership(privateKeyHex, note.ephemeralPublicKey, note.stealthPublicKey);
      if (!recovered.owned) continue;
      const plaintext = decryptNotePayload(scalarToHex(recovered.sharedSecretScalar), note.encryptedPayload);
      if (!plaintext) continue;
      owned.push({
        note,
        oneTimePrivateKey: recovered.oneTimePrivateKey,
        amount: BigInt(plaintext.amount),
        blinding: hexToScalarValue(plaintext.blinding),
      });
    }
    return owned;
  }

  private selectDecoyRing(excludeNoteIds: Set<string>): PrefixedHexString[] {
    const candidates = [...this.privateNotes.values()].filter(
      (n) => n.status === "unspent" && !excludeNoteIds.has(n.id),
    );
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    return candidates.slice(0, MAX_RING_DECOYS).map((n) => n.stealthPublicKey);
  }

  /**
   * PURE COMPUTATION PHASE — no state mutation.
   * Builds a ring signature for one owned note. Returns the ring + signature
   * without touching note.status or spentKeyImages. The caller is responsible
   * for applying mutations atomically after ALL spends have been computed.
   */
  private computeSpend(
    entry: { note: PrivateNote; oneTimePrivateKey: bigint },
    message: Uint8Array,
    excludeNoteIds: Set<string>,
    alreadyUsedKeyImages: Set<string>,
  ): { ring: PrefixedHexString[]; signature: RingSignature } {
    const decoys = this.selectDecoyRing(excludeNoteIds);
    const ring = [...decoys];
    const secretIndex = Math.floor(Math.random() * (ring.length + 1));
    ring.splice(secretIndex, 0, entry.note.stealthPublicKey);

    const signature = signRing(message, ring, secretIndex, entry.oneTimePrivateKey);
    if (!verifyRing(message, ring, signature)) {
      throw new Error("Internal error: constructed ring signature failed self-verification");
    }
    // Check persisted key images AND those already staged in this batch.
    if (this.spentKeyImages.has(signature.keyImage) || alreadyUsedKeyImages.has(signature.keyImage)) {
      throw new Error("Note already spent (key image reused)");
    }
    alreadyUsedKeyImages.add(signature.keyImage);
    return { ring, signature };
  }

  /** Applies the spend mutations produced by computeSpend. Call only after ALL computeSpend calls succeed. */
  private applySpend(entry: { note: PrivateNote }, signature: RingSignature): void {
    entry.note.status = "spent";
    entry.note.keyImage = signature.keyImage;
    this.spentKeyImages.add(signature.keyImage);
  }

  private getWalletMeta(address: PrefixedHexString): StealthMeta {
    const record = this.wallets.get(address);
    if (!record?.spendPublicKey || !record.viewPublicKey) {
      throw new Error(
        `No known stealth address for ${address}. That wallet must be created or imported on this node first.`,
      );
    }
    return { spendPublicKey: record.spendPublicKey, viewPublicKey: record.viewPublicKey };
  }

  /** Returns a wallet's public stealth meta-address (safe to share) so others can send it private funds. */
  async getStealthMeta(address: string): Promise<StealthMeta | null> {
    await this.whenReady();
    const record = this.wallets.get(address as PrefixedHexString);
    if (!record?.spendPublicKey || !record.viewPublicKey) return null;
    return { spendPublicKey: record.spendPublicKey, viewPublicKey: record.viewPublicKey };
  }

  /** Moves EMBR from a public balance into a new hidden note. The source address and amount are visible (the shield boundary). */
  async shield(input: { fromPrivateKey: string; amount: string; toAddress?: string | null }): Promise<ShieldedTxRecord> {
    await this.whenReady();
    // Wallet registration happens outside the lock (read-only on pool state).
    const wallet = walletFromPrivateKey(input.fromPrivateKey);
    this.registerWallet(wallet.address, input.fromPrivateKey);

    return this.runExclusive(async () => {
      const amount = this.parseAmount(input.amount, { allowZero: false });
      const recipientAddress = (
        input.toAddress && input.toAddress !== "" ? input.toAddress : wallet.address
      ) as PrefixedHexString;
      if (!ADDRESS_RE.test(recipientAddress)) throw new Error("Invalid recipient address");
      const recipientMeta = this.getWalletMeta(recipientAddress);

      // Compute note before any mutation so failures stay clean.
      const blinding = randomBlindingFactor();
      const { note } = this.createNoteFor(recipientMeta, amount, blinding, "shield");

      const record: ShieldedTxRecord = {
        id: this.makeShieldedTxId(),
        type: "shield",
        createdAt: note.createdAt,
        publicAddress: wallet.address,
        publicAmount: amount.toString(),
        fee: "0",
        noteIdsCreated: [note.id],
        noteIdsSpent: [],
      };

      // ── Atomic mutation phase: all validations passed, apply in one block ──
      await debit(this.stateManager, wallet.address, amount);
      this.privateNotes.set(note.id, note);
      this.shieldedTxs.push(record);
      this.persist();
      return record;
    });
  }

  /**
   * Spends owned private notes and creates new ones for the recipient (plus
   * change for the sender, if any). Nothing about sender, recipient, or
   * amount is persisted anywhere but the caller's own response.
   */
  async privateSend(input: {
    fromPrivateKey: string;
    toAddress: string;
    amount: string;
    fee?: string;
  }): Promise<ShieldedTxRecord> {
    await this.whenReady();
    const wallet = walletFromPrivateKey(input.fromPrivateKey);
    this.registerWallet(wallet.address, input.fromPrivateKey);

    return this.runExclusive(async () => {
      if (!ADDRESS_RE.test(input.toAddress)) throw new Error("Invalid recipient address");
      const recipientMeta = this.getWalletMeta(input.toAddress as PrefixedHexString);
      const senderMeta = this.getWalletMeta(wallet.address);

      const amount = this.parseAmount(input.amount, { allowZero: false });
      const fee = this.parseAmount(input.fee ?? DEFAULT_PRIVATE_FEE, { allowZero: true });

      // Re-fetch owned notes inside the lock to avoid TOCTOU with a concurrent request.
      const owned = this.findOwnedNotes(input.fromPrivateKey).filter((o) => o.note.status === "unspent");
      const selected: typeof owned = [];
      let total = 0n;
      for (const entry of owned) {
        if (total >= amount + fee) break;
        selected.push(entry);
        total += entry.amount;
      }
      if (total < amount + fee) throw new Error("Insufficient private balance");
      const change = total - amount - fee;

      // Balance blinding factors: sum(input blindings) == sum(output blindings).
      const inputBlindingSum = mod(selected.reduce((sum, e) => sum + e.blinding, 0n));

      let recipientBlinding: bigint;
      let changeBlinding: bigint | null = null;
      if (change > 0n) {
        recipientBlinding = randomBlindingFactor();
        changeBlinding = mod(inputBlindingSum - recipientBlinding);
      } else {
        recipientBlinding = inputBlindingSum;
      }

      // ── Pure computation phase: build all outputs and ring signatures ──
      const recipientDest = this.createNoteFor(recipientMeta, amount, recipientBlinding, "private-send");
      const changeDest =
        changeBlinding !== null ? this.createNoteFor(senderMeta, change, changeBlinding, "private-send") : null;

      const outputs = changeDest ? [recipientDest, changeDest] : [recipientDest];
      const outputCommitments = outputs.map((o) => o.note.commitment);
      const inputCommitments = selected.map((e) => e.note.commitment);
      if (!verifyCommitmentBalance(inputCommitments, outputCommitments, fee)) {
        throw new Error("Internal error: shielded transaction failed to balance");
      }

      const message = keccak256(
        new TextEncoder().encode(
          JSON.stringify({
            outputCommitments,
            ephemeralPublicKeys: outputs.map((o) => o.note.ephemeralPublicKey),
            fee: fee.toString(),
          }),
        ),
      );

      const excludeIds = new Set(selected.map((e) => e.note.id));
      // computeSpend validates all key images (persisted + in-batch) before mutating anything.
      const stagedKeyImages = new Set<string>();
      const spends = selected.map((entry) => this.computeSpend(entry, message, excludeIds, stagedKeyImages));

      // ── Atomic mutation phase: all validations passed, apply in one block ──
      for (const [i, entry] of selected.entries()) this.applySpend(entry, spends[i]!.signature);
      for (const output of outputs) this.privateNotes.set(output.note.id, output.note);
      await credit(this.stateManager, PRIVACY_FEE_SINK_ADDRESS, fee);

      const record: ShieldedTxRecord = {
        id: this.makeShieldedTxId(),
        type: "private-send",
        createdAt: new Date().toISOString(),
        publicAddress: null,
        publicAmount: null,
        fee: fee.toString(),
        noteIdsCreated: outputs.map((o) => o.note.id),
        noteIdsSpent: selected.map((e) => e.note.id),
      };
      (record as ShieldedTxRecord & { ringSignatures?: unknown }).ringSignatures = spends.map((s) => ({
        ring: s.ring,
        c0: s.signature.c0,
        s: s.signature.s,
        keyImage: s.signature.keyImage,
      }));
      this.shieldedTxs.push(record);
      this.persist();
      return record;
    });
  }

  /** Moves a hidden note back to a public balance. The destination address and amount are visible (the unshield boundary). */
  async unshield(input: { fromPrivateKey: string; toAddress: string; amount: string }): Promise<ShieldedTxRecord> {
    await this.whenReady();
    const wallet = walletFromPrivateKey(input.fromPrivateKey);
    this.registerWallet(wallet.address, input.fromPrivateKey);

    return this.runExclusive(async () => {
      if (!ADDRESS_RE.test(input.toAddress)) throw new Error("Invalid destination address");

      const amount = this.parseAmount(input.amount, { allowZero: false });
      const senderMeta = this.getWalletMeta(wallet.address);

      // Re-fetch inside lock to avoid TOCTOU races.
      const owned = this.findOwnedNotes(input.fromPrivateKey).filter((o) => o.note.status === "unspent");
      const selected: typeof owned = [];
      let total = 0n;
      for (const entry of owned) {
        if (total >= amount) break;
        selected.push(entry);
        total += entry.amount;
      }
      if (total < amount) throw new Error("Insufficient private balance");
      const change = total - amount;
      const inputBlindingSum = mod(selected.reduce((sum, e) => sum + e.blinding, 0n));

      // ── Pure computation phase ──
      const changeDest = change > 0n ? this.createNoteFor(senderMeta, change, inputBlindingSum, "private-send") : null;
      const outputCommitments = changeDest ? [changeDest.note.commitment] : [];
      const inputCommitments = selected.map((e) => e.note.commitment);
      // The unshielded amount acts as a transparent "fee" in the commitment balance:
      // it leaves the pool with zero blinding.
      if (!verifyCommitmentBalance(inputCommitments, outputCommitments, amount)) {
        throw new Error("Internal error: unshield transaction failed to balance");
      }

      const message = keccak256(
        new TextEncoder().encode(
          JSON.stringify({
            toAddress: input.toAddress,
            amount: amount.toString(),
            outputCommitments,
          }),
        ),
      );

      const excludeIds = new Set(selected.map((e) => e.note.id));
      // Validate all ring signatures and key images BEFORE any balance mutation.
      const stagedKeyImages = new Set<string>();
      const spends = selected.map((entry) => this.computeSpend(entry, message, excludeIds, stagedKeyImages));

      // ── Atomic mutation phase: all validations passed, apply in one block ──
      for (const [i, entry] of selected.entries()) this.applySpend(entry, spends[i]!.signature);
      if (changeDest) this.privateNotes.set(changeDest.note.id, changeDest.note);
      // Credit the public destination AFTER note spends succeed.
      await credit(this.stateManager, input.toAddress as PrefixedHexString, amount);

      const record: ShieldedTxRecord = {
        id: this.makeShieldedTxId(),
        type: "unshield",
        createdAt: new Date().toISOString(),
        publicAddress: input.toAddress as PrefixedHexString,
        publicAmount: amount.toString(),
        fee: "0",
        noteIdsCreated: changeDest ? [changeDest.note.id] : [],
        noteIdsSpent: selected.map((e) => e.note.id),
      };
      (record as ShieldedTxRecord & { ringSignatures?: unknown }).ringSignatures = spends.map((s) => ({
        ring: s.ring,
        c0: s.signature.c0,
        s: s.signature.s,
        keyImage: s.signature.keyImage,
      }));
      this.shieldedTxs.push(record);
      this.persist();
      return record;
    });
  }

  /** Scans the pool for notes owned by this private key and returns the resulting private balance and note history. */
  async getPrivateBalance(privateKeyHex: string): Promise<{
    address: PrefixedHexString;
    balance: string;
    notes: {
      id: string;
      amount: string;
      status: PrivateNote["status"];
      source: PrivateNote["source"];
      createdAt: string;
    }[];
  }> {
    await this.whenReady();
    const wallet = walletFromPrivateKey(privateKeyHex);
    const owned = this.findOwnedNotes(privateKeyHex).sort((a, b) => (a.note.createdAt < b.note.createdAt ? 1 : -1));
    const balance = owned
      .filter((o) => o.note.status === "unspent")
      .reduce((sum, o) => sum + o.amount, 0n);
    return {
      address: wallet.address,
      balance: balance.toString(),
      notes: owned.map((o) => ({
        id: o.note.id,
        amount: o.amount.toString(),
        status: o.note.status,
        source: o.note.source,
        createdAt: o.note.createdAt,
      })),
    };
  }

  /** Public, sanitized ledger of shielded-pool operations — private-send entries never carry sender/recipient/amount. */
  async listPrivacyLedger(limit = 20): Promise<ShieldedTxRecord[]> {
    await this.whenReady();
    return [...this.shieldedTxs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
  }

  async getPrivacyStatus(): Promise<{ totalNotes: number; unspentNotes: number; shieldedTxCount: number }> {
    await this.whenReady();
    const notes = [...this.privateNotes.values()];
    return {
      totalNotes: notes.length,
      unspentNotes: notes.filter((n) => n.status === "unspent").length,
      shieldedTxCount: this.shieldedTxs.length,
    };
  }

  // ---------- P2P Exchange ----------

  private makeListingId(): string {
    return bytesToHex(keccak256(new TextEncoder().encode(`listing:${Date.now()}:${Math.random()}`)));
  }

  /** Clears expired reservations (check-on-read). Never touches listings under active verification. */
  private releaseExpiredReservations(): void {
    const now = Date.now();
    let changed = false;
    for (const listing of this.exchangeListings.values()) {
      if (
        listing.reservedBy &&
        listing.reservedUntil !== null &&
        listing.reservedUntil <= now &&
        !this.verifyingListings.has(listing.id)
      ) {
        listing.reservedBy = null;
        listing.reservedAt = null;
        listing.reservedUntil = null;
        listing.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  async createListing(input: {
    /** 0x-prefixed hex private key. Address is derived server-side — never trusted from the client. */
    sellerPrivateKey: string;
    amountEmbr: string;
    currency: ExchangeCurrency;
    priceAmount: string;
    receiveAddress: string;
    /** For USDT: which networks the seller will accept payment on. */
    acceptedNetworks?: string[];
    /** For USDT multi-chain: maps network name → receive address. */
    networkAddresses?: Record<string, string>;
  }): Promise<ExchangeListing> {
    await this.whenReady();
    // Derive the seller's address from their private key — this is the auth proof.
    const sellerWallet = walletFromPrivateKey(input.sellerPrivateKey);
    const sellerAddress = sellerWallet.address;

    let amount: bigint;
    try { amount = BigInt(input.amountEmbr); } catch { throw new Error("Invalid amountEmbr value"); }
    if (amount <= 0n) throw new Error("Amount must be positive");
    const price = parseFloat(input.priceAmount);
    if (!isFinite(price) || price <= 0) throw new Error("Price must be a positive number");
    if (!input.receiveAddress.trim()) throw new Error("Receive address is required");
    if (!(["ETH", "USDT", "BTC", "SOL"] as string[]).includes(input.currency)) throw new Error("Unsupported currency");

    // Debit from seller's public balance — this is the escrow lock
    await debit(this.stateManager, sellerAddress as PrefixedHexString, amount);

    const now = new Date().toISOString();
    const listing: ExchangeListing = {
      id: this.makeListingId(),
      sellerAddress,
      amountEmbr: input.amountEmbr,
      currency: input.currency,
      priceAmount: input.priceAmount,
      receiveAddress: input.receiveAddress,
      status: "open",
      buyerAddress: null,
      paymentTxHash: null,
      createdAt: now,
      updatedAt: now,
      // Multi-chain USDT
      acceptedNetworks: input.currency === "USDT"
        ? (input.acceptedNetworks && input.acceptedNetworks.length > 0 ? input.acceptedNetworks : ["ERC-20"])
        : null,
      networkAddresses: input.currency === "USDT"
        ? (input.networkAddresses ?? { "ERC-20": input.receiveAddress })
        : null,
      // Reservation
      reservedBy: null,
      reservedAt: null,
      reservedUntil: null,
      // Fulfillment metadata
      selectedNetwork: null,
    };
    this.exchangeListings.set(listing.id, listing);
    this.persist();
    return listing;
  }

  /**
   * Atomically reserves a listing for a buyer for the given window.
   * Throws if the listing is already reserved by a different buyer.
   * Idempotent: the same buyer can refresh their reservation.
   */
  reserveListing(id: string, buyerAddress: string, durationMs = 15 * 60 * 1000): ExchangeListing {
    const listing = this.exchangeListings.get(id);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "open") throw new Error("Listing is no longer available");

    const now = Date.now();
    // Check whether another buyer holds an active reservation
    if (
      listing.reservedBy &&
      listing.reservedUntil !== null &&
      listing.reservedUntil > now &&
      listing.reservedBy.toLowerCase() !== buyerAddress.toLowerCase()
    ) {
      const remaining = Math.ceil((listing.reservedUntil - now) / 1000);
      throw new Error(`Listing is reserved by another buyer (${remaining}s remaining)`);
    }

    // Set or refresh reservation
    listing.reservedBy = buyerAddress;
    listing.reservedAt = now;
    listing.reservedUntil = now + durationMs;
    listing.updatedAt = new Date().toISOString();
    this.persist();
    return listing;
  }

  async cancelListing(id: string, sellerPrivateKey: string): Promise<ExchangeListing> {
    await this.whenReady();
    // Derive address from the supplied private key — this is the auth proof.
    const callerWallet = walletFromPrivateKey(sellerPrivateKey);
    const callerAddress = callerWallet.address;
    const listing = this.exchangeListings.get(id);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "open") throw new Error(`Listing cannot be cancelled — status is '${listing.status}'`);
    if (listing.sellerAddress.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error("Private key does not match the seller's wallet for this listing");
    }
    if (this.verifyingListings.has(id)) {
      throw new Error("A buyer is currently verifying payment — try again in a moment");
    }
    await credit(this.stateManager, listing.sellerAddress as PrefixedHexString, BigInt(listing.amountEmbr));
    listing.status = "cancelled";
    // Clear any reservation — seller's cancellation overrides it
    listing.reservedBy = null;
    listing.reservedAt = null;
    listing.reservedUntil = null;
    listing.updatedAt = new Date().toISOString();
    this.persist();
    return listing;
  }

  /**
   * Synchronously checks the listing is open AND reserves the payment proof,
   * then marks the listing as being verified.  Everything happens in one
   * event-loop tick with no awaits, so the combined check+reserve is atomic
   * in Node.js's single-threaded model.
   *
   * Two concurrent calls for the **same listing** are blocked by
   * `verifyingListings`.  Two concurrent calls with the **same external tx
   * hash** on *different* listings are blocked by `pendingProofs` +
   * `usedPaymentProofs`, preventing any proof-replay attack.
   *
   * If the listing is reserved, only the reserving buyer (buyerAddress) may
   * proceed.  A buyer who holds the reservation may retry after a failed
   * verification without losing their reservation window.
   */
  lockListingForFulfillment(id: string, paymentTxHash: string, buyerAddress?: string): ExchangeListing {
    if (this.verifyingListings.has(id)) {
      throw new Error("Another buyer is already verifying payment on this listing — try again in a moment");
    }
    const listing = this.exchangeListings.get(id);
    if (!listing) throw new Error("Listing not found");
    if (listing.status !== "open") throw new Error("Listing is no longer available");

    // Enforce reservation: if an active reservation exists, only the reserving buyer may proceed.
    const now = Date.now();
    if (
      listing.reservedBy &&
      listing.reservedUntil !== null &&
      listing.reservedUntil > now
    ) {
      if (!buyerAddress || listing.reservedBy.toLowerCase() !== buyerAddress.toLowerCase()) {
        const remaining = Math.ceil((listing.reservedUntil - now) / 1000);
        throw new Error(`Listing is reserved by another buyer (${remaining}s remaining) — please reserve this listing first`);
      }
    }

    // Reserve the proof key before any async work — prevents cross-listing replay.
    const proofKey = `${listing.currency}:${paymentTxHash.toLowerCase()}`;
    if (this.usedPaymentProofs.has(proofKey)) {
      throw new Error(
        `This ${listing.currency} transaction was already used to fulfill a previous listing`,
      );
    }
    if (this.pendingProofs.has(proofKey)) {
      throw new Error(
        `This ${listing.currency} transaction is already being verified for another listing — try again shortly`,
      );
    }

    this.verifyingListings.add(id);
    this.pendingProofs.add(proofKey);
    this.listingProofKeys.set(id, proofKey);
    return listing;
  }

  /** Called after successful external verification to release EMBR to the buyer. */
  async commitFulfillment(
    id: string,
    buyerAddress: string,
    paymentTxHash: string,
    selectedNetwork?: string,
  ): Promise<ExchangeListing> {
    await this.whenReady();
    if (!ADDRESS_RE.test(buyerAddress)) throw new Error("Invalid buyer EMBR address");
    const listing = this.exchangeListings.get(id)!;

    // The proof key was already reserved synchronously in lockListingForFulfillment;
    // move it from pending → used and credit the buyer.
    const proofKey = this.listingProofKeys.get(id) ?? `${listing.currency}:${paymentTxHash.toLowerCase()}`;
    await credit(this.stateManager, buyerAddress as PrefixedHexString, BigInt(listing.amountEmbr));
    // Register buyer so listWallets() includes the new address
    if (!this.wallets.has(buyerAddress.toLowerCase() as PrefixedHexString)) {
      this.wallets.set(buyerAddress.toLowerCase() as PrefixedHexString, { createdAt: new Date().toISOString() });
    }
    listing.status = "fulfilled";
    listing.buyerAddress = buyerAddress;
    listing.paymentTxHash = paymentTxHash;
    listing.selectedNetwork = selectedNetwork ?? null;
    // Clear reservation — listing is done
    listing.reservedBy = null;
    listing.reservedAt = null;
    listing.reservedUntil = null;
    listing.updatedAt = new Date().toISOString();
    this.pendingProofs.delete(proofKey);
    this.listingProofKeys.delete(id);
    this.usedPaymentProofs.add(proofKey);
    this.verifyingListings.delete(id);
    this.persist();
    // Durably save the proof to the dedicated DB table, independent of the
    // chain_state blob.  This ensures replay protection survives even if the
    // chain state file/row is lost or rolled back.  Fire-and-forget with error
    // logging mirrors the existing persist() pattern — the local file and
    // chain_state row still protect against replay within the same session.
    if (this.asyncSaveProofHook) {
      const [currency, txHashLower] = proofKey.split(":");
      this.asyncSaveProofHook(proofKey, currency, txHashLower, id).catch((err: unknown) =>
        console.error("[chain] Failed to save proof key to DB:", (err as Error).message),
      );
    }
    return listing;
  }

  /** Releases verification lock and proof reservation (called when verification fails). */
  unlockListing(id: string): void {
    const proofKey = this.listingProofKeys.get(id);
    if (proofKey) {
      this.pendingProofs.delete(proofKey);
      this.listingProofKeys.delete(id);
    }
    this.verifyingListings.delete(id);
  }

  async listExchangeListings(status?: string): Promise<ExchangeListing[]> {
    await this.whenReady();
    this.releaseExpiredReservations();
    let all = [...this.exchangeListings.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (status) all = all.filter((l) => l.status === status);
    return all;
  }

  async getExchangeListing(id: string): Promise<ExchangeListing | undefined> {
    await this.whenReady();
    this.releaseExpiredReservations();
    return this.exchangeListings.get(id);
  }
}
