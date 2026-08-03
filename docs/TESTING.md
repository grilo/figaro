# Testing figaro

## Strategy: prove behavior at the lowest capable layer

Figaro uses a test pyramid that keeps most coverage fast, deterministic, and
close to the behavior it protects. End-to-end tests are a deliberately small
boundary suite, not the default test type.

1. **Pure logic tests** receive plain values and assert plain results. They
   cover validation, normalization, parsing, collision and mutation planning,
   state reducers, ranking, and transformations without mocks, files, DOM,
   CodeMirror, timers, or Wails.
2. **Application use-case tests** inject small fakes for I/O ports. They cover
   sequencing, stale-request cancellation, conflict choices, rollback,
   notification decisions, and failure handling without starting the real
   external system.
3. **Adapter and component tests** exercise one concrete boundary: root-scoped
   filesystem operations in a temporary directory, settings/session JSON,
   Git, Wails response translation, jsdom views, or a real CodeMirror instance.
   These prove that an adapter honors the contract expected by its use case.
4. **End-to-end and real-browser tests** are reserved for behavior that the
   lower layers cannot represent: computed layout and cursor geometry, browser
   focus or selection handoff, actual clipboard/composition events, sandboxed
   and cross-origin frames, browser print output, and a small number of
   assembled startup/workflow contracts.
5. **Packaged native checks** cover the final WebKitGTK, WebView2, or WKWebView
   boundary when Chromium cannot establish native cursor, window, drag/drop, or
   composition behavior.

For every feature or bug fix, list the acceptance cases first, then assign each
case to the lowest layer that can prove it. Test success, cancellation/error,
and non-destructive collision behavior where applicable, but do not repeat all
three through every layer. A browser test that only verifies a backend argument,
pure transformation, state transition, or error branch is at the wrong layer.

### End-to-end budget

Before adding or expanding a Playwright scenario, record in the test name or
nearby comment the browser-only property it protects. Prefer extending an
existing focused boundary spec over creating a new workflow. Use one
representative input in the browser, while exhaustive inputs and failure cases
stay in pure, use-case, or adapter tests. Do not add an end-to-end test merely
because a feature has visible UI.

The focused browser contracts documented below are retained because they
exercise real geometry, browser events, frames, or print behavior. They are
exceptions to the default, not a template requiring a new Playwright file for
every feature.

Existing Playwright assertions that only prove a pure rule, backend argument,
state transition, or failure matrix are migration debt. When a related area is
refactored, first move that coverage to the appropriate pure, use-case,
adapter, or component test, then remove the redundant browser branches.
Preserve coverage during the move, but do not preserve end-to-end duplication
solely because it already exists.

### Logic/I/O boundary contract

