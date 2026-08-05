/**
 * Chain Adapter System — Static Pre-Generated Bridge Addresses
 *
 * Two environment secrets cover every chain type the site accepts:
 *
 *  BRIDGE_UTXO_PRIVATE_KEY  (secp256k1, 32-byte hex, no 0x)
 *    Derives addresses for ALL secp256k1 chains:
 *      EVM           — computeAddress → 0x… hex
 *      BTC legacy    — P2PKH version 0x00         → 1…
 *      BTC SegWit    — P2WPKH bech32 HRP "bc"     → bc1…
 *      LTC legacy    — P2PKH version 0x30         → L…
 *      LTC SegWit    — P2WPKH bech32 HRP "ltc"    → ltc1…
 *      DOGE          — P2PKH version 0x1E         → D…
 *      DASH          — P2PKH version 0x4C         → X…
 *      ZEC t-addr    — 2-byte prefix [0x1C,0xB8]  → t1…
 *
 *  BRIDGE_ED25519_SEED  (32-byte hex)
 *    Derives the ed25519 public key for Monero-compatible chains.
 *    The hex pubkey is stored as the deposit address; operators
 *    re-encode it into the native address format (Monero base58, etc.)
 *    using the seed stored in the secret.
 *
 * Addresses are derived once at module load and cached in STATIC_ADDRS.
 * The server never generates per-launch keys; every launch of the same
 * chain type gets the same deposit address.
 */

import { createHash, createPrivateKey, createPublicKey } from "crypto";
import { SigningKey, computeAddress } from "ethers";

// ── Base58 / Base58Check ──────────────────────────────────────────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf: Buffer): string {
  let n = BigInt("0x" + buf.toString("hex"));
  let result = "";
  while (n > 0n) {
    result = BASE58_ALPHABET[Number(n % 58n)] + result;
    n = n / 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    result = "1" + result;
  }
  return result;
}

function base58Check(payload: Buffer): string {
  const h1 = createHash("sha256").update(payload).digest();
  const h2 = createHash("sha256").update(h1).digest();
  return base58Encode(Buffer.concat([payload, h2.slice(0, 4)]));
}

// ── HASH160 ───────────────────────────────────────────────────────────────────

function hash160(pubKeyHex: string): Buffer {
  const raw = Buffer.from(pubKeyHex.replace(/^0x/, ""), "hex");
  const sha256 = createHash("sha256").update(raw).digest();
  return createHash("ripemd160").update(sha256).digest();
}

// ── Bech32 (P2WPKH / native SegWit) ──────────────────────────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(vals: number[]): number {
  let c = 1;
  for (const v of vals) {
    const c0 = c >>> 25;
    c = ((c & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((c0 >> i) & 1) c ^= BECH32_GEN[i];
  }
  return c ^ 1;
}

function bech32HrpExpand(hrp: string): number[] {
  const r: number[] = [];
  for (let i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) >> 5);
  r.push(0);
  for (let i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) & 31);
  return r;
}

