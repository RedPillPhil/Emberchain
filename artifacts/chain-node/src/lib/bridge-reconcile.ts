/**
 * Reconcile pending bridge rows against source chain tx state.
 * Marks bridges failed when the lock tx failed or was orphaned (not in mempool).
 */

import { Interface } from "ethers";
import { chain } from "./chain";
import {
  listPendingByDirection,
  markBridgeFailed,
  markBridgeRelayed,
  type BridgeEvent,
  type BridgeStatus,
} from "./bridge-store";
import { logger } from "./logger";

const EMBER_BRIDGE_ADDRESS = (
  process.env.EMBER_BRIDGE_ADDRESS ?? "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4"
).toLowerCase();

const embrBridgeIface = new Interface([
  "function usedNonces(uint256 nonce) view returns (bool)",
]);

async function isEmbrBridgeNonceUsed(nonce: string): Promise<boolean> {
  try {
    const data = embrBridgeIface.encodeFunctionData("usedNonces", [BigInt(nonce)]);
    const result = await chain.callContract({ to: EMBER_BRIDGE_ADDRESS, data });
    return result.success && BigInt(result.returnData) !== 0n;
  } catch {
    return false;
  }
}

export async function resolveBridgeStatus(event: BridgeEvent): Promise<BridgeStatus> {
  if (event.status !== "pending") return event.status;
  if (!event.txHashSrc) return event.status;

  if (event.direction === "embr_to_base") {
    const tx = await chain.getTransaction(event.txHashSrc);
    if (!tx) return event.status;

    if (tx.status === "failed") {
      const errorMsg = tx.error ?? "Source transaction failed";
      await markBridgeFailed(event.nonce, event.direction, errorMsg);
      event.status = "failed";
      event.errorMsg = errorMsg;
      return "failed";
    }

    if (tx.status === "pending" && chain.isOrphanedPending(event.txHashSrc)) {
      const errorMsg = "Source lock orphaned (not in mempool — never confirmed)";
      await markBridgeFailed(event.nonce, event.direction, errorMsg);
      event.status = "failed";
      event.errorMsg = errorMsg;
      return "failed";
    }
  }

  if (event.direction === "base_to_embr" && await isEmbrBridgeNonceUsed(event.nonce)) {
    await markBridgeRelayed(event.nonce, event.direction);
    event.status = "relayed";
    return "relayed";
  }

  return event.status;
}

/** Run on startup and periodically — auto-fails stuck bridge rows. */
export async function reconcileAllPendingBridges(): Promise<number> {
  await chain.whenReady();
  const pending = [
    ...(await listPendingByDirection("embr_to_base")),
    ...(await listPendingByDirection("base_to_embr")),
  ];
  let changed = 0;
  for (const event of pending) {
    const before = event.status;
    const after = await resolveBridgeStatus(event);
    if (before === "pending" && after !== "pending") changed++;
  }
  if (changed > 0) {
    logger.info({ changed }, "[bridge-reconcile] reconciled pending bridge events");
  }
  return changed;
}
