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

  /** @param {string} content */
  const rebaseContent = (content) => {
    let next = content.replace(
      /window\.bbgmBasePath\s*=\s*""/g,
      `window.bbgmBasePath="${BASE}"`,
    );
    for (const prefix of prefixes) {
      const rebased = `${BASE}${prefix}`;
      let i = 0;
      let out = '';
      while (i < next.length) {
        const idx = next.indexOf(prefix, i);
        if (idx === -1) {
          out += next.slice(i);
          break;
        }
        const before = next.slice(Math.max(0, idx - BASE.length), idx);
        if (before === BASE) {
          out += next.slice(i, idx + prefix.length);
        } else {
          out += next.slice(i, idx) + rebased;
        }
        i = idx + prefix.length;
      }
      next = out;
    }
    return next;
  };

  /** @param {string} filePath */
  const rewriteFile = (filePath) => {
    const ext = path.extname(filePath);
    if (!exts.has(ext) && !filePath.endsWith('sw.js')) return;
    const src = readFileSync(filePath, 'utf8');

    // index.html uses asset() + hardcoded /ember-ball paths — only verify base path.
    if (path.basename(filePath) === 'index.html') {
      if (!src.includes('bbgmBasePath="/ember-ball"') && !src.includes('bbgmBasePath = "/ember-ball"')) {
        console.warn('⚠ index.html missing bbgmBasePath="/ember-ball"');
      }
      return;
    }

    // UI bundles resolve paths at runtime via assetPath() — rebasing breaks them.
    const name = path.basename(filePath);
    if (name.startsWith('ui-') || name.startsWith('ui-chunk-')) {
      return;
    }

    const next = rebaseContent(src);
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
    UI_SHELL: 'desktop',
    BBGM_BASE_PATH: BASE,
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

const indexHtml = readFileSync(path.join(buildOut, 'index.html'), 'utf8');
if (
  !indexHtml.includes('bbgmBasePath="/ember-ball"') &&
  !indexHtml.includes('bbgmBasePath = "/ember-ball"')
) {
  console.warn('\n⚠ index.html missing bbgmBasePath="/ember-ball" — subpath routing may break');
}

const genDir = path.join(buildOut, 'gen');

if (existsSync(genDir)) {
  const workerBundle = readdirSync(genDir).find(
    (name) => name.startsWith('worker-') && name.endsWith('.js'),
  );
  if (workerBundle) {
    const workerContent = readFileSync(path.join(genDir, workerBundle), 'utf8');
    if (workerContent.includes('fetch("/gen/') || workerContent.includes("fetch('/gen/")) {
      console.warn(`⚠ Worker bundle may have unrebased fetch paths: ${workerBundle}`);
    }
  }
}

if (!stageToWalletDist(buildOut)) {
  process.exit(0);
}

const stagedGenDir = path.join(stageDest, 'gen');
if (existsSync(stagedGenDir)) {
  const uiBundle = readdirSync(stagedGenDir)
    .filter((name) => name === 'ui.js' || (name.startsWith('ui') && name.endsWith('.js')))
    .map((name) => path.join(stagedGenDir, name))
    .find((filePath) => existsSync(filePath));

  if (uiBundle) {
    const bundle = readFileSync(uiBundle, 'utf8');
    if (!bundle.includes('Ember Ball') && !bundle.includes('ember-ball')) {
      console.warn('⚠ Ember Ball bundle may be stale — verify branding in', uiBundle);
    }
  }
}

process.exit(0);
