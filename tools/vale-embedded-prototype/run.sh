#!/usr/bin/env bash
set -euo pipefail
prototype_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
prototype_workspace=$(python3 "$prototype_dir/bootstrap.py")
export GOTOOLCHAIN=go1.26.6
printf '%s\n' "Prototype workspace: $prototype_workspace"
node "$prototype_dir/samples.mjs" "$prototype_workspace/samples.json"
(
    cd "$prototype_workspace/vale"
    go vet -tags figaro_plaintext ./figaroembedded ./cmd/figaro-prototype
    go test -race -tags figaro_plaintext -v ./figaroembedded > "$prototype_workspace/race.log" 2>&1
    CGO_ENABLED=0 go build -tags figaro_plaintext -o "$prototype_workspace/embedded" ./cmd/figaro-prototype
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -tags figaro_plaintext -o "$prototype_workspace/embedded-windows.exe" ./cmd/figaro-prototype
    CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -tags figaro_plaintext -o "$prototype_workspace/embedded-macos-arm64" ./cmd/figaro-prototype
)
python3 "$prototype_dir/compare.py" "$prototype_workspace" 2> "$prototype_workspace/compare.log"
printf '%s\n' "Comparison and test evidence: $prototype_workspace"
