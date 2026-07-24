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

  // ── 3. Bundled chain-node server ──────────────────────────────────────────────
  // The standalone node needs the chain-node bundle (not the api-server), because
  // chain-node owns the blockchain state, exportSnapshot, and sync routes.
  // api-server is a proxy layer that requires a separate chain-node to talk to.
  console.log("  Building chain-node server …");
  const { execSync } = await import("node:child_process");
  execSync("pnpm --filter @workspace/chain-node run build", {
    cwd: ROOT,
    stdio: "inherit",
  });
  // chain-node build outputs to artifacts/chain-node/dist/index.mjs
  const serverSrc = path.resolve(ROOT, "artifacts/chain-node/dist/index.mjs");
  await cp(serverSrc, path.join(DIST, "server.mjs"));

  // ── 4. Standalone executable (UPnP + in-process server, no Node.js required) ─
  console.log("  Building standalone executable bundle …");
  // Bundle standalone.ts (launcher + full server) into a single CJS file for pkg.
  // pino is replaced with a console.log stub so there are no worker-thread issues
  // inside the pkg binary.
  await esbuild({
    ...sharedConfig,
    format: "cjs",
    entryPoints: [path.resolve(__dirname, "src/standalone.ts")],
    outfile: path.join(DIST, "emberchain-standalone.js"),
    alias: {
      // Swap pino for a lightweight console.log stub — no worker threads needed
      "pino": path.resolve(__dirname, "src/stub-pino.ts"),
    },
    define: {
      "import.meta.url": JSON.stringify("file:///standalone"),
    },
  });

  // ── Linux native binary via Node.js SEA ────────────────────────────────────
  // Windows & macOS executables are built by GitHub Actions (.github/workflows/release-node.yml)
  // using the native runner for each platform.
  console.log("  Building Linux native executable via Node.js SEA …");
  try {
    const seaConfig = JSON.stringify({
      main: path.join(DIST, "emberchain-standalone.js"),
      output: path.join(DIST, "sea-prep.blob"),
      disableExperimentalSEAWarning: true,
    });
    const seaConfigPath = path.join(DIST, "sea-config.json");
    (await import("node:fs")).writeFileSync(seaConfigPath, seaConfig);

    execSync(`node --experimental-sea-config "${seaConfigPath}"`, {
      cwd: ROOT, stdio: "inherit",
    });

    // Resolve the real ELF binary — in Nix-based envs process.execPath is a wrapper script
    let nodeBin = process.execPath;
    if (process.platform !== "win32") {
      // Follow any shell wrapper to find the actual ELF
      const { execSync: ex } = await import("node:child_process");
      try {
        const resolved = ex(`cat "${nodeBin}" | grep -oE '/nix/store/[^ ]+/bin/node'`, { encoding: "utf-8" }).trim().split("\n")[0];
        if (resolved && (await import("node:fs")).existsSync(resolved)) nodeBin = resolved;
      } catch { /* not a Nix wrapper — use process.execPath directly */ }
    }
    const outBin  = path.join(DIST, "emberchain-node-linux");
    (await import("node:fs")).copyFileSync(nodeBin, outBin);
    (await import("node:fs")).chmodSync(outBin, 0o755);

    // Find postject — try global npm install, then npx
    let postjectBin = "postject";
    const npmGlobal = (await import("node:os")).homedir();
    const candidates = [
      path.join(npmGlobal, ".config/npm/node_global/bin/postject"),
      "/usr/local/bin/postject",
    ];
    for (const c of candidates) {
      if ((await import("node:fs")).existsSync(c)) { postjectBin = c; break; }
    }
    execSync(
      `"${postjectBin}" "${outBin}" NODE_SEA_BLOB "${path.join(DIST, "sea-prep.blob")}" ` +
      `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
      { cwd: ROOT, stdio: "inherit", timeout: 120_000 },
    );
    console.log("  ✅  Linux executable ready: emberchain-node-linux");
    console.log("  ℹ️   Windows & macOS: auto-built by GitHub Actions on each tag push.");
  } catch (err) {
    console.warn("  ⚠️   SEA build failed — skipping Linux executable.");
    console.warn("      Error:", err.message?.slice(0, 200));
  }

  // ── 5. README ─────────────────────────────────────────────────────────────
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

  // ── 6. bootstrap-peers.json ───────────────────────────────────────────────
  // This file ships with every release so a fresh node can find the network
  // even if the main website (emberchain.org) is offline. Node operators
  // should submit a PR to add their --url to this list.
  const bpSrc = path.resolve(__dirname, "dist", "downloads", "bootstrap-peers.json");
  // The file is maintained in source; just make sure it's in DIST
  // (it's already there from a prior build step — the .gitignore exception
  //  keeps dist/downloads in the repo). Nothing to generate here.

  // ── 7. Copy to wallet public dir ──────────────────────────────────────────
  console.log("  Copying to wallet public/downloads …");
  await mkdir(WALLET_DOWNLOADS, { recursive: true });

  for (const file of [
    "emberchain-miner.js",
    "emberchain-node.js",
    "server.mjs",
    "README.txt",
    "bootstrap-peers.json",
    // Native executables — only present if pkg step succeeded
    "emberchain-node",           // linux
    "emberchain-node.exe",       // windows
    "emberchain-node-macos-arm64", // mac (arm)
  ]) {
    try {
      await cp(path.join(DIST, file), path.join(WALLET_DOWNLOADS, file));
    } catch { /* file may not exist — skip */ }
  }

  console.log(`
✅  Build complete!

Downloads available at:
  ${DIST}/
  ${WALLET_DOWNLOADS}/

Files:
  emberchain-node         — Linux native executable (no Node.js needed)
  emberchain-node.exe     — Windows native executable (no Node.js needed)
  emberchain-node-macos-arm64 — macOS (M1/M2) native executable
  emberchain-miner.js     — standalone miner (requires Node.js)
  emberchain-node.js      — node launcher (requires Node.js + server.mjs)
  server.mjs              — bundled server (spawned by node launcher)
  bootstrap-peers.json    — known community nodes
  README.txt              — user instructions
`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
