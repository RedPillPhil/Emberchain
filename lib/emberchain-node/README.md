# Emberchain Node & Miner

Standalone tools for running your own Emberchain node and/or mining EMBR from any computer.

When you run a node, it:
- Downloads the full chain history from a peer on first start
- Accepts wallet connections (Desktop Wallet, MetaMask)
- Mines blocks and broadcasts them to the network
- Keeps the network alive even if the main server (emberchain.org) goes offline

---

## Prerequisites

- **Node.js 20+** (`node --version`)

No other dependencies — just Node.js and the three files in the download package.

---

## 1. Full Node

Run your own Emberchain node. First startup downloads the full chain.
Other users can point their Desktop Wallet or MetaMask at your node's URL.

```bash
node emberchain-node.js
```

**With a public URL** (recommended — joins the gossip network):
```bash
node emberchain-node.js --url https://your-server.example.com
```

| Flag | Description | Default |
|------|-------------|---------|
| `--peer` | Bootstrap node to sync from | `https://emberchain.org` |
| `--port` | Local HTTP port | `8545` |
| `--data` | Directory to store chain data | `./emberchain-data` |
| `--url`  | Your node's public URL (registers you with the network so you receive block gossip and other nodes can sync from you) | *(none)* |
| `--resync` | Force re-download of snapshot | off |

**Connect your Desktop Wallet** — Settings → Node URL:
```
http://localhost:8545/api         (if running locally)
https://your-server.example.com/api  (if you have a public URL)
```

**Connect MetaMask:**
```
Network name : Emberchain
RPC URL      : http://localhost:8545/api/rpc
Chain ID     : 7773
Currency     : EMBR
```

### How it stays in sync

Your node uses two mechanisms to stay current:

1. **Block gossip** — when any node mines a block it pushes it immediately to all known peers via `POST /api/sync/submit-block`. If you provide `--url`, your node registers with the bootstrap peer and receives blocks in real time.

2. **Incremental polling** — every 30 s your node polls `GET /api/sync/blocks?from=N` from its peer to catch any blocks it missed. This works even without `--url`, so you stay in sync even behind NAT.

### Running without the main server

If `emberchain.org` goes offline, nodes that know about each other keep the network running:
- They continue mining blocks between themselves
- Users can point their wallets at any reachable node
- When the main server comes back it syncs from the peer network

**First run:** sync from `--peer` (bootstrap). After that your node has the full chain locally and can serve as a peer itself.

---

## 2. Standalone Miner

Mine EMBR from any computer — connects to any node (local or remote).

```bash
node emberchain-miner.js --address 0xYourWalletAddress
```

| Flag | Description | Default |
|------|-------------|---------|
| `--address` | Your EMBR wallet address (required) | — |
| `--node` | Node to mine against | `https://emberchain.org` |
| `--intensity` | CPU usage 1–5 (1=eco, 3=balanced, 5=max) | `3` |

Point your miner at your own node:
```bash
node emberchain-miner.js --address 0xYour --node http://localhost:8545
```

**Intensity guide:**
| Level | Hashes/batch | Approx CPU |
|-------|-------------|------------|
| 1 | 500 | ~10% |
| 2 | 2 000 | ~25% |
| 3 | 8 000 | ~50% |
| 4 | 25 000 | ~75% |
| 5 | 80 000 | ~100% |

---

## 3. P2P Network — How It Works

```
  [You]  node --url https://your-node.com
    │
    ├── on start: GET  https://emberchain.org/api/sync/snapshot   (download chain)
    ├── on start: POST https://emberchain.org/api/sync/peers      (register yourself)
    │
    ├── mine a block locally →
    │     POST https://emberchain.org/api/sync/submit-block       (gossip to peer)
    │     POST https://other-node.com/api/sync/submit-block       (gossip to all peers)
    │
    └── receive a block from a peer →
          validate PoW → import → gossip to other peers
```

Each node that provides `--url`:
1. Registers itself with the bootstrap peer on startup
2. Broadcasts every newly mined block to all known peers
3. Accepts incoming blocks from peers, validates PoW, and re-gossips

Nodes without `--url` (behind NAT, local-only) still stay in sync via the 30-second poll.

---

## 4. Running as a Background Service

```bash
# With pm2 (Linux/macOS/Windows)
npm install -g pm2
pm2 start "node emberchain-node.js --url https://your-node.com" --name embr-node
pm2 start "node emberchain-miner.js --address 0xYour"           --name embr-miner
pm2 startup && pm2 save

# With screen (Linux/macOS)
screen -S embr-node
node emberchain-node.js --url https://your-node.com
# Ctrl+A, D to detach
```

---

## 5. Sync Protocol Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/status` | GET | Block height + difficulty (quick check) |
| `/api/sync/snapshot` | GET | Full chain export (download once on first boot) |
| `/api/sync/blocks?from=N` | GET | Incremental blocks since block N |
| `/api/sync/peers` | GET | List of known peer URLs |
| `/api/sync/peers` | POST | Register a peer URL |
| `/api/sync/submit-block` | POST | Push a mined block to a peer |

---

## Links

- Website  : https://emberchain.org
- Explorer : https://emberchain.org/ledger
- GitHub   : https://github.com/RedPillPhil/Emberchain
