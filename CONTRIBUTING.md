# Contributing to Figaro

Thank you for helping improve Figaro. The project is a local-first Wails desktop
application: changes should preserve portable vault files, work without a
cloud service, and avoid silently discarding a user's edits.

## Development setup

Install the following before working on the project:

- Go 1.25 or newer
- Node.js 20.19+ (20.x), 22.13+ (22.x), or 24+
- Wails v2 CLI
- The native build dependencies required by Wails for your platform

On Linux, run `make doctor` for distribution-specific package names. The build
requires a C compiler, `pkg-config`, GTK 3, WebKitGTK 4.1 or 4.0, and
ImageMagick. Windows uses the Wails WebView2 toolchain. Building the universal
macOS package requires a macOS host.

Install Wails once, then prepare the repository:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.14.0
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

For a focused Draw.io protocol trace, run
`window.__figaroDrawioDebug = true` in the inspector before saving a diagram.
It logs only protocol metadata and byte counts, never diagram contents; inspect
`window.__figaroDrawioProtocolTrace` to copy the last 100 entries.

## Development workflow

1. Start from the current `main` branch and keep each change focused.
2. Add or update a regression test at the lowest layer that can prove the
   behavior.
3. Update `CHANGELOG.md` under `[Unreleased]` for user-facing changes, using an
   applicable Keep a Changelog category, and keep every affected documentation
   surface synchronized.
