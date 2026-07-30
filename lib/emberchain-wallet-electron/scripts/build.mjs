/**
 * Pre-package script for electron-builder.
 * The new desktop wallet is self-contained — no server bundle needed.
 * This script just validates the renderer files are in place.
 */
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const required = [
  join(root, 'main.js'),
  join(root, 'preload.js'),
  join(root, 'renderer', 'index.html'),
  join(root, 'renderer', 'app.css'),
  join(root, 'renderer', 'app.js'),
];

let ok = true;
for (const f of required) {
  if (!existsSync(f)) {
    console.error(`Missing: ${f}`);
    ok = false;
  } else {
    console.log(`✓ ${f.replace(root, '.')}`);
  }
}

if (!ok) process.exit(1);
console.log('\nReady for electron-builder.');
