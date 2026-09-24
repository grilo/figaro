# Chart-heavy editing: fixes and verification

10 September 2026. Performance fixes for Figaro 1.40.0, compared with Figaro 1.39.0.

The shared tab invalidation defect was the largest confirmed source of editing
overhead. Text and caret publications now preserve tab DOM, while dirty/save,
title/path, pinning, ordering and active-tab changes remain visible. Save/session
state continues to update independently of presentation.

Vega/Vega-Lite output reuse is bounded to 64 entries and 4,194,304 UTF-16 code units of retained keys/output. Effective source/appearance and font identity
participate in its key; responsive specs include container dimensions. Fixed-size
charts reuse output across container changes. External data/images and expressions reading time, randomness or window/screen
state bypass reuse. Per-mount SVG references, retryable failures,
invalidation during rendering and disposal have focused regressions.

Pending diagrams wait 120 ms after DOM input, editor transactions, composition,
wheel or scrolling, then an idle opportunity. Later input revokes the idle slot;
composition blocks idle timeout execution. An already running renderer still
executes on the main thread. Source-height rulers defer resize notifications
outside observer delivery while source/mount measurements remain before paint.
Graphic fitting coalesces resize callbacks and cancels disposed measurements.

## Lazy typing snapshots and mapped projections

The 20 September 2026 assembled jsdom probe uses ten single-character prose edits
35 ms apart with Outline open and Kanban hidden. At 1,001 headings it reduced
full-document conversions from 10 to 0, Outline label queries from 20,020 to 0,
position-attribute writes from 10,000 to 0, hidden Kanban buffer parses from 10 to
0, list/extras projection builds from 10 each to 0, and indentation style reads
from 20 to 0. Buffer publications fell from 20 to 10. The 11-heading control has
the same zero-work outcomes. Regression assertions live in
`editorTypingContract.test.js`; the viewport is controlled because jsdom has no
real editor geometry. Stats still read after a pause, visible consumers read on
demand, and structural/owned-line edits retain their parser/projection fallback.
These are operation counts, not physical input latency or a WebView2 benchmark.

Validation passed 311 frontend suites (2,829 tests) with coverage above all
floors, plus integrity, architecture and lint checks. Five existing Chromium
scenarios cover wrapped list/quote geometry, Outline/sticky navigation, and
Kanban scroll/warm-return paint. A production-tagged Linux WebKitGTK build in a
disposable Weston vault passed 17 checks: mapped heading/task activation,
bidirectional arrows and drag selection around lists/quotes, pointer placement,
exact source retention through switches, current tasks on warm Kanban return,
and matching saved disk contents. Native counters also showed no list/extras
rebuilds, indentation style reads or hidden Kanban parsing during ten prose
edits. These native checks use DOM events and CodeMirror transactions; they do
not establish physical input latency, WebView2 or WKWebView behavior.

## Native workload results

Milliseconds, baseline → final. These are observed software-rendered WebKitGTK
measurements, not physical input latency or guaranteed frame budgets.

| Fixture | Typing update median | Typing update p95 | Backspace update p95 | Typing frame gap p95 |
| --- | ---: | ---: | ---: | ---: |
| references | 8 → 4 | 11 → 6 | 9 → 6 | 22 → 19 |
| mermaid | 11 → 4 | 22 → 6 | 21 → 5 | 45 → 19 |
| vega | 20 → 4 | 23 → 6 | 23 → 5 | 49 → 19 |
| vega-lite | 21 → 4 | 26 → 5 | 26 → 5 | 52 → 18 |
| managed-vega-lite | 20 → 5 | 23 → 8 | 23 → 6 | 49 → 20 |
| vega-lite-lenses | 21 → 4 | 27 → 7 | 27 → 6 | 55 → 20 |

| Fixture | Total renderer calls, baseline → final | Return-scroll calls | Steady editing/pane calls | Cold-input calls |
| --- | ---: | ---: | ---: | ---: |
| references | 0 → 0 | 0 | 0 | 0 |
| mermaid | 25 → 24 | 0 | 0 | 0 |
| vega | 43 → 25 | 0 | 0 | 0 |
| vega-lite | 43 → 25 | 0 | 0 | 0 |
| managed-vega-lite | 44 → 28 | 0 | 0 | 0 |
| vega-lite-lenses | 43 → 25 | 0 | 0 | 0 |

A responsive managed chart correctly renders again when the side pane changes
its available width. Reuse does not suppress genuine geometry or source changes.
The section-based scrolling workload can virtualize a diagram before its quiet
period finishes; total calls therefore also reflect cancelled offscreen work.
A separate native pass explicitly visited every Mermaid fence and verified all
25 distinct diagrams rendered once.

## Identical SVG versus image investigation

