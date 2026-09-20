# Editor updates and interaction diagnostics

This is the starting point for cursor and typing performance work. Follow the
cause through a declared subscription or a CodeMirror update, then measure the
work at that boundary. Do not begin by adding a cache to each shell consumer.

## Ownership and notification contract

CodeMirror owns the mounted document, selection, syntax state and viewport. The
tab manager owns immutable workspace records and edit/save generations. The
pure `core/workspaceCursorModel.js` store owns immutable remembered selections
by tab ID. `getTabCursorState` and `setTabCursorState` read/write one cursor in
constant time without copying or classifying open tabs. `openTabs` records can
carry initial cursor seeds, but their `cursorState` is not the live value.
`state.tabCursorStates` materializes a snapshot only when requested; session
snapshots read it synchronously without waiting for rendering or a debounce.
Structural tab publications reconcile lifetimes/seeds and rebuild the tab-position
index; renames that replace an ID transfer its latest cursor before removing the
old entry. Known single-record edit/content transitions use that index, classify
only the changed record and skip cursor reconciliation when ID/type/seed are
unchanged. The immutable tab-array copy remains linear in the number of tabs.

`core/workspaceTabChanges.js` classifies tab publications. Individual cursor
updates publish `{ tabId, previous, cursorState }` directly; they do not publish
`openTabs`. Subscribers choose one of three channels:

| Channel | Changes | Consumers |
| --- | --- | --- |
| `tabPresentation` | Add/remove/order, identity, type, title, path, external identity, calendar date, dirty state | Tabs, file-tree markers, navigation, breadcrumbs, window title, accessibility and tab metadata persistence |
| `tabCursors` | Remembered anchor/head on an existing tab | Explicit cursor observers, when needed |
| `tabBuffers` | Content, edit/save/load generations, mtime or editor text scale on an existing tab | Explicit buffer observers, when needed |

Structural changes are delivered through `tabPresentation`; cursor/buffer
observers must also subscribe there if they maintain per-tab lifetimes.
`subscribe('openTabs', ...)` is rejected. Use a stable diagnostic name as the
third argument, for example `subscribe('tabPresentation', render, 'breadcrumb')`. Callers must publish new records rather
than mutate old ones; move/rename planning preserves the old snapshot and the
editor adapter transfers any parked undo history to the replacement record. A cursor
update never invokes presentation subscribers, serializes tab metadata, or
calls the native title bridge. Portable cursor persistence remains debounced by
350 ms and coalesces slow writes; note saves still read the current editor.

## Editor observer contract

`core/editorUpdateContract.js` is the executable dependency table for observers
outside CodeMirror. `editorUpdates.js` owns subscription, error isolation,
disposal and declared delivery scheduling. `editor.js` publishes document,
selection, viewport, geometry, syntax-tree and document-owner changes using
CodeMirror's actual update flags. Combined edits remain one delivery per
consumer, with the original combined change set and previous document.

| Observer | Changes it receives | Work |
| --- | --- | --- |
| Outline | Document, selection, viewport, owner | Map/reparse headings on edits; follow the selection; schedule sticky geometry when needed |
| Writing | Document | Capture the revision and immutable source; defer analysis/refresh |
| Activity | Document, owner | Select the owned note and invalidate activity after edits |
| Raw/PDF launchers | Owner | Coalesce availability refresh to one microtask; pane and workspace changes keep their separate controls |

Unknown observer names fail immediately. Adding an observer requires changing
this table and its tests. The former broad DOM `editor-view-updated` event is
forbidden by the architecture suite.

CodeMirror state fields and view plugins retain their native lifecycle; they
are not dispatched through this external observer hub. Their work contract is:

| Change | Permitted editor work |
| --- | --- |
| Selection in an unchanged source/reveal region | Cursor status, remembered selection, active heading/focus, bounded visible decoration work, necessary caret geometry |
| Crossing a rendered/source boundary | Reveal decorations and placeholder geometry using retained parsed descriptors |
| Document edit | Incremental syntax and affected projections; conservative full-parser fallback when structure may change; one clean-to-dirty presentation transition |
| Viewport or geometry | Visible decorations and required measurements; cached syntax/source projections remain reusable |
| Parser progress or configuration | Refresh descriptors whose syntax tree changed, even if the text object did not |
| File activation | Refresh ownership, document-specific state and mounted controls, including identical-source files |

Images, tables, math, diagrams and block guides retain parsed descriptors across
ordinary cursor motion. Images also retain their decoration set while reveal state is unchanged.
The pure selection interval index and `sourceReveal.js` adapter inspect only
blocks overlapping the old/new selections. Local queries follow a logarithmic
tree path; `sourceRevealChanges` plans visibility transitions and the adapter
patches only each affected block's owned decorations. Unrelated widgets retain
their decoration identity. Long selections may inspect every covered block.
Mapped edits replace the index only when descriptor positions change; parser/fold/drag/configuration invalidation
remains explicit. Outline holds mounted row references and changes only the
previous and next active row, with no row writes within a section. Image descriptors follow both document and syntax-tree
identity. The assembled test checks the real editor and its tab/shell adapters;
Jest resolves `codemirror-live-markdown` to the same patched vendored build used
by production. No full-document conversion or preview parse is allowed during
the warmed ordinary cursor scenario.

