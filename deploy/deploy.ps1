# Deploy the Orbit Jump game + leaderboard to App Engine (PowerShell).
# Copies the game's static files into the service payload, then deploys the
# service and the /orbitjump routing. Safe to re-run for every update.
$ErrorActionPreference = "Stop"
$Project = "loxleyorbit-dev-jozilla"
$Root = Split-Path -Parent $PSScriptRoot   # repo root (this script lives in deploy/)

if (-not $env:CLOUDSDK_PYTHON) {
  $bp = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"
  if (Test-Path $bp) { $env:CLOUDSDK_PYTHON = $bp }
}

$pub = Join-Path $Root "deploy\orbitjump\public"
Write-Host "==> Copying game\ into the service payload ($pub)"
if (Test-Path $pub) { Remove-Item -Recurse -Force $pub }
New-Item -ItemType Directory $pub | Out-Null
Copy-Item -Recurse (Join-Path $Root "game\*") $pub

Write-Host "==> Deploying orbitjump service + dispatch routing"
gcloud app deploy `
  (Join-Path $Root "deploy\orbitjump\app.yaml") `
  (Join-Path $Root "deploy\dispatch.yaml") `
  --project $Project

Write-Host ""
Write-Host "Deployed. Play at:  https://jozilla.loxleyorbit.com/orbitjump"
Write-Host "Health check:       https://jozilla.loxleyorbit.com/orbitjump/api/health"
