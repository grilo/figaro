# Huge-vault stress audit

This focused audit profiles Figaro with a deterministic, ignored fixture of
10,000 Markdown documents. It is intended to expose scale bottlenecks without
checking generated notes into Git or turning machine-dependent timings into
flaky pass/fail assertions.

## Fixture and method

The 2026-08-14 reference profile used:

- 10,000 Markdown files across a deeply nested hierarchy (about 89 MB)
- 9,995 small notes copied byte-for-byte from one generated source
- 5 large notes copied from one generated 10,000-line source
- one shared search marker, one large-note-only marker, one task per note, and
  one backlink per note
- Linux amd64 with Go 1.26.0 and Playwright Chromium 151.0.7922.34

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

The final 2026-08-14 verification passed every general large-vault oracle. It measured an 852 ms cold index, 448/430 ms indexed move and restore, 0.2 ms path-scoped Git status, and an 8 ms warm tree projection. The warm small-note copy took 224 ms followed by a 13 ms tree projection. Browser renders took 50 ms for broad search, 100 ms for Kanban, 131 ms for the fully expanded tree, and 95 ms for backlinks.

The 2026-08-14 relevance-search profile indexed 10,475 normalized terms. Its
1,120 ms cold build allocated 335 MB cumulatively and reported 101 MB of heap,
compared with the last documented substring-only checkpoint's 852 ms build and
64 MB heap; the richer field-frequency index therefore adds about 268 ms and
37 MB at this deliberately repetitive 89 MB/10,000-note scale. Once warm,
BM25F search took 22 ms for five large-note matches, 38 ms for a 10,000-result
prefix, 50 ms for a 10,000-result typo, and 0.1 ms for a five-result link
completion. Browser rendering remained 50–51 ms for both five and 10,000
logical search results, with only 96 broad-result rows mounted and no long
task. These numbers include per-query reuse of best passages for byte-identical
content; without that reuse, the initial ranked broad-search sample was
345–351 ms.

The startup-progress verification on the same fixture finished at exactly
10,000 / 10,000 notes and emitted 104 progress events. Its 1,070 ms cold build
remained inside the previously observed 929–1,120 ms relevance-index range;
the retained discovery list and sampled event callback therefore showed no
material cold-index regression at this scale.

## Prioritized findings

