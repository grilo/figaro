#!/usr/bin/env bash
#
# build-fedora.sh — figaro Wails build automation for Fedora Linux
#
# This script:
# 1. Checks for required system dependencies (Go, Wails CLI, gcc, webkit2gtk4.1-devel)
# 2. Downloads the locked Go module dependencies
# 3. Executes the Wails production build pipeline
# 4. Outputs a self-contained binary in build/bin/
#
# Usage: ./scripts/build-fedora.sh [--dev]
#   --dev   Build in development mode (faster, with dev server support)

set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="figaro"
OUTPUT_DIR="build/bin"
BINARY_NAME="figaro"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   figaro — Wails Build for Fedora   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Check Go compiler ────────────────────────────────────────────────────
echo -n "Checking Go compiler... "
if command -v go &>/dev/null; then
    GO_VERSION=$(go version | grep -oP 'go\K[0-9]+\.[0-9]+')
    echo -e "${GREEN}found (go${GO_VERSION})${NC}"
else
    echo -e "${RED}NOT FOUND${NC}"
    echo "  Install: sudo dnf install golang"
    exit 1
fi

# ── 2. Check Wails CLI ───────────────────────────────────────────────────────
echo -n "Checking Wails CLI... "
export PATH="$HOME/go/bin:$PATH"
if command -v wails &>/dev/null; then
    WAILS_VERSION=$(wails version 2>/dev/null | head -1 || echo "unknown")
    echo -e "${GREEN}found (${WAILS_VERSION})${NC}"
else
    echo -e "${YELLOW}NOT FOUND — installing...${NC}"
    go install github.com/wailsapp/wails/v2/cmd/wails@latest
    if command -v wails &>/dev/null; then
        echo -e "${GREEN}  Wails CLI installed successfully${NC}"
    else
        echo -e "${RED}  Failed to install Wails CLI. Ensure \$HOME/go/bin is in PATH.${NC}"
        exit 1
    fi
fi

# ── 3. Check system libraries (Fedora-specific) ─────────────────────────────
echo -n "Checking GCC... "
if command -v gcc &>/dev/null; then
    echo -e "${GREEN}found$(gcc --version | head -1 | cut -d')' -f2)${NC}"
else
    echo -e "${RED}NOT FOUND${NC}"
    echo "  Install: sudo dnf install gcc"
    exit 1
fi

echo -n "Checking webkit2gtk4.1-devel... "
if pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    echo -e "${GREEN}found${NC}"
else
    echo -e "${RED}NOT FOUND${NC}"
    echo "  Install: sudo dnf install webkit2gtk4.1-devel"
    exit 1
fi

echo -n "Checking GTK3 devel... "
if pkg-config --exists gtk+-3.0 2>/dev/null; then
    echo -e "${GREEN}found${NC}"
else
    echo -e "${RED}NOT FOUND${NC}"
    echo "  Install: sudo dnf install gtk3-devel"
    exit 1
fi

echo ""

# ── 4. Check for optional Fedora Wails dependencies ─────────────────────────
MISSING_DEPS=()
for dep in "libappindicator-gtk3-devel" "webkit2gtk4.1-devel"; do
    if ! rpm -q "$dep" &>/dev/null; then
        MISSING_DEPS+=("$dep")
    fi
done

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Some recommended dependencies missing:${NC}"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    echo "  Install all with:"
    echo "    sudo dnf install ${MISSING_DEPS[*]}"
    echo ""
fi

# ── 5. Clean and prepare ────────────────────────────────────────────────────
echo "Cleaning previous build artifacts..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# ── 6. Go module dependencies ──────────────────────────────────────────────
echo "Downloading Go module dependencies..."
go mod download
echo -e "${GREEN}Dependencies resolved${NC}"
echo ""

# ── 7. Build ────────────────────────────────────────────────────────────────
if [ "${1:-}" == "--dev" ]; then
    echo -e "${YELLOW}Building in DEVELOPMENT mode...${NC}"
    echo "  → Starting Wails dev server (Ctrl+C to stop)"
    echo ""
    wails dev
else
    echo -e "${GREEN}Building PRODUCTION binary...${NC}"
    echo "  Target: $OUTPUT_DIR/$BINARY_NAME"
    echo ""

    # wails build produces: build/bin/figaro
    # -tags webkit2_41 is required on Fedora which ships webkit2gtk-4.1
    wails build \
        -platform linux/amd64 \
        -o "$BINARY_NAME" \
        -tags webkit2_41 \
        -ldflags "-s -w" \
        2>&1

    echo ""
    if [ -f "$OUTPUT_DIR/$BINARY_NAME" ]; then
        SIZE=$(du -h "$OUTPUT_DIR/$BINARY_NAME" | cut -f1)
        echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  BUILD SUCCESSFUL                       ║${NC}"
        echo -e "${GREEN}╠══════════════════════════════════════════╣${NC}"
        echo -e "${GREEN}║  Binary: $OUTPUT_DIR/$BINARY_NAME${NC}"
        echo -e "${GREEN}║  Size:   $SIZE${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
        echo ""
        echo "  Run with: ./$OUTPUT_DIR/$BINARY_NAME"
    else
        echo -e "${RED}BUILD FAILED — check errors above${NC}"
        exit 1
    fi
fi
