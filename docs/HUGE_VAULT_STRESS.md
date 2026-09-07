# Huge-vault stress audit

This focused audit profiles Figaro with a deterministic, ignored fixture of
10,000 Markdown documents. It is intended to expose scale bottlenecks without
checking generated notes into Git or turning machine-dependent timings into
flaky pass/fail assertions.

## Fixture and method

The 2026-09-05 reference profile used:

- 10,000 Markdown files across a deeply nested hierarchy (about 89 MB)
- 9,995 small notes copied byte-for-byte from one generated source
- 5 large notes copied from one generated 10,000-line source
- one shared search marker, one large-note-only marker, one task per note, and
  one backlink per note
- Linux amd64 with Go 1.26.6 and Playwright Chromium 151.0.7922.34

The Go profile uses the real root-scoped filesystem, Git history adapter, and
desktop application methods. The browser profile supplies the same planned
10,000-item payloads to the real frontend so it can isolate DOM, layout,
CodeMirror, and keyboard-update costs without mixing backend latency into the
measurements. Each large browser surface runs in a fresh page to prevent an
earlier pathological DOM from distorting the next result.

The backend report also records the cold loader's final `loaded / total` status
and number of emitted progress events. The profile fails if the total differs
from the 10,000-note manifest or event sampling exceeds its fixed bound, so a
responsive loading view cannot accidentally become a per-file bridge flood.

The fixture is deliberately worst-case in result cardinality: every document
matches the broad query, contributes a Kanban task, and links to the same note.
Those cases show the application's upper-bound behavior; they do not represent
the latency of an ordinary narrow search or board.

The native Linux/Wails smoke check opened this vault and reached application
startup on WebKitGTK 2.52.3 without a startup crash. The installed and required
Wails CLI are both v2.14.0; the repeatable Go and Chromium profiles below own
the reported timings.

The 2026-09-05 verification passed the complete backend, browser, keyboard,
move, Git, and warm-vs-cold equivalence oracles. The latest cold index completed
in 816 ms, warm broad literal search in 62 ms, an indexed move/restore in
346/367 ms, and a warm tree projection in 10 ms. Bounded Home and Calendar
queries took 1.0/0.3 ms; a no-match unlinked-mention query took 0.04 ms after
its trigram candidate check, and Vault Health took 117 ms. The watcher-less
copy profile retained its exact metadata guard and took 239 ms; the production
watcher path avoids that whole-vault validation.

The browser profile mounted bounded collections and reported 84 ms for 10,000
search results, 166 ms for 10,000 Kanban cards, 113 ms for the fully expanded
tree, 358 ms for 10,000 backlinks, and 334 ms for a 10,000-node Graph. The
separate document-switch matrix demonstrates that content, not byte size alone,
is material: three-trial incoming medians were 214 ms for 400 tables, 188 ms
for 160 Mermaid diagrams, 213 ms for 1,200 inline equations, and 297 ms for 500
images, versus 97–191 ms when returning to the plain note. The largest median
ratio was 2.50, below the deliberately generous 6.0 regression ceiling. Backend
reading of the 798 KB/10,000-line source took 0.8 ms; the remaining delay is
CodeMirror state construction, live-preview decoration/widget work, and browser
layout. Absolute browser timings vary across runs, so the fixed guard compares
same-run medians while these measurements establish the cost shape.

The startup-progress verification finished at exactly 10,000 / 10,000 notes
and emitted 104 progress events. Production now packages the eager application
graph as a 3.91 MB local ESM bundle (1.23 MB gzip) instead of requesting roughly
220 source modules; development continues to serve those modules for debugging.

## Prioritized findings

