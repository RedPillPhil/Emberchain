# EmberChain Standalone Miner

CPU miner for EmberChain. Runs one thread per core by default.

## Setup

```bash
# 1. Install the one dependency
npm install

# 2. Run it
node emberchain-miner.mjs --address 0xYOUR_EMBR_ADDRESS
```

## Options

| Flag | Env var | Default | Description |
|---|---|---|---|
| `--node` | `EMBR_NODE` | `https://emberchain.org` | Chain node URL |
| `--address` | `EMBR_ADDRESS` | *(required)* | Your EMBR wallet address |
| `--threads` | `EMBR_THREADS` | CPU core count | Parallel mining threads |
| `--batch` | `EMBR_BATCH` | `8000` | Hashes per batch per thread |

## Bridge PC miner (confirm your lock from your computer)

Run on **your PC** — does not start mining on the seed server.

Run **before** clicking Bridge in the wallet (watches for your lock), or pass `-Tx` after submit:

```powershell
# From repo root on Windows
.\scripts\miner\mine-for-bridge.ps1 -Node "https://emberchain.org" -Address "0xYOUR_WALLET"

# If you already submitted and have the lock tx hash:
.\scripts\miner\mine-for-bridge.ps1 `
  -Node "https://emberchain.org" `
  -Address "0xYOUR_WALLET" `
  -Tx "0xLOCK_TX_HASH"
```

This script:
1. Watches for your pending `lockEMBR` tx (or uses `--tx`)
2. Mines from your PC until the lock confirms, then exits

## Verify before mining (node mismatch debug)

```powershell
# From repo root on Windows — compare two nodes
.\scripts\miner\verify-and-mine.ps1 -Compare "https://emberchain.org" "https://emberchain.duckdns.org"

# Is your stuck tx on emberchain.org? Is it in the mining template?
.\scripts\miner\verify-and-mine.ps1 `
  -Node "https://emberchain.org" `
  -Address "0xa8f6efc25896c24ac6c9441f9f693c14517aa818" `
  -Tx "0x2f3ac34b6d645b6414c666f79b5027f26cb9308bf21f2213c5d3f9ef3974cff3" `
  -CheckOnly

# Bridge #1785643913328 should show status=failed after chain-node deploy
.\scripts\miner\verify-and-mine.ps1 `
  -Node "https://emberchain.org" `
  -Address "0xa8f6efc25896c24ac6c9441f9f693c14517aa818" `
  -BridgeNonce "1785643913328" `
  -CheckOnly

# Mine on the node where your tx lives (includes mempool txs in blocks)
.\scripts\miner\verify-and-mine.ps1 `
  -Node "https://emberchain.org" `
  -Address "0xa8f6efc25896c24ac6c9441f9f693c14517aa818" `
  -Tx "0x2f3ac34b6d645b6414c666f79b5027f26cb9308bf21f2213c5d3f9ef3974cff3"
```

Or with node directly:

```bash
cd scripts/miner && npm install
node emberchain-miner.mjs --node https://emberchain.org --address 0x... --tx 0x... --check-only
node emberchain-miner.mjs --node https://emberchain.org --address 0x... --tx 0x...
```

## Examples

```bash
# Mine to production with your address
node emberchain-miner.mjs --address 0xABC123...

# Mine to local dev node
node emberchain-miner.mjs --node http://localhost:8082 --address 0xABC123...

# Use 4 threads only (leave some cores free)
node emberchain-miner.mjs --address 0xABC123... --threads 4

# Via env vars
EMBR_ADDRESS=0xABC123... EMBR_NODE=http://localhost:8082 node emberchain-miner.mjs
```

## How it works

1. Fetches a block template from `/api/mining/template`
2. Spins up one worker thread per CPU core
3. Each worker hashes `keccak256(JSON.stringify({...header, nonce}))` in tight batches
4. If a hash beats the **share target** → submits a share (earns pool credit)
5. If a hash beats the **block target** → submits a full block
6. Polls for a new template every 5 seconds; stale-block (409) responses also trigger an immediate refresh

## Requirements

- Node.js 18 or newer
- `npm install` (installs `ethereum-cryptography` for keccak256)