Tests should reflect the application dependency direction described in
[`ARCHITECTURE.md`](../ARCHITECTURE.md#dependency-direction-and-io-boundaries):

- Pure frontend modules do not import `backend.js` and do not access
  `window`, `document`, CodeMirror views, or timers.
- Pure Go packages do not open files, start processes, invoke Wails, or call
  Git. Interfaces for effects are declared beside the consuming use case.
- Use-case tests use purpose-built fakes rather than mocking an entire
  application module or native API.
- Adapter tests use the real boundary whenever feasible. In particular,
  vault security, atomicity, permissions, and rollback require a temporary
  `os.Root`; an in-memory filesystem is insufficient.
- A thin integration test confirms each use case is wired to its production
  adapter. Full end-to-end duplication is unnecessary.

For future features, define the seam while defining the acceptance cases:
deterministic outcomes belong in pure tests, effect sequencing belongs in
use-case tests with narrow fakes, and the external mechanism belongs in a
focused adapter contract. If a code path is a genuine pass-through with no
decision or sequencing, test the adapter contract directly rather than
inventing a fake abstraction solely for test structure.

Architecture guardrails should reject imports that point from the pure core
back to adapters or composition roots. Add a guard when introducing the first
module in a new layer rather than relying on naming conventions alone.

### Eager-startup contract

Feature code is loaded during startup, never on first interaction. Tests for a
new module or parser should establish that it is registered by
`window._appReady` and that the first command does not invoke dynamic
`import()`, fetch a local module, or perform feature-code initialization.
Demand-driven operations such as scanning Vault health, opening a hosted
Draw.io document, or generating a PDF still begin only after the user requests
the work; their bundled application code and local dependencies are already
ready.

Eager loading moves latency to a deliberate boundary; it does not make startup
performance irrelevant. Keep parsing, indexing, and other CPU-heavy algorithms
under focused benchmarks where they are performance-sensitive. Measure the
assembled startup path as one representative readiness contract, and verify
that ordinary post-ready interactions make no local module requests or
first-use initialization. Do not create a separate end-to-end performance
scenario for every feature.

## Layout

```
main.go / main_test.go
    Thin executable/embed boundary and its packaged-input contract.

internal/
├── appinfo/          Pure packaged application-metadata parsing
├── desktop/          Wails composition, bound App capabilities, adapter tests
├── history/          Git history service and its tests
├── links/            Pure Markdown link rewriting and its tests
├── mutations/        Pure move/copy/merge and collision plans
├── notes/            Note-save use case and repository contract
├── settings/         Pure settings defaults and migrations
└── vault/            Root-scoped filesystem primitives and their tests

tests/
├── frontend/
│   ├── unit/       Pure, use-case, adapter, and focused component tests
│   ├── race/       Tests for stale-response and ordering regressions
│   └── support/    Shared Jest environment and mocks
└── e2e/            Small Playwright browser-boundary suite

frontend/js/
├── core/           Pure models, transforms, and layout rules
├── usecases/       Effect sequencing through injected ports
├── adapters/       Browser/native effect implementations
├── controllers/    State and use-case wiring
└── views/          DOM-only rendering

frontend/design-system/
├── approved-components.json  Explicitly approved family/primitive registry
├── style-manifest.json       Canonical eager stylesheet order
├── theme-contract.json       Required, semantic, and surface token allowlist
├── tokens.css                Semantic defaults and shared dimensions
├── primitives.css            Canonical production component presentation
├── theme-surfaces.css        Stable selectors consuming art-direction tokens
├── themeCatalogModel.js      Pure manifest, path, and search rules
├── catalog.js                Fetch and DOM effects
├── catalogEntry.js           Canonical-manifest composition root
├── catalog.bundle.js         Generated classic script for direct-file use
└── index.html                Production-class component specimens
```

Go tests intentionally remain next to the Go source. That is the standard Go
layout and lets package-level tests exercise unexported desktop, filesystem,
and history helpers without exposing implementation details merely for
testing. Repository-wide source-layout and release/handoff contracts live in
the test-only `internal/repositorycheck` package so the executable root stays
small.

## Commands

The JavaScript toolchain requires Node.js 20.19+ on the 20.x line, 22.13+ on
the 22.x line, or Node.js 24+. `make bootstrap` checks this exact supported
range before installing dependencies.

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

# Browser-only geometry, event, frame, and printable-document boundaries
npx playwright install chromium # first run only
npm run test:pdf
```

The browser suite starts Figaro's static test server on port `34115` by
default. If another local application owns that port, choose an isolated port
for both Playwright and the server, for example:

```bash
FIGARO_PLAYWRIGHT_PORT=34116 npm run test:pdf
```

`cmd/devserver` sends `Cache-Control: no-store`; its focused Go test protects
that contract so catalogue and browser checks cannot silently reuse stale
assets after a source edit.

Browser tests that configure preference-backed editor behavior must wait for
`window._appReady === true` before changing that behavior. Otherwise the normal
startup preference load can overwrite the test's setting partway through a
slower CI run.

### Design-system catalogue

`tests/frontend/unit/designSystemCatalog.test.js` owns the exhaustive catalogue
contract: indexed group membership, adoption of the nine approved families
in catalogue and production markup, exact agreement between
`approved-components.json` and the selectors implemented by
`primitives.css`, exact eager style order in the app, catalogue, compatibility
aggregate, and `style-manifest.json`, removal of superseded picker, stepper,
and action rule blocks, preservation of distinct cards and toggles, and the
explicit approval policy in `AGENTS.md`. The same test validates every theme
against `theme-contract.json`: each theme supplies every required token,
declares only allowed tokens, and contains exactly one selector-free `:root`
rule. It also owns validation of all manifest records and backing CSS files,
unsafe/duplicate record rejection, multi-word filtering, DOM index
construction, stylesheet-link selection, direct-file-relative asset
resolution, and synchronization of the checked-in classic bundle with its
module sources. These rules do not need a browser matrix. Feature component
tests continue to own controller behavior; for example, the frontmatter test
proves that embedded-editor menus expose the shared open state while retaining
their own selection policy.

`tests/e2e/designSystemCatalog.spec.js` is the single representative browser
boundary. It proves that the real manifest populates the selector, a light
theme stylesheet changes computed token values, filtering updates visible
geometry, and intrinsic control icons retain their production dimensions and
paint contract. The same representative scenario opens the shared select-only
combobox and compares its popup surface, text, and border with the active theme
tokens; computed popup styling cannot be proven in jsdom. It also compares both
settings steppers' computed button and value backgrounds, because cascade
equality cannot be proven in jsdom, and confirms that every shared primitive
family is present in the rendered catalogue. Do not loop all 17 themes through
Playwright; the unit contract already proves
manifest-to-file coverage, while one real stylesheet switch proves the browser
mechanism.

The same spec contains one direct-`file://` boundary case because browsers
apply distinct module, fetch, stylesheet, font, and image security rules there.
It opens the actual `index.html`, proves the catalogue CSS and eager bundle
initialized, switches to one light theme, and checks the local icon without
duplicating the exhaustive manifest or component assertions.

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
  and their hover/F8 guidance, offline spellcheck's global **None** state and
  language/frontmatter overrides, wrapped-list cursor/selection geometry,
  frontmatter, footnotes, diagrams, tabs, session
  persistence, Kanban presentation/loading states, file-tree actions, and
  stale-response guards.
- Pure and component coverage for tab-overflow direction, nearest active-tab
  reveal, conditional all-tabs visibility, and keyboard menu selection. One
  focused browser scenario remains because actual flex widths, horizontal
  scrolling, and computed pseudo-element fade opacity cannot be represented by
  jsdom.
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
- The Settings About card's packaged-version normalization, backend failure
  fallback, closed-panel cancellation, accessible component state, and
  Wails-metadata injection.
- The design-system catalogue's approved registry, canonical stylesheet links,
  shared-primitive and production-hook inventory, manifest-backed theme
  selector, safe path rules, computed token refresh, component filtering, and
  reuse of the production themed combobox, with only one representative
  real-browser theme switch.

The focused release checks are `tests/frontend/unit/releaseMetadata.test.js`,
`tests/frontend/unit/dependencySecurity.test.js`,
`tests/frontend/unit/nodePrerequisite.test.js`, and
`tests/frontend/unit/releasePreparation.test.js`. They cover the
release-metadata generator's successful version/changelog cut, non-destructive
invalid-version rejection, and idempotent retry. The release shell test runs
the publishing and local-only paths against disposable Git repositories and a
local bare remote, proving that pending non-ignored files join the release
commit, each automatic version bump resolves from the latest tag, and an
interrupted release can resume its matching tag and push. They also prove an
empty `Unreleased` section leaves the worktree untouched and gives the user the
next steps instead of only reporting the failure. The dependency-security test
keeps every `brace-expansion` copy above the denial-of-service advisory range
and guards the ESLint major that provides that patched dependency graph. The
Node-prerequisite test exercises every accepted and rejected release-line
boundary and keeps package metadata aligned with the build checks. The release
script downloads Playwright's pinned browser without using its `--with-deps`
system-package installer, so it never triggers a password prompt.
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

Choose coverage by responsibility:

1. Put filesystem-independent rules and transformations in pure Go or
   JavaScript tests.
2. Put workflow sequencing, confirmation/cancel paths, stale-response handling,
   and rollback in use-case tests with narrow fakes.
3. Put filesystem persistence and Wails translation in adapter tests; put DOM
   events and CodeMirror transactions in focused component tests.
4. Add or extend one real-browser case only if actual browser layout, focus,
   events, sandboxing, or printing is part of the change.

For a Markdown feature, reuse the same representative source in the focused
editor and printable-renderer tests. Extend the consolidated preview/PDF
browser contract only when the browser rendering boundary itself changes.
Assert semantic DOM and important layout—not merely that the source text occurs
somewhere—and keep exhaustive syntax variants below the browser layer.

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

## Today dashboard regressions

The Today dashboard is an un-tabbed empty state, not a synthetic **Welcome**
tab. Closing the final tab, deleting the final open file, and clicking the
Figaro name must leave it centered with an empty tab strip. Pure coverage owns
the local-date presentation, Inbox/pin/rediscovery projections, and daily-note
Inbox preference, legacy-root fallback, and directory/create/collision plan.
Component coverage owns task/pin stale-response guards, quick-capture reuse,
folder reveal, inline errors, and focus recovery.
Due-task coverage additionally owns semantic-link parsing, valid local dates,
urgency ordering, the ambient Today reminder, and the warning state on the
persistent Kanban control.
The real-browser workflow keeps the responsive dashboard geometry and primary
Today activation—including Inbox creation before the dated note—observable.
Old sessions that contain the former `home` tab must still be repaired rather
than restored. Keep these checks in
`tests/frontend/unit/homeModel.test.js`, `tests/frontend/unit/openTodayNote.test.js`,
`tests/frontend/unit/home.test.js`, `tests/frontend/unit/fileTree.test.js`,
`tests/frontend/unit/tabManager.test.js`, `tests/frontend/unit/session.test.js`,
and `internal/desktop/app_test.go`, plus `tests/e2e/workspaceOverview.spec.js`:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/session.test.js \
  tests/frontend/unit/homeModel.test.js \
  tests/frontend/unit/openTodayNote.test.js \
  tests/frontend/unit/home.test.js
npx playwright test tests/e2e/workspaceOverview.spec.js
go test ./internal/desktop -run 'Test(CreateDirectory|CreateInboxNote|LoadSessionPrunesMissingTabsAndWorkspaceReferences)'
```

## Kanban due-date regressions

Due dates remain Markdown data, not configuration state. Pure tests cover the
matching `[due YYYY-MM-DD](YYYY-MM-DD.md)` contract, invalid and mismatched
dates, local-day presentation, unique summary counts, Home priority, picker
months, and the next-midnight refresh plan. Root-scoped backend tests prove
that setting, replacing, and clearing a due date changes only the requested
task line and immediately updates the shared Kanban/Calendar index. Component
tests own picker focus and Arrow-key movement, card controls, warning states,
Today reminders, Calendar task results, and cache invalidation. Keep these in
`kanban_due_test.go`, `app_test.go`, `calendar_index_test.go`,
`tests/frontend/unit/dueDateModel.test.js`,
`tests/frontend/unit/datePicker.test.js`, `tests/frontend/unit/kanban.test.js`,
`tests/frontend/unit/home.test.js`, and
`tests/frontend/unit/calendarCache.test.js`. The static discoverability
contract belongs in `tests/frontend/unit/markdownCheatsheet.test.js`: it keeps
the complete portable due-date line directly after the ordinary task row.
One focused browser workflow may
cover the computed popup position and source-line round trip; pure parsing and
backend mutation branches do not belong in Playwright.

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

The Properties picker adds a browser-only paint and pointer boundary to that
contract. `blockWidgetLayout.test.js` owns its explicit widget paint layer and
the cleared entrance transform; `frontmatterProperties.spec.js` opens a
language option whose center extends below the card, verifies that option is
the topmost hit target, hovers and activates it, and confirms the document
selection remains on its original body line. Keep this focused regression when
changing frontmatter animation, block-widget stacking, picker positioning, or
CodeMirror line positioning:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/blockWidgetLayout.test.js \
  tests/frontend/unit/frontmatter.test.js
npx playwright test tests/e2e/frontmatterProperties.spec.js
```

Every change to vertical cursor movement or its keymaps must also prove the
document-edge contract in both directions. The pure boundary cases belong in
`verticalCursorModel.test.js`; the CodeMirror adapter must prove Arrow Down at
the final position and Arrow Up at the first position remain there, including
an engine result that attempts to move in the wrong direction. The focused
browser checks must cover the real viewport at both scroll limits and Vim
`j`/`k` plus Up/Down while visual-row movement is enabled:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/verticalCursorModel.test.js \
  tests/frontend/unit/editor.test.js
npx playwright test \
  tests/e2e/editorUX.spec.js \
  tests/e2e/vimVisualRows.spec.js
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
below, and verify mouse placement and drag selection around it. For a vertical
navigation change, also put the cursor and viewport at the end and press Arrow
Down, then put both at the beginning and press Arrow Up; neither action may
move or wrap, and wheel input must remain at the corresponding scroll limit.

Interactive Markdown tables add a stricter cursor matrix. Test Arrow keys
within and across cells, Tab and Shift+Tab between cells, Enter down a column,
and Arrow Up/Down from source lines immediately above and below the table.
Confirm that leaving the first/last cell returns to the adjacent document line
without skipping, and verify mouse placement plus drag selection at every
table edge. With Vim enabled, also test Normal and Insert mode in a cell,
Normal `h`/`l` character positions at the first and final cell characters,
Normal `j`/`k` row transitions, Visual `h`/`j`/`k`/`l` cell transitions, and
the transition back to root-editor movement. After leaving both the first and
last cell, assert that the focused root remains in Normal mode and its visible
block cursor still matches `--cursor-bg` and `--cursor-text`, never the Vim
adapter's red fallback. Visual `h`/`l` must stop at each row's first/last column
without wrapping or changing the table, and neither the absolute first nor last
cell may create a row; `j` at the final cell must not append a row. While a cell editor
has focus, assert that every direct root-editor cursor layer is hidden. Enter
Vim Insert mode before typing and again after a text change; assert that the
nested standard cursor layer is displayed, the 4 px line caret has nonzero
height inside the cell, and its rectangle aligns with the browser's collapsed
DOM selection. Also empty that layer to exercise WebKitGTK's native-caret
fallback, confirming its caret color becomes nontransparent only when the
custom cursor is absent. In Normal and Replace modes, assert that the nested
modal cursor has nontransparent theme colors, remains inside the active cell,
and changes the status bar to `NORMAL` or `REPLACE`; Insert and each Visual
subtype must likewise report the focused nested mode. Assert that each Visual
`h`/`j`/`k`/`l` transition
remains Visual, and that Normal and Visual `:` and `/` open the root editor's
bottom Vim prompt without adding a row or raw punctuation. Submit a
Normal-mode `:wq`, verify `/` finds text outside the table, and confirm
cancellation restores the originating cell. Exercise `?` through the same root
prompt, verify it searches backward outside the cell, and cover ordinary
punctuation plus WebKit's `Unidentified` keydown followed by both `beforeinput`
and legacy `textInput`. Finally, edit a cell and verify Vim `u`/Ctrl+R plus
conventional undo/redo change the root document and return to the same cell and
exact cursor; redo must not focus the table's last cell. Keep the focused
automated checks in
`tests/frontend/unit/markdownTables.test.js` and
`tests/e2e/markdownTables.spec.js`.

For tab or workspace-view work, retain a browser regression that places a
nonzero file selection, opens and closes Settings, and verifies the exact
anchor/head pair plus the file tab's saved cursor state. Unit coverage must
also assert that the portable session serializes the current per-file range.

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

## File-tree pin regressions

Pinning is a vault-scoped appearance preference, independent from a row's
custom icon and color. Unit coverage must prove stable pinned-first ordering
within each sibling group, the rightmost pin marker, persistence through
rename/move/copy/merge/delete mappings, and an explicit unpin that overrides
the top-level `Inbox` default without discarding appearance. Keep the
representative browser case in `tests/e2e/fileTreeAppearance.spec.js` focused
on computed marker position and the Pin/Unpin menu transition; sibling ordering
and persistence belong below the browser.

Run the focused contract with:

```bash
go test ./internal/desktop -run 'TestFileTreePin'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/fileTreeModel.test.js \
  tests/frontend/unit/fileTree.test.js
npx playwright test tests/e2e/fileTreeAppearance.spec.js
```

## External Markdown launch regressions

Native file-association launches are an explicit boundary: retain Go coverage
that startup accepts only existing `.md` arguments, the opaque launch ID reads
and saves exactly its original file, and unknown IDs are refused. Frontend
coverage must assert that the import choice occurs before the first tab opens;
import opens the returned collision-safe vault copy, while declining opens the
capability-backed original and adds one process-local root shortcut with the
distinct `FileSymlink` default icon. The existing `delete` action must remain
the single final menu entry and relabel itself **Remove from file tree** for
that shortcut. External shortcuts must not enter the vault Markdown
multi-selection; deletion remains a single-target workflow with no mixed
bulk-delete dialog. External tabs must use the external save binding, never
Auto-Commit or enter the vault session or recent-notes list, and removing the
root shortcut must show the non-deletion warning, close through normal dirty-state protection,
mutate only frontend state, and never call a vault delete binding. Opening or
selecting an external tab must preserve its opaque capability, call the
external read binding, and commit the selected tab plus CodeMirror document
ownership only after that read succeeds. Failed and superseded reads must leave
the previous tab and buffer paired. Native drops onto the file tree must show
the destination-specific import confirmation before any copy binding; cancel
must produce no backend mutation. Buffer drops
must prevent CodeMirror's uncontrolled path insertion, ask once for an entire
native drop batch, insert the selected path at the drop position, and call the recursive collision-safe
import once for a dropped directory. A successful dropped-file import must
open that imported file in a new active tab, while a dropped directory keeps
the current buffer active. The Wails callback must register without the
CSS-drop-target filter so it reaches CodeMirror on Linux/WebKit. Exercise a
packaged Windows/WebView2 build manually by opening an associated `.md` file,
declining import, saving the original, then removing its root shortcut and
confirming the original still exists unchanged except for that explicit save.
Repeat by importing into a vault that already contains the same filename; also
drop a standalone note onto a file-tree folder, cancel once and confirm once,
then drag a note and folder into an editor buffer, choose path insertion once,
and import once to verify the folder hierarchy.

Run the focused contract with:

```bash
go test ./internal/desktop -run 'Test(LaunchExternalFile|MarkdownLaunchPaths)'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/externalFileModel.test.js \
  tests/frontend/unit/externalFiles.test.js \
  tests/frontend/unit/externalDrop.test.js \
  tests/frontend/unit/importedExternalTabs.test.js \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/fileTree.test.js
npx playwright test tests/e2e/tabBufferOwnership.spec.js
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

The focused browser contract also checks that the root Normal block cursor
uses `--cursor-bg` and `--cursor-text`, never the Vim adapter's fixed fallback
red, after switching between contrasting light and dark themes and after focus
returns from either edge of an interactive table. It checks the 4 px Insert
caret plus the optional **Move by visual rows** mapping: `j`, `k`,
and Up/Down move one wrapped display row in Vim Normal mode, including inside a
long wrapped Markdown-link destination, while operator-pending source-line
motions such as `dj` stay unchanged. Markdown diagnostics must retain Arrow Up/Down, mouse
placement, drag selection, themed hover guidance, F8 navigation, and their
enabled-by-default Settings toggle. Wrapped Markdown bullet, ordered-list, and
plain blockquote lines must keep continuation rows under their item or quoted
bodies in both active and passive preview states, while retaining Arrow Up/Down,
mouse placement, and drag-selection behavior.

The separate, off-by-default **Enter rendered blocks** preference must be
disabled while Vim is off, persist and roll back through the same Settings
contract, and let Normal/Visual `j`/`k` enter adjacent fenced source and the
first/last table cell even when visual-row motions would otherwise skip the
widget. Operator-pending motions remain untouched.

Offline spellcheck must retain the same editor movement and selection contract:
its disabled-by-default global **None** state, explicit enablement with the US-English
fallback, themed keyboard-operable language combobox, settings-level disablement
across every note, Spanish frontmatter
override, per-note `false` opt-out, themed dotted marker, and local-only
dictionary assets are covered by unit and browser regressions.
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
  tests/frontend/unit/spellcheckPreference.test.js \
  tests/frontend/unit/spellcheck.test.js \
  tests/frontend/unit/drawioEditor.test.js \
  tests/frontend/unit/drawio.test.js
go test ./internal/desktop -run 'Test(Vim|MarkdownLint|Spellcheck)'
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
