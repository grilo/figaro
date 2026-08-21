# Figaro architecture notes

This is a decision-oriented companion to the product specification. It records
the parts of Figaro whose implementation is intentionally less obvious than a
straightforward feature description. It is not an exhaustive API reference.

## Boundaries and source of truth

Figaro is a Wails desktop application with three deliberately separate layers:

- Go owns vault-scoped filesystem operations, settings, session repair,
  history, native window integration, and browser-backed PDF export.
- The frontend owns the workspace UI, CodeMirror editor, transient editor
  state, rendering, and accessibility behavior.
- The vault is the source of truth for notes and files. Vault-specific settings
  and workspace state live beneath its `.config/` directory rather than in a
  database.
- Device-specific application state is the deliberate exception: native
  window state and the selected PDF-browser executable live in the operating
  system's per-user local application-data directory and are never written
  into or derived from the selected vault.

The Wails asset server embeds `frontend/` at package-build time. Backend code
may use an on-disk fallback during development, but a released application must
not depend on a package manager, CDN, or source checkout at runtime.

The composition root separately embeds `wails.json`, validates its
`info.productVersion` through the pure `internal/appinfo` parser, and injects
that immutable value into the Wails facade. The Settings application-version
use case then reads it through the normal backend adapter and presents it only
while the requesting Settings panel is active. Packaged binaries and the About
card therefore share the release metadata source instead of maintaining
another version literal.

Release publication uses the changelog as its single editorial source. The
pure `scripts/releaseNotes.cjs` parser selects one bracketed dated version,
validates its Keep a Changelog category order and non-empty bullet groups, and
returns only that release body. The `.mjs` CLI owns file I/O. Local release
preparation runs the same parser after metadata synchronization and before any
commit or tag; the tag workflow runs it again before verification and uses the
result as the GitHub release body. Creation and retry therefore publish the
same curated Added/Changed/Fixed content rather than GitHub-generated commit
summaries. The metadata synchronizer owns version/date movement and comparison
links from 1.14.0 onward; historical headings remain untouched.

## Design-system review surface

`frontend/design-system/` owns the canonical token contract,
`primitives.css`, semantic theme surfaces, and the approved component registry.
Both the production application and the static catalogue eagerly load the same
ordered CSS modules recorded by `style-manifest.json`: token defaults first,
base/shell/workspace/editor and focused feature modules next, approved
primitives after feature CSS, and stable theme-surface selectors last. Feature
selectors may keep behavior and deliberate layout dimensions but cannot
redefine primitive state presentation. `frontend/styles.css` is only a
compatibility aggregate for standalone consumers; application startup uses
explicit links, so it does not defer module loading through CSS imports. The
catalogue applies one existing theme stylesheet and renders mostly static
specimens with production classes. A specimen with a meaningful open state
reuses its eagerly imported production controller:
select-only controls use `selectCombobox.js`, retaining the native select as
state while replacing the host-painted popup with the same themed listbox used
by Settings. `catalog.css` is limited to the page shell and to containing open
menus, dialogs, and loaders for inspection.

`approved-components.json` is the architectural gate for the fourteen accepted
families. Extending it with a family, primitive, or visual variant requires
explicit approval before implementation. Focused tests verify that every
registered selector is implemented in `primitives.css`, that no unregistered
`.ui-*` selector appears there, and that both production and review surfaces
load the canonical asset.

The approved tooltip family is split at the same deterministic/effect seam.
`core/tooltipModel.js` decides below/above placement and viewport clamping from
plain rectangles. The eagerly initialized `tooltip.js` adapter adopts ordinary
static and dynamically mounted `title` hints, preserves iframe accessible
names, owns hover/focus/Escape lifecycle and `aria-describedby`, and renders one
body-level `.ui-tooltip`. Rich Calendar, managed-file, and Markdown-link hints
reuse that visual primitive while retaining only feature content and placement
hooks. CodeMirror diagnostics and autocomplete remain separately themed
interactive popovers rather than being coerced into hint semantics.

The selector reads `frontend/themes/manifest.json`, so theme membership has one
source of truth. Manifest normalization, safe stylesheet-path construction,
and multi-word catalogue matching are pure functions in
`themeCatalogModel.js`; `catalog.js` owns fetch, DOM indexing, link replacement,
and computed-style display. This preserves the same logic/effect direction as
the application even though the catalogue is a developer-facing surface.

`catalogEntry.js` imports that canonical manifest and is eagerly built into a
classic `catalog.bundle.js`, allowing the same initialized catalogue to run
from `file://` without module-fetch or local-JSON CORS failures. Relative HTML,
stylesheet, font, icon, and theme paths keep the artifact portable between
direct-file and local-server use; the generated bundle contains no second
hand-maintained theme list.

Document-tab ordering follows the same dependency direction. The pure
`tabReorderModel.js` owns movement thresholds, pin-group constraints, and the
resulting order; `tabManager.js` translates pointer events into that model and
owns DOM feedback plus session persistence. Figaro therefore does not depend
on native HTML drag-and-drop behavior that differs between desktop webviews.

Default semantic values and optional art-direction surfaces live in
`frontend/design-system/tokens.css`; `theme-surfaces.css` is the only shared
selector layer that consumes the art-direction tokens. Every file in
`frontend/themes/` is therefore a token-only `:root` override. The required
palette and optional surface keys are machine-readable in
`theme-contract.json`, including optional contrast and semantic-role values, so
a theme can change a whole workspace treatment without owning component
selectors. Component tokens and shared `.ui-*`
primitives live in `primitives.css`. Pickers, steppers, compact and icon
actions, badges, menu presentation, fields, and notices use that canonical
asset. Feature classes retain behavior and narrow host-layout differences, but
do not restate shared hover, focus, open, selected, disabled, validation, or
semantic rules. Card layouts and switch-versus-checkbox semantics remain
deliberately distinct.

Draw.io is the deliberate exception to that offline-editor boundary: its hosted
iframe returns editable SVG through the documented cross-origin message
protocol, and Figaro performs the vault write only after that export arrives.
The host keeps a themed, accessible loading overlay above the cross-origin
iframe until its `load` event, so the remote editor cannot flash a white buffer
while it starts. It derives the editor's dark-mode flag from Figaro's rendered
surface, but explicitly requests the light SVG export theme when saving; UI
appearance therefore does not silently change the vault's portable output. The
frontend gives that handoff a 30-second deadline. A protocol error or missing
export clears the iframe spinner, reports a retryable failure, and never starts
a filesystem write, so a service-side interruption cannot leave a diagram tab
permanently locked in Saving state.

`frontend/js/backend.js` is the frontend's sole backend entry point. It calls
the native Wails binding at `window.go.desktop.App` using its generated PascalCase
method names. Browser debugging installs an explicit same-shaped mock through
that module, rather than emulating a retired desktop runtime.

## Dependency direction and I/O boundaries

Figaro separates decisions from effects so each can be tested independently.
New code and staged refactors use four layers:

1. **Pure core** — validation, normalization, planning, transformations, and
   state reducers. Core code accepts plain values and does not access Wails,
   the filesystem, Git, browser processes, the DOM, CodeMirror, timers, or
   mutable application globals.
2. **Application use cases** — operation sequencing, conflict handling,
   cancellation, compensation, and notification decisions. Use cases depend on
   narrow ports declared beside the consumer and receive those dependencies
   explicitly.
3. **I/O adapters** — root-scoped vault operations, settings/session JSON,
   Git history, Wails bindings, browser processes, DOM views, CodeMirror views,
   clocks, and schedulers. Adapters translate external representations into the
   stable values consumed by use cases and the core.
4. **Composition roots** — Wails `App` and frontend startup construct the
   adapters and connect them to use cases. No core or application module imports
   a composition root.

The Go executable keeps a deliberately thin root `main.go` because it alone can
embed the root-owned `frontend/` tree and `wails.json`. It passes those immutable
inputs to `internal/desktop.Run`, which assembles Wails and owns the bound
`desktop.App`. Desktop capabilities and their package-internal tests live
beside that composition root under `internal/desktop`; pure logic and use cases
continue to point inward to the smaller packages described above.

This is a behavioral boundary, not a directory-size target. Dividing a large
module into smaller services is not sufficient if those services still mix
domain decisions with I/O. Interfaces remain narrow and are introduced only at
real effect boundaries; pure functions do not need wrapper interfaces.

### Applying the boundary to future work

The dependency direction applies to new features as well as staged cleanup.
Before implementing a workflow, identify which parts answer deterministic
questions and which parts observe or change the outside world. When both are
present:

1. Represent the decision as a pure plan, transformation, validator, or reducer
   over plain values.
2. Put ordering, cancellation, conflicts, compensation, and notifications in
   an application use case.
3. Inject only the effect ports that use case actually consumes.
4. Keep filesystem, Wails, Git, browser-process, DOM, CodeMirror-view, clock,
   and scheduler access in concrete adapters.
5. Test the pure decision and use-case sequencing independently, then add a
   focused adapter contract for the real effect.

