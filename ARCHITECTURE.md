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

`approved-components.json` is the architectural gate for the eight accepted
families. Extending it with a family, primitive, or visual variant requires
explicit approval before implementation. Focused tests verify that every
registered selector is implemented in `primitives.css`, that no unregistered
`.ui-*` selector appears there, and that both production and review surfaces
load the canonical asset.

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
parallel, and background warming may continue while an explicit startup state
is shown. It must begin during startup and finish before the application
advertises the affected feature as ready. A source-level architecture test
rejects dynamic imports in first-party application modules, and the assembled
startup check verifies the single static bootstrap path.

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
4. Shared CodeMirror document/table-cell profiles and the document-session
   controller centralized editor policy and stale-mount ownership.
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

Markdown documents supplied as operating-system launch arguments are deliberately outside that boundary. Go records only the explicit launch documents under process-local opaque IDs; the frontend can read or save an ID but cannot turn it into arbitrary filesystem access. Before opening, the frontend offers a collision-safe vault import. Declining creates a process-local root projection in the file tree and an external tab; that projection is not vault membership and is never persisted or passed to vault mutation APIs. Removing it closes the capability-backed tab after dirty-state protection and mutates only frontend state, so the original file cannot be deleted by that workflow. The pure external-file model distinguishes capability-backed reads from vault-relative reads and describes destination-specific native-drop confirmation without calling a dialog or backend. Tab activation executes that read plan before committing an external tab as selected; failed or superseded reads leave the previous active tab and CodeMirror owner paired. An external tab writes atomically to its original document and does not join the recent-files list, vault index, watcher, session, or Git history. Native drops on the file tree require confirmation before the copy adapter runs. Native drops over the editor use one themed choice: insert their paths at the drop location, or reuse the recursive merge operation to import the full batch. CodeMirror prevents its uncontrolled browser fallback from inserting an absolute path before that choice is made. After refresh, imported result paths that are files open as active tabs; directory paths intentionally leave the current buffer in place.

## Incremental vault index and native changes

Search, backlinks, Kanban, and Calendar project the same Markdown vault data,
so they share one Go-owned in-memory index rather than independently walking
and reopening every note. The index retains a note's source text and derives
its hashtags/cards, date links, and daily-note state; this makes Kanban and
calendar lookups direct and keeps search/backlinks disk-free after the initial
index build.

Figaro writes known Markdown files atomically and updates that one index entry
in the same vault lock. The recursive native watcher sends a debounced set of
changed paths to the backend: a one-file external edit similarly rereads and
reprojects only that file, while creates/removes update the tree as needed.
Recent Figaro-originated write events are recognized so the watcher does not
repeat the save work. Ambiguous broad changes such as moves, merges, or an
unscoped notification deliberately invalidate and rebuild one coherent
snapshot; correctness wins over a speculative partial update.

Each indexed file owns its own tag, Kanban-card, daily-note, date-link,
month-grouped Calendar-day, case-folded search, trigram, and Markdown-backlink
contributions. Those projections are derived in one line-oriented document
walk. A known
one-file update removes its old contributions before adding its new ones,
retaining unrelated card slices, Calendar projections, and reverse-link
entries. Case-insensitive searches intersect compact three-byte substring
postings before verifying the original note text; exceptionally large or
high-entropy notes remain in a bounded fallback set so correctness never
depends on indexing every term. Case-sensitive searches intentionally use the
original text. Search results retain and transfer only the first matching line
plus an exact total, because that is all the search UI displays. This keeps the
common save/watcher path proportional to the changed note and its affected
derived data; a full derived rebuild remains reserved for the first vault scan
and genuinely broad filesystem changes.

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
duplicate basenames. Dot-directories and symlinks are excluded; external URLs,
mail links, and code fences are not findings. The report contains only
vault-relative paths and lines, so UI navigation needs no filesystem access.

The full Kanban board remains available for its workspace, but the workspace overview asks the
backend for its bounded unfinished-card projection directly. Calendar month
navigation similarly copies only that month's pre-grouped daily-note and
linked-day lists. These narrow methods avoid transferring or filtering the
rest of a large vault merely to render a small overview.

The `vault:changed` event includes `tree_changed` and `kanban_changed`.
Content-only external Markdown changes refresh dependent data without
requesting a new file tree; directory or entry changes schedule the normal
coalesced tree refresh. An acknowledgement of a Figaro-originated save has
both flags false: the frontend already replaces that file's Kanban cards from
the saved snapshot, so it does not request the complete board again. The
initial index is still built after the first Wails window is allowed to appear,
so indexing does not delay startup.