function to5bit(data: Buffer): number[] {
  const out: number[] = [];
  let acc = 0, bits = 0;
  for (const v of data) {
    acc = (acc << 8) | v;
    bits += 8;
    while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

/** Encode a P2WPKH address (witness version 0 + 20-byte HASH160). */
function bech32P2WPKH(hrp: string, pubKeyHash: Buffer): string {
  const data = [0, ...to5bit(pubKeyHash)]; // witness version 0 + converted hash
  const checksum = [0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod([...bech32HrpExpand(hrp), ...data, ...checksum]);
  const cs = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...cs].map(d => BECH32_CHARSET[d]).join("");
}

// ── ed25519 public key from raw seed ──────────────────────────────────────────

/**
 * Derive the 32-byte ed25519 public key from a 32-byte seed (hex).
 * Uses Node.js built-in crypto — no external library required.
 */
function ed25519PubKey(seedHex: string): string {
  const seed = Buffer.from(seedHex.replace(/^0x/, ""), "hex");
  if (seed.length !== 32) throw new Error("ed25519 seed must be exactly 32 bytes");
  // PKCS#8 DER wrapper for ed25519: standard 16-byte ASN.1 header + seed
  const pkcs8 = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  const privKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const pubKey  = createPublicKey(privKey);
  const spki    = pubKey.export({ type: "spki", format: "der" }) as Buffer;
  // SPKI DER for ed25519: 12-byte ASN.1 header + 32-byte pubkey
  return spki.slice(12).toString("hex");
}

// ── P2PKH version bytes for known UTXO networks ───────────────────────────────

/**
 * These are the standard network (version) bytes used in Base58Check P2PKH
 * addresses for each coin.  The same secp256k1 private key produces a
 * different-looking address on each network purely because of this prefix byte.
 */
export const UTXO_NETWORK_VERSIONS: Record<string, number[]> = {
  bitcoin:  [0x00],         // 1…
  litecoin: [0x30],         // L…
  dogecoin: [0x1E],         // D…
  dash:     [0x4C],         // X…
  zcash:    [0x1C, 0xB8],   // t1… (2-byte prefix)
  other:    [0x00],         // falls back to Bitcoin-format
};

export const UTXO_BECH32_HRPS: Record<string, string> = {
  bitcoin:  "bc",
  litecoin: "ltc",
  dogecoin: "doge", // DOGE has no standard SegWit; kept for completeness
  other:    "bc",
};

// ── Static address map (built once at module load) ────────────────────────────

export type StaticAddrKey =
  | "evm"
  | "secp256k1:base58:bitcoin"
  | "secp256k1:base58:litecoin"
  | "secp256k1:base58:dogecoin"
  | "secp256k1:base58:dash"
  | "secp256k1:base58:zcash"
  | "secp256k1:base58:other"
  | "secp256k1:bech32:bitcoin"
  | "secp256k1:bech32:litecoin"
  | "secp256k1:bech32:other"
  | "ed25519";

let _addrs: Partial<Record<StaticAddrKey, string>> | null = null;

function buildAddresses(): Partial<Record<StaticAddrKey, string>> {
  const addrs: Partial<Record<StaticAddrKey, string>> = {};

  // ── secp256k1 (BRIDGE_UTXO_PRIVATE_KEY) ──────────────────────────────────
  const rawKey = (process.env["BRIDGE_UTXO_PRIVATE_KEY"] ?? "").replace(/^0x/, "");
  if (rawKey) {
    const sk            = new SigningKey("0x" + rawKey);
    const compressedPub = sk.compressedPublicKey; // 0x + 33 bytes
    const pkh           = hash160(compressedPub);

    // EVM
    addrs["evm"] = computeAddress(sk.publicKey);

    // P2PKH variants
    for (const [network, versions] of Object.entries(UTXO_NETWORK_VERSIONS)) {
      const versionBuf = Buffer.from(versions);
      const key: StaticAddrKey = `secp256k1:base58:${network}` as StaticAddrKey;
      addrs[key] = base58Check(Buffer.concat([versionBuf, pkh]));
    }

    // Native SegWit (bech32 P2WPKH)
    addrs["secp256k1:bech32:bitcoin"]  = bech32P2WPKH("bc",   pkh);
    addrs["secp256k1:bech32:litecoin"] = bech32P2WPKH("ltc",  pkh);
    addrs["secp256k1:bech32:other"]    = bech32P2WPKH("bc",   pkh); // BTC format fallback
  }

  // ── ed25519 (BRIDGE_ED25519_SEED) ─────────────────────────────────────────
  const ed25519Seed = (process.env["BRIDGE_ED25519_SEED"] ?? "").replace(/^0x/, "");
  if (ed25519Seed) {
    try {
      addrs["ed25519"] = ed25519PubKey(ed25519Seed);
    } catch (err) {
      // Only warn — don't crash the server for a missing/invalid ed25519 seed
      console.warn("[chain-adapters] ed25519 pubkey derivation failed:", err);
    }
  }

  return addrs;
}

/** Lazily-initialised static address map. */
export function getStaticAddrs(): Partial<Record<StaticAddrKey, string>> {
  if (!_addrs) _addrs = buildAddresses();
  return _addrs;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BridgeWallet {
  address: string;
  type: "evm_static" | "utxo_static" | "ed25519_static" | "evm_derived" | "utxo_derived" | "ed25519_derived" | "unknown";
  note: string;
}

/** Encode a secp256k1 private key into a native deposit address. */
export function encodeSecp256k1DepositAddress(
  privateKeyHex: string,
  addressFormat: string,
  utxoNetwork: string,
): string {
  const sk = new SigningKey("0x" + privateKeyHex.replace(/^0x/, ""));
  const pkh = hash160(sk.compressedPublicKey);

  if (addressFormat === "hex") {
    return computeAddress(sk.publicKey);
  }

  if (addressFormat === "bech32") {
    const net = ["bitcoin", "litecoin"].includes(utxoNetwork) ? utxoNetwork : "other";
    const hrp = UTXO_BECH32_HRPS[net] ?? "bc";
    return bech32P2WPKH(hrp, pkh);
  }

  const net = Object.keys(UTXO_NETWORK_VERSIONS).includes(utxoNetwork) ? utxoNetwork : "other";
  const versions = UTXO_NETWORK_VERSIONS[net] ?? [0x00];
  return base58Check(Buffer.concat([Buffer.from(versions), pkh]));
}

/** Encode an ed25519 seed into a deposit address (hex pubkey or Solana-style base58). */
export function encodeEd25519DepositAddress(seedHex: string, addressFormat: string): string {
  const pubHex = ed25519PubKey(seedHex);
  if (addressFormat === "base58") {
    return base58Encode(Buffer.from(pubHex, "hex"));
  }
  return pubHex;
}

/**
 * Look up the pre-generated static bridge address for a given chain configuration.
 *
 * @param chainType     'evm' | 'utxo' | 'privacy' | 'custom'
 * @param cryptography  'secp256k1' | 'ed25519' | 'other'
 * @param addressFormat 'hex' | 'base58' | 'bech32' | 'custom'
 * @param utxoNetwork   For base58/bech32 secp256k1 chains: 'bitcoin' | 'litecoin' |
 *                      'dogecoin' | 'dash' | 'zcash' | 'other'
 */
export function getStaticBridgeAddress(
  chainType: string,
  cryptography: string,
  addressFormat: string,
  utxoNetwork = "bitcoin",
): BridgeWallet {
  const addrs = getStaticAddrs();

  // EVM: secp256k1 + hex address (or explicit chain_type=evm)
  if (chainType === "evm" || (cryptography === "secp256k1" && addressFormat === "hex")) {
    const address = addrs["evm"];
    if (!address) throw new Error("BRIDGE_UTXO_PRIVATE_KEY not configured — cannot resolve EVM bridge address.");
    return {
      address,
      type: "evm_static",
      note: "Pre-generated EVM address derived from BRIDGE_UTXO_PRIVATE_KEY.",
    };
  }

  // ed25519 chains (Monero, etc.)
  if (cryptography === "ed25519") {
    const address = addrs["ed25519"];
    if (!address) throw new Error("BRIDGE_ED25519_SEED not configured — cannot resolve ed25519 bridge address.");
    return {
      address,
      type: "ed25519_static",
      note: "Pre-generated ed25519 public key (hex). Encode into the chain's native address format to share with users.",
    };
  }

  // secp256k1 + bech32 (native SegWit)
  if (cryptography === "secp256k1" && addressFormat === "bech32") {
    const net   = ["bitcoin", "litecoin"].includes(utxoNetwork) ? utxoNetwork : "other";
    const key   = `secp256k1:bech32:${net}` as StaticAddrKey;
    const address = addrs[key];
    if (!address) throw new Error("BRIDGE_UTXO_PRIVATE_KEY not configured — cannot resolve bech32 bridge address.");
    return {
      address,
      type: "utxo_static",
      note: `Pre-generated native SegWit address for ${utxoNetwork} (bech32 P2WPKH).`,
    };
  }

  // secp256k1 + base58 (P2PKH for Bitcoin-family coins)
  if (cryptography === "secp256k1" && addressFormat === "base58") {
    const net    = Object.keys(UTXO_NETWORK_VERSIONS).includes(utxoNetwork) ? utxoNetwork : "other";
    const key    = `secp256k1:base58:${net}` as StaticAddrKey;
    const address = addrs[key];
    if (!address) throw new Error("BRIDGE_UTXO_PRIVATE_KEY not configured — cannot resolve UTXO bridge address.");
    return {
      address,
      type: "utxo_static",
      note: `Pre-generated P2PKH address for ${utxoNetwork} (Base58Check).`,
    };
  }

  // Fallback: custom or unknown — use EVM address (server can still receive)
  const address = addrs["evm"] ?? addrs["secp256k1:base58:bitcoin"];
  if (!address) throw new Error("No bridge addresses configured — set BRIDGE_UTXO_PRIVATE_KEY.");
  return {
    address,
    type: "unknown",
    note: "Custom chain — using secp256k1 address as fallback deposit target. Confirm address format is valid for your chain.",
  };
}

/** Print a summary of all derived addresses to the server log on startup. */
export function logStaticAddresses(log: (msg: string) => void): void {
  const addrs = getStaticAddrs();
  const lines: string[] = ["[chain-adapters] Pre-generated bridge addresses:"];
  const labels: Partial<Record<StaticAddrKey, string>> = {
    "evm":                       "EVM (ETH/BSC/Arbitrum…)",
    "secp256k1:base58:bitcoin":  "BTC legacy P2PKH",
    "secp256k1:bech32:bitcoin":  "BTC native SegWit (bc1…)",
    "secp256k1:base58:litecoin": "LTC legacy P2PKH",
    "secp256k1:bech32:litecoin": "LTC native SegWit (ltc1…)",
    "secp256k1:base58:dogecoin": "DOGE P2PKH",
    "secp256k1:base58:dash":     "DASH P2PKH",
    "secp256k1:base58:zcash":    "ZEC t-address",
    "ed25519":                   "ed25519 pubkey (Monero-compatible, hex)",
  };
  for (const [key, label] of Object.entries(labels)) {
    const addr = addrs[key as StaticAddrKey];
    lines.push(`  ${label.padEnd(38)} ${addr ?? "(not configured)"}`);
  }
  log(lines.join("\n"));
}

// Keep old names as aliases so any other callers don't break
/** @deprecated Use getStaticBridgeAddress instead */
export function generateBridgeWallet(
  chainType: string, cryptography: string, addressFormat: string
): BridgeWallet & { privateKeyRaw?: string } {
  return getStaticBridgeAddress(chainType, cryptography, addressFormat);
}
/** @deprecated Use getStaticBridgeAddress instead */
export const deriveBridgeWallet = generateBridgeWallet;