Apply the split at the smallest useful seam in the area being changed. A
trivial pass-through with no policy, branching, sequencing, or reusable
transformation does not need an artificial core module or interface. Conversely,
“the code is short” is not a reason to mix a meaningful decision with I/O.
Future work should leave the touched boundary clearer without requiring an
unrelated whole-application rewrite.

The safe vault adapter retains `os.Root` containment and atomic-write
semantics. In-memory stores make use-case failure and rollback tests fast, but
they cannot prove symlink containment, permissions, atomic replacement, or
filesystem compensation. Those properties remain adapter contract tests
against a real temporary root.

The existing link-rewrite split is the model: `internal/links` transforms
supplied Markdown without I/O, while the vault-facing layer collects and
applies file changes. Vault indexing follows the same pattern by separating
the transformation of supplied note content from vault discovery and
publication.

## Eager application loading

Figaro favors a predictable startup cost and smooth first interaction. All
bundled first-party feature modules and local feature dependencies must be
imported and initialized as part of application startup. A user action must not
trigger its first module download, dynamic `import()`, parser load, renderer
load, or feature-code initialization. `window._appReady` means the local
application code needed by normal workflows is ready, not merely that the
initial shell is visible.

Asynchronous startup is still allowed: independent initialization may run in
parallel, and background warming may continue after the themed shell and
restored active buffer are usable. It must begin during startup and finish
before the application advertises the affected feature as ready. The bundled
classic renderer scripts remain static startup dependencies but use `defer` so
they do not block HTML parsing; language parser warming begins immediately and
settles before `window._appReady`, without delaying the initial Markdown
buffer. A source-level architecture test rejects dynamic imports and source
modules that are unreachable through static imports or explicit worker edges
from the application bootstrap or the three print-renderer build entries,
while the assembled startup check verifies the single static bootstrap path.

Demand-driven **work** is distinct from lazy-loaded **application code**.
Operations that inherently require a user selection or current vault content,
such as opening a hosted Draw.io document, running Vault health, rendering a
PDF, or expanding already-loaded tree data, remain request-driven. Their
application modules, local parsers, renderers, and command handlers are loaded
and initialized up front, so the request performs only the work itself.

### Implemented refactoring order

The architecture cleanup proceeded in dependency order so tests protected each
seam before its callers were rewired:

1. Import-direction guardrails and characterization tests established the
   startup-ready baseline.
2. Settings normalization and session persistence were split into pure models,
   injected use cases, and effect adapters.
3. Workspace search was separated into a pure model, use case, controller, and
   DOM view.
4. Shared CodeMirror document profiles and the document-session
   controller centralized editor policy, stale-mount ownership, and per-buffer
   undo boundaries.
5. Frontend document-save and backend note-save use cases were separated from
   Wails, dialog, status, history, and filesystem adapters.
6. Move, copy, merge, descendant, and collision decisions moved into pure
   mutation plans while real-filesystem execution and rollback coverage stayed
   at the adapter boundary.
7. Right-pane geometry, file-tree selection and refresh coordination, and
   browser state storage moved behind independently tested policies and ports.
8. All first-party dynamic imports were removed; the static bootstrap now
   eagerly loads the application graph and warms bundled language and diagram
   support before readiness.
9. The root Wails facade moved to `internal/desktop` and its former monolithic
   source was split by capability, leaving only the executable embed boundary
   and its focused contract test at repository root.

The frontend backend adapter absorbed the generated Wails namespace change, so
user workflows and application use-case contracts remain unchanged. Further
physical splitting of `editor.js`, `tabManager.js`, or a desktop capability
file should follow tested ownership seams rather than creating pass-through
modules.

Markdown documents supplied as operating-system launch arguments are deliberately outside that boundary. The desktop composition root installs Wails' process-wide single-instance lock. A second launch sends its arguments and working directory to the existing process; launch-path resolution retains only existing Markdown files, and the desktop coordinator registers them before emitting one runtime event and restoring/focusing the existing window. Go records only those explicit launch documents under process-local opaque IDs; the frontend can read or save an ID but cannot turn it into arbitrary filesystem access. The initial capability snapshot closes the race when a second launch arrives before the webview event subscriber is ready, and frontend ID claiming prevents the snapshot and event from prompting twice. Later batches share the same serialized import/keep-outside use case. Before opening, the frontend offers a collision-safe vault import. Declining creates a process-local root projection in the file tree and an external tab; that projection is not vault membership and is never persisted or passed to vault mutation APIs. Removing it closes the capability-backed tab after dirty-state protection and mutates only frontend state, so the original file cannot be deleted by that workflow. The pure external-file model distinguishes capability-backed reads from vault-relative reads and describes destination-specific native-drop confirmation without calling a dialog or backend. Tab activation executes that read plan before committing an external tab as selected; failed or superseded reads leave the previous active tab and CodeMirror owner paired. An external tab writes atomically to its original document and does not join the recent-files list, vault index, watcher, session, or Git history. Native drops on the file tree require confirmation before the copy adapter runs. Native drops over the editor use one themed choice: insert their paths at the drop location, or reuse the recursive merge operation to import the full batch. CodeMirror prevents its uncontrolled browser fallback from inserting an absolute path before that choice is made. After refresh, imported result paths that are files open as active tabs; directory paths intentionally leave the current buffer in place.

## Incremental vault index and native changes

Search, backlinks, Kanban, and Calendar project the same Markdown vault data,
so they share one Go-owned in-memory index rather than independently walking
and reopening every note. The index retains a note's source text and derives
its hashtags/cards, semantic task due links, date links, and daily-note state; this makes Kanban and
calendar lookups direct and keeps search/backlinks disk-free after the initial
index build.

The cold-build adapter first discovers the exact ordinary Markdown workload,
then reads and transforms that retained path list. It publishes discovery,
loading, finalization, ready, and error snapshots through a progress mutex that
is independent of the main vault lock; `GetVaultLoadStatus` therefore remains
responsive while the index owns that lock. Count-based event sampling bounds a
10,000-note build to about one hundred bridge updates, with phase boundaries
always delivered. Native startup leaves both the recursive watcher and cold
index pending. A small webview-local mirror paints the last confirmed bundled
theme and fonts in the first shell frame; vault-backed settings remain
authoritative. The frontend then loads the repaired portable session,
recreates inactive tabs as metadata, and reads and mounts only the selected
file. Once that buffer is usable, it invokes the idempotent `StartVaultLoad`
port, reconciles the current snapshot, and starts the initial file-tree read
and remaining preference and parser warming concurrently.

The cold index holds a vault read lock, so the initial `GetFileTree` read can
run beside it; a dedicated tree-build mutex prevents duplicate cache builds,
while vault mutations still wait for both readers. The initial index build does
not invalidate an independently built tree cache. A pure generation/phase
reducer rejects delayed or regressive updates. A small DOM adapter updates the
approved determinate progress primitive in the bottom-left status bar, leaving
the active editor interactive. `window._appReady` is published only after the
index reaches a terminal phase and the initial tree, preferences, and language
warming have settled. Successful completion hides the compact progress; an
index error remains visible.

Figaro writes known Markdown files atomically and updates that one index entry
in the same vault lock. The recursive native watcher sends a debounced set of
changed paths to the backend: a one-file external edit similarly rereads and
reprojects only that file, while creates/removes update the tree as needed.
Recent Figaro-originated write events are recognized so the watcher does not
repeat the save work. After an internal copy reaches disk, Figaro validates all
pre-existing Markdown metadata while excluding the known new destination. A
current index is extended by parsing only the copied subtree, and exact copied
paths acknowledge the corresponding watcher batch; a stale index falls back
to one cold rebuild. A move first verifies the warm index against a
metadata-only Markdown walk, prunes link rewriting to indexed source/target
candidates, then remaps only affected file records and reconstructs derived
projections from retained memory. Any stale snapshot falls back to the complete
root-scoped rewrite scan and cold index rebuild. Other ambiguous broad changes,
such as merges or an unscoped notification, deliberately invalidate and rebuild
one coherent snapshot; correctness wins over a speculative partial update.

Each indexed file owns its own tag, Kanban-card, due-task, daily-note, date-link,
month-grouped Calendar-day, accent-folded search fields, term frequencies,
trigram, and Markdown-backlink
contributions. Those projections are derived in one line-oriented document
walk. A known
one-file update removes its old contributions before adding its new ones,
retaining unrelated card slices, Calendar projections, and reverse-link
entries. The pure `internal/search` package owns Unicode normalization, query
tokenization, bounded prefix/edit expansion, BM25F field scoring, and
best-passage selection without filesystem or Wails dependencies. The native
index incrementally maintains sorted term postings, document frequencies,
field lengths, and a vocabulary over title, headings, tags, path, and body.
Exact variants lead prefix and conservative fuzzy variants; field and match
weights live in explicit global, title-only, and link-completion profiles.
Case-sensitive search reanalyzes only candidate text against the original
spelling instead of duplicating the complete index.

