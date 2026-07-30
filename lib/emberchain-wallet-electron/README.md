# Emberchain Wallet — Desktop App

A full Emberchain node + wallet UI bundled into a single desktop application. Built with [Electron](https://www.electronjs.org/).

No Node.js, no MetaMask, no separate downloads required. Just install and run.

## What it does

- Starts a bundled Emberchain full node on first launch (downloads chain state from `emberchain.org`)
- Opens the Emberchain Wallet UI in a native window
- Stores your chain data in your OS user-data folder:
  - **Windows**: `%APPDATA%\Emberchain Wallet\emberchain.json`
  - **macOS**: `~/Library/Application Support/Emberchain Wallet/emberchain.json`
  - **Linux**: `~/.config/Emberchain Wallet/emberchain.json`

## Download pre-built installers

[→ GitHub Releases](https://github.com/YOUR_ORG/YOUR_REPO/releases)

| Platform | File |
|----------|------|
| Windows  | `Emberchain-Wallet-Setup-x.x.x.exe` |
| macOS (Intel) | `Emberchain-Wallet-x.x.x.dmg` |
| macOS (Apple Silicon) | `Emberchain-Wallet-x.x.x-arm64.dmg` |
| Linux    | `Emberchain-Wallet-x.x.x.AppImage` |

## Build locally

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)
- For macOS builds: Xcode Command Line Tools
- For Windows builds: run on Windows (or use GitHub Actions)

### Steps

```bash
# From the workspace root
cd lib/emberchain-wallet-electron

# Install Electron + electron-builder
npm install

# Build for current platform
npm run dist
```

The installer will appear in `lib/emberchain-wallet-electron/dist/`.

### Build from GitHub Actions

Push a tag starting with `wallet-v` to trigger automated cross-platform builds:

```bash
git tag wallet-v1.0.0
git push --tags
```

This will create a GitHub Release draft with installers for Windows, macOS (Intel + ARM), and Linux.
