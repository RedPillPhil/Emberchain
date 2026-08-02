#!/usr/bin/env bash
# One-time (or repeat) setup for exchange escrow + api-server on the seed server.
# Automated bridging is configured separately on chain-node (see emberchain-node.service.example).
#
# Run on emberchain-seed-1:
#   cd ~/Emberchain/emberchain
#   git pull origin main
#   bash scripts/deploy-vm/setup-full-stack.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"
ENV_FILE="/etc/emberchain/api-server.env"
COMPOSE_ENV="${REPO_ROOT}/scripts/deploy-vm/.env"

echo "=== EmberChain full-stack setup ==="

# ── prerequisites ────────────────────────────────────────────────────────────
command -v docker >/dev/null || { echo "Install docker first"; exit 1; }
command -v pnpm >/dev/null || { echo "Install pnpm/node 20+ first"; exit 1; }

if ! curl -sf http://127.0.0.1:8080/api/healthz >/dev/null; then
  echo "chain-node must be running on :8080 first (systemctl start emberchain-node)"
  exit 1
fi
echo "✓ chain-node is up on :8080"

# ── PostgreSQL password (docker-compose + DATABASE_URL must match) ───────────
if [[ ! -f "$COMPOSE_ENV" ]]; then
  PG_PASS="$(openssl rand -hex 16)"
  echo "POSTGRES_PASSWORD=${PG_PASS}" > "$COMPOSE_ENV"
  chmod 600 "$COMPOSE_ENV"
  echo "✓ Generated Postgres password in scripts/deploy-vm/.env"
else
  PG_PASS="$(grep '^POSTGRES_PASSWORD=' "$COMPOSE_ENV" | cut -d= -f2-)"
  echo "✓ Using existing Postgres password from scripts/deploy-vm/.env"
fi

echo "→ starting PostgreSQL"
docker compose -f scripts/deploy-vm/docker-compose.yml --env-file "$COMPOSE_ENV" up -d postgres
sleep 3

# ── api-server env ───────────────────────────────────────────────────────────
mkdir -p /etc/emberchain
if [[ ! -f "$ENV_FILE" ]]; then
  cp scripts/deploy-vm/api-server.env.example "$ENV_FILE"
  sed -i "s|YOUR_PASSWORD|${PG_PASS}|g" "$ENV_FILE"
  echo ""
  echo "Created $ENV_FILE"
  echo "→ Edit it now and set at minimum:"
  echo "     BRIDGE_RELAYER_PRIVATE_KEY=0x...   (same key as chain-node relayer)"
  echo "     ETHERSCAN_API_KEY=...              (for exchange payment verification)"
  echo ""
  echo "Then re-run: bash scripts/deploy-vm/setup-full-stack.sh"
  exit 0
fi

if grep -q 'YOUR_PASSWORD' "$ENV_FILE" 2>/dev/null; then
  sed -i "s|YOUR_PASSWORD|${PG_PASS}|g" "$ENV_FILE"
  echo "✓ Patched DATABASE_URL password in $ENV_FILE"
fi

if ! grep -q '^BRIDGE_RELAYER_PRIVATE_KEY=0x' "$ENV_FILE" 2>/dev/null; then
  echo ""
  echo "! BRIDGE_RELAYER_PRIVATE_KEY not set in $ENV_FILE"
  echo "  Exchange token launch needs it. Automated bridging uses chain-node — see below."
  echo ""
fi

# Disable duplicate relayer on api-server when chain-node handles bridging
if ! grep -q '^BRIDGE_RELAYER_ENABLED=' "$ENV_FILE" 2>/dev/null; then
  echo "BRIDGE_RELAYER_ENABLED=false" >> "$ENV_FILE"
  echo "✓ Set BRIDGE_RELAYER_ENABLED=false (chain-node runs the bridge relayer)"
fi

# ── deploy api-server ────────────────────────────────────────────────────────
bash scripts/deploy-vm/deploy-api-server.sh

echo ""
echo "=== api-server deployed ==="
echo ""
echo "Next: enable automated bridging on chain-node (if not already):"
echo ""
echo "  sudo nano /etc/systemd/system/emberchain-node.service"
echo ""
echo "  Add under [Service] (use the SAME private key as api-server.env):"
echo '    Environment="BRIDGE_RELAYER_PRIVATE_KEY=0x..."'
echo '    Environment="BASE_RPC_URL=https://mainnet.base.org"'
echo '    Environment="EMBER_BRIDGE_ADDRESS=0x9362587019ea0e4ef90fbd981c615d4441d9d2c4"'
echo '    Environment="EMBERCHAIN_BRIDGE_ADDRESS=0x1573EdF8F933601e6f37AC9B104cF62C7f85a0F4"'
echo ""
echo "  Fund that wallet with Base ETH for gas, then:"
echo "    sudo systemctl daemon-reload"
echo "    sudo systemctl restart emberchain-node"
echo ""
echo "Verify everything:"
echo "  bash scripts/deploy-vm/verify-full-stack.sh"
echo ""
