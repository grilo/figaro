# Editor typing inventory — 2026-09-20

This audit follows the installed extensions in `createEditorView`,
`markdownExtensionsForPath` and `codeExtensionsForSupport`, the named editor
observers, tab-buffer publications, and their subscribers. It covers all installed
families, rather than selecting the next three conspicuous call sites. It is an
application-work inventory, not a claim that every engine/native branch was
profiled or that physical input latency is solved on every platform.

## Measurement and worthwhile fixes

The baseline already includes the earlier Outline, lazy-buffer/hidden-Kanban,
and plain-prose list/extras fixes. The probe performs ten single-character
transactions at a fixed paragraph position, each with an explicit selection.
Writing fixtures contain 10/1,000 independent findings; Properties fixtures have
1,000 body paragraphs; inline projections expose ten mixed list/quote/link blocks;
diagram/math fields contain 1,000 blocks. jsdom uses a controlled viewport and a
fixed canvas text metric. Counts are synchronous operations, not milliseconds.

[Before/after data](editor-typing-inventory-2026-09-20.json) preserves the measured
values. Local detailed probe/logs are under `test-logs/typing-review/`.
The maintained `editorTypingInventory.test.js` supplies independent range-budget
and fresh-parse correctness checks, rather than merely asserting that old helper
functions are no longer called.

| Work over ten edits | Before | After | Decision |
| --- | ---: | ---: | --- |
| Writing array items passed through retention, 1,000 findings | 10,000 | 0 | Persistent range-tree invalidation/mapping |
| Writing array items passed through visible-mark projection, 1,000 findings | 10,000 | 0 | State-owned decorations; direct range queries for link labels |
| Closed Properties parses / replacement-set changes | 10 / 10 | 0 / 0 | Retain header metadata and widget during body edits |
| Unfinished Properties parser input characters | 140,395 | 0 | Check changed delimiter lines before scanning |
| Missing Properties parses / replacement-set changes | 10 / 10 | 0 / 0 | Retain Add Properties decoration |
| Formatting marker / style / reference full visible builds | 10 each | 0 each | Shared affected-paragraph inline proof and range mapping |
| List full visible builds while editing list text | 10 | 0 | Reproject affected line; retain other lines |
| Extras full visible builds while editing quote text | 10 | 0 | Reproject affected line; retain other lines |
| Diagram replacement allocations, 1,000 blocks | 10,000 | 0 | Map decorations and patch indexed source reveal |
| Pure presentation style writes | 30 | 0 | Appearance/settings/real geometry invalidation |
| Adaptive Pure computed-style reads | 10 | 0 | Same boundary |

The list/quote path still builds the changed line. Inline proof still visits the
affected paragraph's syntax. Writing keeps edited-paragraph invalidation and
synchronously disables stale actions; it does not skip necessary analysis.
Math already allocated zero replacements in the probe; its remaining global
visibility check now uses the same indexed old/new-selection boundary. No
replacement-count improvement is claimed for math. Source-footprint regression
spies establish zero new geometry reads for ten unchanged-source edits while
source/font invalidations still measure; that boundary is not in the JSON probe.

## Complete installed-consumer disposition

“Retain” means the present scope is justified, not that its cost is zero.

