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

The browser suite starts Figaro's static test server on port `34115` by
default. If another local application owns that port, choose an isolated port
for both Playwright and the server, for example:

```bash
FIGARO_PLAYWRIGHT_PORT=34116 npm run test:pdf
```

Use the explicit root-plus-`internal/...` package set rather than `go test
./...`: one frontend dependency contains an unrelated Go fixture under
`node_modules/`, which is not part of figaro's application test surface.

## What is covered

- Vault path safety, atomic file operations, local-link/unlinked-mention and
  Vault-health scanning, single-file-only Auto-Commit migration and isolation,
  history comparison/restoration, Draw.io file handling and export-recovery
  states, print stylesheet resolution, and printable-document preparation.
- Editor behavior, CodeMirror language modes, current-note heading-fragment
  completion, live Markdown preview, persistent Markdown diagnostics
  and their hover/F8 guidance, offline spellcheck language/frontmatter
  overrides, wrapped-list cursor/selection geometry,
  frontmatter, footnotes, diagrams, tabs, session
  persistence, Kanban presentation/loading states, file-tree actions, and
  stale-response guards.
- Browser rendering of cover pages, table of contents, Mermaid, Vega, and
  Vega-Lite in the PDF export pipeline.
- The native Figaro Dark and Light theme assets, including their warm reading
  surfaces, framed navigation, raised active tab, selected tree state, tactile
  Settings card, collar stitch, focus token, and text/link contrast.
- Browser workflows for contextual Relationships, keyboard-triggered mention
  linking, the themed Vault-health Settings entry and finding navigation, and
  the full-width, non-overlapping History source comparison before restoration,
  plus the nested Outline's visual hierarchy, active-section tracking,
  keyboard jump, and editor-focus handoff.
- The sandboxed PDF-preview bridge: user `html`/`body` styles apply inside the
  frame, external links cannot navigate it away, and fragment/footnote-return
  links remain in the rendered document. High-frequency scroll reports are
  coalesced before they can cause a matching burst of editor updates. The
  real-browser suite also verifies that printable Markdown preparation enters
  the module-worker path before the preview document is applied.
- Release metadata consistency across npm, Wails, the GPL license, changelog,
  documented tag command, and all three binary archive definitions.

The focused release checks are `tests/frontend/unit/releaseMetadata.test.js`
`, `tests/frontend/unit/dependencySecurity.test.js`, and
`tests/frontend/unit/releasePreparation.test.js`. They cover the
release-metadata generator's successful version/changelog cut, non-destructive
invalid-version rejection, and idempotent retry. The release shell test runs
the publishing and local-only paths against disposable Git repositories and a
local bare remote, proving that pending non-ignored files join the release
commit, each automatic version bump resolves from the latest tag, and an
interrupted release can resume its matching tag and push. They also prove an
empty `Unreleased` section leaves the worktree untouched and gives the user the
next steps instead of only reporting the failure. The dependency-security test
keeps the audited legacy ESLint dependency on its patched version without
overriding Jest's newer branch. The release script downloads
Playwright's pinned browser without using its `--with-deps` system-package
installer, so it never triggers a password prompt.
Update them whenever a release version, license, changelog convention,
packaged documentation file, tag workflow, Make target, or
release-preparation skill changes; they prevent a tag from publishing binaries
whose visible metadata disagrees with the source release.

The browser suite is intentionally not a substitute for the desktop webview:
when changing the PDF preview bridge, also run the packaged Linux build and
exercise it in Wails/WebKitGTK. The preview's origin/sandbox boundary is
documented in [`ARCHITECTURE.md`](../ARCHITECTURE.md).
Its unit coverage must also exercise a reader scroll that arrives while an
editor-to-preview update awaits its programmatic echo; the reader's newest
position must win rather than being delayed behind a parent-side timeout.

## Feature-specific regression contract

Tests ship with the behavior they protect. Every feature and bug fix must add
or update a focused test whose name describes that exact behavior; relying on
an unrelated smoke test or only running the existing suite is not enough.
Cover each boundary the feature crosses:

1. Go tests for filesystem, persistence, link rewriting, or Wails-facing
   results.
2. Frontend unit/integration tests for the user action, confirmation/cancel
   path, state changes, and backend arguments.
3. CodeMirror DOM and keyboard tests for editor extensions.
4. Printable-renderer and real-browser tests for Markdown that appears in PDF
   preview or export.

For a Markdown feature, use the same representative source in the editor,
printable HTML, preview frame, and browser PDF checks. Assert semantic DOM and
important layout—not merely that the source text occurs somewhere.

## Frameless window chrome regressions

Window-edge styling must remain a full, pointer-transparent outline: one pixel
on every side, the same radius as `#app`, and a slightly stronger top color.
Keep `tests/e2e/windowChrome.spec.js` focused on those computed properties so
the browser build and packaged webview do not drift back to separate border
implementations. After changing the outline, title bar, drag region, or window
controls, also exercise native edge resizing and maximize/restore in the
packaged application on each affected desktop platform.

