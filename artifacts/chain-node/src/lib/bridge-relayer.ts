/**
 * Automated EMBR ↔ Base bridge relayer (file-backed bridge-store).
 * Runs on the seed server — no PostgreSQL required for bridging.
 */

import { Contract, Interface, JsonRpcProvider, Wallet } from "ethers";
import { chain } from "./chain";
import { logger } from "./logger";
import {
  createBridgeEvent,
  getBridgeEventByNonce,
  listPendingByDirection,
  markBridgeFailed,
  markBridgeRelayed,
  recordBridgeAttempt,
  setBridgeTxHashDst,
  type BridgeEvent,
} from "./bridge-store";

const EMBER_BRIDGE_ABI = [
  "function releaseEMBR(address recipient, uint256 amount, uint256 nonce) external",
  "function usedNonces(uint256 nonce) view returns (bool)",
];

const EMBERCHAIN_BRIDGE_ABI = [
  "event BridgeOut(address indexed sender, string embrRecipient, uint256 amount, uint256 indexed nonce)",
  "function bridgeIn(address recipient, uint256 amount, uint256 nonce) external",
];

/** Prevent concurrent relay attempts for the same bridge nonce in this process. */
const relayingNonces = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getConfig() {
  const nodeUrl = (process.env.NODE_URL ?? process.env.CHAIN_NODE_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
  return {
    relayerKey: (process.env.BRIDGE_RELAYER_PRIVATE_KEY ?? "").trim(),
    baseRpcUrl: (process.env.BASE_RPC_URL ?? "https://mainnet.base.org").trim(),
    embrRpcUrl: (process.env.EMBR_RPC_URL ?? `${nodeUrl}/api/rpc`).trim(),
    emberBridgeAddress: (process.env.EMBER_BRIDGE_ADDRESS ?? "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4").toLowerCase(),
    emberchainBridgeAddress: (process.env.EMBERCHAIN_BRIDGE_ADDRESS ?? "0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4").toLowerCase(),
  };
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  max = 5,
  isFatal?: (err: unknown) => boolean,
): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= max; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (isFatal?.(err)) throw err;
      logger.warn({ label, attempt: i, err: (err as Error).message }, "[bridge-relayer] retry");
      if (i < max) await sleep(Math.min(1000 * 2 ** (i - 1), 30_000));
    }
  }
  throw last;
}

function isNonceAlreadyUsed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("nonce already used");
}

function isReleaseEmbrPermanent(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    isNonceAlreadyUsed(err)
    || msg.includes("insufficient escrow")
    || msg.includes("caller is not the relayer")
    || msg.includes("zero recipient")
    || msg.includes("zero amount")
    || msg.includes("transfer failed")
  );
}

type TxWaitResult =
  | { kind: "success" }
  | { kind: "failed"; error: string }
  | { kind: "pending" };

/** Poll one tx until mined, failed, or deadline — never submits a replacement. */
async function waitForMinedTx(hash: string, timeoutMs = 600_000): Promise<TxWaitResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = await chain.getTransaction(hash);
    if (tx && tx.status !== "pending") {
      if (tx.status === "success") return { kind: "success" };
      return { kind: "failed", error: tx.error ?? "transaction failed" };
    }
    await sleep(2_000);
  }
  return { kind: "pending" };
}

async function isBridgeNonceReleasedOnChain(
  embrProvider: JsonRpcProvider,
  emberBridgeAddress: string,
  nonce: string,
): Promise<boolean> {
  try {
    const contract = new Contract(emberBridgeAddress, EMBER_BRIDGE_ABI, embrProvider);
    return Boolean(await contract.usedNonces(BigInt(nonce)));
  } catch (err) {
    logger.warn({ nonce, err: (err as Error).message }, "[bridge-relayer] usedNonces check failed");
    return false;
  }
}

