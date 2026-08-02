# Auto-mine bridge locks on the same node you submit to.
#
# Run BEFORE clicking Bridge (watches for your lock tx), or pass -Tx after submit:
#
#   .\scripts\miner\mine-for-bridge.ps1 -Node "https://emberchain.org" -Address "0xa8f6..."
#   .\scripts\miner\mine-for-bridge.ps1 -Node "https://emberchain.org" -Address "0xa8f6..." -Tx "0xabc..."
#
# Local dev node:
#   .\scripts\miner\mine-for-bridge.ps1 -Node "http://localhost:8080" -Address "0x..."

param(
  [string]$Node = "https://emberchain.org",
  [Parameter(Mandatory = $true)]
  [string]$Address = "",
  [string]$Tx = "",
  [int]$Threads = 0
)

$MinerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $MinerDir

if (-not (Test-Path "node_modules/ethereum-cryptography")) {
  Write-Host "Installing ethereum-cryptography..."
  npm install --silent
}

$args = @("--node", $Node, "--address", $Address)
if ($Tx) { $args += "--tx", $Tx }
if ($Threads -gt 0) { $args += "--threads", $Threads }

Write-Host ""
Write-Host "  PC bridge miner — mines from YOUR computer onto $Node"
Write-Host "  (Does NOT start server-side mining on the seed.)"
Write-Host "  Submit your bridge in the wallet now (or pass -Tx if already submitted)"
Write-Host ""

node mine-for-bridge.mjs @args