| ID | Priority | Evidence | Diagnosis | Recommended direction |
| --- | --- | --- | --- | --- |
| PERF-01 | Resolved | Before optimization, Kanban rendered 10,000 cards in 1,886–2,250 ms with 170,609 DOM nodes, and Arrow Down took 2,105–2,462 ms. After per-column windowing and linear order reconciliation, render took 118 ms with 101 mounted cards / 2,327 total DOM nodes; Arrow Down took 150 ms. | Each column retains its complete logical order while mounting a 96-card window. Tab and focus movement reveal distant cards, and persistence reconciles ordering in linear rather than quadratic work. | Preserve the full keyboard reorder, cross-column, drag/drop, focus-restoration, and scrollbar contracts in the guarded harness. |
| PERF-02 | Resolved | Before optimization, a 10,000-result search took 1,425–2,065 ms, mounted 80,549 nodes, and one Arrow Down took another 1,381–1,864 ms. After windowing, the same profile took 99 ms with 96 mounted rows / 1,318 total DOM nodes; Arrow Down took 46 ms with no long task. | Search keeps the complete logical result set but mounts a 96-row window. Selection patches the existing options and only moves the window when the active result crosses it. | Preserve the windowing and the independent keyboard/mouse reachability contract in the guarded stress test. |
| PERF-03 | Resolved | Before optimization, restoring every expanded directory took 2,478–2,775 ms with 21,630 tree rows / 208,383 DOM nodes. The windowed profile took 131 ms, mounted 160 rows / 1,857 total DOM nodes, and produced no long task. | Large expanded trees use a flattened logical row projection with a bounded DOM window while retaining level, expansion, selection, context-menu, drag, and activation semantics. | Preserve the logical-path focus resolver and release its scroll protection only on an actual wheel or pointer gesture. |
| PERF-04 | Resolved | Before optimization, opening 10,000 relationships took 1,050–1,301 ms with 80,628 DOM nodes. The windowed profile took 104 ms, mounted 96 cards / 1,397 total DOM nodes, and produced no long task. | Backlinks retain the complete logical result set and accessible position metadata while mounting a 96-card window. Keyboard focus reveals the next logical card across boundaries. | Preserve final-card Tab reachability and source activation; unlinked-mention action cards remain fully rendered so their two-control Tab order is unchanged. |
| PERF-05 | Resolved | Before optimization, the first indexed search took 1,626–2,195 ms, allocated about 476 MB cumulatively, and left 177–200 MB on the heap. Compact sorted postings plus immutable text pooling reduced the reference run to 714 ms, 249 MB cumulative allocation, and 64 MB heap. | Search postings now use sorted path slices instead of per-trigram maps, and byte-identical notes share immutable content, lowercase text, and trigram slices during a cold build. Incremental saves retain exact remove/insert semantics. | Preserve the warm-vs-cold differential oracle and sorted-posting mutation tests; do not trade exact search results for a probabilistic index. |
| PERF-06 | Resolved | Moving or restoring the top-level `Areas` subtree previously took 2,165–2,762 ms and allocated about 576 MB per direction. Repeated indexed checkpoints completed in 436–687 ms and allocated about 188 MB per direction. | Move planning now validates the warm index against filesystem metadata, checks only Markdown files whose source or internal target intersects the moved tree, remaps affected index entries, and reconstructs derived projections from retained in-memory records. A stale snapshot falls back to the complete root-scoped scan and cold rebuild. | Preserve the sparse supported-syntax oracle, explicit stale-index fallback test, warm-vs-cold projections, rollback behavior, and activity state. |
| PERF-07 | Resolved | Checking Git status for one note previously took 1,166–1,466 ms and allocated about 205 MB. The path-scoped reference check took 0.2 ms and allocated about 15 KB. | The adapter now compares only the requested path across HEAD, the Git index, and root-scoped worktree metadata/content. Applicable ancestor `.gitignore` rules are evaluated without enumerating unrelated files; submodules retain the complete-status fallback. | Preserve the full-worktree differential matrix for clean, modified, staged, deleted, untracked, root/nested ignored, negated, executable-mode, staged-delete/recreate, and rename states. |
| PERF-08 | Resolved | File-tree scans previously took 270–365 ms and returned a 2.48 MB JSON payload even after the search index was warm. The cached warm projection took 16 ms; serialization remained 11 ms for the intentionally complete payload. | The backend publishes an immutable tree snapshot, retains flat path metadata, updates known file saves/creates, and remaps known moves in memory. Broad or ambiguous mutations and unscoped watcher events invalidate the cache and retain the complete root-scoped scan fallback. | Preserve snapshot reuse, pure hierarchy projection, known create/move remapping, external-change invalidation, symlink omission, and disk/warm/cold tree equivalence. Consider an incremental bridge payload only if serialization becomes material. |
| PERF-09 | Resolved | Copying one small note previously took 783 ms because it synchronously rebuilt the complete Markdown index; the following tree request took another 220 ms. The guarded 10,000-note profile now measures 234 ms for the copy and 10 ms for the warm tree projection. | A copy validates pre-existing Markdown metadata, parses and adds only the new subtree to a current index/tree cache, and acknowledges exact copied watcher paths. A stale index retains the complete rebuild fallback. | Preserve warm-vs-cold copied search, backlink, Kanban, calendar, health, and tree equivalence; exact stale-index fallback; cache identity; watcher suppression; link rewriting; and non-destructive collisions. |
| PERF-12 | Monitored | BM25F fields, term postings, document frequencies, and the 10,475-term vocabulary increased the reference cold build from 852 to 1,120 ms and the reported post-build heap from 64 to 101 MB. Warm ranked queries stayed interactive: 22 ms rare, 38 ms broad prefix, 50 ms broad typo, and 0.1 ms link completion. | The added retained state is the cost of field-aware ranking, natural terms, prefixes, typo tolerance, and suggestions. Direct normalized-text analysis and query-local passage reuse avoid a second fold/token-occurrence slice and repeated scans of pooled content. | Keep the new ranked metrics and warm-vs-cold differential oracle. Treat further cold-memory reduction as worthwhile, but do not discard exact incremental results or rescan the vault on each query. |

