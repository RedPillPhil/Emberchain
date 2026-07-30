/**
 * Service-to-service authentication for /api/internal/* endpoints.
 *
 * chain-node's internal routes must only be reachable from api-server.
 * This middleware rejects any request that does not present the correct
 * shared bearer secret in the Authorization header.
 *
 * The secret is derived at startup from SESSION_SECRET using HMAC-SHA256
 * so that both chain-node and api-server (which share the same environment)
 * compute the same value without any hardcoded or committed credential.
 *
 * If SESSION_SECRET is unset, ALL internal requests are denied (fail-safe).
 */

import { createHmac } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

function resolveInternalSecret(): string | null {
  // Prefer an explicitly configured secret (Replit Secret or env var).
  const explicit = process.env["CHAIN_NODE_INTERNAL_SECRET"];
  if (explicit) return explicit;
  // Fall back to deriving from SESSION_SECRET so the service still works
  // in environments where only SESSION_SECRET is configured.
  const sessionSecret = process.env["SESSION_SECRET"];
  if (!sessionSecret) return null;
  return createHmac("sha256", sessionSecret)
    .update("chain-node-internal-v1")
    .digest("hex");
}

const INTERNAL_SECRET = resolveInternalSecret();

if (!INTERNAL_SECRET) {
  console.warn(
    "[chain-node] Neither CHAIN_NODE_INTERNAL_SECRET nor SESSION_SECRET is set — " +
      "/api/internal/* endpoints will reject all requests."
  );
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_SECRET) {
    res.status(503).json({ error: "Internal secret not configured" });
    return;
  }
  const authHeader = req.headers["authorization"];
  if (!authHeader || authHeader !== `Bearer ${INTERNAL_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
