#!/usr/bin/env bash
# Reconcile pending bridge events on the seed server (marks orphaned/failed locks as failed).
# Run after deploying chain-node with bridge-reconcile support.
set -euo pipefail

NODE_URL="${NODE_URL:-http://127.0.0.1:8080}"

# Bridge admin routes require operator auth (same as /admin portal).
ADMIN_SECRET="${ADMIN_SECRET:-}"
if [[ -z "$ADMIN_SECRET" && -f /etc/emberchain/api-server.env ]]; then
  # shellcheck disable=SC1091
  ADMIN_SECRET="$(grep -E '^CHAIN_NODE_INTERNAL_SECRET=' /etc/emberchain/api-server.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
if [[ -z "$ADMIN_SECRET" && -f /etc/emberchain/api-server.env ]]; then
  # shellcheck disable=SC1091
  ADMIN_SECRET="$(grep -E '^SESSION_SECRET=' /etc/emberchain/api-server.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

if [[ -z "$ADMIN_SECRET" ]]; then
  echo "Set ADMIN_SECRET or configure CHAIN_NODE_INTERNAL_SECRET in /etc/emberchain/api-server.env" >&2
  exit 1
fi

echo "Reconciling pending bridges via ${NODE_URL}/api/bridge/reconcile …"
curl -sf -X POST "${NODE_URL}/api/bridge/reconcile" \
  -H "x-admin-secret: ${ADMIN_SECRET}" | jq .
echo "Done. Refresh Bridge History in the wallet."
