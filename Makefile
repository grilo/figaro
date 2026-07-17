# figaro — desktop build targets
#
# Requires Go 1.25+ and the Wails CLI version used by go.mod. Linux builds
# require GCC, pkg-config, GTK3, and either WebKitGTK 4.0 or 4.1. The current
# Windows target uses Wails' pure-Go WebView2 path and needs no C toolchain.

.DEFAULT_GOAL := help
.NOTPARALLEL:

.PHONY: all help bootstrap doctor vendor dev linux windows darwin clean icons install-desktop \
	check-go check-node check-wails check-linux-host check-linux-deps check-darwin-host check-darwin-deps check-icon-tool \
	ensure-go-modules ensure-frontend-assets ensure-icons

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
	@echo "  make bootstrap   Prepare Go modules, locked npm dependencies, browser assets, and icons"
	@echo "  make doctor      Check build prerequisites and print install hints when needed"
	@echo "  make vendor      Force regeneration of vendored browser assets"
	@echo "  make dev         Run the Wails development server"
	@echo "  make icons       Rebuild application icons from figaro.appicon.png"
	@echo "  make clean       Remove generated assets, installs, builds, and local vault data"
	@echo ""
	@echo "Install the matching Wails CLI with:"
	@echo "  go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)"
	@echo ""
	@echo "The current Windows target cross-builds without MinGW-w64."
	@echo "Linux builds use GTK3 with WebKitGTK 4.1 when available (4.0 is also supported)."

check-go:
	@if ! command -v go >/dev/null 2>&1; then \
		echo "Go 1.25 or newer is required."; \
		echo "Install Go from: https://go.dev/dl/"; \
		exit 1; \
	fi
	@set -- $$(go version 2>/dev/null | sed -nE 's/^go version go([0-9]+)\.([0-9]+).*/\1 \2/p'); \
	if [ "$$#" -ne 2 ] || [ "$$1" -lt 1 ] || { [ "$$1" -eq 1 ] && [ "$$2" -lt 25 ]; }; then \
		echo "Figaro requires Go 1.25 or newer; found $$(go version 2>/dev/null || echo unknown)."; \
		echo "Install Go from: https://go.dev/dl/"; \
		exit 1; \
	fi

check-node:
	@if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then \
		./scripts/build-prereqs.sh hint-frontend; \
		exit 1; \
	fi
	@node_major="$$(node -p "process.versions.node.split('.')[0]")"; \
	if [ "$$node_major" -lt 20 ]; then \
		echo "Figaro requires Node.js 20 or newer; found $$(node --version)."; \
		./scripts/build-prereqs.sh hint-frontend; \
		exit 1; \
	fi

check-wails:
	@if [ ! -x "$(WAILS)" ] && ! command -v "$(WAILS)" >/dev/null 2>&1; then \
		echo "Wails CLI was not found."; \
		echo "Install the version from go.mod with:"; \
		echo "  go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)"; \
		exit 1; \
	fi
	@installed_version="$$("$(WAILS)" version 2>/dev/null | sed -n '1p')"; \
	if [ -n "$$installed_version" ] && [ "$$installed_version" != "$(WAILS_VERSION)" ]; then \
		echo "Warning: go.mod requires Wails $(WAILS_VERSION), but the CLI is $$installed_version."; \
		echo "Recommended: go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)"; \
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

check-darwin-deps:
	@if ! xcode-select -p >/dev/null 2>&1; then \
		echo "macOS builds require Xcode Command Line Tools."; \
		echo "Install them with: xcode-select --install"; \
		exit 1; \
	fi

check-icon-tool:
	@if ! command -v magick >/dev/null 2>&1; then \
		./scripts/build-prereqs.sh hint-icons; \
		exit 1; \
	fi

check-linux-deps:
	@./scripts/build-prereqs.sh check-linux

# ── Development ──────────────────────────────────────────────────────────

ensure-go-modules: check-go
	@echo "Resolving Go module dependencies..."
	@go mod download

ensure-frontend-assets: check-node
	@./scripts/prepare-frontend.sh

ensure-icons:
	@if [ ! -f appicon.png ] || [ ! -f build/appicon.png ] || [ ! -f frontend/icon-32.png ] || [ ! -f frontend/icon-256.png ] || [ ! -f frontend/favicon.ico ] || \
		[ figaro.appicon.png -nt appicon.png ] || [ figaro.appicon.png -nt build/appicon.png ] || [ figaro.appicon.png -nt frontend/icon-32.png ] || [ figaro.appicon.png -nt frontend/icon-256.png ] || [ figaro.appicon.png -nt frontend/favicon.ico ] || \
		[ scripts/generate-icons.sh -nt appicon.png ]; then \
		if ! command -v magick >/dev/null 2>&1; then ./scripts/build-prereqs.sh hint-icons; exit 1; fi; \
		$(MAKE) icons; \
	fi

bootstrap: check-go check-node check-icon-tool ensure-go-modules ensure-frontend-assets ensure-icons
	@echo "Bootstrap complete. Run 'make dev' or a platform build target."

doctor: check-go check-node check-icon-tool check-wails
	@echo "Base build prerequisites are available."

ifeq ($(HOST_GOOS),linux)
doctor: check-linux-host check-linux-deps
dev: check-linux-host check-linux-deps
else ifeq ($(HOST_GOOS),darwin)
doctor: check-darwin-host check-darwin-deps
dev: check-darwin-host check-darwin-deps
endif

vendor: check-node
	@FIGARO_FORCE_VENDOR=1 ./scripts/prepare-frontend.sh

dev: check-go check-wails ensure-go-modules ensure-frontend-assets ensure-icons
	$(WAILS) dev $(LINUX_WAILS_TAGS)

# ── Production builds ────────────────────────────────────────────────────

linux: check-go check-wails check-linux-host check-linux-deps ensure-go-modules ensure-frontend-assets ensure-icons
	$(WAILS) build -platform linux/amd64 $(LINUX_WAILS_TAGS) -o figaro
	@echo "Output: build/bin/figaro"

windows: check-go check-wails ensure-go-modules ensure-frontend-assets ensure-icons
	$(WAILS) build -platform windows/amd64
	@echo "Output: build/bin/figaro.exe"

darwin: check-go check-wails check-darwin-host check-darwin-deps ensure-go-modules ensure-frontend-assets ensure-icons
	$(WAILS) build -platform darwin/amd64 -o figaro-darwin
	$(WAILS) build -platform darwin/arm64 -o figaro-darwin-arm64

# ── Utility ──────────────────────────────────────────────────────────────

clean:
	rm -rf build appicon.png assets/branding \
		frontend/icon-*.png frontend/favicon.ico frontend/wailsjs \
		frontend/vendored/@marijn frontend/vendored/codemirror \
		frontend/vendored/crelt frontend/vendored/importmap.json \
		frontend/vendored/katex frontend/vendored/lezer \
		frontend/vendored/lucide \
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
