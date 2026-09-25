# Editor testing contracts

[Shared strategy and commands](../TESTING.md) · [Feature index](../FEATURE_INDEX.md)

## Windows keyboard-layout regressions

Figaro must not infer text from Windows physical key codes or replace native
WebView2 dead-key composition. The focused component regression spoofs Windows
and verifies that an ordinary backtick, `AltGr+4` dead key, and another reported
dead key are not consumed in either regular editing or Vim Insert mode. The
real-browser regression supplies browser text, requires one backtick per input
and exactly three for a Markdown fence, accepts already-composed Unicode such
as `ã`, and keeps Arrow Up/Down working across the resulting fence.

Those automated checks run in Chromium: changing `navigator.platform`
exercises Figaro's platform branch, but it does not reproduce WebView2, a
Windows keyboard layout, or native dead-key composition. Their names and
comments must describe that simulated boundary rather than claiming
Windows-native coverage.

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

## Editor update contract regressions

Follow [Editor updates and interaction diagnostics](../EDITOR_UPDATES.md).
`workspaceTabChanges.test.js` proves isolated cursor/buffer notifications, current
session snapshots, duplicate-selection suppression and immutable rename planning.
`editorUpdates.test.js` checks declared observer dependencies, combined changes,
coalesced delivery, disposal and failure isolation. `interactionTrace.test.js`
checks disabled overhead, deferred attribution, eviction and snapshot isolation.
`editorTypingContract.test.js` advances ten edits across controlled animation frames in notes
with 11 and 1,001 headings. It spies on full-text reads and real Outline mutations,
requires one buffer publication per edit and no hidden Kanban parse, list/extras
rebuild or indentation style read, then reads retained event snapshots to prove
lazy content is current, shared and immutable. `markdownLineDecorations.test.js`
checks mapped reveal ranges and checkbox actions after repeated prose shifts,
plus structural and typography invalidation.
`editorInteractionContract.test.js` assembles the real editor, tab manager,
notification hub, Outline and shell adapters: 100 warmed cursor updates must
cause no full-document conversion, preview parse, presentation notification,
window-title call or local-storage write. Subsequent edits must publish one
dirty transition, keep current buffer content, update document observers, retain
Outline rows, update renamed titles, persist the latest cursor and preserve
parked Undo history through an immutable file move. Its large-note scenario
also applies 20 prose insert/delete transactions with code, table and image
previews: no code/image/table/guide reparse or code-payload extraction is allowed.

`sourceReveal.test.js` also compares scoped heading, code, image, table, diagram
and soft Enter/Backspace edits with a freshly parsed state; it requires unrelated
decoration identity to survive. A partial-tree test proves reuse before the parser
finishes and discovery of the remaining blocks afterward. Unrelated settings must
retain complete field identity. Guide tests compare title/language/fold boundaries
with a fresh model and guard newly standalone images.

Jest maps `codemirror-live-markdown` to the production vendored build. Image
adapter coverage verifies retained descriptors across cursor motion and parsing
after edits; existing source-reveal, resizing, Undo and Draw.io checks remain.
`sourceReveal.test.js` verifies decoration identity and descriptor access with
10/1,000 images, tables, diagrams and math blocks. It preserves inclusive bounds,
backwards/multiple selections, primary-head math behavior, mapped edits, image
fold/unfold, drag settlement and reveal reconfiguration. The pure interval index
is checked against a linear overlap oracle and bounded at 10,000 ranges.
Source entry/exit must patch only affected blocks: unrelated decorations retain
identity and descriptor reads remain bounded at 10 and 1,000 blocks. Prose edits
map payloads and decoration values, including bold/list/quote text and curly
apostrophes; structural edits must refresh them. Edits after every block retain
the descriptor array and reveal index. Combined edits and nonlocal selections
must hide/reveal the correct mapped blocks. Code/table component tests
click retained DOM after edits and check its mapped source position.
The assembled cursor contract also forbids image rebuilds and Outline row writes
within one prose section. `outlinePanel.test.js` uses a MutationObserver over
1,000 headings: same-section movement writes no rows, crossing sections touches
only two rows, and closing/reopening initializes the active row again.
The architecture policy rejects broad editor events/raw tab subscriptions.
Keep actual key/pointer geometry in the existing browser/native matrix below.

`editorRemainingWork.test.js` retains the consolidated ten-finding scale matrix:
ordinary formatting motion touches no unrelated marker descriptors; code scope
checks remain bounded with 10,000 offscreen lines; math edits after all formulas
retain their index; unchanged Mermaid fences validate once per source/context;
completion appends read inserted characters rather than the full prefix. The
same matrix preserves writing point queries, diagram allocations, mapped inline
projections and Properties reuse. `markdownInteraction.test.js` checks ordinary
clicks without full-text conversion and preserves the footnote create/return/Undo
journey. Its click fixture deliberately exhausts the initial parser time slice,
finishes parsing, and publishes the completed tree before measuring interactions.
Finishing the parser alone leaves the new tree unpublished until a later
transaction; counting that first publication as click work produces a spurious
block-guide full-text read. Controlled time includes each mouse-release frame
in the zero-read assertion. Pure completion and indentation tests compare against the existing
source matchers/scope oracle. Cache eviction, failed-result relocation and
obsolete-lint cancellation remain below the browser layer. Run existing heading
completion, hashtag, footnote, code tab-size, editor cursor and Vim workflows in
Chromium and the packaged native webview.

