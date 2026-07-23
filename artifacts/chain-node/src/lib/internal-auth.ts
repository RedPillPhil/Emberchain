/**
 * Service-to-service authentication for /api/internal/* endpoints.
 *
 * chain-node's internal routes must only be reachable from api-server.
 * This middleware rejects any request that does not present the correct
 * shared bearer secret in the Authorization header.
 *
 * The secret is read from CHAIN_NODE_INTERNAL_SECRET at startup.
 * If the variable is unset, ALL internal requests are denied (fail-safe).
 */

import type { Request, Response, NextFunction } from "express";

const INTERNAL_SECRET = process.env["CHAIN_NODE_INTERNAL_SECRET"];

if (!INTERNAL_SECRET) {
  console.warn(
    "[chain-node] CHAIN_NODE_INTERNAL_SECRET is not set — " +
      "/api/internal/* endpoints will reject all requests. " +
      "Set this variable to enable api-server → chain-node communication."
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
