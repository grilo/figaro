# Scoped editor updates and PDF profiling — 2026-09-20

Five editor/writing improvements are implemented. The subsequent PDF profile
identifies additional work; PDF behavior was not changed for this investigation.
The [measurement data](reparse-and-pdf-cost-2026-09-20.json) retains the timing
summaries, source hashes, PDF stages and output validation.

## Implemented changes

1. Safe heading, code, table and soft Enter/Backspace edits refresh affected
   block payloads while retaining unrelated previews and source decorations.
2. Writing paragraph caches allow 8,192 entries instead of 2,048, retaining the
   existing 4 MiB estimated-data limit per cache.
3. Completed paragraphs can reuse projections within a partially parsed note.
   Matching parser extent and ancestor boundaries prevent reuse across unseen
   syntax changes; parser progress still discovers newly parsed blocks.
4. Unrelated settings changes retain cached code, image, table and diagram
   projections. Actual rendering/reveal configuration changes still apply.
5. Writing review retains one current document's block/source mappings. Safe
   paragraph/heading edits parse one block. Structural or reference-context
   changes use a full parse; exact unchanged blocks may still reuse mappings.

Pure block/edit decisions are separate from CodeMirror and parser adapters.
Structural edits, uncertain boundaries, global definitions and parser progress
retain conservative fallback. Splitting or merging Markdown blocks does not
always qualify for the local path. Whole-note consistency checks still receive
the current assembled writing projection.

## Editor measurements

The same production-tagged Linux WebKitGTK fixture contains headings, prose,
code, tables, inline math and Mermaid blocks. Values are median synchronous
update milliseconds, before → after. Each edit has four warm-ups and ten timed
dispatches; line-number toggles have twelve timed samples in the normal pass.
These measure editor transactions, not physical input-to-display latency.

| Operation | 69,030 characters | 347,430 characters, partial tree | 347,430 characters, complete tree |
| --- | ---: | ---: | ---: |
| Prose letter | 8 → 7 | 25 → 11 | 13 → 18 |
| Heading letter | 23 → 10 | 28 → 15 | 56 → 20 |
| Code letter | 18 → 8 | 22 → 10 | 47 → 14 |
| Table letter | 16 → 11 | 29 → 19 | Not measured |
| Diagram letter | 23 → 8 | 38 → 11 | 64 → 16 |
| Soft Enter | 21 → 10 | 32 → 17 | 56 → 23 |
| Backspace joining that line | 21 → 8 | 33 → 14 | 54 → 22 |
| Line numbers setting | 17 → 7 | 28 → 9 | 37 → 10 |

The complete-tree probe explicitly finishes parsing during setup; production
still permits partial parsing. Complete-tree prose was slower in this run,
despite retaining its existing fast path. These small samples do not establish
the cause or a universal speedup. The prose-only 335,544-character control had
4–7 ms final medians across these operations with a complete tree.

Observed work is less ambiguous: a local code edit now visits two code-parser
nodes and takes three source slices, versus 21,007 nodes and 4,000 slices in the
complete mixed-note baseline. Line-number changes no longer rescan those
projections. Heading/Enter still have outline work, and newline math scanning
and mapping positions before many blocks remain costs.

## Writing measurements

| Fixture | First analysis, before → after | Warm one-paragraph edit, before → after |
| --- | ---: | ---: |
| 6,870 characters | 619 → 322 ms | 67 → 17 ms |
| 69,030 characters | 3,199 → 1,489 ms | 250 → 31 ms |
| 347,430 characters | Production timeout → 7,420 ms | About 10.4–11.2 s → 193 ms median |

Warm final values use five samples. The large baseline exceeded the unchanged
12-second production deadline; a separate diagnostic worker with an extended
measurement budget took 16.662 seconds cold and 10.392–11.152 seconds warm.
A fresh final worker passed the production deadline in 8.548 seconds. Extended
measurement of the final worker independently gave 201–224 ms warm results.

