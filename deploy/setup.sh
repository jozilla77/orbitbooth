#!/usr/bin/env bash
# One-time GCP setup for the Orbit Jump leaderboard service.
# Enables APIs, creates the Firestore database, and grants IAM.
# Run once (after `gcloud auth login`).  Re-running is safe (idempotent).
set -euo pipefail

PROJECT="loxleyorbit-dev-jozilla"
DB="orbitjump"

# Windows Git Bash: use the SDK's bundled Python if the system one is missing.
if [ -z "${CLOUDSDK_PYTHON:-}" ] && [ -f "${LOCALAPPDATA:-}/Google/Cloud SDK/google-cloud-sdk/platform/bundledpython/python.exe" ]; then
  export CLOUDSDK_PYTHON="${LOCALAPPDATA}/Google/Cloud SDK/google-cloud-sdk/platform/bundledpython/python.exe"
fi

echo "==> Project: $PROJECT"
gcloud config set project "$PROJECT"

echo "==> Enabling APIs (firestore, cloudbuild)"
gcloud services enable firestore.googleapis.com cloudbuild.googleapis.com

REGION="$(gcloud app describe --format='value(locationId)')"
# App Engine uses a couple of legacy region names that differ from Firestore's.
case "$REGION" in
  us-central)   REGION="us-central1" ;;
  europe-west)  REGION="europe-west1" ;;
esac
FS_LOCATION="${FIRESTORE_LOCATION:-$REGION}"
echo "==> Firestore location: $FS_LOCATION  (override with FIRESTORE_LOCATION=... if wrong)"

if gcloud firestore databases describe --database="$DB" >/dev/null 2>&1; then
  echo "==> Firestore database '$DB' already exists — skipping create"
else
  echo "==> Creating Firestore database '$DB' (native mode) in $FS_LOCATION"
  gcloud firestore databases create --database="$DB" --location="$FS_LOCATION" --type=firestore-native
fi

echo "==> Granting App Engine service account Firestore access"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${PROJECT}@appspot.gserviceaccount.com" \
  --role="roles/datastore.user" --condition=None >/dev/null

echo ""
echo "Setup complete. Now run:  bash deploy/deploy.sh"