## Block widget and cursor regressions

### Gutter stability and cursor-motion work reuse

The gutter-fold browser scenario samples every animation frame while equal-line-
count fixtures widen and shrink the helper labels, blur/refocus the editor, and
fold/unfold a containing heading. With enough writing margin, both the content
and source-line left edges must stay within 0.5px; measured helper width must
match its negative-margin reservation on every frame. Establish the initial
fixture before recording, but never wait away the transitions under test.
`markdownBlockGuides.test.js` separately proves batched updates read the final
installed spacer after the DOM update and that removing the extension cancels
pending publication. Existing geometry, cursor, and drag checks remain required.

The September 21 packaged Linux WebKitGTK check observed zero horizontal shift
and zero reservation mismatch across 109 frames each with default settings,
line numbers, Activity dates, and Pure mode. All four retained Arrow Up/Down, mouse placement,
forward/reverse selection across a folded Mermaid block, expansion, and exact
source (34 checks), including retained date visibility and Pure layout classes
through focus changes. Input was DOM-dispatched on an isolated Weston display;
physical input, Windows WebView2, and macOS WKWebView were not tested.

`vendoredMarkdownCursor.test.js` observes the shipped formatting/style/code
providers directly: 20 ordinary cursor moves across 10/1,000 blocks do no
formatting tree iteration or code source slicing, and keep decoration identity.
Visible-range tests cover disjoint segments, container deduplication and exact
end boundaries. Positive cases retain marker source reveal, multiple/backwards
selections, drag settlement, configuration, folding, parser progress, edits and
Undo/Redo. `markdownFormattingModel.test.js` owns pure marker visibility.
The assembled contract observes actual syntax calls/source slices independently
of diagnostics, including a 1,000-section fixture with an injected visible-range
boundary because jsdom has no physical viewport. A visited syntax root must not
cause the list-widget pass to read the whole note. Run the existing folding,
code copy/click, Markdown cursor/drag, Outline and Vim browser/native matrix.

`markdownLineModel.test.js` owns pure marker/indent/extra plans.
`markdownLineDecorations.test.js` and `markdownLinksProjection.test.js` observe
10/1,000 visible entries: unchanged selection motion must do no syntax/source
reads, font measurements or unrelated decoration replacement. They cover active
line/link boundaries, multiple/backwards selections, drag transitions, edits,
Undo/Redo, parser/configuration changes, task actions and reference definitions.
`writingLinkHints.test.js` checks indexed finding access and actual redraw
reconciliation, with no visits to 1,000 offscreen findings. Gutter tests require
no unchanged accessibility writes or same-logical-line label redraw. The existing
wrapped-list browser scenario checks active numbered markers and live font-scale
changes as well as bullet/quote wrapping. Native verification repeats horizontal
and Up/Down movement, pointer placement, bidirectional drag, task Space/click,
Tab/Shift+Tab and empty-list Enter. For WebKit character ranges at a wrap, inspect
the nonzero client rectangle: its bounding union can include a zero-width
rectangle on the previous row.

Table/math component tests count document reads across source entry, repeated
motion, and exit, then require edits/folding to refresh. Guide tests retain
structural descriptors across unchanged document/parser states, map proven prose
edits, and invalidate structural edits. Actual gutter cursor updates must read no cached labels; widget lookup visits
only overlapping candidates and viewport lookup scales with visible entries.
`markdownBlockGuideModel.test.js` bounds the viewport search. Actual array-slice spies forbid quadratic
heading suffix copies. `outline.test.js` bounds parent lookup and proves nested,
skipped and same-level section boundaries. `searchMatchStatus.test.js` counts
native cursor iteration at 10/1,000 matches across selection changes, then checks
text/query/word-character and custom-predicate invalidation. Outline tests type repeated prose with real CodeMirror change sets,
require no full-source read or replacement row, navigate to its mapped offset,
and then introduce a heading to exercise the parser fallback. The pure policy
covers Setext, fences, frontmatter delimiters, and multiline edits.
Footprint adapter tests require all wrapping rulers mounted before the first
height read, reuse on unchanged viewport updates, source/typography invalidation,
and no wrapping metrics for empty prose or authored chart sizes. They also
replace mounted elements repeatedly, require cached heights with no new ruler,
and invalidate for changed width/source, font completion and loading fonts.
`previewCache.test.js` bounds entry count/weight, replacement, eviction, disposal
and one-time transfer. `liveDiagramPlugin.test.js` requires the same SVG nodes
and local references after repeated source entry/exit and mapped edits without
advancing the quiet timer. It invalidates retained output for changed source,
appearance, fonts, engine and responsive width, and rejects external-data reuse.
Mermaid held-key and both renderers’ composition cases must defer attachment,
then restore the same SVG without another generation after quiet; cancelling a mount must leave retained
output available for the next valid return.
The existing footprint browser scenario checks fitted SVG dimensions on the
first paint after restoring a prepared diagram. Keep the same
native and browser cursor/drag/resize boundaries below.

