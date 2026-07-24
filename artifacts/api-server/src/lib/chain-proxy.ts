/**
 * chain-proxy — forwards HTTP requests to the chain-node service.
 *
 * Two upstream targets:
 *   CHAIN_NODE_URL   — local chain-node (default: localhost:8082)
 *                      Used for: RPC, sync, chain status, wallets, transactions.
 *   MINING_NODE_URL  — dedicated mining node (defaults to CHAIN_NODE_URL if unset)
 *                      Used for: mining/template, mining/share, mining/submit, mining/status.
 *
 * Splitting mining to a dedicated node prevents miner floods from blocking
 * the local chain-node that serves the wallet and bridge relayer.
 *
 * Mining requests are concurrency-capped: at most MAX_MINING_CONCURRENT requests
 * are in-flight to the mining node at once. Excess requests get a fast 429 so
 * they don't pile up and starve the server's connection pool.
 */

import { type Request, type Response, type NextFunction } from "express";
import { logger } from "./logger";

const CHAIN_NODE_URL  = (process.env.CHAIN_NODE_URL  ?? "http://localhost:8082").replace(/\/$/, "");
const MINING_NODE_URL = (process.env.MINING_NODE_URL ?? CHAIN_NODE_URL).replace(/\/$/, "");

/** Max simultaneous in-flight requests to the mining node. */
const MAX_MINING_CONCURRENT = 12;
let miningInFlight = 0;

async function proxy(
  upstream: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const target = `${upstream}${req.originalUrl}`;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Forwarded-For": String(req.ip ?? ""),
    };

    const init: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = JSON.stringify(req.body);
    }

    const upstreamRes = await fetch(target, {
      ...init,
      signal: AbortSignal.timeout(8_000),
    });

    const body = await upstreamRes.json() as unknown;
    res.status(upstreamRes.status).json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ target, err: msg }, "[proxy] chain-node unreachable");
    res.status(503).json({ error: "Chain node unavailable. Is CHAIN_NODE_URL set correctly?" });
    void next;
  }
}

async function proxyMining(
  upstream: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Force the TCP connection closed after each mining response.
  // Miners reconnect per request anyway; keeping sockets alive at 70+ req/s
  // exhausts the OS file-descriptor limit (ulimit -n 1024) and causes
  // Replit's healthcheck proxy to fail with "too many open files".
  res.set("Connection", "close");

  if (miningInFlight >= MAX_MINING_CONCURRENT) {
    res.status(429).json({ error: "Mining node busy — try again shortly." });
    return;
  }
  miningInFlight++;
  try {
    await proxy(upstream, req, res, next);
  } finally {
    miningInFlight--;
  }
}

/** Proxy to the general chain-node (local by default). */
export function proxyToNode(req: Request, res: Response, next: NextFunction): Promise<void> {
  return proxy(CHAIN_NODE_URL, req, res, next);
}

/** Redirect miners directly to the mining node (duckdns in production).
 *  A redirect closes the Replit router connection in <1ms instead of the
 *  200-500ms needed to proxy through to duckdns, eliminating FD exhaustion.
 */
export function proxyToMiningNode(req: Request, res: Response, _next: NextFunction): void {
  const target = `${MINING_NODE_URL}${req.originalUrl}`;
  res.set("Connection", "close").redirect(307, target);
}
