# Emberchain Node & Miner

Standalone tools for running your own Emberchain node and/or mining EMBR from any computer.

---

## Prerequisites

- **Node.js 20+** (`node --version`)
- **pnpm** (`npm install -g pnpm`)
- Clone the repo: `git clone https://github.com/your-org/emberchain && cd emberchain`
- Install deps: `pnpm install`

---

## 1. Standalone Miner

Mine EMBR from any computer — no database or special setup needed.
Connects to the production network (or any local node) and submits proof-of-work.

```bash
pnpm --filter @workspace/emberchain-node run miner -- \
  --node      https://emberchain.org \
  --address   0xYourWalletAddress \
  --intensity 3
```

| Flag | Description | Default |
|------|-------------|---------|
| `--node` | Emberchain node URL to mine against | `https://emberchain.org` |
| `--address` | Your EMBR wallet address (receives rewards) | required |
| `--intensity` | CPU intensity 1–5 (1=eco, 3=balanced, 5=max) | `3` |
| `--shares` | Submit shares for proportional rewards | `true` |

**Intensity guide:**
| Level | Hashes/batch | CPU use |
|-------|-------------|---------|
| 1 | 500 | ~10% |
| 2 | 2,000 | ~25% |
| 3 | 8,000 | ~50% |
| 4 | 25,000 | ~75% |
| 5 | 80,000 | ~100% |

The miner automatically fetches fresh block templates and retries on stale blocks (409).
Rewards are paid proportionally based on shares submitted.

---

## 2. Full Node

Runs a complete Emberchain node locally.
Downloads the full chain state from a peer, then starts a local JSON-RPC server
that MetaMask and other wallets can connect to.

```bash
pnpm --filter @workspace/emberchain-node run node -- \
  --peer  https://emberchain.org \
  --port  8545 \
  --data  ./node-data
```

| Flag | Description | Default |
|------|-------------|---------|
| `--peer` | Bootstrap node to sync from | `https://emberchain.org` |
| `--port` | Local HTTP port | `8545` |
| `--data` | Directory to store chain data | `./node-data` |
| `--resync` | Force re-download of snapshot (flag, no value) | off |

After startup, add to MetaMask:
```
Network name : Emberchain (local)
RPC URL      : http://localhost:8545/api/rpc
Chain ID     : 7773
Currency     : EMBR
```

**Notes:**
- The first startup downloads the full chain snapshot (~several MB).
  Subsequent startups use the cached snapshot — add `--resync` to refresh it.
- No Postgres required — the node runs in file-only mode.
- The node stays in sync by polling the peer for new blocks every 30 seconds.

---

## 3. How it works

### Mining protocol

1. `GET /api/mining/template?minerAddress=0x…` — fetch current block template
2. Hash `keccak256(JSON.stringify({ number, parentHash, timestamp, miner, difficulty, transactionsRoot, nonce }))` 
3. Compare hash value to `target` (block) and `shareTarget` (share = target × 64)
4. `POST /api/mining/share` — submit any nonce ≤ shareTarget for proportional credit
5. `POST /api/mining/submit` — submit nonce ≤ target to close the block and earn the reward

### Sync protocol

- `GET /api/sync/status` — quick check (block height, difficulty)
- `GET /api/sync/snapshot` — full chain export including EVM state (download once)
- `GET /api/sync/blocks?from=N&limit=500` — incremental block batch since block N

---

## 4. Running as a background service (Linux/macOS)

```bash
# With pm2
npm install -g pm2
pm2 start "pnpm --filter @workspace/emberchain-node run miner -- --node https://emberchain.org --address 0xYour" --name embr-miner
pm2 startup && pm2 save

# Or with screen
screen -S embr-miner
pnpm --filter @workspace/emberchain-node run miner -- --node https://emberchain.org --address 0xYour
# Ctrl+A, D to detach
```