`domPreviewCache.test.js` verifies per-view transfer, validity checks, retention
limits and extension disposal. Code/math/table/image component cases require
retained content after repeated source returns and mapped edits, then fresh
output for changed sources/renderers. Malformed code grammars must retry
highlighting rather than retain failed output. Image cases cover oversized payloads,
late loads, cancelled mounts, fresh controls/Undo and Draw.io activation URLs.
The existing footprint browser case checks first-paint code/math/table/diagram
sizes; the image resize case checks first-paint image size before using its new
controls. Native verification repeats warmed source crossings, clicks, drags,
resizing and held-arrow reversal for all four retained content families.

Cursor-only reuse is covered below layout: `fileTreeModel.test.js` compares dirty
path sets, and `fileTree.test.js` defensively passes 100 cursor-only snapshots
to the presentation callback without querying mounted tree rows; dirty/clean
markers remain live. The assembled contract additionally proves that real
cursor updates never call that presentation channel. `outlinePanel.test.js`
proves selection/viewport events reuse the document without reading its full
text while active headings and edited headings update. `pureWriting.test.js`
checks retained focus decorations and phrase data, no cursor-driven presentation
writes or full-document conversion, bounded lookup across 1,000 cached phrases,
inclusive phrase edges/gaps and unusual input order, nested-block entry, selection/Find/pointer
suspension, first-line styling, and resize refresh. `liveDiagramPlugin.test.js`
keeps parsed fences and source placeholders through navigation, invalidates
content edits, and retains the folding and render/source contracts. The editor
component test sends repeated vertical requests, verifies one queued frame,
retains the post-paint correction, and checks final reconciliation has no third
coordinate callback or work on a destroyed view.

The existing `editorUX.spec.js`, `outline.spec.js`, and `vimVisualRows.spec.js`
scenarios own the actual geometry: focus/resize, retained code/table clicks after edits and scroll
remounts, source-height stability,
keyboard reversal across widgets, mouse placement, drag selection in both
directions, Outline highlighting, and the file-tree/Settings cursor boundaries.
Run those with the broader browser suite and the native packaged check below;
work-reuse counters alone cannot establish cursor geometry.

Helper-rail containment uses `editorBlockActionLayoutModel.test.js` for the
missing-margin plan and `editorBlockActionLayout.test.js` for stable repeated
measurements and clearance when no rail remains. `markdownBlockGuides.test.js`
checks document-sized reservation, image actions, and stability through folding.
The existing transactional table browser case checks real center-hit ownership
at 800px and 100%/150% editor size, with normal and compact PDF-split padding.
Keep its table/selection cursor matrix and the native smoke below;
hover/focus must not cause reflow, and guides may not cover source or sidebars.

### Pane launcher, Outline and modal focus

`rightPaneLauncher.test.js` covers mouse focus preservation, keyboard/assistive
activation, non-editor focus, cancelled presses, cleanup, and delayed activation
after an explicit sidebar click. `outlinePanel.test.js`, `writingLenses.test.js`,
and `historyRestore.test.js` cover their actual launcher wiring. The existing
responsive launcher scenario in `outline.spec.js` clicks Outline, Writing lenses,
Raw, and PDF while typing, immediately inserts text, closes the pane, checks
keyboard entry, and verifies that an explicit sidebar click retains focus.
Repeat the focus boundary in the packaged native webview with a keyboard seat;
a seatless headless compositor cannot establish window/editor focus.
On 11 September 2026, 65 focused tests across 11 suites and the existing
Chromium launcher scenario passed. An isolated Xvfb production-tagged WebKitGTK
2.52.6 run passed 19 focus checks: instrumented mouse activation followed by
native text insertion for all four toolbar launchers, retained focus after pane
updates, keyboard-style Outline/lens entry, and deliberate sidebar focus.
Chromium supplies trusted pointer/key events; the native probe uses dispatched
activation and `execCommand('insertText')`, so physical input and Windows/macOS
webview verification remain separate checks.

Outline focus and disabled activation are covered by `outlinePanel.test.js`,
including refresh, pane replacement, and top-aligned scroll effects without
source edits, changed sticky-height settlement, and cancellation on input or
source/cursor/view changes. A delayed ResizeObserver callback must still correct
the position after many quiet frames; cancellation disconnects it and prevents
queued corrections. The pure outline tests bound corrections to six actual
height changes. `outline.spec.js` proves real Tab, Enter/Space, tooltip and focus
restoration, plus heading placement beneath the sticky strip when jumping down
with Enter and back up with a mouse click. The existing sticky hierarchy case
retains bidirectional Up/Down after navigation. Repeat heading placement and
cursor checks in the native packaged webview; jsdom cannot establish scrolling
geometry. `kanbanKeyboardModel.test.js`
owns empty-versus-populated instruction copy, while `kanban.test.js` checks
live updates and Board/Gantt exposure without an extra browser workflow.

