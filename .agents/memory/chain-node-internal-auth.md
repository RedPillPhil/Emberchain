---
name: chain-node internal auth
description: How api-server authenticates to chain-node's /api/internal/* endpoints
---

# chain-node internal auth

## Rule
`CHAIN_NODE_INTERNAL_SECRET` must be set as a **Replit Secret** (shared environment). Both chain-node and api-server read it from the environment and must agree on the same value.

## How it works
- `artifacts/chain-node/src/lib/internal-auth.ts` — resolves `CHAIN_NODE_INTERNAL_SECRET` env var; falls back to `HMAC-SHA256(SESSION_SECRET, "chain-node-internal-v1")` if missing; fails closed (503) if neither is set.
- `lib/chain-client/src/index.ts` — same resolution logic; adds `Authorization: Bearer <secret>` to all paths containing `/internal/`.
- api-server blocks `/internal/{*path}` with 404 so external callers can never reach internal routes through the proxy.

**Why:** Hardcoding the secret in artifact.toml was rejected by the completion code review. The secret must come from the environment only.

## How to apply
- If you change the secret value, restart both chain-node and api-server.
- The HMAC fallback exists so the service works in dev environments where only SESSION_SECRET is configured (e.g. a fresh fork).
- In production, always set `CHAIN_NODE_INTERNAL_SECRET` explicitly as a Replit Secret.
