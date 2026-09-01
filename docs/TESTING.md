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

Similar-note coverage follows that split. Pure frontend and Go tests own
Unicode/case/punctuation canonicalization, the short-name cutoff, sibling
scope, and conservative content overlap. The injected review-use-case tests
prove open-existing, explicit create/rename-anyway, exact-name, and cancellation
outcomes without filesystem effects. File-tree component tests prove the create
and rename wiring, while the root-scoped Vault-health adapter test distinguishes
repeated cross-folder filenames from actionable same-folder or content-backed
variants. The existing editor UX browser spec contains one representative
rendered-link click because mapping a replaced CodeMirror link widget back to
its exact source destination is a real geometry/DOM boundary; exhaustive name,
choice, stale-range, and error cases remain below the browser layer.

Link-authoring coverage follows the same boundary. Keep reference-label parsing,
definition normalization, exact-target suppression, filename planning, creation
failure, cancellation, similar-name review, and stale editor ranges in focused
unit/use-case tests. The pure link-click plan must prove both the visible label
and a `#fragment` destination beat hashtag routing, and that only Ctrl/Cmd-left-
clicked HTTP(S) targets select the system-browser action. The focused CodeMirror
component must prove rendered and revealed-source fragment clicks select the
exact heading without a vault read, Kanban tab, prompt, or file creation; it also
proves rendered and revealed external links delegate to the native browser
bridge, show the shortcut hint, and never route a vault Markdown target there.
`tests/frontend/unit/editor.test.js` owns the assembled DOM distinction between
unresolved source and a defined reference widget. The one
representative `tests/e2e/editorUX.spec.js` workflow verifies the unresolved
text cursor and lack of an anchor, keyboard acceptance of **Create note**,
defined-reference navigation, Arrow Up/Down from both directions, and mouse
drag selection across the inline replacement.

Hashtag navigation keeps its token matching and decorated-target agreement in
the pure note-link tests. The focused editor browser regression clicks both the
rendered tag and empty space after an end-of-line tag because CodeMirror's real
pointer-to-position clamping cannot be represented faithfully in jsdom.

Footnote coverage follows the equivalent source-first split. Pure tests own
reference/definition classification, repeated-reference return preference,
paragraph-end insertion, exact blank-line preservation, end-of-document
spacing, and the post-insert cursor offset. The focused CodeMirror component
proves the click dispatch, exact source change, focus, return journey, and one
Undo. One representative editor browser case is retained because mapping a
real pointer coordinate on the marked token to the inserted definition and
painted caret is a browser geometry boundary; it repeats return navigation and
Undo without duplicating the pure spacing matrix.

Architecture guardrails reject imports that point from the pure core back to
adapters or composition roots. They also walk static imports and explicit
worker edges from the eager bootstrap and print-renderer build entries so an
orphaned first-party module fails the suite instead of silently remaining in
the tree. The graph must remain acyclic, only `bootstrap.js` may import the
frontend `app.js` composition root, and only `app.js` may import
`tabManager.js`. The same policy rejects object-valued default-export wrappers;
first-party modules expose the named APIs their consumers and focused tests
actually use. Add a guard when introducing the first module in a new layer
rather than relying on naming conventions alone.

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

Saved input and layout state has an earlier correctness boundary than
`window._appReady`. The startup-hydration use-case test must prove every
independent session/preference port begins in the same turn, the shared promise
does not settle early, and repeated callers do not duplicate the reads. The DOM
presentation test owns the two-frame conceal/reveal scheduler. Keep failures
and concurrency below the browser layer; they do not need geometry.

Initial vault progress is split across the same boundaries. Root-adapter tests
prove exact Markdown discovery and monotonically increasing counts; desktop
tests prove that work remains pending until the idempotent `StartVaultLoad`
request, then covers ordered phases, an independently readable final snapshot,
a bounded event count, and an initial tree read that can share the vault read
lock with indexing. Pure frontend tests cover restoration planning, inactive
metadata-only tabs, progress normalization, settlement, percentage/copy, and
stale-generation rejection; the DOM test owns the hidden-to-present transition
and accessible progress attributes. The one `desktopStartup.spec.js` browser
case is retained because only a real page can prove the mirrored theme paints
before the bridge resolves, the selected note is mounted and editable before
`StartVaultLoad`, inactive tabs cause no reads, and compact footer progress
keeps its full track height while the tree and index remain unfinished. Its
startup-hydration scenario deliberately holds every preference response and
records intermediate animation frames. That browser-only harness proves the
first shell uses the saved sidebar width and an accurate starting status, no
editor is exposed before the barrier, the first visible buffer already has its
saved Vim mode and line-number gutter, pre-Vim keys cannot enter source,
disabled sticky/outline/diagnostic surfaces never flash, and the first
non-empty content geometry is stable. It also
proves that tree completion alone does not publish `window._appReady` and that
successful index completion hides progress without replacing the editor. Its
representative post-ready tree activation also counts native `ReadFile` calls:
the activation read is handed directly to tab mounting and no second request is
issued. `tabManager.test.js` owns the lower-layer prepared-snapshot handoff and
dirty-buffer authority.

### Huge-vault stress profile

Scale-sensitive changes can use the opt-in deterministic vault profile. The
generator writes one small source and one 10,000-line source, then creates
renamed filesystem copies across a deep hierarchy until the vault contains
10,000 Markdown documents. By default, 250 of those files form one portable
project/task set; `--project-tasks` changes that allocation while preserving
the requested total document count. Generated data and JSON reports live under
the ignored `stress-vault/` directory; no fixture notes are checked into Git.

Run the complete profile with:

```bash
make stress-vault
```

The target regenerates only a directory carrying the generator's
`.figaro-stress-vault.json` marker, then runs the real desktop/backend adapter
profile and the focused Chromium layout profile. It writes
`stress-vault/backend-report.json` and `stress-vault/browser-report.json`.
Neither test has timing assertions because hardware and filesystem caches vary;
the reports are measurement evidence, not a release gate. Install Playwright's
pinned Chromium first if it is not already available.

To run or customize the boundaries separately:

```bash
node scripts/generate-stress-vault.mjs \
  --output stress-vault/huge-vault --project-tasks 250 --replace

FIGARO_STRESS_VAULT="$PWD/stress-vault/huge-vault" \
FIGARO_STRESS_REPORT="$PWD/stress-vault/backend-report.json" \
go test ./internal/desktop -run '^TestHugeVaultStress$' -count=1 -v -timeout=10m

FIGARO_STRESS_VAULT="$PWD/stress-vault/huge-vault" \
FIGARO_STRESS_BROWSER_REPORT="$PWD/stress-vault/browser-report.json" \
npx playwright test tests/e2e/hugeVaultStress.spec.js --reporter=line

VAULT_PATH="$PWD/stress-vault/huge-vault" make dev
```

The Go test owns real filesystem discovery, indexing, bounded vault-load
progress emission and final counts, bridge serialization,
search, relationships, Git status, health, a reversible directory move, and a
small warm copy followed by its cached file-tree projection. It also records
ranked rare, prefix, typo, and link-completion searches.
The browser test supplies equivalent 10,000-item responses to isolate real DOM,
layout, CodeMirror virtualization, keyboard rerender behavior, and bounded
large-collection rendering. Its backend fixture includes Graph and private task
schedule projections. Each scenario writes the accumulated JSON report before
the next isolated page starts, so a later failure cannot erase earlier evidence.
The Graph timings wait for the latest complete canvas frame, and the large-note
timing waits for every staged Markdown presentation feature before measuring
cursor movement and a tail edit. `editorDocumentMountModel.test.js` separately
proves that only large Markdown inputs split, that the split stays on a line
boundary, and that joining its chunks preserves the source byte-for-byte.
Opening the generated vault through `make dev`
remains the native packaged-webview smoke check. Current reference measurements
and prioritized findings live in
[`docs/HUGE_VAULT_STRESS.md`](HUGE_VAULT_STRESS.md).

Large-scale optimizations must pass the correctness oracles before their
timings are compared:

- `TestWarmVaultStateMatchesColdRebuildAcrossMutationSequence` keeps one shared
  index warm through a known save, watcher create/remove, and directory move,
  then compares search, backlinks, unlinked mentions, Kanban, calendar, Vault
  Health, and tree results with a fresh application rebuild. Stage-specific
  golden paths and dates prevent both sides from agreeing on the same wrong
  result, and the warm tree is also compared with an independent filesystem
  walk.
- `TestDirectoryMoveRewritesSparseLinksAcrossLargeVault` places Markdown,
  reference-definition, and wiki links among 256 unrelated notes. Every link
  must be rewritten and sampled decoys must remain byte-identical. A separate
  stale-index regression creates an unobserved Markdown file and proves that
  move planning selects the complete scan/rebuild fallback.
- `TestFileUncommittedStatusMatchesFullWorktreeStateMatrix` treats go-git's
  complete worktree status as the oracle for clean, modified, staged, deleted,
  untracked, root/nested ignored, negated, executable-mode,
  staged-delete/recreate, and renamed path states.
- `TestBuildFileTreeFromEntriesPreservesHierarchyAndSortOrder` and
  `TestFileTreeCacheReusesSnapshotAndRemapsKnownMove` prove the pure cached-tree
  projection, immutable reuse, known create, new-parent synthesis, and move
  remapping. `TestFileTreeCacheAndVaultIndexStayWarmAcrossKnownCopy` proves a
  copy retains unrelated warm metadata and adds its complete subtree.
  `TestWarmCopyMatchesColdRebuildAcrossVaultProjections` compares copied search,
  backlinks, Kanban, calendar, health, and tree results with disk and a fresh
  application; a separate stale-index copy regression proves an unobserved
  external note selects the cold fallback. Focused watcher/generated-file
  cases prove that copied create events are acknowledged once, a non-Markdown
  timestamp change, starter stylesheet, and generated PDF remain visible after
  the cache is warm. The warm-vs-cold oracle still compares its paths with an
  independent disk walk after watcher and mutation stages.
- The non-opt-in Playwright case in `hugeVaultStress.spec.js` traverses 121
  logical positions in the file tree and search, 110 Kanban cards, and every
  relationship in a 160-document collection. It then activates a distant tree
  row, opens its keyboard context menu, reorders and drags a distant Kanban
  card, and opens the selected search result. The focused item must remain
  mounted, selected, operable, and correctly identified after crossing any
  future render window.

The opt-in timing profile asserts logical collection counts separately from
mounted row/card counts. A virtualized implementation can therefore reduce DOM
size without weakening the functional oracle or teaching the performance test
to expect truncated data. Run the focused pre-optimization gates with:

```bash
go test ./internal/desktop \
  -run 'TestWarmVaultStateMatchesColdRebuildAcrossMutationSequence|TestDirectoryMoveRewritesSparseLinksAcrossLargeVault'
go test ./internal/history \
  -run 'TestFileUncommittedStatusMatchesFullWorktreeStateMatrix'
npx playwright test tests/e2e/hugeVaultStress.spec.js \
  --grep 'preserves keyboard reachability'
```

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
├── notenames/        Pure note-name canonicalization and content comparison
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

The JavaScript toolchain requires Node.js 22.18+ on the 22.x line, or Node.js
24.11+. `make bootstrap` checks this exact Babel 8-compatible range before
installing dependencies.

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

Browser tests that configure preference-backed editor behavior after startup
must wait for `window._appReady === true` before changing it. Otherwise the
normal startup hydration can overwrite the test's setting partway through a
slower CI run. A test of startup itself should instead install held preference
ports before navigation, assert the editor remains concealed, then release the
ports and inspect only frames painted after `data-startup-hydrating` is removed.

### Remote browser-failure diagnostics

GitHub's ordinary CI browser job and the release workflow's verification job
run Playwright with an HTML reporter plus failure-only tracing and screenshots.
If either job fails, its final workflow step uploads a
`playwright-diagnostics-*` artifact for 14 days. `playwright-report/` contains
the browsable report; `test-results/` contains the retained trace, screenshot,
error context, and other test attachments. The upload step uses
`if-no-files-found: warn` so a failure before Playwright starts remains the
original failure instead of being obscured by a second artifact error.

No diagnostic artifact is uploaded for a successful run, and local Playwright
defaults remain unchanged unless `CI` is set. Keep the focused workflow
regression in `releaseMetadata.test.js` synchronized with both workflow files
and `playwright.config.js` whenever paths, retention, reporters, or failure
capture change.

### Design-system catalogue

`tests/frontend/unit/designSystemCatalog.test.js` owns the exhaustive catalogue
contract: indexed group membership, adoption of the eighteen approved families
in catalogue and production markup, exact agreement between
`approved-components.json` and the selectors implemented by
`primitives.css`, exact eager style order in the app, catalogue, compatibility
aggregate, and `style-manifest.json`, removal of superseded picker, stepper,
and action rule blocks, preservation of distinct cards and toggles, and the
explicit approval policy in `AGENTS.md`. The same test validates every theme
against `theme-contract.json`: each theme supplies every required token,
declares only allowed tokens, and contains exactly one selector-free `:root`
rule. It also rejects retired theme-effect hooks and unconsumed style artifacts.
It owns validation of all manifest records and backing CSS files,
unsafe/duplicate record rejection, multi-word filtering, DOM index
construction, stylesheet-link selection, direct-file-relative asset
resolution, and synchronization of the checked-in classic bundle with its
module sources. These rules do not need a browser matrix. Feature component
tests continue to own controller behavior; for example, the frontmatter test
proves that embedded-editor menus expose the shared open state while retaining
their own selection policy. `tests/frontend/unit/tooltip.test.js` owns native-title
adoption, dynamic updates, iframe-name preservation, hover/focus/Escape and
`aria-describedby` lifecycle, disabled-toggle label delegation, and pure
viewport placement. It also verifies that moving focus through an unhinted
control clears Escape suppression so a later return can show the hint again,
removes a visible owner's DOM node, and simulates a
stationary pointer across owner reflow; both regressions must dismiss the shared
tooltip and clear its accessibility relationship without relying on `mouseout`.
The focused design-system browser regression then moves and removes a real
hovered owner without moving the pointer, establishing native hit-testing and
layout behavior that jsdom cannot provide.

