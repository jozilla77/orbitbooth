#!/usr/bin/env bash
# Build the Chrome Web Store extension package.
# Copies the current game into store/extension/ and zips it for upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/store/extension"
ZIP="$ROOT/store/orbit-jump-chrome-extension.zip"

echo "Syncing game files into the extension…"
rm -rf "$EXT/css" "$EXT/js" "$EXT/assets" "$EXT/index.html" "$EXT/privacy.html"
cp    "$ROOT/game/index.html"   "$EXT/"
cp    "$ROOT/game/privacy.html" "$EXT/"
cp -r "$ROOT/game/css"          "$EXT/"
cp -r "$ROOT/game/js"           "$EXT/"
cp -r "$ROOT/game/assets"       "$EXT/"

echo "Zipping…"
rm -f "$ZIP"
if command -v zip >/dev/null 2>&1; then
  ( cd "$EXT" && zip -r -q "$ZIP" . -x '*.DS_Store' '*/.*' )
else
  # Git Bash on Windows usually lacks `zip`; fall back to PowerShell.
  wzip=$(cygpath -w "$ZIP"); wext=$(cygpath -w "$EXT")
  powershell.exe -NoProfile -Command "Compress-Archive -Path '${wext}\\*' -DestinationPath '${wzip}' -Force" >/dev/null
fi

echo "Built: ${ZIP#$ROOT/}"
( cd "$EXT" && find . -type f | sort | sed 's/^/  /' )
