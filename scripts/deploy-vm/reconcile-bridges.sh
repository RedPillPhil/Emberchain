#!/usr/bin/env bash
# Reconcile pending bridge events on the seed server (marks orphaned/failed locks as failed).
# Run after deploying chain-node with bridge-reconcile support.
set -euo pipefail

NODE_URL="${NODE_URL:-http://127.0.0.1:8080}"
echo "Reconciling pending bridges via ${NODE_URL}/api/bridge/reconcile …"
curl -sf -X POST "${NODE_URL}/api/bridge/reconcile" | jq .
echo "Done. Refresh Bridge History in the wallet."