After the tab fix, Chromium at 4× CPU throttling compared the same exported
Vega-Lite SVG inline and as an image, alternating inline/image twice. Source,
visible chart and navigation remained constant; chart generation occurred outside
the measured bursts. Each condition typed and removed 90 characters. The fixture
text was restored exactly. The verified experiment removed the preview's fitting
transform from the serialized SVG and applied it only to the image element;
bounding-box assertions required the two representations to match within 1 px.
This avoids counting a twice-scaled image as an equivalent representation.

Cumulative style-recalculation time was 4.56/3.95 seconds inline versus 3.85/3.17
seconds as an image: about 18–25% more style work inline in paired passes.
Layout duration was 0.65/0.56 versus 0.68/0.52 seconds. Backspace frame-gap p95
was about 50 ms in both representations in the first pair; the second pair was
50 ms inline versus 33 ms as an image. Warm-up and runtime variability matter.
These results support an SVG-subtree/style cost independent of chart generation;
they do not establish that changing all previews to images would preserve
accessibility, source interaction, sizing or every diagram type. Production
retains inline SVG. Earlier exploratory swaps without the explicit size guard
are retained in temporary artifacts but are not used for these conclusions.

A follow-up CPU profile of the final implementation with visible Vega-Lite found
source-footprint measurements and browser selection work as the remaining major
costs: about 3.1 seconds in wrapped-footprint refresh, 2.1 seconds within source
metrics, and 1.2 seconds in native selection collapse. Those inclusive numbers
overlap. The tab overflow function no longer appears among the dominant stacks.
The generated source map was checked against the exact tested application bundle.
Profiling perturbs execution; these totals are not comparable latency benchmarks.

## Verification and limits

- Full unit run: 280 suites / 2,194 tests passed. The final narrow resize adjustment
  also passed its focused source-footprint and diagram regressions.
- Six focused browser boundaries passed across chart resizing, rendered/revealed
  block height, cursor/drag selection, tab save ownership, Mermaid reuse and
  printable Mermaid/Vega/Vega-Lite rendering.
- Native geometry: 53 passing checks, including Welcome line 23 Up/Down,
  source entry from both directions, mouse placement, drag selection, exact source
  restoration, and the 25-diagram visitation check.
- Final workload runs restored their exact source, retained line numbers, activity
  dates, block guides and sticky headings, and reported no renderer/browser errors.
- Lint, test-integrity, application bundling and production-tagged Go builds passed.

The fixtures contain 10,000 whitespace-counted words (including Markdown and code),
100 same-note references and 25 charts. Graphics differ in complexity; the
identical-export comparison above is the controlled representation experiment.
Native runs used WebKitGTK 2.52.6 on Linux, 1280×900 headless Weston/pixman,
software rendering, separate disposable vault/config/cache/data paths, Figaro Dark,
Markdown lint and navigation enabled. The all-lenses case enabled all nine
underlying checks in English US. Auto-Save was set beyond each run's duration.
Cold-input and Backspace events were synthetic against the native editor;
Chromium comparisons used trusted browser keyboard input. Native timing has
coarse timer resolution. Cold-start position may follow restored cursor state;
steady sections were explicitly positioned at 1, 7, 13 and 25 in every run.
The initial probe can sample an empty editor before file loading; fixture sizes
are verified from source and section traversal, not that early metadata sample.

Windows WebView2 and macOS WKWebView were unavailable. The affected company laptop
still needs the same fixture/workload comparison, including scrolling and held
Backspace, with lenses off/on and navigation enabled. Passing Linux/Chromium
checks does not establish Windows responsiveness or native IME behavior.

Raw instrumentation, reports, source maps and disposable binaries are in
`/tmp/figaro-editor-fixes-20260910`. Baseline data is in
`/tmp/figaro-render-perf-20260910`. These local temporary artifacts are not part of
the repository; user test notes remain under `/home/grilo/projects/figaro-render-tests`.

## Cursor-only work follow-up

19 September 2026, Unreleased. Five navigation paths now reuse unchanged work:
file-tree markers compare dirty paths, Outline retains headings by immutable
document identity, Pure mode separates geometry from focus and caches current
block phrases, diagrams retain parsed fences and unchanged source decorations,
and vertical viewport repair coalesces bursts without a third coordinate read.
The pre-paint check and post-paint native scroll repair remain in place.

Focused component/model coverage passed 217 tests, including edits, nested
blocks, source entry/exit, folding, Find, selection, resize, and metadata changes.
The full browser run passed 135 tests with two opt-in stress profiles skipped;
it covers actual keyboard/pointer input and forward/backward drag selection.
An earlier run's Settings font-picker focus failure passed three isolated
repeats and the final full run without a product or test change.
Architecture checks passed all ten tests; the production bundle, feature index,
integrity checks, and lint for the changed cursor modules passed. The final
shared-worktree unit run passed 2,353 tests and failed three in concurrent
grammar work: two stale configuration-version expectations and an occurrence
Ignore intent assertion. Repository-wide lint also reported a control-character
regular expression in that grammar model. Those files were left untouched by
this follow-up; the complete shared change was not green at that checkpoint.

