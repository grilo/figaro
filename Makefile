# figaro — desktop build targets
#
# Requires Go 1.26.6+. Wails v3 compiles with plain `go build`; the wails3 tool
# pinned by go.mod runs through `go run` only to generate Windows resources and
# macOS bundle metadata. Linux builds require GCC, pkg-config, GTK4, and
# WebKitGTK 6.0. The Windows target uses Wails' pure-Go WebView2 path and needs
# no C toolchain.

.DEFAULT_GOAL := help
.NOTPARALLEL:

.PHONY: all help bootstrap doctor vendor release-check release release-local major minor patch dev linux windows darwin clean icons install-desktop \
	stress-vault \
	check-go check-node check-linux-host check-linux-deps check-darwin-host check-darwin-deps check-icon-tool \
	ensure-go-modules ensure-frontend-assets ensure-icons

RELEASE_BUMP_GOALS := $(filter major minor patch,$(MAKECMDGOALS))
RELEASE_REQUEST := $(if $(strip $(VERSION)),$(VERSION),$(RELEASE_BUMP_GOALS))

ifneq ($(filter release-check release release-local,$(MAKECMDGOALS)),)
ifneq ($(words $(RELEASE_BUMP_GOALS)),0)
ifneq ($(words $(RELEASE_BUMP_GOALS)),1)
$(error choose exactly one release bump: major, minor, or patch)
endif
endif
ifneq ($(strip $(VERSION)),)
ifneq ($(strip $(RELEASE_BUMP_GOALS)),)
$(error use either VERSION=vMAJOR.MINOR.PATCH or one bump goal, not both)
endif
endif
endif

GO_BIN := $(shell go env GOBIN 2>/dev/null)
ifeq ($(strip $(GO_BIN)),)
GO_BIN := $(shell go env GOPATH 2>/dev/null)/bin
endif

WAILS_VERSION := $(shell sed -n 's#^[[:space:]]*github.com/wailsapp/wails/v3 \(v[^[:space:]]*\).*#\1#p' go.mod | head -n 1)
HOST_GOOS := $(shell go env GOOS 2>/dev/null)
STRESS_VAULT_PATH ?= $(CURDIR)/stress-vault/huge-vault
STRESS_REPORT_DIR ?= $(CURDIR)/stress-vault

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
	@echo "  make darwin      Build a universal macOS build/bin/figaro.app (macOS host only)"
	@echo "  make all         Build all targets supported by the current host"
	@echo "  make bootstrap   Prepare Go modules, locked npm dependencies, browser assets, and icons"
	@echo "  make doctor      Check build prerequisites and print install hints when needed"
	@echo "  make vendor      Force regeneration of vendored browser assets"
	@echo "  make release-check minor       Verify a provisional version without committing or publishing"
	@echo "  make release patch             Bump from the latest release tag, then publish"
	@echo "  make release <major|minor|patch> Bump and publish a release"
	@echo "  make release VERSION=vX.Y.Z    Publish an explicit stable version"
	@echo "  make release-local patch       Bump, verify, commit, and tag without pushing"
	@echo "  make dev         Run Figaro from source against ./vault"
	@echo "  make stress-vault Generate and profile the opt-in 10,000-note stress vault"
	@echo "  make icons       Rebuild application icons from figaro.appicon.png"
	@echo "  make clean       Remove generated assets, installs, builds, and local vault data"
	@echo ""
	@echo "Builds use Wails $(WAILS_VERSION) from go.mod; no separate CLI install is needed."
	@echo "The Windows target cross-builds without MinGW-w64."
	@echo "Linux builds use GTK4 with WebKitGTK 6.0."

check-go:
	@if ! command -v go >/dev/null 2>&1; then \
		echo "Go 1.26.6 or newer is required."; \
		echo "Install Go from: https://go.dev/dl/"; \
		exit 1; \
	fi
	@set -- $$(go version 2>/dev/null | sed -nE 's/^go version go([0-9]+)\.([0-9]+)\.([0-9]+).*/\1 \2 \3/p'); \
	if [ "$$#" -ne 3 ] || [ "$$1" -lt 1 ] || { [ "$$1" -eq 1 ] && { [ "$$2" -lt 26 ] || { [ "$$2" -eq 26 ] && [ "$$3" -lt 6 ]; }; }; }; then \
		echo "Figaro requires Go 1.26.6 or newer; found $$(go version 2>/dev/null || echo unknown)."; \
		echo "Install Go from: https://go.dev/dl/"; \
		exit 1; \
	fi

