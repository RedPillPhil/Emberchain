/**
 * Pre-build script for the Emberchain Wallet Electron app.
 *
 * Runs before electron-builder to:
 *   1. Build the wallet static UI   → artifacts/wallet/dist/public
 *   2. Build the API server bundle  → artifacts/api-server/dist/index.mjs
 *   3. Copy both into _resources/   (the extraResources source for electron-builder)
 */

import { execSync }       from 'child_process';
import { cpSync, mkdirSync, existsSync, rmSync } from 'fs';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(electronDir, '..', '..');

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd: workspaceRoot, stdio: 'inherit', ...opts });
}

// ── 1. Build wallet UI ─────────────────────────────────────────────────────────
run('pnpm --filter @workspace/wallet run build', {
  env: { ...process.env, BASE_PATH: '/', NODE_ENV: 'production' },
});

// ── 2. Build API server ────────────────────────────────────────────────────────
run('pnpm --filter @workspace/api-server run build', {
  env: { ...process.env, NODE_ENV: 'production' },
});

// ── 3. Copy into _resources/ ──────────────────────────────────────────────────
const resDir = path.join(electronDir, '_resources');

// Clean previous build
if (existsSync(resDir)) rmSync(resDir, { recursive: true, force: true });
mkdirSync(resDir, { recursive: true });

const walletDist  = path.join(workspaceRoot, 'artifacts', 'wallet', 'dist', 'public');
const serverDist  = path.join(workspaceRoot, 'artifacts', 'api-server', 'dist', 'index.mjs');

cpSync(walletDist, path.join(resDir, 'wallet-ui'), { recursive: true });
cpSync(serverDist, path.join(resDir, 'server.mjs'));

console.log('\n✅ Resources ready in _resources/');
console.log('   • wallet-ui/ (' + walletDist + ')');
console.log('   • server.mjs (' + serverDist + ')');
console.log('\nNow run: electron-builder (or pnpm dist:win / pnpm dist:mac / pnpm dist:linux)\n');
