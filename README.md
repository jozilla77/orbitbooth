# Orbit Booth Game

This repository contains the Flutter Web frontend and the Go backend for the Orbit Booth Game, designed to be deployed to GCP App Engine Standard.

## Project Structure

```
/
├── backend/            # Go REST API backend and App Engine config
│   ├── app.yaml        # App Engine Standard config (scale-to-zero)
│   ├── go.mod
│   ├── handlers/       # API Handlers (e.g., leaderboard)
│   ├── main.go         # Go server entrypoint
│   └── models/         # Data models
└── frontend/           # Flutter Web project using Flame
    ├── lib/            # Flutter / Flame code
    ├── pubspec.yaml    # Flutter dependencies
    └── web/            # Web entry point (configured for CanvasKit and Base Href /games1/)
```

## Running Locally

### 1. Backend (Go)

You must have Go installed.

1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Start the server:
   ```bash
   go run main.go
   ```
   The backend will start and listen on `http://localhost:8080`.

### 2. Frontend (Flutter Web)

You must have Flutter installed. 

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Fetch dependencies:
   ```bash
   flutter pub get
   ```
3. Run the Flutter app for web:
   ```bash
   flutter run -d chrome
   ```
   Note: The base href in `web/index.html` is set to `/games1/` for deployment. When running locally via `flutter run`, Flutter handles local routing dynamically, but if you build for web and test via a local static server, you will need to serve it from a `/games1/` path or proxy it.

## Deployment to GCP App Engine

1. Build the Flutter Web App using CanvasKit:
   ```bash
   cd frontend
   flutter build web --web-renderer canvaskit --base-href /games1/
   ```
2. Copy the build output to the backend's `public` directory:
   ```bash
   # On Windows (PowerShell)
   Copy-Item -Path "build\web\*" -Destination "..\backend\public" -Recurse -Force
   
   # On Mac/Linux
   # cp -r build/web/* ../backend/public/
   ```
3. Deploy the backend (which now includes the static frontend files) to App Engine:
   ```bash
   cd ../backend
   gcloud app deploy app.yaml --project loxleyorbit-dev-jozilla
   ```

The app will be accessible at `https://jozilla.loxleyorbit.com/games1/`.
