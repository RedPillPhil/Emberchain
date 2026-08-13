#!/usr/bin/env bash
# Build wallet + Ember Delta and publish to nginx on the seed server.
#
# CHAIN-SAFE: This script does NOT touch chain.json, restart chain-node,
# run migrations, or call any /api/sync/* endpoints. Website static files only.
#
# Run on the VM (same host as chain-node):
#   cd /root/Emberchain/emberchain
#   bash scripts/deploy-vm/deploy-static-from-git.sh
#
# Prerequisites: node 20+, pnpm, nginx, certbot, emberchain-node on :8080 (PORT in systemd)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_ROOT="/var/www/emberchain"
NGINX_SITE="/etc/nginx/sites-available/emberchain"

echo "=== EmberChain static deploy (from git) ==="
cd "$REPO_ROOT"

echo "→ git pull"
git fetch origin main
BEFORE="$(git rev-parse HEAD)"
git pull --ff-only origin main || {
  echo ""
  echo "✗ git pull failed — deploy aborted so we do not publish stale static files."
  echo "  Current HEAD: $(git rev-parse --short HEAD)"
  echo "  origin/main:  $(git rev-parse --short origin/main)"
  echo "  Fix: cd $(pwd) && git fetch origin && git reset --hard origin/main"
  echo "  (Back up artifacts/data/chain.json first if this repo runs chain-node.)"
  exit 1
}
AFTER="$(git rev-parse HEAD)"
echo "  HEAD ${BEFORE:0:7} → ${AFTER:0:7} ($(git log -1 --oneline))"

echo "→ disk check"
df -h / | tail -1
INODE_USE="$(df -i / 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%' || echo 0)"
DISK_USE="$(df / | tail -1 | awk '{print $5}' | tr -d '%')"
if [[ "${INODE_USE:-0}" -gt 95 ]] || [[ "${DISK_USE:-0}" -gt 95 ]]; then
  echo "⚠ Low disk or inodes — running free-disk-for-build.sh"
  bash "$(dirname "$0")/free-disk-for-build.sh"
fi

echo "→ clear stale dist (frees space before vite write)"
rm -rf "${REPO_ROOT}/artifacts/wallet/dist" "${REPO_ROOT}/artifacts/ember-delta/dist"

echo "→ pnpm install"
export CI=true
pnpm install --frozen-lockfile --config.confirmModulesPurge=false 2>/dev/null \
  || pnpm install --config.confirmModulesPurge=false

echo "→ build wallet + ember-delta"
node scripts/build-vercel.mjs

echo "→ verify built wallet contains Games nav + sidebar"
if ! grep -rq 'landing-games-grid\|WBBL' "${REPO_ROOT}/artifacts/wallet/dist/public/assets/"* 2>/dev/null; then
  echo "✗ Built wallet bundle is missing the Games landing section — aborting publish"
  exit 1
fi

echo "→ publish to ${WEB_ROOT}"
mkdir -p "$WEB_ROOT"
rsync -a --delete "${REPO_ROOT}/artifacts/wallet/dist/public/" "$WEB_ROOT/"
chmod -R a+rX "$WEB_ROOT"
chown -R www-data:www-data "$WEB_ROOT" 2>/dev/null || true

if [[ -f "${REPO_ROOT}/scripts/deploy-vm/nginx-emberchain.conf" ]]; then
  echo "→ install nginx site config"
  cp "${REPO_ROOT}/scripts/deploy-vm/nginx-emberchain.conf" "$NGINX_SITE"
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/emberchain
  rm -f /etc/nginx/sites-enabled/default
fi

echo "→ test nginx"
nginx -t

echo "→ reload nginx"
systemctl reload nginx

echo ""
echo "=== Done ==="
echo "  https://emberchain.org/"
echo "  https://emberchain.duckdns.org/"
echo "  curl -s https://emberchain.org/api/healthz"
