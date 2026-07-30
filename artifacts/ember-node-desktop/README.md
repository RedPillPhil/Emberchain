# Ember Node — Standalone Emberchain Desktop Node

A self-contained Emberchain node with a native desktop GUI, similar to Bitcoin Core.
No Replit servers, no external databases, no hosted APIs required.

## Features

- ⬡ **Full node** — validates every block independently
- 💾 **Local SQLite storage** — chain state lives in `~/.emberchain/chain.db`
- 🌐 **P2P networking** — discovers peers automatically, propagates blocks
- 🔌 **MetaMask-compatible RPC** — connect any EVM wallet to `http://127.0.0.1:8545`
- ⛏ **Built-in mining** — mine EMBR directly from the GUI or CLI
- 🖥 **System tray** — keeps running silently in the background
- 📦 **One-click installers** — `.dmg` (macOS), `.exe` / NSIS (Windows), `.AppImage` / `.deb` (Linux)

---

## Quick Start (running from source)

### Prerequisites
- Node.js 20+
- pnpm 9+

### Install & run
```bash
# From the monorepo root
pnpm install

# Run the desktop app in development mode
cd artifacts/ember-node-desktop
npm install          # installs Electron and electron-vite locally
npm run dev          # starts the GUI in dev mode
```

### Build installers
```bash
cd artifacts/ember-node-desktop
npm install
npm run dist          # builds for the current platform
npm run dist:mac      # macOS .dmg (universal)
npm run dist:win      # Windows NSIS installer
npm run dist:linux    # Linux AppImage + .deb
```

Installers are placed in `release/`.

---

## Headless CLI (no GUI)

The `emberd` binary runs the node without Electron:

```bash
# Build the daemon
cd lib/ember-daemon
pnpm install
pnpm run build

# Run it
node dist/cli.mjs

# With options
node dist/cli.mjs \
  --datadir ~/.emberchain \
  --port 8545 \
  --mine \
  --miner-address 0xYourAddress \
  --intensity 3
```

### CLI options

| Flag | Default | Description |
|------|---------|-------------|
| `--datadir <path>` | `~/.emberchain` | Data directory |
| `--port <n>` | `8545` | HTTP / RPC port |
| `--seed-peers <urls>` | `https://emberchain.org` | Bootstrap peers (comma-separated) |
| `--node-url <url>` | — | Public URL (for peer announcements) |
| `--mine` | off | Start mining on launch |
| `--miner-address <addr>` | — | Address for block rewards |
| `--intensity <1-10>` | `2` | Mining intensity |
| `--gentle-sync` | off | Home-connection mode (smaller batches, sequential PEX) |
| `--log-level <lvl>` | `info` | Pino log level |
| `--no-sync` | off | Disable peer sync (isolated / dev mode) |

---

## MetaMask Setup

Once the node is running, add it to MetaMask:

| Field | Value |
|-------|-------|
| Network Name | Emberchain |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `7773` |
| Currency Symbol | `EMBR` |
| Block Explorer | `https://emberchain.org` |

---

## Data Files

| File | Contents |
|------|----------|
| `~/.emberchain/chain.db` | Full chain state (SQLite — replaces Replit PostgreSQL) |
| `~/.emberchain/chain.json` | Recent block cache (last 2000 blocks, fast load) |
| `~/.emberchain/peers.json` | Discovered peer list (persists across restarts) |
| `~/.emberchain/config.json` | GUI settings (port, mining config, etc.) |

---

## Architecture

```
artifacts/ember-node-desktop/   ← Electron shell (GUI + packaging)
lib/ember-daemon/               ← Standalone Node.js daemon
lib/chain-core/                 ← Pure blockchain logic (shared with Replit node)
```

The daemon is embedded directly into the Electron main process — no child process
management or separate ports needed. The HTTP server still binds to `127.0.0.1:<port>`
so MetaMask and external tools can connect.

---

## Building for Production

### macOS code signing

1. Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables to your Developer ID certificate.
2. For notarization, set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.
3. Uncomment `afterSign` in `electron-builder.yml` and point it to your notarization script.

### Windows code signing

Set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` to your certificate.

### Auto-updates

Uncomment the `publish` block in `electron-builder.yml` and configure your GitHub repo.
The app uses `electron-updater` (add it as a dependency and call `autoUpdater.checkForUpdatesAndNotify()` in `src/main/index.ts`).

---

## Differences from the Replit-hosted node

| Feature | Replit node | Desktop node |
|---------|-------------|--------------|
| Storage | PostgreSQL (hosted) | SQLite (local file) |
| API surface | Same (`/api/rpc`, `/api/mining/*`, `/api/sync/*`) | Same |
| P2P protocol | HTTP-based (same) | HTTP-based (same) |
| Peer discovery | Parallel PEX | Sequential PEX (gentle mode) |
| Internal API | Yes (`/api/internal/*` for exchange) | Not included |
| Mining proxy | Via api-server rate-limiter | Direct to daemon |