## Installed extension audit

The September 2026 audit follows the actual registrations in `createEditorView`,
`markdownExtensionsForPath`, and `codeExtensionsForSupport`, including the bundled
live-Markdown providers. This table describes work at the extension boundary;
CodeMirror's internal layout, parser and selection algorithms remain separate
from application counters.

| Installed provider or service | Update dependency and work boundary |
| --- | --- |
| Bundled formatting markers | Visible syntax descriptors on document/parser/viewport/configuration changes; pure marker visibility on selection or drag settlement; unchanged decoration identity |
| Bundled Markdown styles | Visible syntax on document/parser/viewport/configuration changes; no selection rebuild |
| Bundled ordinary code | Map cached descriptors on proven prose edits; map existing decorations; parse structural edits/parser/configuration changes; indexed selection checks patch only changed blocks; cached fold/drag projections |
| Bundled links and reference links | Visible syntax/source; selection can rebuild a bounded visible projection. Reference definitions follow document identity and structural edit invalidation |
| List/task widgets and extras | Visible syntax or text on document/geometry/viewport/selected-line changes. Filter ListMark/Task before slicing a node; a root/container must never cause a whole-note read. Large range selections may cover many active lines |
| Hashtags and color swatches | Visible text on document/viewport changes; swatches also follow read-only state |
| Images, tables, diagrams and math | Retained descriptors and indexed reveal checks; parser/edit/fold/drag/configuration invalidation according to each provider; math retains primary-head selection policy |
| Frontmatter and image-vault refresh | Metadata parses only on edits; selection can change the frontmatter reveal mode. Vault refresh remounts images only for relevant external changes |
| Pure writing | Current structural block; normalize phrase segments once per block/document and binary-search ordered ranges; visible dimming; decoration reuse within unchanged focus/viewport; independent geometry and authored-input typewriter scheduling |
| Block guides, folding, activity and relative numbers | Cached source projections and guide width; indexed widget overlap/visible guide lines; visible gutter output. Geometry/fold/activity changes refresh owned state; relative numbers follow the current logical line |
| Source footprints and block-control visibility | Coalesced geometry/DOM work; retained wrapping metrics. Controls debounce editing/selection and act on mounted roots |
| Writing marks and link hints | Findings/viewport invalidation; mounted link-label reconciliation after DOM updates. No cursor-triggered review engine execution |
| Completion activators, empty-link autofill, ordered-list renumbering | Authored edits or explicit commands, not ordinary cursor motion |
| Hover preview, clipboard, paste, task/table commands, scroll guards | Relevant input/hover events, with source work scoped to the invoked operation |
| Vim and vertical-motion adapters | Keyboard/selection navigation and required cursor geometry; coalesced native viewport repair |
| History, bracket matching, selection drawing, language/highlighting, completion, lint and native Find | CodeMirror owns these engines and their supported update lifecycle. Figaro does not replace their algorithms; representative assembled/browser checks cover their integration |
| Search status announcement | Coalesced frame; exits while Find is closed. Cache matches by immutable document, query and word-character rules; binary-search the active result. State-dependent custom queries retain conservative invalidation |
| Editor status, cursor memory, external observers and diagnostics | Current position, one immutable cursor record and the named observer contract above; tracing remains opt-in |

Heading structure is built in one stack pass: parents serve sticky ancestry,
and next same-or-shallower headings serve guide boundaries. Sticky lookup follows
at most six parents after binary search. Guide construction no longer copies
all following blocks for every heading.

`canMapMarkdownProseEdit` checks complete old/new trees, unchanged paragraph and
list/quote ancestor boundaries, and changed text through the pure prose policy in
`core/markdownProjectionModel.js`. Ordinary letters, Unicode punctuation and
spaces may map even inside formatted paragraphs; Markdown delimiters, newlines,
image-bearing paragraphs and uncertain structure reparse. Code/image/table
fields map existing decorations and patch only changed reveal states, including
combined edits and nonlocal selection jumps. Unmoved descriptors retain their
array and reveal index. Code/table clicks resolve the mounted decoration's source
position, so reuse remains correct after virtualization/remounting. Fold/drag
changes and reconfiguration retain explicit projection refreshes. Diagram/math
keep their existing safe mapping policies.

Known scaling boundaries remain explicit: mapped edits still traverse retained
positions and rebuild range indexes when positions move; immutable buffer
publications still copy the tab array; structural edits may parse the whole note;
long selections may touch many blocks; Find edits/new queries enumerate matches;
explicit portable-session snapshots enumerate tabs. Native layout and parser
work remain outside these application limits. These operation counts do not
measure input latency on the affected laptop or bound every editor mode.

