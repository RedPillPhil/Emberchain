#!/usr/bin/env bash
# Build and run Ember Airdrop (Next.js) at https://emberchain.org/airdrop → :43774
# Backend API + EMBR payouts live in api-server (/api/airdrop/*).
#
# SECURITY: AIRDROP_DISTRIBUTOR_PRIVATE_KEY belongs ONLY in /etc/emberchain/api-server.env
# on the server — never in this repo, git, or logs. Fund the distributor wallet with EMBR.
set -euo pipefail

AIRDROP_ROOT="${AIRDROP_ROOT:-/root/Emberchain/ember-airdrop}"
ENV_FILE="/etc/emberchain/ember-airdrop.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_UNIT="${SCRIPT_DIR}/emberchain-airdrop.service"

echo "=== Ember Airdrop deploy ==="

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Create $ENV_FILE from scripts/deploy-vm/ember-airdrop.env.example"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

export NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/airdrop}"
export NEXT_PUBLIC_SITE_ORIGIN="${NEXT_PUBLIC_SITE_ORIGIN:-https://emberchain.org}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-43774}"

if [[ ! -d "$AIRDROP_ROOT" ]]; then
  echo "✗ Missing $AIRDROP_ROOT — ensure ember-airdrop is in the Emberchain repo"
  exit 1
fi

echo "→ npm ci + test + build"
cd "$AIRDROP_ROOT"
npm ci
npm test
npm run build

STANDALONE="$AIRDROP_ROOT/.next/standalone"
if [[ ! -f "$STANDALONE/server.js" ]]; then
  echo "✗ Missing $STANDALONE/server.js"
  exit 1
fi

echo "→ stage standalone static assets"
mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/.next/static"
cp -r "$AIRDROP_ROOT/.next/static" "$STANDALONE/.next/static"
if [[ -d "$AIRDROP_ROOT/public" ]]; then
  rm -rf "$STANDALONE/public"
  cp -r "$AIRDROP_ROOT/public" "$STANDALONE/public"
fi

echo "→ install systemd unit"
cp "$SERVICE_UNIT" /etc/systemd/system/emberchain-airdrop.service
systemctl daemon-reload
systemctl enable emberchain-airdrop
systemctl restart emberchain-airdrop

sleep 2
if ! systemctl is-active --quiet emberchain-airdrop; then
  echo "✗ emberchain-airdrop failed to start"
  journalctl -u emberchain-airdrop -n 30 --no-pager
  exit 1
fi

echo "→ health check"
curl -sf "http://127.0.0.1:${PORT}${NEXT_PUBLIC_BASE_PATH}/api/health" | head -c 400 || {
  echo "✗ health check failed"
  journalctl -u emberchain-airdrop -n 20 --no-pager
  exit 1
}

echo ""
echo "=== Ember Airdrop deploy complete ==="
echo "  https://emberchain.org/airdrop"
echo "  Ensure api-server has AIRDROP_DISTRIBUTOR_PRIVATE_KEY in /etc/emberchain/api-server.env"
echo "  systemctl status emberchain-airdrop"
