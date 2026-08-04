#!/usr/bin/env bash
# Free space before wallet/ember-delta builds on a small seed VM.
# Run: bash scripts/deploy-vm/free-disk-for-build.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Disk before ==="
df -h / /var /tmp 2>/dev/null || df -h /
echo ""
echo "=== Inodes (100% here causes ENOSPC even with free GB) ==="
df -i / 2>/dev/null || true
echo ""

echo "→ remove stale build output only (never touches chain.json or chain-backups)"
rm -rf \
  "${REPO_ROOT}/artifacts/wallet/dist" \
  "${REPO_ROOT}/artifacts/ember-delta/dist" \
  "${REPO_ROOT}/artifacts/ember-delta/.vite" \
  "${REPO_ROOT}/.vite"

echo "→ prune pnpm store (safe — re-downloads on next install)"
pnpm store prune 2>/dev/null || true

# Intentionally does NOT delete chain.json, chain-backups/, or restart chain-node.

echo "→ docker prune (unused images/containers — does not remove running postgres volume)"
docker system prune -af 2>/dev/null || true

echo "→ apt cache"
apt-get clean 2>/dev/null || true

echo "→ journal logs (keep last 100MB)"
journalctl --vacuum-size=100M 2>/dev/null || true

echo ""
echo "=== Disk after ==="
df -h / /var /tmp 2>/dev/null || df -h /
df -i / 2>/dev/null || true
echo ""
echo "=== Largest dirs under repo (for manual review) ==="
du -sh "${REPO_ROOT}"/node_modules \
       "${REPO_ROOT}"/artifacts/data \
       "${REPO_ROOT}"/.pnpm-store 2>/dev/null || true
du -sh /var/lib/docker 2>/dev/null || true