| ID | Priority | Evidence | Diagnosis | Recommended direction |
| --- | --- | --- | --- | --- |
| PERF-01 | Resolved | Before optimization, Kanban rendered 10,000 cards in 1,886–2,250 ms with 170,609 DOM nodes, and Arrow Down took 2,105–2,462 ms. After per-column windowing and linear order reconciliation, render took 118 ms with 101 mounted cards / 2,327 total DOM nodes; Arrow Down took 150 ms. | Each column retains its complete logical order while mounting a 96-card window. Tab and focus movement reveal distant cards, persistence reconciles ordering in linear rather than quadratic work, and measured edge patches retain overlapping card nodes during scrolling. | Preserve the full keyboard reorder, cross-column, drag/drop, focus-restoration, and scrollbar contracts in the guarded harness, plus frame-sampled paint continuity across rapid window changes and warm workspace returns. |
| PERF-02 | Resolved | Before optimization, a 10,000-result search took 1,425–2,065 ms, mounted 80,549 nodes, and one Arrow Down took another 1,381–1,864 ms. After windowing, the same profile took 99 ms with 96 mounted rows / 1,318 total DOM nodes; Arrow Down took 46 ms with no long task. | Search keeps the complete logical result set but mounts a 96-row window. Selection patches the existing options and only moves the window when the active result crosses it. | Preserve the windowing and the independent keyboard/mouse reachability contract in the guarded stress test. |
| PERF-03 | Resolved | Before optimization, restoring every expanded directory took 2,478–2,775 ms with 21,630 tree rows / 208,383 DOM nodes. The windowed profile took 131 ms, mounted 160 rows / 1,857 total DOM nodes, and produced no long task. | Large expanded trees use a flattened logical row projection with a bounded DOM window while retaining level, expansion, selection, context-menu, drag, and activation semantics. | Preserve the logical-path focus resolver and release its scroll protection only on an actual wheel or pointer gesture. |
| PERF-04 | Resolved | Before optimization, opening 10,000 relationships took 1,050–1,301 ms with 80,628 DOM nodes. The windowed profile took 104 ms, mounted 96 cards / 1,397 total DOM nodes, and produced no long task. | Backlinks retain the complete logical result set and accessible position metadata while mounting a 96-card window. Keyboard focus reveals the next logical card across boundaries. | Preserve final-card Tab reachability and source activation; unlinked-mention action cards remain fully rendered so their two-control Tab order is unchanged. |
| PERF-05 | Resolved | Before optimization, the first indexed search took 1,626–2,195 ms, allocated about 476 MB cumulatively, and left 177–200 MB on the heap. The current cold search/index took 816 ms and 306 MB cumulative allocation. | Search postings use sorted path slices instead of per-trigram maps, byte-identical notes share immutable content, and cold rebuilds append postings in deterministic path order instead of performing a sorted insertion per contribution. Incremental saves retain exact remove/insert semantics. | Preserve the warm-vs-cold differential oracle and bulk-build plus incremental sorted-posting tests; do not trade exact search results for a probabilistic index. |
| PERF-06 | Resolved | Moving or restoring the top-level `Areas` subtree previously took 2,165–2,762 ms and allocated about 576 MB per direction. The current profile completed in 346/367 ms with about 223 MB cumulative allocation per direction. | Move planning checks only Markdown files whose source or internal target intersects the moved tree, then remaps path-derived records while retaining parsed bodies, tokens, trigrams, and content-derived projections. | Preserve the sparse supported-syntax oracle, warm-vs-cold projections, rollback behavior, and activity state. |
| PERF-07 | Resolved | Checking Git status for one note previously took 1,166–1,466 ms and allocated about 205 MB. The path-scoped reference check took 0.2 ms and allocated about 15 KB. | The adapter now compares only the requested path across HEAD, the Git index, and root-scoped worktree metadata/content. Applicable ancestor `.gitignore` rules are evaluated without enumerating unrelated files; submodules retain the complete-status fallback. | Preserve the full-worktree differential matrix for clean, modified, staged, deleted, untracked, root/nested ignored, negated, executable-mode, staged-delete/recreate, and rename states. |
| PERF-08 | Resolved | File-tree scans previously took 270–365 ms and returned a 2.48 MB JSON payload even after the search index was warm. The cached warm projection took 16 ms; serialization remained 11 ms for the intentionally complete payload. | The backend publishes an immutable tree snapshot, retains flat path metadata, updates known file saves/creates, and remaps known moves in memory. Broad or ambiguous mutations and unscoped watcher events invalidate the cache and retain the complete root-scoped scan fallback. | Preserve snapshot reuse, pure hierarchy projection, known create/move remapping, external-change invalidation, symlink omission, and disk/warm/cold tree equivalence. Consider an incremental bridge payload only if serialization becomes material. |
| PERF-09 | Resolved | Copying one small note previously took 783 ms because it synchronously rebuilt the complete Markdown index; the following tree request took another 220 ms. The watcher-less profile now measures 239 ms for its exact validation and 11 ms for the warm tree projection; the production watcher path skips the unrelated-note metadata pass. | With an active native watcher, a copy trusts the maintained current snapshot, parses and adds only the new subtree, and acknowledges exact copied watcher paths. Watcher-less adapters retain metadata validation and the complete fallback. | Preserve warm-vs-cold copied search, backlink, Kanban, calendar, health, and tree equivalence; watcher and watcher-less paths; cache identity; link rewriting; and non-destructive collisions. |
| PERF-12 | Monitored | BM25F fields, term postings, document frequencies, and the 10,475-term vocabulary increased the reference cold build from 852 to 1,120 ms and the reported post-build heap from 64 to 101 MB. Warm ranked queries stayed interactive: 22 ms rare, 38 ms broad prefix, 50 ms broad typo, and 0.1 ms link completion. | The added retained state is the cost of field-aware ranking, natural terms, prefixes, typo tolerance, and suggestions. Direct normalized-text analysis and query-local passage reuse avoid a second fold/token-occurrence slice and repeated scans of pooled content. | Keep the new ranked metrics and warm-vs-cold differential oracle. Treat further cold-memory reduction as worthwhile, but do not discard exact incremental results or rescan the vault on each query. |
| PERF-13 | Resolved | The first measured 10,000-node Graph render took 350 ms with a 145 ms long task; equivalent filtering, selection, and zoom each repainted synchronously. The current complete-paint profile reports 334 ms initially and 47/132/182 ms for those interactions, with no Graph long task. | Filtered views retain the full layout, pointer hit tests use a screen-space index, trace adjacency is precomputed, and completed large untraced canvases are cached for sparse trace composition and instant trace clearing. Off-screen batches still publish only the latest complete frame. | Preserve exact full-paint waits and separate render/filter/select/zoom metrics, plus pure layout, trace-plan, spatial-index, and projection-identity tests. |
| PERF-14 | Resolved | Gantt's native vertical scroll listener attempted a row projection for every event in a burst, amplifying flashing risk shared with its horizontally buffered timeline. | Passive scroll input now coalesces to one row-window render per animation frame; keyboard focus navigation keeps its immediate reveal path and disposal cancels pending work. | Preserve the focused three-events/one-frame component regression and the Calendar/Gantt frame-sampling browser tests. |
| PERF-15 | Resolved | A plain 10,000-line open took 267 ms in the current run. Three-trial median switching took 188–297 ms into table/diagram/math/image-heavy notes, versus 97–191 ms when returning to the same plain note; the backend read took 0.8 ms. | A switch removes all Markdown presentation with history before replacing source, avoiding repeated outgoing scans. The pure mount plan splits large Markdown at a line boundary and prioritizes only feature stages indicated by incoming content; scanners have cheap marker exits and frontmatter reads only its leading prefix. Dense live widgets and browser layout remain proportional to actual content. | Keep the content matrix, exact document-owner/ready waits, three alternating trials, same-run median ratio ceiling, source reassembly, mid-document Up/Down, and packaged-webview cursor/mouse smoke. |
| PERF-16 | Resolved | A missing schedule bridge mock stopped the browser profile at startup; later scenario failures could hide all earlier results, and the document-switch matrix initially overwrote the general report. | The fixture covers schedules and a deterministic 10,000-node graph, each scenario has an independent timeout, partial general results are rewritten after every completed scenario, and content-sensitive switching writes a separate report. | Preserve partial-report output, isolated failure records, distinct report paths, and full Graph/Markdown completion signals rather than timing status text alone. |
| PERF-17 | Resolved | Rapid Chart Editor controls could start overlapping Vega-Lite engines; version checks hid stale output but did not prevent duplicated CPU and temporary render targets. | One latest-preview use case serializes the renderer, replaces intermediate pending work with the newest specification, suppresses stale success/error publication, and invalidates completion on modal disposal. | Preserve the deferred-promise unit/component regressions that prove maximum concurrency one and initial-plus-latest rendering. |
| PERF-18 | Resolved | Home and Calendar previously copied, overlaid, and sorted the complete 10,000-card board for small results; Vault Health repeated analysis; unlinked mentions scanned every cached source. The current profile measures 1.0 ms Home, 0.3 ms Calendar, 117 ms health, and 0.04 ms for a no-candidate mention. | Home uses bounded top-k selection, scheduled-card overlays are cached by board/index and schedule revisions, Vault Health is cached by index revision and reuses the warm tree inventory, and trigram postings prefilter mention candidates before exact matching. | Preserve revision invalidation and direct feature regressions for schedules, health, mentions, and bounded Home ordering. |
| PERF-19 | Resolved | Development source inventory required roughly 220 module requests and 10.3 MB of decoded JavaScript. | Production serves one eagerly initialized 3.91 MB ESM bundle (1.23 MB gzip); development substitutes the source bootstrap for debuggability. No feature code is lazy-loaded. | Keep production embed, development substitution, static reachability, no-dynamic-import, and bundle-build checks. |

