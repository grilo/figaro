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
# Install dependencies and generate the ignored browser modules first.
npm ci
npm run vendor

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
  links remain in the rendered document.

The browser suite is intentionally not a substitute for the desktop webview:
when changing the PDF preview bridge, also run the packaged Linux build and
exercise it in Wails/WebKitGTK. The preview's origin/sandbox boundary is
documented in [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Generating browser assets

Generated browser dependencies are ignored under `frontend/vendored/`; the
desktop build embeds the regenerated files and never fetches packages at
runtime. Run this from the repository root after `npm ci`:

```bash
npm run vendor
```

Run the full frontend and browser suites after regeneration. Do not commit the
generated output.
