/**
 * Operator admin authentication.
 *
 * Accepts either:
 *  - x-admin-secret (CHAIN_NODE_INTERNAL_SECRET legacy)
 *  - Relayer wallet signature: x-relayer-address + x-relayer-timestamp + x-relayer-signature
 *    signing EIP-191 message `ember-operator:${timestamp}`
 *
 * Signer must match BRIDGE_RELAYER_PRIVATE_KEY address on the server.
 */

import { Wallet, verifyMessage } from "ethers";

const MAX_AGE_SEC = 600;

function adminSecret(): string {
  return process.env["CHAIN_NODE_INTERNAL_SECRET"] ?? process.env["SESSION_SECRET"] ?? "";
}

function operatorAddress(): string | null {
  const key = process.env["BRIDGE_RELAYER_PRIVATE_KEY"];
  if (!key?.trim()) return null;
  try {
    const normalized = key.trim().startsWith("0x") ? key.trim() : `0x${key.trim()}`;
    return new Wallet(normalized).address.toLowerCase();
  } catch {
    return null;
  }
}

function relayerHeaders(req: { headers: Record<string, unknown> }): {
  address?: string;
  timestamp?: string;
  signature?: string;
} {
  const h = req.headers;
  return {
    address: typeof h["x-relayer-address"] === "string" ? h["x-relayer-address"] : undefined,
    timestamp: typeof h["x-relayer-timestamp"] === "string" ? h["x-relayer-timestamp"] : undefined,
    signature: typeof h["x-relayer-signature"] === "string" ? h["x-relayer-signature"] : undefined,
  };
}

function verifyRelayerSignature(
  address: string,
  timestamp: string,
  signature: string,
): boolean {
  const expected = operatorAddress();
  if (!expected) return false;
  if (address.toLowerCase() !== expected) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_AGE_SEC) return false;

  try {
    const recovered = verifyMessage(`ember-operator:${timestamp}`, signature);
    return recovered.toLowerCase() === expected;
  } catch {
    return false;
  }
}

export function isOperator(req: { headers: Record<string, unknown> }): boolean {
  const secret = adminSecret();
  const auth = req.headers["x-admin-secret"];
  if (secret && typeof auth === "string" && auth === secret) return true;

  const { address, timestamp, signature } = relayerHeaders(req);
  if (address && timestamp && signature) {
    return verifyRelayerSignature(address, timestamp, signature);
  }

  return false;
}

export function operatorAddressOrNull(): string | null {
  return operatorAddress();
}
