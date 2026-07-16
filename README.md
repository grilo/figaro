<p align="center">
  <img src="figaro.appicon.png" width="112" alt="figaro logo">
</p>

<h1 align="center">figaro</h1>

<p align="center">
  A local-first Markdown workspace for notes, tasks, diagrams, and beautiful printable documents.
</p>

<p align="center">
  Your knowledge stays in ordinary files, in a folder you control. No account, cloud service, or proprietary database required.
</p>

> **Figaro** is a desktop personal knowledge manager designed to make a plain-folder vault feel focused, capable, and pleasant to use.

## Why figaro?

figaro combines the durability of plain Markdown with a desktop workspace that helps you write, navigate, plan, and publish without putting your notes behind a service.

- **Own your data.** Notes, images, source files, editable diagrams, settings, and history live in your local vault.
- **Write without leaving the flow.** Markdown is rendered live, while the active line remains ordinary source text for precise editing.
- **Turn notes into action.** Hashtags become a drag-and-drop Kanban board; date links feed a calendar; links produce backlinks.
- **Ship polished documents.** Frontmatter can add a cover page, table of contents, and a note-specific print stylesheet before an interactive PDF export that preserves links and references.

## Highlights

| Write | Organize | Visualize and share |
| --- | --- | --- |
| Live Markdown preview with tables, task lists, callouts, footnotes, math, images, and internal links | Vault file tree, tabs, global search, backlinks, date-aware calendar, and persistent sessions | Mermaid, Vega, Vega-Lite, editable Draw.io SVGs, and interactive PDF export |
| CodeMirror-powered editing for Markdown and supported source files such as CSS, JavaScript, JSON, Go, Python, Rust, SQL, YAML, and more | Hashtag-driven Kanban with custom columns, drag-and-drop task moves, and optional local Git auto-commit history | Cover pages, depth-limited tables of contents, and vault-local print stylesheets |
| Optional Vim mode, language-aware syntax highlighting, folding, completion, and theme-aware indent guides | Drag-reorderable and pinnable tabs, recent notes, and a Welcome workspace when no editor tab remains | Seventeen built-in themes, including Figaro Light and Figaro Dark, plus separate prose/code font pickers, font size and reading-width controls |

## A workspace built around plain files

Every vault is an ordinary directory. Markdown remains Markdown, images remain image files, code remains code, and Draw.io diagrams are saved as editable `.drawio.svg` files. figaro stores vault-specific settings and workspace state in `.config/` inside the vault, rather than converting your notes into a database. Display-dependent window state is kept separately in the operating system's per-user local application-data directory, so syncing or moving a vault cannot carry one computer's window geometry to another.

The file tree supports internal Copy/Paste for files and complete folders through its context menu or Ctrl/Cmd+C and Ctrl/Cmd+V while the tree is focused. Paste saves dirty source tabs first, and repeated or same-folder pastes never overwrite content: Figaro creates `Folder copy`, `Folder copy 2`, or `note copy.md`. Links inside copied Markdown are adjusted so internal links follow copied counterparts and links leaving the copied tree still reach their original vault targets; incoming links elsewhere continue to point at the source. A folder cannot be pasted into itself or one of its descendants, and the refusal dialog directs you to select its parent for a sibling copy.

The default vault is `./vault`. Point figaro at another location with the `VAULT_PATH` environment variable:

~~~bash
VAULT_PATH="$HOME/Documents/notes" make dev
~~~

On first launch, an empty vault receives a welcome note with examples and a short getting-started guide.

### Desktop window state

figaro remembers the window's last normal width and height and whether it was maximized. It deliberately does not remember screen coordinates: every launch is centered by the native Wails window backend, avoiding an unreachable frameless window after a monitor is disconnected or its layout changes. Minimized, fullscreen, and incomplete transition states are never restored; closing while minimized retains the last meaningful normal or maximized state.

The default normal size is `1280 × 800`, and restored dimensions are clamped to the application's `800 × 500` minimum. A missing, malformed, unsupported, zero/negative, or implausibly large state record falls back to the safe default. Window state is stored outside the vault at:

- Linux: `$XDG_CONFIG_HOME/figaro/window-state.json`, or `$HOME/.config/figaro/window-state.json` when `XDG_CONFIG_HOME` is unset.
- macOS: `$HOME/Library/Application Support/figaro/window-state.json`.
- Windows: `%LocalAppData%\figaro\window-state.json`.

If the platform cannot provide or write its local application-data directory, figaro remains usable with the safe defaults but cannot persist the changes for the next launch.

### Search, planning, and history

The sidebar search finds both note names and Markdown body text. It supports title-only, recent-notes, and case-sensitive filters, plus keyboard navigation. Use Ctrl/Cmd+F for fast in-document find, including case-sensitive, whole-word, and regular-expression matching. The Calendar highlights daily notes named `YYYY-MM-DD.md` and notes that link to them; date links open a workspace results tab. The Home tab keeps the last eight opened notes and up to six unfinished Kanban cards close at hand.

