#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repository_root"

minimum="${FIGARO_GO_COVERAGE_MIN:-72}"
profile="$(mktemp)"
trap 'rm -f "$profile"' EXIT

go test -covermode=atomic -coverprofile="$profile" . ./internal/... ./cmd/...
total="$(go tool cover -func="$profile" | awk '$1 == "total:" { gsub(/%/, "", $3); print $3 }')"
if [[ -z "$total" ]]; then
    printf '%s\n' 'Go coverage did not produce a total.' >&2
    exit 1
fi
printf 'Go statement coverage: %s%% (required: %s%%)\n' "$total" "$minimum"
awk -v actual="$total" -v required="$minimum" 'BEGIN { exit !(actual + 0 >= required + 0) }' || {
    printf 'Go statement coverage fell below the required floor.\n' >&2
    exit 1
}