Severity uses the audit scale: 3 blocks or substantially impairs a primary
workflow, 2 causes meaningful friction, and 1 is minor. P1 means fix next; P2
means schedule soon.

## Boundaries that held up well

- The 10,000-line plain note opened with complete presentation in 267 ms and
  mounted 33 CodeMirror lines. A tail edit took 81 ms. The separate switch
  matrix shows that hundreds of widgets/decorations, rather than backend I/O,
  add the dominant content-sensitive cost.
- A rare five-result search took 68 ms in the browser.
- Warm literal backend search was 21 ms for five matches and 62 ms for 10,000
  matches. Ranked search was 29 ms for five matches, 49 ms for a 10,000-result
  prefix, 35 ms for a 10,000-result typo, and 0.02 ms for five ranked link
  targets.
- Warm backend backlinks took 5 ms before serialization; Home and Calendar
  projections remained at or below 1 ms.
- Collapsed startup mounted only the nine visible root rows; the problem is the
  fully restored expanded state, not the normal collapsed tree presentation.

## Reference measurements

### Backend and bridge payloads

| Operation | Work | Serialization | Result/payload |
| --- | ---: | ---: | ---: |
| File tree, cold | 238 ms | 29 ms | 10,000 files / 2.48 MB |
| Search, rare, cold index | 816 ms | <1 ms | 5 results |
| Search, rare, warm | 21 ms | <1 ms | 5 results |
| Search, common, warm | 62 ms | 7 ms | 10,000 results / 2.38 MB |
| Ranked search, rare, warm | 29 ms | <1 ms | 5 results / 1.2 KB |
| Ranked search, prefix, warm | 49 ms | 5 ms | 10,000 results / 2.97 MB |
| Ranked search, typo, warm | 35 ms | 4 ms | 10,000 results / 2.96 MB |
| Ranked link completion, warm | 0.02 ms | <1 ms | 5 results / 1.0 KB |
| Kanban, warm | 0.25 ms | 2 ms | 10,000 cards / 1.98 MB |
| Home tasks, limit 6 | 0.95 ms | <1 ms | 6 cards / 1.1 KB |
| Calendar month, warm | 0.27 ms | <1 ms | one populated day |
| Backlinks, warm | 5 ms | 4 ms | 10,000 results / 3.19 MB |
| Unlinked mention, no candidates | 0.04 ms | <1 ms | no results |
| Read 10,000-line note | 0.8 ms | 0.7 ms | 798 KB |
| Vault health, warm | 117 ms | <1 ms | no issues |
| Git status, one file | <0.01 ms | <1 ms | one Boolean |
| Move / restore `Areas` | 346 / 367 ms | <1 ms | no rewritten links |
| Copy small note, watcher-less / tree after copy | 239 / 11 ms | <1 / 5 ms | one copied note / 10,001 files |

