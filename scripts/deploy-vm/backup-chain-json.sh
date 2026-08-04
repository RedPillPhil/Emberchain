#!/usr/bin/env bash
# Rolling backups of chain.json with age-based retention.
#
# Schedule (recommended): every 3 hours on the hour
#   0 */3 * * * /root/Emberchain/emberchain/scripts/deploy-vm/backup-chain-json.sh >>/var/log/emberchain-chain-backup.log 2>&1
#
# Retention (by calendar day of the backup mtime, relative to "today"):
#   age 0–2 days  → keep all 3-hourly backups for that day (up to 8/day)
#   age 3–4 days  → keep 4 backups that day (every ~6 hours)
#   age 5–9 days  → keep 2 backups that day (every ~12 hours)
#   age ≥10 days  → keep 1 backup that day
#
# Also writes/updates: <CHAIN>.bak-latest (always the newest successful copy)

set -euo pipefail

CHAIN_JSON="${CHAIN_JSON:-/root/Emberchain/emberchain/artifacts/data/chain.json}"
BACKUP_DIR="${BACKUP_DIR:-/root/Emberchain/emberchain/artifacts/data/chain-backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

if [[ ! -f "$CHAIN_JSON" ]]; then
  echo "[backup] missing $CHAIN_JSON" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
dest="$BACKUP_DIR/chain-${STAMP}.json"
cp -a "$CHAIN_JSON" "$dest"
cp -a "$CHAIN_JSON" "${CHAIN_JSON}.bak-latest"
echo "[backup] wrote $dest ($(du -h "$dest" | awk '{print $1}'))"

# --- retention ---------------------------------------------------------------
# Group files by UTC day (YYYYMMDD), then trim each day by age.
mapfile -t files < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'chain-*.json' | sort)

declare -A by_day=()
for f in "${files[@]}"; do
  base="$(basename "$f")"
  # chain-YYYYMMDD-HHMMSS.json
  day="$(echo "$base" | sed -n 's/^chain-\([0-9]\{8\}\)-.*/\1/p')"
  [[ -n "$day" ]] || continue
  by_day["$day"]+="$f"$'\n'
done

today="$(date -u +%Y%m%d)"
today_epoch="$(date -u -d "${today:0:4}-${today:4:2}-${today:6:2}" +%s)"

for day in "${!by_day[@]}"; do
  day_epoch="$(date -u -d "${day:0:4}-${day:4:2}-${day:6:2}" +%s)"
  age_days=$(( (today_epoch - day_epoch) / 86400 ))
  [[ "$age_days" -lt 0 ]] && age_days=0

  mapfile -t day_files < <(printf '%s' "${by_day[$day]}" | sed '/^$/d' | sort)
  n="${#day_files[@]}"
  [[ "$n" -eq 0 ]] && continue

  keep=999
  if [[ "$age_days" -ge 10 ]]; then
    keep=1
  elif [[ "$age_days" -ge 5 ]]; then
    keep=2
  elif [[ "$age_days" -ge 3 ]]; then
    keep=4
  else
    # 0–2 days: keep all (3-hourly schedule → ≤8)
    keep=999
  fi

  if [[ "$n" -le "$keep" ]]; then
    continue
  fi

  # Keep evenly spaced samples including first + last of that day.
  # Indices to keep: 0 .. n-1 mapped to `keep` slots.
  declare -A keep_idx=()
  if [[ "$keep" -eq 1 ]]; then
    keep_idx[$((n - 1))]=1   # newest that day
  else
    for ((i = 0; i < keep; i++)); do
      idx=$(( i * (n - 1) / (keep - 1) ))
      keep_idx[$idx]=1
    done
  fi

  for ((i = 0; i < n; i++)); do
    if [[ -z "${keep_idx[$i]+x}" ]]; then
      echo "[backup] prune ${day_files[$i]} (day=$day age=${age_days}d keep=$keep)"
      rm -f "${day_files[$i]}"
    fi
  done
  unset keep_idx
done

echo "[backup] retention pass complete"
