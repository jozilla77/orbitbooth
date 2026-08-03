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

## Quick path (scripts)

From the repo root, after `gcloud auth login`:

```bash
# Git Bash / macOS / Linux
gcloud auth login
bash deploy/setup.sh     # one-time: APIs + Firestore DB + IAM (idempotent)
bash deploy/deploy.sh    # copies game/ in and deploys the service + routing
```

```powershell
# Windows PowerShell
gcloud auth login
.\deploy\setup.ps1       # one-time
.\deploy\deploy.ps1      # deploy (re-run this for every future update)
```

The scripts auto-detect your App Engine region for Firestore, set
`CLOUDSDK_PYTHON` if needed, and are safe to re-run. The manual equivalents are
below if you prefer to run each step yourself.

## One-time setup (manual)

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

## Anti-injection (play tokens)

As of v1.04 the API is no longer a blind "accept any number" endpoint:

- The game fetches a signed **play token** from `GET /orbitjump/api/session` when a
  round starts. `POST /orbitjump/api/score` requires it and rejects a submission
  whose token is missing/invalid, expired, or arrives faster than the score could
  physically be earned (~1 pt/sec of play). A raw `curl` with a made-up score is
  refused. The HMAC signing secret is generated once and stored in Firestore
  (`config/signing`) — it is **never** in this repo.
- Because the token is now mandatory, **every** deployment of the game (App Engine
  plus any other host) must ship the v1.04 `game.js`. Older clients can still read
  the leaderboard but can no longer submit.
- Tunables (env in `app.yaml`, all optional): `MIN_MS_PER_POINT` (default 250),
  `TOKEN_MAX_AGE_MS` (default 6h), and `REQUIRE_PLAY_TOKEN=false` for an emergency
  rollback that reopens submissions.

To remove already-injected rows (e.g. the 8888 entry), use the moderation tool
`tools/prune` (see its README) from Cloud Shell — it edits Firestore directly with
your project credentials, no HTTP secret involved.

## Notes / troubleshooting

- **Scores are still client-reported.** Tokens stop casual injection and instant
  fakes, but a determined attacker who reads `game.js` could mint a token and wait.
  For a fun leaderboard this is a deliberate, documented trade-off; add real auth if
  the stakes rise.
- **Firestore location is permanent** for a database — choose the right region in step 4.
- The service targets the `go126` App Engine Standard runtime (`runtime: go126` in
  `deploy/orbitjump/app.yaml`, `go 1.26` in `go.mod`). If your project can't use it yet,
  lower both to a supported version (e.g. `go124`/`go123`) and redeploy.
- Health check: `curl https://jozilla.loxleyorbit.com/orbitjump/api/health` → `{"ok":true}`.
