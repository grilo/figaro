# Native typing profile — 11 September 2026

The measured workload did not reproduce a large typing stall. Lenses and a
visible Mermaid diagram added a modest cost. A separate Chromium CPU profile
identified source-height measurement as the largest named application stack;
it is a concrete optimization candidate, not proof of the cause of the user's
remaining sluggishness. No performance tuning was applied during this profile.

[Raw samples, configuration, CPU summaries and native probe](typing-input-2026-09-11.json)
are retained alongside this report.

## Native input results

The production-tagged working tree ran in WebKitGTK 2.52.6 on Linux, with an AMD
Ryzen 7 9800X3D, an isolated 1280 × 1000 Xvfb display and software rendering.
XTest supplied actual native key events; the page verified `isTrusted`. All
840 characters arrived and were inserted, and editor focus remained intact.

The source had 560 numbered paragraphs / 12,320 words. The diagram variant had
20 Mermaid flowcharts / 12,620 words, with one rendered SVG in the typing
viewport. The right pane stayed open for all conditions to keep editor width
constant. English US and either all five lens groups or none were selected.
Standard editing ran twice in reverse condition order; Vim Insert ran once.
Each sample group contained 70 characters, including a 1.5-second pause after
the first 50 to exercise resumed typing while analysis can restart.

These times run from native **keydown to the next animation-frame callback**:

| Editing | Mermaid | Lenses | Keys | Median | p95 | Maximum |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Standard | Absent | Off | 140 | 5 ms | 7 ms | 13 ms |
| Standard | Absent | All five | 140 | 6 ms | 9 ms | 14 ms |
| Standard | Present | Off | 140 | 6 ms | 8 ms | 11 ms |
| Standard | Present | All five | 140 | 7 ms | 9 ms | 12 ms |
| Vim Insert | Absent | Off | 70 | 6 ms | 7 ms | 9 ms |
| Vim Insert | Absent | All five | 70 | 6 ms | 8 ms | 12 ms |
| Vim Insert | Present | Off | 70 | 6 ms | 8 ms | 10 ms |
| Vim Insert | Present | All five | 70 | 7 ms | 10 ms | 13 ms |

Sender-to-keydown delay was usually below the wall clock's 1 ms resolution;
the largest observed delay was 11.7 ms. Including delivery, the slowest
sender-to-frame sample was 18.7 ms. Raw samples also separate native input
processing, CodeMirror dispatch and the second animation-frame callback.

The native run retained here had no Chromium profiler running concurrently.
An earlier exploratory run that overlapped profiling is excluded.

## Where the main thread spends time

A separate Chromium devserver run sampled the main thread every 500 µs while
typing 76 characters with the diagram workload. Workers and the production
native bridge are not represented by that CPU profile. It identifies code
paths to investigate; its timings are not native WebKitGTK timings.

| Application stack | Lenses off | All five lenses |
| --- | ---: | ---: |
| Wrapped source-footprint refresh | 214 ms | 247 ms |
| Source measurement metrics, nested inside that refresh | 210 ms | 244 ms |
| Retained inline writing update | Not applicable | 40 ms |
| Diagram render callback | 34 ms | 35 ms |

These are inclusive sampled totals across roughly eight seconds, not one-key
durations; nested totals must not be added. Most of the sampled time was idle.

`frontend/js/sourceFootprint.js` schedules refresh on each document change. Its
microtask calls `sourceMeasurementMetrics`, which reads computed style and
`getBoundingClientRect()` after editor DOM updates, before checking whether
any footprint elements exist. The expensive samples sit in that layout read,
even though wrapped-source heights already have a cache. An appropriate next
experiment must account for layout pending from other DOM changes: the read
can pay that cost without having caused all of it. The proposed
experiment is to skip empty footprint work and reuse geometry until width,
font, source or mounted widgets change. Source/replacement height parity,
wrapping, pane resizing and cursor geometry must remain intact.

Retained writing underline mapping is a smaller measured cost. The profile
does not support rebuilding the lens engine as the first response to this
typing complaint. It also does not establish that every analysis operation is
paragraph-local: full Markdown projection and document-dependent checks still
exist in background analysis.

## Limits and reproduction

The profile covers this fast Linux desktop and synthetic repeated prose. It
does not measure physical keyboard scanout, completed screen presentation,
the user's exact note, Windows WebView2, macOS WKWebView, slow hardware, or all
chart types. One diagram was mounted; the other source blocks were outside the
viewport. The unobserved physical input/display portion may still matter.

The raw report includes the exact injected native probe and source generator.
Run it only in a disposable vault through a Go build overlay, using
`desktop,production,webkit2_41` tags and the freshly built frontend. Start an
isolated X server with a keyboard seat, focus only that owned application, and
watch its `.config/typing-ready-N.json` handshake. Send 70 characters from
`the team writes clear words ` repeated three times, at 60 ms intervals for
the first 50, pause 1.5 seconds, then use 100 ms intervals for the rest. Record
sender wall-clock timestamps; the probe writes `.config/typing-report.json`.
Never use a personal vault or the user's real desktop for this probe.

The next useful validation is the same measurement on the affected machine
and representative note, followed by an isolated before/after experiment on
the source-footprint measurement path. The current results narrow the search;
they do not establish that the remaining sluggishness is fixed.