The packaged Linux WebKitGTK app passed 22 synthetic-key/DOM checks covering
wrapped prose, Outline following, diagram source entry and return, retained
source placeholders, long-document Down/Up reversal, Pure focus, and exact source
preservation. Two additional coordinate-hit checks passed around a diagram.
Native drag selection could not be established: the isolated headless display
had no active input seat, so the document never acquired native focus. Chromium
drag coverage passed, but this does not replace native pointer verification.
Windows WebView2 and macOS WKWebView were unavailable. These checks establish
work reuse and tested behavior, not a measured speedup on the company laptop.

This follow-up's local logs, disposable vault, native probe, and reports are in
`/tmp/figaro-cursor-optimization`; its isolated native app/display were stopped
after verification. They are not repository artifacts.

## Typing and interaction follow-up

20 September 2026, Unreleased. The next six areas now avoid unchanged work:

- Shell adapters retain breadcrumbs and control attributes and skip identical
  native window-title calls. Failed title calls remain retryable.
- Table/math selection reuses parsed descriptors and unchanged decorations.
  Source edits, folds, parser progress, and relevant math line joins invalidate
  their caches.
- Ordinary single-line prose edits map Outline heading positions and retain
  row DOM/focus. Structural and Setext-adjacent edits use the complete parser.
  Navigation reads each row's current mapped offset.
- Block guides reuse structure for the same document/parser tree; viewport and
  folding updates still project the visible controls.
- Dirty-buffer task projections are shared by Kanban cards and columns. Prose
  edits with identical tasks preserve board/card identity. Task line shifts,
  content changes, save/close, and authoritative board refreshes invalidate it.
- Wrapping rulers mount and read in batches before footprint writes. Plain prose
  and authored chart heights skip them; unchanged source/metrics reuse heights,
  while typography changes force remeasurement before paint.

### Work-reuse evidence

Small module probes used the real state/DOM adapters with a stubbed native title
effect, plus concrete CodeMirror states. These are operation counts, not physical
input latency or a speedup claim:

| 100 unchanged-document cursor updates | Before | After |
| --- | ---: | ---: |
| Native title calls | 100 | 0 |
| Enabled breadcrumb rebuilds | 100 | 0 |
| Raw/PDF launcher attribute writes | 400 | 0 |
| Right-pane exposure attribute writes | 200 | 0 |
| Full-document string reads inside table source (40,066 characters) | 100 | 0 |
| Full-document string reads inside math source (40,066 characters) | 100 | 0 |

Focused coverage verifies retained Outline rows and mapped navigation through
20 prose edits, updated heading syntax, retained guide descriptors, one parse
per changed dirty task buffer, unchanged board/card identity, and batched ruler
reads with source/typography invalidation. An initial large-collection browser
failure exposed authoritative board refreshes reusing an object; that boundary
now explicitly invalidates the typing cache and has a component regression.
Native checking exposed tooltip migration removing row `title` attributes;
Outline now compares visible labels, with a regression for that integration.

The full unit run passed 291 suites / 2,429 tests. The final Outline/architecture
follow-up passed 25 tests after the tooltip adjustment. Lint, integrity,
production bundling, the native production build, and feature-index checks pass.
The earlier concurrent grammar failures recorded above are resolved in this run.
The final full browser run passed 135 tests, with two opt-in stress profiles
skipped, including the large-collection keyboard-drag regression.

The final packaged Linux WebKitGTK app passed 18 XTest keyboard/mouse checks:
actual native text input and Backspace, retained Outline rows, mapped navigation,
pointer placement, both drag directions around tables/math, source-entry arrows,
rendered return, and a narrower window with valid cursor/footprint geometry.
It also passed 22 synthetic-key/DOM checks for wrapped prose, long-document
reversal, diagrams, Outline, and Pure mode. The synthetic probe waits for the
Outline pane's width transition to settle before checking selection following.
All input probes restored their source exactly. Unlike the earlier seatless
Weston run, this isolated Xvfb display supplied native input focus. This still
does not establish Windows WebView2 or macOS WKWebView behavior, physical-device
latency, or the speedup on the company laptop.

Local probe scripts, logs, reports, the screenshot, and disposable binaries/vault
are under `/tmp/figaro-interactivity-implementation`; the original count probes
are under `/tmp/figaro-interactivity-audit`. These temporary artifacts are not
repository files. The isolated native app and display were stopped after
verification.

## Editor update architecture follow-up

20 September 2026, Unreleased. The update path now has an executable dependency
contract and an assembled regression, described in [Editor updates](EDITOR_UPDATES.md).
Cursor and buffer publications retain current immutable tab records without
notifying workspace presentation. Named external editor observers receive only
the changes they declare. Development tracing is opt-in and bounded, with
explicit deferred-work attribution and no retained document text or identity.