On 10 September 2026, top-aligned Outline navigation passed 20 focused unit
tests, the two existing navigation/sticky-hierarchy Chromium workflows, and 13
checks in a production-tagged WebKitGTK build on disposable headless Weston.
Both native jumps placed the heading 5.2 px below the sticky strip. Welcome
line 23 Up/Down, heading arrows, bidirectional mouse selection, document-end
boundaries, and exact source preservation passed. Native DOM focus was verified;
the headless display has no physical keyboard seat and does not prove OS window
focus or Windows/WebView2 behavior.

For tab or workspace-view work, retain a browser regression that places a
nonzero file selection, opens and closes Settings, and verifies the exact
anchor/head pair in the restored editor. `workspaceCursorModel.test.js` and
`workspaceTabChanges.test.js` own the live cursor-store and portable-session
assertions below the browser layer; tab records carry only initial seeds.

`tests/frontend/unit/dialogs.test.js` owns the shared modal keyboard contract:
the visible **ESC to close** cue and `aria-keyshortcuts` metadata are present,
and Escape dismisses while a text field or embedded editor owns focus. Feature
component tests retain responsibility for nested picker precedence and
dirty-draft confirmation.

Resizable editor modals stay below the generic dialog boundary.
`editorModalResizeModel.test.js` owns independent width/height clamping,
minimum-size yielding for small viewports, and Arrow-key deltas.
`editorModalResize.test.js` owns pointer commit/cancel/no-movement behavior,
keyboard steps, Home reset, live readout, viewport reclamping, disposal, and
the capture-phase rule that lets the first Escape cancel an active resize while
the next reaches modal dismissal. Table, Mermaid, and Chart component suites
assert the shared accessible handle is attached; the generic dialog suite
asserts it is absent. The existing Mermaid Editor browser workflow performs one
real pointer resize, requires modal-container pane reflow and viewport
containment, then restores the CSS-managed geometry with Home. Other editor
workflows do not duplicate that shared geometry boundary.

### Block-widget height, source footprints and images