The Calendar wheel model owns vertical-direction, high-resolution accumulation,
direction-reset, modifier, and horizontal-gesture policy. The Calendar cache
component test proves that grid wheel input changes the visible month and is
prevented, while selected-day result wheel input remains native. It also holds the month port unresolved to prove that
the shared skeleton appears synchronously with locale-shaped row geometry,
accessible busy status, successful response replacement, and no same-month cache
flash. It also owns the session-selection contract: the first panel opening
chooses local Today, a selected actionable day survives close/reopen, and the
legacy cross-session storage key is discarded. The Kanban component test similarly holds both board ports unresolved
and proves its three columns adopt `.ui-skeleton` before resolving into cards.

`tests/e2e/designSystemCatalog.spec.js` is the single representative browser
boundary. It proves that the real manifest populates the selector, a light
theme stylesheet changes computed token values, filtering updates visible
geometry, and intrinsic control icons retain their production dimensions and
paint contract. The same representative scenario opens the shared select-only
combobox and compares its popup surface, text, and border with the active theme
tokens; computed popup styling cannot be proven in jsdom. It also compares both
settings steppers' computed button and value backgrounds, because cascade
equality cannot be proven in jsdom, and confirms that every shared primitive
family is present in the rendered catalogue. Settle the catalogue's smooth
page scrolling before pointer-only paint assertions; a hover must target the
control's final geometry, not an in-flight keyboard-focus scroll.
The same boundary checks the
skeleton's theme-derived fill, radius, clipping, and active shimmer; the unit
contract owns its reduced-motion rule. The tooltip specimen additionally
proves hover delay completion, immediate keyboard-focus exposure, Escape
dismissal, and dark/light computed paint from the canonical tokens. Scroll the
specimen into a settled viewport before the keyboard-focus assertion so that
the focus contract stays independent from the separately intended
viewport-movement dismissal. Do not loop
all 18 themes through Playwright; the unit contract already proves
manifest-to-file coverage, while one real stylesheet switch proves the browser
mechanism.

The Theme, Font, and Code Font controls reuse the approved picker paint but
have their own shared controller. `pickerModel.test.js` owns the deterministic
arrow/Home/End/Enter/Space/Escape/Tab plan; `settingsPicker.test.js` owns the
labelled combobox/listbox DOM, active descendant, announced selection, pointer
choice, and close behavior. The catalogue component test proves its Appearance
specimen is wired to that production controller. `editorUX.spec.js` keeps one
actual Settings path for focus entry, semantic headings, keyboard selection,
and normal Tab continuation.

The existing Figaro-theme browser scenario owns CRT Phosphor's exact palette
and computed screen-effect boundary. It checks borderless overscan, a
decodable 128px multi-level high-pass dither tile, 35%-strength repeating
scanlines, 80px/140px glass shadow, 12/18/24-second glass
animations, phosphor bloom, the separate 60-second blurred beam, and unchanged
content geometry. Reduced-motion coverage suppresses its motion while retaining
the static treatment. The scenario continues to own the
Settings layout boundary: at wide widths its two card groups occupy independent columns and
short cards retain intrinsic height; below 960px the groups stack at equal
width without changing logical card order. `tabManager.test.js` owns the exact
group membership and DOM order, so Playwright keeps only the representative
geometry assertions.

When that scenario compares a rendered CSS color with a token-derived color,
it compares their canvas-resolved pixel channels. Chromium versions may
serialize the same paint as `rgb()`, `color(srgb ...)`, or `oklab(...)`; string
equality would test the browser's chosen notation rather than Figaro's theme.

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
  Vault-health scanning including conservative similar-note classification,
  single-file-only Auto-Commit migration and isolation,
  history comparison/restoration, exact pre-delete file and recursive-folder
  archives, durable recently-deleted recovery with collision refusal, and
  non-destructive save/commit/registry failures, Draw.io file handling and
  export-recovery states, print stylesheet resolution, and printable-document
  preparation.
- Editor behavior, CodeMirror language modes, current-note heading-fragment
  completion, typed Markdown block-guide folding, exact Raw Text Preview, persistent Markdown diagnostics
  and their hover/F8 guidance, offline spellcheck's global **None** state and
  language/frontmatter overrides, the dynamic editor accessible name,
  per-buffer undo/redo ownership, one-Enter empty-list and empty-blockquote exit, smart URL paste
  for native, Vim Visual `p`, and editor-menu paths, and wrapped-list cursor/selection geometry,
  frontmatter, footnotes, diagrams, tabs, session
  persistence, Kanban presentation/loading and keyboard-order states,
  file-tree actions and roving keyboard-tree states, and
  stale-response guards.
- Application shortcut coverage splits the case-normalized decision from the
  capture-phase DOM effects: the pure model distinguishes local Find, global
  search, Quick Note, daily note, and sidebar commands; one browser scenario
  sends real shifted and unshifted key events and observes each user-visible
  destination without synthetic lowercase-key assumptions.
- Pure and component coverage for tab-reorder planning and drag thresholds,
  application-wide selection suppression during the active gesture, cleanup
  after drop and cancellation, pin-group boundaries, tab-overflow direction,
  nearest active-tab reveal, bounded vertical-wheel and Ctrl+PageUp/PageDown
  direction, high-resolution accumulation, preservation of horizontal wheel
  scrolling, two-ended
  filename/path presentation with filename-priority compression, conditional all-tabs visibility, keyboard menu
  selection, and the disabled-by-default vault-relative editor breadcrumb.
  The focused browser scenario drags a real primary pointer from the tab rail
  into the file tree and back, retaining no selected text while asserting the
  temporary computed `user-select` guard. It also owns real vertical-wheel and
  Ctrl+PageUp/PageDown tab switching, first/last clamping, preservation of the
  flush leading-tab alignment across overflow-button measurement, the actual
  flex widths, horizontal scrolling, and computed pseudo-element fade opacity
  that cannot be represented by jsdom.
- Browser rendering of cover pages, table of contents, fenced-code token colors,
  Mermaid, Vega, and Vega-Lite in the PDF export pipeline; focused printable
  renderer coverage also proves that CodeMirror table `<br>` markers become
  real breaks and anchored `^` markers become vertical row spans without
  rewriting source. The same renderer coverage proves that only a parsed body
  `---` thematic break becomes an authored PDF page break: frontmatter and
  Setext headings remain structural, and `***` / `___` remain visible rules.
  The consolidated browser case carries one authored break and representative
  highlighting/math through the real vendored renderer used by preview/export.
  Plugin anchor, task, footnote, and inline-transformation rules remain in
  `export.test.js`, rather than a duplicate browser matrix. Observe dependency
  loading through browser request events, not the size-limited Resource Timing
  buffer, which can omit eagerly loaded modules in the assembled application.
- Dependency security coverage for patched root lockfile entries and embedded
  packages that `npm audit` cannot see. Mermaid's actual browser bundle remains
  behind a pure pre-parse size and ordered-map policy until its embedded YAML
  parser reaches a fixed release; the representative PDF browser scenario
  proves rejected source remains printable.
- The Figaro Dark, Light, and CRT Phosphor theme assets, including their warm or
  phosphor reading surfaces, contiguous active tab, shared single-pixel
  file-tree/tab boundary, borderless but filled Search/Quick Note controls,
  stripe-free operation-selection surface and weight, tactile Settings
  card, focus token, text/link contrast, and at
  least 4.5:1 rendered contrast for Home's small muted instructions. Figaro
  Dark additionally holds dim and muted tokens against the conservative hover
  surface plus the application-status text at 4.5:1 or above. The debug shell
  must load the real manifest and theme CSS before these computed checks. Native
  Dark/Light coverage additionally compares computed titlebar/file-tree and
  editor/gutter/buffer-status colors, proves the internal sidebar, tab, workspace, and
  status borders are transparent, and keeps only the subtle tools divider and
  status separators. Figaro Dark also asserts that its editor plane has a
  deliberate luminance lift over the navigation plane. CRT coverage checks its
  borderless glass, separate beam, and reduced-motion contracts.
- Browser workflows for contextual Relationships, keyboard-triggered mention
  linking, the themed Vault-health Settings entry and finding navigation, and
  the full-width, non-overlapping History source comparison before restoration,
  plus the nested Document outline's visual hierarchy, active-section
  tracking, top-right launcher positioned beneath the complete sticky
  hierarchy, each sticky ancestor entering separately as its real source row
  crosses the covered editor edge even while CodeMirror's virtual viewport is
  unchanged, sticky title text matching CodeMirror's computed normal font size,
  full-width flush strip geometry without floating-card radius or shadow, keyboard jump,
  Arrow Up/Down movement, editor-focus handoff, and the right pane's atomic
  visible/`aria-hidden`/`inert` focus boundary.
- The sandboxed PDF-preview bridge: user `html`/`body` styles apply inside the
  frame, external links cannot navigate it away, and fragment/footnote-return
  links remain in the rendered document. A routed note-relative local image
  must load inside that real opaque-origin frame with any authored dimensions
  intact; `pdfPreviewImageModel.test.js` owns the pure resolution/containment
  plan and jsdom covers DOM rewriting plus attribute preservation. Once the
  first render settles, a deliberately suspended editor refresh must leave the
  loading badge hidden, the settled status unchanged, and the prior bridge
  snapshot mounted until the new printable document is ready.
  Printable block source ranges and the shared 30% marker must keep
  editor/preview positions aligned across several differently sized code
  blocks, with percentage fallback for unmapped areas.
  High-frequency scroll reports are coalesced before they can cause a matching
  burst of editor updates. The
  real-browser suite also verifies that printable Markdown preparation enters
  the module-worker path before the preview document is applied and that the
  document-side pass adds visible syntax-token colors before it enters the
  sandboxed frame.
- Release metadata consistency across npm, Wails, the GPL license, Keep a
  Changelog headings and comparison links, exact-version GitHub release notes,
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
`tests/frontend/unit/releaseNotes.test.js`,
`tests/frontend/unit/dependencySecurity.test.js`,
`tests/frontend/unit/nodePrerequisite.test.js`, and
`tests/frontend/unit/releasePreparation.test.js`. They cover the
release-metadata generator's successful bracketed version/changelog cut,
comparison-link update, non-destructive invalid-version rejection, and
idempotent retry. The release-note parser independently proves exact-version
selection, canonical Keep a Changelog category order, non-empty groups, and
exclusion of neighboring releases and link definitions. Workflow assertions
require both validation and publication to use that parser, forbid GitHub's
generated-note path, and require retries to edit the curated body. The release shell test runs
the publishing and local-only paths against disposable Git repositories and a
local bare remote, proving that pending non-ignored files join the release
commit, each automatic version bump resolves from the latest tag, and an
interrupted release can resume its matching tag and push. They also prove an
empty `[Unreleased]` section leaves the worktree untouched and gives the user the
next steps instead of only reporting the failure. The dependency-security test
keeps every `brace-expansion` and `js-yaml` copy above its denial-of-service
advisory range and guards the ESLint major that provides that patched
dependency graph. The
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

Printable table break and merge rules belong below the browser layer: keep the
pure marker plan in `tests/frontend/unit/printableTableModel.test.js` and the
shared preview/export DOM contract in `tests/frontend/unit/export.test.js`.
The tests must cover successful consecutive carets, a non-destructive
unanchored caret, literal code-spanned `<br>` text, and the unchanged source
contract. A new browser test is unnecessary unless the browser-only print
geometry or native pagination boundary changes.

## Frameless window chrome regressions

Window-edge styling must remain a full, pointer-transparent outline: one pixel
on every side, the same radius as `#app`, and a slightly stronger top color.
Keep `tests/e2e/windowChrome.spec.js` focused on those computed properties so
the browser build and packaged webview do not drift back to separate border
implementations. After changing the outline, title bar, drag region, or window
controls, also exercise native edge resizing and maximize/restore in the
packaged application on each affected desktop platform.

## Pure mode regressions

Keep eligibility below browser layout in
`tests/frontend/unit/pureEditingChrome.test.js`: the pure model must require an
active file tab and a collapsed left rail, with no preference opt-out. An open
details pane does not change eligibility: the DOM/right-pane adapter tests must
prove it keeps its owner mode and `open` state while becoming zero-width, inert,
pointer-transparent, and accessibility-hidden, then returns intact when Pure
ends. The same suite owns reactive class application, retired-key cleanup,
keyboard reveal selectors, complete breadcrumb /
sticky-heading / outline omission, the stable quiet Add-properties slot, and
use of the existing theme surface token. State and Settings-tab tests separately
prove the enabled-by-default Typewriter migration and explicit opt-out, the
Off/Phrase/Paragraph focus vocabulary, disabled-by-default adaptive type, and
labelled controls.

`tests/frontend/unit/pureWritingModel.test.js` owns scope normalization,
phrase-versus-block range choice, authored-input event eligibility and
selection/Find/pointer exclusions, 42% target clamping, motion duration plus
reduced-motion behavior, and adaptive typography hysteresis.
`tests/frontend/unit/pureWriting.test.js` mounts a concrete CodeMirror view and
proves paragraph/phrase decoration updates, normal-mode non-interference,
selection/Find suspension, typewriter class/padding state, and Arrow Up/Down in
both directions across the changed presentation. Keep this below the browser;
do not duplicate every scope or input annotation in Playwright.

One representative case in `tests/e2e/editorUX.spec.js` owns the irreducible
computed geometry. With a file open, collapse the
sidebar, focus the editor, and assert that the main container reaches both
physical window edges while the 28px top approach strip and status bar are
absolute overlays; crossing into that strip must restore the complete 44px row
while the adjacent document area remains inactive as a reveal target.
Move away to prove the tab rail recedes, approach the top and bottom edges to
reveal the existing controls, and compare the editor rectangle before and after
both transitions. The collapse click must leave pointer and focus on the
persistent sidebar toggle without pinning the tab rail open, while an idle
footer must already expose only the bottom-right real word-count node before
focus enters the document. Pointer movement over the bottom edge and both empty
`.cm-content` margins, keyboard focus, and a meaningful status with an action
must not reveal any other footer item. Its surface remains transparent and
pointer-transparent, its application live region remains clipped for assistive
announcements, and invisible actions cannot receive focus. Programmatic
keyboard focus inside the tab/window groups must reveal the hidden titlebar
group. Breadcrumbs, sticky headings, and Document outline must remain absent
after both pointer and keyboard title-bar reveals. Begin with an open right
pane and prove collapse preserves its mode while removing its width/focus, then
expansion restores the same pane. In that same representative browser workflow,
enable Paragraph focus and assert computed dimming plus selection suspension;
enable adaptive typography and assert the coupled spacious font/measure; place
the caret and drag a selection with real pointer coordinates, then traverse the
same focused area with Arrow Down/Up before sampling typewriter motion; place
the caret low in a long document, type once, sample more than one intermediate
scroll offset, and require the settled caret near 42% of the viewport. Expanding
the sidebar must restore the ordinary 44px/24px shell allocation and configured
base typography.
Retain the computed `--wails-draggable` assertion and, after changes to this
overlay or its pointer geometry, exercise native drag, edge resizing, and
maximize/restore in the packaged application on each affected desktop platform.

