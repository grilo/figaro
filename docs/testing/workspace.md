# Workspace testing contracts

[Shared strategy and commands](../TESTING.md) · [Feature index](../FEATURE_INDEX.md)

## Frameless window chrome regressions

The window-title component test publishes cursor/content-only tab updates and
requires no further native title call, then verifies a rename reaches the
bridge. Breadcrumb tests retain exact path nodes until path/visibility changes;
preview-launcher and pane tests require no repeated attribute mutations for
unchanged selection/suppression while real pane transitions remain accessible.

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
selection/Find suspension, typewriter class/padding state, retained Pure and
first-line classes through focus/background updates, and Arrow Up/Down in
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
file. The width sample intentionally includes frames before application module
startup so it catches an expanded-to-collapsed first-paint transition rather
than accepting only the settled result. This complements the pure model and session-persistence units without
duplicating their normalization or write-queue matrices in the browser.

## Sidebar navigation regressions

Outline cursor work is bounded below layout: a 1,000-heading component fixture
observes actual attribute mutations, requiring no changes within a section and
only the old/new row at section crossings. Before-first-heading selection clears
the active row; panel remount initializes it correctly. Existing browser/native
Outline cases retain focus, viewport-following, and sticky-heading geometry.
The sticky-boundary browser fixture waits for fonts and document mounting,
then brings each target heading into the measured viewport before placing it
just above or below the sticky strip. Offscreen estimated row heights must not
determine the crossing assertion.

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
must remain available. Clicking a selected workspace control returns to the previous view without
destroying its mounted session; repeat Timeline/Gantt returns to Month/Board. Settings alone retains its de-duplicated title-bar workspace tab and
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
precedence, nested tinting, palette extension, fit/zoom math, keyboard ordering,
and plain/double/modifier-click activation policy without DOM or Wails.
`graphView.test.js` owns the floating control
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
without leaving Graph; an empty-canvas click clears it, and double-click plus
Ctrl-click each open the file. The canvas background remains stable on hover, the 224px search and
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

## Kanban paint-continuity regressions

`kanbanBufferModel.test.js` proves one parse per changed dirty buffer, retained
task projections for prose-only edits, line shifts, and eviction after save or
close. `kanban.test.js` retains the published board and exact card DOM through
prose edits, then changes a task and requires the new column/content. Existing
save, schedule, ordering, and board-return tests remain the integration contract.

A hidden retained Kanban session must not read lazy dirty buffers for typing
events. Its warm activation must immediately show the latest task text and column.
Buffer generations publish their lazy handle with the edit; save/close and preview
readers accept both handles and strings, retaining stale-generation rejection.

Large Board columns split their coverage at the rendering boundary.
`kanbanKeyboardModel.test.js` owns the deterministic measured-height index and
offset-to-card mapping. `kanban.test.js` advances a virtual window while an
overlapping card remains mounted and requires exact DOM identity, bounded card
count, and the expected logical range. `tabManager.test.js` leaves and returns
to Kanban and requires activation of the original mounted session instead of a
second mount.

`kanbanPaint.spec.js` owns the irreducible browser paint boundary. Its rapid
wheel probe samples every animation frame across multiple 96-card window
changes, requiring a populated visible range, monotonic downward movement,
stable logical coordinates derived from actual card heights, retained identity
for every shared card, and no hover shadow while scrolling is active. Its warm
open probe begins sampling before sidebar activation and requires the original
populated wrapper at full opacity and zero transform in every active frame—an
eventual card count cannot catch either regression. Run it with the functional
Kanban and large-window checks:

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/kanbanKeyboardModel.test.js \
  tests/frontend/unit/kanban.test.js \
  tests/frontend/unit/tabManager.test.js
npx playwright test \
  tests/e2e/kanbanPaint.spec.js \
  tests/e2e/kanbanDensity.spec.js \
  tests/e2e/sidebarNavigation.spec.js
npx playwright test tests/e2e/hugeVaultStress.spec.js \
  --grep "preserves keyboard reachability"
