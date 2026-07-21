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
// Set DATABASE_URL before any module-level code reads it.
// Some pg / db modules check this at load time, before main() runs.
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = '';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';`,
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
