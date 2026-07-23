# Deploy Orbit Jump to App Engine (`/orbitjump`) with a shared online leaderboard

This deploys the game as its **own** App Engine Standard service called `orbitjump`
(scale-to-zero), routed at `/orbitjump` via `dispatch.yaml`. Your existing default
service is left untouched. Scores are stored in a **Firestore** database named
`orbitjump`, so every copy of the game — on App Engine and on any other platform —
shares one leaderboard.

- Game URL: `https://jozilla.loxleyorbit.com/orbitjump`
- API: `https://jozilla.loxleyorbit.com/orbitjump/api/{leaderboard,score}`

> The frontend already points at that canonical API URL
> (`API_BASE` in `game/js/game.js`). Any other host can override it by setting
> `window.ORBIT_API_BASE` before `game.js` loads.

## One-time setup

All commands assume the Google Cloud SDK. On Windows in Git Bash, if `gcloud`
complains it can't find Python, run once per shell:
```bash
export CLOUDSDK_PYTHON="$LOCALAPPDATA/Google/Cloud SDK/google-cloud-sdk/platform/bundledpython/python.exe"
```

```bash
# 1. Authenticate (opens a browser) and select the project
gcloud auth login
gcloud config set project loxleyorbit-dev-jozilla

# 2. Enable the APIs the service needs
gcloud services enable firestore.googleapis.com cloudbuild.googleapis.com

# 3. Find your App Engine region (use the SAME region for Firestore below)
gcloud app describe --format="value(locationId)"     # e.g. asia-southeast1

# 4. Create the Firestore database named "orbitjump" (Native mode).
#    Replace REGION with the value from step 3.
gcloud firestore databases create --database=orbitjump --location=REGION --type=firestore-native

# 5. Let the App Engine service account read/write Firestore (usually already has it)
gcloud projects add-iam-policy-binding loxleyorbit-dev-jozilla \
  --member="serviceAccount:loxleyorbit-dev-jozilla@appspot.gserviceaccount.com" \
  --role="roles/datastore.user"
```

## Deploy (run from the repo root)

```bash
# a. Copy the game's static files into the service payload
#    (Git Bash / macOS / Linux)
rm -rf deploy/orbitjump/public && mkdir -p deploy/orbitjump/public && cp -r game/* deploy/orbitjump/public/
#    (Windows PowerShell alternative)
#    Remove-Item -Recurse -Force deploy\orbitjump\public; New-Item -ItemType Directory deploy\orbitjump\public | Out-Null; Copy-Item -Recurse game\* deploy\orbitjump\public\

# b. Deploy the service FIRST (so the dispatch target exists)
gcloud app deploy deploy/orbitjump/app.yaml --project loxleyorbit-dev-jozilla

# c. Deploy the routing rules (adds /orbitjump -> orbitjump service; leaves everything else alone)
gcloud app deploy deploy/dispatch.yaml --project loxleyorbit-dev-jozilla
```

Then open **https://jozilla.loxleyorbit.com/orbitjump** and play. Submit a score;
open the leaderboard — it now reads/writes Firestore and is shared everywhere.

## Deploying the game to another platform

Host `game/` anywhere (Netlify, Vercel, itch.io, S3, …). It will call the same
`https://jozilla.loxleyorbit.com/orbitjump/api` backend (CORS is open), so scores
stay in sync. To point a build at a different backend, set a global before the
script loads:
```html
<script>window.ORBIT_API_BASE = "https://your-host/orbitjump";</script>
<script src="js/game.js"></script>
```

## Notes / troubleshooting

- **Scores are client-reported.** The API validates types and caps values, but this
  is a fun leaderboard, not an anti-cheat system. Harden later with auth/tokens if needed.
- **Firestore location is permanent** for a database — choose the right region in step 4.
- If deploy fails on the Go version, bump `runtime: go122` in
  `deploy/orbitjump/app.yaml` to `go123` (both are supported App Engine Standard runtimes).
- Health check: `curl https://jozilla.loxleyorbit.com/orbitjump/api/health` → `{"ok":true}`.
