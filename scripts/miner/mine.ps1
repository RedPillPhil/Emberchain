# EmberChain bridge miner — mines from YOUR PC onto the node where you submit bridges.
#
#   .\mine.ps1 -Address "0xYOUR_WALLET"
#   .\mine.ps1 -Address "0xYOUR_WALLET" -Tx "0xLOCK_TX_HASH"
#
# Run BEFORE clicking Bridge (watch mode), or pass -Tx right after submit.

param(
  [Parameter(Mandatory = $true)]
  [string]$Address,

  [string]$Node = "https://emberchain.org",
  [string]$Tx = "",
  [int]$Threads = 0
)

$ErrorActionPreference = "Stop"
$MinerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $MinerDir

Write-Host ""
Write-Host "  EmberChain Bridge Miner" -ForegroundColor Cyan
Write-Host "  Node:    $Node"
Write-Host "  Wallet:  $Address"
if ($Tx) { Write-Host "  Tx:      $Tx" } else { Write-Host "  Mode:    watching for bridge submit" }
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "ERROR: Install Node.js from https://nodejs.org" -ForegroundColor Red
  exit 1
}

$nodeArgs = @(
  "emberchain-miner.mjs",
  "--node", $Node,
  "--address", $Address,
  "--until-confirmed"
)
if ($Tx) { $nodeArgs += @("--tx", $Tx) } else { $nodeArgs += "--watch-bridge" }
if ($Threads -gt 0) { $nodeArgs += @("--threads", $Threads) }

Write-Host "Mining... (Ctrl+C to stop)" -ForegroundColor Green
Write-Host ""

& node @nodeArgs
exit $LASTEXITCODE
