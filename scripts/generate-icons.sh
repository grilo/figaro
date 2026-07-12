#!/usr/bin/env bash
# Rebuild every shipped application icon from the Figaro source artwork.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v magick >/dev/null 2>&1; then
    echo "ImageMagick 7 (the 'magick' command) is required to generate icons." >&2
    exit 1
fi

source_art="figaro.appicon.png"
master_icon="$(mktemp)"
trap 'rm -f "$master_icon"' EXIT

mkdir -p build/windows assets/branding frontend

# The source artwork is a square Figaro icon. Normalize it into the canonical
# 1024px rounded-square master, restoring transparent corners before scaling
# it into the Wails, webview, and desktop-shell variants.
magick \
    "$source_art" -filter Lanczos -resize '1024x1024^' -gravity center -extent 1024x1024 \
    \( -size 1024x1024 xc:none -fill white -draw "roundrectangle 0,0 1023,1023 184,184" \) \
    -alpha off -compose CopyOpacity -composite \
    "$master_icon"

for target in appicon.png build/appicon.png assets/branding/figaro.fullsize.png; do
    magick "$master_icon" "$target"
done

for size in 16 22 24 32 48 64 128 256; do
    magick "$master_icon" -filter Lanczos -resize "${size}x${size}" "frontend/icon-${size}.png"
done

magick "$master_icon" -define icon:auto-resize=48,32,16 frontend/favicon.ico
magick "$master_icon" -define icon:auto-resize=256,128,64,48,32,16 build/windows/icon.ico