`tests/e2e/desktopStartup.spec.js` owns the restart composition: seed the saved
collapsed rail, disabled Typewriter, Paragraph focus, and
adaptive type alongside a portable active-file session. Record every first
shell/editor frame and require a constant 44px sidebar plus the remembered
active file, Pure/focus/adaptive presentation, and absence of Typewriter in
every visible editor frame. The final session write must retain that active
file. This complements the pure model and session-persistence units without
duplicating their normalization or write-queue matrices in the browser.

## Sidebar navigation regressions

Calendar, Kanban, and Graph are persistent sidebar destinations, not title-bar
toggles. Retain focused coverage that they remain in the footer below the file tree,
Settings remains beside the window controls, and the approved connected rounded
tab rail occupies the title-bar center. Real-browser geometry must prove that
the title-bar/sidebar boundary stays aligned at the restored width, after
collapse/expand, and after a pointer resize. `paneSeparatorModel.test.js`,
`sidebarResizer.test.js`, and the focused PDF-preview splitter test own the
Left/Right, accelerated Shift movement, Home/End bounds, physical direction,
and synchronized ARIA values. Keyboard focus must paint only the compact
centered marker rather than the full separator. The application-status region must
end at that same boundary while the buffer-status region starts there; active title-bar tabs meet the workspace with
rounded top corners, radius-matched inverse lower junctions, and no bottom
border. Both radial feet must be pointer-transparent and yield to the existing
drop-before/drop-after indicators during reordering. Overflow reveal must
include both radius-sized feet and clear the corresponding edge fade once the
complete active silhouette is visible. Tabs remain no-drag targets while
unused title-bar space retains native dragging. With a non-leading title-bar
tab selected, the main pane's top-left corner must use the shared tab radius;
selecting the first displayed tab must return that corner to zero so its editor
connection remains uninterrupted. The editor container, CodeMirror root,
tab-panel host, and active panel must inherit the same computed corner so no
faded square inner layer survives beneath it. In a bordered theme, the
title-bar mask must cover exactly the radius-wide horizontal segment and the
sidebar rail must begin one radius below the corner; selecting the first tab
restores both full rules. The main-container backdrop must equal the sidebar
surface so the transparent curve cannot reveal a square application-canvas
patch. Hovering the inactive first title-bar tab must make that backdrop equal
the tab-hover surface and stack the tab above the unchanged title-bar divider
mask; pointer exit restores the sidebar surface, and selecting the first tab
restores the square workspace state. Calendar must occupy the central
workspace without taking ownership of History/Document outline/Raw Text
Preview/PDF preview on the right. At desktop width, assert that its two tracks
have equal geometry, the complete month unit is centered horizontally and
vertically in the left track, the selected-day region begins at the exact
halfway point without a border, and the shared status bar retains its 24px row
with a visible application region and hidden main-pane buffer region. Switch
between Calendar, Kanban, and Graph and assert the main container's top, bottom,
and height remain unchanged. Populate
overflowing due-task and linked-note results, then assert that the right region
scrolls independently without moving or clipping the monthly grid. Switching
that populated date to a compact one-result date must leave the workspace
height and grid position unchanged. At
a 1440x900 workspace, also populate one due task and one linked note and assert
that both headings and rows remain fully visible in the selected-day region.
Select a date with no results separately and verify
that its guidance uses the Calendar font family, compact 12px/18px type, muted
theme color, and deliberate spacing instead of inherited application body text.
The shared pure Timeline model owns Calendar's centered 42-day window, 14-day button paging,
14-day measured prefetch threshold, seven-day left/right range shifts,
busy/non-overflow rejection, locale-weekend
classification, three-day-minimum two-axis wheel normalization, bounded drag-pan
projection and movement threshold, empty-day materialization, dirty-buffer
replacement, direct appearance validation, and first-occurrence line projection. The component test
owns the pressed Month/Timeline state, initial loading/error announcements, silent
prefetch that retains the existing 42-day DOM until its response, disposal that
clears rendered dates and cached state, non-destructive prefetch failure that
keeps the old range and restores its anchor, horizontal
wheel/keyboard mapping, pointer listener/class lifecycle, note-button exclusion,
buffer-triggered range request, weekend semantics, stacked 8px pills, custom
icon/color rendering, and the exact `{path, line, date}` open request. Native Calendar tests prove one bounded
range reads the shared index, excludes out-of-range notes, retains first
occurrence lines, copies response slices, and rejects malformed, reversed, or
oversized ranges. In the existing Calendar browser workflow, assert real
horizontal overflow, vertically stacked same-day pills, computed custom paint
and icon geometry, main-pane/weekday surface continuity, the reserved
locale-weekend tint, three-day minimum wheel travel, grab/grabbing cursor and
selection suppression during a real pointer pan, fixed blank buffer-status row, a one-week
range request on entering the two-week edge buffer, preservation of a visible
shared day's viewport coordinate after insertion, Timeline release when a note
takes the workspace, fresh rendering on return, existing-tab reuse, new-tab creation, and
the resulting CodeMirror cursor line. Pin the fixture's clock so that an
ordinary weekday cannot acquire Today styling as the real date changes.
Do not duplicate range, direction, or
appearance matrices in Playwright.

Calendar, Kanban, and Graph must each open or switch to one de-duplicated,
sidebar-owned workspace while remaining absent from the title-bar rail and its
overflow menu. Every inactive control uses the ordinary flat document-tab
state; every selected state has rounded left corners, no right radius, zero
border on all sides, reaches the exact sidebar/workspace boundary, and matches
its workspace surface across that seam at expanded, collapsed, resized, and
restored widths. Override the rail and idle-resizer tokens with conspicuous
colors in the browser regression and prove the selected tab paints above the
rail while the idle resizer becomes transparent. Drive a real pointer down/up
sequence rather than relying only on `locator.click()`: while pressed and in the
first selected transition frame, all four computed border colors must remain
transparent and the variant's transition list must exclude border and shadow
paint. The upper and lower
workspace-edge pseudo-elements must each be pointer-transparent, use the same
radius as the tab, and paint a radial concave junction outside the selected
row; hover, focus, and drag states
must remain available. Clicking any selected control is inert rather than
closing its workspace. Settings alone retains its de-duplicated title-bar workspace tab and
active-click `figaro-panel-exit` behavior. That transition must honor the shared
reduced-motion duration, remain safe under repeated close requests, and retain
any workspace opened while the exit is running. Keep the pure title-bar projection in
`tabPresentationModel.test.js`, state/action checks in
`tests/frontend/unit/topBar.test.js`, and real layout, visibility, rail-width,
tab reuse, active-side-tab geometry, and inactive-click checks in
`tests/e2e/sidebarNavigation.spec.js`:

```bash
npm run test:unit -- --runTestsByPath tests/frontend/unit/topBar.test.js tests/frontend/unit/tabPresentationModel.test.js
npx playwright test tests/e2e/sidebarNavigation.spec.js
```

Graph behavior is split at the lowest useful boundaries. Go tests for
`buildVaultGraph`/`GetVaultGraph` prove stable shared-index projection, known-save
index reuse, folder groups, daily/orphan degree, exact and unambiguous basename
resolution, and ambiguous-target refusal. `graphModel.test.js` owns normalization,
query/orphan filtering, fixed 45/45 deterministic layout, file-tree appearance
precedence, nested tinting, palette extension, fit/zoom math, and keyboard
ordering without DOM or Wails. `graphView.test.js` owns the floating control
structure, button-based orphan state, always-painted arrows, safe custom-icon
overlay, accessible busy/error states, persistent selection versus deliberate
opening, status behavior, filtering, and inactive graph/appearance refresh
deferral. `fileTree.test.js` proves a successful appearance write emits the
narrow graph-refresh signal. The opt-in huge-vault browser profile additionally
owns the irreducible scheduling boundary: a 10,000-node render, equivalent
filter, pinned selection, and zoom must each wait for a committed canvas frame
and report their own long tasks. Pure tests prove filtered layouts retain full-
graph coordinates, equivalent projections are recognized, and large layouts
bound force refinement.
The existing `sidebarNavigation.spec.js` carries
one browser-only canvas boundary: a fitted custom-icon node must map a real
pointer click at the canvas centre back to that exact note path and pin its trace
without leaving Graph; an empty-canvas click clears it and Ctrl-click opens the
file. The canvas background remains stable on hover, the 224px search and
pressed Orphans choice float beside borderless zoom controls without a toolbar,
and graph telemetry uses the existing status bar. Do not duplicate the pure
filter/layout/appearance matrix in Playwright.

## Today dashboard regressions

The Today dashboard is an un-tabbed empty state, not a synthetic **Welcome**
tab. Closing the final tab, deleting the final open file, and clicking the
Figaro name must leave it centered with an empty tab strip. The initial markup
and every tab render leave the rail free of special empty-state paint. The
focused browser workflow must verify that the rail never owns a computed baseline, the title
bar's divider ownership survives closing the final tab unchanged, and a
bottom-aligned opaque active tab stacks above that structural seam with no lower
border. Theme coverage separately proves whether that divider is visible or,
for Figaro Dark and Figaro Light, transparent.
Pure coverage owns
the local-date presentation, Inbox/pin/rediscovery projections, and daily-note
Inbox preference, legacy-root fallback, and directory/create/collision plan.
Component coverage owns task/pin stale-response guards, quick-capture reuse,
folder reveal, inline errors, and focus recovery.
Due-task coverage additionally owns metadata projection, valid local dates,
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
  tests/frontend/unit/tabReorderModel.test.js \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/session.test.js \
  tests/frontend/unit/homeModel.test.js \
  tests/frontend/unit/openTodayNote.test.js \
  tests/frontend/unit/home.test.js
