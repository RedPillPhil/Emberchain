# Optional: start daemon so wallet auto-launches mining on bridge submit.
$ErrorActionPreference = "Stop"
$MinerDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting bridge-miner daemon in new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-File", "`"$MinerDir\start-bridge-miner-daemon.ps1`"" -WorkingDirectory $MinerDir
Start-Sleep -Seconds 2
Write-Host "Done. Or just use: .\mine.ps1 -Address `"0xYOUR_WALLET`""
