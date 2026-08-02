$MinerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $MinerDir

if (-not (Test-Path "node_modules/ethereum-cryptography")) {
  Write-Host "No npm needed — miner uses bundled keccak."
}

$port = if ($env:BRIDGE_MINER_PORT) { $env:BRIDGE_MINER_PORT } else { "19747" }

Write-Host "Bridge miner daemon on http://127.0.0.1:$port"
Write-Host "Leave open. Wallet auto-starts mining on bridge submit."
Write-Host ""

node bridge-miner-daemon.mjs
