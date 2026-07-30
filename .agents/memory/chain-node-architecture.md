---
name: Chain-node microservice architecture
description: How the blockchain node is separated from the API server, and what each service owns.
---

# Chain-node microservice architecture

## The rule
Only `artifacts/chain-node` may instantiate `Blockchain`. `artifacts/api-server` must never import `Blockchain` or create one — all chain operations go through `lib/chain-client` or the HTTP proxy.

**Why:** Two `Blockchain` instances pointed at the same PostgreSQL would diverge chain state silently. Single ownership guarantees consistency.

## Service layout

| Service | Port | Path | Owns |
|---|---|---|---|
| `artifacts/chain-node` | 8082 | `/chain-node` (internal) | `Blockchain`, sync-loop, peer PEX, chain scanner, ERC-20 registry writing |
| `artifacts/api-server` | 8080 | `/api` | Exchange, privacy, bridge relay, community WS, contract-registry reads |

## How api-server calls chain-node

Two mechanisms:
1. **HTTP proxy** (`src/lib/chain-proxy.ts`) — simple `fetch()` forward for public chain routes (rpc, sync, chain, wallets, transactions, mining). Express routes in `src/routes/index.ts` forward to `CHAIN_NODE_URL`.
2. **chain-client** (`lib/chain-client/src/index.ts`) — typed async wrappers for app-level methods (exchange, privacy, callContract, submitTransaction, submitRawEVMTransaction, getTransaction, etc.) calling `/api/internal/*` endpoints on chain-node.

## Internal endpoints
`artifacts/chain-node/src/routes/internal.ts` exposes `/api/internal/exchange/*`, `/api/internal/privacy/*`, `/api/internal/call-contract`, `/api/internal/submit-transaction`, `/api/internal/submit-raw-evm-tx`, `/api/internal/block-for-tx/:hash`, `/api/internal/contract-code/:address`.

## chain-core usage in api-server
`@workspace/chain-core` stays in api-server's deps for pure utilities (`createEmberchainCommon`, `EMBERCHAIN_ID`, type imports). The `Blockchain` class must not be instantiated there.

## Environment variable
`CHAIN_NODE_URL` (default `http://localhost:8082`) — set in both api-server artifact.toml `[services.env]` and `[services.production.run.env]`.

## How to apply
- Any future route that needs chain data: use `chainClient.*` or add a new internal endpoint in chain-node.
- Bridge relayer stays in api-server but calls chain-node via chain-client for `submitTransaction` and `getTransaction`.
- Chain-scanner (background ERC-20 discovery) runs in chain-node, writes to shared `contract_registry` PostgreSQL table.