The older compact three-byte postings remain the verified substring fallback
for literal single-term fragments and legacy date lookup. Exceptionally large
or high-entropy notes remain in that bounded fallback set, so correctness never
depends on indexing every trigram. Ranked results transfer one strongest source
line plus the exact matching-line total; one query reuses that passage across
byte-identical pooled content. Markdown link completion calls the same native
search use case with a title/path-heavy profile and a ten-result boundary.
This keeps the common save/watcher path proportional to the changed note and
its affected derived data; a full derived rebuild remains reserved for the
first vault scan and genuinely broad filesystem changes.

The file tree has a separate metadata projection under the same vault lock.
Its published hierarchy is immutable and may be returned unchanged across
no-change refreshes; a flat path map updates known file writes/creates and
adds known copied subtrees or remaps known moves before rebuilding the hierarchy in memory. Broad mutations,
ambiguous watcher batches, and unscoped notifications discard that projection,
so the next request repeats the established root-scoped scan. The bridge still
returns the complete hierarchy; this cache removes rediscovery cost without
changing tree membership, sorting, hidden-path, or symlink rules.

Relationships reuse that same index for both reverse backlinks and unlinked
mentions. A mention scan walks cached source only, excludes fenced code and
existing link syntax, and returns a small context window around each
plain-text title match. Linking one mention is a root-scoped, line-specific
atomic write: it rechecks the current source under the vault lock, refuses
ambiguous/stale targets, updates the affected index entry, and renders the
user's selected Markdown or conventional Wikilink syntax. The frontend saves
open Markdown buffers before that operation so an in-memory edit cannot be
silently overwritten.

Vault health is deliberately separate from the hot index projections. It is a
user-triggered, read-only root-scoped walk: cached Markdown source checks
vault-local Markdown/Wikilinks and structural frontmatter delimiters, while
the visible regular-file walk identifies common unreferenced attachments and
repeated basenames. The pure `internal/notenames` package canonicalizes Markdown
names and applies the conservative content-overlap rule used for possible
duplicates: same-folder variants need no content evidence, while cross-folder
variants do. Exact repeated basenames stay informational. The frontend mirrors
the same pure canonical-name rule for sibling create/rename planning and missing
conventional Markdown-link review. Injected use cases own the dialog/navigation
sequences before filesystem effects begin. A separate pure link plan locates
only the clicked destination and revalidates its source bytes after the dialog;
the CodeMirror adapter then dispatches the ordinary dirty editor transaction
before the existing tab-replacement save guard runs. The same pure link core
normalizes Markdown reference labels and distinguishes unresolved bracket text
from defined full, collapsed, and shortcut references. New-link autocomplete
uses the native relevance index's link profile for existing targets, then a
pure same-folder creation/insertion plan plus an injected coordinator;
the backend create must succeed before the adapter replaces the typed prefix,
while cancellation and failure perform no editor transaction. Dot-directories and
symlinks are excluded; external URLs, mail links, and code fences are not
findings. The report contains only vault-relative paths and lines, so UI
navigation needs no filesystem access.

The full Kanban board remains available for its workspace, but the Today dashboard asks the
backend for its bounded unfinished-card projection and due-task summary directly. Due work is
deduplicated by source line, prioritized ahead of undated work, and stored only as the standard
`[due YYYY-MM-DD](YYYY-MM-DD.md)` link on that line. Pure Go and JavaScript helpers own parsing,
date validation, local-day comparison, priority, locale week normalization, month-grid construction,
note-intensity buckets, and tooltip placement; root-scoped task
mutation, DOM presentation, and the local-midnight timer remain effect adapters. Its Inbox,
pinned, recent, and rediscovery collections are pure projections of the
already-loaded tree, vault appearance settings, local recent-file state, and
the local calendar date. The open-or-create daily-note use case receives its
tree, Inbox-directory creation, exclusive file creation, refresh, and navigation
effects as explicit ports. It prefers `Inbox/YYYY-MM-DD.md`, retains a root-file
fallback for existing vaults, and opens a same-name creation collision without
replacing it. The Calendar adapter reads the operating-system locale through `Intl`, while its pure
model accepts the resulting first weekday and weekend set; no holiday source or calendar permission
enters the application. The shared vault index maintains per-date note-path reference counts and
matching note rows so a daily note or normally linked Markdown file contributes once to both the
month count and selected-day results, while a semantic due link remains an independent task signal.
Calendar month navigation similarly copies only that month's pre-grouped daily-note, linked-day, and
due-task lists plus compact day summaries containing note counts and due titles. While a Markdown tab
is dirty, the pure Calendar model replaces that file's saved date associations with its current
in-memory buffer; editor events schedule this projection on the next frame without scanning or saving
the vault. These narrow methods avoid per-day requests and avoid transferring or filtering the rest
of a large vault merely to render a small overview.

The `vault:changed` event includes `tree_changed` and `kanban_changed`.
Content-only external Markdown changes refresh dependent data without
requesting a new file tree; directory or entry changes schedule the normal
coalesced tree refresh. An acknowledgement of a Figaro-originated save has
both flags false: the frontend already replaces that file's Kanban cards from
the saved snapshot, so it does not request the complete board again. The
initial index is still built after the first Wails window and restored active
buffer are allowed to appear, so indexing does not delay shell creation or the
first editable note. Compact status progress owns the remaining warm-up
interval while the initial tree and index finish concurrently.

The frontend has two complementary hot paths. An unsaved Kanban change is
projected from the dirty tab buffers on the next animation frame, without an
RPC; a Figaro save folds its final buffer into the same board snapshot, while
external changes still request backend data. The file tree still receives the
complete structural model for correct sorting and session restore, but it
renders descendants only for explicitly expanded folders. The active
document's selected state and dirty-buffer markers are patched on mounted nodes
during tab and save-state changes rather than rebuilding that structural DOM.
Clean background tabs have no tree projection because their open state does
not alter a file operation. This prevents large collapsed or expanded trees
from imposing a hidden DOM/layout cost on ordinary tab switches.

Keyboard card ordering is a separate presentation projection rather than a
rewrite of note lines. The pure Go `orderedKanbanCards` transformation and the
matching frontend `core/kanbanKeyboardModel.js` reconcile saved references by
file/line/text, fall back to file/text after edits shift a task, and append all
unmatched cards. The root-scoped adapter atomically stores only those references
in `.config/kanban-order.json`; column and vault-path rename/delete workflows
rewrite or prune them. `kanban.js` owns keyboard events, status/focus handoff,
and the existing hashtag mutation boundary for horizontal moves.

Hashtag completion deliberately reads a second, stable projection of the saved
Kanban columns rather than the dirty-buffer column list. Unsaved tags still
reproject the visible board immediately, but a partial new tag cannot become
its own completion candidate during the same typing frame. The pure
`core/taskDueDateCompletionModel.js` owns column normalization, unfinished-task
eligibility, existing-date rejection, and portable due-link insertion plans.
`taskDueDateCompletions.js` translates those plans into CodeMirror completion
transactions, while `editor.js` supplies syntax-context filtering and anchors
the existing shared date-picker adapter at `coordsAtPos()`.

## Git status and history restoration

Editor changes mark their tab model dirty synchronously, then publish the
one-time dirty transition to the tab bar and status controls. This ordering
keeps saves and rapid tab switches safe while ensuring the active-file
local-history action immediately becomes actionable again after a later edit.
A clean state is deliberately silent: the frontend shows **Save to history**
only when recording that file is an available action.

The active-note dirty query is path-scoped below the Wails layer. Its adapter
compares that one path in HEAD, the Git index, and the root-scoped worktree;
clean tracked files use the index stat cache, while uncertain content is hashed.
Untracked paths evaluate only applicable ancestor `.gitignore` files. Unmerged
entries are observably dirty, and submodules retain go-git's complete-status
fallback. This keeps the status control independent of unrelated vault size
without replacing Git's result semantics.

Auto-Commit deliberately has no timer or repository-wide operation. Its
single persisted boolean causes a successful active-file save to invoke the
same root-scoped `CommitFile(path)` path as the explicit history action. That
path stages only the requested file and refuses when another path is already
staged, because go-git commits the index as a whole. Unstaged changes in other
notes therefore remain outside both the new commit and the target note's
restore history.

File-tree deletion is a separate, explicit history boundary. The frontend
first persists dirty affected CodeMirror tabs; the backend then holds the vault
write lock while the history adapter enumerates the target through `os.Root`,
stages the exact current target—including tracked children already removed—and
creates or identifies the commit that reconstructs it. The pure
`internal/recovery` registry rules order, find, and remove opaque records; the
desktop coordinator atomically persists those records in ignored
`.config/recently-deleted.json` before `RemoveAll`. The archive path refuses
unrelated staged entries and restores the prior index if staging or commit
fails. Any preparation, archive, or registry error aborts removal, so the
recorded bytes and filesystem deletion cannot be reordered by another Figaro
mutation.

Recovery reverses that coordinator without treating Git as a filesystem API.
The history adapter reads regular-file and symlink blobs from the exact commit;
the desktop adapter validates the record and destination through `os.Root`,
builds the complete file/folder beneath a unique sibling staging name, and
publishes it with one rename only when the original path is absent. Extraction
failure removes the stage, destination collisions and missing parents change
nothing, and the durable record is removed only after successful publication.
The frontend's ten-second Undo and Settings list call the same native restore
use case and request a normal tree refresh.

