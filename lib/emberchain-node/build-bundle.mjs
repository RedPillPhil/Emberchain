/**
 * build-bundle.mjs — builds only the standalone esbuild CJS bundle.
 *
 * Called by the GitHub Actions workflow on each platform BEFORE the
 * platform-specific SEA injection step. The full build.mjs also calls the
 * api-server build and handles copying to wallet/public — this script does
 * only the minimal esbuild step needed by CI.
 *
 * Usage: node lib/emberchain-node/build-bundle.mjs
 */

import { createRequire } from "node:module";
import { build as esbuild } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DIST = path.resolve(__dirname, "dist", "downloads");

await mkdir(DIST, { recursive: true });

console.log("Building emberchain-standalone.js …");

await esbuild({
  platform:       "node",
  bundle:         true,
  format:         "cjs",
  logLevel:       "info",
  absWorkingDir:  ROOT,
  external: [
    "*.node", "pg-native", "bufferutil", "utf-8-validate",
    "classic-level", "leveldown", "fsevents", "sharp", "canvas",
    "bcrypt", "argon2",
  ],
  banner: {
    js: `const { createRequire: __cr } = require('module');
const __path = require('path');
const __url = require('url');
globalThis.require = __cr(__filename);
globalThis.__filename = __filename;
globalThis.__dirname = __path.dirname(__filename);

// ── Critical env vars — set BEFORE any module-level code reads them ──────────
// chain.ts creates new Blockchain(CHAIN_DATA_FILE) at module load time (before
// main() runs). Without these defaults the path resolves to a bad relative
// location and crashes on Windows before any error handler is registered.
const __dataDir = __path.join(process.cwd(), 'emberchain-data');
if (!process.env.DATABASE_URL)    process.env.DATABASE_URL    = '';
if (!process.env.NODE_ENV)        process.env.NODE_ENV        = 'production';
if (!process.env.CHAIN_DATA_FILE) process.env.CHAIN_DATA_FILE = __path.join(__dataDir, 'chain.json');
if (!process.env.PEER_LIST_FILE)  process.env.PEER_LIST_FILE  = __path.join(__dataDir, 'peers.json');
if (!process.env.PORT)            process.env.PORT            = '8545';

// ── Crash handler — registered before module code so import-time errors are caught
const __fs = require('fs');
function __fatal(err) {
  const msg = (err && err.stack) ? err.stack : String(err);
  try { __fs.mkdirSync(__dataDir, { recursive: true }); } catch(_) {}
  try { __fs.appendFileSync(__path.join(__dataDir, 'emberchain-node.log'),
    '[' + new Date().toISOString() + '] FATAL ' + msg + '\\n'); } catch(_) {}
  console.error('\\n\\u274C  Fatal error:', msg);
  if (process.platform === 'win32') {
    console.error('\\nLog: ' + __path.join(__dataDir, 'emberchain-node.log'));
    console.error('Window closes in 60 s — press Ctrl+C to close now.');
    setTimeout(function() { process.exit(1); }, 60000).unref && setTimeout(function(){},0);
    // Keep event loop alive
    const _t = setInterval(function(){}, 5000);
    setTimeout(function(){ clearInterval(_t); process.exit(1); }, 60000);
  } else {
    process.exit(1);
  }
}
process.on('uncaughtException',  function(e){ __fatal(e); });
process.on('unhandledRejection', function(r){ __fatal(r instanceof Error ? r : new Error(String(r))); });`,
  },
  entryPoints:    [path.resolve(__dirname, "src/standalone.ts")],
  outfile:        path.join(DIST, "emberchain-standalone.js"),
  alias: {
    "pino": path.resolve(__dirname, "src/stub-pino.ts"),
  },
  define: {
    "import.meta.url": JSON.stringify("file:///standalone"),
  },
});

console.log("Done → dist/downloads/emberchain-standalone.js");
