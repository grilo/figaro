# Held-key style invalidation — 2026-09-25

## Question

Holding an arrow key stuttered on a slower, antivirus-loaded Windows laptop.
Earlier native probes blamed the per-key cursor-visibility layout read. This
measurement separates script, style, layout and paint before changing anything.

## Method

Chromium through Playwright (the WebView2 engine on Windows), the production
frontend served by `cmd/devserver`, and a 250-line note with headings, wrapped
prose, lists, fenced code, tables and display math. CPU throttling at 4×
approximated the slower machine. A keydown for ArrowDown was dispatched every
33 ms (30 Hz repeat) 150 times from the top of the note. Long-animation-frame
entries, a CPU profile and a `devtools.timeline` trace (`UpdateLayoutTree`
duration and `elementCount`, `Layout`, `Paint`) were recorded per run. The probe
lived outside the repository; it is described here so it can be rebuilt.

## Findings

Unthrottled, frames already met 16.7 ms. At 4× the handler, not layout,
dominated: `Selection.collapse` (CodeMirror placing the native caret) carried
64% of script time because it forced a synchronous style recalculation. The
trace showed 3,830 ms of style recalculation touching 280,253 elements for
150 keys, about the whole application per pass, against 383 ms of layout. Each
key changed only about five editor nodes.

Twelve `:has()` rules had `#app` or another high ancestor as their subject.
Any DOM change inside `#app` made the engine re-check them and restyle the
application. The status bar's Ln/Col text and the editor's own line updates
changed on every key. Pure-writing presentation also rewrote inherited custom
properties on the editor root, with identical values, on most cursor moves.

## Controlled comparison (4× throttle, same session)

| Variant | p95 frame gap | Worst frame | Handler p50 / p95 | Style ms | Elements restyled |
| --- | --- | --- | --- | --- | --- |
| Before | 66.6 ms | 150 ms | 18.0 / 38.8 ms | 3,830 | 280,253 |
| Ln/Col outside `#app` | 33.4 ms | 100 ms | 14.5 / 29.6 ms | 1,894 | 107,815 |
| + Pure-writing writes deduplicated | 16.8 ms | 50 ms | 11.8 / 18.6 ms | 1,305 | 107,689 |
| + ancestor `:has()` rules removed | 16.8 ms | 33 ms | 4.6 / 9.7 ms | 426 | 18,161 |
| Implemented fix, two runs | 16.7–16.8 ms | 50–67 ms | 4.2–5.4 / 9.8–14.8 ms | 388–416 | 17,858–19,998 |

The implemented fix replaces the six rules whose subject was `#app` with state
attributes maintained by `workspaceChromeState.js` and makes Pure-writing skip
unchanged root writes. The remaining `:has()` rules have small subjects (top
bar, status-left, sidebar, segmented controls) that an editor keystroke never
touches.

## Limits

This is Chromium with simulated CPU throttling, not the affected laptop,
WebKitGTK or WKWebView. Frame gaps vary between runs; element counts are the
stable signal. The cursor-visibility layout read and source-footprint
measurement each remain under about 10% of the remaining work and were left
unchanged.