History is non-destructive: a revert saves and commits the pre-revert content,
saves and commits the selected historical content, then reloads the right-pane
list. The selected-version action lives with its History entry, while the
editor banner remains informational; this makes the resulting latest commit
and the current editable version unambiguous. Commit hashes remain panel-local
lookup keys only: the user interface identifies revisions by their timestamp
and latest-state marker rather than exposing Git plumbing.

The optional History comparison is intentionally a bounded Markdown-source
diff rather than rendered HTML. It classifies headings, lists, fences, and
frontmatter while retaining the original text. The UI renders only additions,
removals, and two surrounding context lines per hunk in a full-width action
row; long unchanged stretches collapse to one separator. Small revisions use
a line LCS; large revision pairs preserve their shared prefix/suffix and cap
changed-line output so inspecting history cannot create an unbounded UI
allocation.

## Outline navigation

Outline is intentionally a source-navigation surface rather than another
CodeMirror live-preview feature. `core/outlineModel.js` parses only the active
Markdown document's headings, keeps their document offsets, ignores
frontmatter plus heading-shaped text in fenced code, derives every active
ancestor, and decides whether a measured line has crossed the visible sticky
boundary. The DOM adapter renders that hierarchy in an edge-to-edge, flat
editor-top strip and renders the same typed headings in the right pane; both
dispatch ordinary selection and scroll transactions when activated. Sticky
titles consume the shared `--font-size-editor` token, while the level marker
remains compact metadata; the measured scroll margin absorbs the resulting
row height without changing editor source geometry.
CodeMirror's scroll margin matches the strip's measured height, so the
full-width surface does not change source geometry or hide navigation targets
beneath an obsolete floating-card inset.

Document changes or a tab source swap rebuild the cached model. A passive
listener on the current shared editor's scroll surface requests a keyed
CodeMirror read/write measurement; repeated scroll events coalesce, the read
phase resolves one line through CodeMirror's height map, and the write phase
touches the sticky DOM only when the hierarchy signature changes. This follows
the visible covered edge instead of the deliberately batched virtual viewport
without parsing Markdown or forcing layout from the scroll handler. The small
top-right launcher is hidden while the outline owns the right pane. History,
Raw Text Preview, and PDF Preview release the outline before taking that shared
pane.

## Editor buffer ownership and undo history

File tabs share one CodeMirror `EditorView`, but never its undo state. The pure
`usecases/editorDocumentSession.js` coordinator decides when a requested mount
changes document ownership, rejects stale mounts, and requires a history swap
even when the incoming text is byte-for-byte identical. The editor adapter
serializes history against the outgoing file-tab object in a `WeakMap`, removes
the dedicated history compartment while installing the target source, and
marks that whole-document transaction as excluded from history. It restores
the target's serialized state only when the saved document exactly matches the
incoming text; new, closed-and-reopened, or externally changed buffers start
with empty history. Normal transactions then remain undoable across switches
for that open buffer alone. This keeps delayed I/O and DOM effects outside the
ownership decision while making it impossible for Undo or Redo to replay a
document replacement from another tab.

## Editor text scale ownership

`core/editorTextScaleModel.js` owns the pure 70–150% bounds, ten-percent wheel
steps, high-resolution delta accumulation, fallback rules, and accessible
status presentation. `editorTextScale.js` adapts those decisions to the
webview-local Settings value, root typography tokens, CodeMirror measurements,
source-footprint remeasurement, and the existing status button. The permanent
default alone is written to `localStorage`.

Each open file-tab object may carry an in-memory `_editorTextScale` override.
Tab activation reapplies it to the one shared CodeMirror view; non-file views
restore the configured baseline. `core/sessionModel.js` selects portable tab
fields explicitly, so temporary scale cannot enter vault sessions or recovery
state, and closing the tab naturally destroys it. A permanent Settings change
clears all open overrides before applying the new baseline. Pointer-triggered
reflow uses CodeMirror read/write correction passes to retain the source point
beneath the wheel; the unitless line-height ratio remains constant so font and
row height are not scaled twice.

## UI continuity surfaces

Kanban density and column flow are webview-local presentation preferences, not
vault settings. A stacked board uses one vertical board scroll surface; the
default arrangement retains the horizontal column row.
Refreshing a board snapshots its horizontal position and each mounted column's
scroll position before replacing cards, then restores them after render. The
file tree applies the same continuity principle to structural refreshes by
retaining its scroll position and focused row; `selectedTreePath` remains the
state-owned source of truth for roving focus, `selectedTreePaths` is the
internal file/folder operation selection that exclusively owns `aria-selected`
and the shared selected surface, and `selectedFilePath` is the active
file/Draw.io tab retained as non-visual `aria-current` state. Unsupported files
remain in the same operable internal-entry domain as editable files, use normal
row opacity, and expose their managed-only capability without changing the
active buffer. Ordinary activation remains selection-only; double-click and the
contextual **Open** action converge on `OpenWithDefaultApplication`, whose
root-scoped desktop adapter validates an existing regular file, rejects every
symlinked component, and only then delegates the exact vault path to
`xdg-open`, macOS `open`, or Windows `ShellExecute`. The pure
`core/fileTreeModel.js` also maps file paths to semantic
default icon names independently from editor capability, clamps tooltip
coordinates to the viewport, flattens only expanded rows, and plans Up/Down,
Home/End, parent/child, expand/collapse, activation, and Space selection
commands. `core/fileTreeTransferModel.js` normalizes mixed selections, removes
redundant descendants, resolves paste targets, and rejects recursive batches
without effects. The `fileTree.js` DOM adapter owns ARIA tree semantics,
independent roving focus, operation selection, current-document markers,
semantic icon rendering, themed managed-only tooltip content and lifecycle on
the shared tooltip surface,
derived Cut markers, scrolling, rendering, and activation effects. The injected
`usecases/fileTreeTransfer.js` sequences dirty-source preparation, one-path
copy effects, partial-failure refreshes, and stable remaining-source results;
the adapter supplies the filesystem and tab-manager ports. F2 enters the same
rename use case as the context menu, so it does not duplicate path validation,
dirty-tab persistence, or link rewriting.

File-tree mutation feedback is one reference-counted frontend activity scope.
It marks the tree busy immediately around copy/import, move/merge, rename, and
delete effects, while the status-bar adapter delays the approved indeterminate
spinner for one second. Each activity owns an idempotent completion callback;
fast work cannot flash, one completion cannot hide overlapping work, and modal
decision time is outside the active effect boundary. The live status text owns
the accessible announcement, while the spinner is decorative and becomes
static under reduced motion.

Vault-scoped path presentation records keep
custom icons, colors, and an optional explicit pin preference together so
rename, move, copy, merge, and delete remap one path-owned record. The pure
tree model resolves an absent top-level `Inbox` preference to pinned, preserves
an explicit false override, and stably promotes pinned siblings before the
backend's ordinary ordering. External launch projections are appended from
separate process state and are never eligible for those persistent path
preferences.

## Editor decoration updates

