# figaro — desktop build targets
#
# Requires Go 1.25+ and the Wails CLI version used by go.mod. Linux builds
# require GCC, pkg-config, GTK3, and either WebKitGTK 4.0 or 4.1. The current
# Windows target uses Wails' pure-Go WebView2 path and needs no C toolchain.

.DEFAULT_GOAL := help
.NOTPARALLEL:

.PHONY: all help dev linux windows darwin clean icons install-desktop \
	check-wails check-linux-host check-linux-deps check-darwin-host \
	ensure-frontend-assets ensure-icons

GO_BIN := $(shell go env GOBIN 2>/dev/null)
ifeq ($(strip $(GO_BIN)),)
GO_BIN := $(shell go env GOPATH 2>/dev/null)/bin
endif

# Prefer a CLI already available on PATH, but also support Go's normal bin
# directory so users do not need to modify PATH just to invoke make.
WAILS ?= $(shell command -v wails 2>/dev/null || true)
ifeq ($(strip $(WAILS)),)
WAILS := $(GO_BIN)/wails
endif
WAILS_VERSION := v2.12.0
HOST_GOOS := $(shell go env GOOS 2>/dev/null)

# Wails uses WebKitGTK 4.0 by default. Fedora and other current distributions
# ship 4.1, which requires this explicit build tag.
LINUX_WAILS_TAGS := $(shell if command -v pkg-config >/dev/null 2>&1 && pkg-config --exists webkit2gtk-4.1; then printf '%s' '-tags webkit2_41'; fi)

ifeq ($(HOST_GOOS),linux)
all: linux windows
else ifeq ($(HOST_GOOS),darwin)
all: darwin
else ifeq ($(HOST_GOOS),windows)
all: windows
else
all:
	@echo "No supported aggregate build for host platform: $(HOST_GOOS)"
	@echo "Run a supported platform-specific target from Linux, macOS, or Windows."
	@exit 1
endif

help:
	@echo "figaro — desktop build"
	@echo ""
	@echo "  make linux       Build Linux amd64 into build/bin/figaro"
	@echo "  make windows     Build Windows amd64 into build/bin/figaro.exe"
	@echo "  make darwin      Build macOS amd64 and arm64 binaries (macOS host only)"
	@echo "  make all         Build all targets supported by the current host"
	@echo "  make dev         Run the Wails development server"
	@echo "  make icons       Rebuild application icons from figaro.appicon.png"
	@echo "  make clean       Remove generated assets, installs, builds, and local vault data"
	@echo ""
	@echo "Install the matching Wails CLI with:"
	@echo "  go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)"
	@echo ""
	@echo "The current Windows target cross-builds without MinGW-w64."

check-wails:
	@if [ ! -x "$(WAILS)" ] && ! command -v "$(WAILS)" >/dev/null 2>&1; then \
		echo "Wails CLI was not found."; \
		echo "Install the version from go.mod with:"; \
		echo "  go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)"; \
		exit 1; \
	fi

check-linux-host:
	@if [ "$(HOST_GOOS)" != "linux" ]; then \
		echo "Wails can build Linux targets only from a Linux host."; \
		exit 1; \
	fi

check-darwin-host:
	@if [ "$(HOST_GOOS)" != "darwin" ]; then \
		echo "Wails can build macOS targets only from a macOS host."; \
		exit 1; \
	fi

check-linux-deps:
	@if ! command -v gcc >/dev/null 2>&1; then \
		echo "Linux builds require GCC."; \
		exit 1; \
	fi
	@if ! command -v pkg-config >/dev/null 2>&1; then \
		echo "Linux builds require pkg-config."; \
		exit 1; \
	fi
	@if ! pkg-config --exists gtk+-3.0 gio-unix-2.0; then \
		echo "Linux builds require GTK3 development files."; \
		exit 1; \
	fi
	@if pkg-config --exists webkit2gtk-4.1; then \
		echo "Using WebKitGTK 4.1 (Wails tag: webkit2_41)."; \
	elif pkg-config --exists webkit2gtk-4.0; then \
		echo "Using WebKitGTK 4.0."; \
	else \
		echo "Linux builds require WebKitGTK 4.0 or 4.1 development files."; \
		exit 1; \
	fi

# ── Development ──────────────────────────────────────────────────────────

ensure-frontend-assets:
	@if [ ! -d node_modules ]; then \
		echo "Frontend dependencies are missing. Run: npm ci"; \
		exit 1; \
	fi
	@if [ ! -f frontend/vendored/codemirror/state/index.js ]; then \
		echo "Generating browser assets..."; \
		npm run vendor; \
	fi

ensure-icons:
	@if [ ! -f appicon.png ] || [ ! -f build/appicon.png ] || [ ! -f frontend/icon-32.png ] || [ ! -f frontend/favicon.ico ]; then \
		$(MAKE) icons; \
	fi

dev: ensure-frontend-assets ensure-icons check-wails
	$(WAILS) dev

# ── Production builds ────────────────────────────────────────────────────

linux: ensure-frontend-assets ensure-icons check-wails check-linux-host check-linux-deps
	$(WAILS) build -platform linux/amd64 $(LINUX_WAILS_TAGS) -o figaro
	@echo "Output: build/bin/figaro"

windows: ensure-frontend-assets ensure-icons check-wails
	$(WAILS) build -platform windows/amd64
	@echo "Output: build/bin/figaro.exe"

darwin: ensure-frontend-assets ensure-icons check-wails check-darwin-host
	$(WAILS) build -platform darwin/amd64 -o figaro-darwin
	$(WAILS) build -platform darwin/arm64 -o figaro-darwin-arm64

# ── Utility ──────────────────────────────────────────────────────────────

clean:
	rm -rf build appicon.png assets/branding \
		frontend/icon-*.png frontend/favicon.ico frontend/wailsjs \
		frontend/vendored/@marijn frontend/vendored/codemirror \
		frontend/vendored/crelt frontend/vendored/importmap.json \
		frontend/vendored/katex frontend/vendored/lezer \
		frontend/vendored/markdown-it-plugins frontend/vendored/style-mod \
		frontend/vendored/w3c-keyname node_modules test-results playwright-report coverage \
		vault reasonix.toml .reasonix scripts/*.local.sh

icons:
	./scripts/generate-icons.sh

install-desktop:
	rm -f ~/.local/share/applications/figaro.desktop
	rm -f ~/.local/share/icons/hicolor/*/apps/figaro.png
	rm -f ~/.local/share/icons/hicolor/*/apps/io.github.figaro.Figaro.png
	@echo "Desktop integration cleared — restart app to reinstall"
