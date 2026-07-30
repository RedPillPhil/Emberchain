---
name: API server chain routing
description: How api-server resolves CHAIN_NODE_URL and MINING_NODE_URL, and current routing state after the duckdns-only switch.
---

## Current routing (post duckdns-only switch)

Both `CHAIN_NODE_URL` and `MINING_NODE_URL` in `artifacts/api-server/.replit-artifact/artifact.toml` point directly to `https://emberchain.duckdns.org`. The local chain-node (`artifacts/chain-node`) is stopped and unused.

**Why:** The local chain-node (org) accumulated a corrupted EVM state from orphaned fork blocks and a double-credit race condition in mining. Rather than attempt an in-place repair, the local node was decommissioned and the api-server was switched to pass through directly to duckdns.

## When a new org chain-node is needed

Spin up a fresh chain-node with:
- `SEED_PEERS=https://emberchain.duckdns.org`
- `MINING_DISABLED=true`

It will bootstrap from duckdns's canonical snapshot with no contaminated history.

## Double-credit bug (fixed in codebase, needs duckdns restart)

Root cause: concurrent mining-submit HTTP requests both pass the nonce check before `applyBlock` acquires the EVM lock, causing the same block to be credited twice on duckdns.

Fixes committed (commit 1c63e6f):
- `applyBlock` — idempotency guard (`blocksByHash.has(hash)` check at lock entry)
- `getBlocksFrom` — deduplicates by hash before serving to peers
- Blockchain constructor — deduplicates `this.blocks` on load (self-heals on restart)

**Action needed:** `git pull && restart` on duckdns to activate the fix and heal existing duplicate blocks.

**How to apply:** Any time the local chain-node is reinstated, or if duckdns is ever restarted. One restart is sufficient to heal all existing duplicates.