### Browser boundaries

| Interaction | Elapsed | Longest long task | Mounted scale |
| --- | ---: | ---: | ---: |
| Collapsed startup | 672 ms | 86 ms | 9 tree rows |
| Expand all tree directories | 113 ms | none | 160 of 21,630 rows |
| Open 10,000-line plain note, complete presentation | 267 ms | 62 ms | 33 editor lines |
| Edit note tail | 81 ms | none | 33 editor lines |
| Render 5 search results | 68 ms | none | 5 rows |
| Render 10,000 search results | 84 ms | none | 96 rows |
| Arrow Down in broad search | 30 ms | none | existing result window |
| Render 10,000 Kanban cards | 166 ms | none | 101 cards |
| Arrow Down in large Kanban | 120 ms | 66 ms | targeted column patch |
| Render 10,000 backlinks | 358 ms | none | 96 cards |
| Render 10,000-node Graph, complete paint | 334 ms | none | one canvas / 9,999 edges |
| Equivalent Graph filter / select / zoom | 47 / 132 / 182 ms | none | one latest canvas frame |
| Switch plain → 400 tables / 160 diagrams, median of 3 | 214 / 188 ms | 76 / 94 ms worst observed | content-aware stages |
| Switch plain → 1,200 math spans / 500 images, median of 3 | 213 / 297 ms | 97 / 91 ms worst observed | content-aware stages |
| Switch content-heavy → plain, median of 3 | 97–191 ms | 0–82 ms worst observed | outgoing presentation removed first |