async function runEmbrToBaseLoop(
  baseWallet: Wallet,
  emberchainBridgeAddress: string,
  stop: { stopped: boolean },
): Promise<void> {
  const contract = new Contract(emberchainBridgeAddress, EMBERCHAIN_BRIDGE_ABI, baseWallet);
  logger.info("[bridge-relayer] EMBR→Base loop started");

  while (!stop.stopped) {
    const pending = await listPendingByDirection("embr_to_base");
    for (const event of pending) {
      if (stop.stopped) break;
      try {
        if (event.txHashSrc) {
          const src = await chain.getTransaction(event.txHashSrc);
          if (
            src?.status === "failed"
            || (src?.status === "pending" && chain.isOrphanedPending(event.txHashSrc))
          ) {
            await markBridgeFailed(
              event.nonce,
              event.direction,
              src?.error ?? "Source lock transaction failed or orphaned",
            );
            continue;
          }
          if (!src || src.status !== "success") continue;
        }

        const txHash = await withRetry(
          `bridgeIn(${event.nonce})`,
          async () => {
            const tx = await contract.bridgeIn(event.recipient, BigInt(event.amount), BigInt(event.nonce));
            const receipt = await tx.wait(1);
            if (!receipt || receipt.status === 0) throw new Error("bridgeIn reverted");
            return receipt.hash as string;
          },
          5,
          isNonceAlreadyUsed,
        );
        await markBridgeRelayed(event.nonce, "embr_to_base", txHash);
        logger.info({ nonce: event.nonce, txHash }, "[bridge-relayer] EMBR→Base relayed");
      } catch (err) {
        if (isNonceAlreadyUsed(err)) {
          await markBridgeRelayed(event.nonce, "embr_to_base");
          logger.warn(
            { nonce: event.nonce },
            "[bridge-relayer] nonce already released on Base — marking relayed",
          );
          continue;
        }
        logger.error({ nonce: event.nonce, err: (err as Error).message }, "[bridge-relayer] EMBR→Base failed");
      }
    }
    await sleep(4_000);
  }
}

async function relayBaseToEmbr(
  event: BridgeEvent,
  emberBridgeAddress: string,
  relayerKey: string,
  embrProvider: JsonRpcProvider,
): Promise<void> {
  if (relayingNonces.has(event.nonce)) return;
  relayingNonces.add(event.nonce);

  try {
    const fresh = await getBridgeEventByNonce(event.nonce, "base_to_embr");
    if (!fresh || fresh.status !== "pending") return;

    if (await isBridgeNonceReleasedOnChain(embrProvider, emberBridgeAddress, fresh.nonce)) {
      await markBridgeRelayed(fresh.nonce, "base_to_embr");
      logger.info({ nonce: fresh.nonce }, "[bridge-relayer] nonce already released on EMBR — marking relayed");
      return;
    }

    const iface = new Interface(EMBER_BRIDGE_ABI);
    const calldata = iface.encodeFunctionData("releaseEMBR", [
      fresh.recipient,
      BigInt(fresh.amount),
      BigInt(fresh.nonce),
    ]);

    let txHash = fresh.txHashDst;

    if (txHash) {
      const outcome = await waitForMinedTx(txHash, 120_000);
      if (outcome.kind === "success") {
        await markBridgeRelayed(fresh.nonce, "base_to_embr", txHash);
        logger.info({ nonce: fresh.nonce, txHash }, "[bridge-relayer] Base→EMBR relayed (existing tx)");
        return;
      }
      if (outcome.kind === "pending") {
        logger.info({ nonce: fresh.nonce, txHash }, "[bridge-relayer] releaseEMBR still pending — waiting");
        return;
      }
      const err = new Error(outcome.error);
      if (isNonceAlreadyUsed(err)) {
        await markBridgeRelayed(fresh.nonce, "base_to_embr", txHash);
        logger.warn({ nonce: fresh.nonce, txHash }, "[bridge-relayer] releaseEMBR nonce already used — marking relayed");
        return;
      }
      if (isReleaseEmbrPermanent(err)) {
        await recordBridgeAttempt(fresh.nonce, "base_to_embr", outcome.error);
        logger.error({ nonce: fresh.nonce, txHash, err: outcome.error }, "[bridge-relayer] releaseEMBR permanently failed");
        return;
      }
      txHash = null;
    }

    const stored = await chain.submitTransaction({
      fromPrivateKey: relayerKey,
      to: emberBridgeAddress,
      value: "0",
      data: calldata,
      gasLimit: "300000",
    });
    txHash = stored.hash;
    await setBridgeTxHashDst(fresh.nonce, "base_to_embr", txHash);
    logger.info({ nonce: fresh.nonce, txHash }, "[bridge-relayer] releaseEMBR submitted");

    const outcome = await waitForMinedTx(txHash, 600_000);
    if (outcome.kind === "success") {
      await markBridgeRelayed(fresh.nonce, "base_to_embr", txHash);
      logger.info({ nonce: fresh.nonce, txHash }, "[bridge-relayer] Base→EMBR relayed");
      return;
    }
    if (outcome.kind === "pending") {
      logger.info({ nonce: fresh.nonce, txHash }, "[bridge-relayer] releaseEMBR pending in mempool — will poll next loop");
      return;
    }

    const err = new Error(outcome.error);
    if (isNonceAlreadyUsed(err)) {
      await markBridgeRelayed(fresh.nonce, "base_to_embr", txHash);
      return;
    }
    if (isReleaseEmbrPermanent(err)) {
      await recordBridgeAttempt(fresh.nonce, "base_to_embr", outcome.error);
      logger.error({ nonce: fresh.nonce, txHash, err: outcome.error }, "[bridge-relayer] releaseEMBR permanently failed");
      return;
    }
    await recordBridgeAttempt(fresh.nonce, "base_to_embr", outcome.error);
    logger.warn({ nonce: fresh.nonce, txHash, err: outcome.error }, "[bridge-relayer] releaseEMBR failed — will retry");
  } catch (err) {
    const msg = (err as Error).message;
    if (isNonceAlreadyUsed(err)) {
      await markBridgeRelayed(event.nonce, "base_to_embr");
      return;
    }
    if (isReleaseEmbrPermanent(err)) {
      await recordBridgeAttempt(event.nonce, "base_to_embr", msg);
    } else {
      await recordBridgeAttempt(event.nonce, "base_to_embr", msg);
    }
    logger.error({ nonce: event.nonce, err: msg }, "[bridge-relayer] Base→EMBR relay error");
  } finally {
    relayingNonces.delete(event.nonce);
  }
}

