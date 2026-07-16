#!/usr/bin/env bash
# Install locked JavaScript dependencies and generate browser assets when their
# inputs change. Stamps live in node_modules because both outputs are ignored.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    ./scripts/build-prereqs.sh hint-frontend >&2
    exit 1
fi

node_major="$(node -p "process.versions.node.split('.')[0]")"
if [[ ! "$node_major" =~ ^[0-9]+$ ]] || ((node_major < 20)); then
    printf '%s\n' "Figaro requires Node.js 20 or newer; found $(node --version)." >&2
    ./scripts/build-prereqs.sh hint-frontend >&2
    exit 1
fi

for command in bash cksum curl sed mktemp; do
    if ! command -v "$command" >/dev/null 2>&1; then
        printf '%s\n' "Frontend asset generation requires '$command' on PATH." >&2
        exit 1
    fi
done

dependency_stamp="node_modules/.figaro-npm-ci.stamp"
vendor_stamp="node_modules/.figaro-vendor.stamp"

dependency_fingerprint() {
    cksum package.json package-lock.json
}

vendor_fingerprint() {
    cksum package.json package-lock.json scripts/vendor.sh scripts/vendor-markdown-renderer.mjs
}

needs_dependencies=false
if [[ ! -d node_modules || ! -f node_modules/.package-lock.json || ! -f "$dependency_stamp" ]]; then
    needs_dependencies=true
elif [[ "$(<"$dependency_stamp")" != "$(dependency_fingerprint)" ]]; then
    needs_dependencies=true
fi

if [[ "$needs_dependencies" == true ]]; then
    printf '%s\n' "Installing locked frontend dependencies with npm ci..."
    npm ci
    dependency_fingerprint > "$dependency_stamp"
else
    printf '%s\n' "Frontend dependencies are up to date."
fi

required_vendor_files=(
    frontend/vendored/codemirror/state/index.js
    frontend/vendored/codemirror/view/index.js
    frontend/vendored/codemirror/autocomplete/index.js
    frontend/vendored/codemirror-markdown-tables/index.js
    frontend/vendored/importmap.json
    frontend/vendored/markdown-it-plugins/index.js
    frontend/vendored/katex/dist/katex.min.js
)
needs_vendor=false
if [[ "${FIGARO_FORCE_VENDOR:-}" == "1" ]]; then
    needs_vendor=true
fi
for vendor_file in "${required_vendor_files[@]}"; do
    if [[ ! -s "$vendor_file" ]]; then
        needs_vendor=true
        break
    fi
done
if [[ ! -f "$vendor_stamp" || "$(<"$vendor_stamp")" != "$(vendor_fingerprint)" ]]; then
    needs_vendor=true
fi

if [[ "$needs_vendor" == true ]]; then
    printf '%s\n' "Generating vendored browser assets with npm run vendor..."
    npm run vendor
    vendor_fingerprint > "$vendor_stamp"
else
    printf '%s\n' "Vendored browser assets are up to date."
fi