CodeMirror preview state is intentionally selective. Math and diagram
`StateField`s retain the source ranges that produced their replacement
decorations, so a selection move or edit outside those ranges maps or preserves
the existing state instead of reparsing the whole note. Frontmatter similarly
parses only after document/configuration changes. The remaining interactive
decorations—links, list widgets, hashtags, and extras—are built from the
visible document region and rebuilt on viewport changes. Cursor movement only
rebuilds source-aware decorations when it crosses an affected line or widget.
This keeps the source-first editing contract while avoiding whole-document
syntax walks and string copies on every arrow key or ordinary keystroke.
Stable block sizing uses the same dependency direction. The pure
`core/sourceFootprintModel.js` module owns the approved block-kind allowlist,
source-line counting, and downscale-only graphic plan. The DOM adapter in
`sourceFootprint.js` writes the already-computed line height to CodeMirror's
measured root, uses one view-level extension to measure wrapped raw rows at the
active content width, and observes rendered graphics. Measurements are cached
per mounted root; ordinary cursor transactions do no work, while document,
viewport, font, width, or footprint-root changes invalidate only the relevant
view pass. Diagram and display-math
widgets use that adapter directly; the vendored code and table integrations
attach equivalent metadata at widget construction without scanning the
document. Images, Properties, links, checkboxes, and inline math never enter
the policy. All selectors are `.cm-*`, so the independent printable renderer
retains natural diagram, code, math, and table geometry.
Conventional-link and standalone-hashtag click precedence is decided in the
pure `core/noteLinks.js` model before the CodeMirror adapter runs effects. A
complete `[label](#fragment)` therefore remains one link whether it is rendered
or revealed source; its stable heading slug resolves to an editor offset and
dispatches an ordinary selection, while only a standalone whitespace-delimited
hashtag may open Kanban. Missing fragments are consumed locally and cannot fall
through to vault reads or note creation.
Footnote interaction has the same pure-decision/effect split. `footnotes.js`
classifies source tokens, resolves definitions and exact per-tab return
positions, and plans a missing definition after the reference's complete
blank-delimited paragraph. Its insertion plan minimally supplies the two line
breaks needed on each side and places the post-change selection after the
definition marker. The editor adapter owns the single CodeMirror transaction,
focus, scrolling, and history effect; no filesystem or note-navigation effect
participates.
Markdown block folding follows the same source-first boundary.
`core/markdownBlockGuideModel.js` classifies deterministic syntax descriptors
as `h1`–`h6`, fenced-code language names with an untyped `code` fallback, or
`table`; every other Markdown block is deliberately omitted. The pure model
bounds and normalizes the first fence-info token before it becomes a label.
`markdownBlockGuides.js` is the CodeMirror adapter: it reads Lezer's top-level
blocks, maps a heading through its descendants until the next peer or ancestor,
maps fenced code and tables to their own block, and dispatches standard fold
effects. CodeMirror owns the folded decoration and announcements; saves, Raw
Text Preview, and PDF rendering never observe fold state. The editor-sized
typed guide and source-code chevron are approved design-system primitives,
while the gutter retains only CodeMirror layout and event ownership. Ordinary
line markers cover revealed source, and CodeMirror's widget-marker hook keeps
fence and table guides aligned with their live-rendered block replacements.
`core/markdownFoldAnchorModel.js` independently plans the scroll offset and
minimum trailing reserve needed to preserve a clicked guide's viewport
coordinate. The adapter measures before and after the fold, applies that plan
through CodeMirror's measure phases, and performs one correction pass; it does
not put DOM or scroll policy into the syntax classifier.
The fenced-code and interactive-table decoration providers observe
`foldedRanges`: an exact guide-owned fold causes them to omit their replacement
widget and rebuild, leaving CodeMirror's native fold as the sole visual owner
of that source range. Unfolding rebuilds the original widget.
`core/editorBlockActionLayoutModel.js` separately turns the measured writing
edges and untransformed helper-rail edges into bounded before/after offsets,
measured rail widths, and the existing stacked-layout decision. Its DOM adapter
reads CodeMirror's centered content box, padding, and current transforms, then
publishes CSS properties that move only the interactive helper gutters. The
left rail's hidden spacer uses the syntax model's maximum permitted label
length, and an equal negative flex margin makes that stable width an overlay;
folding a parent can therefore remove a wider child guide without recentering
the document. The document width, prose layout, and ordinary CodeMirror gutters
remain unchanged as text width, window width, folding, or side panes change.
The table bundle receives this narrow integration during vendoring through an
in-memory, exact-match transform that fails when the pinned upstream source no
longer has the reviewed shape. The same transform marks the measured root as a
table block widget, records the table's logical source-row footprint, attaches
Figaro's approved danger-ghost button, and routes
it through the extension's existing `table.delete` history annotation, so
direct deletion and the table's internal command remain one undoable action.
The Properties field uses the same source-first transition: its disclosure
generates missing default frontmatter directly into structured-panel mode,
while `core/frontmatterPresentationModel.js` permits automatic raw-YAML entry
only for the explicit upward-motion event emitted by Arrow Up or Vim `k`.
Home/document-start commands, Vim `gg`, programmatic jumps, and pointer
selections may place the logical selection at that replacement without
changing its presentation; an explicit **Edit YAML** action still enters
source mode, and a selection leaving source restores the compact card.
Expanded and collapsed states share one disclosure control. A stable
CodeMirror scrollbar gutter prevents
the control's viewport position from shifting when the taller panel introduces
vertical overflow. The measured expanded-widget root establishes a paint layer
above later positioned editor lines; transient panel transforms can therefore
animate without trapping an absolutely positioned picker menu beneath the note
content that follows it.

Vertical document navigation has a separate deterministic boundary policy in
`frontend/js/core/verticalCursorModel.js`. It consumes movement at the absolute
first and last positions and rejects a browser or height-map result that moves
in the opposite direction. It also plans an adjacent-source-line fallback when
the engine returns the same position or skips more than one line. The
CodeMirror Arrow adapter and Figaro's Vim display-row motion supply line facts
and apply any correction, keeping the policy independent from CodeMirror, the
DOM, and viewport effects. Vim source-line motion is stopped before its native
geometry adapter at the first or last line, while visual-row motion validates
the returned candidate so healthy movement within a wrapped edge line remains
available. The same model projects wheel deltas against the
scroll extent; its CodeMirror adapter cancels a gesture that would cross an
edge and pins the scroller to that boundary before WebKitGTK can reinterpret
the overscroll. These guards are unconditional and do not create a wraparound
preference.

The adapter also classifies keyboard vertical motions through the pure
`isVerticalMotionKey` rule. It requests a keyed CodeMirror measurement, then
compares the selected cursor's measured rectangle with the physical scroller
after the browser paints; if they diverge, it corrects `scrollTop` and requests
one final normal measure. This keeps the primary virtual viewport synchronized
after a down/up/down reversal across rendered blocks in a long note, for normal
Arrow Up/Down, Page Up/Page Down, and Vim `j`/`k`. The classification and pixel
delta stay independent from DOM and timer effects; the adapter owns those
effects and does not alter source text or pointer/wheel scrolling.

Windows keyboard layouts remain owned by the native WebView2 and CodeMirror
input stack. The editor does not map physical key codes to assumed Spanish
characters, prevent dead-key events, synthesize accent output, or reconcile
composition with timers. This rule applies in regular editing and Vim Insert
mode. Figaro pins Wails v2.14 to the `v2.14.0-figaro.1` fork tag: its Windows
accelerator boundary recognizes Ctrl+Right Alt as AltGr and leaves those events
with WebView2 instead of reposting a duplicate `WM_KEYDOWN` to the native
window. Component coverage proves Figaro does not consume representative key
events, the fork's Windows unit test owns the native forwarding decision,
browser coverage proves literal and already-composed text reaches the document
once, and the packaged Windows check owns actual layout composition.

The CodeMirror adapter recognizes one deliberate exception to the generic
multi-source-line fallback: a collapsed range is one visual row. It preserves
a valid forward jump over exactly that fold and, before dispatching an upward
selection, maps a hidden fold endpoint back to the visible heading. The same
normalization is used by ordinary Arrow motion and Vim display-row motion, so
entering hidden source cannot accidentally expand a section.

When the opt-in Vim rendered-block motion is active, the root editor uses
those retained source ranges to stop Normal `j`/`k` at the adjacent block.
Visual `j`/`k` independently preserves its anchor and extends the selection
into adjacent fenced source, so source-first decoration rebuilding reveals the
block without exiting Visual mode. Frontmatter is the deliberate boundary
exception: `gg` keeps Properties rendered and a following `k` reveals its
portable source even when the broader rendered-block preference is off.
Fenced blocks expose their portable source; rendered GFM tables reveal their
portable Markdown source when entered. The root Vim Normal cursor is drawn
by the adapter's separate fat-cursor layer, so a root-scoped override maps
that layer to the active theme's cursor background and text tokens instead
of inheriting the adapter's fixed red. Table previews have no nested editor,
so root history, search, Vim prompts, Arrow Up/Down, mouse placement, and
drag selection remain ordinary CodeMirror behavior.

Vim clipboard integration separates policy from browser effects. The pure
`frontend/js/core/vimClipboardModel.js` chooses OS text versus the unnamed
register, preserves linewise/blockwise shape when both contain the same text,
and plans the replay keys for `p`/`P` counts and placement. The editor adapter
reads and writes `navigator.clipboard`, updates the register only when external
text differs, and replays the vendored Vim paste action. Clipboard denial or an
empty system value therefore falls back to Vim state without bypassing the
adapter's normal Visual, linewise, blockwise, or repeat behavior.

Native URL paste uses CodeMirror Markdown's eager `pasteURLAsLink` extension.
`frontend/js/core/markdownLinkPasteModel.js` owns the equivalent deterministic
URL/selection transformation for clipboard paths without a native paste event;
the editor syntax adapter first proves the selection is plain Markdown prose.
Vim Visual `p`/`P` places that planned source in the unnamed register before
replaying the normal Vim action, while the Async Clipboard menu path inserts it
as one paste transaction. Named registers and protected link/code selections
retain ordinary Vim/plain paste behavior. The Markdown Enter keymap uses the
library's configurable continuation command with non-tight-list retention
disabled; this changes only the deterministic empty-item exit rule while
leaving CodeMirror's parser, history, and cursor geometry in control.

Smart rich paste keeps deterministic policy separate from clipboard and DOM
effects. `frontend/js/core/richPasteModel.js` owns priority, size limits, block
boundaries, safe code fences, and narrowly scoped AI math/fence repairs.
`frontend/js/richPaste.js` is the inert-DOM/Turndown adapter: it sanitizes the
clipboard document, recognizes semantic evidence, repairs positively identified
AI code shapes, and emits Markdown without reading the vault or loading remote
resources. `frontend/js/clipboardPaste.js` coordinates native events, internal
source provenance, image/table precedence, exact plain fallback, and the single
CodeMirror transaction. Its pure preflight resolves internal, plain, image,
non-Markdown, and protected cases before the adapter parses rich HTML. The root
Markdown editor injects that coordinator; the editor context menu adapts Async
Clipboard items to the same payload.
Syntax-tree/frontmatter inspection stays in the editor adapter because it
depends on the live CodeMirror state.