Severity uses the audit scale: 3 blocks or substantially impairs a primary
workflow, 2 causes meaningful friction, and 1 is minor. P1 means fix next; P2
means schedule soon.

## Boundaries that held up well

- The 10,000-line note opened in 313–356 ms and mounted only 31 CodeMirror
  lines. A tail edit took 47–141 ms across three runs. CodeMirror's viewport
  virtualization is working and should be preserved, although the slower edit
  runs included an 84–85 ms long task worth watching.
- A rare five-result search took 50–83 ms in the browser.
- Warm literal backend search was 21 ms for five matches and 51 ms for 10,000
  matches in the latest run. Ranked search was 22 ms for five matches, 38 ms
  for a 10,000-result prefix, 50 ms for a 10,000-result typo, and 0.1 ms for
  five ranked link targets.
- Warm backend backlinks took 14 ms before serialization, and home/calendar
  limited queries remained below 5 ms.
- Collapsed startup mounted only the nine visible root rows; the problem is the
  fully restored expanded state, not the normal collapsed tree presentation.

## Reference measurements

### Backend and bridge payloads

| Operation | Work | Serialization | Result/payload |
| --- | ---: | ---: | ---: |
| File tree, cold | 365 ms | 13 ms | 10,000 files / 2.48 MB |
| Search, rare, cold index | 2,195 ms | <1 ms | 5 results |
| Search, rare, warm | 9 ms | <1 ms | 5 results |
| Search, common, warm | 47 ms | 9 ms | 10,000 results / 2.38 MB |
| Ranked search, rare, warm | 22 ms | <1 ms | 5 results / 1.2 KB |
| Ranked search, prefix, warm | 38 ms | 5 ms | 10,000 results / 2.96 MB |
| Ranked search, typo, warm | 50 ms | 5 ms | 10,000 results / 2.97 MB |
| Ranked link completion, warm | 0.1 ms | <1 ms | 5 results / 1.0 KB |
| Kanban, warm | <1 ms | 4 ms | 10,000 cards / 1.48 MB |
| Home tasks, limit 6 | 5.0 ms | <1 ms | 6 cards / 1.6 KB |
| Backlinks, warm | 11 ms | 11 ms | 10,000 results / 3.19 MB |
| Unlinked-mention full scan | 338 ms | <1 ms | no results |
| Read 10,000-line note | 1 ms | 1 ms | 798 KB |
| Vault health, warm | 549 ms | <1 ms | no issues |
| Git status, one file | 1,466 ms | <1 ms | one Boolean |
| Move / restore `Areas` | 2,762 / 2,694 ms | <1 ms | no rewritten links |
| Copy small note, warm / tree after copy | 234 / 10 ms | <1 / 4 ms | one copied note / 10,001 files |

### Browser boundaries

| Interaction | Elapsed | Longest long task | Mounted scale |
| --- | ---: | ---: | ---: |
| Collapsed startup | 612–768 ms | 82–105 ms | 9 tree rows |
| Expand all tree directories | 2,478–2,775 ms | 1,815–2,110 ms | 21,630 rows |
| Open 10,000-line note | 313–356 ms | 113–142 ms | 31 editor lines |
| Edit note tail | 47–141 ms | 0–85 ms | 31 editor lines |
| Render 5 search results | 50–83 ms | none | 5 rows |
| Render 10,000 search results | 1,425–2,065 ms | 211–247 ms | 10,000 rows |
| Arrow Down in broad search | 1,381–1,864 ms | 1,149–1,621 ms | 10,000 rows rebuilt |
| Render 10,000 Kanban cards | 1,886–2,250 ms | 1,586–1,798 ms | 10,000 cards |
| Arrow Down in large Kanban | 2,105–2,462 ms | 1,550–1,774 ms | 10,000 cards rebuilt |
| Render 10,000 backlinks | 1,050–1,301 ms | 854–1,111 ms | 10,000 cards |