The frontend has two complementary hot paths. An unsaved Kanban change is
projected from the dirty tab buffers on the next animation frame, without an
RPC; a Figaro save folds its final buffer into the same board snapshot, while
external changes still request backend data. The file tree still receives the
complete structural model for correct sorting and session restore, but it
renders descendants only for explicitly expanded folders. Active/open file
markers are patched on mounted nodes during tab and dirty-state changes rather
than rebuilding that structural DOM. This prevents large collapsed or expanded
trees from imposing a hidden DOM/layout cost on ordinary tab switches.

Tab overflow follows the same decision/effect split. The pure
`core/tabOverflowModel.js` calculates overflow directions and the nearest
scroll offset that reveals an active tab from plain geometry. `tabManager.js`
alone reads DOM measurements, applies `scrollLeft`, toggles themed edge-fade
classes, and exposes the approved all-tabs button only when the full-width rail
cannot fit its content.

## Git status and history restoration

Editor changes mark their tab model dirty synchronously, then publish the
one-time dirty transition to the tab bar and status controls. This ordering
keeps saves and rapid tab switches safe while ensuring the active-file
local-history action immediately becomes actionable again after a later edit.
A clean state is deliberately silent: the frontend shows **Save to history**
only when recording that file is an available action.

Auto-Commit deliberately has no timer or repository-wide operation. Its
single persisted boolean causes a successful active-file save to invoke the
same root-scoped `CommitFile(path)` path as the explicit history action. That
path stages only the requested file and refuses when another path is already
staged, because go-git commits the index as a whole. Unstaged changes in other
notes therefore remain outside both the new commit and the target note's
restore history.

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
CodeMirror live-preview feature. It parses only the active Markdown document's
headings, keeps their document offsets, and ignores frontmatter plus
heading-shaped text in fenced code. The parser runs after document changes or a
tab source swap;
selection and viewport updates use the cached heading offsets to identify the
current section without another document scan. Activating an item dispatches a
normal selection and scroll transaction, so it cannot introduce an alternate
cursor model or decoration geometry. The navigator is mounted only while its
right-pane mode owns the sidebar, and History, Markdown Preview, and PDF
Preview explicitly release it before taking that shared pane.

## UI continuity surfaces

Kanban density and column flow are webview-local presentation preferences, not
vault settings. A stacked board uses one vertical board scroll surface; the
default arrangement retains the horizontal column row.
Refreshing a board snapshots its horizontal position and each mounted column's
scroll position before replacing cards, then restores them after render. The
file tree applies the same continuity principle to structural refreshes by
retaining its scroll position and focused container; selected entries remain
the state-owned source of truth. Vault-scoped path presentation records keep
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
The Properties field uses the same source-first transition: its disclosure
generates missing default frontmatter directly into structured-panel mode,
while a later selection entering that replaced range reveals raw YAML and a
selection leaving it restores the compact card. Expanded and collapsed states
share one disclosure control. A stable CodeMirror scrollbar gutter prevents
the control's viewport position from shifting when the taller panel introduces
vertical overflow.

Vertical document navigation has a separate deterministic boundary policy in
`frontend/js/core/verticalCursorModel.js`. It consumes movement at the absolute
first and last positions and rejects a browser or height-map result that moves
in the opposite direction. The CodeMirror keymap adapter supplies line facts
and applies any correction, keeping the policy independent from CodeMirror,
the DOM, and viewport effects. The same model projects wheel deltas against the
scroll extent; its CodeMirror adapter cancels a gesture that would cross an
edge and pins the scroller to that boundary before WebKitGTK can reinterpret
the overscroll. These guards are unconditional and do not create a wraparound
preference.

When the opt-in Vim rendered-block motion is active, the root editor uses
those retained source ranges to stop `j`/`k` at the adjacent block. Fenced
blocks and frontmatter expose their portable source; interactive tables retain
their widget and focus the first or last cell. The root Vim Normal cursor is
drawn by the adapter's separate fat-cursor layer, so a root-scoped override
maps that layer to the active theme's cursor background and text tokens instead
of inheriting the adapter's fixed red. A focused table cell still has a
root selection for source synchronization, but its root cursor layer is hidden
so only the nested editor paints a caret. Each nested editor exposes its own
Vim mode; in Insert mode Figaro re-enables CodeMirror's standard cursor layer,
which the Vim extension otherwise hides, and styles the resulting line caret at
the nested selection. WebKitGTK can leave that custom layer empty, so an
`:empty`/`:has()` fallback restores the native accent caret only for that case;
engines with a custom cursor retain a transparent native caret and cannot paint
two. Normal and Replace mode override Vim's inherited unfocused-cursor rule so
their block/underline cursors remain themed and visible in the focused nested
editor. Nested mode-change and focus events drive the shared status bar, which
returns to the root Vim state when cell focus leaves. Because the table widget
returns focus without causing the Vim adapter to emit another root mode-change
event, the same focus handoff also reapplies the root's mode classes from its
live Vim state. This keeps the themed block-cursor selector active after exiting
either table edge. A Visual table move starts the same Visual subtype in its
destination editor. Normal `h`/`l` fall through to Vim's character motions and
stop at the cell's first or final character.
Visual horizontal `h`/`l` movement uses the
table library's non-row-creating Arrow path and is intercepted at the current
row's outer columns, preventing both row wrapping and table-edge insertion. In
both Normal and Visual modes,
the nested editor captures `:`, `/`, and `?`, including WebKit's `Unidentified`
keydown followed by either a `beforeinput` or legacy `textInput` event, before
table navigation observes them, then invokes the root Vim instance. Prompts
render in the root document, forward and backward searches operate on the
whole note, and
cancellation restores the originating cell without mutating table rows or
text. A shared history bridge likewise runs Vim and conventional undo/redo
against the root document, skips selection-only history entries around a Vim
edit, and reapplies the originating table/cell selection without creating a new
history entry. The table's reactive rebuild then receives focus at the saved
caret offset, including redo after the cell editor has been recreated.

