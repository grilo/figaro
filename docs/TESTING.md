# Testing figaro

Use `npm run context` to select a route, then `npm run context -- <feature>` for
source symbols, documentation sections, and focused checks. The full
[feature index](FEATURE_INDEX.md) remains available for browsing. This page owns
the shared strategy and commands; linked feature contracts retain the detailed regression and native-verification requirements.

Cursor performance checks include the active bundled Markdown providers,
actual syntax visits/source slices, decoration identity and bounded range/Outline
work as well as parsing and I/O limits. Inline regressions cover cached list/quote
indentation, ordinary/reference link source reveal, indexed writing hints and
same-line gutter reuse; see the
[editor update contract regressions](testing/editor.md#editor-update-contract-regressions).

Typing regressions advance scheduled frames with controlled time so CPU load
cannot turn a typing burst into an unintended statistics pause. They observe actual full-document
reads, Outline DOM mutations, hidden Kanban parsing, list/extras projection builds,
and indentation style reads. Lazy snapshots must remain current for preview/save
readers, while warm Kanban activation catches up to the newest unsaved task.

The consolidated `editorRemainingWork.test.js` checks all ten interaction
findings at small and large scales. Complement it with pointer/footnote tests,
streamed completion equivalence and invalidation, indentation-scope equivalence,
bounded Mermaid success/failure reuse and stale-lint cancellation. Operation
counts establish avoided work; browser/native key and pointer checks establish
selection geometry. See [the consolidated report](benchmarks/editor-interaction-findings-2026-09-20.md).

The ordinary-click component fixture completes and publishes its initial syntax
tree before counting reads, then advances mouse-release frames with controlled
time. The assembled authoring-macro fixture explicitly runs session persistence
and checks its saved cursor. These checks must not depend on CI runner speed;
see the [editor contract](testing/editor.md#editor-update-contract-regressions).

The editor interaction regressions also cover rich-prose mapping, retained
preview clicks, indexed helper-rail and Pure phrase lookup, and single-record
buffer publication. Gutter geometry is sampled throughout focus and background
updates; Activity dates and Pure layout classes must survive CodeMirror root-
attribute changes. See [the editor contract](testing/editor.md#editor-update-contract-regressions)
and [tab continuity](testing/workspace.md#file-revision-continuity).

Prepared code/math/table/image regressions cover retained content, current
controls, invalidation and disposal; existing geometry scenarios inspect their
first restored paint. Prepared diagram regressions distinguish cold generation from restoration of a
retained SVG subtree. Component checks cover ownership, invalidation and bounded
retention; the existing browser footprint scenario checks first-paint fit, and
native profiling compares held-arrow navigation with immediate reversals. See
[block widget regressions](testing/editor.md#block-widget-and-cursor-regressions).

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
variants. Cancellation assertions observe the emitted cancellation status but
do not require it to remain the last status after an independent asynchronous
tree refresh legitimately returns the application to **Ready**. The existing
editor UX browser spec contains one representative
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
Its URL-labelled rendered-link case makes pointer-to-source mapping fail, so
native replacement-widget geometry cannot prevent external activation. A
focused real-browser case sends actual Ctrl modifiers to the rendered label and
revealed source for that exact URL-labelled syntax. That fixture and the
URL-over-selection clipboard/Vim/context-menu fixture await `setEditorContent()`
completion before placing the caret or entering Visual mode; an animation frame
does not acknowledge the separately scheduled document replacement.
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
adapters or composition roots. Use cases may import only sibling use cases,
pure core modules, or packages. The same suite rejects direct tab-record writes
outside `tabManager.js`, browser-global dialog ports, and pairwise right-pane
close events. It compares `backendContract.js` with every exported Go `*App`
method so native API drift fails before browser startup. Guardrails also walk static imports and explicit
worker edges from the eager bootstrap and print-renderer build entries so an
orphaned first-party module fails the suite instead of silently remaining in
the tree. The graph must remain acyclic, only `bootstrap.js` may import the
frontend `app.js` composition root, and only `app.js` may import
`tabManager.js`. The same policy rejects object-valued default-export wrappers;
first-party modules expose the named APIs their consumers and focused tests
actually use. Add a guard when introducing the first module in a new layer
rather than relying on naming conventions alone.

Production asset tests additionally require `index.html` to reference the
generated eager `app.bundle.js` entry, while the development handler must
substitute `js/bootstrap.js` and omit the bundle. `npm run build:app` proves the
static graph bundles without introducing first-use module loading. The browser
suite also opens `?figaro-entry=production`, requires the generated bundle to
boot without first-party `/js/` requests, and loads one bundled font through the
real `FontFaceSet` API. CI and release preparation use
`scripts/prepare-frontend.sh` (explicitly through Bash on every release platform),
so ignored production assets are rebuilt
from the checked-out source instead of inherited from a developer workspace.

### Test-integrity guardrails

`npm run test:integrity` statically scans every frontend unit and Playwright
test before the main suite. It rejects assertions whose subject and oracle are
both constructed inside the test, identical or literal assertions, test-local
regex implementations, comments that describe copied production logic,
browser specs that reproduce a production `color-mix()` formula, and
conditionally collected arrays passed to `every()` without a preceding
non-empty length assertion. Replace a rejected test with coverage of an
imported pure rule, use case, adapter, or real component; do not weaken the
rule or add a ceremonial assertion.

The shared jsdom fixture clones the body of `frontend/index.html`; it must not
carry a second handwritten copy of the application shell. Its default native
binding may provide inert read responses, but write-like methods are tracked.
A test that invokes a save, create, delete, move, export, native open,
preference write, or window command must first configure that method's exact
success or failure response. An unconfigured call throws immediately, and the
after-test check still fails if production code caught that error. The binding
is recreated for each test so mock behavior cannot leak into the next case.
Its complete backend double is generated from `backendContract.js`; focused
tests override only the methods they exercise instead of maintaining another
partial facade inventory.

```bash
npm run test:integrity
```

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
does not settle early, and repeated callers do not duplicate the reads. The
editor document-session and tab-manager tests prove restored activation cannot
settle before its scheduled source replacement, while the DOM presentation
test owns the later two-frame conceal/reveal scheduler. Keep failures and
concurrency below the browser layer; they do not need geometry.

Startup timing regressions live in `internal/startup`: injected-clock tests
cover durations, incomplete spans, allowlisted bridge fields, deduplication,
bounds, and readiness; blocked open/write adapters prove log I/O cannot hold up
producers or shutdown. `startup_logs_test.go` uses real temporary directories
for private files, exclusive same-time launches, retention after clock reversal,
and preservation of unrelated files and symlinks. It checks the exact folder
passed to the file-manager adapter and retryable launcher/storage failures.
`startupTimings.test.js` proves eager work begins immediately and preserves its
result/error even when reporting hangs, throws, or rejects. These tests also
verify that asynchronous bridge delivery preserves stage order, and
help-search tests locate the startup log action by slow-launch keywords. Settings
tests cover the actual Vault care button, its separation from the health action,
accessible feedback, pending duplicate clicks, failures, and retry. Health
description copy is asserted here rather than in the browser scenario. The existing assembled startup scenario checks that
timing events reach the native bridge; pure timing assertions remain below the
browser layer. Native QA should confirm incremental JSONL events while services
are held, then the readiness marker after release.

Initial vault progress is split across the same boundaries. Root-adapter tests
prove exact Markdown discovery and monotonically increasing counts; desktop
tests prove that work remains pending until the idempotent `StartVaultLoad`
request, then covers ordered phases, an independently readable final snapshot,
a bounded event count, and an independent initial tree read.
`startup_responsiveness_test.go` holds a real rooted scan read while a disk save
completes, then checks concurrent edit/create/delete reconciliation and loading
queries. It also proves pending Vale preparation cannot block cancellation or
shutdown, early sidebar requests cannot start a synchronous scan, and secondary
metadata failure cannot undo a disk save. Held metadata work must leave the next
disk write available, and delayed projections must survive own-write watcher
acknowledgements while respecting newer writes and removals.
`writing/embedded_test.go` covers exact CLI alert parity, host-configuration
isolation, literal filename inputs, one active/one pending scan, cancelled queue
replacement, deadlines, prompt close, regex timeout/reuse, unsupported styles,
source limits, and failure recovery. Pure frontend tests cover restoration planning, inactive
metadata-only tabs, progress normalization, settlement, percentage/copy, and
stale-generation rejection; the DOM test owns the hidden-to-present transition
and accessible progress attributes. The one `desktopStartup.spec.js` browser
case is retained because only a real page can prove the mirrored theme paints
before the bridge resolves, the selected note is mounted and editable before
`StartVaultLoad`, inactive tabs cause no reads, and compact footer progress
keeps its full track height while the tree and index remain unfinished. That
same scenario holds Vale, dictionary restoration, and Git while typing, saving,
and exercising the native-close button. `editorSaveProtection.test.js` owns
handler installation, interval restoration, cancellation, and failed-save
behavior; `documentSave.test.js` proves disk → Git → index sequencing, later
disk writes during held Git, and separate secondary failures. Its
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
10,000 Markdown documents. Generated data and JSON reports live under
the ignored `stress-vault/` directory; no fixture notes are checked into Git.

Run the complete profile with:

```bash
make stress-vault
```

The target regenerates only a directory carrying the generator's
`.figaro-stress-vault.json` marker, then runs the real desktop/backend adapter
profile and the focused Chromium layout profile. It writes
`stress-vault/backend-report.json`, `stress-vault/browser-report.json`, and
`stress-vault/document-switch-report.json`.
Absolute backend and general-browser timings remain measurement evidence because
hardware and filesystem caches vary. The document-switch profile alternates
three content-heavy/plain trials, records median and worst-observed timings, and
fails only when a content-heavy median exceeds the same-run return-to-plain
median by more than six times. Override the trial count or generous relative
budget with `FIGARO_STRESS_DOCUMENT_SWITCH_TRIALS` and
`FIGARO_STRESS_DOCUMENT_SWITCH_MAX_MEDIAN_RATIO`. Install Playwright's pinned
Chromium first if it is not already available.

To run or customize the boundaries separately:

```bash
node scripts/generate-stress-vault.mjs \
  --output stress-vault/huge-vault --documents 10000 --huge-documents 5 \
  --huge-lines 10000 --replace

FIGARO_STRESS_VAULT="$PWD/stress-vault/huge-vault" \
FIGARO_STRESS_REPORT="$PWD/stress-vault/backend-report.json" \
go test ./internal/desktop -run '^TestHugeVaultStress$' -count=1 -v -timeout=10m

FIGARO_STRESS_VAULT="$PWD/stress-vault/huge-vault" \
FIGARO_STRESS_BROWSER_REPORT="$PWD/stress-vault/browser-report.json" \
FIGARO_STRESS_DOCUMENT_SWITCH_REPORT="$PWD/stress-vault/document-switch-report.json" \
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
schedule projections. Each general scenario writes the accumulated browser
report before the next isolated page starts, so a later failure cannot erase
earlier evidence. A separate document-switch report compares equally scaled
plain source with in-memory variants containing 160 Mermaid diagrams, 400 GFM
tables, 1,200 inline equations, or 500 images; it waits for the requested tab,
CodeMirror document owner, line count, and presentation-ready signal. The Graph
timings likewise wait for the latest complete canvas frame.
`editorDocumentMountModel.test.js` separately proves that only large Markdown
inputs split, that the split stays on a line boundary, that joining its chunks
preserves the source byte-for-byte, and that content markers select the expected
presentation stages.
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
main.go / main_test.go / assets_production.go
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
./scripts/check-go-coverage.sh
go test -race . ./internal/... ./cmd/...

# Frontend unit and integration tests
npm run lint
npm run test:unit
npm run test:coverage

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

Locally, Playwright reuses a test server that is already running, so a test can
pass on state an earlier run left behind (saved settings, open tabs). Before
trusting a pass, or to reproduce a CI-only failure, run with a fresh server as
GitHub Actions does:

```bash
CI=1 FIGARO_PLAYWRIGHT_PORT=34125 npm run test:pdf
```

Release verification always does this (`scripts/verify-release.sh`, port
`34125` unless `FIGARO_RELEASE_PLAYWRIGHT_PORT` is set).

`cmd/devserver` sends `Cache-Control: no-store`; its focused Go test protects
that contract so catalogue and browser checks cannot silently reuse stale
assets after a source edit. Normal requests retain inspectable source modules;
the production-entry query is reserved for the focused generated-bundle smoke.

All CodeMirror browser tests that open `Welcome.md` reuse
`tests/e2e/support/editorWorkspace.js`. Its readiness contract requires the
selected file, active tab, and actual CodeMirror document owner to agree; a
visible `.cm-editor` alone is not sufficient after asynchronous tab activation.

Coverage is a ratchet, not the only definition of quality. Jest enforces the
current global floor while focused tests still belong at the lowest useful
layer. `scripts/check-go-coverage.sh` similarly enforces the repository-wide Go
statement floor and prints the measured total. CI additionally runs internal Go
package contracts on Windows and macOS; native packaged-webview geometry remains
the explicit platform smoke boundary described below.

Browser tests that configure preference-backed editor behavior after startup
must wait for `window._appReady === true` before changing it. Otherwise the
normal startup hydration can overwrite the test's setting partway through a
slower CI run. A test of startup itself should instead install held preference
ports before navigation, assert the editor remains concealed, then release the
ports and inspect only frames painted after `data-startup-hydrating` is removed.
The focused startup regression must fail if that attribute disappears before
the deferred editor document mount: a later correct frame cannot excuse an
initial frame containing only placeholder editor chrome or missing Pure-mode
focus decoration.

### Focused iteration

Choose a route with `npm run context`; inspect only that route with
`npm run context -- <feature>`. A route lists the documents that own current
behavior; benchmarks and past performance work appear only as a count until you
add `--history`. An unknown name suggests similar routes. [FEATURE_INDEX.md](FEATURE_INDEX.md)
is the full reference, not required reading for every change.
For example:

```bash
npm run context
npm run context -- editor-links
npm run test:focus -- editor-links workflow
npm run context:check
```

The focused runner executes integrity first, then the selected explicit Jest
files plus the architecture suite. It retains full logs and Jest JSON under a
unique ignored `test-logs/focused/` directory, prints counts on success, and
returns a nonzero exit code with failed assertions (or the log tail for setup
failures). Invalid or empty selectors fail before execution. A focused pass does not establish global
coverage or replace required Go, browser, packaged-native, or release checks.
Use the linked feature contract to identify those additional boundaries.

`featureWorkflow.test.js` covers compact listing and selected output, the
docs/history split, route suggestions, actual
feature ownership, invalid selectors and references, source-symbol renames,
index freshness, and explicit instruction routing. `npm run context:check` verifies
that mapped files/headings and named top-level JavaScript declarations exist and
the generated index matches its source. Selected context checks its own references
before printing, so it cannot silently recommend a renamed symbol.
An existing path can still be the wrong owner: review the route whenever ownership
or structure changes and regenerate the index in the same change.

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
choice, body-overlay mounting/restoration, scroll tracking, and close behavior.
`selectCombobox.test.js` owns the equivalent adapter contract for native-select
replacements, while `linkStyle.test.js` and `frontmatter.test.js` prove their
specialized popup controls use that same placement boundary. The catalogue component test proves its Appearance
specimen is wired to that production controller. `editorUX.spec.js` keeps one
actual Settings path for focus entry, semantic headings, keyboard selection,
and normal Tab continuation.

Settings cutout groups have catalogue/registry coverage and use the same
workspace surface in every theme. The existing Settings browser scenario also
covers the dictionary dialog's bounded overflow, resize fit and focus handoff.
Personal dictionary list/mutation coverage is documented in the
[writing contract](testing/writing.md#writing-review-regression-coverage). Settings
return geometry retains per-frame coverage in the
[editor contract](testing/editor.md#editor-buffer-undo-ownership).

The Settings component contract also requires every picker, stepper, and short
choice in the Settings template to opt into its approved quiet modifier. The
catalogue browser boundary compares a pointer-open picker with keyboard focus:
the former has tonal open paint and no halo, while the latter retains the focus
ring. `kanbanDensity.spec.js` opens every Settings combobox and proves its menu
is mounted in the shared overlay, overlaps its trigger horizontally, appears
above or below it, and remains inside the viewport. It also proves the stronger
Figaro Light control surface and Figaro Dark's accent-selected Board/Gantt
treatment. Quiet choice surfaces retain transparent resting borders.

Help search keeps its ranking and activation behavior below the browser where
possible. `markdownCheatsheet.test.js` owns pointer-down focus retention, Help
topic activation without dismissal, and the deliberately closing Settings
deep-link. The focused F1 scenario in `editorUX.spec.js` pointer-selects one
Help result because only a real browser reproduces the focusout caused when a
focused result is removed; the popup must remain visible around that handoff.

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

See [What is covered](testing/coverage.md#what-is-covered) for the detailed regression contract.

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

See [Frameless window chrome regressions](testing/workspace.md#frameless-window-chrome-regressions) for the detailed regression contract.

## Pure mode regressions

See [Pure mode regressions](testing/workspace.md#pure-mode-regressions) for the detailed regression contract.

## Sidebar navigation regressions

See [Sidebar navigation regressions](testing/workspace.md#sidebar-navigation-regressions) for the detailed regression contract.

## Today dashboard regressions

See [Today dashboard regressions](testing/workspace.md#today-dashboard-regressions) for the detailed regression contract.

## Kanban paint-continuity regressions

See [Kanban paint-continuity regressions](testing/workspace.md#kanban-paint-continuity-regressions) for the detailed regression contract.

## Kanban due-date regressions

See [Kanban due-date regressions](testing/workspace.md#kanban-due-date-regressions) for the detailed regression contract.

## PDF preview page-geometry regressions

See [PDF preview page-geometry regressions](testing/export.md#pdf-preview-page-geometry-regressions) for the detailed regression contract.

## PDF page-number and contents regressions

See [PDF page-number and contents regressions](testing/export.md#pdf-page-number-and-contents-regressions) for the detailed regression contract.

## PDF browser discovery and Snap confinement regressions

See [PDF browser discovery and Snap confinement regressions](testing/export.md#pdf-browser-discovery-and-snap-confinement-regressions) for the detailed regression contract.

## Raw text preview and heading-link regressions

See [Raw text preview and heading-link regressions](testing/export.md#raw-text-preview-and-heading-link-regressions) for the detailed regression contract.

## Windows keyboard-layout regressions

See [Windows keyboard-layout regressions](testing/editor.md#windows-keyboard-layout-regressions) for the detailed regression contract.

## Editor update contract regressions

See [Editor update contract regressions](testing/editor.md#editor-update-contract-regressions)
for notification isolation, tracing and assembled cursor/typing work limits.
That contract also owns mapped prose edits, scoped heading/code/soft-line updates,
partial-parser progress, unrelated settings reuse, selective block source projection,
heading indexes, cached Find counts and direct cursor-store work budgets.

## Block widget and cursor regressions

See [Block widget and cursor regressions](testing/editor.md#block-widget-and-cursor-regressions)
for the detailed contract, including cursor and typing reuse counters, mapped
Outline navigation, table/math caches, block guides, batched footprint reads,
and the matching browser/native selection, focus, and source-reveal boundaries.

## Smart rich paste regressions

See [Smart rich paste regressions](testing/editor.md#smart-rich-paste-regressions) for the detailed regression contract.

## Clipboard image paste regressions

See [Clipboard image paste regressions](testing/editor.md#clipboard-image-paste-regressions) for the detailed regression contract.

## File-tree copy regressions

See [File-tree copy regressions](testing/workspace.md#file-tree-copy-regressions) for the detailed regression contract.

## Rendered task checkbox regressions

See [Rendered task checkbox regressions](testing/editor.md#rendered-task-checkbox-regressions) for the detailed regression contract.

## Search and shell accessibility regressions

See [Search and shell accessibility regressions](testing/workspace.md#search-and-shell-accessibility-regressions) for the detailed regression contract.

## File-tree pin regressions

See [File-tree pin regressions](testing/workspace.md#file-tree-pin-regressions) for the detailed regression contract.

## External Markdown launch regressions

See [External Markdown launch regressions](testing/workspace.md#external-markdown-launch-regressions) for the detailed regression contract.

## Editor buffer undo ownership

See [Editor buffer undo ownership](testing/editor.md#editor-buffer-undo-ownership) for the detailed regression contract.

## Vim command regressions

See [Vim command regressions](testing/editor.md#vim-command-regressions) for the detailed regression contract.

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

See [the detailed contract](testing/writing.md#workspace-consistency-and-scheduling-safety).

### Writing review audit regressions

See [the detailed contract](testing/writing.md#writing-review-audit-regressions).

### Second writing audit and asynchronous review regressions

See [the detailed contract](testing/writing.md#second-writing-audit-and-asynchronous-review-regressions).

### Third writing audit recovery regressions

See [the detailed contract](testing/writing.md#third-writing-audit-recovery-regressions).

### Consolidated writing lens controls

See [the detailed contract](testing/writing.md#consolidated-writing-lens-controls).

### Animated writing disclosure

See [the detailed contract](testing/writing.md#animated-writing-disclosure).

### Writing lens help

See [the detailed contract](testing/writing.md#writing-lens-help).

### Writing corpus safety regressions

See [the detailed contract](testing/writing.md#writing-corpus-safety-regressions).

### Writing rename continuity and long-note analysis

See [the detailed contract](testing/writing.md#writing-rename-continuity-and-long-note-analysis).

## Passage activity dates

See [Passage activity dates](testing/writing.md#passage-activity-dates) for the detailed regression contract.

## File revision continuity

See [File revision continuity](testing/workspace.md#file-revision-continuity) for
the detailed regression contract, including slow Git object writes, atomic-save
continuity, staging rollback, and coalesced session metadata.

The curated English grammar expansion has a dedicated
[lower-layer and native verification contract](testing/writing.md#curated-grammar-regression-coverage),
including 177 grammar rule IDs, reviewed valid sentences, Unicode/Markdown source
spans, native Harper comparison, and dense-line mapping.
The [whole-document evaluation](benchmarks/writing-documents-2026-09-20.md)
combines every writing provider and the selected spelling dictionary with
frozen Markdown sources, then records separate editorial and Apply judgments.
Use `node scripts/evaluate-writing-documents.mjs --output /tmp/writing-review.json`;
successful execution does not establish suggestion usefulness. The
[broad grammar comparison](benchmarks/writing-grammar-broad-2026-09-20.md)
replays the same sources before and after its 60-rule addition.
The [quality follow-up](benchmarks/writing-quality-2026-09-20.md) adds technical
spelling and contextual/duplicate-advice regressions, broader existing grammar
contexts, and a separately frozen eight-document evaluation. Run the same runner
with `--manifest tests/fixtures/writing-quality-documents/manifest.json`; follow
the [quality regression contract](testing/writing.md#writing-quality-regression-coverage),
including [suggestion relevance](benchmarks/writing-relevance-2026-09-20.md) and
[descriptive/existential context](benchmarks/writing-context-2026-09-20.md),
for dictionary, full/incremental, Ignore and Markdown Apply/Undo boundaries.

The [full typing inventory](benchmarks/editor-typing-inventory-2026-09-20.md)
records operation-count evidence and the installed-consumer audit. Its regression
ownership is in [editor testing](testing/editor.md#full-typing-inventory-regressions)
and [writing testing](testing/writing.md); fresh-parse comparisons protect
incremental rendering semantics alongside the native interaction matrix.

Optional editor wheel smoothing uses the pure/controller/adapter matrix in
`wheelScroll.test.js`, preference persistence in `state.test.js`, and one
real-wheel geometry workflow in `editorUX.spec.js`. See
[optional wheel scrolling](testing/editor.md#optional-wheel-scrolling).

The native editorial profile (`node scripts/profile-writing.mjs`) is required by
main CI, tag CI, and local release verification. It combines actual JavaScript
and Go grammar observations, covering cross-engine duplicates that JavaScript-only
fixtures cannot detect. See [writing regressions](testing/writing.md#writing-review-regression-coverage).


The UX recovery regressions are described in
[the workspace contract](testing/workspace.md#note-loading-search-and-recovery-regressions)
and [the editor contract](testing/editor.md#ux-recovery-and-narrow-writing-regressions).
They combine lower-layer failure sequencing with the existing keyboard-focus and
computed-layout browser boundaries, plus packaged native verification.