The assembled regression sends 100 cursor updates through the real editor and
tab manager and observes zero full-document reads, preview parses, presentation
notifications, native title calls and synchronous storage writes. Positive cases
prove the dirty transition, updated text, renamed title, deferred cursor save,
and parked Undo history after an immutable path move. This test initially
exposed image previews reading whole source on every cursor update; descriptors
now follow document/parser identity. It also exposed tests using the upstream
Markdown package instead of production's patched vendored implementation; the
Jest mapping now matches the shipped editor.

The packaged Linux input trace reproduced WebKit's microtask checkpoints between
native event listeners. Closing at the bubbling boundary, with a task fallback
for stopped propagation, keeps actual CodeMirror work attached to the input.
Eleven native navigation keys produced eleven input records, eleven cursor
publications, ten cursor-geometry checks for five vertical keys, and (at the
time) one delayed session write; cursor movement now performs no session write. They produced no preview parsing, full-document materialization,
presentation notification, title call or synchronous storage write. Typing
reached the document observers and restored the exact source after Backspace.
These counters cover the instrumented boundaries, not all browser internals;
inclusive diagnostic timings do not establish physical input latency.

The final full unit run passed 296 suites / 2,450 tests. Lint, architecture and
integrity checks, production/native builds, and the generated 29-route feature
index passed. The full browser run passed 135 tests, with two opt-in stress
profiles skipped. The native matrix includes 18 XTest keyboard/mouse checks, 22 synthetic-key/DOM
checks, and five trace/source-preservation checks. Windows WebView2 and macOS
WKWebView were unavailable; company-laptop latency remains unmeasured.

One repeat unit run exposed delayed status timers leaking between existing
file-tree test scenarios. The fixture now cancels its own pending timers after
each case, preserving the staged rename assertions without changing product
status behavior. Full logs and disposable native reports are retained locally
under `/tmp/figaro-update-contract`; they are not repository artifacts. The
isolated native app and display were stopped after verification.


## Bounded cursor decoration work

On 20 September 2026, cursor reuse was tightened below the notification contract:

- Image state now retains its decoration set within an unchanged source/reveal
  region. Parsed descriptors and their range index survive ordinary navigation.
- Outline retains mounted row references. Movement within a section writes no
  heading rows; section crossings update only the old and new active rows.
  Closing or rebuilding the panel resets its mounted references.
- A shared pure interval tree finds blocks overlapping the old/new selections
  for images, tables, diagrams and math. It retains inclusive boundaries,
  backwards/multiple selections and math's primary-head policy. Mapped edits
  refresh moved range indexes; folding, parser progress, drag settlement and reveal
  configuration still invalidate the appropriate decorations.

The pure overlap tests compare indexed results against a linear oracle with
nested, unordered and duplicate ranges. Point queries across 10, 1,000 and
10,000 separated ranges visit at most `2 * ceil(log2(count)) + 1` tree nodes.
The four real state-field tests use both 10 and 1,000 widgets: 50 ordinary prose
moves preserve state/decoration identity and read no block positions; movement
inside one revealed block remains bounded. A 1,000-heading MutationObserver
fixture verifies zero row mutations within a section, exactly two changed rows
at section crossings, clearing before the first heading, and remount recovery.
The assembled editor also rejects image builds or Outline row writes during
its 100 ordinary cursor updates. Long selections can legitimately cover many
blocks; crossing a reveal boundary may rebuild the decoration projection.
These checks establish work limits, not device-independent latency guarantees.

Verification passed 298 frontend suites / 2,468 tests, including integrity and
architecture checks, lint, the production bundle, native production build, and
135 browser tests with two optional stress profiles skipped. The existing
browser image resize/source-height, editor widget, Outline and Vim scenarios
retain the actual layout and pointer boundaries.

An isolated Xvfb display running the packaged GTK 3.24.52 / WebKitGTK 2.52.6 app
passed 57 checks: 18 native XTest keyboard/pointer checks, 22 synthetic-key/DOM
cursor checks, five diagnostics checks, and 12 image checks using native keys
and pointer input. The image probe covers preview identity, no image builds on
horizontal keys, source placeholder identity, Up/Down, pointer placement,
bidirectional drag and exact source preservation. Its captured window was
visually inspected. Eleven traced navigation keys performed 66 interval-tree
node visits, no candidate visibility checks in that prose region, no parsing,
no full-document reads, no shell notifications, and no immediate title/storage
writes. At the time the current cursor still reached one delayed session write;
cursor positions now stay in memory until a tab switch, window blur or quit.

