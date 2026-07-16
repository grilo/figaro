# Contributing to figaro

Thank you for helping improve figaro. The project is a local-first Wails desktop
application: changes should preserve portable vault files, work without a
cloud service, and avoid silently discarding a user's edits.

## Development setup

Install the following before working on the project:

- Go 1.25 or newer
- Node.js 20 or newer
- Wails v2 CLI
- The native build dependencies required by Wails for your platform

Install Wails once, then prepare the repository:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
make bootstrap
```

Start the desktop app with:

```bash
make dev
```

Set `VAULT_PATH` to use a non-default vault while developing:

```bash
VAULT_PATH="$HOME/Documents/figaro-dev-vault" make dev
```

`./scripts/debug.sh` starts the frontend development server and opts into the
loopback-only WebKit inspector for that session.

## Build a release binary

The Makefile contains the supported targets:

```bash
make linux
make windows
make darwin
make icons # regenerate all app icon variants from figaro.appicon.png
```

`make linux` builds the native Linux target and checks for GTK3 plus WebKitGTK
4.0 or 4.1 first. `make doctor` prints the package-manager command for missing
tools and headers; WebKitGTK 4.1 is preferred and 4.0 remains supported. The
current Windows target uses Wails' pure-Go WebView2 path and cross-builds from
Linux without MinGW-w64; macOS builds still require a macOS host. Wails also
requires a Linux host for Linux builds, while `make all` selects the outputs
supported by the current host. See the `help` target in the [Makefile](Makefile).
On Fedora, `./scripts/build-fedora.sh` delegates to the same `make linux`
workflow.

## Verify a change

Run the checks relevant to the files you touched before opening a pull
request. Run the complete set for changes that cross the Go/frontend boundary:

```bash
# Prepare a fresh checkout (or regenerate ignored browser assets).
make bootstrap

# Application packages (root Wails facade, internal modules, and dev commands)
go vet . ./internal/... ./cmd/...
go test . ./internal/... ./cmd/...
go test -race . ./internal/... ./cmd/...

# JavaScript and CodeMirror behaviour
npm run lint
npm run test:unit

# Browser-level PDF and diagram regression test
npx playwright install chromium # first time only
npm run test:pdf
```

Run these locally before opening a pull request. Keep generated vaults, build
outputs, and personal notes out of commits.

## Generated and vendored assets

`make icons` runs [scripts/generate-icons.sh](scripts/generate-icons.sh) and
updates every shipped icon from `figaro.appicon.png`. The output is ignored;
the Makefile regenerates it automatically before desktop builds.

Generated browser modules are ignored under `frontend/vendored/`. The Makefile
recreates them automatically. To refresh them explicitly, run:

```bash
make vendor
```

The vendor workflow copies only KaTeX's production browser assets:
minified JavaScript, minified CSS, the CSS-referenced fonts, its license, and
a versioned manifest. It intentionally excludes KaTeX source, tests, CLI, and
upstream build tooling, including its Python maintenance scripts.

## Repository layout

```text
main.go, go.mod, wails.json  Wails bootstrap and project configuration
internal/vault/              Root-scoped filesystem primitives
internal/links/              Pure Markdown link rewriting
internal/history/            Local Git history and auto-commit service
frontend/                    Webview, CodeMirror, themes, fonts, and assets
tests/frontend/              Jest unit and UI-integration tests
tests/e2e/                   Playwright browser tests
```

Go tests live alongside the package they exercise. Keep package-internal tests
there rather than exporting implementation details solely for a separate test
directory. Frontend and browser tests remain centralized because they exercise
the assembled webview rather than one JavaScript package in isolation.

## Code conventions

- Format Go with `gofmt`; run the JavaScript linter rather than hand-formatting
  vendored dependencies.
- Prefer root-scoped vault filesystem operations over absolute-path checks.
- Preserve unsaved editor content during asynchronous or filesystem-driven
  changes.
- Add a regression test for a bug fix, especially for file moves, sessions,
  rendering, or concurrency.
- Keep user-facing workflow changes in `README.md` and the detailed behavior
  contract in `docs/PROMPT.md` in the same change.