The Node probe explains the reduction: formerly each of three paragraph caches
rescanned about 1,959 entries after one edit because the entry limit evicted
useful short paragraphs well below the memory cap. The final run parses one
Markdown block, reuses 7,001 block maps, and rescans one entry per paragraph
cache. Its largest cache remains below 0.8 MiB estimated data. Node warm review
fell from 5.44–5.78 seconds to about 394 ms; isolated incremental source
projection took 45–64 ms after a cold build. Native and Node times are separate
experiments and should not be mixed into one latency claim.

## PDF workflow results

Measurements include opening PDF Preview, three single-character edits, eight
scroll positions, and two actual Generate PDF operations per fixture. Preview
edit time includes the existing 320 ms debounce and ends after the rendered
acknowledgement and two animation frames. Export ends after the native result
and button recovery. All times below are milliseconds.

| Fixture | Source characters | Open preview | Warm edit median | First / repeat export | PDF pages |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20 mixed sections | 6,872 | 611 | 509 | 1,858 / 827 | 12 |
| 200 mixed sections | 69,032 | 759 | 1,008 | 1,818 / 1,965 | 110 |
| 1,000 mixed sections | 347,432 | 3,212 | 3,966 | 11,034 / 10,936 | 546 |
| 50 distinct Mermaid diagrams, mixed sections | 17,312 | 3,030 | 594 | 992 / 1,001 | 28 |
| 200 mixed sections, cover and numbered contents | 69,111 | 1,104 | 1,212 | 3,661 / 3,712 | 108 |
| 2,200 prose paragraphs | 335,544 | 438 | 524 | 1,183 / 1,084 | 158 |

The first export also includes the first browser validation in this process.
Each fixture's first export saves its edited source and triggers an additional
full preview render. Its repeat export does not trigger that extra render.
The numbered fixture uses the bundled starter stylesheet, a cover, `toc-depth:
2`, and `page-numbers: true`; page counts are therefore not directly comparable
with the default-styled 200-section fixture.

### Preview bottleneck

The large mixed note expands to approximately 15.2 million HTML characters,
including 1,000 SVG diagrams. Its three warm edit samples show:

| Stage | Observed time |
| --- | ---: |
| Markdown worker CPU | 36–91 ms |
| Printable body decoration | 131–233 ms |
| Printable diagram pass, including HTML parse/serialization | 421–504 ms |
| Preview document construction | 426–482 ms |
| Applying the document inside the preview frame | 1,168–1,302 ms |
| Sanitization, included in frame application above | 190–240 ms |

Stage durations are inclusive and nested; do not sum all instrumented functions.
Repeated HTML parsing, serialization, frame replacement and subsequent layout
dominate this workload. A 16 ms heartbeat observed gaps of 1.218–2.331 seconds
during those edits. This detects main-thread unavailability, not exact physical
input latency or attribution of every layout millisecond.

By comparison, the similarly sized prose note produces about 493,000 HTML
characters. Its worker took 12–17 ms, frame application 15–20 ms, and warm-edit
heartbeat gaps 47–57 ms. Source length alone is a poor predictor of PDF cost.

The 50-distinct-diagram fixture spent 1,191 ms in its cold diagram pass, falling
to 27–58 ms after warm-up. Existing SVG reuse already helps. In the 1,000 repeated
diagram fixture, warm renderer calls totaled only 9–18 ms; most diagram-pass
time was outside the cached renderer itself.

During eight large-fixture scroll positions, the preview enumerated and sorted
source anchors sixteen times, consuming 330 ms total and up to 35 ms per query.
Geometry caching/indexing is a separate opportunity. The largest heartbeat gap
was 133 ms; editor scrolling also runs during this experiment.

### Export bottleneck

For the 546-page output, native export took 9.77–10.01 seconds. Chromium page
loading took 2.26–2.34 seconds and `Page.printToPDF` took 6.43–6.82 seconds.
Writing the temporary workspace took about 40 ms and publishing the PDF 3–4 ms.
Pagination/printing hundreds of SVG-rich pages is the dominant export cost.

Every export validates Chromium in a temporary process and then starts the
actual export process. Warm validation costs about 234–304 ms here; the very
first validation cost 1.20 seconds. For the 12-page repeat export, validation
alone accounts for 285 ms of the 757 ms native operation.