```

Chromium establishes frame sequencing, computed geometry, and node identity,
but cannot reproduce a native compositor. Before release, repeat fast wheel or
trackpad scrolling and Calendar/Graph → Kanban warm returns in packaged
WebKitGTK, WebView2, and WKWebView builds; no stale card image, blank frame, or
entrance fade should appear.

## Kanban due-date regressions

Board, Gantt, Calendar, Today, and reminders share one metadata deadline contract. Pure
`internal/taskschedule` tests cover valid dates, start-only tasks, and overdue deadlines before actual starts, canonical task
identity, line/tag shifts, duplicate ambiguity, clear overrides, reconnect
collisions, and subtree rename. Root-scoped `task_schedules_test.go` proves
private atomic metadata persistence/reload, exact unchanged Markdown including
ordinary Markdown links, stale/path/corrupt-file refusal, escaping config symlinks,
and the production rename hook. `app_test.go` drives the real tag-update use
case and proves that the first TODO-to-active move records the local start date
while later column changes preserve a manual override. `ganttModel.test.js` covers inclusive geometry,
DST-independent movement, endpoint clamping, deduplication, metadata precedence,
completed colors, bounded rows, preservation of the untouched endpoint and
schedule ID in Board pill updates, and the three pointer zones retained by a one-day bar. `kanbanGantt.test.js` owns picker handoff,
immediate date/clear persistence without Save/Cancel, outside-click dismissal,
real nested Start/End picker ownership and Escape order, Escape after focus loss
during a pending write, listener teardown on every dismissal path, and no late
focus theft or popup revival after success/failure. It also covers failed-date
retry, retained fields, open-note handoff, one-write drag release, pointer/Escape cancellation, visible
errors, retargeted one-day edge presses, reconnection controls, dirty-note refusal, Calendar deadline invalidation
after persistence (including a failed subsequent refresh), status ownership, and disposal.
Rapid native scroll events are also asserted to schedule exactly one row-window
render frame, while keyboard Home/End retains its synchronous reveal path.
The same component suite owns the zero-task status lifecycle, hides drag/resize
guidance until a task exists, disables Unscheduled until either date exists,
and proves the status is outside the translated
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
to own note projections and cache behavior, while the shell markup test keeps
its standalone **Today** action bound to the ordinary outlined button. Run the existing Calendar browser
case alongside Gantt after changing the shared viewport.
`kanbanGantt.spec.js` is the representative browser boundary for sticky labels,
real pointer capture and click delivery, the adaptive edge hit regions,
approved image-resize dots centered half-in/half-out on the painted endpoints,
and their unchanged one-day start/center/end hit geometry, the
single full-height current-day marker, the themed date picker,
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
focus and Arrow-key movement, card header/footer order, absent filename, direct
Start/Due pill events, clear-both/remove menu, retained endpoint, warning states,
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

The CSS rename component regression holds each save, reference-preview, writing
storage, native-rename, and open-file-refresh promise independently. It verifies
the reported stage, prerequisite ordering, absence of a reference question for an
empty preview, completion, and busy-state cleanup on a failed preview. The rooted
desktop regression previews and renames an unreferenced CSS file without changing
its contents and refuses an occupied destination. These tests also run in the
Windows backend CI job. For a reported Windows hang, reproduce in the packaged
app and record the last status message, source/destination names, and whether the
vault uses local, synced, or network storage. Passing Linux tests alone does not
establish that the native Windows hang is resolved.

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
the two active-buffer groups, persistent visibility during focused ordinary
writing and bottom-edge hover, and the collapsed 44px application-status
presentation: full live text and tooltip remain available, its compact activity
state stays inside the rail, and **Undo** remains visible and operable. Theme
coverage compares the native application-status surface with the file tree and
the buffer-status surface with the editor. Save-model, dialog, and tab-manager
units own failure-cause formatting, dirty-buffer retention, blocking modal
actions, per-episode Auto-Save deduplication, and the live status semantics.
`windowClose.test.js` proves that native close is allowed only after every
requested write succeeds and no newer edit remains dirty.
The ordinary-writing browser assertion must compare the application-status
background with the sidebar while its text and available buffer groups remain
opaque, and keep the resize grip visible. `statusBar.test.js` guards against
restoring writing-rest CSS hiding; the existing Pure-mode browser case proves
the word-count-only footer remains intact.

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

`tabNavigationModel.test.js` proves that close/delete activation returns the
most recent surviving ID and consumes history without mutating inputs, skips
removed entries, and falls back to a file, another tab, or Home.
`tabManager.test.js` reproduces three saved notes, returns to the first,
deletes its tab after filesystem success, verifies the surviving active tab and
editor mount agree, and closes both remaining buffers to Home without writes
to the deleted path. Repeat that sequence in the packaged native webview:
confirm deletion in the file tree, edit/save the selected survivor, then use
Ctrl/Cmd+W and the close button. The deleted text must not remain editable;
Git must retain its saved version and the other files must remain intact.

On 10 September 2026, that sequence passed in a fresh production-tagged
WebKitGTK 2.52.6 build on hidden Weston with a disposable vault. Native disk
and Git checks confirmed the survivor's new text was saved and the deleted
note's original text remained in history. The run used injected DOM events and
CodeMirror transactions; Windows/WebView2 and macOS/WKWebView remain unverified.

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

## File revision continuity

`state.test.js` exercises real `recordTabEdit`/`recordTabContent` publications with
10/1,000 tabs. Unrelated IDs and cursor seeds must not be revisited, current cursor
memory and earlier immutable snapshots must survive, stale content generations
must be rejected, and reorder/close/reopen must refresh ownership correctly.


File-tree component scenarios cancel their scheduled timers after each case so
a delayed Ready message cannot overwrite the next rename-stage assertion.

Cursor updates now notify `tabCursors`; buffer-only changes notify `tabBuffers`.
Shell/tab metadata observers subscribe to `tabPresentation`, with positive
coverage for dirty/save, rename and structural changes. The
[assembled editor contract](editor.md#editor-update-contract-regressions) verifies
that this isolation retains current cursor snapshots and delayed persistence.

`sessionModel.test.js` proves which tab metadata requires local storage;
`state.test.js` proves 100 cursor/buffer updates produce no synchronous storage
calls while a rename and close still persist. `sessionPersistence.test.js`
holds and fails a write to prove bounded pending work, latest-cursor retention,
settlement of every coalesced caller, and subsequent-save recovery.

`internal/history/commit_plan_test.go` covers single-path staging decisions and
unrelated staged additions/deletions. `commit_file_test.go` uses real temporary
Git repositories with an intercepted object-write boundary: a held Git write
must allow a root-scoped atomic save, retain the earlier captured revision,
and leave the newer edit dirty and independently committable. It also covers
blob/tree/commit failure with index rollback and intact saved text, external
index changes, ignored files, deletion, path containment, and a worktree adapter
that rejects directory traversal. `internal/desktop/slow_history_test.go` checks
that saving can proceed under the history path lock and that a waiting rename
retains the newly saved text. Run these packages with `go test -race` as well as
the existing rooted filesystem, archive/recovery, and mutation regressions.
These deterministic checks simulate slow Git I/O; responsiveness on the affected
Windows/OneDrive/antivirus installation still requires a packaged native check.

`workspaceCursorModel.test.js` covers cursor ownership, immutable values, seed
reconciliation, closed-tab cleanup and direct updates without enumerating up to
10,000 tabs. `workspaceTabChanges.test.js` covers transfer through an ID-changing
rename and current session snapshots. `workspaceTabModel.test.js` covers
newer load/save rejection, retained edits, ownership changes, and scoped disk
acknowledgements. `documentSave.test.js` proves acknowledgement before Git
completion and revision continuity across queued failures. `tabManager.test.js`
exercises ordinary and prepared file mounts, approved overwrite followed by
repeated saves, a failed queued save followed by retry, and non-destructive
cancellation of a real disk conflict. These sequencing rules stay below the
browser layer; repeat ordinary saves and a genuine external edit in the
isolated packaged app to check the native binding boundary.

The follow-up Linux WebKitGTK check confirmed date, number, and helper row tops
within 0.2 px, bidirectional arrows across Mermaid/table boundaries, mouse
placement, and drag selection in both directions. Four ordinary native saves
retained matching tab/disk versions. A deliberate external edit preserved the
draft and external file on cancellation; one approved overwrite followed by
three further saves produced no repeat warning.

### Incremental writing and deferred editor work

`writingIncremental.test.js` compares complete results with the full-scan package
path over the editorial fixtures and paragraph edit/prepend/move/delete/split
sequences. It asserts one changed paragraph is checked again, current native
positions, bounded caches, cancellation/reuse, Markdown protection changes and
global conventions. Each of the 30 enabled Slopless rule fixtures also compares
complete incremental and full-scan results before and after prepending prose.
Spelling tests verify cross-edit lookup reuse, language
separation, current ranges and cancellation. Worker-client/adapter tests own warm
cancellation, stale replies, queued replacements and timeout recovery. The real
worker check in `verify-writing-performance.mjs` asserts cancellation/recovery
without creating another worker.

The writing-lenses component exercises sustained edits without intermediate
snapshot materialization or analysis, deferred cards in closed panes, and stale
Apply rejection. Immediate Apply/Undo restores inline findings; previous cards stay visible with disabled actions until replacement engines
settle. Retained underlines shift through edits outside their paragraphs without
serializing the note, and expose no stale editing actions. Status-only updates do not republish inline
findings. Decision tests prove empty stores read only the latest queued buffer
while existing persistence tests retain ordered saved/pending anchors.
Reference-link component tests prove cache reuse on cursor/prose edits and
invalidation for targets and fences. Activity tests assert no hidden rail
measurements and correct live toggles; layout tests reject redundant CSS writes.
Block-control tests use an injected clock (without advancing CodeMirror's own
layout timers) to prove typing debounce, pointer coalescing, immediate focus
scheduling, hover continuity and cleanup. Empty rails do no content measurement.

Run the existing editorUX reference-navigation and activity/guide alignment
scenarios, plus the Mermaid Editor hover/typing workflow. They already exercise
real Up/Down, pointer placement, drag selection and gutter geometry; do not add
another browser matrix for cache policy. Repeat the native Welcome cursor and
hover/drag checks on available packaged webviews. Engine timings and passing
Chromium tests cannot establish the affected laptop's WebView2 responsiveness.

On 10 September 2026, seven focused Chromium scenarios passed across the editor,
Mermaid, and Outline suites. A production-tagged WebKitGTK 2.52.6 build also passed
14 checks in each of two disposable headless Weston vaults, using Figaro Dark
with block guides and with activity dates/line numbers enabled. The build-only
instrumentation dispatched keyboard and mouse events against native editor
geometry: Welcome line 23 Up/Down, reference replacement navigation and drag
selection in both directions, Mermaid control hover/departure, 20 edits without
control flashing, exact source preservation, and current gutter offsets. The
headless software renderer does not measure physical input latency or establish
Windows/WebView2 performance.

### Chart-heavy editing performance verification

The dated measurements and remaining platform limits are recorded in
[Editor performance verification](../EDITOR_PERFORMANCE.md).

Use equivalent 10,000-word fixtures with 100 internal references and 25 Mermaid,
Vega, Vega-Lite or managed charts, plus references-only and ordinary-image controls.
Enable Figaro Dark, visual navigation, sticky headings, block guides, activity dates,
line numbers and Markdown lint. Compare lenses disabled and enabled. Separate cold
scrolling, deliberate visits, return scrolling, sustained typing/Backspace, and
editing with Outline and Writing lenses panes open. Count renderer starts and tab
replacements, record editor work and frame gaps, and verify exact source restoration.
Cold-input coverage must send key/input events or CodeMirror transactions while a
previously unseen diagram is queued, then prove deferred work resumes after quiet.
A timer or idle timeout cannot authorize rendering during active composition.
Separately warm the visible diagrams, hold ArrowDown, immediately reverse with
ArrowUp and repeat. Record source-reveal/remount SVG parsing, wrapping-ruler
reads, actual key repeats and frame gaps. Returning to a prepared preview must
not wait for the cold-render quiet interval outside active composition or
Mermaid key repeat. During those bursts, SVG attachment waits for quiet while
retaining its output; prepared Vega stays immediate during key repeat.
Keep source and viewport geometry intact; cached-node identities and invalidation policy belong in component tests.

Keep policy and renderer-work counts below the browser; do not use millisecond
latency thresholds in CI. Extend the existing Chart Editor geometry workflow for
responsive width, preserving the cursor/drag/resize checks. Repeat native Welcome
line 23 Up/Down, arrows into each changed diagram type from both directions, mouse
placement and drag selection around source replacements in the packaged webview.
Windows WebView2 must be measured on the affected laptop: Linux and Chromium
results cannot certify its physical input latency, WebView2 version or compositor.

### Retained writing results and adjacent Mermaid navigation

`writingRetentionModel.test.js` proves local range shifts, edited-paragraph and
global-concept invalidation, and conservative structural Markdown handling.
`writingInline.test.js` checks real CodeMirror edits, mapped display-only marks,
disabled stale popup actions and fresh replacement without full-note serialization.
`writingAnalysis.test.js`, `writingResultsView.test.js`, `writingLenses.test.js`
and `writingDecisionsIntegration.test.js` own retained cards, debounce, delayed
engines, decision tracking, stale-action rejection and note/configuration changes.
`vimVisual.test.js` proves block entry consults visual movement in both directions
and that `i` alone preserves the document/findings while `o` edits it.

The existing Normal-mode visual-row scenario in `vimVisualRows.spec.js` also
covers wrapped prose directly touching Mermaid, visual-row geometry before entry,
source reveal at the boundary, mouse placement and bidirectional drag. The existing
writing scenario covers retained label paint and hover, cursor/drag and Undo.
Repeat these checks in the production-tagged WebKitGTK build with an owned vault;
Chromium success does not establish WebView2 or WKWebView behavior. Record typing
profiles as synthetic dispatch-to-frame timings, separately from physical input latency.


On 10 September 2026 the focused writing and Vim Chromium scenarios passed,
as did the production-tagged WebKitGTK 2.52.6 checks in a disposable Weston vault.
The native run verified Welcome Up/Down, wrapped paragraphs directly beside
Mermaid from both directions, diagram entry, mouse placement and bidirectional
drag, document-edge containment, and visible retained marks/cards with disabled
stale actions and enabled fresh actions. The on/off synthetic typing profile is
recorded in `docs/benchmarks/writing-retained-results-2026-09-10.json`; it measures
dispatch to the next animation-frame callback, not physical input or completed
screen presentation. WebView2 and WKWebView remain unverified for this change.

The follow-up [native typing profile](../benchmarks/typing-input-2026-09-11.md)
uses trusted XTest keyboard input with sender timestamps, native input events
and frame callbacks. It covers all five lenses on/off, Mermaid present/absent,
standard editing and Vim Insert: 840 keys across 12 scenarios. A separate
Chromium CPU profile identifies source-footprint layout reads as an optimization
candidate. Do not equate a frame callback with physical screen presentation or
treat this fast Linux desktop as proof about the affected user's machine.


## Note loading, search, and recovery regressions

`tabManager.test.js` holds ordinary file reads pending, rejects or returns a
missing result, and proves that the previous document remains the active save
target. Retry activates the recovered destination; a superseded read cannot
show an error or overwrite a newer activation. `home.test.js`, `openTodayNote.test.js`,
and `topBar.test.js` cover shared Inbox-first daily-note creation, concurrent
Home/shortcut requests, and revealing global search from a collapsed sidebar.
The existing borderless-sidebar browser scenario verifies actual shortcut focus.

`search.test.js` and `workspaceSearch.test.js` cover query changes before debounce,
pending pointer/keyboard activation, disabled preserved filter rows, current and
stale failures, Retry, and dismissal before completion. `linkedNoteNavigation.test.js`
covers a rejected read's visible error and successful retry without accidental
creation. `statusBar.test.js` proves that ordinary messages cannot erase a live
Undo and older expiry callbacks cannot clear newer actions. `recentlyDeleted.test.js`
covers mounted-list deletion/restoration updates and stale list completion.
Backend `relationships_test.go` proves wiki, alias, heading, encoded, bracketed,
and relative backlinks plus warm save invalidation; `vault_index_test.go` checks
path remapping without stale relative targets.
