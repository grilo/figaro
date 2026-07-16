# Testing figaro

## Layout

```
*.go / *_test.go
    Wails-facing backend facade and integration tests.

internal/
├── history/          Git history service and its tests
├── links/            Pure Markdown link rewriting and its tests
└── vault/            Root-scoped filesystem primitives and their tests

tests/
├── frontend/
│   ├── unit/       Jest unit and UI-integration tests
│   ├── race/       Tests for stale-response and ordering regressions
│   └── support/    Shared Jest environment and mocks
└── e2e/            Playwright browser tests
```

Go tests intentionally remain next to the Go source. That is the standard Go
layout and lets package-level tests exercise unexported filesystem and history
helpers without exposing implementation details merely for testing.

## Commands

```bash
# Prepare dependencies and generate ignored browser modules first.
make bootstrap

# Application packages: Wails facade, internal modules, and dev commands
go vet . ./internal/... ./cmd/...
go test . ./internal/... ./cmd/...
go test -race . ./internal/... ./cmd/...

# Frontend unit and integration tests
npm run lint
npm run test:unit

# Browser-level printable-document and isolated-preview tests
npx playwright install chromium # first run only
npm run test:pdf
```

Use the explicit root-plus-`internal/...` package set rather than `go test
./...`: one frontend dependency contains an unrelated Go fixture under
`node_modules/`, which is not part of figaro's application test surface.

## What is covered

- Vault path safety, atomic file operations, history, Draw.io file handling,
  print stylesheet resolution, and printable-document preparation.
- Editor behavior, CodeMirror language modes, frontmatter, footnotes,
  diagrams, tabs, session persistence, file-tree actions, and stale-response
  guards.
- Browser rendering of cover pages, table of contents, Mermaid, Vega, and
  Vega-Lite in the PDF export pipeline.
- The sandboxed PDF-preview bridge: user `html`/`body` styles apply inside the
  frame, external links cannot navigate it away, and fragment/footnote-return
  links remain in the rendered document. High-frequency scroll reports are
  coalesced before they can cause a matching burst of editor updates.

The browser suite is intentionally not a substitute for the desktop webview:
when changing the PDF preview bridge, also run the packaged Linux build and
exercise it in Wails/WebKitGTK. The preview's origin/sandbox boundary is
documented in [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Block widget and cursor regressions

CodeMirror block widgets have a strict measured-height contract documented in
[`LIVEPREVIEW.md`](LIVEPREVIEW.md#4-block-widget-geometry-contract). Any new
`block: true` decoration, widget DOM change, or widget spacing change must:

1. Use the shared block-widget wrapper or marker from
   `frontend/js/blockWidget.js`.
2. Keep vertical margins off the measured widget root and visual surface. Put
   intentional surrounding space in measured wrapper padding.
3. Add the widget root and surface to
   `tests/frontend/unit/blockWidgetLayout.test.js`.
4. Run the contract, cursor fallback, full frontend, and browser checks:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/blockWidgetLayout.test.js \
  tests/frontend/unit/editor.test.js
npm run lint
npm run test:unit
npm run test:pdf
```

Because jsdom has no real layout and Chromium may tolerate geometry that fails
in a desktop webview, automated browser success is not sufficient for a block
layout change. Run the packaged application on every affected desktop engine:

- Linux: WebKitGTK.
- Windows: WebView2.
- macOS: WKWebView when the change is intended for macOS distribution.

Use the Welcome note as the minimum native regression: put the cursor on line
36, `### Text formatting`; Arrow Up must move to line 35, and Arrow Down must
return to line 36. Also navigate across each newly added widget from above and
below, and verify mouse placement and drag selection around it.

## File-tree copy regressions

Internal file-tree copy/paste is non-destructive: collisions must allocate
`copy` / `copy 2` sibling names, dirty source tabs must save before the backend
reads them, copied Markdown links must preserve their resolved vault targets,
and folder copies must never target the source folder or any descendant.
Changes to tree actions, tab persistence, link rewriting, vault copy helpers,
path validation, or duplicate naming must retain Go coverage for the filesystem
and link results plus frontend coverage for commands and refusal dialogs.

Run the focused contract before the full suites:

```bash
go test . -run 'TestCopyPath'
go test ./internal/links -run 'Copy'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/fileTree.test.js \
  tests/frontend/unit/dialogs.test.js \
  tests/frontend/unit/tabManager.test.js
```

## Vim command regressions

Vim commands are exercised through the real vendored CodeMirror Vim adapter,
not by calling their implementation helpers directly. `:wq` and `:x` must
keep the tab open until the exact current buffer has saved successfully, while
`/`, `n`, and `N` must open the query prompt and navigate forward and backward
between matches. The preference contract also covers startup application,
Home-first delayed editor creation, live Settings changes, failed-save
rollback, reopened Settings, and backend persistence across fresh application
instances. Changes to editor keymaps, save queuing, tab closing, Settings, or
the Vim dependency must retain this coverage.

Run the focused contract with:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/vimCommands.test.js \
  tests/frontend/unit/vimSettings.test.js \
  tests/frontend/unit/vimVisual.test.js
go test . -run 'TestVim'
```

## Generating browser assets

Generated browser dependencies are ignored under `frontend/vendored/`; the
desktop build embeds the regenerated files and never fetches packages at
runtime. `make bootstrap` performs this automatically. To force just a
browser-asset refresh, run this from the repository root:

```bash
make vendor
```

Run the full frontend and browser suites after regeneration. Do not commit the
generated output.
