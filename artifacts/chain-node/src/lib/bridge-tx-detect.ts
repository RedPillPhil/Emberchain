/**
 * Detect lockEMBR bridge transactions for auto-mining hooks.
 */

import { ethers } from "ethers";

const LOCK_EMBR_IFACE = new ethers.Interface([
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
]);

const LOCK_SELECTOR = LOCK_EMBR_IFACE.getFunction("lockEMBR")!.selector;

export function emberBridgeAddress(): string {
  return (process.env.EMBER_BRIDGE_ADDRESS ?? "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4").toLowerCase();
}

export function isLockEmbrTransaction(
  to: string | null | undefined,
  data: string | null | undefined,
): boolean {
  if (!to || to.toLowerCase() !== emberBridgeAddress()) return false;
  const calldata = (data && data !== "" ? data : "0x").toLowerCase();
  return calldata.startsWith(LOCK_SELECTOR.toLowerCase());
}
