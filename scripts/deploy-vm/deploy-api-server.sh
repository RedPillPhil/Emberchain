#!/usr/bin/env bash
# Build and start api-server (exchange escrow + token launch). Requires PostgreSQL.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=scripts/deploy-vm/docker-compose.sh
source "$(dirname "$0")/docker-compose.sh"

echo "=== EmberChain api-server deploy ==="

if [[ ! -f /etc/emberchain/api-server.env ]]; then
  echo "Create /etc/emberchain/api-server.env from scripts/deploy-vm/api-server.env.example"
  exit 1
fi

if ! curl -sf http://127.0.0.1:8080/api/healthz >/dev/null; then
  echo "chain-node must be running on :8080 first"
  exit 1
fi

if ! compose -f scripts/deploy-vm/docker-compose.yml ps postgres 2>/dev/null | grep -q running; then
  echo "→ starting PostgreSQL"
  COMPOSE_ENV="scripts/deploy-vm/.env"
  if [[ -f "$COMPOSE_ENV" ]]; then
    compose -f scripts/deploy-vm/docker-compose.yml --env-file "$COMPOSE_ENV" up -d postgres
  else
    compose -f scripts/deploy-vm/docker-compose.yml up -d postgres
  fi
  sleep 3
fi

echo "→ pnpm install"
export CI=true
pnpm install --frozen-lockfile --config.confirmModulesPurge=false 2>/dev/null \
  || pnpm install --config.confirmModulesPurge=false

echo "→ build api-server"
pnpm --filter @workspace/api-server run build

echo "→ install systemd unit"
cp scripts/deploy-vm/emberchain-api.service /etc/systemd/system/emberchain-api.service
systemctl daemon-reload
systemctl enable emberchain-api
systemctl restart emberchain-api

sleep 2
echo "→ health check"
curl -sf http://127.0.0.1:8081/api/healthz && echo ""
curl -sf http://127.0.0.1:8081/api/exchange/listings | head -c 200 && echo ""
echo "=== api-server deploy complete ==="
