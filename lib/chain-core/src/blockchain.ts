import { createEVM } from "@ethereumjs/evm";
import type { EVM } from "@ethereumjs/evm";
import { Address, hexToBytes, bytesToHex } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak.js";
import type { PrefixedHexString } from "@ethereumjs/util";
import type { SimpleStateManager } from "@ethereumjs/statemanager";
import { createEmberchainCommon } from "./common";
import { createStateManager, dumpState, loadState, getBalance, getNonce, credit, debit, ensureAccount } from "./state";
import { generateWallet, walletFromPrivateKey, encodeTxPayload, signPayload, hashTransaction } from "./crypto";
import { mine, retargetDifficulty, batchSizeForIntensity, type MinableHeader } from "./mining";
import { loadChainFile, saveChainFile, type PersistedChain } from "./persistence";
import type {
  StoredBlock,
  StoredTransaction,
  ChainConfig,
  PrivateNote,
  ShieldedTxRecord,
  StealthMeta,
  WalletRecord,
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
};

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
  private transactions = new Map<PrefixedHexString, StoredTransaction>();
  private mempool: PendingTx[] = [];
  private wallets: Map<PrefixedHexString, WalletRecord> = new Map();
  private privateNotes: Map<string, PrivateNote> = new Map();
  private shieldedTxs: ShieldedTxRecord[] = [];
  private spentKeyImages: Set<string> = new Set();
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
  private difficulty: bigint;
  private readonly dataFile: string;
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
      for (const note of persisted.privateNotes ?? []) {
        this.privateNotes.set(note.id, note);
        if (note.status === "spent" && note.keyImage) this.spentKeyImages.add(note.keyImage);
      }
      this.shieldedTxs = persisted.shieldedTxs ?? [];
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
      version: 2,
      difficulty: this.difficulty.toString(),
      blocks: this.blocks,
      transactions: [...this.transactions.values()],
      wallets: [...this.wallets.entries()],
      state: dumpState(this.stateManager),
      privateNotes: [...this.privateNotes.values()],
      shieldedTxs: this.shieldedTxs,
    };
    saveChainFile(this.dataFile, data);
  }

  /** Registers (or backfills) a wallet's public stealth meta-address whenever we see its private key. */
  private registerWallet(address: PrefixedHexString, privateKeyHex: string): void {
    const meta = getStealthMetaAddress(privateKeyHex);
    const existing = this.wallets.get(address);
    if (existing) {
      if (!existing.spendPublicKey) {
        existing.spendPublicKey = meta.spendPublicKey;
        existing.viewPublicKey = meta.viewPublicKey;
      }
    } else {
      this.wallets.set(address, {
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

  // ---------- Mining ----------

  getMiningStatus() {
    return {
      isMining: this.mining.active,
      minerAddress: this.mining.minerAddress,
      difficulty: this.difficulty.toString(),
      blocksMined: this.mining.blocksMinedThisSession,
      hashRate: this.mining.hashRate,
      blockReward: EMBERCHAIN_CONFIG.blockReward,
      intensity: this.mining.intensity,
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
        batchSizeForIntensity(this.mining.intensity),
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
}
