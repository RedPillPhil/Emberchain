/**
 * Per-launch escrow wallet derivation.
 *
 * Each token launch gets a unique deposit address derived from the platform
 * master key + launch ID. The private key is encrypted at rest; only the
 * public deposit address is shown to users.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from "crypto";
import { SigningKey, computeAddress } from "ethers";
import {
  encodeEd25519DepositAddress,
  encodeSecp256k1DepositAddress,
  type BridgeWallet,
} from "./chain-adapters/index";

function masterMaterial(envKey: string): Buffer {
  const raw = (process.env[envKey] ?? "").replace(/^0x/, "");
  if (!raw || raw.length !== 64) {
    throw new Error(`${envKey} must be a 32-byte hex string`);
  }
  return Buffer.from(raw, "hex");
}

function deriveSecp256k1PrivateKey(launchId: string): string {
  const master = masterMaterial("BRIDGE_UTXO_PRIVATE_KEY");
  return createHmac("sha256", master)
    .update(`ember-launch:${launchId}:secp256k1`)
    .digest("hex");
}

function deriveEd25519Seed(launchId: string): string {
  const master = process.env["BRIDGE_ED25519_SEED"]
    ? masterMaterial("BRIDGE_ED25519_SEED")
    : masterMaterial("BRIDGE_UTXO_PRIVATE_KEY");
  return createHmac("sha256", master)
    .update(`ember-launch:${launchId}:ed25519`)
    .digest("hex");
}

function encryptionKey(): Buffer {
  const secret =
    process.env["BRIDGE_WALLET_ENCRYPTION_KEY"] ??
    process.env["BRIDGE_UTXO_PRIVATE_KEY"] ??
    "";
  const raw = secret.replace(/^0x/, "");
  if (!raw) throw new Error("BRIDGE_WALLET_ENCRYPTION_KEY or BRIDGE_UTXO_PRIVATE_KEY required");
  return scryptSync(raw, "ember-launch-wallet-v1", 32);
}

export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export interface LaunchBridgeWallet extends BridgeWallet {
  privateKeyEncrypted: string;
}

export interface LaunchWalletParams {
  launchId: string;
  chainType: string;
  cryptography?: string;
  addressFormat?: string;
  utxoNetwork?: string;
}

/** Chains where escrow address must be set manually by an operator (Monero, custom, etc.). */
export function requiresManualEscrowSetup(params: {
  chainType: string;
  cryptography?: string;
  addressFormat?: string;
}): boolean {
  const chainType = params.chainType.toLowerCase();
  if (chainType === "privacy" || chainType === "custom") return true;
  if (params.cryptography === "other" || params.addressFormat === "custom") return true;
  return false;
}

/** Validate that we can derive a deposit address for this chain configuration. */
export function validateLaunchWalletParams(params: LaunchWalletParams): string | null {
  if (requiresManualEscrowSetup({
    chainType: params.chainType,
    cryptography: params.cryptography,
    addressFormat: params.addressFormat,
  })) {
    return null;
  }

  const crypto = params.cryptography ?? (params.chainType === "evm" ? "secp256k1" : "");
  const format = params.addressFormat ?? (params.chainType === "evm" ? "hex" : "");

  if (params.chainType === "evm") {
    if (!params.cryptography || params.cryptography === "secp256k1") return null;
    return "EVM chains require secp256k1 signing (0x addresses).";
  }

  if (!crypto) return "Select a signing curve for this chain.";
  if (!format) return "Select an address format for this chain.";

  if (crypto === "other" || format === "custom") {
    return "Custom address formats need operator setup — choose privacy/custom chain type or a supported format.";
  }

  if (crypto === "secp256k1" && (format === "base58" || format === "bech32") && !params.utxoNetwork) {
    return "Select which UTXO network prefix to use (Bitcoin, Litecoin, etc.).";
  }

  if (crypto === "ed25519" && format === "custom") {
    return "For ed25519 chains choose hex or base58 (Solana-style).";
  }

  if (params.chainType === "privacy" && crypto !== "ed25519") {
    return "Privacy chains use ed25519 — select ed25519 and an address format.";
  }

  return null;
}

/**
 * Derive a unique escrow deposit address for one launch.
 */
export function deriveLaunchBridgeWallet(params: LaunchWalletParams): LaunchBridgeWallet {
  const validationError = validateLaunchWalletParams(params);
  if (validationError) throw new Error(validationError);

  const chainType = params.chainType.toLowerCase();
  const cryptography = params.cryptography ?? "secp256k1";
  const addressFormat = params.addressFormat ?? "hex";
  const utxoNetwork = params.utxoNetwork ?? "bitcoin";

  if (chainType === "evm" || (cryptography === "secp256k1" && addressFormat === "hex")) {
    const privateKeyHex = deriveSecp256k1PrivateKey(params.launchId);
    const sk = new SigningKey("0x" + privateKeyHex);
    const address = computeAddress(sk.publicKey);
    return {
      address,
      type: "evm_derived",
      note: `Unique EVM escrow address for launch ${params.launchId.slice(0, 8)}… Send native coin here to bridge.`,
      privateKeyEncrypted: encryptSecret(privateKeyHex),
    };
  }

  if (cryptography === "ed25519") {
    const seedHex = deriveEd25519Seed(params.launchId);
    const address = encodeEd25519DepositAddress(seedHex, addressFormat);
    return {
      address,
      type: "ed25519_derived",
      note: `Unique ed25519 escrow address for launch ${params.launchId.slice(0, 8)}…`,
      privateKeyEncrypted: encryptSecret(seedHex),
    };
  }

  if (cryptography === "secp256k1") {
    const privateKeyHex = deriveSecp256k1PrivateKey(params.launchId);
    const address = encodeSecp256k1DepositAddress(privateKeyHex, addressFormat, utxoNetwork);
    const walletType = addressFormat === "bech32" ? "utxo_derived" : "utxo_derived";
    return {
      address,
      type: walletType,
      note: `Unique ${utxoNetwork} escrow address for launch ${params.launchId.slice(0, 8)}…`,
      privateKeyEncrypted: encryptSecret(privateKeyHex),
    };
  }

  throw new Error("Unsupported chain configuration");
}

/** Load secp256k1 private key hex for an EVM escrow wallet. */
export function loadLaunchEvmPrivateKey(encrypted: string): string {
  return decryptSecret(encrypted);
}
