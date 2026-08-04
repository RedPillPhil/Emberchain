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

echo "→ remove stale build output"
rm -rf \
  "${REPO_ROOT}/artifacts/wallet/dist" \
  "${REPO_ROOT}/artifacts/ember-delta/dist" \
  "${REPO_ROOT}/artifacts/ember-delta/.vite" \
  "${REPO_ROOT}/.vite"

echo "→ prune pnpm store (safe — re-downloads on next install)"
pnpm store prune 2>/dev/null || true

echo "→ trim old chain backups (keep newest 5)"
BACKUP_DIR="${REPO_ROOT}/artifacts/data/backups"
if [[ -d "$BACKUP_DIR" ]]; then
  ls -1t "$BACKUP_DIR"/chain.json.* 2>/dev/null | tail -n +6 | xargs -r rm -f
fi

echo "→ docker prune (unused images/containers)"
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