npx playwright test tests/e2e/workspaceOverview.spec.js
go test ./internal/desktop -run 'Test(CreateDirectory|CreateInboxNote|LoadSessionPrunesMissingTabsAndWorkspaceReferences)'
```

## Kanban due-date regressions

Board, Gantt, Calendar, Today, and reminders share one metadata deadline contract. Pure
`internal/taskschedule` tests cover valid dates, start-only tasks, and overdue deadlines before actual starts, canonical task
identity, line/tag shifts, duplicate ambiguity, clear overrides, reconnect
collisions, and subtree rename. Root-scoped `task_schedules_test.go` proves
private atomic metadata persistence/reload, exact unchanged Markdown including
ordinary Markdown links, stale/path/corrupt-file refusal, escaping config symlinks,
and the production rename hook. `ganttModel.test.js` covers inclusive geometry,
DST-independent movement, endpoint clamping, deduplication, metadata precedence,
completed colors, and bounded rows. `kanbanGantt.test.js` owns picker handoff,
immediate date/clear persistence without Save/Cancel, outside-click dismissal,
real nested Start/End picker ownership and Escape order, Escape after focus loss
during a pending write, listener teardown on every dismissal path, and no late
focus theft or popup revival after success/failure. It also covers failed-date
retry, retained fields, open-note handoff, one-write drag release, pointer/Escape cancellation, visible
errors, reconnection controls, dirty-note refusal, Calendar deadline invalidation
after persistence (including a failed subsequent refresh), status ownership, and disposal.
Rapid native scroll events are also asserted to schedule exactly one row-window
render frame, while keyboard Home/End retains its synchronous reveal path.
The same component suite owns the zero-task status lifecycle, hides drag/resize
guidance until a task exists, and proves the status is outside the translated
row track. The focused Gantt browser boundary scrolls a genuinely empty track,
asserts that its live status remains visible and centered, and confirms that
the inapplicable manipulation guidance is absent; this is the irreducible
overflow/geometry regression.
`timelineViewport.test.js` parameterizes the shared component for Calendar and
Gantt, proving synchronous pre-paint marker restoration, keyed element/focus
retention, unfinished-wheel destination and active-pan origin rebasing, reduced motion, disposal,
edge paging, and buffer sizing once. Calendar component coverage additionally
keeps scrolling during a delayed range read and rejects stale/disposed commits.
Existing Calendar Timeline pure/component tests continue
to own note projections and cache behavior. Run the existing Calendar browser
case alongside Gantt after changing the shared viewport.
`kanbanGantt.spec.js` is the representative browser boundary for sticky labels,
real pointer capture and click delivery, edge geometry, the themed date picker,
outside-popup click/focus handoff and one-click switching to another task,
and unchanged application-footer geometry. Both existing timeline browser
scenarios use `support/timelinePaint.js` to sample every animation frame across
left and right buffer crossings: no empty track, backwards/week-sized flash,
or lost wheel travel. A final-position-only assertion cannot detect this bug.
The Calendar scenario's former backend range/argument assertions are covered
by component/pure tests instead. Keep data/failure matrices below
the browser layer. Native packaged pointer behavior still requires the normal
WebKitGTK/WebView2/WKWebView smoke check.

Old due-looking links remain ordinary Markdown, not scheduling syntax.
Pure tests prove preferred-style date-link insertion in tasks and prose,
single-date replacement versus multiple-date append, single-tag replacement
versus multiple-tag append, protected inline syntax, command removal,
untagged-checklist TODO assignment, date validation, first starts on moves into non-TODO columns, preserved existing
starts/deadlines, identity ambiguity, and local-day presentation.
`taskDueMetadata.test.js` proves safe-save-before-metadata ordering and stale
buffer/save/metadata failures. The assembled editor components verify the link
preference, exact source handed to persistence, no deadline for prose, picker
cancellation, repeat column selection, and one-step source undo/redo.
`internal/taskschedule/date_edits_test.go` proves date-only identity rebinding,
preserved start/end, duplicate refusal, and schedule collisions; root adapter
tests exercise this through real note saves. Calendar model/index tests cover
wikilink associations and Markdown/Wikilink deduplication.
`dateLinkRendering.test.js` renders the exact planned output through the shared
printable renderer used by PDF Preview/export, while the editor component checks
both live link widgets. Existing wikilink preview/PDF browser coverage remains
the renderer/workflow boundary; no separate export workflow is added here.
`internal/taskschedule/transitions_test.go`
proves note-write rollback and metadata failure refusing note writes.
Root-scoped tests prove metadata-only Board/Gantt deadlines never rewrite Markdown, source preconditions,
corrupt-config refusal, and joined Calendar/Board/Today projections. Component
tests own the picker's default Today selection, injected live month activity,
focus and Arrow-key movement, card controls, warning states,
Today reminders, the column header's neutral-icon/selected-color indicator,
Calendar task results, cache invalidation, locale weekday/weekend rendering,
first-open Today and same-session reopen selection, movable Today/selection precedence with restored note intensity, accepted-shortcut dirty-buffer projection,
count-to-selected-row agreement, due-title hover/focus content, prose hashtag completion,
metadata scheduling with `@date`, generic **Choose date / Date shortcuts / Clear
date** naming, and frontmatter/code suppression. The live Kanban component must also prove that a
dirty new tag appears on the board without entering the saved completion
vocabulary until save. Keep these in
`kanban_due_test.go`, `app_test.go`, `calendar_index_test.go`,
`tests/frontend/unit/dueDateModel.test.js`,
`tests/frontend/unit/calendarModel.test.js`,
`tests/frontend/unit/taskDueDateCompletionModel.test.js`,
`tests/frontend/unit/taskDueDateCompletions.test.js`,
`tests/frontend/unit/datePicker.test.js`,
`tests/frontend/unit/dateShortcutEditor.test.js`,
`tests/frontend/unit/authoringMacroModel.test.js`,
`tests/frontend/unit/authoringMacroCompletions.test.js`,
`tests/frontend/unit/authoringMacroEditor.test.js`,
`tests/frontend/unit/createDrawioImage.test.js`, `tests/frontend/unit/kanban.test.js`,
`tests/frontend/unit/home.test.js`, and
`tests/frontend/unit/calendarCache.test.js`. The static discoverability
contract belongs in `tests/frontend/unit/markdownCheatsheet.test.js`: it keeps
ordinary Markdown free of Figaro semantic rows, inventories every supported
relative-date, Calendar-link, structured editor, sibling-Draw.io, task-list,
Kanban-column, and due-date macro, inventories
the application shortcuts, and proves the three-topic tablist's
selected/tabbable/panel state plus click, arrow, F1, and Escape behavior with
invoker-focus restoration. Its shortcut inventory must include the sequential
Escape-then-Tab/Shift+Tab route for leaving the document editor without removing
the normal indentation bindings. `helpSearchModel.test.js` owns query
normalization and ranking; the same Help DOM test proves that syntax results
jump to reference rows and Settings results dispatch only a deep-link request.
`settingsNavigation.test.js` owns opening, scrolling, exact-control focus, and
the temporary section highlight without assigning command execution to Help.
One focused browser workflow in `tests/e2e/editorUX.spec.js` covers the normal
prose/task distinction, keyboard acceptance, computed caret-relative picker
position, exact computed weekday/day-state parity between the picker
and Calendar workspace, source-line round trip, Arrow Up/Down, and drag selection. Pure
parsing and backend mutation branches do not belong in Playwright. That test
waits for the initial Kanban refresh before replacing completion columns and
uses a two-second `Promise.race` timeout; a stalled setup must fail explicitly
instead of hanging or allowing startup to overwrite the fixture state.
The Calendar's browser-only boundaries are its body-level shared activity tooltip and
computed central grid geometry: `tests/e2e/sidebarNavigation.spec.js` hovers a day with
multiple due items, asserts that the themed tooltip remains inside the real
viewport, proves the common due-task/linked-note details fit above the tool
footer at 1440x900, then switches from a long result list to an empty day and
proves the month grid does not move. Locale week rules, grid offsets, buffer association
replacement, note-count buckets, accessible labels, and tooltip content remain
lower-layer tests.

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

## PDF page-number and contents regressions

Keep the opt-in property, legacy unnumbered markup, fixed-width TOC cells,
source maps, and starter-version hooks in frontend renderer tests. The desktop
use-case test injects render/resolve/inject/write ports and must prove ordinary
exports stay one-pass, numbered contents use exactly two passes in the same
supplied session, and destination drift blocks publication. Root-scoped tests
prove **Upgrade copy** preserves its source and occupied targets. The pdfcpu
adapter owns actual internal-link destination resolution.

The opt-in real Chromium test is the one browser-only boundary: it verifies
CSS page-margin output, an unnumbered cover that still counts as physical page
1, numbered following pages, and link annotations. Set
`FIGARO_PDF_TEST_OUTPUT=/tmp/pdfs/figaro-page-number-contract.pdf` to retain the
otherwise temporary PDF for `pdfinfo`, `pdftotext`, and `pdftoppm` inspection.

## PDF browser discovery and Snap confinement regressions

Keep Linux browser discovery deterministic by injecting the `/snap/bin`
directory listing, filesystem lookup, and DevTools validator. The focused Go
contract must prove that unsupported Snap commands are ignored, browser-engine
priority is preserved, and a `/snap/bin/<snap>[.<app>]` command maps only to an
ephemeral workspace below `$HOME/snap/<snap>/common/figaro`. Path validation
must reject traversal and malformed Snap names.

For a workstation with Snap Chromium installed, run both opt-in boundaries.
The first exercises automatic discovery plus an actual isolated DevTools
startup; the second writes printable HTML, its browser profile, and the PDF to
the confinement-visible workspace and asserts page-margin support, an
unnumbered cover, physical destination pages, and internal/external link
annotations:

```bash
go test ./internal/pdfexport \
  -run 'Test(FindBrowserScansSnapBin|SnapBrowser)'
FIGARO_BROWSER_PDF_DISCOVERY_INTEGRATION=1 \
  go test -v ./internal/pdfexport -run '^TestFindBrowserAgainstOptInSystem$'
FIGARO_BROWSER_PDF_EXECUTABLE=/snap/bin/chromium \
FIGARO_PDF_TEST_OUTPUT=/tmp/pdfs/figaro-page-number-contract.pdf \
  go test -v ./internal/pdfexport -run '^TestRenderChromiumPDFAgainstOptInBrowser$'
