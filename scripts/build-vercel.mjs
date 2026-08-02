import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} label */
function run(label, command, env = {}) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

const emberDist = path.join(root, 'artifacts/ember-delta/dist');
const emberOut = path.join(emberDist, 'public');
const stageDest = path.join(root, 'artifacts/wallet/dist/public/ember-delta');

run('Build wallet', 'pnpm --filter @workspace/wallet run build', {
  VITE_EXCHANGE_ESCROW_DOWN: 'false',
});

if (existsSync(emberDist)) {
  rmSync(emberDist, { recursive: true, force: true });
  console.log('Cleared cached Ember Delta dist');
}

run('Build Ember Delta', 'pnpm --filter @workspace/ember-delta run build', {
  BASE_PATH: '/ember-delta/',
  NODE_ENV: 'production',
});

if (!existsSync(emberOut)) {
  console.error('Ember Delta build output not found:', emberOut);
  process.exit(1);
}

cpSync(emberOut, stageDest, { recursive: true });

const assetsDir = path.join(stageDest, 'assets');
if (!existsSync(assetsDir)) {
  console.error('Ember Delta assets directory missing:', assetsDir);
  process.exit(1);
}

const mainBundle = readdirSync(assetsDir)
  .filter((name) => name.startsWith('index-') && name.endsWith('.js'))
  .map((name) => {
    const filePath = path.join(assetsDir, name);
    return { name, size: statSync(filePath).size, filePath };
  })
  .sort((a, b) => b.size - a.size)[0];

if (!mainBundle) {
  console.error('No Ember Delta JS bundle found in', assetsDir);
  process.exit(1);
}

const bundleSource = readFileSync(mainBundle.filePath, 'utf8');
const requiredMarkers = [
  'No trade history yet',
  'Deposit required',
  'Wallet balance cannot',
];
const staleMarkers = ['generateCandles'];

const missing = requiredMarkers.filter((marker) => !bundleSource.includes(marker));
const stale = staleMarkers.filter((marker) => bundleSource.includes(marker));

if (missing.length > 0 || stale.length > 0) {
  console.error('\n✗ Ember Delta bundle verification failed');
  if (missing.length > 0) {
    console.error('  Missing:', missing.join(', '));
  }
  if (stale.length > 0) {
    console.error('  Stale code still present:', stale.join(', '));
  }
  console.error('  Bundle:', mainBundle.name);
  process.exit(1);
}

console.log('\n✓ Verified Ember Delta bundle:', mainBundle.name);
console.log('✓ Staged at', stageDest);
