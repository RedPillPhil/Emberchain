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
