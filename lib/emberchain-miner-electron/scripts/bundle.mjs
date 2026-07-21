/**
 * Bundle the mining worker using the workspace's esbuild + ethereum-cryptography.
 * Output: lib/emberchain-miner-electron/worker-bundle.js  (CJS, self-contained)
 *
 * Run from workspace root: node lib/emberchain-miner-electron/scripts/bundle.mjs
 * Or from the package dir:  node scripts/bundle.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__dirname, "..", "..", "..");   // workspace root
const PKG_DIR = path.resolve(__dirname, "..");               // lib/emberchain-miner-electron

// Resolve esbuild from the pnpm virtual store (it's not hoisted to root)
const pnpmStore = path.join(ROOT, "node_modules/.pnpm/node_modules");
const rootRequire = createRequire(path.join(pnpmStore, "esbuild", "package.json"));
const { build } = rootRequire("esbuild");

const result = await build({
  entryPoints:   [path.join(PKG_DIR, "src", "worker.ts")],
  bundle:        true,
  platform:      "node",
  format:        "cjs",
  logLevel:      "info",
  absWorkingDir: ROOT,
  // Tell esbuild where pnpm hoists packages (virtual store + workspace root)
  nodePaths: [
    path.join(ROOT, "node_modules/.pnpm/node_modules"),
    path.join(ROOT, "node_modules"),
  ],
  // Electron's worker_threads module is built-in — keep it external
  external:      ["worker_threads"],
  outfile:       path.join(PKG_DIR, "worker-bundle.js"),
});

console.log("✅  worker-bundle.js written →", path.join(PKG_DIR, "worker-bundle.js"));
