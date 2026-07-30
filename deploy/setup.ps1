# One-time GCP setup for the Orbit Jump leaderboard service (PowerShell).
# Enables APIs, creates the Firestore database, and grants IAM.
# Run once after `gcloud auth login`. Re-running is safe (idempotent).
$ErrorActionPreference = "Stop"
$Project = "loxleyorbit-dev-jozilla"
$Db = "orbitjump"

if (-not $env:CLOUDSDK_PYTHON) {
  $bp = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\platform\bundledpython\python.exe"
  if (Test-Path $bp) { $env:CLOUDSDK_PYTHON = $bp }
}

Write-Host "==> Project: $Project"
gcloud config set project $Project

Write-Host "==> Enabling APIs (firestore, cloudbuild)"
gcloud services enable firestore.googleapis.com cloudbuild.googleapis.com

$region = (gcloud app describe --format="value(locationId)").Trim()
switch ($region) {
  "us-central"  { $region = "us-central1" }
  "europe-west" { $region = "europe-west1" }
}
if ($env:FIRESTORE_LOCATION) { $region = $env:FIRESTORE_LOCATION }
Write-Host "==> Firestore location: $region  (override with `$env:FIRESTORE_LOCATION if wrong)"

gcloud firestore databases describe --database=$Db *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "==> Firestore database '$Db' already exists - skipping create"
} else {
  Write-Host "==> Creating Firestore database '$Db' (native mode) in $region"
  gcloud firestore databases create --database=$Db --location=$region --type=firestore-native
}

Write-Host "==> Granting App Engine service account Firestore access"
gcloud projects add-iam-policy-binding $Project `
  --member="serviceAccount:$Project@appspot.gserviceaccount.com" `
  --role="roles/datastore.user" --condition=None | Out-Null

Write-Host ""
Write-Host "Setup complete. Now run:  .\deploy\deploy.ps1"
