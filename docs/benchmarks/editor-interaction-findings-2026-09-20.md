# Consolidated editor interaction findings — 2026-09-20

This completes the ten findings from the combined pointer, cursor, typing and
deferred-diagnostics audit. Four improvements arrived in concurrent typing work;
their regression coverage is included here. One inventory and shared acceptance
matrix track the outcome across all ten areas.

## Measured outcome

The [paired measurements](editor-interaction-findings-2026-09-20.json) use the
shipped modules, actual CodeMirror updates, source/getter spies and decoration
allocation counters. Most cases perform 20 updates at small and large sizes.
The large visible-range cases deliberately expose scaling; they do not imply a
normal viewport contains 1,000 paragraphs. Pointer coordinates and viewport
ranges are controlled in jsdom. These are work counts, not milliseconds.

| Finding | Before, large fixture | After | Status |
| --- | --- | --- | --- |
| A1 Ordinary pointer footnote check | 20 whole-note reads / 4,200,340 characters | 0 whole-note reads | Local token classification; recognized footnotes retain navigation/create/return |
| A2 Code active indentation scope | 200,200 map membership checks with 10,000 lines and a fixed viewport | 100 checks | Pure scope selection over cached lines, preserving nested and blank-line rules |
| A3 Writing marks/point queries | 40,000 viewport / 20,000 point-query bound reads for 1,000 offscreen findings | 0 offscreen bound reads in current adapter queries | Persistent range tree from concurrent work, verified here |
| A4 Diagram projections | 20,000 replacement decorations with 1,000 diagrams | 0 replacements | Mapped decorations and indexed reveal from concurrent work, verified here |
| A5 Mermaid diagnostics | 500 validations for five passes over 100 identical fences | 1 parser call | Bounded exact-source success/failure/pending reuse; 100 distinct unchanged sources require 100 calls across five passes |
| A6 Visible inline projections | 20,020 link slices; 280,080 link syntax visits; 140,000 each for markers/styles | 0 such slices/visits; 40 affected-paragraph inline visits | Safe mapping from concurrent work, fresh-parse equivalence retained |
| A7 Formatting-marker movement | 40,000 marker checks across 2,000 cached marks | 0 unrelated marker checks | Interval queries and changed-decoration patches |
| A8 Math edits after formulas | 60,000 range-bound reads; 20 replacement indexes | 0 range-bound reads; original index retained through all 20 edits | Indexed overlap test and unchanged-position fast path |
| A9 Properties body typing | 20 metadata slices / 277,960 characters for 1,000 keys | 0 slices; metadata retained through all edits | Header/delimiter invalidation from concurrent work, verified here |
| A10 Completion on a long line | 4,000,420 characters requested by two activators | 40 inserted characters | Streaming append context; wider context is rebuilt once after non-append edits or relocation |

The automatic empty-link check also reads only the final three characters until
it sees `]()`. Its queued replacement is discarded if the document changed.
Completion trigger summaries are checked against the existing source matchers,
including incomplete links, image exclusions, whitespace hashtags, line breaks,
Unicode, deletion, cursor relocation and superseded queued activation.

Mermaid reuse belongs to an injected coordinator; the concrete adapter owns the
serialized parser. At most 128 sources and 2,000,000 source characters are kept.
The initialized renderer identity owns the fixed configuration; replacement
invalidates the cache. Parser failures retain their location information and
are mapped onto the current fence. Safety and availability checks run before
reuse. An obsolete lint pass stops before requesting its next block; already
running parser work cannot be preempted.

## Acceptance and verification

`editorRemainingWork.test.js` covers the scale matrix. Existing writing,
frontmatter, source-reveal, diagram and inline-projection suites retain content,
selection, folding, drag, Undo and stale-action behavior. New pure completion and
indentation tests compare incremental/bounded plans with the previous rules;
Mermaid tests cover reuse, pending deduplication, eviction, context replacement,
failure relocation and cancellation. Pointer/footnote and autofill checks use
the assembled editor. Final validation:

- Full frontend coverage: 317 suites / 2,936 tests passed. Statements 83.75%,
  branches 72.63%, functions 83.88%, lines 87.20%; all required floors pass.
- Broad Chromium suite: 134 passed and two optional cases skipped initially;
  the one failed remount case passed after correcting its scroll setup, yielding
  135 passing scenarios across the full run and focused recheck.
- Packaged production-tagged Linux WebKitGTK on an isolated Xvfb display:
  114/114 checks passed. They include native XTest Up/Down, pointer placement,
  both drag directions, task keys, code Tab/Undo, footnote create/return/Undo,
  heading and hashtag completion, empty-link autofill and Mermaid validation
  reuse. The original 22-check geometry probe also uses scripted setup/input;
  the other 92 checks use real native input where their behavior requires it.
- Lint, architecture, integrity, feature index and production build checks pass.

The first full frontend run found a test timing dependency: wall-clock CPU load
could create a legitimate statistics pause inside the intended typing burst.
The test now advances scheduled callbacks with controlled time; the complete
coverage run passes with that correction. The browser remount setup similarly
used a direct scroll write while the final typing transaction still had a pending
caret-scroll target. It now submits the target through CodeMirror, keeps the
unmount/remount assertions and still clicks the retained code/table source.
The new native formatting drag starts in stable adjacent prose, because revealing
delimiters changes their own pixel positions. These are test-boundary fixes;
they do not relax the source, geometry or work-count acceptance checks.

Temporary native processes and their display were stopped after verification.
Work counts and this native matrix do not establish physical latency percentiles.

## Remaining boundaries

This closes the ten measured findings, not every possible performance concern.
Structural changes may reparse a note. Edits before blocks still map positions,
long selections can affect many marks, and a cold/invalidated completion context
may inspect the current line prefix. Native layout, parser CPU, open previews,
worker timing and long-session memory still require workload-specific profiling.
Linux WebKitGTK checks cannot prove Windows WebView2 or macOS WKWebView behavior.

Detailed temporary measurement and verification logs are under
`/tmp/figaro-ten-findings`; the JSON and maintained regressions retain the
reproducible evidence in the repository.
