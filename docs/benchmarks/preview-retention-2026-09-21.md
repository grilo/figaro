# Prepared code, math, table and image previews — 2026-09-21

All four preview families now reuse completed content after source reveal or
viewport removal. Eight measured returns per family reused the same content
node and performed no repeat highlighting/markup generation, KaTeX rendering,
table construction or image-element creation. Ordinary returns were modestly
faster for code, math and tables in the final comparison; images were unchanged.
Held-arrow measurements do not establish a responsiveness improvement.

The [measurement data](preview-retention-2026-09-21.json) contains every round's
summary, the exact probe and native input harness, source/binary hashes,
baseline reruns, cache-disabled controls and native acceptance results.

## Implementation and boundaries

- Code, math and tables each retain up to 32 completed subtrees and 4 MiB of
  estimated source/markup/node data per editor. Images retain up to 16 loaded
  elements and 32 MiB, including a width × height × 4 decoded-pixel estimate.
  These estimates bound retained entries, not browser heap or mounted content.
- `core/previewCache.js` owns eviction and transfer decisions. The new
  `domPreviewCache.js` adapter owns DOM nodes and CodeMirror session disposal.
  Destruction releases the old wrapper; a guarded microtask detaches retained
  content before paint without removing a subtree already moved to a new mount.
- Exact source/renderer signatures validate reuse. Code additionally checks
  language-registration generation; math checks its KaTeX renderer. Highlighter
  exceptions, math errors and tables containing images remain retryable.
- Images reuse their loaded `img` without resetting its URL. Source, base path,
  loader and file-activation identity must match. Draw.io activation retains its
  existing fresh-URL behavior. Removed mounts reject late asynchronous results;
  failed or oversized images follow the ordinary loading path.
- Each mount recreates controls, current source mappings and fitting observers.
  Existing source-footprint measurement, theme/font CSS, resizing, source reveal
  and printable rendering retain their contracts. No syntax or visual component
  family is added. The vendored code widget receives its reuse port from editor
  composition and retains pure-only first-party imports.

## Native measurements

The baseline contains the preceding gutter, source-height and diagram-retention
changes. Both production-tagged builds used GTK 3.24.52 / WebKitGTK 2.52.6, a
private Xvfb display and software rendering. The app was 1280 × 800 inside a
1600 × 1000 display, with identical disposable-vault settings. No builds or
other tests ran during timed probes.

Each fixture has 12 blocks: 12-line JavaScript, five-row aligned math,
12-body-row tables, or 800 × 260 SVG images with 36 circles. Every block is
visited for 400 ms to prepare output. The ordinary-return probe enters and
leaves the first block eight times and verifies that exact block's node. Return
timing includes the selection transaction and up to 5 ms DOM-presence polling;
it does not measure paint or physical input latency.

| Ordinary return, eight repetitions | Baseline median | Candidate median | Same node, baseline → candidate | Repeated generation, baseline → candidate |
| --- | ---: | ---: | ---: | --- |
| Code | 15 ms | 11.5 ms | 0/8 → 8/8 | 8 markup writes → 0 |
| Math | 23 ms | 21 ms | 0/8 → 8/8 | 8 KaTeX calls → 0 |
| Tables | 9.5 ms | 8 ms | 0/8 → 8/8 | 8 markup writes → 0 |
| Images | 12 ms | 12 ms | 0/8 → 8/8 | 8 image creations → 0 |

Held navigation uses native XTest ArrowDown for 2.8 seconds, immediately followed
by ArrowUp for 2.8 seconds, three rounds per fixture. Autorepeat is 30 Hz after
180 ms. Rounds delivered 156–158 keys. Every round preserved exact source and
used zero source-height ruler reads, including the baseline.

| Held navigation | Repeated baseline frame-gap p95, three rounds | Candidate frame-gap p95, three rounds | Eliminated work per round |
| --- | --- | --- | --- |
| Code | 92 / 99 / 93 ms | 96 / 100 / 97 ms | 10 code markup writes |
| Math | 97 / 93 / 88 ms | 97 / 95 / 94 ms | 13–14 KaTeX renders |
| Tables | 98 / 104 / 100 ms | 96 / 96 / 87 ms | 10 table markup writes |
| Images | 50 / 44 / 42 ms | 88 / 84 / 89 ms | 9–10 image creations |

Frame timings varied substantially. The initial baseline was 52–72 ms across
all fixtures; repeating the identical baseline later raised code/math/table p95
to 88–104 ms while images became faster. Disabling code reuse in the candidate
still produced 88–98 ms, despite restoring fresh markup generation. Moving
detachment from widget destruction to a microtask did not improve those timings.

Images therefore received a same-session on/off/on control. Frame-gap p95 was
78/80 ms with reuse, 79/73 ms with fresh images, and 81/91 ms with reuse restored.
Fresh rounds created 9–10 image elements; retained rounds created none.
This small sequential sample cannot establish either an overall held-key gain
or the cause of the observed frame variation. The consistent result is removed
rendering work and correct content reuse. The report preserves the slower
measurements rather than selecting only favorable rounds.

These are coarse-clock, software-rendered Linux measurements. Other native
engines and hardware-accelerated machines were not measured. Genuine source
changes, cache misses, first renders, layout and selection still cost work.
After timing, the final build additionally bypassed retention when highlighting
throws; its successful rendering paths are unchanged and both binary hashes
are recorded.

## Verification

- Full frontend coverage passed 321 suites / 3,002 tests: 83.93% statements,
  72.95% branches, 84.05% functions and 87.35% lines, above every floor. Cases
  cover ownership transfer, disposal, bounds, mapped source changes, renderer
  changes, malformed code grammars, math errors, oversized images, cancelled
  mounts, current controls and Draw.io activation.
- The browser run passed 135 scenarios, including first-paint restored
  code/math/table/diagram sizes, image size and resize controls, Draw.io
  deletion, printable output and assembled startup. Its wheel fixture selected
  a line before asynchronous document mounting finished; awaiting the existing
  mount promise fixed that setup race and its focused rerun passed. Together
  these verify all 136 enabled scenarios; two optional stress profiles remain
  skipped by their existing opt-in guards.
- The final packaged native build passed 111 XTest cursor, pointer, editing,
  table-cell and Welcome-note checks after warm source crossings, plus six
  image checks proving same-node return, mapped resize controls, an 80 px drag,
  and exact source/dimension restoration with native Ctrl+Z. Its screenshot was
  visually inspected. The timing probes also preserve exact source each round.
- Lint, production/native builds, architecture and release-tool fixtures,
  feature-index and integrity checks pass. The Markdown documentation audit
  corrected the old claim that every image remount creates a fresh URL: file
  activation does; ordinary source returns now reuse the loaded element.
  Remaining matches describe current behavior or clearly dated measurements.

Complete logs, raw samples and the disposable harness are under
`/tmp/figaro-preview-retention`. Verification-owned app/display processes are
stopped after inspection.