4. Run the relevant checks described in [Testing and
   verification](#testing-and-verification).
5. Open a pull request that explains the user-visible outcome, the important
   implementation decisions, and how the change was verified.

Do not commit generated vaults, build outputs, personal notes, tokens, or other
local credentials. Preserve unrelated changes when working in an existing
checkout.

## Architecture principles

Separate behavior from effects before splitting files:

- Pure core modules own validation, normalization, planning, transformations,
  and reducers. They do not access files, Wails, Git, browser processes, the
  DOM, CodeMirror views, timers, or mutable application globals.
- Application use cases coordinate effects through narrow injected ports and
  own sequencing, conflicts, cancellation, and rollback.
- Adapters own `os.Root`, JSON persistence, Git, Wails translation, DOM,
  CodeMirror, clocks, and schedulers. Composition roots connect the layers.
- Keep root-scoped filesystem integration coverage even when a use case also
  has an in-memory fake; only the real adapter can prove containment,
  permissions, atomic writes, and compensation.

Use this structure for future features whenever a workflow combines
deterministic decisions with I/O. Extract the smallest useful pure seam and
leave unrelated code alone. A trivial pass-through with no policy, branching,
sequencing, or reusable transformation does not need an interface or extra
layer; effectful workflows with real decisions do.

Bundled application code and local feature dependencies are eagerly loaded and
initialized during startup. Do not introduce interaction-triggered dynamic
imports or first-use parser/renderer initialization. User-selected work such as
opening a hosted Draw.io document, scanning Vault health, or generating a PDF
remains demand-driven, but its application code must already be ready.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete dependency and startup
decisions.

## Building the application

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

## Release process

Release commands are for maintainers publishing an approved version. They are
intentionally documented here rather than in the application README.

Use the release target from `main` when a stable release version is approved:

```bash
make release patch
# or: make release major / make release minor
make release VERSION=vMAJOR.MINOR.PATCH
```

`major`, `minor`, and `patch` derive the next version from the highest stable
release tag reachable from `main`; an explicit `VERSION` remains available for
an approved version. It prints the exact base tag and resolved target before
changing metadata, so an untagged package version is never mistaken for a
release. The target validates the version and Git identity,
synchronizes the root npm and Wails metadata plus the changelog, validates the
exact curated release-note body, runs the complete release verification suite,
stages all current non-ignored changes into one release commit and annotated
tag, then pushes `main` and that exact tag in order. It never deletes pending
work, alters an existing tag, or pushes other refs. Repeating the same version
resumes a matching tagged release after a failed push. Use `make release-local patch` or
`make release-local VERSION=vMAJOR.MINOR.PATCH` to stop before the push.
The browser check downloads Playwright's pinned Chromium if necessary, but does
not install system packages or request elevated privileges.
`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and Semantic Versioning from 1.14.0 onward. Add concise user-facing bullets
under `[Unreleased]`, normally beneath **Added**, **Changed**, or **Fixed**;
**Deprecated**, **Removed**, and **Security** are available when applicable.
The release target moves those entries under a bracketed, dated version,
updates the `Unreleased` and version comparison links, and rejects empty,
unknown, duplicated, out-of-order, or entry-free categories. When no entries
are ready, it leaves files unchanged and explains the repair instead of
creating an empty release.

The tag workflow extracts that exact dated section into the GitHub release
body. It does not infer notes from commit or pull-request history, and a retry
repairs the title and notes of an existing release before replacing its assets.
You can preview the body locally after the changelog has been cut with:

```bash
node scripts/extract-release-notes.mjs vMAJOR.MINOR.PATCH
```

`$prepare-figaro-release` invokes the publishing target only when explicitly
asked to publish; pushing the tag starts the GitHub release workflow.

The workflow publishes Linux x86-64, Windows x86-64, and universal macOS
archives, plus `SHA256SUMS`. Each archive includes `README.md`, `CHANGELOG.md`,
and `LICENSE`. Builds are currently unsigned.

## Testing and verification

Run the checks relevant to the files and boundaries you touched before opening
a pull request. Most behavior belongs in pure, use-case, adapter, or focused
component tests; crossing the Go/frontend boundary does not by itself require
Playwright.

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

# Only when the change affects a real browser boundary such as geometry,
# selection/focus, clipboard/composition, frames, or printed output
npx playwright install chromium # first time only
npm run test:pdf
```

For PDF pagination changes, keep one-/two-pass sequencing in the injected Go
use-case tests and reserve the real engine boundary for the opt-in Chromium
contract documented in `docs/TESTING.md`. Set `FIGARO_PDF_TEST_OUTPUT` on that
test when a retained PDF is needed for Poppler rendering and visual review.

Assign every acceptance case to the lowest capable test layer. Add Playwright
coverage only for a browser-only property, prefer extending an existing focused
spec, and use one representative browser workflow rather than duplicating
success and failure matrices end to end. The release target still runs the
complete verification suite.

For changes whose cost grows with vault size, run `make stress-vault`. It
generates an ignored 10,000-document fixture from two source templates and
runs cold-rebuild, filesystem, sparse-link, Git-state, and large-collection
keyboard oracles before recording backend plus browser measurements. Timings
remain free of machine-dependent pass/fail thresholds. See
[the huge-vault procedure](docs/TESTING.md#huge-vault-stress-profile) and
[the reference audit](docs/HUGE_VAULT_STRESS.md).

For changes to Raw Text Preview, sticky headings or Markdown block guides,
current-note heading completion, Vim table cells/rendered-block navigation, or per-tab cursor persistence, follow the
focused layer and browser-boundary guidance in
[`docs/TESTING.md`](docs/TESTING.md).

Run these locally before opening a pull request.

## Review visible UI changes

Use the
[design-system catalogue](frontend/design-system/index.html)
before introducing or consolidating a visible pattern. Run
`go run ./cmd/devserver`, open
`http://127.0.0.1:34115/design-system/`, and compare the affected states across
the bundled themes. The local server disables asset caching, so a normal reload
reflects current CSS, JavaScript, theme, and specimen changes.
You may also open `frontend/design-system/index.html` directly from a file
explorer; its relative assets and classic catalogue bundle support `file://`.

The application and catalogue both load
`frontend/design-system/primitives.css`; `catalog.css` is not a parallel
component library. Reuse a registered `.ui-*` primitive and add or update its
specimen when changing a visible element. Show its selector and meaningful
states, and keep catalogue-only CSS limited to the review shell and
containment of normally positioned overlays. Feature classes may retain
behavior or narrow layout requirements, but must not recreate a primitive's
hover, focus, open, selected, disabled, validation, or semantic styling.

Before implementing a component family, primitive, or visual variant that is
not present in `frontend/design-system/approved-components.json`, obtain
explicit user approval. A broader feature request is not implicit component
approval. Reusing an approved component or adding a narrow host-layout hook
does not require another approval. Once approved, update the registry,
canonical stylesheet, catalogue, audit, and focused regression together.

Keep theme-dependent values in `frontend/design-system/tokens.css` and consume
optional art-direction values through
`frontend/design-system/theme-surfaces.css`. Bundled theme files may contain
only one `:root` rule with custom-property declarations; do not add component
selectors to an individual theme. When splitting or adding application CSS,
place it in the narrowest responsibility module under `frontend/styles/`,
update `frontend/design-system/style-manifest.json`, the explicit links in both
HTML entry points, and the compatibility imports in `frontend/styles.css` in
the same order. These links are intentionally eager—do not replace them with
interaction-time style loading.

When a specimen needs real interaction to expose a state, eagerly reuse its
production controller instead of duplicating the behavior or falling back to
a native host-painted control. Theme-manifest validation and filtering belong
in focused unit/component tests; keep only one representative real-browser
stylesheet switch for the computed CSS boundary.

Run `npm run build:design-system` after changing catalogue JavaScript or the
theme manifest. The focused unit contract verifies that the checked-in bundle
still matches its module sources.

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
upstream build tooling, including its Python maintenance scripts. It also
bundles the browser-safe `nspell` runtime plus the checked-in dependency
versions of the US English, UK English, and Spanish Hunspell `.aff`/`.dic`
assets with their individual license files. Do not replace those language
assets or remove their notices without auditing the upstream dictionary terms.

The printable Markdown renderer currently targets Markdown-It 14.3.0. All ten
bundled `@mdit` packages declare `markdown-it ^14.2.0`: the direct anchor,
footnote, KaTeX, mark, subscript, superscript, and task-list plugins, together
with the transitive helper, inline-rule, and TeX packages. Treat a Markdown-It
major upgrade as a coordinated renderer migration: first verify every peer
range, then update the separately vendored core runtime and run the complete
preview/export contract. A root `package.json` bump by itself does not replace
that runtime.

The interactive-table bundle is generated through
`scripts/vendor-codemirror-markdown-tables.mjs`. Its exact-match, in-memory
transform makes the third-party table decoration yield to Figaro's native fold
range, adds the direct approved **Delete table** control through the upstream
history action, and deliberately fails if a dependency update changes the
reviewed upstream shape. The vendored `codemirror-live-markdown` fenced-code provider
has the equivalent fold-aware rebuild. Preserve and reverify both integrations
when refreshing either dependency; the focused browser folding regression must
pass before accepting the generated bundle.

Some browser libraries, including Mermaid, are checked in separately from the
root npm dependency graph and may embed their own packages. After changing a
vendored bundle, run `tests/frontend/unit/vendoredBrowserSecurity.test.js` as
well as `npm audit`; the former inventories known embedded versions and proves
that vulnerable Mermaid YAML releases remain behind Figaro's pre-parse guard.

## Repository layout

```text
main.go, go.mod, wails.json  Thin executable/embed boundary and project configuration
internal/desktop/            Wails assembly, bound App capabilities, and adapter tests
internal/vault/              Root-scoped filesystem primitives
internal/links/              Pure Markdown link rewriting
internal/history/            Local Git history and auto-commit service
internal/recovery/           Pure recently-deleted registry rules
frontend/                    Webview, CodeMirror, themes, fonts, and assets
frontend/design-system/      Shared UI assets, approved registry, catalogue, and audit
tests/frontend/              Pure, use-case, adapter, and component tests
tests/e2e/                   Small Playwright browser-boundary suite
```

Go tests live alongside the package they exercise. Keep package-internal tests
there rather than exporting implementation details solely for a separate test
directory. Frontend and browser tests remain centralized because they exercise
the assembled webview rather than one JavaScript package in isolation.

## Code conventions

- Format Go with `gofmt`; run the JavaScript linter rather than hand-formatting
  vendored dependencies.
- Update `CHANGELOG.md` under `[Unreleased]` for every user-facing feature,
  behavior change, and bug fix; changelog work is part of feature completion.
- Audit every affected document in the same change. Keep user workflows in
  `README.md`, the detailed contract in `docs/PROMPT.md`, and update the
  architecture, testing, live-preview, PDF-styling, or contributor guides
  whenever their subject changes. Search for stale defaults, counts, names,
  commands, versions, and limitations before considering the work complete.
- Prefer root-scoped vault filesystem operations over absolute-path checks.
- Preserve unsaved editor content during asynchronous or filesystem-driven
  changes.
- Add a regression test for a bug fix, especially for file moves, sessions,
  rendering, or concurrency.
- Test each acceptance case at the lowest capable layer: pure logic first,
  use-case fakes for sequencing and failure, real adapters/components for their
  boundary, and a minimal browser scenario only for behavior lower layers
  cannot represent. Generic smoke coverage does not replace a named regression
  test, and end-to-end duplication does not replace focused lower-layer tests.
- Every CodeMirror extension, widget, keymap, or layout change must retain
  focused cursor-movement coverage (including feature keys), the block-widget
  geometry contract when applicable, and the native-webview checks in
  `docs/TESTING.md`.
- Eagerly load bundled feature code during startup. Do not hide dependency
  cycles or postpone feature initialization with interaction-triggered dynamic
  imports.
- Keep user-facing workflow changes in `README.md` and the detailed behavior
  contract in `docs/PROMPT.md` in the same change.

## Licensing contributions

Figaro is distributed under the [GNU General Public License version 3 or
later](LICENSE). By contributing material to this repository, you agree that
it may be distributed under those terms. Keep third-party notices and vendored
dependency licenses intact.