async function runBaseToEmbrLoop(
  baseProvider: JsonRpcProvider,
  embrProvider: JsonRpcProvider,
  emberchainBridgeAddress: string,
  emberBridgeAddress: string,
  relayerKey: string,
  stop: { stopped: boolean },
): Promise<void> {
  const iface = new Interface(EMBERCHAIN_BRIDGE_ABI);
  const topic = iface.getEvent("BridgeOut")!.topicHash;
  let fromBlock = Math.max(0, (await baseProvider.getBlockNumber()) - 7200);
  logger.info({ fromBlock }, "[bridge-relayer] Base→EMBR loop started");

  while (!stop.stopped) {
    try {
      const toBlock = await baseProvider.getBlockNumber();
      if (toBlock > fromBlock) {
        for (let chunk = fromBlock; chunk <= toBlock; chunk += 500) {
          const chunkEnd = Math.min(chunk + 499, toBlock);
          const logs = await baseProvider.getLogs({
            address: emberchainBridgeAddress,
            topics: [topic],
            fromBlock: chunk,
            toBlock: chunkEnd,
          });
          for (const log of logs) {
            const parsed = iface.parseLog(log);
            if (!parsed) continue;
            await createBridgeEvent({
              nonce: (parsed.args[3] as bigint).toString(),
              direction: "base_to_embr",
              sender: (parsed.args[0] as string).toLowerCase(),
              recipient: parsed.args[1] as string,
              amount: (parsed.args[2] as bigint).toString(),
              txHashSrc: log.transactionHash,
            });
          }
        }
        fromBlock = toBlock + 1;
      }

      const pending = await listPendingByDirection("base_to_embr");
      for (const event of pending) {
        if (stop.stopped) break;
        await relayBaseToEmbr(event, emberBridgeAddress, relayerKey, embrProvider);
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "[bridge-relayer] Base→EMBR poll error");
    }
    await sleep(12_000);
  }
}

let handle: { stop: () => void } | null = null;

export function startBridgeRelayer(): { stop: () => void } {
  if (handle) return handle;

  if (process.env.BRIDGE_RELAYER_ENABLED === "false") {
    logger.info("[bridge-relayer] disabled (BRIDGE_RELAYER_ENABLED=false)");
    return { stop() {} };
  }

  const cfg = getConfig();
  if (!cfg.relayerKey) {
    logger.info("[bridge-relayer] disabled — set BRIDGE_RELAYER_PRIVATE_KEY to enable");
    console.log("[bridge-relayer] disabled — set BRIDGE_RELAYER_PRIVATE_KEY to enable");
    return { stop() {} };
  }

  const stop = { stopped: false };
  const baseProvider = new JsonRpcProvider(cfg.baseRpcUrl);
  const embrProvider = new JsonRpcProvider(cfg.embrRpcUrl);
  const baseWallet = new Wallet(cfg.relayerKey, baseProvider);

  void runEmbrToBaseLoop(baseWallet, cfg.emberchainBridgeAddress, stop).catch((err) =>
    logger.error({ err: (err as Error).message }, "[bridge-relayer] EMBR→Base loop crashed"),
  );

  void runBaseToEmbrLoop(
    baseProvider,
    embrProvider,
    cfg.emberchainBridgeAddress,
    cfg.emberBridgeAddress,
    cfg.relayerKey,
    stop,
  ).catch((err) =>
    logger.error({ err: (err as Error).message }, "[bridge-relayer] Base→EMBR loop crashed"),
  );

  logger.info("[bridge-relayer] started");
  console.log("[bridge-relayer] started");
  handle = {
    stop: () => {
      stop.stopped = true;
      handle = null;
    },
  };
  return handle;
}

export function stopBridgeRelayer(): void {
  handle?.stop();
}
