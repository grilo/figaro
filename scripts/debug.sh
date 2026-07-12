#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== figaro Debug Mode ==="

# Ensure wails is in PATH
export PATH="$HOME/go/bin:$PATH"
# This script is an explicit development entry point, so opt in to the
# loopback-only WebKit inspector without exposing it in normal app launches.
export FIGARO_WEBKIT_INSPECTOR="${FIGARO_WEBKIT_INSPECTOR:-1}"

# A clean checkout intentionally omits generated browser modules and icon
# derivatives. Prepare them before either the static server or Wails starts.
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

# Start Wails dev mode
echo "[2/2] Starting Wails dev mode ..."
echo "       Open http://localhost:34115 in your browser for DevTools"
wails dev