CodeMirror block widgets have a strict measured-height contract documented in
[`LIVEPREVIEW.md`](../LIVEPREVIEW.md#4-block-widget-geometry-contract). Any new
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

### Diagram render reuse, Mermaid sizing and Properties

Diagram virtualization has a separate performance contract.
`diagramRenderCacheModel.test.js` covers source, geometry/font/appearance keys,
external/volatile-data bypass and local SVG references. `diagramOutputReuse.test.js`
counts unchanged revisits and genuine edits, bounds completed/pending retention,
and rejects cache publication after invalidation. `diagramRenderQueue.test.js`
proves serialization/cancellation; `diagramQuietScheduler.test.js` injects timers,
idle callbacks and activity to prove continuous typing/scroll deferral, a keystroke
after idle was queued, cancellation races and composition timeout behavior.
`diagramRenderer.test.js` covers real DOM adapters with counted Mermaid/Vega
ports, per-mount SVG IDs, theme/font/size changes and connected render targets.
`liveDiagramPlugin.test.js` uses real CodeMirror for DOM and transaction-driven
input, resized/changed appearances, stale publication and observer disposal.
`graphicFootprintObservation.test.js` proves resize fitting is coalesced outside
observer delivery and disposed callbacks cannot measure old graphics. It also
checks that restored-note source rulers wait outside observer delivery and
coalesce resize notifications while source replacement measurements remain
available before paint.
`tabPresentationModel.test.js` covers displayed-state projection; `tabManager.test.js`
proves text/caret publications preserve DOM/focus and avoid overflow reads while
state remains current, and exercises genuine resize, dirty/save and tab changes.

The focused Mermaid and PDF browser
regressions compare the computed live canvas/connector paint and prove that a
preceding application render cannot contaminate printable output. The browser regression in
`tests/e2e/vimVisualRows.spec.js` scrolls through a long note with repeated
Mermaid fences in both directions, verifies that the engine renders the
repeated source once, and checks that mounted SVG ids remain unique.

Mermaid sizing: `mermaidDiagramModel.test.js` owns the height and display-size
rules, `diagramSizeMemory.test.js` the remembered sizes, `diagramPresentation.test.js`
the per-kind geometry, `liveDiagramPlugin.test.js` the resize gesture and
revealed-source height, `blockWidgetLayout.test.js` the selectors,
`mermaidEditor.spec.js` the real-browser geometry, and `export.test.js` the
printable size.
The consolidated source-footprint browser case performs its forward and reverse
drag while the pointer remains held and the editor scrolls between endpoints;
a tall Mermaid drawing can legitimately place those endpoints outside one
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

The Properties disclosure adds a browser-only paint, movement-intent, and pointer
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
`frontmatterProperties.spec.js` verifies that **Edit YAML**
uses the approved quiet button and file-code glyph, has transparent border and
surface plus muted text at rest, and restores tonal hover paint and the shared
keyboard-focus halo. It also proves Home/document
start and Vim `gg` preserve Properties, Arrow Up / Vim `k` reveal raw YAML,
Arrow Down exits it, and bidirectional mouse selection leaves the replacement
rendered. Keep this focused regression when
changing frontmatter animation, block-widget stacking, or
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

### Document edges, editing transforms and editor preferences

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

Ordered-list deletion keeps its number transformation below the browser layer.
`orderedListRenumber.test.js` proves middle/first-item deletion, custom starts,
independent nested lists, exact selection mapping, and the text-only no-op
through the real Markdown transaction filter. The focused
`markdownListIndent.spec.js` case supplies an actual Delete key, then verifies
the rewritten source, one Undo, Arrow Up/Down, mouse placement, and a drag
across the retained list. The adapter visits only deleted marker ranges and
direct siblings of the affected ordered-list level.

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

`relativeLineNumbers.test.js` owns the pure distance/spacer rules and a concrete
CodeMirror gutter update when the primary cursor changes lines, while
horizontal movement leaves labels unchanged. The focused
Settings/editor browser scenario keeps the gutter enabled while exercising
Arrow Down/Up, mouse placement, and forward drag selection, asserting the
visible relative labels after each move. The same scenario owns Focus scope's
browser-only popup geometry: its listbox stays horizontally attached to the
trigger, chooses the available side, and remains viewport-clamped while the
animated Settings panel scrolls. Generic `selectCombobox.test.js` coverage
proves menus leave clipping ancestors for the body overlay, track scroll, then
return to their control wrapper on close.

Conventional formatting belongs below the browser boundary.
`markdownInlineFormatting.test.js` owns marker toggle, inline-code delimiter,
link-caret, and empty-selection plans; `markdownFormattingEditor.test.js`
dispatches all five real CodeMirror chords, proves one Undo, and repeats Arrow
Up/Down plus selection across the formatted line. The pure global-shortcut
test proves unshifted Ctrl/Cmd+B remains available to Bold while
Ctrl/Cmd+Shift+B owns the sidebar. The help-popup component test must list the
same bindings. No Playwright scenario is needed for these deterministic keymap
transactions.

### Markdown block guides and folding

Markdown block guides add their own focused matrix. Pure coverage must prove
that only headings, fenced code, tables, and standalone images receive guides;
ordinary images expose `image` plus the size-dependent **original size** action,
while local Draw.io images retain `drawio`/`editor`; typed fences use a
bounded normalized language label; untyped fences use `code`; frontmatter and
every omitted block stay quiet; and parent/child/peer heading plus fence/table
ranges remain exact. `blockControlVisibilityModel.test.js` separately proves
the rendered-block-to-rail activation rectangle, the narrower heading lane,
and folded/focus/caret overrides. The real CodeMirror component must exercise compact,
typed, accessible collapse/expand controls, disabling and re-enabling the
gutter, and show that folding never edits source.
`blockControlVisibility.test.js` uses real CodeMirror gutter updates to prove
that typing before a hovered diagram preserves its reveal state even before
the next measurement, updates action offsets, and still hides on pointer leave.
The existing Mermaid Editor browser workflow samples both left controls on
every animation frame while the stationary pointer hovers the diagram and
keyboard input changes preceding prose; opacity must stay at one and return
to zero after pointer departure. Repeat that hover/typing check in the packaged
native webview alongside the cursor and drag checks below. The browser boundary must
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
fold an authored-size ordinary image, prove there is one short native fold row
and no image source-height placeholder, expand it back to its authored
geometry, open the actual Draw.io tab from `editor`, then delete the referenced path
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

The 2026-09-06 hover regression check passed in the packaged Linux WebKitGTK
app on an isolated display with disposable vaults. Both controls stayed at
opacity one throughout 21 sampled typing frames in the default dark theme
and 22 in Figaro Light with line numbers enabled; pointer departure returned
both to zero. Arrow Down/Up crossed the folded source in both directions,
mouse placement reached the following line, and forward/reverse drags selected
across it with line numbers off and on. Windows WebView2 and macOS WKWebView
were unavailable locally and were not verified by this run.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/markdownHeadingFolding.test.js \
  tests/frontend/unit/markdownBlockGuides.test.js \
  tests/frontend/unit/editorBlockActionLayoutModel.test.js \
  tests/frontend/unit/codeBlockInteraction.test.js \
  tests/frontend/unit/codeEditorMode.test.js \
  tests/frontend/unit/editor.test.js
npx playwright test tests/e2e/editorUX.spec.js --grep "keeps activity and block-guide gutters aligned"
```

### Mermaid Editor dialog

Keyboard exit and fonts: `mermaidEditor.test.js` owns Escape-then-Tab out of Source, the
second-Escape guard, the shared Ctrl/Cmd+Enter apply and the `cm-code-file` class; the Vim case in
`mermaidEditor.spec.js` checks the same two-step Escape in a real browser.

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
Cancel dispatches nothing. Focused-source Escape must reach the modal and show
the shared dirty-draft confirmation; **Discard** closes without a root
transaction. Component tests prove Source/Style switching,
type-specific panel replacement, Kanban palette reuse, invalid-source
suppression, selected-node controls preceding the full element list, roving
Arrow/Home/End node selection, style-control focus restoration, palette survival
across preview statuses, reset swatch synchronization, explicit node-editing instructions, and one
native source update per style choice. It also asserts the approved quiet
picker and segmented-choice bindings plus the menu-item and icon-button bindings,
the ordinary outlined binding for **Replace with template**,
the absence of decorative modal/pane/heading/list/row borders alongside the
retained source-gutter divider, the node row's identity/shape/color
order, the active editor's name/shape/color ordering and real long-name
ellipsis, shape summary, and shared Style-panel scroll restoration. A DOM-adapter test
covers keyboard preview navigation, rendered-node selection versus drag
panning, and source-free transforms, while the shared combobox test proves dynamic
option refresh. One browser workflow owns the irreducible focus, compact
left-aligned linked pickers, ordinary disabled cursor, real wheel zoom and drag
panning, explicit SVG dimension growth without a scaled canvas, two-axis SVG
fitting, larger preview-pane growth up to the bounded dialog and narrow
stacking without footer clipping (including short windows), pointer-resized modal
geometry, modal-width-driven pane stacking, Home reset, left-rail control alignment, first-success empty-state
removal, real Mermaid SVG node-id selection, applied node fill, Style-panel
overflow, full-height element-list layout with a single Style scrollbar,
wheel scrolling over rows and keyboard focus reaching both list ends,
selected-editor visibility on first opening and after preview selection, focus after shape/color changes, palette Escape
and preview-refresh survival, non-checkbox node swatches, rendered-diagram collapse/expand, lint tooltip/SVG, stale-preview,
borderless gutter, and undo boundaries. That browser workflow samples the
pointer-down frame and three following animation frames, requiring identical
node-row geometry and the same Style-panel scroll offset so a final-state-only check
cannot miss press wiggle or refresh jumps; a focused companion verifies inherited Vim mode
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

### Vega-Lite Chart Editor

`vegaLiteChartEditor.test.js` owns redrawing the preview at a new width after a resize (and not
for small changes) and creating the chart with Ctrl/Cmd+Enter.

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
Cancel, focused-control Escape plus dirty-draft confirmation, the absence of a
redundant Cartesian Category control, all category
options in both special-mode comboboxes, stale-source protection, the fixed
first-column category row, shared Kanban palette selection,
square series/guide color triggers, disabled-trendline tooltip content, the
compact editable threshold stepper, direct segmented series and threshold axis
choices, one-row Mode/Orientation and threshold-control placement, shared
Top/Right/Bottom/Left legend choices, eye/eye-off visibility buttons, borderless
preview and outer-modal chrome, quiet fields/pickers/steppers/segmented choices,
the ordinary outlined **JSON** disclosure, removed instructional hints,
column-only separators, and one
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
checks viewport-resize fit by querying and measuring the current connected SVG
inside one browser callback, and retries while the graphic is being replaced.
Resolving an SVG locator before that callback can retain a detached child and
turn a valid asynchronous replacement into a measurement exception. It then
drags the actual lower-canvas-edge handle while source remains unchanged until release,
undoes that single resize, compares rendered/source document coordinates,
checks Arrow Up/Down plus mouse placement and bidirectional drag selection, and
confirms exact chart-to-table conversion and Undo. Repeat its cursor, pointer,
and source-reveal checks in the packaged WebKitGTK/WebView2/WKWebView smoke;
Chromium cannot prove native webview geometry.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/editorModalResizeModel.test.js \
  tests/frontend/unit/editorModalResize.test.js \
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

### Rendered and interactive GFM tables

`markdownTableEditorModel.test.js` owns reading and rewriting column alignment;
`markdownTableEditor.test.js` owns the Align control, grid alignment, full toolbar names and
Ctrl/Cmd+Enter apply. `dialogs.test.js` owns the shared shortcut and its `aria-keyshortcuts`.

Rendered GFM tables add a source-reveal cursor matrix. Unit and CodeMirror
component tests must prove that CodeMirror's Markdown parser identifies the
table, that an unfocused range becomes one semantic `.cm-live-table`, and that
selecting or moving into the range reveals byte-exact source without a nested
replacement-widget editor. Exercise Arrow Up/Down, Vim motions, mouse
placement, and bidirectional drag selection at the source range's edges;
ordinary history, search, prompts, and paste remain root-editor behavior. The
rendered surface must preserve inline GFM formatting and alignment, compact
full-width density, a rounded tonal background without an outer stroke, the
internal cell grid, `<br>` outside code spans, anchored bare `^` vertical merges,
and editor-authored rectangular merges in both live and printable output.

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
dirty Escape confirmation and exact cell/control plus selection restoration
through Keep editing or Escape-from-confirmation. It also owns canonical outlined ordinary toolbar-button bindings.
`markdownTableEditorGuide.test.js` owns the four-action guide and complete
table-plus-metadata deletion. `markdownTables.test.js` covers the semantic DOM
adapter, exact source reveal, rectangular rendering, and the absence of legacy
table commands from the ordinary right-click menu.

The browser workflow creates an overflowing grid, proves real wheel and native
scrollbar interaction leave the root selection intact, clicks a rendered cell,
and exercises Arrow Down/Up around revealed source. It also opens the modal,
proves an ordinary click retains native textarea caret placement without a
cell-range announcement, uses a real Shift-drag for Merge/Split, checks the header
tint and read-only source, applies one transaction, verifies editor focus, and undoes it with a real
Ctrl+Z keystroke without another click. It also checks the computed preview surface has no
outer border while its background, corner radius, and cell grid remain. The
same computed-style pass requires the Table Editor modal, pane, pane-heading,
and redundant toolbar-group borders to be absent while the ordinary action
borders, Rows/Columns divider, and cell grid remain. Native
track paging is platform-owned and may not
advance from synthetic Chromium input. Packaged WebKitGTK, WebView2, and
WKWebView checks remain required after changes to table/source cursor geometry.
There is no third-party table-editor module to map or vendor.

The interactive-table browser contract also owns the shared helper-rail action
placement boundary. It must prove that `editor`, `chart`, and `delete` remain in
that order beneath `table`, stay
outside the grid on every sampled frame while Document Outline changes editor
width, moves above the grid rather than beneath the sidebar when the measured
left margin is too narrow, adopts destructive styling only on hover/focus, and
still deletes and undoes through one normal table transaction.
The existing diagram cursor/drag browser scenario remains the geometry oracle.

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
fallback, validated-table precedence over a spreadsheet's accompanying image,
ordinary-image precedence over general rich HTML, context-menu parity, and one
dispatch.
Conversion has no vault/index dependency, so vault size cannot change its cost;
profile clipboard HTML size and element count instead of using the huge-vault
fixture for this feature.

The single browser boundary in `richPaste.spec.js` must use real copy/paste
`ClipboardEvent` objects and the Async Clipboard menu path. It covers one-Undo
replacement, Ctrl/Cmd+Shift+V, protected fenced source, Vim Visual mode, a
revealed table source range, a Windows Excel-shaped table-plus-image payload
without an image save, Arrow Up/Down, and bidirectional pointer drag selection.
Do not duplicate the pure failure matrix in Playwright.

The table-plus-image object is synthetic and only matches the MIME shape
observed from Windows Excel. It proves Figaro's browser-side precedence rule in
Chromium; only a paste from Excel into the packaged WebView2 build establishes
the Windows clipboard bridge.

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
one AI chat into ordinary prose, a Vim Visual selection, fenced code, and a
revealed table source. Repeat with the editor Paste menu and plain-text chord,
then verify one Undo, Arrow Up/Down, mouse placement, and a drag across the
inserted block in the packaged WebKitGTK, WebView2, or WKWebView runtime.

## Clipboard image paste regressions

The Async Clipboard fallback fixture awaits the resulting editor transaction;
a fixed timer cannot establish completion of asynchronous Blob/FileReader work.

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
  tests/frontend/unit/editorLinkCompletions.test.js \
  tests/frontend/unit/fileTree.test.js \
  tests/frontend/unit/markdownBlockGuides.test.js \
  tests/frontend/unit/markdownImageGuide.test.js \
  tests/frontend/unit/markdownImageModel.test.js \
  tests/frontend/unit/markdownImagePlugin.test.js
npx playwright test tests/e2e/clipboardImagePaste.spec.js
```

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

## Editor buffer undo ownership

The Settings-return case in `editorUX.spec.js` samples every visible animation
frame and requires a stable horizontal writing edge while retaining the cursor.
It reproduces the erased hidden-gutter reservation (about 39px in Chromium).
`editorBlockActionLayout.test.js` proves zero-width buffers retain the previous
rail widths/inset without reading content geometry. Repeat the return and
Arrow Up/Down/mouse/drag checks in packaged WebKitGTK when changing this adapter.
The September 20 check passed in production-tagged Linux WebKitGTK: Settings
and Graph returns had stable writing edges, with cursor restoration, Arrow
Up/Down, mouse placement, and bidirectional drag across a table preserving source.
Native input was DOM-dispatched on an isolated headless Weston display; physical
input and Windows/macOS native runtimes were not tested.

`editorDocumentSession.test.js` owns the pure scheduling and ownership rule:
every real tab-owner change requests a history swap, including when two
buffers have identical source. `editor.test.js` supplies the real CodeMirror
component boundary: edit file A, mount file B, verify Undo cannot change B,
edit and undo within B, repeat the identical-source switch, return to A and
restore only A's operations, then prove a changed source invalidates its stale
history. The fixture configures its own workspace ports and successful
`SaveSession` response, moves the cursor, and advances fake time past the former
350 ms session-save delay. It asserts that cursor movement wrote nothing and cleans up its view,
timers, and active-tab state, so a slow CI runner cannot expose an unconfigured
write or leak a pending save into the next test. This behavior is fully
observable below a browser, so it does not add
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
reveal event, outlined per-file recovery actions, and modal close lifecycle.
The design-system browser specimen
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

Proofreading’s spelling checks must retain the same editor movement and selection contract.
Component/use-case tests prove that selecting it detects `teh` despite legacy
Settings disablement and `spellcheck: false` YAML, and that deselecting it clears
findings without changing source. Language configuration covers English US/UK
and Spanish; no Settings or Properties control may gate it. Pure tests own
language selection, dictionary rules, and Markdown exclusions. The focused
`spellcheck.spec.js` workflow covers native hover/right-click, keyboard Apply,
Undo, and drag selection through the shared inline marks. Legacy browser-only
language/settings matrices were removed after lower-layer coverage was updated.
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

`authoringMacroEditor.test.js` exercises the assembled completion, date picker,
table and Mermaid editors, and Draw.io name prompt. It awaits document mounting,
advances completion and persistence timers with controlled time, and explicitly
configures `SaveSession`. After the final cursor move it runs the session-save
debounce and checks the persisted cursor; teardown destroys the view and clears
remaining timers. CPU load must not determine whether this expected native
effect runs during the test.

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
go test ./internal/desktop -run 'Test(Vim|MarkdownLint|WritingLenses|WritingLensCombinations|SpellingDictionary)'
npx playwright test tests/e2e/vimVisualRows.spec.js tests/e2e/markdownTables.spec.js tests/e2e/markdownLint.spec.js tests/e2e/markdownListIndent.spec.js tests/e2e/spellcheck.spec.js tests/e2e/drawioLoading.spec.js tests/e2e/drawio.spec.js
```

### Full typing inventory regressions

`editorTypingInventory.test.js` compares incremental formatting, links, reference
links, list/quote and static-mark output with a fresh parse after insertions,
deletions, delimiter changes and source-reveal moves. It bounds unfinished
Properties body reads and compares delimiter transitions to the full parser.
`graphicFootprintObservation.test.js` distinguishes unchanged-source edits from
font/source invalidation; `pureWriting.test.js` checks typing versus explicit
appearance refresh. Keep existing browser/native list wrapping, tasks, link
selection, Properties, diagrams and Pure resize/typewriter cases. Operation
counts complement those checks; they do not measure physical input latency.

### Optional wheel scrolling

`wheelScroll.test.js` owns platform/gesture gating, off-by-default Settings,
reduced-motion bypass, interruption, reversal, bounded targets, externally moved
scroll offsets and convergence with rounded native offsets. `state.test.js`
checks opt-in persistence. The existing editorUX spec adds one real-wheel
workflow for progressive frames, unchanged source/selection, cancellation,
Arrow Up/Down, pointer placement and drag. Its setup must await the document
mount promise before selecting a source line; one animation frame cannot
establish that the replacement document is mounted. Repeat that boundary in packaged
WebKitGTK/WebView2; simulated Mac platform tests prove only the bypass branch,
not physical WKWebView trackpad feel. Native macOS wheel events remain untouched.

The 2026-09-20 check passed in Chromium with real wheel input and in packaged
Linux WebKitGTK with 11 assertions covering Settings, progressive frames,
interruption, arrows, pointer placement and drag selection. Native automation
used DOM-dispatched input and CodeMirror transactions; it does not establish
physical device feel on Windows or macOS. The full frontend run passed 318
suites / 2,944 tests with all coverage floors met.


## UX recovery and narrow writing regressions

`markdownInlineFormatting.test.js` and `markdownFormattingEditor.test.js` own
whitespace trimming, backward selection, whitespace-only no-op, and one-step
Undo/Redo. `markdownTableEditor.test.js` owns Apply focus; the existing
`markdownTables.spec.js` transaction scenario uses a real keyboard Undo after
Apply. Cancel still returns to the invoking helper.

`rightSidebarLayout.test.js` proves the shared 400px canvas floor and existing
overlay fallback. The existing activity/block-guide `editorUX.spec.js` scenario
checks a 900 × 700 window at 100% and 150% text with Outline, a sixteen-character
fence label, and table helpers, measured after the details pane finishes
opening (an earlier version passed by measuring mid-animation): more than
230px of stable prose through the compact helper rail, a contained helper rail, and
no overlap with source. Its existing Arrow Up/Down, pointer, and drag checks
remain required. Repeat these boundaries in the packaged native webview.
