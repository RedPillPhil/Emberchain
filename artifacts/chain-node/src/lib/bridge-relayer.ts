/**
 * Automated EMBR ↔ Base bridge relayer (file-backed bridge-store).
 * Runs on the seed server — no PostgreSQL required for bridging.
 */

import { Contract, Interface, JsonRpcProvider, Wallet } from "ethers";
import { chain } from "./chain";
import { logger } from "./logger";
import {
  createBridgeEvent,
  listPendingByDirection,
  markBridgeFailed,
  markBridgeRelayed,
  type BridgeEvent,
} from "./bridge-store";

const EMBER_BRIDGE_ABI = [
  "function releaseEMBR(address recipient, uint256 amount, uint256 nonce) external",
];

const EMBERCHAIN_BRIDGE_ABI = [
  "event BridgeOut(address indexed sender, string embrRecipient, uint256 amount, uint256 indexed nonce)",
  "function bridgeIn(address recipient, uint256 amount, uint256 nonce) external",
];

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

/**
 * The Base bridge rejects a nonce it has already released.  That is a permanent
 * outcome, not a transient failure: the recipient has their funds and no retry
 * can ever succeed, so the event must leave the pending list instead of being
 * re-attempted every loop forever.
 */
function isNonceAlreadyUsed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("nonce already used");
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
          // Released on Base already — we just don't know which tx did it, so
          // record it relayed without a destination hash rather than retrying.
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
): Promise<void> {
  const iface = new Interface(EMBER_BRIDGE_ABI);
  const calldata = iface.encodeFunctionData("releaseEMBR", [
    event.recipient,
    BigInt(event.amount),
    BigInt(event.nonce),
  ]);

  const txHash = await withRetry(`releaseEMBR(${event.nonce})`, async () => {
    const stored = await chain.submitTransaction({
      fromPrivateKey: relayerKey,
      to: emberBridgeAddress,
      value: "0",
      data: calldata,
      gasLimit: "300000",
    });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const tx = await chain.getTransaction(stored.hash);
      if (tx && tx.status !== "pending") {
        if (tx.status === "failed") throw new Error(tx.error ?? "releaseEMBR failed");
        return stored.hash;
      }
      await sleep(2_000);
    }
    throw new Error(`releaseEMBR tx ${stored.hash} not mined in 90s`);
  });

  await markBridgeRelayed(event.nonce, "base_to_embr", txHash);
  logger.info({ nonce: event.nonce, txHash }, "[bridge-relayer] Base→EMBR relayed");
}

async function runBaseToEmbrLoop(
  baseProvider: JsonRpcProvider,
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
        await relayBaseToEmbr(event, emberBridgeAddress, relayerKey);
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
  const baseWallet = new Wallet(cfg.relayerKey, baseProvider);

  void runEmbrToBaseLoop(baseWallet, cfg.emberchainBridgeAddress, stop).catch((err) =>
    logger.error({ err: (err as Error).message }, "[bridge-relayer] EMBR→Base loop crashed"),
  );

  void runBaseToEmbrLoop(
    baseProvider,
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