List-marker lines carry an inline hanging-indent decoration that aligns wrapped
display rows with the visible item body. It is recalculated together with the
cursor-aware list marker replacement and never adds block height or changes
Markdown source.

Markdown diagnostics are an intentionally separate idle-time extension rather
than a live-preview widget. They scan only the active Markdown document after
a short pause and add inline marks plus CodeMirror's native hover/F8 surface;
the persistent, on-by-default `markdown_lint` setting can reconfigure that
extension without replacing source, altering block height, or asking the vault
backend to validate cross-file links. That keeps editing feedback immediate
while the read-only Vault Health workflow remains responsible for vault-wide
checks.

Offline spellcheck is another independent, off-by-default idle-time linter
compartment. Its
three Hunspell assets (US English, UK English, and Spanish) are served from
the embedded frontend bundle and cached in the webview; text is never sent to
a service. The global `spellcheck` / `spellcheck_language` preferences provide
the fallback, while a note's leading `spellcheck` frontmatter can select one
or more bundled dictionaries or disable that note. A hyphenated prose compound
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

`settings.json` stores durable preferences such as theme, fonts, Vim visual-row
and rendered-block motions, the Markdown-lint toggle, and the spellcheck enabled
state plus global language. Open tabs, their ordering, current per-file cursor
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

## Markdown preview: normal-theme document rendering

`markdownPreview.js` owns the non-print **Markdown Preview** right-pane mode.
It renders the current active/dirty Markdown snapshot with the shared
Markdown-It plugin set after stripping leading frontmatter. That renderer keeps
raw HTML disabled, so the application may safely place its output in the
themed sidebar document surface. This preview deliberately does not enter the
print worker or apply print CSS, page geometry, cover pages, or generated table
of contents.

The module listens for active document changes, saves, and matching tab
switches so it keeps the current note snapshot without competing with the
editor's source of truth. It shares the sidebar ownership protocol with
History, Outline, and PDF Preview; each view dispatches the corresponding
close event before taking the pane.

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
supports it; callout/TOC decoration and DOM-dependent Mermaid/Vega conversion
remain on the document side. A worker failure or unsupported WebKit build falls
back to the established in-thread renderer, preserving preview correctness.

| Direction | Messages | Purpose |
| --- | --- | --- |
| Parent → frame | `render`, `set-content-progress`, `set-document-progress`, `set-scroll-sync-paused`, `scroll-fragment`, `ping` | Supply the printable snapshot, synchronize position, and suspend synchronization during splitter resizing. |
| Frame → parent | `ready`, `rendered`, `render-error`, `scroll`, `link`, `reference-missing` | Report lifecycle, navigation requests, and scrolling. |

The frame captures anchor activation itself, before browser navigation:

- `#fragment`, table-of-contents, footnote, and return links scroll within the
  frame.
- `http(s)`, `mailto`, and `tel` URLs are sent to the parent, which uses the
  native Wails browser opener.
- Vault-local links are sent to the parent and opened through Figaro.
- Unsupported schemes stay in the frame and produce an explanatory status.

Scroll synchronization is deliberately lower-frequency than native scrolling.
The frame and CodeMirror each scroll locally at the display's normal cadence;
only the latest document-relative position crosses the bridge, at most about
30 times per second. Bursts are coalesced and a trailing update preserves the
final position. Programmatic frame reports are explicitly marked; unmarked
reader movement always takes precedence, even if an earlier editor update is
still settling. Do not make scroll events a one-for-one bridge protocol: that
makes WebKitGTK pay a cross-frame message and a CodeMirror position update for
every visual frame.

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
contents, callouts, footnotes, task lists, and diagram replacement. The preview
adds only screen geometry and a selected stylesheet; the final export uses the
same body and default print CSS.

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
