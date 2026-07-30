---
name: Ember Delta API routing
description: How browser fetch calls in ember-delta must reach the api-server — wrong prefix causes Vite SPA fallback HTML, not JSON.
---

## Rule
Never use `/api-server/api/*` as a fetch URL from ember-delta browser code. The Replit dev proxy does NOT forward that prefix to the api-server; it falls through to the Vite SPA fallback and returns HTML.

**Correct pattern** (matches the wallet and Bridge.tsx):
```typescript
// src/lib/api.ts
export const API = import.meta.env.PROD ? 'https://po-w-chain.replit.app' : '';

// In components:
fetch(`${API}/api/dex/orders?token=${addr}`)
```

In dev: `''` + `/api/dex/orders` → the Replit proxy routes `/api/*` directly to the api-server.
In prod: absolute URL reaches the api-server domain.

**Why:**
- The Replit domain-level proxy routes `/api/*` to the api-server in BOTH dev and prod.
- `/api-server/api/*` is only meaningful at the `localhost:80` internal test proxy, NOT from the browser via riker.replit.dev.
- Vite's `server.proxy` config does NOT help because browser requests go through the Replit domain proxy, not through the Vite process.

**How to apply:**
- Any new fetch in ember-delta (or other artifacts) targeting the api-server: use `${API}/api/...`.
- wagmi Emberchain RPC dev URL: `${window.location.origin}/api/rpc` (not `/api-server/api/rpc`).
- The wallet artifact uses the identical pattern via `API_SERVER` in `src/lib/api-server.ts`.
