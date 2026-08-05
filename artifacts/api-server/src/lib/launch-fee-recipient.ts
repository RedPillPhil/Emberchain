/**
 * Launch fee recipient — must be the relayer wallet so listing fees fund wEMBR/ETH LP.
 *
 * Listing fees are plain ETH transfers on Base. They must land in the same wallet
 * that deploys wrapped tokens and calls Uniswap addLiquidityETH (BRIDGE_RELAYER_PRIVATE_KEY).
 */

import { ethers } from "ethers";
import { logger } from "./logger";

/** Address that receives launch fees (derived from BRIDGE_RELAYER_PRIVATE_KEY). */
export function getLaunchFeeRecipientAddress(): string | null {
  const key = process.env["BRIDGE_RELAYER_PRIVATE_KEY"];
  if (!key) return null;
  try {
    const wallet = new ethers.Wallet(key.startsWith("0x") ? key : "0x" + key);
    return wallet.address;
  } catch {
    return null;
  }
}

/**
 * Addresses we accept for fee payment verification.
 * Primary: relayer wallet. Optional legacy TOKEN_LAUNCH_FEE_ADDRESS during migration.
 */
export function getAcceptedLaunchFeeRecipients(): string[] {
  const relayer = getLaunchFeeRecipientAddress()?.toLowerCase();
  const legacy = (process.env["TOKEN_LAUNCH_FEE_ADDRESS"] ?? "").toLowerCase();
  const out = new Set<string>();
  if (relayer) out.add(relayer);
  if (legacy && legacy !== relayer) out.add(legacy);
  return [...out];
}

export function isAcceptedLaunchFeeRecipient(address: string): boolean {
  const target = address.toLowerCase();
  return getAcceptedLaunchFeeRecipients().some((a) => a === target);
}

/** Warn at startup if legacy fee address diverges from relayer (fees won't reach LP). */
export function validateLaunchFeeRouting(): void {
  const relayer = getLaunchFeeRecipientAddress()?.toLowerCase();
  const legacy = (process.env["TOKEN_LAUNCH_FEE_ADDRESS"] ?? "").toLowerCase();
  if (!relayer) {
    logger.warn("[launch-fee] BRIDGE_RELAYER_PRIVATE_KEY not set — launch fees and LP disabled");
    return;
  }
  if (legacy && legacy !== relayer) {
    logger.warn(
      { relayer, legacyFeeAddress: legacy },
      "[launch-fee] TOKEN_LAUNCH_FEE_ADDRESS != relayer wallet — set TOKEN_LAUNCH_FEE_ADDRESS to relayer address or unset it. Fees sent to legacy address will NOT fund wEMBR/ETH LP.",
    );
  } else {
    logger.info({ relayer }, "[launch-fee] listing fees route to relayer → wEMBR/ETH LP");
  }
}
