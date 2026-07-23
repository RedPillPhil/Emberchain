/**
 * chain-proxy — forwards HTTP requests to the chain-node service.
 *
 * Used by api-server's routes/index.ts to proxy the chain-specific endpoints
 * (rpc, sync, chain, wallets, transactions, mining) straight through to
 * chain-node so external callers (MetaMask, miners, peer nodes) continue to
 * work at the well-known /api/* paths without any code change on their side.
 */

import { type Request, type Response, type NextFunction } from "express";
import { logger } from "./logger";

const CHAIN_NODE_URL = (process.env.CHAIN_NODE_URL ?? "http://localhost:8082").replace(/\/$/, "");

export async function proxyToNode(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const target = `${CHAIN_NODE_URL}${req.originalUrl}`;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Forwarded-For": String(req.ip ?? ""),
    };

    const init: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(target, {
      ...init,
      signal: AbortSignal.timeout(8_000),
    });

    // Forward the status and body verbatim
    const body = await upstream.json() as unknown;
    res.status(upstream.status).json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ target, err: msg }, "[proxy] chain-node unreachable");
    res.status(503).json({ error: "Chain node unavailable. Is CHAIN_NODE_URL set correctly?" });
    void next; // satisfy TS — not calling next so Express doesn't double-respond
  }
}
