/**
 * Builds two downloadable artifacts:
 *
 * dist/downloads/
 *   emberchain-miner.js  — single-file standalone miner (run with: node miner.js --address 0x...)
 *   emberchain-node.js   — node launcher (downloads snapshot + starts server)
 *   server.mjs           — bundled Emberchain API server
 *   README.txt           — user instructions
 *
 * These files are copied to artifacts/wallet/public/downloads/ so they are
 * served as static files at https://emberchain.org/downloads/<filename>
 */

import { createRequire } from "node:module";
import { build as esbuild } from "esbuild";
import { rm, cp, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// esbuild-plugin-pino uses require() internally — must be set before it loads
globalThis.require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DIST = path.resolve(__dirname, "dist", "downloads");
const WALLET_DOWNLOADS = path.resolve(ROOT, "artifacts", "wallet", "public", "downloads");

// ── shared esbuild config ─────────────────────────────────────────────────────

const sharedConfig = {
  platform: "node",
  bundle: true,
  format: "esm",
  logLevel: "info",
  // Resolve all packages from the workspace root so pnpm hoisting works
  absWorkingDir: ROOT,
  // Externalize native modules that can't be bundled
  external: [
    "*.node",
    "pg-native",
    "bufferutil",
    "utf-8-validate",
    "classic-level",
    "leveldown",
    "fsevents",
    "sharp",
    "canvas",
    "bcrypt",
    "argon2",
  ],
  // ESM-in-CJS compat shim (needed for packages like express, pg)
  banner: {
    js: `import { createRequire as __cr } from 'node:module';
import __path from 'node:path';
import __url from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __url.fileURLToPath(import.meta.url);
globalThis.__dirname = __path.dirname(globalThis.__filename);`,
  },
};

async function main() {
  console.log("🔨  Building Emberchain downloadable packages …\n");

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // ── 1. Standalone miner ───────────────────────────────────────────────────
  console.log("  Building miner …");
  await esbuild({
    ...sharedConfig,
    entryPoints: [path.resolve(__dirname, "src/miner.ts")],
    outfile: path.join(DIST, "emberchain-miner.js"),
    // Miner only needs ethereum-cryptography; everything else is built-in
  });

  // ── 2. Node launcher ──────────────────────────────────────────────────────
  console.log("  Building node launcher …");
  await esbuild({
    ...sharedConfig,
    entryPoints: [path.resolve(__dirname, "src/node.ts")],
    outfile: path.join(DIST, "emberchain-node.js"),
  });

  // ── 3. Bundled API server ─────────────────────────────────────────────────
  // Use the api-server's own build script (it already handles pino, externals, etc.)
  // then copy the resulting bundle here.
  console.log("  Building API server (using api-server/build.mjs) …");
  const { execSync } = await import("node:child_process");
  execSync("pnpm --filter @workspace/api-server run build", {
    cwd: ROOT,
    stdio: "inherit",
  });
  // The api-server build outputs to artifacts/api-server/dist/index.mjs
  const serverSrc = path.resolve(ROOT, "artifacts/api-server/dist/index.mjs");
  await cp(serverSrc, path.join(DIST, "server.mjs"));

  // ── 4. README ─────────────────────────────────────────────────────────────
  console.log("  Writing README …");
  await writeFile(
    path.join(DIST, "README.txt"),
    `Emberchain Node & Miner — Standalone Package
=============================================

REQUIREMENTS: Node.js 20 or newer (https://nodejs.org)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STANDALONE MINER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mine EMBR from your computer. Rewards are paid proportionally
  based on shares submitted.

  node emberchain-miner.js --address 0xYourWalletAddress

  Options:
    --address   <0x…>   Your EMBR wallet address (required)
    --node      <url>   Node to mine against (default: https://emberchain.org)
    --intensity <1-5>   CPU usage: 1=eco 3=balanced 5=max (default: 3)
    --shares    false   Disable share submission (default: enabled)

  Examples:
    node emberchain-miner.js --address 0xABC123 --intensity 3
    node emberchain-miner.js --address 0xABC123 --node http://localhost:8545 --intensity 5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FULL NODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Run your own Emberchain node. First run downloads the full chain
  history. Subsequent runs start instantly from local data.

  node emberchain-node.js

  Options:
    --peer    <url>   Bootstrap peer (default: https://emberchain.org)
    --port    <port>  Local port (default: 8545)
    --data    <dir>   Data directory (default: ./emberchain-data)
    --resync          Force re-download chain snapshot

  After startup, add to MetaMask:
    Network name : Emberchain
    RPC URL      : http://localhost:8545/api/rpc
    Chain ID     : 7773
    Currency     : EMBR

  NOTE: emberchain-node.js and server.mjs must be in the same folder.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RUN AS BACKGROUND SERVICE (Linux/macOS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # With pm2:
  npm install -g pm2
  pm2 start "node emberchain-miner.js --address 0xYour" --name embr-miner
  pm2 start "node emberchain-node.js" --name embr-node
  pm2 startup && pm2 save

  # With screen:
  screen -S embr-miner
  node emberchain-miner.js --address 0xYour
  # Ctrl+A, D  to detach

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LINKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Website  : https://emberchain.org
  Explorer : https://emberchain.org/ledger
`,
    "utf-8",
  );

  // ── 5. Copy to wallet public dir ──────────────────────────────────────────
  console.log("  Copying to wallet public/downloads …");
  await mkdir(WALLET_DOWNLOADS, { recursive: true });

  for (const file of ["emberchain-miner.js", "emberchain-node.js", "server.mjs", "README.txt"]) {
    await cp(path.join(DIST, file), path.join(WALLET_DOWNLOADS, file));
  }

  console.log(`
✅  Build complete!

Downloads available at:
  ${DIST}/
  ${WALLET_DOWNLOADS}/

Files:
  emberchain-miner.js  — standalone miner (~single file, run directly)
  emberchain-node.js   — node launcher   (needs server.mjs alongside it)
  server.mjs           — bundled server  (spawned by node launcher)
  README.txt           — user instructions
`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
