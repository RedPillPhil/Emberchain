import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emberBallRoot = path.join(root, 'artifacts/ember-ball');
const buildOut = path.join(emberBallRoot, 'build');
const fallbackSrc = path.join(emberBallRoot, 'fallback');
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
  return result.status ?? 1;
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

function stageToWalletDist(sourceDir) {
  if (!existsSync(path.join(root, 'artifacts/wallet/dist/public'))) {
    console.warn('Wallet dist not found yet — skipping Ember Ball staging.');
    return false;
  }
  if (existsSync(stageDest)) {
    rmSync(stageDest, { recursive: true, force: true });
  }
  mkdirSync(path.dirname(stageDest), { recursive: true });
  cpSync(sourceDir, stageDest, { recursive: true });
  console.log('\n✓ Ember Ball staged at', stageDest);
  return true;
}

function stageFallback(reason) {
  console.warn(`\n⚠ Ember Ball fallback: ${reason}`);
  if (!existsSync(path.join(fallbackSrc, 'index.html'))) {
    console.error('Missing artifacts/ember-ball/fallback/index.html');
    return 1;
  }
  stageToWalletDist(fallbackSrc);
  return 0;
}

console.log('=== Ember Ball build ===');

if (!existsSync(emberBallRoot)) {
  console.error('Missing artifacts/ember-ball');
  process.exit(stageFallback('artifact directory not found'));
}

const nodeModules = path.join(emberBallRoot, 'node_modules');
if (!existsSync(nodeModules)) {
  const installStatus = run(
    'Install Ember Ball deps',
    'pnpm install --config.confirmModulesPurge=false',
    emberBallRoot,
    {
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
      npm_config_production: 'false',
    },
  );
  if (installStatus !== 0) {
    process.exit(stageFallback('pnpm install failed'));
  }
} else {
  console.log('\n▶ Ember Ball node_modules present — skipping install');
}

if (existsSync(buildOut) && process.env.EMBER_BALL_USE_EXISTING_BUILD === '1') {
  console.log('\n▶ Using existing Ember Ball build/');
} else {
  if (existsSync(buildOut)) {
    rmSync(buildOut, { recursive: true, force: true });
  }

  const buildStatus = run('Build Ember Ball (basketball)', 'pnpm run build', emberBallRoot, {
    SPORT: 'basketball',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    npm_config_production: 'false',
  });
  if (buildStatus !== 0) {
    process.exit(stageFallback('pnpm run build failed'));
  }
}

if (!existsSync(path.join(buildOut, 'index.html'))) {
  process.exit(stageFallback('build/index.html missing'));
}

console.log('\n▶ Rebase asset paths to', BASE);
rebaseBuildPaths(buildOut);

if (!stageToWalletDist(buildOut)) {
  process.exit(0);
}

const genDir = path.join(stageDest, 'gen');
if (existsSync(genDir)) {
  const uiBundle = readdirSync(genDir)
    .filter((name) => name === 'ui.js' || (name.startsWith('ui') && name.endsWith('.js')))
    .map((name) => path.join(genDir, name))
    .find((filePath) => existsSync(filePath));

  if (uiBundle) {
    const bundle = readFileSync(uiBundle, 'utf8');
    if (!bundle.includes('Ember Ball') && !bundle.includes('ember-ball')) {
      console.warn('⚠ Ember Ball bundle may be stale — verify branding in', uiBundle);
    }
  }
}

process.exit(0);
