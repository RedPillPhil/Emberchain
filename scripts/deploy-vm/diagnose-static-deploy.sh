#!/usr/bin/env bash
# Quick check: is the seed server serving the latest static wallet?
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_ROOT="/var/www/emberchain"

echo "=== Emberchain static deploy diagnostics ==="
echo ""

echo "── git (run from repo that you deploy) ──"
cd "$REPO_ROOT"
echo "path:   $REPO_ROOT"
echo "HEAD:   $(git rev-parse --short HEAD) $(git log -1 --oneline)"
echo "origin: $(git rev-parse --short origin/main 2>/dev/null || echo 'unknown')"
if git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
  echo "status: includes origin/main"
else
  echo "status: ⚠ may be BEHIND or DIVERGED from origin/main"
  echo "        run: git fetch origin && git reset --hard origin/main"
fi
echo ""

echo "── nginx ──"
if [[ -f /etc/nginx/sites-available/emberchain ]]; then
  grep -n 'wbbl\|ember-ball\|ember-delta\|root ' /etc/nginx/sites-available/emberchain | head -20 || true
else
  echo "⚠ /etc/nginx/sites-available/emberchain missing"
fi
echo ""

echo "── web root ${WEB_ROOT} ──"
if [[ -d "$WEB_ROOT" ]]; then
  ls -la "$WEB_ROOT/ember-delta/index.html" 2>/dev/null || echo "⚠ missing ember-delta"
  if grep -rq 'landing-games-grid\|WBBL' "$WEB_ROOT/assets/"*.js 2>/dev/null; then
    echo "✓ wallet bundle contains Games / WBBL strings"
  else
    echo "⚠ wallet bundle in web root looks OLD (no Games section)"
  fi
else
  echo "⚠ $WEB_ROOT does not exist"
fi
echo ""

echo "── local build output (if present) ──"
DIST="${REPO_ROOT}/artifacts/wallet/dist/public"
if [[ -d "$DIST" ]]; then
  grep -l 'landing-games-grid' "$DIST/assets/"*.js 2>/dev/null | head -1 || echo "⚠ dist wallet bundle missing games"
else
  echo "  (no dist — run deploy-static-from-git.sh)"
fi
echo ""

echo "── HTTP smoke (localhost) ──"
curl -sS -o /dev/null -w "GET / → %{http_code}\n" http://127.0.0.1/ || true
curl -sS -o /dev/null -w "GET /ember-ball/ → %{http_code} (expect 301 → wbbl.site)\n" http://127.0.0.1/ember-ball/ || true
