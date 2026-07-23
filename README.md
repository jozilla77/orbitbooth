# Orbit Jump

A cute, kawaii **flappy-style arcade game** starring the Orbit mascot, flying through three
themed rounds inspired by Thailand. Built as a self-contained HTML5 Canvas game with a Go
backend for the shared leaderboard.

> **Note:** This repo also contains an earlier **Flutter/Flame** prototype under `frontend/`.
> It is kept for reference but is **not** the active game — building it requires the Flutter SDK.
> The playable game is the plain **HTML5 Canvas** version under `game/`, which needs no build
> step and runs in any modern browser.

## The Game — `game/`

- **8 distinct stages**, each with its own art, obstacles, wildlife and difficulty:
  1. 🏮 **Bangkok** — Urban Jungle (temple chedi columns, city, jungle)
  2. 🏝️ **Phuket** — Island Beaches (palm columns, turquoise sea, sand)
  3. ⛰️ **Chiang Mai** — Misty Mountains (stone pagoda columns)
  4. 🐬 **Koh Samui** — Dolphin Bay (coral columns; dolphins, fish, birds)
  5. 🐘 **Buriram** — Ancient Kingdom (Khmer prang columns; elephants)
  6. 🐒 **Krabi** — Limestone Sea (karst rock columns; monkeys)
  7. 🌸 **Chiang Rai** — Flower Highlands (white-temple columns; flower fields, deer)
  8. 🤖 **Neo Bangkok** — Year 3000 finale (neon tech columns; flying cars, robots,
     flying trains) — **endless at 2× speed**, the loop point once you reach the end.
  - Advance a stage every 10 gaps passed; stage 8 continues endlessly so scores keep climbing.
- **The real Orbit character** (`game/assets/orbit_sprite.png`, the 3-pose idle/flap/glide
  sheet) — flap/idle/glide frames are chosen from the bird's velocity.
- **High-score leaderboard** with **name entry** on Game Over. Scores save to
  `localStorage` and, when the Go backend is running, `POST` to `/api/score` and read from
  `/api/leaderboard` (game id `orbit_jump`). Falls back to local scores if the API is offline.
- Colorful Japanese-arcade logo, kawaii clouds, parallax scenery, particles, and synthesized
  WebAudio sound effects (mute toggle). High-DPI ("4K") crisp rendering.

**Controls:** Tap / click / `Space` / `↑` to flap.

### Structure
```
game/
├── index.html      # markup + overlay UI (menu, name entry, leaderboard, game over)
├── css/style.css   # kawaii pastel styling + arcade logo/title treatments
├── js/game.js      # the whole game engine (physics, rounds, themes, sound, leaderboard)
└── assets/
    ├── orbit_sprite.png   # 384×128 sheet: idle | flap | glide (128×128 each)
    └── orbit_hero.png     # hi-res 3D mascot used on the menu
```

## Running Locally

You need **Go** installed (used as a tiny static server; `serve.go` is at the repo root).

```bash
go run serve.go        # serves the repo on http://localhost:8000 (honors $PORT)
```
Then open **http://localhost:8000/game/**. (The leaderboard uses local storage in this mode.)

Append `?dev` to the URL to enable dev keys: `1`/`2`/`3` jump to a round, `g` toggles a
hover/no-death mode for inspecting themes.

### With the full backend (shared leaderboard)

The Go backend in `backend/` (Gin) exposes `GET /api/leaderboard` and `POST /api/score`
and serves static files from `backend/public/`.

```bash
cd backend
go run main.go         # http://localhost:8080  (API under /api, static under /public)
```
Copy the game into the served directory, then open http://localhost:8080/game/:
```bash
# from repo root
cp -r game backend/public/game          # macOS/Linux
# Copy-Item -Recurse -Force game backend\public\game   # PowerShell
```

## Deployment (GCP App Engine)

The backend already serves everything from `backend/public/`, so deployment is just:

```bash
# 1. Put the game where the backend serves it
cp -r game backend/public/game          # (or copy game/* to backend/public/ to serve at root)

# 2. Deploy the Go backend (includes the static game + leaderboard API)
cd backend
gcloud app deploy app.yaml --project loxleyorbit-dev-jozilla
```

If you serve the game at a sub-path (e.g. `/games1/`), keep the game's asset paths relative
(they already are) and ensure the leaderboard API is reachable at `/api/*` from that origin.