List-marker lines carry an inline hanging-indent decoration that aligns wrapped
display rows with the visible item body. It is recalculated together with the
cursor-aware list marker replacement and never adds block height or changes
Markdown source.

Tab width is one portable editor preference rather than a file-mode default.
The pure `frontend/js/core/tabSizeModel.js` owns the four-space default,
2–8 bounds, stepping, spaces-only indent unit, and literal-tab expansion.
`internal/settings` owns the equivalent persisted schema validation, while
`TabSizeLoad`/`TabSizeSave` are the vault-settings adapter. Startup loads that
preference before restored tabs can construct CodeMirror. The editor
composition root installs one compartment containing both `EditorState.tabSize`
and `indentUnit`; Markdown/code reconfiguration leaves it intact. A live change
reconfigures the root and refreshes source-footprint measurement. The Mermaid
dialog copies those
facets from its root view, and `--editor-tab-size` aligns rendered code and Raw
Text Preview without entering the isolated printable document.

Markdown diagnostics are an intentionally separate idle-time extension rather
than a live-preview widget. They scan only the active Markdown document after
a short pause and add inline marks plus CodeMirror's native hover/F8 surface;
the persistent, on-by-default `markdown_lint` setting can reconfigure that
extension without replacing source, altering block height, or asking the vault
backend to validate cross-file links. That keeps editing feedback immediate
while the read-only Vault Health workflow remains responsible for vault-wide
checks. The pure `core/mermaidLintModel.js` scanner identifies complete Mermaid
fence bodies and maps fence-local parser ranges into document offsets.
`usecases/markdownDocumentLint.js` combines that policy with the existing pure
Markdown checks through an injected validator, while the editor composition
root supplies the same eagerly loaded Mermaid parser adapter used by preview
and export. CodeMirror's async linter discards a completed result if its source
document has since changed.

Offline spellcheck is another independent, off-by-default idle-time linter
compartment. Its
three Hunspell assets (US English, UK English, and Spanish) are served from
the embedded frontend bundle and cached in the webview; text is never sent to
a service. The Settings language combobox maps **None** to the global
`spellcheck: false` preference while retaining `spellcheck_language` as the
last valid dictionary for later re-enablement. When enabled, those preferences
provide the fallback, while a note's leading `spellcheck` frontmatter can
select one or more bundled dictionaries or disable that note. A hyphenated prose compound
is accepted when every component is recognized by the same active dictionary,
so terms such as `faster-than-usual` remain unmarked despite dictionary
compound gaps. A right-click resolves
replacement suggestions from those same cached dictionaries only for the
diagnostic word under the pointer. Candidates must pass the active dictionary
again and a conservative prose/edit-distance filter; ambiguous short typos
produce no replacement rather than a menu of obscure entries. A chosen
candidate dispatches one normal undoable editor change. Its inline marks use
the theme link accent and never add block height or change cursor geometry.

Document observers follow the same rule. A changed editor document is kept as
CodeMirror's immutable text snapshot until the next animation frame, when the
latest dirty snapshot is published to Kanban and PDF-preview consumers. Tab
switches and saves still materialize the live editor document synchronously,
so coalescing cannot lose a buffer. Word/character statistics are intentionally
settled after a short typing pause and reuse that latest materialized snapshot
where possible, avoiding a whole-document tokenization per keypress.

## Session state is not settings

`settings.json` stores durable preferences such as theme, fonts, tab size, Vim visual-row
and rendered-block motions, the Markdown-lint toggle, and the spellcheck enabled
state plus last selected global language. Open tabs, their ordering, current per-file cursor
selections, and the active workspace state live in the dedicated session record.
Cursor updates are coalesced into portable session writes and installed before
the restored active file is mounted. Keeping them separate makes startup recovery
predictable: malformed, missing, or old session data can be discarded without
damaging user preferences. Compatibility cleanup removes legacy tab keys from
`settings.json` rather than trying to merge two competing sources of truth.

## Machine-local application state

Machine-local records contain facts about one computer, never portable vault
preferences. Figaro currently keeps window geometry in `window-state.json` and
the selected PDF-browser executable in `machine-settings.json`. Both use the
same cross-platform application-data root, but separate schemas allow a broken
optional browser preference to be repaired without discarding safe window
restore bounds.

### Window state

Window geometry belongs to the host, not the vault. A vault may be synced or
opened on machines whose monitors, scaling, and window-manager conventions are
unrelated, so `window-state.json` is a separate machine-local record with only
four fields: schema `version` (currently `1`), normal `width`, normal `height`,
and `maximized`. Coordinates and a minimized flag are intentionally absent.

The platform locations are:

| Platform | State record |
| --- | --- |
| Linux | `$XDG_CONFIG_HOME/figaro/window-state.json`, falling back to `$HOME/.config/figaro/window-state.json` |
| macOS | `$HOME/Library/Application Support/figaro/window-state.json` |
| Windows | `%LocalAppData%\figaro\window-state.json` |

Linux and macOS use Go's `os.UserConfigDir`. Windows deliberately uses
`os.UserCacheDir`, whose Windows implementation resolves to `LocalAppData`;
`os.UserConfigDir` would select roaming AppData and could transfer display
state to a different computer. The directory and file are requested with
`0700` and `0600` permissions respectively on systems that implement Unix
permission bits.

The state machine preserves the last useful desktop presentation:

- A normal observation replaces width and height and clears `maximized`.
- A maximized observation sets `maximized` but retains the previous normal
  dimensions, giving the native backend usable restore bounds.
- A minimized, fullscreen, or transitional observation is ignored. Figaro's
  own minimize action captures the preceding normal/maximized state first.
- The frontend never captures native window state eagerly: GTK can still be
  unrealised at DOM readiness. Native browser resize events are debounced by
  250 ms before capture so
  edge resizing, snapping, and window-manager shortcuts are covered even when
  they bypass the custom controls. Shutdown performs a final capture, and the
  custom maximize action captures normal bounds before toggling.

At startup, the stored normal dimensions configure the native Wails window,
the backend centers it without restoring coordinates, and only then is the
saved maximized state applied. The normal default is `1280 × 800`; dimensions
below `800 × 500` are clamped to that minimum. A missing record uses the
default without error. Malformed JSON, an unsupported schema version,
non-positive dimensions, or a dimension above the `32768` corruption guard is
rejected and also falls back to the default. A later valid capture rewrites the
record. A path lookup failure disables persistence for that launch; a write
failure is logged and may be retried by a later capture. Neither prevents
startup or normal application use.

### PDF-browser preference

The PDF browser selected in Settings describes software installed on this
computer, so it is stored in the versioned `machine-settings.json` record,
never `vault/.config/settings.json`. Its platform locations are:

| Platform | Machine settings record |
| --- | --- |
| Linux | `$XDG_CONFIG_HOME/figaro/machine-settings.json`, falling back to `$HOME/.config/figaro/machine-settings.json` |
| macOS | `$HOME/Library/Application Support/figaro/machine-settings.json` |
| Windows | `%LocalAppData%\figaro\machine-settings.json` |

Schema version `1` has one optional `pdf_browser_path` field. Choosing a browser
does not trust the filename or a `--version` subprocess: Figaro launches the
selected executable with the same isolated profile and Chrome DevTools
Protocol path used by export, calls `Browser.getVersion`, and persists the path
only when that succeeds. Clearing the setting removes the field and restores
automatic discovery. An old vault-scoped `pdf_browser_path` is copied to the
machine record once and then removed from the vault; an already configured
machine-local value wins. If migration cannot safely write the local record,
the legacy value is left in place for a later attempt.

## Theme identity and generated assets

The built-in default theme ID remains `default` even though its user-facing
name is **Figaro Dark**. Saved preferences therefore continue to work after the
name change; the temporary `figaro-dark` ID is canonicalized back to `default`.
The Figaro Dark/Light pair deliberately shares semantic token roles: restrained
collar red is the interactive accent, brass is metadata/highlight color, and
fur/paper neutrals establish the reading surfaces. Their source CSS remains
the single place that defines those visual identities, including the native
navigation frame, raised editor, tactile Settings cards, and collar stitch.

Browser modules, KaTeX assets, icon derivatives, and Wails bindings are
generated assets. The source material and generator scripts are tracked, while
the generated output is recreated before development and package builds. This
keeps the repository small while ensuring packaged applications are
self-contained.

The printable Markdown bundle aliases its selected `@mdit` plugins to Figaro's
separately vendored Markdown-It core. Its seven direct plugins and three
transitive implementation packages currently share the `markdown-it ^14.2.0`
peer boundary, so a core major upgrade must update and verify both sides of
that generated seam; changing only the root npm resolution would leave the
packaged runtime unchanged.

Generated CodeMirror color support has a similarly explicit dependency seam.
The upstream ESM entry imports one undeclared Babel object-rest helper, so the
vendor adapter applies a guarded, exact-match source transformation and bundles
the equivalent local pure function. The adapter fails on an unfamiliar
upstream shape; production therefore carries neither an unresolved import nor
the otherwise-unused Babel runtime.

