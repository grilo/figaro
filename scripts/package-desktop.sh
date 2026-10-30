#!/usr/bin/env bash
# Build the production desktop application for one platform with Wails v3.
#
#   scripts/package-desktop.sh linux    -> build/bin/figaro
#   scripts/package-desktop.sh windows  -> build/bin/figaro.exe
#   scripts/package-desktop.sh darwin   -> build/bin/figaro.app (universal)
#
# Wails v3 needs no CLI to compile; the pinned wails3 tool only generates the
# Windows resources and macOS bundle metadata from wails.json.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

platform="${1:-}"
wails_version="$(sed -n 's#^[[:space:]]*github.com/wailsapp/wails/v3 \(v[^[:space:]]*\).*#\1#p' go.mod | head -n 1)"
if [ -z "$wails_version" ]; then
    echo "go.mod does not require github.com/wailsapp/wails/v3" >&2
    exit 1
fi
wails3=(go run "github.com/wailsapp/wails/v3/cmd/wails3@${wails_version}")
build_flags=(-tags production -trimpath -buildvcs=false)

metadata() {
    node -e '
        const config = require("./wails.json");
        const info = config.info || {};
        const field = process.argv[1];
        const values = {
            version: info.productVersion,
            company: info.companyName,
            copyright: info.copyright,
            comments: info.comments,
        };
        if (!values[field]) process.exit(1);
        process.stdout.write(String(values[field]));
    ' "$1"
}

generate_assets() {
    rm -rf build/wails3
    "${wails3[@]}" generate build-assets -dir build/wails3 \
        -name figaro -binaryname figaro -productname Figaro \
        -productidentifier io.github.figaro.Figaro \
        -productversion "$(metadata version)" \
        -productcompany "$(metadata company)" \
        -productcopyright "$(metadata copyright)" \
        -productdescription "Local Markdown Knowledge Base" \
        -productcomments "$(metadata comments)" >/dev/null
}

mkdir -p build/bin
case "$platform" in
    linux)
        go build "${build_flags[@]}" -ldflags "-w -s" -o build/bin/figaro .
        echo "Output: build/bin/figaro"
        ;;
    windows)
        generate_assets
        syso="figaro_windows_amd64.syso"
        trap 'rm -f "$ROOT/$syso"' EXIT
        "${wails3[@]}" generate syso -arch amd64 \
            -icon build/windows/icon.ico \
            -manifest build/wails3/windows/wails.exe.manifest \
            -info build/wails3/windows/info.json \
            -out "$syso"
        GOOS=windows GOARCH=amd64 go build "${build_flags[@]}" -ldflags "-w -s -H windowsgui" -o build/bin/figaro.exe .
        echo "Output: build/bin/figaro.exe"
        ;;
    darwin)
        generate_assets
        export CGO_ENABLED=1 MACOSX_DEPLOYMENT_TARGET=12.0
        export CGO_CFLAGS="-mmacosx-version-min=12.0" CGO_LDFLAGS="-mmacosx-version-min=12.0"
        GOARCH=arm64 go build "${build_flags[@]}" -ldflags "-w -s" -o build/bin/figaro-arm64 .
        GOARCH=amd64 go build "${build_flags[@]}" -ldflags "-w -s" -o build/bin/figaro-amd64 .
        bundle="build/bin/figaro.app"
        rm -rf "$bundle"
        mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
        lipo -create -output "$bundle/Contents/MacOS/figaro" build/bin/figaro-arm64 build/bin/figaro-amd64
        rm -f build/bin/figaro-arm64 build/bin/figaro-amd64
        cp build/wails3/darwin/Info.plist "$bundle/Contents/Info.plist"
        "${wails3[@]}" generate icons -input build/appicon.png -macfilename "$bundle/Contents/Resources/icons.icns"
        # Apple Silicon refuses unsigned code; an ad-hoc signature keeps the
        # bundle launchable and lets the updater validate the swapped bundle.
        codesign --force --deep --sign - "$bundle"
        echo "Output: $bundle"
        ;;
    *)
        echo "usage: $0 linux|windows|darwin" >&2
        exit 2
        ;;
esac