### Optimization checkpoints

| Checkpoint | Before | After | Correctness gate |
| --- | --- | --- | --- |
| Search windowing and selection updates | 1,425–2,065 ms initial render; 1,381–1,864 ms per Arrow Down; 10,000 mounted rows | 99 ms initial render; 46 ms per Arrow Down; 96 mounted rows; no long task | Full huge-vault harness passed; keyboard selection crossed the render window and opened the correct note; scrollbar navigation reached the logical final result; accessible position and set size remained correct. |
| Kanban column windowing and linear order reconciliation | 1,886–2,250 ms initial render; 2,105–2,462 ms per Arrow Down; 10,000 mounted cards | 118 ms initial render; 150 ms per Arrow Down; 101 mounted cards | Full huge-vault harness passed after detecting and correcting a focus-loss race; the focused card survived 110 Tabs, reorder, and drag/drop across a window boundary, with three repeated browser passes. |
| Expanded file-tree windowing | 2,478–2,775 ms; 21,630 mounted rows; 208,383 DOM nodes | 131 ms; 160 mounted rows; 1,857 DOM nodes; no long task | Full harness passed after detecting and correcting stale-node context-menu focus restoration; the boundary scenario passed five consecutive runs covering End/Home, distant arrows, Shift+F10/Escape, and activation. |
| Backlink result windowing | 1,050–1,301 ms; 10,000 mounted cards; 80,628 DOM nodes | 104 ms; 96 mounted cards; 1,397 DOM nodes; no long task | Full harness passed with the normal browser contract Tabbing to the final logical relationship beyond the mounted window. |
| Graph retained layout and interruptible canvas | 350 ms initial with a 145 ms task; every interaction repainted synchronously | 334 ms complete initial paint; equivalent filter 47 ms; selection 132 ms; zoom 182 ms; no Graph long task | Full harness waits for `data-render-state=ready`; pure tests cover retained coordinates, trace plans, spatial candidates, equivalent topology, and bounded layout refinement. |
| Content-aware large-Markdown switching | Outgoing and incoming presentation compartments could both rescan large source during one switch. | Plain open 267 ms; three-trial equal-scale content-heavy medians 188–297 ms versus 97–191 ms returning to plain; backend read 0.8 ms. Outgoing presentation is removed without a reconfigure, and only present incoming features lead the ready path. | Source chunks reassemble byte-for-byte; the profiler verifies the actual CodeMirror owner and complete presentation. Pure tests cover the content plan, while cursor/mouse boundaries remain in browser and packaged-webview checks. |
| Compact and pooled cold index | 1,626–2,195 ms; ~476 MB cumulative allocation; 177–200 MB heap | 816 ms; 306 MB cumulative allocation; 109 MB reported heap | Full harness and warm-vs-fresh-cold projections passed after known saves, watcher create/remove, and directory moves. Bulk append, sorted incremental posting mutation, and shared immutable text have focused tests. |
| Field-aware relevance index and passage reuse | First ranked samples rescanned duplicate source per result: 209 ms rare and 345–351 ms broad, allocating 88–171 MB per query | 29 ms rare, 49 ms broad prefix, and 35 ms broad typo; 11–30 MB cumulative allocation per warm query. | Pure feature tests cover every query rule; native tests cover ranking and link profiles; warm-vs-cold snapshots include ranked responses through mutations; the complete backend/browser stress profiles pass. |
| Indexed move rewrite planning and remapping | 2,165–2,762 ms; ~576 MB cumulative allocation per direction | 346–367 ms; ~223 MB cumulative allocation per direction | Full harness passed. Sparse links among decoy notes, every supported link syntax, unchanged decoys, retained body-analysis identity, and warm-vs-fresh-cold state after the move all remain asserted. |
| Path-scoped Git status | 1,166–1,466 ms; ~205 MB cumulative allocation | 0.2 ms; ~15 KB cumulative allocation | Full harness and the expanded full-worktree oracle passed across tracked, staged, ignored, mode-change, deletion/recreation, and rename states. |
| Cached file-tree projection | 227–365 ms backend rediscovery plus 4–13 ms serialization | 16 ms in-memory hierarchy projection plus 11 ms serialization | Full harness passed; focused tests prove immutable reuse and known create/move remapping, while the differential oracle still compares warm paths with both a fresh rebuild and an independent disk walk. |
| Incremental internal copy | 783 ms copy plus 220 ms post-copy tree rediscovery | 239 ms watcher-less validation plus 11 ms in-memory tree projection; production watcher path omits the validation walk | Focused tests prove retained cache/index identity with an active watcher, exact copied-path acknowledgement, link correctness, warm-vs-fresh-cold projections, independent disk-tree equality, and watcher-less fallback after an unobserved external Markdown create. |
| Scheduled/health/mention projections | Small Home/Calendar reads and repeated Health/mention requests copied or scanned full warm collections. | Home 1.0 ms; Calendar 0.3 ms; Health 117 ms; no-candidate mention 0.04 ms | Revision-aware cache invalidation and focused equivalence tests cover schedule changes, saves, health refreshes, and exact candidate results. |
| Eager production bundle | Development-style startup exposed roughly 220 ESM requests and 10.3 MB decoded source. | One 3.91 MB ESM entry / 1.23 MB gzip, with the same eager module graph | Embed, development substitution, architecture reachability, and production bundle-build tests passed. |