The formatting/code regression compares 10 and 1,000 blocks, spies on real syntax
iteration and source slicing, and asserts decoration identity. The assembled
editor uses a controlled viewport for its 1,000-section jsdom case (jsdom itself
reports a zero-height scroller); the unchanged browser/native matrix owns actual
viewport and selection geometry.

## Diagnose an interaction

In the development browser or native webview inspector, after opening a note:

```js
app.editorDiagnostics.start({ limit: 200 });
// Move the cursor or type the small scenario under investigation.
const trace = app.editorDiagnostics.stop();
console.table(trace.map(({ id, kind, reasons, durationMs, counters }) => ({
    id, kind, reasons: reasons.join(', '), durationMs, ...counters,
})));
console.table(trace.flatMap(({ id, work }) => work.map(entry => ({ id, ...entry }))));
// Copy JSON.stringify(trace, null, 2) into a local report if needed.
```

Tracing is disabled by default and never persists or transmits a report. It
stores no note text, input characters, paths, IDs of documents, or DOM references.
The bounded buffer retains at most 1,000 interactions, with at most 500 work
entries per interaction; `droppedWork` reports truncation. `snapshot()` reads
without stopping; `clear()` clears retained records.

Input capture observes events without consuming them. It closes at the bubbling
boundary, with a task fallback for stopped propagation; a microtask boundary is
insufficient because native WebKit may run microtasks between event listeners. Synchronous CodeMirror
transactions attach to that input; transactions outside a captured event have
their own record. Named work includes tab notifications and external editor
observers. Instrumented deferred work preserves its originating interaction and
reports its phase (`microtask`, `frame`, `measure`, or `debounce`), including
cursor-session persistence. Coalesced work can serve later updates as well;
its record identifies the scheduling cause, not a claim of exclusive ownership.

Counters cover instrumented full-document materialization, preview parsing,
cursor/footprint geometry, shell/cursor DOM operations, title calls, storage and
session writes. `selection.rangeNodes` counts visited interval-tree nodes,
`selection.visibilityChecks` counts candidate block checks,
`decorations.sourceBlocks` counts patched block projections, and
`decorations.images` counts complete image decoration builds.
`dom.outlineSelection` counts changed heading rows. Bundled providers receive
`markdownWorkFacet.of(countEditorWork)` from editor composition. Counters named
`syntax.nodes.*`, `source.slices.*` and `decorations.*` distinguish syntax visits,
source reads and projection builds for markers, styles, code and links; first-party
reference/list/extras adapters expose their corresponding work as well.
Counts are operations, not source text or byte totals. DOM counters count the named operation, which may contain
several individual mutations. They are not a count of every browser or vendor
operation. Work timings are inclusive and can overlap; do not sum them as total
input latency. Deferred work is listed separately from synchronous interaction
duration. Use the browser CPU/layout profiler for remaining uninstrumented
stacks and the packaged webview for actual input/selection behavior.

## Regression workflow

1. Locate the responsible notification channel or CodeMirror update condition.
2. Reproduce one small input sequence with diagnostics enabled. Check why each
   consumer ran and whether parsing, materialization, I/O or geometry is allowed.
3. Put the semantic case in the feature's lowest suitable test layer. Extend the
   assembled contract for a cross-feature work leak, including positive cases
   that prove edits, dirty transitions, rename and persistence still work.
4. Run `npm run test:focus -- editor-updates`, then the affected broader checks.
   Cursor/focus/geometry changes also require the existing browser/native matrix
   in [editor testing](testing/editor.md#block-widget-and-cursor-regressions).

The architecture suite rejects broad subscriptions. Model/dispatcher tests prove
classification, scheduling, coalescing, disposal, failure isolation and bounded
tracing. The assembled regression observes real document reads, native/storage
ports and DOM identity, independently of diagnostic counters, so removing an
instrumentation call cannot silently make the test pass. These operation limits
are reproducible across machines; physical latency requires measurements on the
affected device. `selectionRangeIndex.test.js` compares indexed results with a
linear oracle, including nested/duplicate ranges, and bounds node visits up to
10,000 ranges. `sourceReveal.test.js` runs all four real state fields with 10 and
1,000 widgets, observes actual descriptor access and decoration identity, and
covers source entry/exit, backwards/multiple selections, edits, folding and drag
settlement, including edits during an active drag. Typing tests observe actual source slicing and guide suffix copies;
source-entry tests check unrelated decoration identity. Find tests count actual
cursor enumeration, and cursor-store tests count tab array access up to 10,000
tabs. The assembled editor also checks 20 prose insert/delete transactions in a
1,000-section note with code, a table and an image. The Outline adapter observes
actual attribute mutations with 1,000 headings and panel remounts. These checks
supplement parsing/I/O limits. Guide tests count actual spacer-label reads and
indexed widget/viewport access; Pure tests count prepared phrase bounds in a
1,000-sentence block; real tab edit/content publications count unrelated tab IDs
and preserve cursor lifetimes through reorder and close/reopen.