Saving and versioning are intentionally separate. **Auto-Save** writes the active dirty file on the interval you choose, while **Auto-Commit** is an optional, off-by-default local Git scheduler. This keeps normal file saving fast and predictable while letting you opt into version history.

## Markdown, diagrams, and PDFs

### Markdown and code

figaro has a source-first live preview: move onto a line to edit its Markdown exactly as written; move away to read the rendered result. It supports headings, emphasis, strikethrough, highlights, task checkboxes, links, callouts, tables, images, KaTeX math, footnotes, blockquotes, and fenced code blocks.

Files recognised by CodeMirror's language registry open in the same editor as proper code files, with syntax highlighting, folding, completions, Vim support, and indentation guides. Unsupported or binary files stay safely non-editable in the file tree.

### Diagrams

Use fenced blocks for live Mermaid, Vega, and Vega-Lite output:

~~~~markdown
~~~mermaid
flowchart TD
  Idea --> Draft --> Publish
~~~

~~~vega-lite
{
  "data": { "values": [{ "month": "Jul", "notes": 12 }] },
  "mark": "bar",
  "encoding": {
    "x": { "field": "month", "type": "nominal" },
    "y": { "field": "notes", "type": "quantitative" }
  }
}
~~~
~~~~

Create a Draw.io diagram from the File Tree context menu. figaro opens diagrams.net for editing and saves a self-contained `.drawio.svg` file. Once saved, that SVG continues to render normally in notes even when you are offline; only opening the Draw.io editor needs a connection to diagrams.net.

### Properties and interactive PDF export

Leading YAML frontmatter is presented as a compact Properties card. It can control document metadata and the printable layout without changing your Markdown body:

~~~yaml
---
title: "Quarterly review"
subtitle: "What changed and what comes next"
author: "Ada Lovelace"
date: 2026-07-12
cover-page: true
toc-depth: 2
# Optional: choose Create starter in PDF layout first.
print-stylesheet: "pdf.css"
---
~~~

- `cover-page: true` creates one title page.
- `toc-depth` accepts `0` through `6`; `0` disables the table of contents.
- `print-stylesheet` selects a vault-local CSS file relative to the note and takes precedence over a sibling `_print.css`.
- Footnotes such as `[^source]` print as numbered links to a final Footnotes section, with links back to each reference.
- Mermaid, Vega, and Vega-Lite blocks are rendered to inline SVG for the printed document.

PDF exports use a polished built-in style by default. To customize one, choose **Create starter** in the Properties panel's **PDF layout** section. Figaro proposes a note-local `pdf.css`, copies its comprehensive editable example only after you confirm, selects it for the note, and opens it. It never creates stylesheets during startup or export, and it never overwrites an existing CSS file. See [PDF styling](docs/PDF_STYLING.md) for the stable selectors, page-layout guidance, and the distinction between document headings and unsupported repeated page headers/footers.

Choose **Preview PDF** from a Markdown file's context menu, editor context menu, or the Properties panel. Figaro opens a live, isolated preview in the right pane and refreshes it shortly after Markdown or the selected CSS stylesheet changes. Choose **Generate PDF** in that pane when the result is ready. figaro then looks for an installed Chrome/Chromium-family browser, including Ungoogled Chromium and its Flatpak launcher, then Edge; on macOS it can use the system Safari/WebKit engine. It writes `<note>.pdf` beside the Markdown file (safely replacing the previous export) and opens it with your default viewer. The export deliberately aborts if no viable browser engine is found rather than creating a PDF with dead links, TOC entries, or footnote references.

An export of the active dirty note uses the current editor content without forcing a save first. A `print-stylesheet` must be a vault-local relative CSS path; it overrides a sibling `_print.css` for that note. Leave it blank or omit it to retain the built-in style.

## Getting started

### Prerequisites

- Go 1.25 or newer
- Node.js 20 or newer for JavaScript tooling and tests
- Wails v2 CLI
- The platform dependencies required by Wails. On Linux, Figaro uses GTK3 with WebKitGTK 4.1 when available (WebKitGTK 4.0 is also supported).
- A locally installed Chrome, Chromium (including Ungoogled Chromium and Flatpak installs), Brave, or Edge browser for interactive PDF export. macOS can fall back to its built-in Safari/WebKit engine.
- ImageMagick 7 for the generated application icons; `make dev` and package builds create them automatically when absent.

Install the Wails CLI version that matches this project's Go dependency:

~~~bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
~~~

On Linux, run `make doctor` before your first build. It checks the actual
`pkg-config` libraries and prints a package-manager-specific command if
anything is missing. For example, Fedora needs
`gcc pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel ImageMagick`; current
Debian/Ubuntu uses `build-essential pkg-config libgtk-3-dev
libwebkit2gtk-4.1-dev imagemagick` (or `libwebkit2gtk-4.0-dev` on older
releases).