## Sidebar navigation regressions

Calendar and Kanban are persistent destinations, not title-bar toggles.
Retain focused coverage that they remain in the footer below the file tree,
Settings remains beside the window controls, and the title-bar center remains
clear for native window dragging. Calendar must expand inside the left sidebar without closing or taking
ownership of History/Outline/Markdown Preview/PDF preview on the right. Collapsing must leave a 44px
tool rail, close any expanded Calendar content, and reopen both the normal
sidebar and Calendar when its rail icon is selected.

Kanban and Settings must open or switch to one de-duplicated workspace tab.
Clicking an inactive destination focuses its existing tab; clicking the
already active destination plays `figaro-panel-exit` before closing that tab
without affecting the other one. The transition must honor the shared
reduced-motion duration, remain safe under repeated close requests, and retain
any tab opened while the exit is running. Keep the state/action and animation-lifecycle
checks in `tests/frontend/unit/topBar.test.js` and real layout, visibility,
rail-width, tab-reuse, and active-tab toggle checks in
`tests/e2e/sidebarNavigation.spec.js`:

```bash
npm run test:unit -- --runTestsByPath tests/frontend/unit/topBar.test.js
npx playwright test tests/e2e/sidebarNavigation.spec.js
```

## Workspace overview regressions

The workspace overview is an un-tabbed empty state, not a synthetic
**Welcome** tab. Closing the final tab, deleting the final open file, and
clicking the Figaro name must leave the overview centered in the workspace
with an empty tab strip. Old sessions that contain the former `home` tab must
be repaired rather than restored. Keep the state/session checks in
`tests/frontend/unit/tabManager.test.js`, `tests/frontend/unit/session.test.js`,
and `app_test.go`, plus the real-browser close workflow in
`tests/e2e/workspaceOverview.spec.js`:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/session.test.js
npx playwright test tests/e2e/workspaceOverview.spec.js
go test . -run TestLoadSessionPrunesMissingTabsAndWorkspaceReferences
```

## PDF preview page-geometry regressions

The preview pane may grow, but its document body must remain centered and
capped to the printable `@page size`. Keep unit coverage for the A4 fallback,
named sizes, portrait/landscape orientation, explicit one- and two-length
sizes, stylesheet ordering, and the final geometry guard. The real-browser
test must use a pane wider than the paper and a conflicting `body` width rule,
then assert the physical CSS width and centered gutters. This belongs in:

```bash
npm run test:unit -- --runTestsByPath tests/frontend/unit/pdfPreview.test.js
npx playwright test tests/e2e/pdfPreviewFrame.spec.js
```

## Markdown preview and heading-link regressions

Markdown Preview is a normal themed rendering surface, not a print-preview
shortcut. Keep unit coverage for initial content, active/saved document refresh,
closing, and disabled raw HTML. The browser workflow must open it from a
Markdown context menu, assert its themed document geometry, and close it by
keyboard. Current-note heading completion must ignore frontmatter and fenced
examples, preserve duplicate anchor suffixes, and accept a keyboard selection
after typing `](#`.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/markdownPreview.test.js \
  tests/frontend/unit/linkCompletions.test.js
npx playwright test \
  tests/e2e/markdownPreview.spec.js \
  tests/e2e/headingLinkCompletions.spec.js
```

## Windows Spanish dead-key regressions

WebView2 can report Spanish tilde, diaeresis, acute, grave, and circumflex keys
without a usable browser composition event. Retain both the CodeMirror DOM/unit
and real-browser event regressions: a dead key must leave source unchanged,
then compose `ñ`, `ü`, `á`, `à`, and `â` with their matching letters, or emit
its spacing accent with Space. Backspace and Escape must cancel it without
deleting adjacent text, so the following `n` remains plain. Exercise the same
sequence manually in a packaged Windows/WebView2 build before release.

```bash
npm run test:unit -- --runTestsByPath tests/frontend/unit/editor.test.js
npx playwright test tests/e2e/windowsAltGr.spec.js
```

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

Interactive Markdown tables add a stricter cursor matrix. Test Arrow keys
within and across cells, Tab and Shift+Tab between cells, Enter down a column,
and Arrow Up/Down from source lines immediately above and below the table.
Confirm that leaving the first/last cell returns to the adjacent document line
without skipping, and verify mouse placement plus drag selection at every
table edge. With Vim enabled, also test Normal and Insert mode in a cell and
the transition back to root-editor movement. Keep the focused automated checks in
`tests/frontend/unit/markdownTables.test.js` and
`tests/e2e/markdownTables.spec.js`.

Table creation and conversion share that contract. Retain focused coverage
that `|` on an otherwise empty line offers the supported sizes and accepts the
choice, selection conversion previews delimiter/header changes and cancels
without editing, and one confirmation produces one undoable transaction.
Keyboard paste and the editor's existing Paste menu must convert clear
spreadsheet HTML, TSV, pipe-delimited text, and unambiguous CSV while ordinary
text passes through unchanged. Existing GFM must retain its separator and
alignment while gaining safe block boundaries so adjacent prose cannot become
a table row. Keep pure parsing and clipboard coverage in
`tests/frontend/unit/markdownTableConversion.test.js` and the real completion,
paste, context-menu, cursor, mouse, preview, and PDF workflow in
`tests/e2e/markdownTables.spec.js`.

## Clipboard image paste regressions

Clipboard image paste crosses binary persistence, the native Wails binding, an
asynchronous CodeMirror transaction, the existing image widget, preview, and
PDF export. Retain focused coverage for the exact generated Markdown and
bytes, note-relative placement, sequential collision names, invalid/oversized
refusal without a document edit, and plain-text paste fallthrough. The browser
test must dispatch a real `ClipboardEvent` through CodeMirror, load the saved
relative image, verify the cursor remains on adjacent source lines, and render
the same image through PDF preview and a generated PDF.

Run the focused contract with:

```bash
go test . -run 'TestSaveClipboardImage'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/clipboardImage.test.js \
  tests/frontend/unit/editor.test.js \
  tests/frontend/unit/imageSystem.test.js
npx playwright test tests/e2e/clipboardImagePaste.spec.js
```

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

Directory drag/drop merges are separately non-destructive. An existing
same-named destination directory must produce a merge warning; cancellation
must write nothing. Confirmation recursively merges folders, retains existing
files, gives colliding moved/imported entries parenthesized names such as
`report (copy).md` and `report (copy 2).md`, and keeps open tabs plus backlinks
on the resulting paths. Retain Go coverage for internal and native-drop merges
and frontend coverage for both confirmation flows.

## External Markdown launch regressions

Native file-association launches are an explicit boundary: retain Go coverage that startup accepts only existing `.md` arguments, the opaque launch ID reads and saves exactly its original file, and unknown IDs are refused. Frontend coverage must assert external tabs use the external save binding, do not Auto-Commit or persist in the vault session, and that cancelling import performs no copy while a backend collision result opens the returned non-overwriting destination. Buffer drops must prevent CodeMirror's uncontrolled path insertion, ask once for an entire native drop batch, insert the selected path at the drop position, and call the recursive collision-safe import once for a dropped directory. A successful dropped-file import must open that imported file in a new active tab, while a dropped directory keeps the current buffer active. The Wails callback must register without the CSS-drop-target filter so it reaches CodeMirror on Linux/WebKit. Exercise a packaged Windows/WebView2 build manually by opening an associated `.md` file, saving it, declining import, then repeating the save and importing into a vault that already contains the same filename; also drag a standalone note and a folder into an editor buffer, choose path insertion once, then import once and verify the folder hierarchy.

Run the focused contract with:

```bash
go test . -run 'Test(LaunchExternalFile|MarkdownLaunchPaths)'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/externalFiles.test.js \
  tests/frontend/unit/externalDrop.test.js \
  tests/frontend/unit/importedExternalTabs.test.js \
  tests/frontend/unit/tabManager.test.js
```

## Vim command regressions

Vim commands are exercised through the real vendored CodeMirror Vim adapter,
not by calling their implementation helpers directly. `:w`, `:q`, `:wq`, and
`:x` must be available immediately after Vim activates; `:wq` and `:x` must
keep the tab open until the exact current buffer has saved successfully, while
`/`, `n`, and `N` must open the query prompt and navigate forward and backward
between matches. The preference contract also covers startup application,
Workspace-overview-first delayed editor creation, live Settings changes, failed-save
rollback, reopened Settings, and backend persistence across fresh application
instances. Changes to editor keymaps, save queuing, tab closing, Settings, or
the Vim dependency must retain this coverage.

The focused browser contract also checks the 4 px Insert caret plus the
optional **Move by visual rows** mapping: `j`, `k`, and Up/Down move one wrapped
display row in Vim Normal mode, including inside a long wrapped Markdown-link
destination, while operator-pending source-line motions such
as `dj` stay unchanged. Markdown diagnostics must retain Arrow Up/Down, mouse
placement, drag selection, themed hover guidance, F8 navigation, and their
enabled-by-default Settings toggle. Wrapped Markdown bullet and ordered-list
items must keep continuation rows under their item bodies and retain Arrow
Up/Down plus mouse drag-selection behavior.

Offline spellcheck must retain the same editor movement and selection contract:
its US-English global default, themed keyboard-operable language combobox,
Spanish frontmatter override, per-note `false` opt-out, themed dotted marker,
and local-only dictionary assets are covered by unit and browser regressions.
Correctly spelled hyphenated compounds must remain unmarked, while a
misspelled component must retain its diagnostic.
Right-clicking an underlined prose word must offer only active-dictionary,
high-confidence prose suggestions, let keyboard activation replace only that
word as an undoable edit, suppress ambiguous short typos instead of surfacing
obscure entries, and never offer replacements in masked Markdown regions.

Draw.io's hosted-editor message protocol must cover a successful editable-SVG
export plus both interrupted paths: an explicit export error and no export
response within 30 seconds must hide the hosted spinner, report a retryable
failure, leave the file untouched, and accept another Save request.
The host-owned opening overlay must stay visible until the editor's `load`
message, use Figaro theme tokens rather than a white browser buffer, remain
non-focusable, and pass the current dark appearance only to the hosted editing
UI. Its export message must explicitly retain the light SVG theme. The focused
browser regression aborts the cross-origin iframe after mounting so this
otherwise-blank state is observable without relying on network timing.
`tests/e2e/drawio.spec.js` additionally opens the real diagrams.net iframe in
Chromium, waits for the opening overlay to dismiss, and invokes its own Save
command. It is an external-network
integration test: it skips with an explicit reason when `embed.diagrams.net`
cannot be reached, and it complements rather than replaces the native
WebKitGTK manual smoke check. When diagnosing a native failure, opt into the
metadata-only trace with `window.__figaroDrawioDebug = true` in the WebKit
inspector before saving; it must never log diagram XML or SVG contents.

Run the focused contract with:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/vimCommands.test.js \
  tests/frontend/unit/vimSettings.test.js \
  tests/frontend/unit/vimVisual.test.js \
  tests/frontend/unit/editorSettings.test.js \
  tests/frontend/unit/markdownLint.test.js \
  tests/frontend/unit/spellcheck.test.js \
  tests/frontend/unit/drawioEditor.test.js \
  tests/frontend/unit/drawio.test.js
go test . -run 'Test(Vim|MarkdownLint|Spellcheck)'
npx playwright test tests/e2e/vimVisualRows.spec.js tests/e2e/markdownTables.spec.js tests/e2e/markdownLint.spec.js tests/e2e/markdownListIndent.spec.js tests/e2e/spellcheck.spec.js tests/e2e/drawioLoading.spec.js tests/e2e/drawio.spec.js
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
