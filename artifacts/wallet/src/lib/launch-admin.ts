import { Wallet, SigningKey, computeAddress } from "ethers";
import { sha256 } from "ethereum-cryptography/sha256.js";
import { ripemd160 } from "ethereum-cryptography/ripemd160.js";
import { resolveApiServer } from "@/lib/config";

export interface LaunchRecord {
  id: string;
  status: string;
  symbol: string;
  wrapped_symbol?: string;
  token_name?: string;
  chain_name?: string;
  chain_type?: string;
  cryptography?: string;
  address_format?: string;
  utxo_network?: string;
  bridge_wallet_address?: string;
  bridge_wallet_type?: string;
  wrapped_token_address?: string;
  submitter_address?: string;
  error_msg?: string;
  created_at?: string;
}

export interface DerivedBridgeWallets {
  evm: string;
  utxo: Record<string, string>;
  bech32: Record<string, string>;
  note: string;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

const UTXO_VERSIONS: Record<string, number[]> = {
  bitcoin: [0x00],
  litecoin: [0x30],
  dogecoin: [0x1e],
  dash: [0x4c],
  zcash: [0x1c, 0xb8],
  other: [0x00],
};

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function base58Check(versionBytes: number[], payload: Uint8Array): string {
  const body = new Uint8Array(versionBytes.length + payload.length);
  versionBytes.forEach((v, i) => {
    body[i] = v;
  });
  body.set(payload, versionBytes.length);
  const hash1 = sha256(body);
  const hash2 = sha256(hash1);
  const checksum = hash2.slice(0, 4);
  const full = new Uint8Array(body.length + 4);
  full.set(body);
  full.set(checksum, body.length);
  return base58Encode(full);
}

function hash160FromCompressedPub(compressedHex: string): Uint8Array {
  const compressed = Uint8Array.from(Buffer.from(compressedHex.replace(/^0x/, ""), "hex"));
  return ripemd160(sha256(compressed));
}

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

function to5bit(data: Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const v of data) {
    acc = (acc << 8) | v;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

function bech32P2WPKH(hrp: string, pubKeyHash: Uint8Array): string {
  const data = [0, ...to5bit(pubKeyHash)];
  const mod = bech32Polymod([...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]);
  const cs = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...cs].map((d) => BECH32_CHARSET[d]).join("");
}

/** Mirror server-side BRIDGE_UTXO_PRIVATE_KEY derivations in the browser. */
export function deriveBridgeWallets(privateKeyInput: string): DerivedBridgeWallets {
  const normalized = privateKeyInput.startsWith("0x") ? privateKeyInput : `0x${privateKeyInput}`;
  const sk = new SigningKey(normalized);
  const evm = computeAddress(sk.publicKey);
  const pkh = hash160FromCompressedPub(sk.compressedPublicKey);

  const utxo: Record<string, string> = {};
  for (const [network, versions] of Object.entries(UTXO_VERSIONS)) {
    utxo[network] = base58Check(versions, pkh);
  }

  const bech32: Record<string, string> = {
    bitcoin: bech32P2WPKH("bc", pkh),
    litecoin: bech32P2WPKH("ltc", pkh),
  };

  return {
    evm,
    utxo,
    bech32,
    note: "Token launch deposit addresses come from BRIDGE_UTXO_PRIVATE_KEY on the server (not the Base relayer key). Paste that key here if it differs from your relayer login.",
  };
}

export function resolveLaunchDepositAddress(
  wallets: DerivedBridgeWallets,
  launch: LaunchRecord,
): string | undefined {
  const chainType = launch.chain_type ?? "evm";
  const crypto = launch.cryptography ?? "secp256k1";
  const format = launch.address_format ?? "hex";
  const net = launch.utxo_network ?? "bitcoin";

  if (chainType === "evm" || (crypto === "secp256k1" && format === "hex")) return wallets.evm;
  if (crypto === "secp256k1" && format === "bech32") {
    return wallets.bech32[net === "litecoin" ? "litecoin" : "bitcoin"];
  }
  if (crypto === "secp256k1" && format === "base58") {
    return wallets.utxo[Object.hasOwn(wallets.utxo, net) ? net : "other"];
  }
  return wallets.evm;
}

export async function fetchLaunchListings(): Promise<LaunchRecord[]> {
  const base = resolveApiServer();
  if (!base) return [];
  const res = await fetch(`${base}/api/token-launch/listings`);
  if (!res.ok) return [];
  return res.json() as Promise<LaunchRecord[]>;
}

export async function fetchLaunchById(id: string): Promise<LaunchRecord | null> {
  const base = resolveApiServer();
  if (!base) return null;
  const res = await fetch(`${base}/api/token-launch/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json() as Promise<LaunchRecord>;
}

export function maskPrivateKey(key: string): string {
  const k = key.replace(/^0x/, "");
  if (k.length <= 12) return "••••••••";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
