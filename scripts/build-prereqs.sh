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
            printf '%s\n' "  sudo dnf install gcc pkgconf-pkg-config gtk4-devel webkitgtk6.0-devel ImageMagick"
            ;;
        apt-get)
            printf '%s\n' "  sudo apt-get install build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev imagemagick"
            ;;
        pacman)
            printf '%s\n' "  sudo pacman -S --needed base-devel pkgconf gtk4 webkitgtk-6.0 imagemagick"
            ;;
        zypper)
            printf '%s\n' "  sudo zypper install gcc-c++ pkg-config gtk4-devel webkitgtk-6_0-devel ImageMagick"
            ;;
        emerge)
            printf '%s\n' "  sudo emerge --ask sys-devel/gcc dev-util/pkgconf gui-libs/gtk net-libs/webkit-gtk:6 media-gfx/imagemagick"
            ;;
        eopkg)
            printf '%s\n' "  sudo eopkg it gcc pkgconf libgtk-4-devel libwebkit-gtk6-devel imagemagick"
            ;;
        nix-shell)
            printf '%s\n' "  nix-shell -p gcc pkg-config gtk4 webkitgtk_6_0 imagemagick"
            ;;
        *)
            printf '%s\n' "  Install GCC, pkg-config, GTK4 development headers, WebKitGTK 6.0 development headers, and ImageMagick 7."
            ;;
    esac
}

print_frontend_hint() {
    printf '%s\n' "Figaro requires Node.js 20.19+ (20.x), 22.13+ (22.x), or 24+, and npm. Suggested install command:"
    case "$(package_manager)" in
        dnf) printf '%s\n' "  sudo dnf install nodejs npm" ;;
        apt-get) printf '%s\n' "  sudo apt-get install nodejs npm" ;;
        pacman) printf '%s\n' "  sudo pacman -S nodejs npm" ;;
        zypper) printf '%s\n' "  sudo zypper install nodejs20 npm20" ;;
        emerge) printf '%s\n' "  sudo emerge --ask net-libs/nodejs" ;;
        eopkg) printf '%s\n' "  sudo eopkg it nodejs" ;;
        nix-shell) printf '%s\n' "  nix-shell -p nodejs_20" ;;
        *) printf '%s\n' "  Install a supported Node.js release from https://nodejs.org/ or your distribution's package manager." ;;
    esac
}

print_icons_hint() {
    printf '%s\n' "ImageMagick 6 or 7 is required to generate Figaro's icons. Suggested install command:"
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
        pkg-config --exists gtk4 || missing+=("GTK4 development headers (gtk4)")
        pkg-config --exists gio-unix-2.0 || missing+=("GIO Unix development headers (gio-unix-2.0)")
        pkg-config --exists webkitgtk-6.0 || missing+=("WebKitGTK 6.0 development headers (webkitgtk-6.0)")
    fi

    if ((${#missing[@]} == 0)); then
        return 0
    fi

    printf '%s\n' "Linux native build dependencies are missing:"
    printf '  - %s\n' "${missing[@]}"
    printf '%s\n' ""
    printf '%s\n' "Figaro uses Wails v3's GTK4 backend with WebKitGTK 6.0."
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