Numbered contents correctly use two print passes in the same export session.
Those passes total about 1.84–1.85 seconds, with about 197–201 ms in contents
resolution/validation. The first document heading is on physical page 8 and
the last section heading on page 107. The two-pass behavior is required by the
current page-number contract.

### Recommended follow-up order

1. **Reduce full preview DOM rebuilding.** This has the largest observed impact
   on editing responsiveness. Retain unchanged printable blocks and minimize
   serialization/frame replacement, preserving sanitization, styling, diagram
   identity, source anchors and stale-result protection.
2. **Skip the identical preview refresh caused by saving during export.** This
   is a smaller, direct change with clear evidence: all six first exports
   unnecessarily repeated preview work after their source was already rendered.
3. **Reuse a matching printable snapshot for export.** Key it by source, style,
   appearance and relevant resource context; preserve saved-source ownership and
   stale-result guards. Reuse must happen before preview-only transformations.
4. **Index preview anchors and invalidate geometry explicitly.** Refresh on
   content, fonts, images and layout changes, rather than querying/sorting every
   anchor on each synchronized scroll.
5. **Avoid redundant browser capability startup.** Reuse a valid capability
   result or validate within the actual export session, with invalidation and
   recovery for changed/missing browser executables.

These are profiling recommendations, not implemented PDF changes. Faster
Markdown parsing alone would leave most of the measured preview delay intact.

## Verification and limitations

- Full frontend coverage passed 319 suites / 2,966 tests: 83.83% statements,
  72.74% branches, 83.87% functions and 87.24% lines. The final table-visitor
  pruning passed 65 focused tests afterward. Integrity, architecture, lint,
  feature-index and production/native builds passed.
- Six affected existing Chromium scenarios passed, covering eager startup,
  empty list/quote Enter, guides, math/diagram selection and source footprints.
- The packaged native app passed 72 scoped interaction checks using XTest keys
  and pointers, including code/table/diagram/image payload updates, both cursor
  and drag directions, mouse placement, soft Enter/Backspace and exact source
  restoration. An additional 36 real key events restored paragraph, heading
  and code fixtures exactly.
- Twelve real PDF exports succeeded. All six resulting files contained every
  expected section/paragraph and the final paragraph. All 200 numbered contents
  entries matched their actual destination pages; all 201 links/destinations
  were present. Rendered first/last mixed pages, contents and distinct-diagram
  pages were visually inspected without clipping or missing content.

The app ran inside an owned hidden Xvfb display and private user/network
namespace with disposable vault/config/cache paths. Native UI used WebKitGTK;
PDF export used Chromium 153.0.8010.12. Timing has roughly millisecond resolution,
instrumentation adds overhead, and the samples are exploratory rather than a
release performance threshold. Windows WebView2 and macOS WKWebView were not
measured. The external PDF viewer handoff was recorded by a stub; its launch and
UI performance were not measured. The real exporter wrote and published every
PDF. All owned app/display processes were stopped afterward.

## Reproduction and artifacts

The editor fixtures repeat a numbered heading, two prose paragraphs, a two-line
JavaScript fence, a one-row table, inline math and a two-node Mermaid graph at
20, 200 and 1,000 sections. PDF fixtures use the same structure; the distinct
diagram control varies node IDs and the prose control has 2,200 numbered
paragraphs. The JSON records exact lengths and source hashes.

Reproduce with a production-tagged native build and an isolated vault. Run the
editor dispatch matrix with previews closed, then compare partial and completed
parser trees. Run writing analysis cold and after editing one prose character.
For PDF, open each file, open Preview, make three one-character edits, scroll
through eight positions, then generate twice. Measure worker CPU, body/diagram
transformation, preview frame application and native browser stages separately;
retain inclusive timing semantics. Validate extracted text, contents destinations
and rendered pages before interpreting a faster result.

Complete local scripts, temporary instrumentation and logs remain under
`/tmp/figaro-reparse-cost`, `/tmp/figaro-reparse-implementation` and
`/tmp/figaro-pdf-profile`. PDF instrumentation was applied only to a separate
temporary repository copy. The checked-in JSON preserves compact results after
those temporary directories are removed.
