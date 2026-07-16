#!/usr/bin/env bash
# Fedora convenience wrapper. The Makefile owns the shared preparation and
# package checks so this wrapper cannot drift from the normal build path.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

case "${1:-}" in
    "")
        exec make linux
        ;;
    --dev)
        exec make dev
        ;;
    *)
        printf '%s\n' "Usage: $0 [--dev]" >&2
        exit 2
        ;;
esac
