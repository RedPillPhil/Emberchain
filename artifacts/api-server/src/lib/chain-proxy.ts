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
 */

import { type Request, type Response, type NextFunction } from "express";
import { logger } from "./logger";

const CHAIN_NODE_URL  = (process.env.CHAIN_NODE_URL  ?? "http://localhost:8082").replace(/\/$/, "");
const MINING_NODE_URL = (process.env.MINING_NODE_URL ?? CHAIN_NODE_URL).replace(/\/$/, "");

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

/** Proxy to the general chain-node (local by default). */
export function proxyToNode(req: Request, res: Response, next: NextFunction): Promise<void> {
  return proxy(CHAIN_NODE_URL, req, res, next);
}

/** Proxy to the dedicated mining node (duckdns in production). */
export function proxyToMiningNode(req: Request, res: Response, next: NextFunction): Promise<void> {
  return proxy(MINING_NODE_URL, req, res, next);
}
