# Verify a stuck tx / bridge on a specific Emberchain node, then mine there.
#
# Usage (from repo root or scripts/miner):
#   .\scripts\miner\verify-and-mine.ps1 -Node "https://emberchain.org" -Address "0xa8f6efc25896c24ac6c9441f9f693c14517aa818" -Tx "0x2f3ac34b6d645b6414c666f79b5027f26cb9308bf21f2213c5d3f9ef3974cff3"
#
# Bridge history check only (bridge #1785643913328 failed status):
#   .\scripts\miner\verify-and-mine.ps1 -Node "https://emberchain.org" -Address "0xa8f6..." -BridgeNonce "1785643913328" -CheckOnly
#
# Compare emberchain.org vs duckdns:
#   .\scripts\miner\verify-and-mine.ps1 -Compare "https://emberchain.org" "https://emberchain.duckdns.org"

param(
  [string]$Node = "https://emberchain.org",
  [string]$Address = "",
  [string]$Tx = "",
  [string]$BridgeNonce = "",
  [switch]$CheckOnly,
  [string[]]$Compare = @(),
  [int]$Threads = 0
)

$MinerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $MinerDir

if (-not (Test-Path "node_modules/ethereum-cryptography")) {
  Write-Host "Installing ethereum-cryptography..."
  npm install --silent
}

$args = @()

if ($Compare.Count -ge 2) {
  $args += "--compare", $Compare[0], $Compare[1]
} else {
  $args += "--node", $Node
  if ($Address) { $args += "--address", $Address }
  if ($Tx) { $args += "--tx", $Tx }
  if ($BridgeNonce) { $args += "--bridge-nonce", $BridgeNonce }
  if ($CheckOnly) { $args += "--check-only" }
  if ($Threads -gt 0) { $args += "--threads", $Threads }
}

Write-Host "Running: node emberchain-miner.mjs $($args -join ' ')"
node emberchain-miner.mjs @args
