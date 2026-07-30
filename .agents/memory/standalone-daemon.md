---
name: Standalone ember-daemon package
description: Architecture and build notes for lib/ember-daemon and artifacts/ember-node-desktop — the self-hosted desktop node.
---

# Standalone Ember Daemon

## What it is
`lib/ember-daemon` is a full copy of the chain-node's logic that:
- Uses SQLite (`better-sqlite3`) instead of PostgreSQL — data lives in `~/.emberchain/chain.db`
- Has a `emberd` CLI binary and an `embedded.ts` API for Electron
- Has NO internal API routes (`/api/internal/*`) — those are exchange-specific
- Mirrors chain-node's directory structure exactly so routes are copy-paste identical

`artifacts/ember-node-desktop` is the Electron GUI wrapper using `electron-vite`.

## Build
```bash
# Daemon only (headless)
cd lib/ember-daemon && pnpm run build && node dist/cli.mjs --port 8545

# Desktop GUI (requires local machine — Electron can't run in Replit)
cd artifacts/ember-node-desktop && npm install && npm run dev
npm run dist   # builds .dmg / .exe / .AppImage
```

## Key decisions

**Why SQLite not PostgreSQL:**
SQLite ships as a native Node.js addon, has zero external dependencies, and handles the `PersistedChain` JSON blob identically to PostgreSQL's JSONB column.

**Why better-sqlite3 not sqlite3:**
better-sqlite3 is synchronous, making the async wrappers trivial (`Promise.resolve(syncCall())`), and has significantly better performance for the write pattern.

**better-sqlite3 in Replit:**
The native addon needs compilation (`node-gyp`). pnpm blocked the build scripts on first install. Fix: `better-sqlite3` is now in `onlyBuiltDependencies` in `pnpm-workspace.yaml`. When the native build isn't available, the chain-core fallback (chain.json file storage) kicks in and the daemon still runs.

**Electron app excluded from pnpm workspace:**
`!artifacts/ember-node-desktop` is in `pnpm-workspace.yaml` because Electron binary download fails in Replit. Users clone the repo and `cd artifacts/ember-node-desktop && npm install`.

**How embedded.ts works:**
Modifies `daemonConfig` (mutable singleton) before importing any module that reads it, then calls `startServer()`. One daemon instance per process — throws if called twice. Electron main process calls `startEmbeddedDaemon({dataDir, port, seedPeers})`, receives a `DaemonHandle` with `getStatus()`, `getMiningStatus()`, `startMining()`, `stopMining()`, `getPeers()`.

**Why embedded in Electron main process (not child process):**
Simpler — no child process management, no IPC overhead for status polling. The HTTP server still binds to localhost:8545 for MetaMask/external tools.

**Why `!artifacts/ember-node-desktop` (not `lib/ember-desktop`):**
Previous Electron attempts were in `lib/` with names like `lib/emberchain-desktop` (already excluded). New apps go in `artifacts/` per project convention.
