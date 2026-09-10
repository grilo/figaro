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
