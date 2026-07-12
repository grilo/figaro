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

# The supplied artwork is a wide presentation canvas. Extract its central
# rounded-square mark and restore transparent corners before scaling it into
# the square icon master used by Wails, the webview, and desktop shells.
magick \
    \( "$source_art" -crop 440x440+484+98 +repage \) \
    \( -size 440x440 xc:none -fill white -draw "roundrectangle 8,3 431,437 87,87" \) \
    -alpha off -compose CopyOpacity -composite \
    -filter Lanczos -resize 1024x1024 \
    "$master_icon"

for target in appicon.png build/appicon.png assets/branding/figaro.fullsize.png; do
    magick "$master_icon" "$target"
done

for size in 16 22 24 32 48 64 128 256; do
    magick "$master_icon" -filter Lanczos -resize "${size}x${size}" "frontend/icon-${size}.png"
done

magick "$master_icon" -define icon:auto-resize=48,32,16 frontend/favicon.ico
magick "$master_icon" -define icon:auto-resize=256,128,64,48,32,16 build/windows/icon.ico
