#!/usr/bin/env bash
# Deploy the Orbit Jump game + leaderboard to App Engine.
# Copies the game's static files into the service payload, then deploys the
# service and the /orbitjump routing. Safe to re-run for every update.
set -euo pipefail

PROJECT="loxleyorbit-dev-jozilla"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${CLOUDSDK_PYTHON:-}" ] && [ -f "${LOCALAPPDATA:-}/Google/Cloud SDK/google-cloud-sdk/platform/bundledpython/python.exe" ]; then
  export CLOUDSDK_PYTHON="${LOCALAPPDATA}/Google/Cloud SDK/google-cloud-sdk/platform/bundledpython/python.exe"
fi

echo "==> Copying game/ into the service payload (deploy/orbitjump/public)"
rm -rf "$ROOT/deploy/orbitjump/public"
mkdir -p "$ROOT/deploy/orbitjump/public"
cp -r "$ROOT/game/"* "$ROOT/deploy/orbitjump/public/"

echo "==> Deploying orbitjump service + dispatch routing"
gcloud app deploy \
  "$ROOT/deploy/orbitjump/app.yaml" \
  "$ROOT/deploy/dispatch.yaml" \
  --project "$PROJECT"

echo ""
echo "Deployed. Play at:  https://jozilla.loxleyorbit.com/orbitjump"
echo "Health check:       https://jozilla.loxleyorbit.com/orbitjump/api/health"
