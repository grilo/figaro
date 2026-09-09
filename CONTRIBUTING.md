# Contributing to Figaro

Thank you for helping improve Figaro. It is a Wails desktop application that
keeps notes in local files. Changes must preserve portable vault files, work
without a cloud service, and protect the user's edits.

## Development setup

Install the following before working on the project:

- Go 1.26.6 or newer
- Node.js 22.18+ on the 22.x line, or 24.11+
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

The tracked `.npmrc` installs Figaro's reviewed local test-tool package as a
regular dependency instead of a symlink. Keep `install-links=true` enabled when
refreshing `package-lock.json`; this gives npm 9 and newer the same clean-install
layout.

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

## Repository skills

Both skills live under `.agents/skills/` for repository discovery:

- [Prepare Figaro release](.agents/skills/prepare-figaro-release/SKILL.md) accepts
  `$prepare-figaro-release` or a natural-language release request. It prepares
  notes, recommends a version, and verifies a provisional candidate before
  asking for version/action approval. It does not treat a dependency bump,
  ordinary Git push, release question, or skill audit as a release request.
  Follow [Release process](#release-process) for the command and approval contract.
- [PKM / Markdown editor UX audit](.agents/skills/pkm-markdown-editor-ux-audit/SKILL.md)
  supports full application audits, focused interaction reviews, and source-only
  inspection. It copies its working note/image fixtures into an owned disposable
  vault before mutation, distinguishes Chromium from packaged native evidence,
  and reports coverage without requiring ten findings or an unsupported score.
  Focused audits inspect the requested area; source-only reviews do not claim
  runtime behavior. Audit findings do not authorize product implementation.

Detailed evaluation lenses and task suites are linked from the short UX skill
entry point and loaded only for the selected scope. Maintain references and UI
metadata with each skill. Review the trigger and approval cases in
[`tests/skills/scenarios.md`](tests/skills/scenarios.md) when changing behavior;
structural tests cannot prove that a model interprets approval correctly.

Read-only audits leave product files and the commit proposal alone. For completed
implementation work, review the full pending diff and write the proposed message
to the path returned by `git rev-parse --git-path COMMIT_TEMPLATE`. This also
works in linked worktrees where `.git` is a file. Configure the tracked hook with
`git config --local core.hooksPath .githooks`; do not set `commit.template`.
The hook supplies the proposal to a plain `git commit` so saving it unchanged
works, and preserves explicit messages passed with `-m`. Agents prepare the
proposal for the user; only an approved release action may commit on their behalf.

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

The frontend workspace composition root is `frontend/js/app.js`. Feature
adapters that need tab, editor, file-tree, preview, or save coordination expose
a narrow configuration port and let `app.js` supply it during eager startup;
they do not import `app.js` or `tabManager.js` to recover those operations.
Keep the first-party import graph acyclic—the architecture policy suite checks
both the graph and this ownership rule.

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

Keep Kanban planning dates separate from authored task content. Gantt's pure
models own matching, collision refusal, date movement, geometry, and pointer-zone
classification. Preserve distinct start-resize, center-move, and end-resize
targets on a one-day bar; derive gesture ownership from measured bar position
rather than trusting a webview's nested event target. Keep each visible dot
centered on its painted bar edge without moving the larger hit region out of
the bar. The native
adapter alone writes vault-local `.config/task-schedules.json`. Never add hidden
task IDs or special `due` syntax to Markdown. Editor date pickers insert ordinary
date links in the preferred style, never a source-derived deadline. All deadline
readers must use the same metadata projection. First-start
policy belongs in the pure task transition model; injected write sequencing
must restore dates if note replacement fails. `@date` uses normal conflict-aware
save handling before attaching metadata to the exact saved source; plain prose
only receives the link. Date-only source edits rebind uniquely matched schedules
without changing start/end, rejecting collisions and rolling back metadata when
the note write fails. Editor pickers replace a sole date/tag on the current line;
with multiple values they preserve them and add the selection. New workspace
telemetry belongs in the application status bar, not an additional footer.
Calendar and Gantt must share the timeline viewport's atomic content/scroll
commit. Do not defer marker restoration to another frame or remount retained
days and rows during edge paging. Preserve pending wheel destinations and pan
origins when rebasing after a delayed load. Date choices persist immediately;
Outside clicks and Escape dismiss their UI, not an operation already submitted
to persistence. Treat the portalled calendar as part of its owning inspector;
Escape closes the innermost picker first. Release document dismissal listeners
when the inspector closes and never steal an outside click's focus on completion.
Board cards keep Start and Due as separate clickable pills; changing one must
preserve the other through a pure schedule-update plan. Their top-right menu
clears both dates or removes the board tag, and card rendering does not repeat
the source filename.

For missing `.drawio.svg` Markdown images, keep vault-path resolution in the
pure creation model, including missing-versus-existing action classification;
valid SVG fallback classification and data-URL construction remain pure as
well, so a failed browser image request can recover without another effect;
keep create/open/background-refresh sequencing in the injected use case and
mounted CodeMirror/button state in the image adapter. Do not add filesystem or
tab effects to the widget or weaken the backend's vault containment checks.
Keep authored image-hint parsing, serialization, intrinsic-fit, and resize
constraints in `core/markdownImageModel.js`; the CodeMirror adapter may own
only DOM measurements, pointer capture, the source transaction, and rendered
geometry. Standalone image/Draw.io guide recognition and fold ranges belong in
the pure block guide model; original-size reset and direct Draw.io editor
activation remain injected guide callbacks. A folded image must suppress both
its rendered replacement and any cached source-height line decoration so the
native fold row owns the complete footprint. Keep
the file-tree's post-delete path signal ahead of discovery refresh and retain a
fresh Draw.io preview URL per image-field generation so successful loader
caches cannot outlive deletion.
File-diagnostic refreshes must compare normalized snapshots before publishing;
an unchanged snapshot must not remount rows or interrupt keyboard focus, an
open context menu, or a managed-file double-click. Deferred menu focus must
retain the stable tree container rather than the originating DOM event.
Keep table-backed chart validation, type inference, reversible metadata,
Vega-Lite generation, special-mode calculations, and resize bounds in
`core/vegaLiteChartEditorModel.js`. The chart modal may own approved UI
primitives and preview effects; the live-diagram adapter may own pointer capture
and one release transaction. Do not make hand-written Vega-Lite appear
reversible unless its complete canonical specification still matches the
managed model, and do not add a chart-only PDF renderer. Keep native-webview
container measurement in the shared diagram adapter, prove its temporary
target is connected and cleaned up, and surface renderer or empty-geometry
failures as an announced modal state rather than accepting a blank preview.
Keep shared Table/Mermaid/Chart modal sizing and viewport-clamping policy in
`core/editorModalResizeModel.js`; the DOM adapter may own measurement, pointer
capture, keyboard focus/readouts, and temporary inline geometry. Do not attach
that opt-in adapter to generic dialogs, and keep editor layout breakpoints based
on the modal container so a user resize reflows without changing pure editor state.
Keep Mermaid's decision to apply an ephemeral application theme in the pure
style model and theme-token reads in the shared renderer adapter. Live/editor
calls may request application appearance, but printable calls must retain the
authored source and a distinct cache key.
Reuse the shared Kanban-backed palette adapter for chart colors and the approved
editable stepper for numeric guide adjustments instead of introducing native
controls. Keep visible-series legend membership, palette order, and four-side
placement in the pure chart model; keep fixed first-column Cartesian category
ownership, explicit no-sort nominal encodings, and quantitative-series settings
there as well. Pie and Waterfall
may use the approved variable-list combobox for their independent category
selection. Use the
approved eye/eye-off icon button for reversible visibility rather than a native
checkbox or a feature-local control. Do not introduce native
color or number-control presentation.
Keep threshold rule/text layers on their selected quantitative scale without an
axis override; the data-series layer remains the sole owner of axis visibility.
Keep Cartesian regression over the model's collision-safe hidden authored-row
index, then look its endpoints back up to the visible first-column labels; do
not make nominal labels themselves the numerical predictor.
Disabled chart options must put one actionable explanation on their complete
focusable label; do not add decorative underlines or separate help glyphs.
Use the approved pill-shaped segmented control for one to four short fixed
choices such as graph filters, axis, or legend placement. Its shared highlight
must follow `aria-pressed`; reserve the select-combobox adapter for variable or
longer lists such as table-column and mark selection.
Use `.ui-field--quiet` for borderless search surfaces such as Search notes and
Graph, and `.ui-picker--quiet` when a select-only editor control is intended to
match Settings. Keep feature selectors to geometry and placement; do not
recreate their hover, press, focus, open, selected, or disabled paint. Rows
that must remain geometrically stationary on pointer press should consume the
approved menu-item primitive rather than the translating button primitive.
The themed shell and restored active buffer may become interactive while eager
vault indexing, writing engines and their dictionary, tree construction, and
parser warming continue. Install the close guard and restore Auto-Save before
revealing the editor. Disk-save acknowledgements release subsequent writes;
Git and index follow-up work must not own that queue. Initial vault scans build
private snapshots without holding the lock needed by saves, and reconcile
concurrent changes before publication. Saved
interaction and geometry preferences are different: start their independent
reads concurrently and keep them behind the startup-hydration barrier so the
restored editor's first visible frame is already authoritative. Restored tab
activation must await the editor document-session mount before the two-frame
presentation reveal begins. Preserve that short critical path as well as the
later `window._appReady` boundary.
Startup timings use injected clocks and nonblocking reporting. Keep stage names
fixed and content-free, and never await diagnostics delivery or disk writes.
Use **Settings → Vault care → Open startup logs** to inspect a native launch;
see [startup troubleshooting](docs/GETTING_STARTED.md#troubleshoot-a-slow-launch)
for paths and the recorded fields.

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

Prepare a reviewable proposal before choosing a final version. The release skill
described under [Repository skills](#repository-skills) reviews the complete
pending work, recommends a major/minor/patch bump from the highest stable tag
reachable from `main`, and presents all three exact candidate versions. Compatible
fixes suggest patch, compatible new capabilities suggest minor, and incompatible
supported workflow/data changes suggest major. The recommendation is evidence
for the user's choice, not approval to release.

Verify a provisional candidate without committing or publishing:

```bash
make release-check VERSION=vMAJOR.MINOR.PATCH
# or, for a provisional bump from the highest stable tag reachable from HEAD:
make release-check minor
```

This copies npm/Wails metadata and the changelog to a disposable directory,
synchronizes the candidate there, prints and validates its exact release-note
body, then runs the shared complete verification suite. It leaves repository
release metadata, the Git index, commits, tags, and remotes alone; builds/tests
may update generated artifacts. Checks can run on a feature branch. Failed or
unavailable checks must be reported, and required native checks remain separate.
The user reviews notes, pending-change scope, verification results, and the version
recommendation before choosing the version and approving local finalization or
publication. Selecting a version alone is not approval for either action.

Use the release target from `main` after the version and publication are approved:

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
resumes a matching tagged release after a failed push. After approval for a local
commit and tag, use `make release-local patch` or
`make release-local VERSION=vMAJOR.MINOR.PATCH` to stop before the push. Local
approval does not authorize publication. Resolve the chosen version once and use
the explicit `VERSION` form for execution and retries: rerunning a bump after
tagging would select the next release instead of resuming the approved one.
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

`$prepare-figaro-release` and natural-language release requests share the same
approval contract. Complete the available preparation before asking for the
version choice and go-ahead. A clear approval in response to a proposal covers
the version and action named there; do not request another confirmation unless
the scope changes materially. Pushing the tag starts the GitHub release workflow;
successful pushes and successful workflow publication are separate results.

The tag workflow runs the full Go test suite on native Windows and macOS runners
before building their packages, in addition to Linux release verification. The
embedded Vale module is tested separately without executable preparation. All
platform tests and builds must pass before the publication job can run; a Windows binary compiling successfully is not proof
that Windows behavior passed. Also inspect the ordinary CI run for the same commit
when reporting release health, since it includes checks such as the dependency
audit beyond the tag workflow. Local release verification tests the current host;
cross-compiling does not replace these native platform runs.

The workflow publishes Linux x86-64, Windows x86-64, and universal macOS
archives, plus `SHA256SUMS`. Each archive includes `README.md`, `CHANGELOG.md`,
`LICENSE`, and `THIRD_PARTY_NOTICES.md`. Builds are currently unsigned.

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
./scripts/check-go-coverage.sh
go test -race . ./internal/... ./cmd/...

# JavaScript and CodeMirror behaviour
npm run lint
npm run test:unit
npm run test:coverage

# Only when the change affects a real browser boundary such as geometry,
# selection/focus, clipboard/composition, frames, or printed output
npx playwright install chromium # first time only
npm run test:pdf
```

`npm run test:unit` starts with the test-integrity scan. Tests must exercise an
imported production rule, use case, adapter, or component rather than rebuilding
the expected algorithm locally. Shared native write mocks also require an
explicit per-test or narrowly scoped suite response before they can be called;
the default read-only fixture is recreated between tests and clones the shell
from `frontend/index.html`.

When the browser check fails on GitHub, both the ordinary CI workflow and the
release-verification workflow upload a `playwright-diagnostics-*` artifact for
14 days. Download it from the failed run's **Artifacts** section: the HTML
report is under `playwright-report/`, while `test-results/` contains the
retained trace, failure screenshot, and test attachments. Successful runs do
not create this diagnostic artifact.

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
generates an ignored 10,000-document fixture from two filesystem source
templates, adds same-scale content variants in the browser, and runs
cold-rebuild, filesystem, sparse-link, Git-state, large-collection keyboard,
and document-switch oracles before recording backend and browser measurements.
Absolute timings remain diagnostic; document switching uses repeated same-run
plain/content medians with a generous relative regression ceiling. See
[the huge-vault procedure](docs/TESTING.md#huge-vault-stress-profile) and
[the reference audit](docs/HUGE_VAULT_STRESS.md).

For changes to Raw Text Preview, the global tab-size/indentation policy, sticky headings, Markdown image resizing or source-reveal geometry, Markdown block guides, activity dates, or their writing-column rail geometry,
raw-source Mermaid diagnostics, the Mermaid Editor, current-note heading
completion, frontmatter Properties navigation, Vim rendered-block navigation, or per-tab cursor
persistence, follow the
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

Apply the writing-surface border budget before adding an outline: inactive
rendered content and compact metadata should prefer spacing, typography, and a
tonal surface. Keep borders when they communicate structure (for example a
table grid or expanded form), keyboard focus, validation/error state, risk, or
a selection state that has no independent tonal, typographic, or semantic cue.
Review both resting and relevant/interactive states in the catalogue; removing
a decorative border must not alter control or measured CodeMirror geometry.
For quiet pickers, pointer-open state must not imitate keyboard focus: use a
tonal open state and reserve the halo for `:focus-visible`. Preserve automatic
forced-colors borders and system-color focus/selection cues whenever normal
theme borders are removed.

Use `floatingMenu.js` for select-style popup menus so transformed, scrolling,
or clipping ancestors cannot displace them. Keep the menu attached to its
trigger through the pure placement plan, restore it to its owner on close, and
test the specialized controller against that lifecycle. Result regions that
are deliberately part of a larger search/help surface stay inline.

Use `data-ui-tooltip` for a new concise hint, or `setTooltip()` when its text is
updated programmatically. The eager tooltip controller also adopts ordinary
`title` attributes for existing and dynamically mounted controls, but new code
should prefer the explicit design-system attribute. Keep `title` on iframes
when it names the embedded document rather than providing a hint. Rich hover
content may add a feature class beside `.ui-tooltip`; it must not repaint the
shared background, border, radius, shadow, typography, or text color. CodeMirror
autocomplete and diagnostic panels are interactive popovers and retain their
separate library semantics.

Tooltip lifecycle changes must exercise owner removal and stationary-pointer
reflow, not only `mouseleave`: a visible body-level tooltip must disappear and
release `aria-describedby` whenever its owner is detached or no longer occupies
the pointer hit target.

Use the approved `.ui-skeleton` primitive for content-shaped loading
placeholders. Keep month-grid, row, column, and card dimensions in the owning
feature, hide decorative placeholder blocks from assistive technology, and put
the loading announcement plus busy lifecycle on the containing view. Do not
recreate the shimmer or its reduced-motion fallback in feature CSS.

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
Personal spelling words are separate vault data in
`.config/spelling-dictionary.json`; the application validates and atomically
adds words without modifying bundled Hunspell resources or note contents.

Writing review preparation runs `scripts/vendor-writing.mjs` for the pinned
remark/retext runtime and notices, then bundles the writing and activity workers.
Vale's adapted source is vendored in `third_party/vale` and compiled by Go; its
27 YAML rules are embedded from `internal/writing/styles`. Native and cross builds
need no Vale executable download or target preparation. Generated browser workers
remain ignored; obsolete local CLI `.gz` files are ignored but never bundled.
See `third_party/vale/README.md` for source provenance, update checks, and limits.

Smart rich paste uses the exact Turndown version in `package.json` and copies
its browser ESM plus MIT license through `scripts/vendor-turndown.mjs`. Keep the
import maps, preparation fingerprint, size/license dependency-policy test, and
generated browser artifact synchronized when updating it. Paste repairs must be
based on explicit clipboard structure rather than vendor names or broad prose
regular expressions; exact plain/internal fallback is part of the behavior
contract.

The printable Markdown renderer currently targets Markdown-It 15.0.0. All ten
bundled `@mdit` packages declare `markdown-it ^15.0.0`: the direct anchor,
footnote, KaTeX, mark, subscript, superscript, and task-list plugins, together
with the transitive helper, inline-rule, and TeX packages. Treat a Markdown-It
major upgrade as a coordinated renderer migration: first verify every peer
range, then update the separately vendored core runtime and run the complete
preview/export contract. A root `package.json` bump by itself does not replace
that runtime. Markdown-It 15 no longer publishes Figaro's browser-global input,
so `scripts/vendor-markdown-renderer.mjs` builds the locked ESM core into that
adapter alongside the plugin bundle. The Jest transform toolchain uses Babel 8
and therefore sets the repository's exact Node minimum; Jest may retain its own
isolated Babel 7 copy for internal syntax handling without changing that
application toolchain. Jest 30's published current-Node syntax preset does not
isolate those Babel 7-only plugin peers, so the behavior-equivalent,
MIT-licensed compatibility copy under
`tools/babel-preset-current-node-syntax/` adds an exact nested Babel 7
dependency. Remove that copy only after the upstream preset provides the same
clean Babel 8 peer graph, then update the dependency-policy regression and
notices together. That regression must import the installed package name, not
the source path under `tools/`, so a developer's ignored nested `node_modules`
cannot conceal a broken clean-install layout.

Print-only Markdown token policies belong in
`frontend/js/printMarkdownRenderer.js`, followed by `npm run vendor:markdown`;
do not reinterpret the editor syntax to achieve printable behavior. The
standalone-body-`---` page-break rule must retain focused cases for frontmatter,
Setext headings, and the visible `***` / `___` alternatives.

Table rendering belongs to Figaro rather than a third-party table editor.
Keep `liveMarkdownTablePlugin.js` limited to CodeMirror syntax ranges,
selection state, rendered-cell pointer adaptation, folding, and measured block
replacement. Source row/column parsing and caret offsets belong in the pure
`core/markdownTableEditing.js` parser. Modal draft operations, merge-coordinate
rules, contextual disabled reasons, and source serialization belong in pure
`core/markdownTableEditorModel.js`; `markdownTableEditor.js` may own only modal
DOM, focus, temporary history, and the single revalidated Apply transaction. Keep
`markdownTableRenderer.js` as the DOM boundary that invokes the canonical
Markdown-It renderer and applies the pure `core/printableTableModel.js` plan
for `<br/>` line breaks and anchored `^` row spans plus the editor model's
adjacent rectangular-merge metadata. Live preview, PDF Preview, and generated
PDFs must share focused renderer/model tests. Do not put table structural
commands back into the ordinary editor context menu.
The vendored `codemirror-live-markdown` package still contains optional
table helpers, but Figaro does not activate them; do not reintroduce a
second table decoration provider without an explicit architecture decision.

The CodeMirror color-extension ESM artifact imports one small Babel helper that
its package does not declare. `scripts/vendor-codemirror-color.mjs` applies an
exact-match in-memory replacement before bundling, so the generated browser
asset is self-contained without a production `@babel/runtime` dependency. The
transform deliberately fails if an upstream release changes that reviewed
import; update the transform and its dependency-policy regression together.

Some browser libraries, including Mermaid, are checked in separately from the
root npm dependency graph and may embed their own packages. After changing a
vendored bundle, run `tests/frontend/unit/vendoredBrowserSecurity.test.js` as
well as `npm audit`; the former inventories known embedded versions and proves
that vulnerable Mermaid YAML releases remain behind Figaro's pre-parse guard.
The vendor script also pins `@mermaid-js/examples` 1.3.0 and checks its browser
ES module plus MIT license into `frontend/vendored/mermaid-examples/`. Keep that
catalogue version aligned with the bundled Mermaid parser and run the Mermaid
Editor and renderer browser contracts, which render every shipped template and
verify the offered styling effects, before updating either side.

## Repository layout

```text
main.go, go.mod, wails.json  Thin executable/embed boundary and project configuration
tools/                       Reviewed development-tool compatibility sources
internal/desktop/            Wails assembly, bound App capabilities, and adapter tests
internal/vault/              Root-scoped filesystem primitives
internal/links/              Pure Markdown link rewriting
internal/history/            Local Git history and auto-commit service
internal/activity/           Pure passage attribution and note-move identity
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
- Audit every affected document in the same change. Keep concise workflow
  introductions in `README.md`, practical steps in the [user guides](docs/README.md),
  the detailed contract in `docs/PROMPT.md`, and update the
  architecture, testing, live-preview, PDF-styling, or contributor guides
  whenever their subject changes. Search for stale defaults, counts, names,
  commands, versions, and limitations before considering the work complete.
- Prefer root-scoped vault filesystem operations over absolute-path checks.
- Preserve unsaved editor content during asynchronous or filesystem-driven
  changes.
- Add a regression test for a bug fix, especially for file-tree selection and
  multi-item moves, sessions, rendering, or concurrency.
- Test each acceptance case at the lowest capable layer: pure logic first,
  use-case fakes for sequencing and failure, real adapters/components for their
  boundary, and a minimal browser scenario only for behavior lower layers
  cannot represent. Generic smoke coverage does not replace a named regression
  test, and end-to-end duplication does not replace focused lower-layer tests.
- Every CodeMirror extension, widget, keymap, or layout change must retain
  focused cursor-movement coverage (including feature keys), the block-widget
  geometry contract when applicable, and the native-webview checks in
  `docs/TESTING.md`.
- Interactive replacement widgets must also prove an accessible action name,
  keyboard/pointer parity against authoritative source, focus continuity after
  remounting, and their effective pointer-target geometry.
- Keyboard viewport changes must cover a long wrapped note with rendered
  blocks while moving down, reversing upward, and moving down again in both
  normal Arrow Up/Down and Vim `j`/`k` paths. Page Up/Page Down must also
  recover the viewport. The selected line must remain in the primary viewport,
  visible, and free of stale virtual gaps without mouse scrolling.
- Mermaid rendering changes must cover virtualization explicitly: scroll through
  a long note with repeated Mermaid source in both directions, prove identical
  source is rendered once after caching, and verify generated SVG ids remain
  unique after remounting.
- Kanban virtualization or workspace-lifecycle changes must sample intermediate
  animation frames while crossing multiple card-window boundaries and during a
  warm reopen. Assert populated paint, monotonic logical movement, stable
  measured coordinates, retained overlapping node identity, and absence of
  scroll-time hover trails; a settled end-state assertion is insufficient.
- Mermaid geometry changes belong in `core/mermaidDiagramModel.js`; the live
  adapter may own pointer capture but must update source only once on release.
  Keep the resize target centered on the visible canvas edge rather than the
  measured wrapper boundary. Preserve the equal-height source placeholder,
  Arrow Up/Down, mouse placement, drag selection, one-step Undo, and matching
  PDF figure height.
- Mermaid Editor styling changes belong first in the pure adaptive descriptor
  and source-transform tests. Preserve unrelated frontmatter, refuse YAML forms
  the transform cannot merge safely, and assert parsed-node membership,
  native/class style restoration, exact preset detection, and repeating XY
  palette updates below the browser layer. The consolidated renderer matrix
  must render all 32 types/76 templates and all presets and prove each offered
  color paints an SVG mark; parser acceptance alone is insufficient. Flowchart UI
  changes must also exercise a long node list: the active node editor remains
  visible on first opening, the chooser expands to fit every node with only
  the Style panel scrolling, compact panes stay above the footer, and
  Arrow/Home/End selection reveals and focuses the target row. Ordinary style
  choices must also preserve focus; an open palette must survive preview
  refreshes, Escape must close it before the dialog, and closing the dialog
  must clean it up.
- A tab-size change must keep the pure 2–8/default/step rules, backend restart
  persistence, Settings rollback and bounds, root Markdown and code facets,
  Vim `>`, Mermaid, rendered GFM tables, rendered-code, Raw Text Preview, Arrow Up/Down,
  mouse, drag-selection, and native rendered-code scrollbar contracts in sync.
- Eagerly load bundled feature code during startup. Do not hide dependency
  cycles or postpone feature initialization with interaction-triggered dynamic
  imports.
- Keep user-facing workflow summaries and guide links in `README.md`, practical
  instructions in the relevant user guide, and the detailed behavior contract
  in `docs/PROMPT.md` in the same change. The README introduces the product;
  avoid appending pixel measurements, migration history, or test internals.

## Licensing contributions

Figaro is distributed under the [GNU General Public License version 3 or
later](LICENSE). By contributing material to this repository, you agree that
it may be distributed under those terms. Keep third-party notices and vendored
dependency licenses intact.

Writing suggestions use document-specific lens combinations, with Proofreading
controlling spelling. Keep preference migration and example selection pure;
the rooted adapter saves version 3 document choices atomically without discarding
other notes or unknown fields. Preserve old YAML without applying its retired
spellcheck controls. Keep inline/sidebar examples synchronized and render only
validated fixes as Apply actions. The user-approved `.ui-suggestion` primitive
owns the rounded, borderless suggestion background; feature CSS owns layout.


Writing-lens preference changes must keep language-support policy in the pure
model, use the existing Settings combobox, and test that unsupported checks
are unchecked and disabled. Disabled reasons come from the pure model and use
the shared tooltip on both checkbox and label, with an accessible description.
New lens rules belong in the pure prose model; keep article context out of
protected ranges and require safe, contiguous mappings for fixes. Consistency
must leave either authored mixed-term form available; the separate reviewed
technical-name rule offers canonical capitalization. Keep terminology defaults
and file configuration disabled, and do not add number/unit spacing rules:
attached forms such as `8.1Mib` are intentional. Unmatched opening punctuation
and undefined acronyms remain advisory with general examples. Preserve the
pinned acronym exceptions and eligible lowercase definitions without guessing
expansions; equivalent soft wraps must stay within one eligible prose region,
and ordinary capitals from the bundled lowercase dictionary must not become acronym warnings. Cover hyphenated and conventional eX expansions while keeping protected-region guards. Initialize the real textlint kernel/parser before worker readiness
and test source mapping through the bundled adapter. Its sentence-spacing check suggests
one same-line space without touching line breaks; diacritics remain optional
contextual alternatives. Readability remains advisory at its explicit length
and formula thresholds; keep length and complexity concerns distinct, merging
only equivalent advice with its native sources retained.
Keep formula advice out of short sentences, headings, tables, and protected
content. The shared checkbox list has five groups: Proofreading, Clarity, Directness,
Inclusive language, and Formulaic writing. Preserve the nine internal check IDs
and exact older subsets. Group actions enable supported members together; language
changes clear unsupported members without reselecting them on return. A partial
group uses the existing checkbox and Partial badge; its enabled checks appear in
the accessible description and info help. Keep the visible summary to one short
sentence. Help reuses approved icon buttons, menu surfaces, tooltips, and shared
Before/After examples. Provide three or four contextual illustrations for supported
checks, filter by language, and keep limitations explicit. Examples are editorial
guidance, not replacements for the current note. Preserve focus and portal ownership
through pane/Pure closure, document changes, and preference updates. Floating
help must retain its outer dimensions during repeated internal scrolling. Include
borders and scrollbar chrome when turning scroll metrics into border-box sizes;
internal scroll events must not trigger unnecessary placement work.
Keep inclusive replacements restricted to reviewed generic expressions; do not
infer pronouns or identity descriptions. Article source-range safety and
pronunciation correctness need separate positive/negative adapter fixtures.
Pin packages and selected Vale rule hashes with their notices. Keep quotation
convention decisions pure and validate every changed delimiter; quote fixes
may cross formatting only while preserving all enclosed source bytes.
Proselint advice must not fabricate replacements or turn qualifiers into errors.
Cover language/selection persistence together, save
failure and retry, returning to a supported language without reselecting lenses,
and older preferences loading without an unsolicited write. Bulk preference changes must drain pending writes and
use the atomic settings plan; test metadata preservation and retry below the
browser boundary. Right-pane modes register their own close/open adapters with
the coordinator. Keep session width common to every mode and restore a pane
only after the corresponding tab owns the mounted buffer. The footer consumes
the same right-pane width; verify aligned buffer metrics and the physical window
resize grip through docking, compact overlays, resizing, closing, and Pure mode.

Writing review decisions belong in the per-note durable decision store, separate
from lens defaults and the spelling dictionary. Keep matching policy pure:
remap intact targets through known edits and require a unique full-context or
distinctive unchanged-side match on reload. Use actual editor change ranges;
target edits persist an exact-context-only requirement. Fail open for changed targets and
ambiguous contexts. Reanchor writes update existing identities only, preserving
metadata and never resurrecting removed decisions. Acronym acceptance affects
only its canonical undefined-acronym concept and selected language. Preserve
pessimistic saves, idempotent retry, stale-source guards, document ownership,
and reversible per-record controls in both the pane and Pure picker. Definite
capacity rejection must permit removal; uncertain writes require exact retry
or explicit reconciliation. Reload must wait for in-flight tracking before
installing the stored set, preserve queued edits without rewinding source, and
match worker results by stable record ID. Cover removed, reordered and newly
loaded records, tracking failure, repeated reload, and disposal. Test
restart through rooted storage, not only browser mocks. Do not migrate decision
records on rename without a separate collision/preservation contract.

Group identical review suggestions while retaining every occurrence. Bound
rendered cards independently of passage count. Bulk replacement is a pure
all-or-nothing plan for reviewed single-choice kinds. Spelling additionally
requires an explicit reviewed-correction flag; one dictionary candidate alone
never authorizes bulk changes. Execute the plan with one guarded
CodeMirror history transaction. Do not generalize it to contextual advice.
Reuse approved buttons for occurrence navigation and disclosure; show writer
explanations before lazily created technical diagnostics. Keep actual focus,
popup containment, and native Undo/Redo checks in the existing writing scenario.


Writing input handlers may only capture immutable source readers and numeric
change ranges. Schedule coalesced tasks, never document scans in input callbacks
or their microtasks. Keep prose projections/raw observations in the prose worker;
resolve findings and presentation groups there, and compute saved/pending anchor
identity and inactive IDs in the separate decision worker. Inject those ports in
use-case tests; do not add a synchronous production fallback. A replacement
prose worker must rebuild explicitly required evidence before reporting a
complete review. Failed recovery preserves available spelling with partial
status and Retry; later engine completion cannot conceal the missing prose.
Test restart between analysis and resolution, failed recovery/retry, and stale
recovery after source/ownership/configuration changes below the browser layer.
Do not mark an editor snapshot as observed before its note controller can
receive it. Cover mount-before-selection and the first nearby edit after Ignore
in component tests. A failed decision reload must exit Loading independently
of tracking failure; Retry restores the authoritative set before queued tracking.
Render writing hints inside existing link labels through pure range/segment
plans and a viewport-bound DOM adapter; reuse the current underline and popup,
preserve activation and cursor behavior, and never decorate destinations.
Pending Ignore
commands must remain idempotent while their separate anchors follow edits. Test
deleted targets during a delayed save and confirm the safe anchor reaches storage
before the action finishes. Share wiki syntax protection across prose and spelling,
including fragments and embeds; only explicit aliases are eligible wording.
Spelling eligibility uses the bundled pure Lezer Markdown parser, not a
line-based approximation of code or reference syntax. Keep its UTF-16 ranges
shared by the spelling adapter and resolver; reject out-of-prose spelling
observations before they produce actions. Preserve implicit link/image reference
keys with advisory-only hints and retain editable explicit labels. Test both
English dictionaries against valid possessives and misspelled stems, preserving
the original suffix and keeping Spanish policy separate. Full-source parsing and
resolution stay in workers during analysis, never in typing handlers.

Slopless changes must update the explicit rule imports/pure policy and
[complete included/excluded inventory](docs/WRITING_SLOPLESS.md). Keep rules
English-only, eager and worker-local; test every selected real rule, protected
source ranges, individual curly-mark mapping, stable duplicate identities,
examples and reversible Ignore. The imported subset is advisory: never forward
upstream blanket rewrite instructions or typography preferences as mandatory fixes.

Package selections must not exclude a useful rule solely because another lens overlaps. Review advice separately from Apply safety. Update the full package inventory, native hash manifests, and specific real-adapter fixtures together; preserve identity, pronunciation, source, and explicitly requested unit-spacing protections.

The approved writing-lens disclosure uses `createDisclosure` and `.ui-disclosure`;
do not recreate its resting, hover, pressed, focus or motion styles in feature
CSS. Preserve a native button, aria-controls/expanded, immediate inert/ARIA
closure, focus return, and reduced-motion behavior. Keep note-specific expansion
policy in `writingLensesExpansion`, and do not animate configuration loads or
rebuild the chevron when only the selected count changes.

### Writing corpus safety

Preserve parsed emphasis, quote/possessive boundaries and numeric compounds in
spelling. Mask technical identifiers only after separating Markdown delimiters.
Keep URL-enclosing punctuation in the prose projection. Review new vocabulary
entries separately from correction confidence; recognition never authorizes a
replacement. Context guards must have positive controls and remain independent
per lens. Both sentence-length paths check the mapped sentence above 30 words.
Keep reverse/plural acronym recognition syntactic and within eligible prose.
See [the corpus correction contract](docs/WRITING_CORPUS_FIXES.md); changes need
real dictionary/package regressions plus pure policy and bulk-planner coverage.

### Writing continuity, performance and editorial evaluation

Route file-tree path mutations through the writing storage barrier. Keep document
entry identities across renames; do not copy captured old paths into delayed
persistence callbacks. Backend metadata relocation must preflight both records,
preserve destination records and unknown fields, and retain rooted rollback tests.

When optimizing package work, preserve every included rule and compare complete
observations and source maps against the pinned implementation with
`node scripts/verify-writing-performance.mjs`. Regenerate the runtime using
`node scripts/vendor-writing.mjs`; never patch node_modules or generated bundles
by hand. `node scripts/profile-writing.mjs --long` adds 25k/50k-word workloads.
Performance equivalence does not prove editorial usefulness: follow the
[corpus plan](docs/WRITING_CORPUS.md) for licensed sources, independent human
annotations and a held-out evaluation before tuning advice.

The [integration report](docs/VALE_INTEGRATION.md) records the current native
checks and limitations. The [embedded Vale evaluation](docs/VALE_EMBEDDED_PROTOTYPE.md) records the original
prototype. Production profiling now uses `cmd/writing-profile` through
`node scripts/profile-writing.mjs --long`. The optional prototype comparison tool
can still download a checksum-verified upstream CLI into a disposable directory;
normal builds and tests do not use it. Preserve the pinned CLI alert fixtures,
race-tested lifecycle checks, and independent native platform validation.

Catalogue generation normalizes trailing whitespace only inside parsed JavaScript comments; literal contents remain byte-for-byte unchanged. The build and its exact-output check share that formatter.

Pinned Vale rules under `internal/writing/styles/` retain their exact source bytes
on every platform through `.gitattributes`; their `SOURCE.json` hashes remain
mandatory. The upstream Microsoft `SentenceLength.yml` ends in a blank line,
so only that file permits `blank-at-eof`; other whitespace checks still apply.

CI's authored Chromium PDF fixture sets `FIGARO_BROWSER_PDF_ARGUMENTS=--no-sandbox`
for that single step on its disposable Ubuntu runner. This test-only override
accommodates the runner's AppArmor policy; do not add it to packaged browser
arguments or use it as a global workflow environment setting. Desktop tests
canonicalize temporary roots so macOS filesystem aliases do not skew file URLs
or synthetic watcher events.
