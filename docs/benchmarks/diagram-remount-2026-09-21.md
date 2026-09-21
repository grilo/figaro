# Prepared diagram return — 2026-09-21

Repeated source entry and viewport removal now retain measured source heights
and completed diagram SVG nodes. In the packaged Linux comparison, warm preview
return fell from 145 to 17 ms for Mermaid and 142.5 to 10 ms for Vega-Lite.
Vega-Lite held-arrow frame gaps improved; Mermaid held-arrow gaps stayed similar.
The [measurement data](diagram-remount-2026-09-21.json) contains every round's
summary, exact fixture sources, source/binary hashes and native acceptance checks.

## Implementation and boundaries

- Source heights survive replacement mounts under a per-editor limit of 256
  entries and 1 MiB estimated key/value data. Exact source, width and typography
  must match. Explicit typography refresh, completed/failed fonts and disposal
  clear retained values; loading fonts bypass retention.
- Completed diagram subtrees survive source reveal and viewport removal under
  a per-editor limit of 32 entries and 4 MiB estimated SVG/key/node data. These
  weights bound retained estimates, not measured browser heap. Each subtree
  transfers to one new mount; local SVG IDs remain unique. Wrappers, controls
  and observers are recreated and use current source positions.
- A connected wrapper checks the renderer's effective source, appearance,
  font/engine identity and responsive width before restoring the SVG. External
  or ambient-data Vega specifications cannot reuse a stale snapshot. Missing,
  failed, cancelled and invalidated output keeps the existing rendering path.
- Ordinary prepared returns reattach before paint without parsing SVG or
  waiting for the cold-render delay. Prepared Mermaid waits through active
  key repeat; Vega remains immediate. Active composition defers both. New or
  invalidated rendering still waits 120 ms after input/scroll activity and an
  idle opportunity. Running renderer work remains on the main thread.

`core/previewCache.js` owns pure eviction and one-time-transfer decisions.
CodeMirror/DOM adapters own measurement, graphic attachment, input observation
and disposal. The renderer exposes the same identity used by its output cache,
so the two caches do not maintain different validity rules. Whole-document
pre-rendering and a different diagram representation are outside this change.

## Native measurements

The baseline was built before this change from `f21faa5` plus the already
pending gutter/focus fixes. Both builds use GTK 3.24.52 / WebKitGTK 2.52.6,
production tags, software rendering and an isolated Xvfb display. A disposable
vault and configuration keep the settings identical. The app is 1280 × 800
inside a 1600 × 1000 display. No other builds/tests ran during timed probes.

Each fixture has 12 fenced blocks: five-line JavaScript, five-node Mermaid,
or a compact Vega-Lite specification with 24 bars. Every block is visited for
400 ms before measurement to prepare output. Ordinary return enters the first
block's source and leaves it eight times. The probe checks the SVG belonging to
that exact block, including whether it is the same node. Return time includes
the selection transaction and SVG-presence polling at 5 ms intervals; it is
not an input-to-display or paint timestamp.

| Ordinary prepared return | Before median | Final median | Same SVG retained | SVG parses, before → final |
| --- | ---: | ---: | ---: | ---: |
| Mermaid, 8 returns | 145 ms | 17 ms | 0/8 → 8/8 | 8 → 0 |
| Vega-Lite, 8 returns | 142.5 ms | 10 ms | 0/8 → 8/8 | 8 → 0 |

Held navigation uses actual native XTest input: ArrowDown for 2.8 seconds,
immediately ArrowUp for 2.8 seconds, repeated three times per fixture. X autorepeat
is 30 Hz after 180 ms. Every round delivers 158–160 keys, of which 156–158 are
repeat events. The following are each round's nearest-rank p95 frame gaps:

| Fixture | Before p95, three rounds | Final p95, three rounds | Ruler reads per round, before → final | SVG parses per round, before → final |
| --- | --- | --- | --- | --- |
| Code | 47 / 43 / 43 ms | 44 / 43 / 46 ms | 15 / 13 / 13 → 0 / 0 / 0 | 0 / 0 / 0 → 0 / 0 / 0 |
| Mermaid | 52 / 50 / 51 ms | 51 / 52 / 52 ms | 0 / 0 / 0 → 0 / 0 / 0 | 2 / 3 / 3 → 0 / 0 / 0 |
| Vega-Lite | 74 / 76 / 72 ms | 51 / 49 / 50 ms | 13 / 13 / 13 → 0 / 0 / 0 | 3 / 4 / 3 → 0 / 0 / 0 |

Vega-Lite's median round p95 falls from 74 to 50 ms, about 32%. Mermaid and
code frame gaps show no meaningful improvement. Mermaid uses its fixed preview
height and already needed no wrapping ruler. Its main benefit here is the
ordinary return delay and eliminated SVG parsing. Key-handler p95 remains
4–7 ms across all before/final rounds; these measurements do not establish an
improvement in synchronous key handling. All source text remained exact.

An intermediate implementation restored both renderers during key repeat.
Mermaid's p95 then rose to 89–92 ms; a fitting-only experiment did not resolve
that regression. Deferring prepared Mermaid attachment restored its prior frame
behavior. Applying that deferral to Vega removed Vega's measured gain, so the
final policy distinguishes the renderers. These experiments implicate live SVG
attachment/layout work but do not isolate a particular browser subsystem.

This is a small sequential before/after sample on one software-rendered native
webview with a coarse clock. It establishes removed work and the observed
return/frame changes, not universal smooth scrolling, 60 fps, or physical
keyboard latency. Windows WebView2, macOS WKWebView and hardware-accelerated
affected laptops were not measured. Cold diagrams, cache eviction, genuine
input changes, native selection and SVG layout still cost work.

## Verification

- Full frontend coverage passed 320 suites / 2,992 tests: 83.90% statements,
  72.86% branches, 83.98% functions and 87.32% lines, above all floors. After
  narrowing the repeat guard to Mermaid, all 93 affected tests passed again.
  Cases cover remount ownership and IDs, mapped edits, cancelled mounts,
  bounded eviction, source/width/font/theme/engine invalidation, external data,
  key repeat and composition. Existing error and cold-render checks pass.
- Three affected browser scenarios passed: math/diagram cursor and pointer
  behavior, source-footprint geometry including first-paint restored SVG fit,
  and printable Mermaid/Vega/Vega-Lite output with cover and contents. The
  assembled production-startup/font-loading scenario also passed.
- The exact final native build passed 90 XTest cursor/pointer/edit checks around
  code, tables, Mermaid, Vega-Lite and images. Six further checks prove restored
  Mermaid identity, current mapped resize controls, an 80 px native drag, and
  Ctrl+Z restoring exact source and footprint. The captured app was visually
  inspected. Timing probes additionally assert source preservation every round.
- Lint, production and native builds, architecture/release-tool fixtures,
  feature-index and test-integrity checks pass. The changelog and affected
  Markdown contracts describe retention, invalidation and the repeat guard.

Complete logs, raw samples, exploratory runs and the disposable harness are
under `/tmp/figaro-diagram-remount`. The repository JSON retains the final
comparison and acceptance evidence. All app/display processes owned by this
verification are stopped after inspection.