Raw backend, general-browser, and content-sensitive document-switch JSON
reports are written separately under the ignored `stress-vault/` directory by
the commands in [`docs/TESTING.md`](TESTING.md). Re-run the profiles on the
target machine before treating absolute timings as a performance budget. The
document-switch report additionally records three samples per direction plus
median, worst-observed, and content-to-plain ratios. Its default six-times
relative ceiling is intentionally broad enough for host variation while still
turning a major content-sensitive regression into a failed profile.

## Pre-optimization regression harness

Performance work starts only after behavior is observable independently from
timing. The harness now provides four complementary safety nets:

1. Warm incremental index state is compared with a fresh rebuild after saves,
   external watcher events, a directory copy, a directory move, and removal. Search,
   literal/ranked search, relationships, Kanban, calendar, health, and
   tree projections must be identical and match stage-specific golden
   paths/dates; the tree is additionally checked against an independent disk
   walk.
2. Sparse move rewriting places supported link forms among 256 decoy notes and
   verifies every candidate plus byte-identical non-candidates. An indexed
   candidate optimization therefore cannot silently skip a distant link. A
   separate regression creates Markdown after indexing and proves that the
   metadata guard selects the complete-scan/rebuild fallback.
3. Path-scoped Git status is checked against go-git's full-worktree result for
   clean, modified, staged, deleted, untracked, ignored, and renamed states.
4. Normal Playwright contracts walk beyond likely render-window boundaries in
   search, the file tree, Kanban, and Relationships. Logical focus,
   activation, context menus, Kanban reordering/dragging, selection, and accessible identity must survive even when an optimized UI
   no longer mounts the complete collection.

The timing profile records logical and mounted counts separately, so future
virtualization is rewarded rather than mistaken for missing data. These gates
do not eliminate implementation risk, but they reduce the principal danger of
an optimization producing plausible timings while silently losing results,
links, filesystem state, or keyboard reachability.
