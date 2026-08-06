#!/usr/bin/env bash
# Build only Ember Ball and publish to nginx web root (no wallet rebuild).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_ROOT="/var/www/emberchain"

cd "$REPO_ROOT"
echo "=== Ember Ball only deploy ==="
git pull --ff-only origin main

export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
node scripts/build-ember-ball.mjs

mkdir -p "${WEB_ROOT}/ember-ball"
rsync -a --delete "${REPO_ROOT}/artifacts/wallet/dist/public/ember-ball/" "${WEB_ROOT}/ember-ball/"
chmod -R a+rX "${WEB_ROOT}/ember-ball"
chown -R www-data:www-data "${WEB_ROOT}/ember-ball" 2>/dev/null || true

echo "✓ Published ${WEB_ROOT}/ember-ball/"
ls -la "${WEB_ROOT}/ember-ball/index.html"
curl -sS -o /dev/null -w "GET /ember-ball/ → HTTP %{http_code}\n" http://127.0.0.1/ember-ball/
