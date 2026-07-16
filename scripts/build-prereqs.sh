#!/usr/bin/env bash
# Print actionable platform dependency hints used by the Makefile.

set -euo pipefail

mode="${1:-check-linux}"

package_manager() {
    for manager in dnf apt-get pacman zypper emerge eopkg nix-shell; do
        if command -v "$manager" >/dev/null 2>&1; then
            printf '%s\n' "$manager"
            return
        fi
    done
    printf '%s\n' "unknown"
}

print_linux_hint() {
    case "$(package_manager)" in
        dnf)
            printf '%s\n' "  sudo dnf install gcc pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel ImageMagick"
            ;;
        apt-get)
            printf '%s\n' "  sudo apt-get install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev imagemagick"
            printf '%s\n' "  # On older Debian/Ubuntu releases, use libwebkit2gtk-4.0-dev instead."
            ;;
        pacman)
            printf '%s\n' "  sudo pacman -S --needed base-devel pkgconf gtk3 webkit2gtk imagemagick"
            ;;
        zypper)
            printf '%s\n' "  sudo zypper install gcc-c++ pkg-config gtk3-devel webkit2gtk3-devel ImageMagick"
            ;;
        emerge)
            printf '%s\n' "  sudo emerge --ask sys-devel/gcc dev-util/pkgconf x11-libs/gtk+ net-libs/webkit-gtk media-gfx/imagemagick"
            ;;
        eopkg)
            printf '%s\n' "  sudo eopkg it gcc pkgconf libgtk-3-devel libwebkit-gtk-devel imagemagick"
            ;;
        nix-shell)
            printf '%s\n' "  nix-shell -p gcc pkg-config gtk3 webkitgtk imagemagick"
            ;;
        *)
            printf '%s\n' "  Install GCC, pkg-config, GTK3 development headers, WebKitGTK 4.1 or 4.0 development headers, and ImageMagick 7."
            ;;
    esac
}

print_frontend_hint() {
    printf '%s\n' "Figaro requires Node.js 20 or newer and npm. Suggested install command:"
    case "$(package_manager)" in
        dnf) printf '%s\n' "  sudo dnf install nodejs npm" ;;
        apt-get) printf '%s\n' "  sudo apt-get install nodejs npm" ;;
        pacman) printf '%s\n' "  sudo pacman -S nodejs npm" ;;
        zypper) printf '%s\n' "  sudo zypper install nodejs20 npm20" ;;
        emerge) printf '%s\n' "  sudo emerge --ask net-libs/nodejs" ;;
        eopkg) printf '%s\n' "  sudo eopkg it nodejs" ;;
        nix-shell) printf '%s\n' "  nix-shell -p nodejs_20" ;;
        *) printf '%s\n' "  Install Node.js 20+ from https://nodejs.org/ or your distribution's package manager." ;;
    esac
}

print_icons_hint() {
    printf '%s\n' "ImageMagick 7 (the 'magick' command) is required to generate Figaro's icons. Suggested install command:"
    case "$(package_manager)" in
        dnf) printf '%s\n' "  sudo dnf install ImageMagick" ;;
        apt-get) printf '%s\n' "  sudo apt-get install imagemagick" ;;
        pacman) printf '%s\n' "  sudo pacman -S imagemagick" ;;
        zypper) printf '%s\n' "  sudo zypper install ImageMagick" ;;
        emerge) printf '%s\n' "  sudo emerge --ask media-gfx/imagemagick" ;;
        eopkg) printf '%s\n' "  sudo eopkg it imagemagick" ;;
        nix-shell) printf '%s\n' "  nix-shell -p imagemagick" ;;
        *) printf '%s\n' "  Install ImageMagick 7 from your distribution's package manager." ;;
    esac
}

check_linux() {
    local -a missing=()

    command -v gcc >/dev/null 2>&1 || missing+=("GCC compiler (gcc)")
    if ! command -v pkg-config >/dev/null 2>&1; then
        missing+=("pkg-config")
    else
        pkg-config --exists gtk+-3.0 || missing+=("GTK3 development headers (gtk+-3.0)")
        pkg-config --exists gio-unix-2.0 || missing+=("GIO Unix development headers (gio-unix-2.0)")
        if pkg-config --exists webkit2gtk-4.1; then
            printf '%s\n' "Using WebKitGTK 4.1 ($(pkg-config --modversion webkit2gtk-4.1); Wails build tag: webkit2_41)."
        elif pkg-config --exists webkit2gtk-4.0; then
            printf '%s\n' "Using WebKitGTK 4.0 ($(pkg-config --modversion webkit2gtk-4.0))."
        else
            missing+=("WebKitGTK 4.1 or 4.0 development headers")
        fi
    fi

    if ((${#missing[@]} == 0)); then
        return 0
    fi

    printf '%s\n' "Linux native build dependencies are missing:"
    printf '  - %s\n' "${missing[@]}"
    printf '%s\n' ""
    printf '%s\n' "Figaro uses Wails v2's GTK3 backend. WebKitGTK 4.1 is preferred; 4.0 is also supported."
    printf '%s\n' "Install the matching packages for this system with:"
    print_linux_hint
    printf '%s\n' ""
    printf '%s\n' "If your distribution uses different names, search its packages for the missing pkg-config module shown above."
    return 1
}

case "$mode" in
    check-linux) check_linux ;;
    hint-linux) print_linux_hint ;;
    hint-frontend) print_frontend_hint ;;
    hint-icons) print_icons_hint ;;
    *)
        printf '%s\n' "Usage: $0 {check-linux|hint-linux|hint-frontend|hint-icons}" >&2
        exit 2
        ;;
esac
