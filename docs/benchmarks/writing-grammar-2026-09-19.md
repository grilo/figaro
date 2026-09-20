# Curated grammar: native Figaro verification

Measured 19 September 2026 using the existing native writing engine, 15 selected Harper-port rules and six Figaro grammar checks. All six final application runs passed.

## Results

| Measurement | Before grammar expansion | With grammar expansion |
| --- | ---: | ---: |
| App ready (ms) | 1162.09 | 1153.86 |
| Native preparation (ms) | 58.00 | 121.00 |
| 1,001-word native check (ms) | 8.00 | 9.00 |
| 1,001-word full prose review (ms) | 36.00 | 40.00 |
| 10,010-word native check (ms) | 232.00 | 167.00 |
| 10,010-word full prose review (ms) | 327.00 | 270.00 |
| Unpacked binary (MiB) | 54.76 | 56.66 |
| Gzip bundle (MiB) | 18.93 | 19.39 |

Incremental size: **1.90 MiB unpacked / 0.46 MiB gzip**. Three interleaved fresh launches per build; startup ranges overlap. Larger-note timings happened to improve in these samples; this does not establish a general speed improvement. Initialization overlaps other startup work and is not additive.

The 1,001-word review produced 40 → 51 visible findings; the 10,010-word review produced 421 → 520. Each full review asserts nonempty evidence and renders the real bounded cards.

## Native workflow

- The pane offers “goes” for `She **go** to school.`; Apply preserves the Markdown and one keyboard Undo restores it.
- Ignore persists the distinct grammar rule identity in the disposable vault.
- Typing and exact disk saving succeed while native analysis is still pending.
- Cancellation rejects obsolete work promptly; the same engine analyzes the next request.
- Shutdown succeeds with native work pending; every launched application and its private display exits.
- No post-ready application-module requests occur.

## Method and limits

- **runsPerBuild:** 3
- **statistics:** Median of per-process medians for analysis; median of fresh-process startup times. OS file caches were not flushed.
- **scope:** Actual Wails/WebKitGTK production-mode app on a private headless Wayland display. Full prose review includes projection, native analysis, required worker resolution, real bounded card rendering and next animation frame. It excludes spelling. No private notes used.
- **startup:** Instrumented app process launch to all startup work ready; initialization overlaps worker startup.
- **sizes:** Separate uninstrumented stripped Linux x86-64 binaries, trimpath, production/webkit2_41; deterministic tar+gzip level 9, not a release installer.
- **coverage:** Native findings differ deliberately. This corpus measures cost, not general grammar accuracy.
- **nativeInput:** DOM interaction and CodeMirror keyboard events in the native webview, not hardware input injection.
- **earlierHarnessCorrection:** The previous Harper comparison omitted proseRequired on its resolve call. Its combined column excluded real review resolution (zero baseline findings); startup, isolated checks and sizes are unaffected.

Platform: `Linux-7.0.0-31-generic-x86_64-with-glibc2.43`. Native webview: `Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15 wails.io/605.1.15`. Windows/macOS runtime behavior was not measured.

The repository copy of the [raw results](writing-grammar-2026-09-19.json) contains the samples and source hashes. The input corpus, uninstrumented payloads, scripts, and complete logs are retained in `/home/grilo/benchmarks/figaro-grammar-integration-20260919`.

## Earlier benchmark correction

The previous Harper comparison omitted proseRequired on its resolve call. Its combined column excluded real review resolution (zero baseline findings); startup, isolated checks and sizes are unaffected.
