#!/usr/bin/env bash
# Build wallet + Ember Delta and publish to nginx on the seed server.
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
git pull origin main

echo "→ pnpm install"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "→ build wallet + ember-delta"
node scripts/build-vercel.mjs

echo "→ publish to ${WEB_ROOT}"
mkdir -p "$WEB_ROOT"
rsync -a --delete "${REPO_ROOT}/artifacts/wallet/dist/public/" "$WEB_ROOT/"
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
