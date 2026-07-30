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

/**
 * READ_NODE_URL — optional read replica for serving UI read traffic.
 *
 * When set, GET requests for chain status, blocks, wallets, and transactions
 * are forwarded here instead of the main chain-node. This offloads all
 * display/explorer reads from the write node so miners competing for the EVM
 * lock never affect wallet or block-explorer responses.
 *
 * Typical value: https://emberchain.duckdns.org/chain-node
 * Falls back to CHAIN_NODE_URL when not set (no behaviour change).
 */
const READ_NODE_URL = (process.env.READ_NODE_URL ?? CHAIN_NODE_URL).replace(/\/$/, "");

/** Max simultaneous in-flight requests to the mining node.
 *
 * Each submit-block holds chain-node's EVM concurrency lock for ~200-500ms.
 * Allowing 12 concurrent means up to 6 s of queued EVM work, which starves
 * wallet / status reads waiting behind it in the event loop.
 *
 * Capping at 3 keeps the queue ≤1.5 s and lets read-only endpoints respond
 * instantly.  Miners that exceed the cap receive an immediate 429 and their
 * client retries — no shares are permanently lost.
 */
const MAX_MINING_CONCURRENT = 3;
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
      // Force a fresh TCP connection for every proxied request.
      //
      // Without this, Node.js fetch (undici) reuses keep-alive connections
      // from its per-origin pool.  Under heavy mining load one api-server
      // worker can exhaust its pool with slow/stuck submit-block connections,
      // causing every subsequent request to chain-node — including fast reads
      // like /api/chain/status — to queue behind them and hit the 15 s timeout.
      // "Connection: close" keeps each connection independent so a stuck
      // submit-block never contaminates wallet or status reads.
      "Connection": "close",
    };

    const init: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = JSON.stringify(req.body);
    }

    const upstreamRes = await fetch(target, {
      ...init,
      signal: AbortSignal.timeout(15_000),
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

/**
 * Proxy read-only GET requests to the read replica (READ_NODE_URL).
 *
 * Used for: chain status, block explorer, wallet balance, transaction history.
 * Falls back to the main chain-node when READ_NODE_URL is not configured.
 */
export function proxyReadToNode(req: Request, res: Response, next: NextFunction): Promise<void> {
  return proxy(READ_NODE_URL, req, res, next);
}

/** Redirect miners directly to the mining node (duckdns in production).
 *  A redirect closes the Replit router connection in <1ms instead of the
 *  200-500ms needed to proxy through to duckdns, eliminating FD exhaustion.
 */
export function proxyToMiningNode(req: Request, res: Response, _next: NextFunction): void {
  const target = `${MINING_NODE_URL}${req.originalUrl}`;
  res.set("Connection", "close").redirect(307, target);
}

/**
 * Proxy mining requests directly to the local chain-node (no redirect).
 * Unlike proxyToMiningNode, this works inside Replit where the browser
 * cannot follow a redirect to localhost:8082. All share submissions land
 * on the same node that mines blocks, so proportional share accounting
 * stays consistent. Concurrency is capped at MAX_MINING_CONCURRENT to
 * prevent FD exhaustion.
 */
export function proxyToLocalMining(req: Request, res: Response, next: NextFunction): Promise<void> {
  return proxyMining(CHAIN_NODE_URL, req, res, next);
}

/**
 * Proxy fast read-only mining requests (template, status) to the local
 * chain-node WITHOUT the concurrency cap.
 *
 * Template and status requests are 1 ms reads that never touch the EVM lock.
 * Running them through the capped proxyToLocalMining causes miners to see
 * "Mining node busy" 429s whenever the 3 submit-block slots are full — which
 * is almost always under active mining load — making mining impossible from
 * the browser UI.
 */
export function proxyToLocalMiningRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.set("Connection", "close");
  return proxy(CHAIN_NODE_URL, req, res, next);
}
