import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'artifacts/ember-delta/dist/public');
const dest = path.join(root, 'artifacts/wallet/dist/public/ember-delta');

if (!existsSync(src)) {
  console.error('Ember Delta build output not found:', src);
  process.exit(1);
}

cpSync(src, dest, { recursive: true });
console.log('Staged Ember Delta at', dest);
