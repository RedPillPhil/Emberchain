/**
 * Optional silent email alerts when new bridge locks appear (operator only).
 *
 * Env:
 *   ADMIN_ALERT_EMAIL  — recipient
 *   RESEND_API_KEY     — Resend.com API key (https://resend.com)
 *   RESEND_FROM        — verified sender, e.g. alerts@yourdomain.com
 */

import { Contract, Interface, JsonRpcProvider } from "ethers";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "./logger";

const SEEN_FILE =
  (process.env.BRIDGE_ALERTS_SEEN_FILE ?? "").trim() || "./data/bridge-alerts-seen.json";

const CHAIN_NODE_URL = (process.env.NODE_URL ?? process.env.CHAIN_NODE_URL ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
const BASE_RPC = (process.env.BASE_RPC_URL ?? "").trim() || "https://mainnet.base.org";
const EMBER_BRIDGE = (process.env.EMBER_BRIDGE_ADDRESS ?? "0x9362587019ea0e4ef90fbd981c615d4441d9d2c4").toLowerCase();
const BASE_BRIDGE = (process.env.EMBERCHAIN_BRIDGE_ADDRESS ?? "0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4").toLowerCase();

const EMBR_ABI = [
  "function lockEMBR(address baseRecipient, uint256 nonce) payable",
  "function usedNonces(uint256 nonce) view returns (bool)",
];
const BASE_ABI = [
  "event BridgeOut(address indexed sender, string embrRecipient, uint256 amount, uint256 indexed nonce)",
  "function usedNonces(uint256 nonce) view returns (bool)",
];

const embrIface = new Interface(EMBR_ABI);
const LOCK_SEL = embrIface.getFunction("lockEMBR")!.selector;

interface SeenData {
  keys: string[];
}

function loadSeen(): Set<string> {
  try {
    const raw = readFileSync(SEEN_FILE, "utf-8");
    return new Set((JSON.parse(raw) as SeenData).keys ?? []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    mkdirSync(dirname(SEEN_FILE), { recursive: true });
    const tmp = `${SEEN_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify({ keys: [...seen].slice(-1000) }, null, 2), "utf-8");
    renameSync(tmp, SEEN_FILE);
  } catch (err) {
    logger.warn({ err }, "[bridge-alerts] could not save seen file");
  }
}

function formatEmbr(wei: string): string {
  const n = BigInt(wei);
  const whole = n / 10n ** 18n;
  const frac = (n % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

async function isNonceUsedOnBase(nonce: string): Promise<boolean> {
  const p = new JsonRpcProvider(BASE_RPC);
  const c = new Contract(BASE_BRIDGE, BASE_ABI, p);
  return Boolean(await c.usedNonces(BigInt(nonce)));
}

async function isNonceUsedOnEmbr(nonce: string): Promise<boolean> {
  const p = new JsonRpcProvider(`${CHAIN_NODE_URL}/api/rpc`);
  const c = new Contract(EMBER_BRIDGE, EMBR_ABI, p);
  return Boolean(await c.usedNonces(BigInt(nonce)));
}

async function scanEmbrLocks(): Promise<Array<{ key: string; line: string }>> {
  const out: Array<{ key: string; line: string }> = [];
  const res = await fetch(`${CHAIN_NODE_URL}/api/transactions?address=${EMBER_BRIDGE}&limit=200`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return out;
  const summaries = (await res.json()) as Array<{ hash: string; status: string; to: string | null; value: string }>;

  for (const s of summaries) {
    if (s.status !== "success" || s.to?.toLowerCase() !== EMBER_BRIDGE || BigInt(s.value) <= 0n) continue;
    const detail = await fetch(`${CHAIN_NODE_URL}/api/transactions/${encodeURIComponent(s.hash)}`);
    if (!detail.ok) continue;
    const tx = (await detail.json()) as { data?: string; value: string; hash: string };
    const data = tx.data?.toLowerCase();
    if (!data?.startsWith(LOCK_SEL)) continue;
    try {
      const decoded = embrIface.decodeFunctionData("lockEMBR", data);
      const nonce = (decoded[1] as bigint).toString();
      if (await isNonceUsedOnBase(nonce)) continue;
      const key = `embr_to_base:${nonce}:${s.hash}`;
      const recipient = decoded[0] as string;
      out.push({
        key,
        line: `EMBR → Base · ${formatEmbr(tx.value)} EMBR · nonce ${nonce} · Base recipient ${recipient} · tx ${s.hash}`,
      });
    } catch {
      continue;
    }
  }
  return out;
}

async function scanBaseOuts(): Promise<Array<{ key: string; line: string }>> {
  const out: Array<{ key: string; line: string }> = [];
  const p = new JsonRpcProvider(BASE_RPC);
  const c = new Contract(BASE_BRIDGE, BASE_ABI, p);
  const height = await p.getBlockNumber();
  const from = Math.max(0, height - 50_000);
  let logs;
  try {
    logs = await c.queryFilter(c.filters.BridgeOut(), from, height);
  } catch {
    return out;
  }

  for (const log of logs) {
    if (!("args" in log) || !log.args) continue;
    const nonce = (log.args[3] as bigint).toString();
    if (await isNonceUsedOnEmbr(nonce)) continue;
    const key = `base_to_embr:${nonce}:${log.transactionHash}`;
    out.push({
      key,
      line: `Base → EMBR · ${formatEmbr((log.args[2] as bigint).toString())} EMBR · nonce ${nonce} · EMBR recipient ${log.args[1]} · tx ${log.transactionHash}`,
    });
  }
  return out;
}

async function sendEmail(subject: string, text: string): Promise<void> {
  const to = (process.env.ADMIN_ALERT_EMAIL ?? "").trim();
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? "Emberchain Alerts <onboarding@resend.dev>").trim();
  if (!to || !apiKey) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    logger.warn({ status: res.status, err }, "[bridge-alerts] email failed");
  }
}

let primed = false;

async function tick(): Promise<void> {
  const to = (process.env.ADMIN_ALERT_EMAIL ?? "").trim();
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!to || !apiKey) return;

  const [embr, base] = await Promise.all([scanEmbrLocks(), scanBaseOuts()]);
  const all = [...embr, ...base];
  const seen = loadSeen();

  if (!primed) {
    for (const item of all) seen.add(item.key);
    primed = true;
    saveSeen(seen);
    return;
  }

  const fresh = all.filter((item) => !seen.has(item.key));
  if (fresh.length === 0) return;

  for (const item of fresh) seen.add(item.key);
  saveSeen(seen);

  const body = fresh.map((f) => f.line).join("\n\n");
  await sendEmail(
    fresh.length === 1 ? "New Emberchain bridge pending" : `${fresh.length} new Emberchain bridges pending`,
    `${body}\n\nComplete in the wallet admin portal (/admin → Bridge). Users are not notified.`,
  );
  logger.info({ count: fresh.length }, "[bridge-alerts] sent operator email");
}

export function startBridgeAlertLoop(): void {
  const to = (process.env.ADMIN_ALERT_EMAIL ?? "").trim();
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!to || !apiKey) {
    logger.info("[bridge-alerts] disabled — set ADMIN_ALERT_EMAIL + RESEND_API_KEY to enable email alerts");
    return;
  }

  const intervalMs = Number(process.env.BRIDGE_ALERT_POLL_MS ?? "60000") || 60_000;
  logger.info({ to, intervalMs }, "[bridge-alerts] email loop started");
  setInterval(() => {
    tick().catch((err) => logger.warn({ err }, "[bridge-alerts] tick failed"));
  }, intervalMs);
  setTimeout(() => {
    tick().catch((err) => logger.warn({ err }, "[bridge-alerts] initial tick failed"));
  }, 15_000);
}
