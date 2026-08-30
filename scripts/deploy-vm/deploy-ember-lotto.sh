#!/usr/bin/env bash
# Build and run the real Ember Lotto (Next.js) from github.com/RedPillPhil/ember-lotto
# Proxied at https://emberchain.org/lotto via nginx → :43773
set -euo pipefail

LOTTO_ROOT="${LOTTO_ROOT:-/root/Emberchain/ember-lotto}"
LOTTO_REPO="${LOTTO_REPO:-https://github.com/RedPillPhil/ember-lotto.git}"
ENV_FILE="/etc/emberchain/ember-lotto.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_UNIT="${SCRIPT_DIR}/emberchain-lotto.service"

echo "=== Ember Lotto deploy (ember-lotto repo) ==="

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Create $ENV_FILE from scripts/deploy-vm/ember-lotto.env.example"
  echo "Set DRAW_OPERATOR_PRIVATE_KEY (same as BRIDGE_RELAYER_PRIVATE_KEY is fine)."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${DRAW_OPERATOR_PRIVATE_KEY:-}" ]]; then
  echo "DRAW_OPERATOR_PRIVATE_KEY is required in $ENV_FILE"
  exit 1
fi

export NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/lotto}"
export NEXT_PUBLIC_SITE_ORIGIN="${NEXT_PUBLIC_SITE_ORIGIN:-https://emberchain.org}"
export NEXT_PUBLIC_EMBER_LOTTERY="${NEXT_PUBLIC_EMBER_LOTTERY:-0x6e0dc9421292a72d9bbb8ccb41e33448b96ff28e}"
export NEXT_PUBLIC_BASE_LOTTERY="${NEXT_PUBLIC_BASE_LOTTERY:-0x53be2a4c134ed203cd0b683d8e66bef4a0f490b6}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-43773}"

if [[ ! -d "$LOTTO_ROOT/.git" ]]; then
  echo "→ clone $LOTTO_REPO"
  git clone "$LOTTO_REPO" "$LOTTO_ROOT"
else
  echo "→ git pull"
  git -C "$LOTTO_ROOT" fetch origin main
  git -C "$LOTTO_ROOT" reset --hard origin/main
fi

echo "→ npm ci + test + build"
cd "$LOTTO_ROOT"
npm ci
npm test
npm run build

STANDALONE="$LOTTO_ROOT/.next/standalone"
if [[ ! -f "$STANDALONE/server.js" ]]; then
  echo "✗ Missing $STANDALONE/server.js"
  exit 1
fi

echo "→ stage standalone static assets"
mkdir -p "$STANDALONE/.next"
rm -rf "$STANDALONE/.next/static"
cp -r "$LOTTO_ROOT/.next/static" "$STANDALONE/.next/static"
if [[ -d "$LOTTO_ROOT/public" ]]; then
  rm -rf "$STANDALONE/public"
  cp -r "$LOTTO_ROOT/public" "$STANDALONE/public"
fi

echo "→ install systemd unit"
cp "$SERVICE_UNIT" /etc/systemd/system/emberchain-lotto.service
systemctl daemon-reload
systemctl enable emberchain-lotto
systemctl restart emberchain-lotto

sleep 2
if ! systemctl is-active --quiet emberchain-lotto; then
  echo "✗ emberchain-lotto failed to start"
  journalctl -u emberchain-lotto -n 30 --no-pager
  exit 1
fi

echo "→ health check"
curl -sf "http://127.0.0.1:${PORT}${NEXT_PUBLIC_BASE_PATH}/api/health" | head -c 400 || {
  echo "✗ health check failed"
  journalctl -u emberchain-lotto -n 20 --no-pager
  exit 1
}

echo ""
echo "=== Ember Lotto deploy complete ==="
echo "  https://emberchain.org/lotto"
echo "  systemctl status emberchain-lotto"