| Consumer/family | Evidence, scope and decision |
| --- | --- |
| Native input, composition, DOM observer, selection drawing | CodeMirror/native ownership. Retain; application count tests cannot establish physical IME or OS input latency. |
| Incremental Markdown and code parsers, highlighting | Parser completion and syntax-tree identity are necessary invalidations. Retain conservative fallback when proof is unavailable. |
| History/Undo, bracket matching, multiple selections | Engine-owned edit transforms. Retain; fresh-parse tests plus existing interaction suites guard integration. |
| Formatting markers | Fixed: map only when affected inline boundaries match; delimiter/autolink changes rebuild. |
| Markdown styles | Fixed: shared inline proof maps decorations without repeated visible syntax walks. |
| Ordinary/wiki/reference links | Fixed: unchanged links map, touched link payloads reparse. Reference definitions have their separate cache/invalidation. Existing title/destination, drag and Undo tests remain. |
| List bullets, task widgets, indentation | Fixed: proven list prose patches one line. Tasks resolve mounted positions; syntax-changing/task cases can conservatively rebuild. Typography/tab-size invalidation retained. |
| Quotes, callouts, rules, highlight/footnote extras | Fixed quote-line patch; static marks map or refresh touched lines. Stateful callouts and changed syntax retain full visible fallback. |
| Properties/frontmatter | Fixed closed/absent/unfinished cases. Header edits and newly completed delimiters parse; initial unfinished header may still scan the note. |
| Code blocks | Already map safe edits and patch indexed reveal/fold state. Retain; source edits must update payloads and actions. |
| Images and image-vault notifications | Already map safe edits and retain widgets. Relevant external image updates still remount; retain. |
| Tables and table editor | Already map safe edits, resolve current mounted positions, preserve explicit edit/fold/configuration transitions. Retain. |
| Mermaid, Draw.io, Vega/Vega-Lite blocks | Fixed unnecessary replacement rebuild on combined edit/selection. Renderer scheduling/caches remain; visible changed diagrams need rendering. |
| Inline/display math | Indexed visibility on mapped edits; edits after the last formula retain descriptors and the reveal index. Preserve primary-head reveal policy and structural fallback. |
| Source-footprint sizing | Fixed unchanged-source document updates before geometry reads. New source, font, actual viewport/resize and DOM changes still measure. |
| Pure focus and typewriter | Fixed repeated typography writes/reads. Focus parsing stays local to the current structural block; authored-input typewriter scrolling still schedules and cancels normally. |
| Hashtags and hex color swatches | Visible-source matching on doc/viewport changes; bounded ordinary viewport, no global note scan. Retain. |
| Block guides and folding | Cached descriptors, mapped positions, indexed visibility and visible gutter construction; real geometry/fold changes need updates. Retain. |
| Conventional code indentation markers | Reviewed the companion cursor fix: active-scope traversal is limited to cached rendered lines, including gaps and nested blocks; it no longer walks every offscreen line to find visible markers. Pure model preserves existing scope semantics. |
| Relative numbers and gutter accessibility | Visible output on edits/primary-line change, unchanged attributes skipped. Retain. |
| Activity marks | Range mapping with enabled guard and owned-note tracking. Hidden dates skip rail work. Retain. |
| Block controls | Coalesced/debounced mounted-root visibility and pointer approach work. Retain; no all-note source parsing. |
| Writing inline marks and link-label hints | Fixed whole-array retention/visibility work with persistent trees. Paragraph source reads, local invalidation and current viewport queries remain. |
| Writing engines, spelling, Markdown projection | Revision-aware 100 ms refresh plus 500 ms engine debounce, cancellation and worker boundaries. Full-document/global rules remain deliberate. Retain. |
| Writing decisions and persistence | Ordered deferred reanchoring and debounced storage. Retain intermediate changes: coalescing away deletion/reinsertion could incorrectly restore ignored occurrences. |
| Markdown lint | Whole-note structure checks remain delayed and intentional. Companion fix reuses unchanged Mermaid validation results/in-flight parses within a bounded source/parser cache and drops stale document jobs between blocks. |
| Find and search status | Closed Find exits; open Find caches matches by document/query and binary-searches active result. Edits with active search legitimately enumerate matches. Retain. |
| Completion, empty-link autofill, list renumbering | Authored-input/explicit operation scope. Companion long-line fix incrementally advances heading/hashtag trigger context on contiguous typing; other edit/selection changes reconstruct the current line context. Actual completion lookup and scoped list renumbering remain necessary. |
| Clipboard/paste, task/table commands, pointer footnotes, hover previews | Event-driven transformations. The companion pointer fix gates footnote work on the clicked line instead of serializing every ordinary click. Retain existing correctness/selection contracts. |
| Vim, vertical motion, scroll repair | Native cursor geometry and input mode ownership. Retain; browser/native checks remain required. |
| Dirty generations, tab content, save/close/export | Prior fix: one buffer publication with immutable lazy text handle. Saves read current revisions immediately; final explicit text reads are necessary. |
| Cursor/session persistence and shell | Independent cursor channel; 350 ms portable-session debounce. Presentation changes only when derived values change. Immutable tab-array copies and explicit snapshots still scale with open tabs. |
| Outline and sticky headings | Prior fix: map offsets without DOM-label scans/position writes. Current-heading lookup and bounded ancestry; structural edits still reparse. |
| Hidden Kanban and Calendar | Prior visibility guards skip typing scans; activation catches up with dirty buffers. Visible boards legitimately parse changed snapshots. |
| Raw/PDF previews | Check pane/path before lazy content read; open previews intentionally transform current source. Retain scheduling and current-revision guards. |
| Diagnostics | Disabled by default; bounded opt-in work/operation records. Retain as measurement infrastructure, not production analysis. |

