#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== figaro Debug Mode ==="

# This script is an explicit development entry point, so opt in to the
# loopback-only WebKit inspector without exposing it in normal app launches.
export FIGARO_WEBKIT_INSPECTOR="${FIGARO_WEBKIT_INSPECTOR:-1}"

# A clean checkout intentionally omits generated browser modules and icon
# derivatives. Prepare them before either the static server or Figaro starts.
make ensure-frontend-assets ensure-icons

# Start Go file server for browser DevTools
echo "[1/2] Starting frontend dev server on :34115 ..."
go run ./cmd/devserver &
SERVER_PID=$!
cleanup() {
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
sleep 1

# A non-production Wails v3 build serves the frontend from this dev server,
# so edits to frontend files are picked up on reload.
echo "[2/2] Starting Figaro against the dev server ..."
echo "       Open http://localhost:34115 in your browser for DevTools"
FRONTEND_DEVSERVER_URL="http://localhost:34115" go run .