Full logs, native reports and the image screenshot are under
`/tmp/figaro-cursor-bounded`. The initial new table stress fixture used the
CommonMark parser rather than the GFM base; correcting the fixture made its
10/1,000 real tables observable. No product fallback or test suppression was
introduced. All native probes restore their original document, and the owned
app/display were stopped after verification. Windows/macOS runtime behavior and
company-laptop input-to-display latency remain unmeasured.


## Bundled Markdown cursor work

On 20 September 2026, the active bundled formatting, style, link and ordinary
code providers were included in the editor work contract and extension audit.
Formatting retains visible syntax descriptors and uses a pure marker-visibility
policy; unchanged visibility retains the decoration set. Styles scan visible
ranges on structural/viewport invalidation. Ordinary code retains source and
line descriptors with an interval index, preserving document-wide block geometry.
Selection, folding and drag settlement reuse those descriptors. Diagnostics enter
through a facet wired by editor composition, and architecture tests follow that
real eager import edge while restricting the adapter to pure application imports.

The same independent 20-move probe before and after the change reports:

| Fixture | Before | After |
| --- | --- | --- |
| 10 formatting blocks | 1,840 syntax visits, 20 builds | 0 visits, 0 builds |
| 1,000 formatting blocks | 180,040 syntax visits, 20 builds | 0 visits, 0 builds |
| 10 ordinary code blocks | 600 source slices | 0 source slices |
| 1,000 ordinary code blocks | 60,000 source slices | 0 source slices |

These counts describe warmed ordinary cursor movement within an unchanged
viewport/reveal region. Edits, parser progress and configuration changes still
invalidate structure; source entry/exit may rebuild a projection. The assembled
1,000-section regression independently spies on real syntax/source operations,
using a controlled viewport because jsdom cannot provide physical geometry. It
also exposed list widgets slicing every visited syntax node, including the
Document root. Filtering ListMark/Task nodes before reading text removes that
whole-note read. Disjoint visible ranges keep descendants of shared containers,
and nodes exactly at the exclusive viewport end do not leak into the projection.

The existing full browser suite passed 135 tests, with two optional stress
profiles skipped. The packaged GTK 3.24.52 / WebKitGTK 2.52.6 app passed 70 checks:
18 XTest keyboard/pointer, 22 synthetic-key/DOM, five diagnostics, 12 image,
and 13 bundled-Markdown checks. Native horizontal keys retain the code widget
and perform no bundled marker/style/code scans, source slices or builds. Native
source entry, Up/Down, typing/Backspace, pointer placement, bidirectional drag
and return to preview preserve the exact source. The captured window was
visually inspected; probes restored their original document and the owned
app/display were stopped. The initial native marker probe assumed reveal inside
bold content; correcting it to the existing delimiter-overlap policy required no
product change.

