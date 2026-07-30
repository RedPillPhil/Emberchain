---
name: Chain snapshot partial-chain export
description: exportSnapshot fails on long-running nodes because old blocks are pruned; fix and root cause documented here.
---

## Rule
`exportSnapshot()` must NOT throw when the backward walk from tip can't reach genesis.
Old blocks are pruned by `MAX_FILE_BLOCKS = 2000` — genesis is never in memory on a node with >2000 blocks.
The "did not reach genesis" check must be a **warning**, not an error.

**Why:** On a node with 50k+ blocks, only the most recent ~2000 blocks are persisted to DB/file.
The canonical backward walk stops at the oldest in-memory block (~48k), not block 0.
This caused `exportSnapshot` to always throw, making peer bootstrapping impossible.

**How to apply:** The fix is in `lib/chain-core/src/blockchain.ts` around the `walkedToGenesis` check.
Changed `errors.push(...)` → `warnings.push(...)`. The exported partial canonical chain is still internally
valid (each consecutive block's parentHash matches the previous block's hash), and the
`totalDifficulty` per block is correct because it's stored on each block and backfilled on import.

## Reorg chimera chains
Two nodes can end up with "chimera" chains after failed reorgs: org fork blocks up to height N, then
peer fork blocks from N+1 onwards with a broken parentHash link at the seam.

**How to diagnose:** Binary search via `GET /api/chain/blocks/:n` — blocks below the break return
not found (the backward canonical walk from tip stops at the break and excludes everything below).

**How to fix:** Truncate the DB chain_state blocks array to the last height BEFORE the break using SQL:
```sql
UPDATE chain_state
SET data = jsonb_set(data, '{blocks}',
  (SELECT COALESCE(jsonb_agg(b ORDER BY (b->>'number')::int), '[]'::jsonb)
   FROM jsonb_array_elements(data->'blocks') b
   WHERE (b->>'number')::int <= <TARGET_HEIGHT>))
WHERE id = 'main';
```
Run this via a pre-start `rollback.js` script BEFORE the chain-node process loads from DB.
Set `ROLLBACK_TO_HEIGHT` env var; remove it after successful resync.

## totalDifficulty offset after snapshot import
After a fresh node bootstraps from a partial snapshot, its `totalDifficulty` may be offset from the
source node by a constant value. This is harmless — the canonical blocks are identical (same hashes).
The offset affects fork-choice weight only: the node with higher TD wins, which is desirable when
the mining node (duckdns) should be the authority.