```

## Raw text preview and heading-link regressions

Raw Text Preview is an exact source surface, not a renderer or print-preview
shortcut. Keep unit coverage for frontmatter, HTML, fences, an explicitly empty
document, active/saved document refresh, clipboard success/failure, pure
source-anchor clamping, delayed editor-to-raw scroll following, listener
cleanup, and closing. The browser workflow must open it from a Markdown context
menu, assert exact text plus deliberate source geometry, copy the complete live
snapshot through the visible action, follow main-editor scrolling down and back
up, and close it by keyboard. Current-note heading completion must ignore frontmatter and fenced
examples, preserve duplicate anchor suffixes, and accept a keyboard selection
after typing `](#`.

`editorPreviewLaunchers.test.js` owns Markdown/document visibility, injected
Raw/PDF dispatch, mutual open state, busy re-entry, and disposal. The focused
Outline browser scenario owns the actual three-button rail geometry, themed
tooltip adoption, accessible expanded state, and click-to-open/click-to-close
behavior for both preview modes. At an 800px viewport with the navigation pane
expanded, that same scenario opens Raw and PDF Preview and asserts the pure
presentation plan selects the existing overlay placement, the editor retains at
least its 320px layout floor, at least 180px remains visibly exposed, and no
root horizontal overflow appears. Widening the same viewport must return the
pane to docked placement; no duplicate preview workflow is added.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/rawTextPreview.test.js \
  tests/frontend/unit/rawTextPreviewModel.test.js \
  tests/frontend/unit/linkCompletions.test.js
npx playwright test \
  tests/e2e/rawTextPreview.spec.js \
  tests/e2e/headingLinkCompletions.spec.js
```

## Windows keyboard-layout regressions

Figaro must not infer text from Windows physical key codes or replace native
WebView2 dead-key composition. The focused component regression spoofs Windows
and verifies that an ordinary backtick, `AltGr+4` dead key, and another reported
dead key are not consumed in either regular editing or Vim Insert mode. The
real-browser regression supplies browser text, requires one backtick per input
and exactly three for a Markdown fence, accepts already-composed Unicode such
as `ã`, and keeps Arrow Up/Down working across the resulting fence.

The dependency contract pins the application to Wails v2.14 and replaces its
runtime module with `github.com/grilo/wails/v2` tag `v2.14.0-figaro.1`. That
fork carries the native regression which distinguishes AltGr's Ctrl+Right-Alt
state from ordinary Left-Alt accelerators. The official v2.14 CLI remains the
build driver; its application build consumes the replacement declared by
Figaro's `go.mod`.

Synthetic Chromium events cannot activate the operating system's Spanish
layout. Before a Windows release, repeat the irreducible packaged WebView2
check with a Spanish keyboard in both regular editing and Vim Insert mode:
press the ordinary backtick key once and require one backtick without Space;
press it three times and require one three-character fence; then press
`AltGr+4` followed by `a` and `o` and require `ã` and `õ`. Also check native
acute and diaeresis composition, cancellation, and surrounding cursor motion.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/editor.test.js
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

Stable source-footprint changes additionally require the pure policy, each
included widget provider, the exclusion allowlist, and real computed geometry.
The browser case keeps code, display math, a Mermaid diagram, and a rendered
GFM table preview together; it proves a long wrapped fence expands past its
logical-line fallback, reveals code/math/diagram source, and
requires the following line to remain fixed, crosses each graphic block with
Arrow Up/Down, checks mouse placement around display math, and drags across the
group in both directions. It also proves rendered code has visible line numbers
but no visible fence rows, and that a native scrollbar track press leaves the
preview mounted with the root caret unchanged. The same browser boundary sends
vertical wheel input over a real horizontal-only scrollbar, then a deliberately
constrained vertical preview: the document moves immediately in the first case;
the preview moves first in the second; and continued input at both vertical
limits moves the document without changing the root selection. Table-specific Arrow, Tab, Shift+Tab, Enter, mouse,
drag, and Vim coverage remains in the table matrix below. PDF tests remain
unchanged because the policy is scoped to `.cm-*` editor roots. The unit policy also
proves an ordinary selection transaction does not request a document-wide
remeasure; mounted-root measurements are cached until source or geometry
changes.

The border-budget regression stays at the lowest meaningful boundaries:
`blockWidgetLayout.test.js` asserts borderless 8px-rounded code plus the shared
borderless, rounded Properties surface in collapsed and expanded states while
preserving table, field, and internal section structure. The existing folding
browser scenario checks computed code borders, rounded corners, line-number
separators, and quiet/revealed copy states; the Properties scenario compares
both panel states with the code-surface token and checks the approved checkbox's
rest, checked, focus, and source-update behavior. `designSystemCatalog.test.js` separately registers
the quiet field modifier and proves the sidebar's borderless Search, Quick Note,
and selected-row rules retain focus, validation, tonal surface, weight, and
semantic state cues. It also compares the production and catalogue `PanelLeft`
sidebar glyphs with the distinct `ListTree` document-outline glyphs.
`search.test.js` proves the result-count badge is hidden initially, through
loading and zero matches, and after outside dismissal or Escape, while a
non-empty open result set reveals the exact count. The existing Quick Note browser scenario checks Search and
capture rest/hover/focus paint, while `figaroThemes.spec.js` checks the computed
borderless controls and stripe-free selected row in Dark, Light, and CRT.

Missing images have a narrower continuity contract outside the generalized
source-footprint allowlist. `blockWidgetLayout.test.js` proves their semantic
theme tokens, reduced-motion spinner rule, and one-line measured height;
`clipboardImagePaste.spec.js` forces an actual image 404, compares its computed
error treatment across contrasting themes, enters and leaves the source while
measuring the following line, crosses the widget with Arrow Up/Down, and drags
a selection across its Markdown range.

Successfully loaded resizable images use a separate geometry contract. Pure
`markdownImageModel.test.js` cases own hint parsing/serialization, intrinsic
fit, minimum dimensions, right-edge width capping, first-edge proportional
capping, and the ten-times-intrinsic vertical limit. CodeMirror component
coverage owns the accessible three-handle structure, tooltip lifecycle,
source-only reset, and Arrow Up/Down traversal. The existing focused image
browser workflow must use real pointer capture to prove a handle keeps the
image rendered while previewing its final geometry, its 28px hit area and centered live
readout, right/bottom computed edge constraints, original-size guide action,
geometry-matched source placeholder, following-line stability, mouse source
reveal, and bidirectional cursor/selection behavior. Printable renderer tests
must prove the same hint becomes standard width/height attributes and exact
inline geometry without contaminating alt text; PDF Preview and export continue
through the consolidated clipboard-image browser workflow.

The CodeMirror component must dispatch at least two pointer moves in one resize
gesture, assert the frame/readout change while source remains exact, then prove
pointer release writes the final hint once, one Undo restores the pre-gesture
source, and one Redo restores the final hint. A subsequent completed resize
must increment history depth independently and Undo only to the preceding
gesture. Pointer cancellation must restore the starting frame, preserve source,
and add no history item; a press/release without geometry movement must likewise
leave source and history untouched.

Mermaid virtualization has a separate performance contract. The pure
`diagramRenderCacheModel.test.js` suite covers normalized source keys and SVG
id rebasing, `diagramRenderQueue.test.js` covers serialized work and
cancellation, and `diagramRenderer.test.js` covers cached and concurrent
same-source renders. The browser regression in
`tests/e2e/vimVisualRows.spec.js` scrolls through a long note with repeated
Mermaid fences in both directions, verifies that the engine renders the
repeated source once, and checks that mounted SVG ids remain unique.

`mermaidDiagramModel.test.js` separately owns default/minimum/maximum height,
portable directive replacement, duplicate cleanup, and source-order retention.
`liveDiagramPlugin.test.js` proves the shared lower-edge handle changes only mounted
height during pointer movement, commits one transaction on release, and keeps
the same footprint when source is revealed. `blockWidgetLayout.test.js` guards
the feature selector that overrides the later-loaded primitive positioning.
`mermaidEditor.spec.js` is the one real-browser geometry check for full-width
rendering, an uninterrupted hover path to the canvas-edge handle, pointer
capture, one-step Undo, Arrow Up/Down across the widget, mouse placement, and drag selection.
`export.test.js` owns the matching printable height.
The consolidated source-footprint browser case performs its forward and reverse
drag while the pointer remains held and the editor scrolls between endpoints;
the 300px Mermaid default can legitimately place those endpoints outside one
viewport, so cached off-screen coordinates are not a valid input boundary.
Calendar startup fixtures must pin browser time to the month represented by
their mocked native response. Geometry-only checks of animated overflow fades
use reduced motion so assertions observe the settled themed state rather than
an arbitrary interpolation frame.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/sourceFootprintModel.test.js \
  tests/frontend/unit/liveDiagramPlugin.test.js \
  tests/frontend/unit/mathPlugin.test.js \
  tests/frontend/unit/codeBlockInteraction.test.js \
  tests/frontend/unit/markdownTables.test.js \
  tests/frontend/unit/blockWidgetLayout.test.js
npx playwright test tests/e2e/editorUX.spec.js \
  --grep "keeps rendered block source footprints stable"
```

The Properties picker adds a browser-only paint, movement-intent, and pointer
boundary to that contract. `frontmatterPresentationModel.test.js` proves that
ordinary selection jumps retain the card while upward intent reveals it;
`blockWidgetLayout.test.js` owns its explicit widget paint layer and the
cleared entrance transform. `frontmatter.test.js` proves that the pure initial
selection plan uses the exact closed-frontmatter body boundary, including BOM
and CRLF input, while rejecting incomplete or non-leading blocks.
`tabManager.test.js` proves that an unpositioned Markdown mount receives that
selection, remembered and explicit line positions win, and non-Markdown modes
bypass the policy; `editor.test.js` verifies that the resolved offset becomes
the real CodeMirror anchor/head while the Properties card stays rendered.
`frontmatterProperties.spec.js` opens a
language option whose center extends below the card, verifies that option is
the topmost hit target, hovers and activates it, and confirms the document
selection remains on its original body line. It verifies that **Edit YAML**
uses the approved quiet button and file-code glyph, has transparent border and
surface plus muted text at rest, and restores tonal hover paint and the shared
keyboard-focus halo. It also proves Home/document
start and Vim `gg` preserve Properties, Arrow Up / Vim `k` reveal raw YAML,
Arrow Down exits it, and bidirectional mouse selection leaves the replacement
rendered. Keep this focused regression when
changing frontmatter animation, block-widget stacking, picker positioning, or
CodeMirror line positioning:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/blockWidgetLayout.test.js \
  tests/frontend/unit/frontmatterPresentationModel.test.js \
  tests/frontend/unit/frontmatter.test.js \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/editor.test.js
npx playwright test tests/e2e/frontmatterProperties.spec.js
```

Every change to vertical cursor movement or its keymaps must also prove the
document-edge contract in both directions. The pure boundary cases belong in
`verticalCursorModel.test.js`; the CodeMirror adapter must prove Arrow Down at
the final position and Arrow Up at the first position remain there, including
an engine result that attempts to move in the wrong direction. It must also
prove that a no-op result and a multi-line skip fall back to exactly one
adjacent source line, for both the ordinary Arrow adapter and Vim's visual-row
motion. An injected backwards Vim geometry result must retain the exact cursor
position. The focused browser checks must cover the real viewport at both
scroll limits and exact first/last Vim positions for `j`/`k` plus Up/Down with
both source-line and visual-row movement:

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
23, `### Text formatting`; Arrow Up must move to line 22, and Arrow Down must
return to line 23. Also navigate across each newly added widget from above and
below, and verify mouse placement and drag selection around it. For a vertical
navigation change, also put the cursor and viewport at the end and press Arrow
Down, then put both at the beginning and press Arrow Up; neither action may
move or wrap, and wheel input must remain at the corresponding scroll limit.

The shared tab-size contract is split across the lowest capable layers.
`tabSizeModel.test.js` owns the four-space default, whole-number 2–8 bounds,
stepping, spaces-only indent units, and literal-tab column stops. Go settings
tests own normalization, invalid-write rejection, and persistence across a
fresh application instance. `tabSizePreference.test.js` owns the editable
`− number +` control, boundary states, immediate application, serialized save,
and failed-save rollback. CodeMirror component tests prove the root Markdown
and code facets, normal indentation, Vim `>`, Mermaid inheritance, the nested
rendered GFM table source, wrapped list/quote alignment, and rendered-code/source-
footprint CSS. `tabSize.spec.js` is the single browser boundary: it changes the
real Settings control and checks normal Tab plus Vim `>` in a revealed fence,
source-code mode, revealed table source, and the focused Mermaid editor. It also
checks Arrow Up/Down across the changed fence. Existing rendered-block and
table browser matrices retain mouse placement and bidirectional drag coverage.
The setting touches only the mounted editor and visible widgets; it never walks
the vault or adds work to search/index updates.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/tabSizeModel.test.js \
  tests/frontend/unit/tabSizePreference.test.js \
  tests/frontend/unit/codeEditorMode.test.js \
  tests/frontend/unit/mermaidEditor.test.js \
  tests/frontend/unit/codeMirrorProfiles.test.js
go test ./internal/settings ./internal/desktop -run 'Test(TabSize|Normalize)'
npx playwright test tests/e2e/tabSize.spec.js
```

Editor text scale uses a separate persistence and geometry contract.
`editorTextScaleModel.test.js` owns normalization, wheel direction,
high-resolution accumulation, bounds, and status copy;
`editorTextScale.test.js` owns the permanent local default, temporary buffer
override, stable line-height ratio, pointer-anchor adapter, and accessible
status rendering. Tab-manager tests prove different open files retain different
temporary values, the reset uses the current Settings default, a permanent
Settings change clears overrides, closing a buffer discards its scale, and
session serialization omits it. The focused `editorUX.spec.js` browser case
changes the real Settings default, performs Ctrl+wheel reflow, verifies the
wheel's source position remains fixed, moves with Arrow Up/Down, places the
mouse, drags selections in both directions, switches buffers, and activates
the status reset. Repeat that geometry check in packaged WebKitGTK, WebView2,
and WKWebView builds because Chromium cannot prove native webview metrics.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/editorTextScaleModel.test.js \
  tests/frontend/unit/editorTextScale.test.js \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/sessionModel.test.js
npx playwright test tests/e2e/editorUX.spec.js --grep 'Ctrl\+wheel text scale'
```

Markdown block guides add their own focused matrix. Pure coverage must prove
that only headings, fenced code, tables, and standalone images receive guides;
ordinary images expose `image` plus the size-dependent **original size** action,
while local Draw.io images retain `drawio`/`editor`; typed fences use a
bounded normalized language label; untyped fences use `code`; frontmatter and
every omitted block stay quiet; and parent/child/peer heading plus fence/table
ranges remain exact. `blockControlVisibilityModel.test.js` separately proves
the rendered-block-to-rail activation rectangle, the narrower heading lane,
and folded/focus/caret overrides. The real CodeMirror component must exercise editor-sized,
typed, accessible collapse/expand controls, disabling and re-enabling the
gutter, and show that folding never edits source. The browser boundary must
compare guide and editor font sizes; prove an expanded non-heading guide is
transparent and non-hit-testable at rest; hover its rendered block, cross the
complete approach corridor in pointer steps, and activate the still-visible
control; prove the folded replacement remains visible and operable; click a nested fold; move across it with
Arrow Up/Down and Vim visual-row `j`/`k`, place the mouse on the adjacent line,
and drag a selection across the folded source in both directions. For both a
typed and untyped fence and for a rendered GFM table preview, it must also prove that
the rendered widget disappears, one native fold row replaces it, the next
visible content has no stale widget-sized gap, expansion restores the widget,
and source stays exact. Measure each guide against the top of its source line
or block widget. At a viewport wider than the configured writing width, measure
the source line and the Mermaid control stack: `mermaid` and `editor` must be
right-aligned just outside the source edge, with `editor` directly beneath the
fold control. Compare computed font family, size, weight, line height, text
transformation, control height, and right edge across both controls. Assert that
there is no right action gutter and that the Mermaid wrapper does not reserve an
action lane. Fold and expand an H1 containing that wider guide and assert that
the before-gutter width, helper-rail width, content left edge, and source-line left
edge remain unchanged. A
Draw.io component case must exercise the `drawio` / `editor` stack, direct
editor callback, whole-image folding and expansion, unchanged Markdown, and
Arrow Up/Down traversal in both directions. The browser image boundary must
also open the actual Draw.io tab from `editor`, then delete the referenced path
signal and prove that the preview disappears despite a previous successful
image load.
rendered Mermaid block must yield its replacement to
the native fold placeholder when its left guide is activated, retain Arrow
Up/Down, mouse placement, and drag selection across that row, and restore the
live diagram on expansion when the cursor is outside its source. Collapse and
expand a middle block by clicking the same fixed
screen coordinate, then repeat with the final block while scrolled to the
document end; the guide must remain fixed and any trailing anchor reserve must
disappear once natural content height can support the scroll offset. A
fold-state or ARIA-only assertion is not sufficient. In a native WebKitGTK,
WebView2, and WKWebView build, repeat those cursor and drag checks with both
line numbers off and on.

The Mermaid Editor extends that matrix without creating a new block widget.
Pure tests cover the complete 32-type/76-template catalogue, all adaptive Style
descriptors, color/contrast derivation, conservative frontmatter merging and
refusal (including overriding init directives), exact/custom theme reconstruction,
parsed-node projection and membership validation, native/class fill restoration,
palette cardinality, short/repeating XY palette expansion, native style-section
round trips, parser-location
diagnostics, whitespace-only empty-state policy, adaptive render delay, exact
fence-body replacement, raw Markdown fence discovery/document-offset mapping,
and pointer-centered bounded zoom/pan transforms. A use-case test injects the
Mermaid validation boundary and proves valid fences stay quiet while parser
failures combine with the existing Markdown checks.
Use-case tests prove debounce, latest-only inspection publication, serialized
rendering, and last-known-good preservation. Adapter tests snapshot Mermaid's
mutable vertices/classes/config without leaking references, prevent renders
from interleaving inspection, and recover the engine queue after errors.
The CodeMirror component proves the action is
present in raw and rendered states, skips non-Mermaid fences, keeps chart
browsing live for empty/template-backed buffers while protecting existing or
manually edited source, and makes Apply one undoable root transaction while
Cancel dispatches nothing. Component tests prove Source/Style switching,
type-specific panel replacement, Kanban palette reuse, invalid-source
suppression, selected-node controls preceding a long bounded list, roving
Arrow/Home/End node selection, style-control focus restoration, palette survival
across preview statuses, reset swatch synchronization, explicit node-editing instructions, and one
native source update per style choice. A DOM-adapter test
covers keyboard preview navigation, rendered-node selection versus drag
panning, and source-free transforms, while the shared combobox test proves dynamic
option refresh. One browser workflow owns the irreducible focus, compact
left-aligned linked pickers, ordinary disabled cursor, real wheel zoom and drag
panning, explicit SVG dimension growth without a scaled canvas, two-axis SVG
fitting, larger preview-pane growth up to the bounded dialog and narrow
stacking without footer clipping (including short windows), left-rail control alignment, first-success empty-state
removal, real Mermaid SVG node-id selection, applied node fill, Style-panel
overflow, long-list containment, selected-editor visibility on first opening
and after preview selection, focus after shape/color changes, palette Escape
and preview-refresh survival, non-checkbox node swatches, rendered-diagram collapse/expand, lint tooltip/SVG, stale-preview,
borderless gutter, and undo boundaries; a focused companion verifies inherited Vim mode
and wrapped display-row motion after the first diagnostics transaction, while
`tests/e2e/mermaidRenderer.spec.js` replaces the former parser-only loop with
the real SVG boundary: all 32 types/76 templates render, with 304 additional
Document/Neutral/Accent/dark preset renders. Every offered color must visibly
paint a geometry/text mark in a representative bundled example; conditional
targets such as notes or activations are checked across that type's examples.
The test attaches its per-type/target matrix, and checks parser identities
against rendered node counts for chains, standalone nodes, icon labels, and
native/class fills. This remains one renderer-boundary test, not an end-to-end
dialog workflow per diagram. Pure source transformations stay in unit tests.

The interactive-table browser contract also owns the shared helper-rail action
placement boundary. It must prove that `editor`, `chart`, and `delete` remain in
that order beneath `table`, stay
outside the grid on every sampled frame while Document Outline changes editor
width, moves above the grid rather than beneath the sidebar when the measured
left margin is too narrow, adopts destructive styling only on hover/focus, and
still deletes and undoes through one normal table transaction.
The existing diagram cursor/drag browser scenario remains the geometry oracle.

The table-backed Vega-Lite Chart Editor has one focused cross-layer contract.
Pure model tests own table validation and type inference, retained hidden-column
settings, mark/orientation/stack policy, one shared scale per primary/opposite
axis, the complete visible-series legend domain and four-side legend position,
safe recognition and upgrade of the earlier managed legend shape, threshold
placement without axis ownership, upgrade of the earlier axis-suppressing
threshold shape, hidden authored-row linear-regression predictors and legacy
category-predictor upgrades, Pie normalization,
exact authored category order through explicit `sort: null` encodings for
vertical/horizontal Cartesian axes, trendline lookups, and Pie color domains,
first-column Cartesian ownership even for numeric-first tables, all-column
Pie/Waterfall category selection, independent numeric-value
selection, Waterfall running totals, exact table metadata, canonical foreign-JSON
detection, and height clamping. Component tests own the approved modal
structure and names, mode visibility, preview/error states, non-destructive
Cancel, the absence of a redundant Cartesian Category control, all category
options in both special-mode comboboxes, stale-source protection, the fixed
first-column category row, shared Kanban palette selection,
square series/guide color triggers, disabled-trendline tooltip content, the
compact editable threshold stepper, direct segmented series and threshold axis
choices, one-row Mode/Orientation and threshold-control placement, shared
Top/Right/Bottom/Left legend choices, eye/eye-off visibility buttons, borderless
preview chrome, removed instructional hints, column-only separators, and one
root Apply transaction. The shared palette
component contract separately owns listbox selection state, automatic-option
policy, focus restoration, Escape, and fixed-menu viewport clamping. Diagram and
source-footprint component tests own delayed resize serialization, pointer
cancel, tooltip lifecycle, the non-wrapping equal-height source placeholder,
one Undo step, the temporary connected container-width render surface and its
cleanup, theme configuration, and rejection of zero-geometry SVG output.
Component coverage injects both an engine error and a mapping with no visible
number series, then asserts the themed live alert and disabled Apply action;
`latestPreviewSession.test.js` proves one renderer can be in flight, intermediate
requests collapse into the newest pending configuration, stale failures never
publish, and disposal suppresses late completion. The Chart Editor component
drives three rapid choices against deferred engine promises and proves only the
initial plus final specifications render.
Combobox coverage owns its approved structure, keyboard operation, and
modal-preserving Escape behavior. Its pure floating-menu placement coverage
owns above/below selection and viewport clamping; the component adapter test
owns applying and clearing that geometry. The printable renderer gets one managed
chart to prove that the existing
Vega-Lite-to-SVG path preserves authored height in Preview/export.

Only one browser workflow is needed for irreducible geometry and engine
behavior. It converts a real rendered three-column table, renders Cartesian,
Pie, and Waterfall with the bundled Vega-Lite engine, proves that the approved
combobox opens a themed listbox without dismissing the modal, the preview and
axis text inherit the active Figaro appearance, the preview pane is at least
1.5 times the configuration width, and the SVG is vertically centered. It
also checks default and narrow-pane control rectangles for overlap and
horizontal overflow, proves mark and trendline labels do not wrap, color
triggers remain square, the four threshold controls stay in one row, section and
preview borders are absent, and the disabled trendline explanation is visibly
rendered above the modal and inside the viewport when the complete plain label
is hovered or clicked. It enables a trendline over nominal first-column labels
and requires a non-empty dashed SVG path, then proves the stacked-mark blocker.
It also proves the first column remains the Cartesian category and has no
category combobox. The real SVG contains all mixed-mark
series, moves their shared legend from right to bottom, and updates that legend
when an eye button hides and restores a later column. Enabling a threshold on
Primary and Opposite preserves every axis title in both chart orientations.
Both combobox and
palette listboxes stay within viewport bounds. It then compares one explicit
data paint plus the themed backing surface before and after Apply,
drags the actual lower-canvas-edge handle while source remains unchanged until release,
undoes that single resize, compares rendered/source document coordinates,
checks Arrow Up/Down plus mouse placement and bidirectional drag selection, and
confirms exact chart-to-table conversion and Undo. Repeat its cursor, pointer,
and source-reveal checks in the packaged WebKitGTK/WebView2/WKWebView smoke;
Chromium cannot prove native webview geometry.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/editorBlockActionLayoutModel.test.js \
  tests/frontend/unit/mermaidEditorModel.test.js \
  tests/frontend/unit/mermaidStyleEditorModel.test.js \
  tests/frontend/unit/mermaidPreviewSession.test.js \
  tests/frontend/unit/mermaidEditorGuide.test.js \
  tests/frontend/unit/mermaidEditor.test.js \
  tests/frontend/unit/mermaidPreviewNavigation.test.js \
  tests/frontend/unit/mermaidLintModel.test.js \
  tests/frontend/unit/markdownDocumentLint.test.js \
  tests/frontend/unit/selectCombobox.test.js \
  tests/frontend/unit/diagramRenderCacheModel.test.js \
  tests/frontend/unit/diagramRenderQueue.test.js \
  tests/frontend/unit/diagramRenderer.test.js
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/colorPalettePicker.test.js \
  tests/frontend/unit/floatingMenuModel.test.js \
  tests/frontend/unit/vegaLiteChartEditorModel.test.js \
  tests/frontend/unit/vegaLiteChartEditor.test.js \
  tests/frontend/unit/vegaLiteChartEditorGuide.test.js \
  tests/frontend/unit/liveDiagramPlugin.test.js \
  tests/frontend/unit/sourceFootprintModel.test.js \
  tests/frontend/unit/blockWidgetLayout.test.js \
  tests/frontend/unit/export.test.js
npx playwright test \
  tests/e2e/mermaidEditor.spec.js \
  tests/e2e/mermaidRenderer.spec.js
npx playwright test tests/e2e/editorUX.spec.js --grep "math and diagram previews cursor-safe"
npx playwright test tests/e2e/vegaLiteChartEditor.spec.js
npx playwright test tests/e2e/vimVisualRows.spec.js --grep "reuses Mermaid rendering"
```

In the packaged WebKitGTK/WebView2/WKWebView smoke, open the Mermaid Editor from
both a rendered block and revealed source, traverse chart types with arrows,
hover one invalid range, Cancel, then Apply and undo. Also verify
the Style panel's initial node inspector, chained/standalone nodes, native/class
fill reset, control focus after shape/color edits, palette Escape/cleanup,
and compact-pane containment above the footer. With Vim enabled, verify
Insert/Escape, Visual mode, and the configured wrapped-row `j`/`k` behavior in
the temporary editor. Repeat Arrow Up/Down plus
forward/reverse drag selection immediately around the block with line numbers
off and on; the left control stack must not change any landing position or selection.
At a narrow window width, place wrapped prose before a visible Mermaid block,
open and close Document Outline, and sample both helper buttons, the measured
wrapper, and diagram rectangles throughout both width animations. The stack
must remain at the same wrapper-relative offset just outside the writing edge
and never intersect the diagram on any frame.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/markdownHeadingFolding.test.js \
  tests/frontend/unit/markdownBlockGuides.test.js \
  tests/frontend/unit/editorBlockActionLayoutModel.test.js \
  tests/frontend/unit/codeBlockInteraction.test.js \
  tests/frontend/unit/codeEditorMode.test.js \
  tests/frontend/unit/editor.test.js
npx playwright test tests/e2e/editorUX.spec.js --grep "folds nested Markdown block guides"
```

Rendered GFM tables add a source-reveal cursor matrix. Unit and CodeMirror
component tests must prove that CodeMirror's Markdown parser identifies the
table, that an unfocused range becomes one semantic `.cm-live-table`, and that
selecting or moving into the range reveals byte-exact source without a nested
replacement-widget editor. Exercise Arrow Up/Down, Vim motions, mouse
placement, and bidirectional drag selection at the source range's edges;
ordinary history, search, prompts, and paste remain root-editor behavior. The
rendered surface must preserve inline GFM formatting and alignment, compact
full-width density, `<br>` outside code spans, anchored bare `^` vertical
merges, and editor-authored rectangular merges in both live and printable
output.

The pure `tablePreviewInteractionModel.test.js` event-policy matrix owns
wheel/touch, surface/scrollbar, and cell-content pointer ownership.
`markdownTableEditing.test.js` owns exact row/cell parsing, escaped-pipe
preservation, and rendered-cell-to-source offsets.
`markdownTableEditorModel.test.js` owns draft serialization, ordinary focus
versus held range selection, merge/split caching, metadata stripping, and
span-aware row/column guards. `markdownTableEditor.test.js` owns the two-row
labelled-icon toolbar, grouped danger actions, accessible cell names, ordinary
native pointer ownership, Shift-click/Shift-drag selection, contextual
disabled tooltips, read-only source, local history, one Apply dispatch, and
dirty Escape confirmation.
`markdownTableEditorGuide.test.js` owns the three-action guide and complete
table-plus-metadata deletion. `markdownTables.test.js` covers the semantic DOM
adapter, exact source reveal, rectangular rendering, and the absence of legacy
table commands from the ordinary right-click menu.

The browser workflow creates an overflowing grid, proves real wheel and native
scrollbar interaction leave the root selection intact, clicks a rendered cell,
and exercises Arrow Down/Up around revealed source. It also opens the modal,
proves an ordinary click retains native textarea caret placement without a
cell-range announcement, uses a real Shift-drag for Merge/Split, checks the header
tint and read-only source, applies one transaction, and undoes it once through
root CodeMirror history. Native track paging is platform-owned and may not
advance from synthetic Chromium input. Packaged WebKitGTK, WebView2, and
WKWebView checks remain required after changes to table/source cursor geometry.
There is no third-party table-editor module to map or vendor.

Conventional formatting belongs below the browser boundary.
`markdownInlineFormatting.test.js` owns marker toggle, inline-code delimiter,
link-caret, and empty-selection plans; `markdownFormattingEditor.test.js`
dispatches all five real CodeMirror chords, proves one Undo, and repeats Arrow
Up/Down plus selection across the formatted line. The pure global-shortcut
test proves unshifted Ctrl/Cmd+B remains available to Bold while
Ctrl/Cmd+Shift+B owns the sidebar. The help-popup component test must list the
same bindings. No Playwright scenario is needed for these deterministic keymap
transactions.

For tab or workspace-view work, retain a browser regression that places a
nonzero file selection, opens and closes Settings, and verifies the exact
anchor/head pair plus the file tab's saved cursor state. Unit coverage must
also assert that the portable session serializes the current per-file range.

Table conversion retains focused component coverage: selection conversion
previews delimiter/header changes and cancels without editing, invalid input
exposes its validation message with an ordinary disabled (not busy)
confirmation, and one valid confirmation produces one undoable transaction.
Keyboard paste and the editor's existing Paste menu must convert clear
Excel/LibreOffice HTML tables, explicit TSV, and explicit comma- or
semicolon-separated CSV. Plain tab, pipe, comma, or semicolon text must pass
through with fewer than three rows and convert only when at least three rows
have the same rectangular shape. Quoted delimiters, escaped quotes, European
decimal commas, ragged rows, and equally plausible comma/semicolon dialects
belong to the pure parser matrix. Existing GFM must retain its separator and
alignment while gaining safe block boundaries so adjacent prose cannot become
a table row. Keep pure parsing and clipboard-event coverage in
`tests/frontend/unit/markdownTableConversion.test.js`, dialog behavior in
`tests/frontend/unit/dialogs.test.js`, editor menu/cursor/mouse behavior in
`tests/frontend/unit/markdownTables.test.js`, and only real layout plus
printable-browser boundaries in `tests/e2e/markdownTables.spec.js`.

## Smart rich paste regressions

Keep the conversion and priority matrix below the browser layer. Pure tests in
`richPasteModel.test.js` own semantic-evidence limits, paste precedence, safe
block insertion, variable-length code fences, and AI math/fence transforms.
`richPaste.test.js` owns inert parsing, semantic Markdown output, presentation-
only fallback, inline-only cells, rich tables, AI code shapes, unsafe markup,
remote-image alt text, and the bounded 100 KB conversion check.
`clipboardPaste.test.js` owns internal provenance, exact protected/plain
fallback, image/table precedence, context-menu parity, and one dispatch.
Conversion has no vault/index dependency, so vault size cannot change its cost;
profile clipboard HTML size and element count instead of using the huge-vault
fixture for this feature.

The single browser boundary in `richPaste.spec.js` must use real copy/paste
`ClipboardEvent` objects and the Async Clipboard menu path. It covers one-Undo
replacement, Ctrl/Cmd+Shift+V, protected fenced source, Vim Visual mode, a
revealed table source range, Arrow Up/Down, and bidirectional pointer drag selection.
Do not duplicate the pure failure matrix in Playwright.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/richPasteModel.test.js \
  tests/frontend/unit/richPaste.test.js \
  tests/frontend/unit/clipboardPaste.test.js \
  tests/frontend/unit/markdownTableConversion.test.js \
  tests/frontend/unit/editor.test.js
npx playwright test tests/e2e/richPaste.spec.js
```

On each native platform, paste from at least one browser/document editor and
one AI chat into ordinary prose, a Vim Visual selection, fenced code, and an
revealed table source. Repeat with the editor Paste menu and plain-text chord,
then verify one Undo, Arrow Up/Down, mouse placement, and a drag across the
inserted block in the packaged WebKitGTK, WebView2, or WKWebView runtime.

## Clipboard image paste regressions

Clipboard image paste crosses binary persistence, the native Wails binding, an
asynchronous CodeMirror transaction, the existing image widget, preview, and
PDF export. Retain focused coverage for the exact generated Markdown and
bytes, note-relative placement, sequential collision names, invalid/oversized
refusal without a document edit, and plain-text paste fallthrough. The browser
test must dispatch a real `ClipboardEvent` through CodeMirror, load the saved
relative image, verify the cursor remains on adjacent source lines, and render
the same image through PDF preview and a generated PDF. The same spec also owns
the missing-image 404 geometry/theme matrix described in the block-widget
contract above, plus the missing-Draw.io action's real pointer-to-tab boundary;
these are computed-style and pointer-selection checks rather than duplicate
persistence workflows.

Run the focused contract with:

```bash
go test . -run 'TestSaveClipboardImage'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/clipboardImage.test.js \
  tests/frontend/unit/createDrawioImage.test.js \
  tests/frontend/unit/drawioImageCreationModel.test.js \
  tests/frontend/unit/drawioImageGuide.test.js \
  tests/frontend/unit/editor.test.js \
  tests/frontend/unit/fileTree.test.js \
  tests/frontend/unit/imageSystem.test.js \
  tests/frontend/unit/markdownBlockGuides.test.js \
  tests/frontend/unit/markdownImageGuide.test.js \
  tests/frontend/unit/markdownImageModel.test.js \
  tests/frontend/unit/markdownImagePlugin.test.js
npx playwright test tests/e2e/clipboardImagePaste.spec.js
```

## File-tree copy regressions

Internal file-tree copy/paste is non-destructive: collisions must allocate
`copy` / `copy 2` sibling names, every dirty source tab must save before the
backend reads it, copied Markdown links must preserve their resolved vault
targets, and folder copies must never target the source folder or any
descendant. Mixed selections may include managed-only files and folders;
the pure transfer plan deduplicates sources and removes children covered by a
selected directory. A multi-copy refreshes once after the batch, while a
partial failure retains only unresolved sources for retry. A known copy must
retain the warm vault index and file-tree metadata, add every copied
projection, and acknowledge its native create events without masking a later
external edit. An index that misses an external Markdown change must use the
complete rebuild and match a fresh application plus an independent disk walk.
Changes to tree actions, tab persistence, link rewriting, vault copy helpers,
path validation, or duplicate naming must retain Go coverage for the filesystem
and link results plus frontend coverage for commands and refusal dialogs.

Referenced-file rename adds one focused decision boundary to that contract.
`pathRenameReferenceModel.test.js` owns de-duplicated/sorted note presentation
and update/keep/cancel mapping. `fileTree.test.js` owns preview-after-dirty-save,
no-question rename when the preview is empty, all three dialog outcomes, and
open-tab/reference refresh after an update. Root-scoped desktop coverage owns a
read-only exact preview, Draw.io and Markdown targets, exclusion of a renamed
note's self-reference from the incoming-note prompt, explicit rewrite, and an
explicit unchanged-reference rename. The collector is shared with the existing
link-rewrite tests; do not duplicate its syntax matrix in a browser workflow.

Run the focused contract before the full suites:

```bash
go test ./internal/desktop -run 'Test(CopyPath|CopyFalls|WarmCopy|FileTreeCacheAndVaultIndexStayWarmAcrossKnownCopy)'
go test ./internal/links -run 'Copy'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/fileTreeModel.test.js \
  tests/frontend/unit/fileTreeTransfer.test.js \
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

Long internal moves add a single-flight UI contract: set the tree's `aria-busy`
state and announce the source name before awaiting the backend, refuse another
move while that promise is pending, then clear busy state and report the final
path. Keep this sequencing in `tests/frontend/unit/fileTree.test.js`; it does
not require a browser or a second filesystem matrix.

## Rendered task checkbox regressions

`taskCheckboxModel.test.js` owns source-character toggling and the cleaned,
action-oriented accessible name. The focused editor component test mounts a
real CodeMirror checkbox replacement, verifies its named control and hitbox,
and proves both keyboard-style and pointer clicks mutate Markdown rather than
only native checkbox state. The browser case owns the irreducible boundaries:
24px computed hit geometry, Space activation with focus restored after widget
remount, pointer activation in the padded target, Arrow Up/Down across the task
from both directions, and drag selection across the replacement. Repeat those
cursor and focus checks in the packaged WebKitGTK/WebView2/WKWebView smoke run
after changing this widget; Chromium cannot establish native-webview geometry.

`taskItemActionModel.test.js` owns open-task recognition, column insertion, existing-tag de-duplication, and ordinary-link source fidelity. Syntax-tree coverage must exclude
checked tasks, frontmatter, and fenced examples. The focused editor component
owns the approved small-icon structure and accessible popup names, the real
CodeMirror completion inventory, date-picker handoff, source transaction, and
final cursor. Extend the existing task browser case—not a second workflow—to
prove both 22px controls, checked-task removal, real gutter line mapping,
autocomplete/date-picker activation, Arrow Up/Down, and drag selection.

## Search and shell accessibility regressions

`topBar.test.js` parses the assembled shell markup and requires explicit
accessible names on icon-only sidebar, native-window, and details-pane
controls; their decorative SVGs must not become part of those names.
Global-search component coverage must keep focus on the combobox, synchronize
`aria-expanded`, `aria-activedescendant`, and option `aria-selected`, clear the
active descendant on Escape, and put a repeated filename's parent location on
its own line with the complete path in its accessible name and tooltip. Pure
coverage owns parent derivation and the tail-preserving deep-path compaction:
keep a shallow parent complete, but retain the root and final three folders
around an ellipsis when depth would otherwise erase distinguishing context.
`globalShortcutModel.test.js` must keep Ctrl/Cmd+F distinct from the uppercase
key value emitted by Ctrl/Cmd+Shift+F, leave repeated capture commands inert,
and preserve Ctrl/Cmd+N versus Ctrl/Cmd+Shift+N. The browser shortcut case is
the owner of capture ordering against a focused CodeMirror editor and the
Quick Note focus handoff.
The theme browser check owns computed 4.5:1 contrast for the compact summary
and for result paths, excerpts, line/count metadata, and highlighted matches.
It also verifies that result-row content keeps the normal text color across
every theme in `frontend/themes/manifest.json`.
Filter coverage must click **Titles**, **Recent**, and **Aa**, keep the popup
expanded and its result-list node mounted during each rerun, retain focus on
the activated chip, and prove that the same list can shrink and grow before an
actual outside click dismisses it.

Search relevance is split at the lowest capable layers. `internal/search`
tests accent folding, natural query terms, BM25F field weighting and coverage,
prefix/fuzzy thresholds, case filtering, and best-passage selection.
`app_ranked_search_test.go` exercises those rules through the current native
index, including a low-result correction and the link-specific profile. The
warm-vs-cold differential snapshot includes ranked responses across every
mutation stage. Frontend model/use-case/component tests own native-order
preservation, accent-safe highlight offsets, suggestion focus/activation, and
stale-response suppression. One existing CodeMirror browser boundary proves a
misspelled link query reaches the native link profile and inserts the first
ranked target with Enter.

Tab activation rerenders the tab DOM, so unit and browser coverage must prove
two consecutive Left/Right presses keep focus on the newly mounted active tab.
The real narrow viewport also owns the status bar's 24px fixed-height contract,
the file-tree/buffer region boundary, the left/right anchoring and DOM order of
the two active-buffer groups, its ordinary-writing rest state, bottom-edge
hover restoration, urgent-status override, and the collapsed 44px application-status
presentation: full live text and tooltip remain available, its compact activity
state stays inside the rail, and **Undo** remains visible and operable. Theme
coverage compares the native application-status surface with the file tree and
the buffer-status surface with the editor. Save-model, dialog, and tab-manager
units own failure-cause formatting, dirty-buffer retention, blocking modal
actions, per-episode Auto-Save deduplication, and the live status semantics.
`windowClose.test.js` proves that native close is allowed only after every
requested write succeeds and no newer edit remains dirty.
The ordinary-writing browser assertion must compare the application-status
background with the sidebar while its text is transparent, proving that content
opacity cannot expose the editor-coloured parent surface beneath that region.

Run the focused contract with:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/searchModel.test.js \
  tests/frontend/unit/workspaceSearch.test.js \
  tests/frontend/unit/search.test.js \
  tests/frontend/unit/saveModel.test.js \
  tests/frontend/unit/windowClose.test.js \
  tests/frontend/unit/statusBar.test.js \
  tests/frontend/unit/statusBarPresentationModel.test.js \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/fileTree.test.js
npx playwright test \
  tests/e2e/editorUX.spec.js \
  tests/e2e/figaroThemes.spec.js \
  tests/e2e/workspaceOverview.spec.js

GOCACHE=/tmp/figaro-go-cache go test ./internal/search ./internal/desktop \
  -run 'Test(SearchNotes|WarmVaultStateMatchesColdRebuildAcrossMutationSequence|NormalizeAndParseQuery|ScoreUsesFieldWeights|BoundedEditDistance|VariantExpansion|BestPassage|AnalyzeMatchingCase)' \
  -count=1
```

## File-tree pin regressions

Pinning is a vault-scoped appearance preference, independent from a row's
custom icon and color. Unit coverage must prove stable pinned-first ordering
within each sibling group, the rightmost pin marker, persistence through
rename/move/copy/merge/delete mappings, and an explicit unpin that overrides
the top-level `Inbox` default without discarding appearance. Keep the
representative browser case in `tests/e2e/fileTreeAppearance.spec.js` focused
on computed marker position and the Pin/Unpin menu transition; sibling ordering
and persistence belong below the browser. The existing sidebar browser
contract separately proves that Quick Note's resting surface derives from a 3%
primary-text/sidebar mix and its relevant state from the standard hover token,
while its muted `INBOX` label, accent action icon, and ordinary Mail glyph
retain their established colors. The bundled-theme browser loop proves the
resting capture surface resolves from every theme's text and sidebar tokens.

Run the focused contract with:

```bash
go test ./internal/desktop -run 'TestFileTreePin'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/fileTreeModel.test.js \
  tests/frontend/unit/fileTree.test.js
npx playwright test tests/e2e/fileTreeAppearance.spec.js
```

File-tree deletion stays at the lowest useful boundaries: tab-manager coverage
proves dirty affected buffers save before the request; file-tree component
coverage proves cancellation, copy, and save-failure sequencing; history
service tests prove the exact archived contents, ignored-file inclusion, and
unrelated-index isolation; root-scoped desktop tests prove removal occurs only
after a recoverable revision exists. Do not duplicate this deterministic
contract in Playwright.

## External Markdown launch regressions

Native file-association launches are an explicit boundary: retain Go coverage
that startup accepts only existing `.md` arguments, the opaque launch ID reads
and saves exactly its original file, and unknown IDs are refused. The Wails
single-instance callback must resolve relative arguments against the second
process's working directory, collapse duplicates within that request, register
new opaque capabilities, restore/focus the existing window even when no valid
Markdown argument remains, and emit only the registered descriptors. Frontend
coverage must assert that the import choice occurs before the first tab opens;
import opens the returned collision-safe vault copy, while declining opens the
capability-backed original and adds one process-local root shortcut with the
distinct `FileSymlink` default icon. A forwarded runtime batch must reuse this
choice, serialize against other batches, and claim a capability once if both
the startup snapshot and runtime event expose it. The existing `delete` action must remain
the single final menu entry and relabel itself **Remove from file tree** for
that shortcut. External shortcuts must not enter the internal file-tree
operation selection; deletion remains a single-target workflow with no mixed
bulk-delete dialog. External tabs must use the external save binding, never
Auto-Commit or enter the vault session or recent-notes list, and removing the
root shortcut must show the non-deletion warning, close through normal dirty-state protection,
mutate only frontend state, and never call a vault delete binding. Opening or
selecting an external tab must preserve its opaque capability, call the
external read binding, and commit the selected tab plus CodeMirror document
ownership only after that read succeeds. Failed and superseded reads must leave
the previous tab and buffer paired. Native drops onto the file tree must show
the destination-specific import confirmation before any copy binding; cancel
must produce no backend mutation. Root-scoped adapter coverage must run the
same duplicate-name, unsupported-source, nested-symlink, and recursive-copy
preflight through copy and recursive-merge modes and prove rejection writes
nothing. Buffer drops
must prevent CodeMirror's uncontrolled path insertion, ask once for an entire
native drop batch, insert the selected path at the drop position, and call the recursive collision-safe
import once for a dropped directory. A successful dropped-file import must
open that imported file in a new active tab, while a dropped directory keeps
the current buffer active. The Wails callback must register without the
CSS-drop-target filter so it reaches CodeMirror on Linux/WebKit. Exercise a
packaged Windows/WebView2 build manually by starting Figaro, minimizing it,
and opening an associated `.md` file. Confirm that the existing window is
restored with no second Figaro window, then decline import, save the original,
remove its root shortcut, and confirm the original still exists unchanged
except for that explicit save.
Repeat by importing into a vault that already contains the same filename; also
drop a standalone note onto a file-tree folder, cancel once and confirm once,
then drag a note and folder into an editor buffer, choose path insertion once,
and import once to verify the folder hierarchy.

Run the focused contract with:

```bash
go test ./internal/desktop -run 'Test(LaunchExternalFile|MarkdownLaunchPaths|SingleInstance)'
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/externalFileModel.test.js \
  tests/frontend/unit/externalFiles.test.js \
  tests/frontend/unit/vaultEvents.test.js \
  tests/frontend/unit/externalDrop.test.js \
  tests/frontend/unit/importedExternalTabs.test.js \
  tests/frontend/unit/tabManager.test.js \
  tests/frontend/unit/fileTree.test.js
npx playwright test \
  tests/e2e/desktopStartup.spec.js \
  tests/e2e/tabBufferOwnership.spec.js
```

## Editor buffer undo ownership

`editorDocumentSession.test.js` owns the pure scheduling and ownership rule:
every real tab-owner change requests a history swap, including when two
buffers have identical source. `editor.test.js` supplies the real CodeMirror
component boundary: edit file A, mount file B, verify Undo cannot change B,
edit and undo within B, repeat the identical-source switch, return to A and
restore only A's operations, then prove a changed source invalidates its stale
history. This behavior is fully observable below a browser, so it does not add
a redundant Playwright scenario; the existing tab-buffer browser spec remains
responsible only for asynchronous activation and visible owner pairing.

Run the focused regression with:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/editorDocumentSession.test.js \
  tests/frontend/unit/editor.test.js
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

The focused browser contract first checks that Standard mode keeps a thin
theme-colored caret across prose, headings, and rendered Properties while
Arrow Up/Down retain their normal movement. It then compares Left/Down/Up/Right
with `h`/`j`/`k`/`l` from the same cursor in both Vim Normal and Visual modes,
including Properties and rendered-fence boundaries. It also checks that the root Vim Normal block cursor
uses `--cursor-bg` and `--cursor-text`, never the Vim adapter's fixed fallback
red, after switching between contrasting light and dark themes and after focus
returns after leaving either edge of a rendered table's source range. It checks the 4 px Insert
caret plus the optional **Move by visual rows** mapping: `j`, `k`,
and Up/Down move one wrapped display row in Vim Normal mode, including inside a
long wrapped Markdown-link destination, recover to the adjacent source line
when the engine returns the same position, and reject a backwards result at
the exact first or last position; operator-pending source-line motions such as
`dj` stay unchanged. Markdown diagnostics, including errors inside revealed
Mermaid source, must retain Arrow Up/Down, mouse placement, drag selection,
themed hover guidance, F8 navigation, and their enabled-by-default Settings
toggle. Wrapped Markdown bullet, ordered-list, and
plain blockquote lines must keep continuation rows under their item or quoted
bodies in both active and passive preview states, while retaining Arrow Up/Down,
mouse placement, and drag-selection behavior.

The `tests/e2e/vimVisualRows.spec.js` contract covers the long-document
viewport regression in both forms: a wrapped Markdown note with headings, and a
note with frontmatter, headings, repeated Mermaid blocks, and long prose. Each
is navigated down, up, and down again by normal Arrow Up/Down and Vim `j`/`k`;
the rendered-block case also exercises Page Up/Page Down. The assertions require
the selected source line to remain in CodeMirror's primary viewport, remain
visible, and not be replaced by a visible virtual-viewport gap.

The empty-second-item and empty-blockquote regressions must press Enter once in
the assembled Markdown editor, assert the exact source/cursor result (including
one-level-at-a-time nested quote exit), then exercise Arrow Up/Down, mouse
placement, and a drag across the former structural boundary. The pure
`markdownStructuralEditing.test.js` matrix owns eligibility and exact plans for
outer and nested quote levels. Smart URL
paste must use a real browser `ClipboardEvent`, preserve the selected label as
Markdown, and repeat with the Vim adapter's actual Visual state active. The
rich-paste browser contract separately repeats semantic HTML replacement with
the Vim adapter's actual Visual state and verifies literal source contexts. The
same focused editor workflow asserts the main textbox's document-specific
accessible name and the active document-first browser title. Pure title-model
coverage owns the `Document — Figaro`/`Figaro` decision; the native adapter has
a no-panic backend test. A focused browser workflow opens file-tree, tab, and
editor context menus with Shift+F10, checks menu/menuitem semantics and
Up/Down/Home/End focus, then verifies Escape restores the invoking focus.
Modal coverage must also prove that a deferred return-focus step does not
override a newer menu or dialog that has already taken focus.

File-tree keyboard coverage is split at the same seam. Pure model tests own the
visible-row flattening and Up/Down, Home/End, parent/child, expand/collapse,
Enter activation, Space selection, semantic file-icon mapping with generic
fallback, viewport-clamped tooltip placement, action-target reduction, and
mixed-transfer plans. File-attention model tests additionally own severity
ordering, runtime/native merging, semantic snapshot equality and inert
republication, disk-full grouping, exact-file indexing, and distinct
collapsed-ancestor counts. Component tests
own `tree`/`treeitem`/`group` semantics, exactly one row with `tabindex="0"`,
focus independent from active-document and internal file/folder selection,
collapsed-child mounting, themed hover/focus tooltip semantics for a
normal-opacity managed-only row, ordinary activation without an open attempt or
active-buffer replacement, double-click and contextual **Open** convergence on
the default-application backend, visible launcher failure, focused-row restoration
after rerender, and F2 dispatch to the existing rename workflow for a focused
vault row. Component coverage must also simulate a diagnostics-driven row
remount while a context menu is open and between managed-file clicks, proving
stable focus restoration and exactly one default-application open. It must also
prove that a successful tab switch moves only `aria-current` without changing
the selected surface, focus, or mounted rows; `aria-selected` belongs only to
the operation selection, clean open buffers have no visual marker, and dirty
buffers alone receive a warning marker plus assistive unsaved text.
They also prove that an affected file retains its identity icon, gains a
non-color alert marker and exact hover/focus description, contributes an
aggregate marker while its ancestor is collapsed, and routes activation to the
shared diagnostics without opening CodeMirror. Diagnostic component coverage
owns the persistent status summary, applicable-action filtering, targeted tree
reveal event, and modal close lifecycle. The design-system browser specimen
owns the irreducible computed tint, inset marker, status danger variant, and
unchanged 24px row geometry.
One browser scenario owns the irreducible Tab-entry and `:focus-visible`
behavior, then uses Right/Down/Left against real focused rows. That focused
boundary also proves the managed-only tooltip reuses the approved themed
tooltip surface, advertises double-click, and remains inside the
viewport. The same representative mouse boundary proves that double-click and
the contextual **Open** action dispatch the identical vault path. Root-scoped
desktop tests own exact-path launch, missing/directory/symlink/traversal refusal,
and launcher failure; editable-file opening, drag, and remaining context-menu
behavior must remain unchanged.

Root-scoped file-confidence adapter tests create real temporary vault files and
must prove that the 50 MB metadata gate rejects a sparse oversized note before
content is returned, binary and invalid-UTF-8 notes are omitted while a healthy
note remains searchable, a repaired note is restored by targeted recheck, and
malformed settings are preserved before defaults replace them. A corrupt Git
root must report degraded history while an ordinary note save still succeeds.
Frontend save/session tests classify representative ENOSPC text, keep one
persistent disk-full incident across cascaded failures, and clear it only after
a successful corresponding write. The save-dialog test separately proves the
dedicated disk-full consequence text and its Retry, Copy unsaved text, and Keep
editing actions.

Cut/Paste coverage reuses the move seam: the pure `fileTreeKeyCommand` matrix
owns modifier policy, context-menu targeting, cut cancellation, rename/delete,
navigation, and clipboard command selection. Component tests must prove
Ctrl/Cmd+X followed by Ctrl/Cmd+V invokes `MovePath` rather than `CopyPath`, carries a
mixed selected set including an unsupported file, clears the cut clipboard only
after every move succeeds, retains unresolved entries after cancellation or
failure, derives visible and assistive scissors markers for mounted and
virtualized rows, clears them when Copy replaces Cut or Escape cancels it, and
keeps recursive/self moves non-destructive. The stable tree
context-menu inventory must show Cut, Copy, Paste in order, enable operations
for a single managed-only internal file, disable single-target actions for a group,
enable **Merge Notes** only for an operation selection containing at least two
Markdown notes (never one selected note plus another open buffer),
omit tree-level Raw Text/PDF preview, and pair only real keyboard commands
with faded shortcut hints; F2 and Delete dispatch the same validated workflows
as their menu items.

Deletion recovery requires three layers. Pure `internal/recovery` tests own
newest-first record ordering and identity removal. Root-scoped desktop/history
tests prove exact commit selection, removal of previously tracked-but-now-absent
children, durable registry persistence, file/folder/empty-folder restoration,
collision refusal, symlink preservation, and no overwrite. Frontend tests
prove the ten-second native status **Undo**, Settings list success/error states,
and one tree-refresh request. The real browser owns only native Enter/Space
status-button activation, History roving-option focus/selection, link cursor,
and the relocated help popup's hidden/focus/Escape behavior plus real
Markdown/Macros/Shortcuts tab focus and panel visibility. The focused F1 case
opens help from the editor, verifies initial focus in the search field, switches
to Shortcuts, toggles it closed and open, and proves focus returns to the
invoking editor while the selected topic and outer geometry remain stable.
Unit coverage owns search/result semantics, deep-link dispatch, complete
shortcut rows, three-topic roving tab state, responsive target dimensions,
contained scrolling, and stable scrollbar gutter.

Find and Replace keeps behavioral coverage in `editor.test.js`, which opens
the native panel and requires its query, replacement, navigation, matching, and
close controls. `searchMatchModel.test.js` owns empty, invalid, zero, singular,
plural, and selected-result announcement text; the editor component proves the
nonvisual polite status follows the native query. `editorSearchLayout.test.js`
owns the three-row CSS assignment.
The focused browser case measures the computed 104px panel, requires three
ordered non-overlapping control bands, checks a real typed query announces its
match count, and performs a real Replace all action;
these computed grid coordinates cannot be established in jsdom.

Slow file-tree mutation feedback stays below the browser layer. Status-bar
unit tests use fake timers to prove that fast work never flashes, the spinner
appears at exactly one second, overlapping operations remain visible until all
settle, and reduced-motion styling removes rotation. File-tree component tests
prove that copy/import, move/merge, rename, and delete share the busy lifecycle,
clear it on every outcome, and do not keep it active while a confirmation or
error dialog waits for input.

Kanban ordering keeps pure JavaScript and Go reconciliation tests, a root-scoped
config persistence/path-escape test, and one browser sequence: Tab crosses a
column boundary, Up reorders and restores focus, then Right rewrites the tag and
restores focus in the adjacent column. Closing the right pane must assert both
`aria-hidden` and `inert`; CSS width or `.open` alone is insufficient.

The separate, off-by-default **Enter rendered blocks** preference must be
disabled while Vim is off, persist and roll back through the same Settings
contract, and let Normal `j`/Down and `k`/Up enter adjacent fenced source and the first/last
table source range even when visual-row motions would otherwise skip the widget. With
that preference explicitly off, Visual `j`/Down and `k`/Up must keep Visual mode and its
original anchor while selecting into fenced source from above and below;
subsequent motion must continue through the unrendered block. Operator-pending
motions remain untouched.

Ordinary Vim `p`/`P` must prefer non-empty OS clipboard text, retain linewise or
blockwise register metadata when the clipboard matches the unnamed register,
honor before/after placement and counts through the vendored paste action, and
fall back to the unnamed register when clipboard reads fail or return empty.
Default yanks, deletes, and changes must write their resulting unnamed register
to the OS clipboard without making a clipboard denial break the Vim command.
Keep the text/shape and replay-key decisions in `vimClipboardModel.test.js` and
the actual adapter/register integration in `vimCommands.test.js`.

Offline spellcheck must retain the same editor movement and selection contract:
its disabled-by-default global **None** state, explicit enablement with the US-English
fallback, themed keyboard-operable language combobox, settings-level disablement
across every note, Spanish frontmatter
override, per-note `false` opt-out, themed dotted marker, and local-only
dictionary assets are covered by unit and browser regressions.
The Settings regression must keep the scope guidance as two concise rows using
the approved information-notice primitive and preserve its `aria-describedby`
relationship on the visible themed combobox trigger.
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

Missing Draw.io Markdown-image creation is covered at three boundaries. Pure
tests resolve same-folder, parent-folder, vault-root, encoded, remote, malformed,
and vault-escaping destinations, plus saved-preview, absent, existing-empty,
and inspection-error classification. The injected use-case tests prove create → open → background
refresh ordering, stop after creation failure, return before a pending refresh
settles, and report refresh failure without revoking successful creation.
CodeMirror component coverage asserts the accessible approved Create/Open
actions, busy/disabled lifecycle, mounted Create-to-Open transition, file-return
remount from Open to saved preview, unchanged source, ordinary-error fallback,
and Arrow Up/Down traversal from both directions. The
existing focused image browser scenario owns the irreducible `<img>` failure
and pointer boundary: a real click creates the exact file and opens its Draw.io
tab, closes it unchanged while tree refresh is still pending, verifies the
source action is ready to Open rather than permanently Creating, and reopens it
without another create. It then simulates a valid saved SVG while the original
image route still fails and verifies that returning to the note restores the
actual image preview. Ordinary missing-image click, adjacent cursor motion, and
bidirectional drag selection retain their previous behavior. The same browser
case folds and expands the Draw.io image, opens its editor from the left guide,
and publishes the exact file-tree deletion signal; the versioned preview must
disappear and the safe Create action must return.

The `@drawio` authoring macro reuses those boundaries instead of adding another
browser workflow. `authoringMacroModel.test.js` owns the `diagram1` default,
suffix normalization, explicit sibling reference, validation, and insertion
plan; `authoringMacroCompletions.test.js` owns retention of the token through
the name/create effect and exact unchanged-token replacement. The Draw.io use
case test additionally owns create → reference insertion → open → background
refresh ordering and the stale-token result that preserves the created asset
without opening it.

Run the focused contract with:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/vimClipboardModel.test.js \
  tests/frontend/unit/vimCommands.test.js \
  tests/frontend/unit/vimSettings.test.js \
  tests/frontend/unit/vimVisual.test.js \
  tests/frontend/unit/editorSettings.test.js \
  tests/frontend/unit/tabManager.test.js \
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

## Dependency and vendored-browser security

Run both npm views of the dependency graph, because the full audit includes
build/test tooling while the production-only audit answers a different
question. Neither command inventories packages embedded inside checked-in
browser bundles:

```bash
npm audit
npm audit --omit=dev
go run golang.org/x/vuln/cmd/govulncheck@latest .
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/dependencyPolicy.test.js \
  tests/frontend/unit/diagramSecurityModel.test.js \
  tests/frontend/unit/diagramRenderer.test.js \
  tests/frontend/unit/vendoredBrowserSecurity.test.js
npx playwright test tests/e2e/pdfExport.spec.js
```

The dependency-policy contract also locks Babel 8 to its exact Node engine
floor, proves the Jest 30 syntax-preset compatibility copy is inert under Babel
8 while its Babel 7 plugins resolve a nested core, and verifies that the tracked
`install-links=true` npm policy gives clean installs a portable local-package
layout. The test imports that installed package rather than the `tools/` source
directory, preventing ignored developer dependencies from making a dirty
workspace pass when a fresh CI checkout would fail. It keeps the root
Markdown-It 15 runtime within the `^15.0.0` peer range declared by every
selected `@mdit` renderer plugin. It also reads the generated
browser core's version banner, preventing a package-only upgrade from leaving
the desktop runtime on the previous major. The vendored
color-extension regression proves its undeclared Babel helper is replaced by
the exact local transform and that an unfamiliar upstream artifact fails
closed. The vendored security contract reads Mermaid's embedded `js-yaml`
version, while the
dependency-security contract checks every resolved npm copy of
`brace-expansion` and test-only `js-yaml`,
and proves that every production `window.mermaid.render` call passes through
the shared guard. If Mermaid updates its embedded parser to `js-yaml` 4.3.1 or
newer, keep the guard as defense in depth and update the inventory expectation
only after the actual bundle changes.

The Go vulnerability scan includes reachable standard-library symbols, so
`go.mod`, `make doctor`, and the documented development prerequisite must stay
on the same patched Go release. The dependency-security unit contract guards
that minimum independently of the live advisory scan used by CI.

### Workspace consistency and scheduling safety

The existing `kanbanDueDate.spec.js` exercises actual D/Escape focus handoff and
picker placement, not backend argument matrices. `kanban.test.js` owns exact
D/Delete/modifier/repeat dispatch, dirty-source refusal, and failed-write card
retention. The existing Gantt browser boundary compares Calendar/Kanban/Graph
control insets and keeps footer geometry fixed. Catalogue tests verify borderless
choice paint and visible focus in all three Figaro themes; optional `--choice-*`
tokens preserve other themes' outlined defaults. The existing editor boundary
covers caret-anchored `@date`, Arrow Up/Down, and task mouse/drag selection; normal
macro completion component tests cover Enter/Tab/Space and source undo. The
task-rail component also refuses handoff after switching notes, including an
identical-source note while loading or choosing its date.