### Optimization checkpoints

| Checkpoint | Before | After | Correctness gate |
| --- | --- | --- | --- |
| Search windowing and selection updates | 1,425–2,065 ms initial render; 1,381–1,864 ms per Arrow Down; 10,000 mounted rows | 99 ms initial render; 46 ms per Arrow Down; 96 mounted rows; no long task | Full huge-vault harness passed; keyboard selection crossed the render window and opened the correct note; scrollbar navigation reached the logical final result; accessible position and set size remained correct. |
| Kanban column windowing and linear order reconciliation | 1,886–2,250 ms initial render; 2,105–2,462 ms per Arrow Down; 10,000 mounted cards | 118 ms initial render; 150 ms per Arrow Down; 101 mounted cards | Full huge-vault harness passed after detecting and correcting a focus-loss race; the focused card survived 110 Tabs, reorder, and drag/drop across a window boundary, with three repeated browser passes. |
| Expanded file-tree windowing | 2,478–2,775 ms; 21,630 mounted rows; 208,383 DOM nodes | 131 ms; 160 mounted rows; 1,857 DOM nodes; no long task | Full harness passed after detecting and correcting stale-node context-menu focus restoration; the boundary scenario passed five consecutive runs covering End/Home, distant arrows, Shift+F10/Escape, and activation. |
| Backlink result windowing | 1,050–1,301 ms; 10,000 mounted cards; 80,628 DOM nodes | 104 ms; 96 mounted cards; 1,397 DOM nodes; no long task | Full harness passed with the normal browser contract Tabbing to the final logical relationship beyond the mounted window. |
| Compact and pooled cold index | 1,626–2,195 ms; ~476 MB cumulative allocation; 177–200 MB heap | 714 ms; 249 MB cumulative allocation; 64 MB heap | Full harness and warm-vs-fresh-cold projections passed after known saves, watcher create/remove, and directory moves. Sorted posting insert/remove/lookup and shared immutable text have focused tests. |
| Field-aware relevance index and passage reuse | First ranked samples rescanned duplicate source per result: 209 ms rare and 345–351 ms broad, allocating 88–171 MB per query | 22 ms rare, 38 ms broad prefix, and 50 ms broad typo; 11–30 MB cumulative allocation. The richer cold index is 1,120 ms / 335 MB cumulative allocation / 101 MB reported heap. | Pure feature tests cover every query rule; native tests cover ranking and link profiles; warm-vs-cold snapshots include ranked responses through mutations; the complete backend/browser stress profiles pass. |
| Indexed move rewrite planning and remapping | 2,165–2,762 ms; ~576 MB cumulative allocation per direction | 436–687 ms; ~188 MB cumulative allocation per direction | Full harness passed. Sparse links among decoy notes, every supported link syntax, stale-index fallback, unchanged decoys, and warm-vs-fresh-cold state after the move all remain asserted. |
| Path-scoped Git status | 1,166–1,466 ms; ~205 MB cumulative allocation | 0.2 ms; ~15 KB cumulative allocation | Full harness and the expanded full-worktree oracle passed across tracked, staged, ignored, mode-change, deletion/recreation, and rename states. |
| Cached file-tree projection | 227–365 ms backend rediscovery plus 4–13 ms serialization | 16 ms in-memory hierarchy projection plus 11 ms serialization | Full harness passed; focused tests prove immutable reuse and known create/move remapping, while the differential oracle still compares warm paths with both a fresh rebuild and an independent disk walk. |
| Incremental internal copy | 783 ms copy plus 220 ms post-copy tree rediscovery | 234 ms metadata-guarded copy plus 10 ms in-memory tree projection | Focused tests prove retained cache/index identity, exact copied-path watcher acknowledgement, link correctness, warm-vs-fresh-cold projections, independent disk-tree equality, and a cold fallback after an unobserved external Markdown create. |

Raw JSON reports are written under the ignored `stress-vault/` directory by
the commands in [`docs/TESTING.md`](TESTING.md). Re-run the profiles on the
target machine before treating absolute timings as a performance budget.

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