## Remaining boundaries and priorities

Mapped edits before retained blocks still traverse descriptor arrays and may rebuild position
indexes; proving a gain from replacing all those structures needs a separate
large-document CPU profile. Immutable tab publications still copy the tab array.
Long single paragraphs can make local paragraph proofs, writing invalidation and
Pure segmentation expensive. Long selections and an unusually large visible
viewport can cover many blocks. These costs are explicit; this change does not
label all mapped work constant-time.

Whole-document analysis after a pause, active Find, visible preview export,
structural Markdown edits, and initial parsing are necessary operations today.
Beyond the specific Mermaid validation reuse above, moving or incrementally replacing them without workload evidence would broaden
behavioral risk beyond the measured benefit. No blanket debounce increase,
interaction-triggered module import or disabled feature was used to achieve the
counts. Further work should begin with a real slow-note/native trace identifying
one of these residual paths, rather than another arbitrary batch of three.

## Validation

The maintained differential regression covers insertion, deletion, delimiter
changes and source reveal for seven inline families. Properties compares edits
to the full parser and bounds body reads at 1,000 paragraphs. Writing tests prove
mapped old/new snapshots, bounded invalidation and disabled stale actions at
10/1,000 findings. Existing tests cover structural invalidation, global advice,
Undo, reference definitions, multi-selection, drag, task clicks, typography and
geometry refresh. The broader and native results are recorded below. Windows WebView2, macOS WKWebView and physical IME input are
outside this Linux run.


The companion shared-editor work also removes selection-time marker enumeration,
retains math indexes for edits after the last math block, bounds conventional-code
indentation scope, advances completion triggers incrementally, and reuses Mermaid
validation. Its `editorRemainingWork.test.js` verifies those boundaries alongside
this audit's changes; its counts are separate from the ten-edit baseline JSON.
The architecture suite follows both reviewed vendored adapters through their
actual eager imports and enforces pure application helpers.


Final verification:

- Full frontend coverage exercised 317 suites / 2,936 tests. It found two test
  setup/routing mismatches introduced during shared-workspace integration; both
  were corrected, and the four affected suites passed all 56 tests on rerun.
  Coverage remains above every floor: statements 83.74%, branches 72.62%,
  functions 83.86%, lines 87.18%. The earlier isolated full run passed all
  313 suites / 2,904 tests before those additional shared tests arrived.
- All 45 Chromium scenarios passed across the main run and its focused rerun.
  The single stale private-buffer assertion was migrated to `readTabContent`.
  This covers Properties, lists/quotes, Pure resize/typewriter/focus, tasks,
  links, writing actions/Undo, diagrams/math, source footprints and previews.
- Packaged Linux WebKitGTK passed 28 interaction checks plus an exact native
  save comparison. Ten warmed prose edits retained Properties, diagram and math
  DOM, with no full projection builds or full-document reads in that trace.
  Writing marks survived another paragraph's edit and cleared immediately when
  their own paragraph changed. Cursor/pointer/drag checks use DOM-dispatched
  native-webview events and CodeMirror transactions, not physical IME input.
  The final screenshot was inspected; the owned application/display were stopped.
- Lint, production/native builds, feature-index integrity, architecture and diff
  whitespace checks pass. The index covers the changed symbols, tests and report.
  Scoped vendored package paths are now accepted without permitting traversal.
- Markdown documentation matches were audited. Current behavior/ownership text
  is updated; dated historical measurements remain explicitly historical.
  README, PROMPT, architecture, contributor/testing guides, live preview and
  writing guidance reflect these changes. PDF styling itself is unchanged.
  Every user-facing change has an Unreleased entry. No repository commit was made.

The related [consolidated interaction report](editor-interaction-findings-2026-09-20.md)
records the companion fixes and their separate measurements. Remaining costs
above are priorities for a workload-driven native profile, not unreviewed loose
ends or a promise of constant-time rendering.
