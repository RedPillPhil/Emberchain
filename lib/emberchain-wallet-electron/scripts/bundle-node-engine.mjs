/**
 * Bundles the embedded node engine for EmberChain Desktop.
 * Output: lib/emberchain-wallet-electron/node-engine-bundle.cjs
 *
 * Run: node lib/emberchain-wallet-electron/scripts/bundle-node-engine.mjs
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..", "..", "..");  // workspace root
const PKG_DIR   = path.resolve(__dirname, "..");              // lib/emberchain-wallet-electron

// Resolve esbuild from lib/emberchain-node (which IS in the pnpm workspace)
// because lib/emberchain-wallet-electron is excluded from workspace resolution.
const requireFromNode = createRequire(
  path.resolve(ROOT, "lib/emberchain-node/build-bundle.mjs")
);
const { build: esbuild } = requireFromNode("esbuild");
globalThis.require = createRequire(import.meta.url);

console.log("Building node-engine-bundle.cjs…");

await esbuild({
  platform:      "node",
  bundle:        true,
  format:        "cjs",
  logLevel:      "info",
  absWorkingDir: ROOT,
  external: [
    "electron",
    "*.node", "pg-native", "bufferutil", "utf-8-validate",
    "classic-level", "leveldown", "fsevents", "sharp", "canvas",
    "bcrypt", "argon2",
  ],
  // Env-var defaults set BEFORE any module-level code runs.
  // main.js overrides these with the real Electron userData paths
  // right before require()ing this bundle.
  banner: {
    js: `
if (!process.env.DATABASE_URL)    process.env.DATABASE_URL    = '';
if (!process.env.NODE_ENV)        process.env.NODE_ENV        = 'production';
if (!process.env.NODE_URL)        process.env.NODE_URL        = '';
if (!process.env.PORT)            process.env.PORT            = '17545';
if (!process.env.CHAIN_DATA_FILE) process.env.CHAIN_DATA_FILE =
  require('path').join(require('os').homedir(), '.emberchain', 'chain.json');
if (!process.env.PEER_LIST_FILE)  process.env.PEER_LIST_FILE  =
  require('path').join(require('os').homedir(), '.emberchain', 'peers.json');
if (!process.env.SEED_PEERS)      process.env.SEED_PEERS      = 'https://emberchain.org';
// fileURLToPath safety patch
(function(){ var u=require('url'),o=u.fileURLToPath;
  u.fileURLToPath=function(x){ var s=(x&&x.href)?x.href:String(x);
    if(s==='file:///standalone') return require('path').join(__dirname,'standalone');
    try{return o.call(this,x);}catch(_){return __dirname;} }; })();
`.trim(),
  },
  entryPoints: [path.resolve(PKG_DIR, "src", "embedded-node.ts")],
  outfile:     path.join(PKG_DIR, "node-engine-bundle.cjs"),
  alias: {
    "pino":      path.resolve(ROOT, "lib/emberchain-node/src/stub-pino.ts"),
    "pino-http": path.resolve(ROOT, "lib/emberchain-node/src/stub-pino-http.ts"),
  },
  define: { "import.meta.url": JSON.stringify("file:///standalone") },
  // Force the three entry-point exports to be reachable as CJS exports.
  // esbuild sometimes emits them as `0 && (module.exports = {...})` dead code
  // when it detects mixed CJS/ESM interop; this footer overrides that.
  footer: {
    js: [
      "if (typeof startEmbeddedNode !== 'undefined') {",
      "  exports.startEmbeddedNode = startEmbeddedNode;",
      "  exports.stopEmbeddedNode  = stopEmbeddedNode;",
      "  exports.getNodeStatus     = getNodeStatus;",
      "}",
    ].join("\n"),
  },
});

console.log("Done → node-engine-bundle.cjs");
