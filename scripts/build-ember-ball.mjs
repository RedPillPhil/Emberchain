import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emberBallRoot = path.join(root, 'artifacts/ember-ball');
const buildOut = path.join(emberBallRoot, 'build');
const stageDest = path.join(root, 'artifacts/wallet/dist/public/ember-ball');
const BASE = '/ember-ball';

/** @param {string} label */
function run(label, command, cwd, env = {}) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

/** Rewrite absolute asset paths for subpath hosting. */
function rebaseBuildPaths(dir) {
  const prefixes = ['/gen/', '/ico/', '/img/', '/files/', '/manifest.webmanifest', '/sw.js'];
  const exts = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.map']);

  /** @param {string} filePath */
  const rewriteFile = (filePath) => {
    const ext = path.extname(filePath);
    if (!exts.has(ext) && !filePath.endsWith('sw.js')) return;
    let src = readFileSync(filePath, 'utf8');
    let next = src;
    for (const prefix of prefixes) {
      const rebased = `${BASE}${prefix}`;
      next = next.split(`"${prefix}`).join(`"${rebased}`);
      next = next.split(`'${prefix}`).join(`'${rebased}`);
    }
    if (next !== src) writeFileSync(filePath, next);
  };

  /** @param {string} current */
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const filePath = path.join(current, name);
      const info = statSync(filePath);
      if (info.isDirectory()) walk(filePath);
      else rewriteFile(filePath);
    }
  };

  walk(dir);
}

console.log('=== Ember Ball build ===');

if (!existsSync(emberBallRoot)) {
  console.error('Missing artifacts/ember-ball — import the ZenGM Ember Ball project first.');
  process.exit(1);
}

const nodeModules = path.join(emberBallRoot, 'node_modules');
if (!existsSync(nodeModules)) {
  run('Install Ember Ball deps', 'pnpm install --config.confirmModulesPurge=false', emberBallRoot, {
    CI: 'true',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  });
} else {
  console.log('\n▶ Ember Ball node_modules present — skipping install');
}

if (existsSync(buildOut) && process.env.EMBER_BALL_USE_EXISTING_BUILD === '1') {
  console.log('\n▶ Using existing Ember Ball build/');
} else {
  if (existsSync(buildOut)) {
    rmSync(buildOut, { recursive: true, force: true });
  }

  run('Build Ember Ball (basketball)', 'pnpm run build', emberBallRoot, {
    SPORT: 'basketball',
    CI: 'true',
  });
}

if (!existsSync(path.join(buildOut, 'index.html'))) {
  console.error('Ember Ball build output missing index.html:', buildOut);
  process.exit(1);
}

console.log('\n▶ Rebase asset paths to', BASE);
rebaseBuildPaths(buildOut);

if (!existsSync(path.join(root, 'artifacts/wallet/dist/public'))) {
  console.warn('Wallet dist not found yet — skipping Ember Ball staging (run wallet build first).');
  process.exit(0);
}

if (existsSync(stageDest)) {
  rmSync(stageDest, { recursive: true, force: true });
}

cpSync(buildOut, stageDest, { recursive: true });

const uiBundle = readdirSync(path.join(stageDest, 'gen'))
  .filter((name) => name === 'ui.js' || (name.startsWith('ui') && name.endsWith('.js')))
  .map((name) => path.join(stageDest, 'gen', name))
  .find((filePath) => existsSync(filePath));

if (uiBundle) {
  const bundle = readFileSync(uiBundle, 'utf8');
  if (!bundle.includes('Ember Ball') && !bundle.includes('ember-ball')) {
    console.warn('⚠ Ember Ball bundle may be stale — verify branding in', uiBundle);
  }
}

console.log('\n✓ Ember Ball staged at', stageDest);