### Run in development

~~~bash
git clone https://github.com/grilo/figaro.git
cd figaro

make bootstrap
make dev
~~~

For browser DevTools alongside the Wails app:

~~~bash
./scripts/debug.sh
~~~

The development file server is then available at `http://localhost:34115`.
The script also enables the loopback-only WebKit inspector for that development
session. Normal launches leave it disabled; to opt in manually, run
`FIGARO_WEBKIT_INSPECTOR=1 make dev`.

### Build a desktop binary

~~~bash
make linux
make windows
make darwin
make icons          # regenerate all icon variants from figaro.appicon.png
~~~

The Makefile prepares a clean checkout itself: it downloads Go modules, runs
`npm ci` when the locked frontend dependencies are absent or changed, and
regenerates vendored browser assets when their inputs or outputs require it.
It also generates missing icon variants and prints actionable native-package
hints through `make doctor`. It automatically selects Wails' WebKitGTK 4.1
support on distributions such as current Fedora; WebKitGTK 4.0 is also
supported. The current Windows target uses Wails' pure-Go WebView2 path, so it
cross-builds from Linux without MinGW-w64. Wails v2 builds Linux only on Linux
and macOS only on macOS; `make all` selects the targets supported by the
current host. `./scripts/build-fedora.sh` is a convenience wrapper around
`make linux`.

For contributor setup, verification commands, and the platform build notes in one place, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Test the project

The test suite covers the Go vault backend, CodeMirror behaviour, tab/session state, diagram rendering, and the printable-document pipeline.

~~~bash
# Prepare ignored browser assets before testing a fresh checkout.
make bootstrap

# Go backend
go vet . ./internal/... ./cmd/...
go test . ./internal/... ./cmd/...
go test -race . ./internal/... ./cmd/...

# JavaScript unit and integration tests
npm run lint
npm run test:unit

# Real-browser PDF/diagram integration test
npx playwright install chromium    # first time only
npm run test:pdf
~~~

The PDF tests verify the full application-controlled contract: frontmatter, cover/TOC structure, CSS selection, inline Mermaid/Vega SVG, browser-discovery order, and actual PDF link/destination annotations.

## Architecture

`figaro` is deliberately small and direct:

- **Go + Wails v2** provides the desktop shell, vault-safe filesystem operations, optional local Git auto-commit history, settings, and browser-backed interactive PDF export. Reusable backend modules live under `internal/`; the Wails bootstrap remains at the repository root by convention.
- **Vanilla JavaScript + CodeMirror 6** provides the editor, live Markdown experience, workspace UI, and on-demand language support.
- **Browser dependencies** keep the editor, Markdown renderer, KaTeX, Mermaid, Vega, Vega-Lite, Vim mode, and language grammars available without a runtime package install. The Makefile recreates generated modules before desktop builds (or on demand with `make vendor`); KaTeX ships only its production JavaScript, CSS, and font assets. Python and Rust grammar support does not add a Python or Rust runtime to Figaro.
- **The vault** is the source of truth. Configuration lives under `.config/`; content remains portable files.

For the complete behaviour contract and implementation notes, see [the product specification](docs/PROMPT.md). Non-obvious implementation decisions are collected in [the architecture notes](ARCHITECTURE.md), and the test layout and commands are documented in [the testing guide](docs/TESTING.md).

## Repository layout

```
cmd/devserver/       Small static server used by browser-level tests and debugging
docs/                Product notes and contributor-facing testing guidance
internal/vault/      Root-scoped vault filesystem primitives
internal/links/      Pure Markdown link rewriting used by file moves
internal/history/    Local Git history and auto-commit service
frontend/            Wails webview, CodeMirror modules, themes, fonts, and vendored assets
scripts/             Optional build, debug, and vendor-maintenance helpers
assets/branding/     Generated square icon master used by application packages
tests/frontend/      Jest unit, UI-integration, and stale-response tests
tests/e2e/           Playwright browser tests
main.go              Wails entry point and embedded frontend assets
*.go / *_test.go     Wails-facing backend facade and co-located integration tests
```

Local vault data, generated binaries, test reports, and machine-specific helper
scripts are ignored for new work. Keep personal notes and build outputs outside
commits when contributing.

## Current limitations

- figaro is a desktop, single-vault application; it does not provide cloud sync, encryption, mobile clients, or a plugin system yet.
- The Draw.io editor is intentionally lightweight and uses the hosted diagrams.net editor. Saved SVG output remains local and offline-readable.
- PDF output uses a browser already installed on the machine. If none can be found, figaro explains how to install Chrome or Chromium instead of generating a degraded PDF.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, supported build targets, verification commands, and repository conventions.

## License

No license file has been selected for this repository yet. Choose and add one before redistributing figaro.