## Raw text preview: exact Markdown source

`rawTextPreview.js` owns the non-print **Raw Text Preview** right-pane mode. It
places the current active/dirty Markdown snapshot into a selectable `pre` with
`textContent`, preserving frontmatter, HTML, fences, and every delimiter
exactly. It does not invoke Markdown-It or the print worker and cannot apply
print CSS, page geometry, cover pages, or a generated table of contents.

The module listens for active document changes, saves, and matching tab
switches so it keeps the current note snapshot without competing with the
editor's source of truth. It shares the sidebar ownership protocol with
History, Outline, and PDF Preview; each view dispatches the corresponding close
event before taking the pane.

For scroll following, `core/rawTextPreviewModel.js` purely clamps a measured
source anchor or source-progress fallback to the raw pane's scroll range.
`rawTextPreview.js` owns the DOM effects: it samples the source position at the
same viewport marker used by the main editor, measures that exact character in
the raw `pre`, and applies only the latest coalesced editor-scroll update. The
mapping is one-way, is detached when the pane or source loses ownership, and is
remeasured after content or sidebar geometry changes. The toolbar's approved
primary button copies the module's current in-memory snapshot through the
existing clipboard adapter and reports success or failure through the pane's
live status.

## PDF preview: isolated frame and message bridge

The PDF preview must accept note-local CSS that can style `html` and `body`
without allowing that CSS to affect Figaro's interface. A normal application
`div` or shadow root is not sufficient: shadow DOM changes the styling contract
and selector behavior, while an unscoped `div` leaks user CSS into the app.

The preview therefore uses the fixed local frame at
`frontend/pdf/preview-frame.html`. It is sandboxed with `allow-scripts` only:

- It does **not** receive `allow-same-origin`, popup, form, or top-navigation
  permissions.
- It has a restrictive CSP and runs only Figaro's nonce-protected bridge
  script. Markdown source HTML is disabled, the generated body is sanitized,
  and user CSS is inserted as stylesheet text inside the frame.
- The frame applies print CSS to its actual `html` and `body`, preserving the
  documented PDF stylesheet behavior, including page and background rules.

The parent application never accesses `iframe.contentDocument` or a frame DOM.
That is essential: an iframe can become opaque or cross-origin in WebKitGTK,
and touching it after a navigation causes sandbox violations and can leave the
preview unusable.

Instead, the two contexts use a narrow `postMessage` protocol. Each load of
the fixed frame receives an unguessable bootstrap token in its URL fragment;
each render then receives its own token. The parent validates the frame
`WindowProxy`, bootstrap token, and render token, while the frame validates
that messages came from its parent. The bootstrap token matters after a bad
navigation: a foreign page retains the iframe's `WindowProxy`, but cannot
forge `ready` and receive the printable document snapshot.

Markdown-to-print rendering can include asynchronous diagram work. The parent
therefore allows only one preview render at a time: each input event invalidates
the active request immediately, preserves the ordinary trailing debounce, and
queues one latest snapshot. Completed stale work is never sent through the
bridge, so expensive bursts cannot race a later edit or paint an older preview.
The pure Markdown-It parsing phase runs in a module worker when the webview
supports it; callout/TOC decoration, fenced-code highlighting, and DOM-dependent
Mermaid/Vega conversion remain on the document side. A worker failure or unsupported WebKit build falls
back to the established in-thread renderer, preserving preview correctness.
The shared diagram renderer consults a pure Mermaid source policy before the
vendored parser is initialized: it applies the parser's 50,000-character limit
before YAML frontmatter work and rejects YAML ordered-map tags. Live preview,
PDF preview, and export therefore share one effect-free security decision and
the existing failed-source recovery behavior. The live-diagram CodeMirror
adapter also observes native folded ranges: an exact fence-body fold suppresses
its replacement decoration so the fold placeholder owns the block, and an
unfold transaction rebuilds the live decoration under the ordinary
cursor-reveal rule.

Mermaid's render-performance seam keeps the cache policy in the pure
`core/diagramRenderCacheModel.js` module. The shared renderer owns a bounded
source-keyed LRU and in-flight promise map, and rebases generated SVG ids each
time cached output is mounted so editor and printable consumers can share the
result safely. The live-diagram adapter injects
`usecases/diagramRenderQueue.js`; its browser scheduling port waits for a
scroll-quiet interval and an idle opportunity, while queue ordering and
cancellation remain testable without DOM or timers.

The focused Mermaid Editor reuses that adapter without adding another rendering
path. The configured Markdown-guide extension adds an **editor** action beneath
the left-side **mermaid** fold guide; the application composition root resolves
that guide against the current diagram scan before opening the modal. The modal
keeps edits in a temporary CodeMirror state. Pure
catalogue normalization, parser-error mapping, adaptive-delay policy, and
fence-body replacement planning live in `core/mermaidEditorModel.js`. The
injected `usecases/mermaidPreviewSession.js` coordinates timers, parsing, and a
single latest-only render queue. `mermaidEditor.js` alone owns dialog DOM,
temporary CodeMirror effects, and the final atomic dispatch to the root editor.
Its template-state policy distinguishes protected user source from live
template browsing before the dialog performs any CodeMirror transaction. The
dialog receives the already-configured Vim extension and global visual-row
mapping as an input profile, and copies the root tab-size and indent-unit facets
into its temporary state. Vim cursor-mode classes are owned by a CodeMirror
editor-attribute compartment rather than an ad-hoc DOM mutation, so diagnostics
transactions cannot discard them; cleanup restores root-editor Ex commands and
status ownership. Dynamic Diagram-to-Template option changes reuse the shared
select-combobox adapter's refresh boundary rather than rebuilding modal UI.
Whitespace classification and preview transform decisions remain in the pure
Mermaid editor model. `mermaidPreviewNavigation.js` alone translates wheel,
pointer, and keyboard events into those transforms, publishes explicit SVG
dimensions plus pan offsets, and tears down its listeners with the dialog; it
has no reference to the root document or Apply transaction.
Document Outline's width transition is coordinated at its existing UI-effect
boundary. A bounded request-animation-frame loop asks CodeMirror to measure
while the editor width changes, then stops after three stable frames (or thirty
frames maximum), keeping block widgets and gutters in one layout generation
without introducing a persistent observer. A shared adapter publishes that
visible width plus the measured gap between CodeMirror's outer left gutter and
the padded, centered writing edge through block-action CSS properties during
ordinary geometry updates and the bounded transition. A pure layout model
bounds that left-rail inset and decides from the measured editor-to-writing-edge
gap whether a full text action can fit without entering the sidebar. Mermaid
and table actions normally share the helper stack; a constrained table action
uses its measured fallback row above the grid instead of overlapping either
neighboring surface.
The left-side layout hook positions both entries in each control stack
toward the writing surface without redefining the shared button primitive. It
uses the primitive's editor-sized monospace typography, compensates for
CodeMirror's 16 px gutter padding, and translates the helper rail just outside
the writing edge. Document width and block measurements stay unchanged.

| Direction | Messages | Purpose |
| --- | --- | --- |
| Parent → frame | `render`, `set-source-position`, `set-content-progress`, `set-document-progress`, `set-scroll-sync-paused`, `scroll-fragment`, `ping` | Supply the printable snapshot, synchronize a source anchor (with percentage fallback), and suspend synchronization during splitter resizing. |
| Frame → parent | `ready`, `rendered`, `render-error`, `scroll`, `link`, `reference-missing` | Report lifecycle, navigation requests, and scrolling. |

The frame captures anchor activation itself, before browser navigation:

- `#fragment`, table-of-contents, footnote, and return links scroll within the
  frame.
- `http(s)`, `mailto`, and `tel` URLs are sent to the parent, which uses the
  native Wails browser opener.
- Vault-local links are sent to the parent and opened through Figaro.
- Unsupported schemes stay in the frame and produce an explanatory status.

Scroll synchronization is deliberately lower-frequency than native scrolling.
Markdown-It block maps become `data-figaro-source-start`/`-end` attributes, and
diagram replacement transfers the fence range to its generated figure. The
frame and CodeMirror report the source position crossing the same 30% viewport
marker; nested printable blocks prefer the narrowest matching range. This
avoids cumulative percentage drift when code, tables, or diagrams have very
different heights across the two panes. Generated cover/contents gaps and any
unmapped region retain the document/content-percentage fallback.

Both panes still scroll locally at the display's normal cadence; only the
latest source position crosses the bridge, at most about 30 times per second.
Bursts are coalesced and a trailing update preserves the final position.
Programmatic frame reports are explicitly marked; unmarked reader movement
always takes precedence, even if an earlier editor update is still settling.
Do not make scroll events a one-for-one bridge protocol: that makes WebKitGTK
pay a cross-frame message and a CodeMirror position update for every visual
frame.

