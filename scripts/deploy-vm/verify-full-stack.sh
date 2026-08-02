#!/usr/bin/env bash
# Quick health check for seed-server full stack (chain-node + api-server + nginx).
# Run on emberchain-seed-1:
#   cd ~/Emberchain/emberchain && bash scripts/deploy-vm/verify-full-stack.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ! $1"; WARN=$((WARN + 1)); }

echo "=== EmberChain full-stack verification ==="
echo ""

# ── chain-node ───────────────────────────────────────────────────────────────
echo "── chain-node (:8080) ──"
if systemctl is-active --quiet emberchain-node 2>/dev/null; then
  ok "emberchain-node.service is active"
else
  bad "emberchain-node.service not active — run: systemctl status emberchain-node"
fi

if curl -sf http://127.0.0.1:8080/api/healthz | grep -q '"status"'; then
  ok "GET /api/healthz → JSON"
else
  bad "GET /api/healthz failed on :8080"
fi

if curl -sf http://127.0.0.1:8080/api/mining/status | grep -q '"difficulty"'; then
  ok "GET /api/mining/status"
else
  bad "GET /api/mining/status failed"
fi

TEST_ADDR="0x404f509465f0f148782d23bd8ae19ba56c1969d7"
if curl -sf "http://127.0.0.1:8080/api/mining/template?minerAddress=${TEST_ADDR}" | grep -q '"header"'; then
  ok "GET /api/mining/template"
else
  bad "GET /api/mining/template failed"
fi

if curl -sf http://127.0.0.1:8080/api/bridge/admin-pending | grep -qE '\[|"direction"'; then
  ok "GET /api/bridge/admin-pending (bridge routes live)"
else
  warn "GET /api/bridge/admin-pending inconclusive"
fi

NODE_ENV_FILE="/etc/systemd/system/emberchain-node.service"
if [[ -f "$NODE_ENV_FILE" ]]; then
  if grep -q 'MINING_DISABLED=true' "$NODE_ENV_FILE" 2>/dev/null; then
    bad "MINING_DISABLED=true on chain-node — remove it and restart"
  else
    ok "MINING_DISABLED not set on chain-node"
  fi
  if grep -q 'BRIDGE_RELAYER_PRIVATE_KEY=' "$NODE_ENV_FILE" 2>/dev/null \
     && ! grep -q 'BRIDGE_RELAYER_PRIVATE_KEY=$' "$NODE_ENV_FILE" 2>/dev/null \
     && ! grep -q 'BRIDGE_RELAYER_PRIVATE_KEY=""' "$NODE_ENV_FILE" 2>/dev/null; then
    ok "BRIDGE_RELAYER_PRIVATE_KEY set on chain-node (automated bridging)"
  else
    warn "BRIDGE_RELAYER_PRIVATE_KEY not set on chain-node — bridges need manual admin completion"
  fi
else
  warn "emberchain-node.service not found at $NODE_ENV_FILE"
fi

echo ""
echo "── api-server (:8081) — exchange escrow + token launch ──"
if systemctl is-active --quiet emberchain-api 2>/dev/null; then
  ok "emberchain-api.service is active"
else
  bad "emberchain-api.service not active — run: bash scripts/deploy-vm/deploy-api-server.sh"
fi

if docker compose -f scripts/deploy-vm/docker-compose.yml ps postgres 2>/dev/null | grep -q running; then
  ok "PostgreSQL container running"
else
  bad "PostgreSQL not running — run: docker compose -f scripts/deploy-vm/docker-compose.yml up -d postgres"
fi

if [[ -f /etc/emberchain/api-server.env ]]; then
  ok "/etc/emberchain/api-server.env exists"
  if grep -q '^DATABASE_URL=postgresql://' /etc/emberchain/api-server.env \
     && ! grep -q 'YOUR_PASSWORD' /etc/emberchain/api-server.env; then
    ok "DATABASE_URL configured"
  else
    bad "DATABASE_URL missing or still has placeholder YOUR_PASSWORD"
  fi
else
  bad "/etc/emberchain/api-server.env missing — copy from scripts/deploy-vm/api-server.env.example"
fi

if curl -sf http://127.0.0.1:8081/api/healthz | grep -qE 'ok|status'; then
  ok "GET :8081/api/healthz"
else
  bad "GET :8081/api/healthz failed — api-server not responding"
fi

if curl -sf http://127.0.0.1:8081/api/exchange/listings 2>/dev/null | grep -qE '\[|"listings"'; then
  ok "GET :8081/api/exchange/listings"
else
  bad "GET :8081/api/exchange/listings failed"
fi

echo ""
echo "── nginx (public HTTPS) ──"
if curl -sf https://emberchain.org/api/healthz | grep -q '"status"'; then
  ok "https://emberchain.org/api/healthz"
else
  bad "https://emberchain.org/api/healthz failed"
fi

if curl -sf https://emberchain.org/api/mining/status | grep -q '"difficulty"'; then
  ok "https://emberchain.org/api/mining/status"
else
  bad "https://emberchain.org/api/mining/status failed"
fi

if curl -sf https://emberchain.org/api/exchange/listings 2>/dev/null | grep -qE '\[|"listings"'; then
  ok "https://emberchain.org/api/exchange/listings (nginx → api-server)"
else
  bad "https://emberchain.org/api/exchange/listings failed — check nginx routes to :8081"
fi

echo ""
echo "── static site ──"
if curl -sfI https://emberchain.org/ | head -1 | grep -q '200'; then
  ok "https://emberchain.org/ returns 200"
else
  warn "https://emberchain.org/ did not return 200"
fi

echo ""
echo "=== Summary: ${PASS} passed, ${FAIL} failed, ${WARN} warnings ==="
if [[ "$FAIL" -gt 0 ]]; then
  echo "Fix failures above, then re-run this script."
  exit 1
fi
if [[ "$WARN" -gt 0 ]]; then
  echo "Core stack OK; warnings are optional features (auto-bridge relayer)."
fi
exit 0
