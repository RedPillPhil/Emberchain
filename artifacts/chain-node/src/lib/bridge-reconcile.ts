/**
 * Reconcile pending bridge rows against source chain tx state.
 * Marks bridges failed when the lock tx failed or was orphaned (not in mempool).
 */

import { chain } from "./chain";
import {
  listPendingByDirection,
  markBridgeFailed,
  type BridgeEvent,
  type BridgeStatus,
} from "./bridge-store";
import { logger } from "./logger";

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

  return event.status;
}

/** Run on startup and periodically — auto-fails stuck bridge rows. */
export async function reconcileAllPendingBridges(): Promise<number> {
  await chain.whenReady();
  const pending = [
    ...(await listPendingByDirection("embr_to_base")),
    ...(await listPendingByDirection("base_to_embr")),
  ];
  let failed = 0;
  for (const event of pending) {
    const before = event.status;
    const after = await resolveBridgeStatus(event);
    if (before === "pending" && after === "failed") failed++;
  }
  if (failed > 0) {
    logger.info({ failed }, "[bridge-reconcile] marked orphaned/failed bridge events");
  }
  return failed;
}