check-node:
	@if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then \
		./scripts/build-prereqs.sh hint-frontend; \
		exit 1; \
	fi
	@if ! node ./scripts/check-node-version.js; then \
		./scripts/build-prereqs.sh hint-frontend; \
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

check-darwin-deps:
	@if ! xcode-select -p >/dev/null 2>&1; then \
		echo "macOS builds require Xcode Command Line Tools."; \
		echo "Install them with: xcode-select --install"; \
		exit 1; \
	fi

check-icon-tool:
	@if ! command -v magick >/dev/null 2>&1 && ! { command -v convert >/dev/null 2>&1 && convert -version 2>&1 | grep -q ImageMagick; }; then \
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
		if ! command -v magick >/dev/null 2>&1 && ! { command -v convert >/dev/null 2>&1 && convert -version 2>&1 | grep -q ImageMagick; }; then ./scripts/build-prereqs.sh hint-icons; exit 1; fi; \
		$(MAKE) icons; \
	fi

bootstrap: check-go check-node check-icon-tool ensure-go-modules ensure-frontend-assets ensure-icons
	@echo "Bootstrap complete. Run 'make dev' or a platform build target."

doctor: check-go check-node check-icon-tool
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

release-check: check-go check-node
	@./scripts/prepare-release.sh --check "$(RELEASE_REQUEST)"

release: check-go check-node
	@./scripts/prepare-release.sh --push "$(RELEASE_REQUEST)"

release-local: check-go check-node
	@./scripts/prepare-release.sh "$(RELEASE_REQUEST)"

major minor patch:
	@:

dev: check-go ensure-go-modules ensure-frontend-assets ensure-icons
	go run .

stress-vault: check-go check-node ensure-frontend-assets
	@node scripts/generate-stress-vault.mjs --output "$(STRESS_VAULT_PATH)" --replace
	@go test ./internal/desktop \
		-run 'TestWarmVaultStateMatchesColdRebuildAcrossMutationSequence|TestDirectoryMoveRewritesSparseLinksAcrossLargeVault' \
		-count=1
	@go test ./internal/history \
		-run 'TestFileUncommittedStatusMatchesFullWorktreeStateMatrix' \
		-count=1
	@FIGARO_STRESS_VAULT="$(STRESS_VAULT_PATH)" \
		FIGARO_STRESS_REPORT="$(STRESS_REPORT_DIR)/backend-report.json" \
		go test ./internal/desktop -run '^TestHugeVaultStress$$' -count=1 -v -timeout=10m
	@FIGARO_STRESS_VAULT="$(STRESS_VAULT_PATH)" \
		FIGARO_STRESS_BROWSER_REPORT="$(STRESS_REPORT_DIR)/browser-report.json" \
		FIGARO_STRESS_DOCUMENT_SWITCH_REPORT="$(STRESS_REPORT_DIR)/document-switch-report.json" \
		npx playwright test tests/e2e/hugeVaultStress.spec.js --reporter=line
	@echo "Stress reports: $(STRESS_REPORT_DIR)/backend-report.json, $(STRESS_REPORT_DIR)/browser-report.json, and $(STRESS_REPORT_DIR)/document-switch-report.json"

# ── Production builds ────────────────────────────────────────────────────

linux: check-go check-linux-host check-linux-deps ensure-go-modules ensure-frontend-assets ensure-icons
	@./scripts/package-desktop.sh linux

windows: check-go ensure-go-modules ensure-frontend-assets ensure-icons
	@./scripts/package-desktop.sh windows

darwin: check-go check-darwin-host check-darwin-deps ensure-go-modules ensure-frontend-assets ensure-icons
	@./scripts/package-desktop.sh darwin

# ── Utility ──────────────────────────────────────────────────────────────

clean:
	rm -rf build appicon.png assets/branding \
		frontend/icon-*.png frontend/favicon.ico frontend/wailsjs \
		frontend/vendored/@marijn frontend/vendored/codemirror \
		frontend/vendored/crelt frontend/vendored/importmap.json \
		frontend/vendored/katex frontend/vendored/lezer \
		frontend/vendored/lucide \
		frontend/vendored/markdown-it-plugins frontend/vendored/style-mod \
		frontend/vendored/spellcheck frontend/vendored/w3c-keyname node_modules test-results playwright-report coverage \
		vault stress-vault scripts/*.local.sh

icons:
	./scripts/generate-icons.sh

install-desktop:
	rm -f ~/.local/share/applications/figaro.desktop
	rm -f ~/.local/share/icons/hicolor/*/apps/figaro.png
	rm -f ~/.local/share/icons/hicolor/*/apps/io.github.figaro.Figaro.png
	@echo "Desktop integration cleared — restart app to reinstall"
