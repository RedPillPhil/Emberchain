# Emberchain Desktop

A full-node desktop wallet for Emberchain (EMBR). Built with [Tauri](https://tauri.app) (Rust backend + React frontend).

## What it does

1. **First launch** — Downloads the full Emberchain state from `emberchain.org` (~few MB)
2. **Running** — Starts a local Emberchain node on port `8545`
3. **Wallet** — All transactions and balances are verified by your own node, not a third party

## Requirements

- **Node.js 20+** — [nodejs.org](https://nodejs.org) — the desktop app uses it to run the chain server
- **Rust + Cargo** — [rustup.rs](https://rustup.rs) — to build the Tauri app itself
- **Tauri CLI** — `cargo install tauri-cli`
- Platform dependencies — see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

## Build

```bash
# 1. Build the chain server bundle (from workspace root)
pnpm --filter @workspace/emberchain-node run build

# 2. Install frontend deps
cd lib/emberchain-desktop
pnpm install

# 3. Development mode
pnpm tauri:dev

# 4. Production build (creates installer in src-tauri/target/release/bundle/)
pnpm tauri:build
```

## GitHub Actions (automated cross-platform builds)

The workflow at `.github/workflows/build-desktop.yml` builds installers for:
- **Windows** — `.msi` installer (NSIS)
- **macOS** — `.dmg` disk image (universal binary)
- **Linux** — `.deb` and `.AppImage`

Push a tag like `desktop-v0.1.0` to trigger it:
```bash
git tag desktop-v0.1.0 && git push --tags
```

Built installers appear as **GitHub Release assets** automatically.

## Architecture

```
Tauri (Rust)
  ├── Finds Node.js on the system
  ├── Downloads chain snapshot on first run
  ├── Spawns server.mjs (bundled) as a local node
  ├── Emits node-status events to the frontend
  └── Kills server.mjs on app close

React frontend
  ├── Shows startup/sync screen while node boots
  ├── Calls http://localhost:8545/api/... for all data
  └── Pages: Overview, Send, Transactions, Mining, Settings
```

## Chain data location

| OS      | Path                                             |
|---------|--------------------------------------------------|
| Windows | `%APPDATA%\org.emberchain.desktop\chain-data\`  |
| macOS   | `~/Library/Application Support/org.emberchain.desktop/chain-data/` |
| Linux   | `~/.local/share/org.emberchain.desktop/chain-data/` |

## MetaMask integration

Once running, add Emberchain to MetaMask:

| Field           | Value                             |
|-----------------|-----------------------------------|
| Network name    | Emberchain                        |
| RPC URL         | `http://localhost:8545/api/rpc`   |
| Chain ID        | `7773`                            |
| Currency symbol | `EMBR`                            |