Dragging the PDF splitter temporarily pauses both synchronization directions
and disables pointer interaction with the frame. This prevents reflow-driven
frame scroll events from fighting the user's resize gesture. On release, the
parent waits 80 ms for resize events to settle, resumes the bridge, and sends
one authoritative editor-to-preview position. Any queued frame scroll report
is cancelled when the pause message arrives.

The preview has a 340 px minimum width and no arbitrary maximum. While space
is available, the splitter instead preserves a 320 px editor floor. When the
remaining editor becomes narrower than 560 px, CodeMirror's horizontal content
padding contracts from 24 px to 12 px; it returns to the normal padding when
space is restored. Pointer capture keeps the gesture alive outside the narrow
splitter, and sidebar transitions are disabled only for the active drag.

As defence in depth, the frame gives copied document links a blocked popup
fallback and the parent reloads the fixed bridge document if it stops reporting
ready. `postMessage('*')` is intentional here because a sandbox without
`allow-same-origin` has an opaque origin; the source/window and token checks
are the authentication boundary. No external document is allowed to become the
permanent preview.

When changing this code, do not reintroduce parent-side frame DOM access just
to simplify scrolling or link handling. Extend the protocol instead. The
browser-level tests must cover external links, fragments, footnote return
links, a vault-local link, closing the preview, and generating a PDF after a
link interaction.

## PDF rendering and export snapshots

`pdfExport.js` builds one semantic printable HTML contract used by both the
preview and the final browser export. It owns generated cover pages, tables of
contents, callouts, footnotes, task lists, code highlighting, and diagram
replacement. `core/printableCodeHighlight.js` makes the effect-free decision
about an explicit fence language versus automatic detection through an injected
highlighter; the printable DOM adapter applies the returned escaped token markup
after either worker or in-thread Markdown parsing. It reuses the eagerly loaded
editor highlighter, then emits `.figaro-print-code`, `data-highlight-language`,
and highlight.js-compatible token classes before diagram fences are replaced.
`core/printableTableModel.js` separately plans the deterministic, printable-only
vertical merge convention for anchored `^` data cells. The DOM adapter in
`markdownTableRenderer.js` applies that same pure plan to the live semantic table
and converts portable `<br>` cell markers into real break elements while
skipping code spans. `pdfExport.js` uses the same DOM adapter, so the source
remains rectangular Markdown and no second table-editing model is required.
The preview adds only screen geometry and a selected stylesheet; the final
export uses the same body and default print CSS.

`page-numbers: true` adds CSS page-margin counters and numbered-contents cells
to that shared contract. Chromium 131 is the minimum engine with the required
margin-box support; Safari and older Chromium fail explicitly instead of
silently omitting numbers. With no generated contents, the export stays one
pass. With contents, the desktop use case renders a provisional PDF, resolves
the first generated internal-link destinations through the pdfcpu adapter,
injects their physical pages into reserved fixed-width cells, and renders the
final PDF through the same `ChromiumPDFSession`. It resolves the final
destinations again and publishes only when they match. The pass coordinator is
tested through narrow render/resolve/inject/write ports; CDP owns browser I/O,
and the root-scoped desktop adapter owns stylesheet migration and publication.

The version-2 starter migration is also additive: a root-scoped adapter creates
a distinct target, writes the current starter first, and appends the selected
stylesheet as later overrides. It never rewrites either source or an occupied
target.

Before **Generate PDF**, Figaro saves the exact in-memory Markdown and selected
stylesheet snapshots used by the preview. This avoids a race where an edit is
visible in the pane but an older on-disk version is exported.

Chromium-family discovery validates capability through the same startup path
as export: an isolated temporary profile, remote debugging endpoint, WebSocket
connection, and `Browser.getVersion` request. A separate `--headless --version`
probe is intentionally absent because launcher and Windows process behavior do
not prove that the PDF engine is usable. Figaro also avoids forcing
`--disable-extensions`, which managed Chrome installations may reject; the
temporary profile already isolates user extensions. A configured executable
that has moved or no longer starts is logged and automatic discovery continues.
Startup diagnostics retain the failing executable, launch stage, timeout, and
captured browser output so chooser errors are actionable.

Linux discovery also reads `/snap/bin`, classifies only conservatively named
Chrome, Chromium, Edge, and Brave commands, preserves the normal engine
priority, and subjects every candidate to that same DevTools startup. The pure
candidate and workspace policies remain separate from directory reads and
process launch. A `/snap/bin/<snap>[.<app>]` executable uses an ephemeral leaf
below `$HOME/snap/<snap>/common/figaro` for validation and export, keeping the
profile, printable HTML, local assets, and output inside a path visible through
Snap confinement; the effect coordinator removes that leaf afterward.

## Dialog system and focus boundary

All application-owned dialogs are created by `frontend/js/dialogs.js`; feature
modules must not call the browser's `alert`, `confirm`, or `prompt` functions or
append an independent modal overlay. The shared shell supplies the semantic
`role="dialog"`/`aria-modal` relationship, labelled headings, tone and icon
language, responsive sizing, reduced-motion behavior, and one action footer.
It also makes the application inert, traps Tab within the dialog, handles
Escape as cancellation, and restores the element that previously held focus.
Opening a second dialog cancels and resolves the first instead of leaving a
detached promise or key listener behind.

Backdrop dismissal is allowed for acknowledgement and confirmation dialogs,
where it is equivalent to cancel. Text-entry and merge dialogs require an
explicit Cancel or Escape so an accidental click cannot discard typed input or
checkbox choices. Destructive confirmations initially focus Cancel and use a
red, consequence-specific action label; ordinary confirmations initially focus
their primary action. Validation belongs beside the relevant input and keeps
the dialog open.

Rename, new-file, merge-notes, and PDF-browser recovery are purpose-built
compositions on the same lifecycle. Rename shows the parent folder, selects a
file's stem without hiding its editable extension, disables an unchanged
submission, validates unsafe names inline, and reminds the user about link
rewriting. Merge identifies the destination, preserves visible source order,
requires at least one checked source, and labels the final action as deleting
those sources. Backend failures use the shared error dialog rather than an OS
or webview alert.

## Rename and link rewriting

File-tree rename is more than a filesystem move. It delegates path changes to
the vault layer and rewrites affected Markdown links, then updates open-tab
paths and refreshes backlinks. Treat a rename as a workspace-wide operation;
adding a second, frontend-only move path would bypass backlink consistency.

## Linux desktop integration

Linux desktop shells cache icon bitmaps aggressively. On startup, Figaro writes
a content-hashed icon filename, removes only older Figaro-owned icon resources,
refreshes icon and desktop caches, and points the launcher at the new path.
This is why the code looks more involved than a one-time `.desktop` install:
the goal is reliable upgrades on GNOME and Fedora, not merely a correct first
launch.

## Testing layers

The detailed test pyramid and end-to-end exception budget live in
[`docs/TESTING.md`](docs/TESTING.md). Pure rules are tested with plain values;
use cases use narrow injected fakes; adapters and components exercise one real
effect boundary. Playwright is reserved for behavior lower layers cannot
represent, and packaged-native checks cover differences among WebKitGTK,
WebView2, and WKWebView.

Hosted browser checks keep their diagnostic effect at the workflow boundary.
Under `CI`, Playwright emits an HTML report and retains traces and screenshots
only for failures; the ordinary and release workflows then upload the report
and `test-results` for 14 days. Local browser runs keep Playwright's normal
lightweight reporter and do not incur failure-capture overhead unless the
caller explicitly sets `CI`.

For example, jsdom does not enforce real iframe sandbox origins, so it cannot
be the only test for the PDF preview. Before releasing changes to the preview
bridge, run the focused browser/PDF integration contract and the real
WebKitGTK/Wails path on Linux. That boundary check proves that no user click can
navigate the preview frame away from Figaro's local bridge; parsing, bridge
message validation, and failure matrices remain below the browser layer.

The frontend unit suite also covers the splitter's editor floor, compact
padding state, synchronization pause, and single post-resize alignment. Go
tests inject browser validation for deterministic discovery-order checks; the
opt-in system-browser test exercises the real isolated CDP validation on a
developer machine.

The opt-in huge-vault profile follows the same layering. A pure CommonJS plan
defines the deterministic 10,000-document hierarchy and the two source
templates; a thin Node adapter materializes those sources and filesystem
copies. The Go profile exercises real root-scoped vault and Git adapters, while
one focused Playwright profile measures only irreducible DOM, layout,
CodeMirror-viewport, and keyboard-update costs with equivalent planned
payloads. Absolute timings remain reports rather than test assertions. See
[`docs/HUGE_VAULT_STRESS.md`](docs/HUGE_VAULT_STRESS.md) for the measured
boundaries and [`docs/TESTING.md`](docs/TESTING.md) for the repeatable command.

Correctness comparisons remain independent from those measurements. A warm
application snapshot is differentially checked against a fresh rebuild after
incremental mutations, file-tree results are checked against a direct disk
walk, sparse move candidates are checked among unrelated files, and
path-scoped Git status is checked against the complete go-git worktree oracle.
The browser contract navigates logical collections beyond a prospective render
window and never equates mounted-node count with result count. This lets future
adapters change storage and rendering strategies without weakening the stable
observable contract.