At that checkpoint the audit still identified open-Find match enumeration,
open-tab snapshot copies and sticky-heading ancestry. The next
[follow-up](#typing-source-reveal-and-navigation-work) addresses those paths;
the [installed extension audit](EDITOR_UPDATES.md#installed-extension-audit)
records the current boundaries, including broad selections. No physical
input-latency claim is made. Windows/macOS runtime behavior and the
affected laptop remain unmeasured. Full logs and disposable native reports are
retained under `/tmp/figaro-vendor-cursor`.


A broad unit run exposed the existing Async Clipboard fixture's fixed 20 ms
wait; it passed alone. The fixture now awaits the actual editor transaction,
without changing clipboard product behavior. Earlier full-run grammar failures
came from separate in-progress grammar fixtures and disappeared in the next
run. The adapter import-graph check was extended to follow the real vendor edge,
rather than exempting its pure model from eager-reachability requirements.

The dependency audit reports one existing high-severity advisory in the direct
development dependency `js-yaml` 3.15.1 (GHSA-2883-xcg3-v3hh); the audit advertises
3.15.2 as its fix. This cursor change does not alter dependency metadata. The
vendored-browser security regression passes; it does not establish a clean npm
audit or assess the advisory's application exploitability.


Final verification passed all 300 frontend suites / 2,561 tests, including
integrity, release-tool fixtures and architecture checks. Lint, production and
native builds, whitespace checks and the generated 29-route index pass. The
Markdown documentation audit confirms the changed cursor contracts, provider
ownership and verification commands match the implementation; earlier dated
measurements and unaffected print/syntax contracts remain historical or unchanged.
The Unreleased changelog describes the user-facing cursor improvement.

## Typing, source reveal, and navigation work

The follow-up audit found remaining work in prose edits, source entry, Find,
sticky headings, and cursor ownership. The implementation now uses:

- One stack pass for heading parents and next-section boundaries, removing
  repeated suffix copies from block-guide construction.
- Conservative paragraph/tree checks before mapping code, image, table and
  guide positions through plain-prose edits; source payloads stay cached.
- Indexed visibility transitions and block-owned decoration patches on source
  entry/exit, preserving unrelated widget decoration identity.
- Native Find match lists cached by document/query/word-character context, with
  binary lookup of the active selection.
- An immutable cursor store keyed by tab ID, with direct updates and explicit
  session snapshots; ID-changing rename transfers the current cursor.

At 1,000 headings the earlier guide build copied 1,000,000 suffix entries; the
new build copies none. Twenty plain-prose insert/delete transactions previously
read 60,000 code source slices across 1,000 fences; the mapped path reads no code
payloads. Parser fragment reuse can still read individual boundary characters.
A block's source entry previously inspected thousands of unrelated descriptors;
10/1,000-block checks now bound affected descriptor access and preserve unrelated
decorations. Twenty Find selections reuse the match list after its initial
enumeration. Heading ancestry follows at most six cached parent links; cursor
updates do not enumerate tab records, including a 10,000-tab fixture.

These are operation counts, not measured input-to-display latency. At this
checkpoint mapped edits still traversed descriptor positions and rebuilt
selection indexes; the next section records the further reuse improvements. Structural
or uncertain edits reparse; long selections, new Find queries/edits and explicit
session snapshots legitimately scale with their input. Browser/native layout
and parser work remain outside these limits.

Verification: all 303 frontend suites / 2,590 tests passed, including test
integrity, release-tool fixtures and architecture policy. Lint, production and
Linux native builds passed. The assembled 1,000-section case checks 20 prose
insert/delete transactions in addition to ordinary cursor work. Lower-layer
checks cover structural/parser fallback, source ownership after mapped edits,
retained code/table clicks, Find invalidation and ID-changing tab rename.

The isolated GTK 3.24.52 / WebKitGTK 2.52.6 app passed 80 checks: the existing
70 keyboard/pointer, cursor, image and diagnostics checks plus ten for native
prose typing, retained code/table clicks, Find focus/count/navigation, a Settings
detour and the persisted live cursor. Native prose typing produced no
code/image/table/guide reparse or code-payload extraction and retained code/table
DOM; typing and Backspace preserved exact source. The captured window was
visually inspected. Each probe restored the original document, and the owned
app/display were stopped. Full logs and reports are under
`/tmp/figaro-all-update`; Windows/macOS runtime and affected-laptop latency remain
unmeasured.

Browser validation finished with 134 passing cases and one obsolete internal
assertion in the Settings scenario: the actual restored editor selection passed,
but the test read the old tab-record cursor field. The duplicate store assertion
was removed because cursor ownership/serialization is proved below the browser
layer. That scenario then passed, covering all 135 browser cases across the run
and rerun; two optional stress profiles were skipped. The 30-route feature index,
documentation audit and final whitespace/integrity checks passed.


## Five further interaction improvements

The next audit found five remaining paths that revisited unchanged data. They
now accept proven prose edits in formatted/list/quote paragraphs, map existing
code/image/table decorations, cache and index guide work, publish known tab
buffer transitions locally, and normalize/index Pure phrases once per block.
Structural Markdown changes, parser progress, folds, drag settlement, settings,
file ownership and viewport geometry retain their required invalidation.

At 1,000 blocks/headings (20 interactions unless stated otherwise):

| Work observed | Before | After |
| --- | ---: | ---: |
| Code payload slices while typing prose with bold/curly apostrophes/list/quote syntax | 60,000 | 0 |
| New code/image/table decorations for one edit after all blocks, per provider | 1,000 | 0 |
| Reveal-index rebuild for that edit | Yes | No |
| Gutter label reads on cursor motion | 20,000 | 0 |
| Guide type reads for last-widget lookup | 20,000 | 20 |
| Existing tab-ID getter reads for edit/content publications | 99,904 / 99,900 | 5 / 0 |
| Pure phrase bound reads during cursor movement | 40,000 | 300 |

Guide viewport lookup reads fewer than 25 line bounds among 10,000 guides for a
three-guide viewport. The real Pure adapter reads fewer than 500 prepared phrase
bounds over 20 moves among 1,000 sentences; the previous model normalized every
range on each move (40,000 original bound reads). Ordered inclusive phrase edges
and gap fallback remain unchanged; unusual overlapping/unordered inputs retain
first-match behavior.

Mapped edits still traverse descriptor positions, and moved positions rebuild
the reveal index. Immutable tab publication still copies the array; the change
removes repeated record inspection and cursor reconciliation, not that copy.
Paragraph structure validation, native layout and parser costs remain. These
counts establish removed work, not input-to-display latency on a physical device.

Validation for these five changes:

- The full frontend run passed 304 suites / 2,697 tests. The final drag guard
  then passed all 287 tests in 15 focused suites, including the assembled editor,
  architecture policy and the three added active-drag cases.
- All 135 browser cases passed; two optional stress profiles were skipped. Four
  affected geometry/focus scenarios passed again after the drag guard. The
  existing footprint scenario now types before retained previews, virtualizes
  them away, scrolls back and clicks the remounted code/table source targets.
- All 92 isolated GTK 3.24.52 / WebKitGTK 2.52.6 checks passed, including 12 new
  checks using actual XTest keys/pointers for formatted/list/quote typing,
  mapped-preview remounts and exact source restoration. The screenshot was
  visually inspected; all owned app/display processes were stopped. Harness
  setup now keeps the whole app inside its hidden display, checks the restored
  Outline state and supplies the long cursor fixture explicitly.
- Lint, production/native builds, feature-index/integrity and whitespace checks
  passed. No PDF syntax or export behavior changed; the broader browser suite
  included the existing printable boundaries.

An intermediate coverage run encountered three writing assertions while separate
writing-review edits were underway. The subsequent writing-quality changes
resolved them. Final verification passed 305 frontend suites / 2,729 tests, with
coverage above every floor: 83.47% statements, 72.08% branches, 83.65% functions
and 86.98% lines. The pre-commit check repeated the full 305-suite / 2,729-test
run successfully with no intervening source changes. See the
[writing-quality report](benchmarks/writing-quality-2026-09-20.md#evidence-and-limitations)
for its additional checks and limitations.

The five interaction changes have no focused, browser or native failures.
Their logs and reports are under `/tmp/figaro-five-followup`; the final full
frontend check is `/tmp/figaro-commit-unit.log`. Operation counts remain distinct
from hardware latency measurements.

## Inline cursor navigation follow-up

On 20 September 2026, four further cursor paths were tightened: list/task and
quote line projections, ordinary/reference links, writing hints on rendered link
labels, and unchanged gutter state. Pure line plans are separate from source
reading, font measurement and DOM projection. Visible descriptors, active/passive
line variants and font-prefix measurements survive cursor movement. Indexed
selection overlap patches only changed reveal states. Writing findings have a
result-identity interval index, cached viewport query and retained mounted-label
plans. Relative numbers follow primary logical-line changes; accessibility
synchronization skips identical attribute values.

The same assembled probe used for the audit at `289d08e` was repeated after the
change: 20 warmed cursor-only updates per case, a controlled jsdom visible range,
real installed providers, and observed source/DOM/measurement access. At 100
visible list/quote/link entries unless otherwise stated:

| Work observed | Before | After |
| --- | ---: | ---: |
| List marker source slices during movement between unrelated prose lines | 2,000 | 0 |
| List indentation canvas contexts | 2,000 | 0 |
| Original mounted bullet elements retained | 0 / 100 | 100 / 100 |
| Quote indentation canvas contexts | 2,000 | 0 |
| Ordinary-link syntax visits while moving inside one revealed link | 28,080 | 0 |
| Ordinary-link source slices for that case | 2,020 | 0 |
| Reference-provider syntax visits / slices for that same ordinary-link case | 14,040 / 2,000 | 0 / 0 |
| Reference-link source slices during unrelated prose movement | 2,000 | 0 |
| Finding-bound reads with 1,000 offscreen findings | 20,000 | 0 |
| Unchanged gutter attribute writes/removals | 280 | 0 |
| Relative labels recalculated for 36 rendered rows during same-line motion | 720 | 0 |

The list fix also removes the redraw that triggered the original writing-hint
case. A separate concrete adapter regression invokes legitimate DOM reconciliation
and independently verifies that cached hints do not inspect offscreen findings.
List/link component cases repeat at 10 and 1,000 entries, preserving decoration
identity and retained unaffected widgets. Changes to source, parser, viewport,
configuration and font retain their explicit invalidation; long selections may
legitimately touch many entries. Drag policies, reference resolution, task actions,
link titles and callbacks remain current. These are operation counts, not native
input-to-display latency measurements.

Native checks exposed two details in wrapped-source verification. WebKit can
include a zero-width rectangle from the preceding row in a character range's
bounding union; the probe now selects the actual nonzero client rectangle.
Revealed list/quote markers also used a different font from the indentation
measure. Those markers now inherit the body font, quote measurements use italic,
and active list indentation no longer needs an assumed three-pixel correction.
The existing browser wrapping scenario covers active numbered markers and live
font-scale changes without adding another end-to-end workflow.

Validation:

- The full frontend coverage run passed 310 suites / 2,825 tests, above all floors:
  83.59% statements, 72.34% branches, 83.65% functions and 87.07% lines. The final
  font changes passed 52 focused tests across seven suites, including the assembled
  editor, architecture and design-system contracts.
- The broad browser run passed 134 cases with two optional stress skips. Its one
  stale focus assertion omitted the concurrently added Personal dictionary
  shortcut; the corrected existing Outline case passed separately. All five list
  cases passed after the final font fix, including wrapping, cursor/drag behavior
  and printable parity.
- All 39 new packaged WebKitGTK checks passed with real native keys and pointer
  events: horizontal/vertical motion, retained source projections, active/passive
  wrapping, font changes, task click/Space, Tab/Shift+Tab, link-adjacent placement,
  bidirectional link selection and empty-list Enter. All 92 prior native input,
  cursor, diagnostic, image and preview checks passed again on the final build
  (131 total). The screenshot was inspected; the owned app/display were stopped.
- Lint and production/native builds passed. The feature map and affected
  documentation include the extracted modules and their regression ownership.
  Markdown syntax and PDF styling are unchanged; the browser suite retains the
  existing preview/export boundaries. Windows WebView2 and macOS WKWebView were
  unavailable locally.

The before audit is under `/tmp/figaro-cursor-next-audit`; implementation probes,
complete logs and native evidence are under `/tmp/figaro-cursor-four`.

## Full typing inventory follow-up

The [September 20 typing inventory](benchmarks/editor-typing-inventory-2026-09-20.md)
expands the earlier three-path audit to all installed extension families and
external consumers. It records worthwhile fixes, necessary deferred work,
remaining scaling boundaries, reproducible counts and platform limitations.

## Consolidated interaction findings

The [ten-finding implementation report](benchmarks/editor-interaction-findings-2026-09-20.md)
tracks pointer footnotes, code indentation, writing ranges, diagram projections,
Mermaid validation, inline projections, formatting visibility, math mapping,
Properties, and completion together. It distinguishes work-count regressions
from physical latency and records shared browser/native verification.

## Scoped Markdown projection reuse

The 20 September follow-up separates safe local block edits from structural
invalidation. Completed paragraphs can map previews inside a partially parsed
note when tree extent and parsed ancestors remain stable. Heading text, code,
table and soft Enter/Backspace edits refresh affected payloads. Code/image/table
and diagram fields retain unrelated widgets and unrelated settings keep their
cached block projections. Parser progress and uncertain structure still refresh.
Math newline/delimiter scans, Markdown outline newline parsing and the cost of
mapping positions before many blocks remain separate work.

Writing review retains one current document’s unchanged block/source maps and
uses a local Markdown parse for safe paragraph/heading edits without reference
definitions. Structural changes parse the note, then reuse exact blocks only
when reference context matches. All document-wide analysis sees the assembled
current projection. Paragraph caches now allow 8,192 entries under the unchanged
4 MiB estimated-data cap per cache, avoiding premature eviction in notes with
thousands of short paragraphs.

Regression tests compare cached results with fresh editor/writing results,
including Unicode/CRLF offsets, references, quotations, protected blocks,
partial-parser progress, retained widget identity and current reveal behavior.

The [paired native results and subsequent PDF profile](benchmarks/reparse-and-pdf-cost-2026-09-20.md)
record the measured improvements, the complete-tree prose counterexample,
writing-cache behavior and the remaining preview DOM/export costs.

## Prepared diagram return

Source-height measurements and completed SVG subtrees now survive replacement
mounts under bounded per-editor caches. The
[September 21 native comparison](benchmarks/diagram-remount-2026-09-21.md)
records warm preview return, held-arrow navigation with immediate reversals,
invalidation and native cursor/resize checks. Mermaid return fell from 145 to
17 ms and Vega-Lite from 142.5 to 10 ms. Vega-Lite's median round p95 frame gap
fell from 74 to 50 ms; Mermaid held-arrow gaps stayed similar. Prepared Mermaid
attachment waits through key repeat to avoid a measured SVG layout regression.
These software-rendered Linux results are not physical input latency guarantees.

## Prepared code, math, table and image returns

Bounded per-editor retention now also preserves highlighted code, rendered
formulas, semantic tables and loaded image elements across source reveal and
viewport removal. The [September 21 comparison](benchmarks/preview-retention-2026-09-21.md)
records eight successful content transfers per family with no repeat generation.
Ordinary returns were modestly faster for code/math/tables; images were unchanged.
Held-arrow frame timings varied substantially in baseline reruns and same-build
controls, so they do not establish a responsiveness gain. Controls, current
source mapping, image refresh and first-paint geometry retain their existing
contracts; failures and oversized content remain on the fresh rendering path.

## Held-key style invalidation

A Chromium profile of held ArrowDown at 4× CPU throttling found style
recalculation, not layout, dominating: about the whole application was
restyled per key because six `:has()` rules used `#app` as their subject and
every DOM change inside `#app` re-checked them. `workspaceChromeState.js` now
mirrors the leading-tab and Calendar state onto `#app` attributes, and
Pure-writing writes only changed root properties. Style work fell from
3,830 ms to about 400 ms per 150 keys, the p95 frame gap from 66.6 ms to
16.8 ms, and handler p50 from 18 ms to about 5 ms. A unit test rejects `:has()`
on `html`, `body` or `#app`. Details and limits are in
[the benchmark record](benchmarks/held-key-style-invalidation-2026-09-25.md).
