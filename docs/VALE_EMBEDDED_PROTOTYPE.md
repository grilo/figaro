# Embedded Vale prototype

Historical evaluation on 2026-09-08 against Figaro v1.38.0 (`61a28af`), which used
its cached Vale CLI adapter. The current source now integrates the engine;
see the [integration report](VALE_INTEGRATION.md) for its additional safeguards
and validation. Measurements below describe the original isolated experiment.

## Result

Compiling Vale into a Go program is viable. The prototype loads all 27 bundled
rules from memory, reuses the initialized engine, and preserves the CLI's full
alerts on all 80 samples. Removing process startup makes the largest difference
on short notes. Long-document analysis remains costly.

The prototype is ready to inform integration work, but is not a production
replacement. It has cooperative cancellation rather than process-level hard
termination, and native Windows/macOS behavior remains untested.

## Measurements

Linux amd64, AMD Ryzen 7 9800X3D (8 cores / 16 threads), Go 1.26.6, CGO disabled
for the harness, Vale 3.20.0. Three runs per sample; medians below. Rule
initialization took **26.3 ms** and is excluded from embedded scan times. CLI
scan times include starting the existing executable and loading its rules;
initial extraction is outside the measurement. Runs were sequential on one
machine, not randomized or a statistical benchmark.

| Projected text | Words | Existing CLI | Reused embedded engine |
| --- | ---: | ---: | ---: |
| README | 847 | 111.5 ms | 5.8 ms |
| Synthetic prose | 1,008 | 125.1 ms | 6.3 ms |
| Synthetic prose | 10,008 | 275.4 ms | 146.7 ms |
| Architecture document | 23,185 | 1,499.0 ms | 1,334.7 ms |
| Project behavior document | 38,417 | 3,588.1 ms | 3,468.7 ms |
| Synthetic prose | 50,004 | 3,917.0 ms | 3,561.7 ms |

The reused harness retained **10.9 MiB of Go heap after GC** at the end of the
comparison. A separate three-scan 50k workload peaked at **134.3 MiB process RSS**,
including the runtime, executable pages, engine, and collected output. These
are different measures; neither establishes memory usage inside Wails.

The data and individual repetitions are in
[the benchmark JSON](benchmarks/vale-embedded-2026-09-08.json).

## Correctness and execution evidence

- **80/80 exact matches:** 51 editorial fixtures, 20 package fixtures, five whole
  project documents, three synthetic workloads, and a Unicode/CRLF case. Both
  engines receive the same production prose projection. Every serialized alert
  field is compared as a multiset, including duplicates, with all three repeats
  stable. There are 22,253 raw alerts across the sample set, mostly synthetic.
- **Seven focused tests pass with the race detector:** literal filename inputs,
  host configuration isolation, cross-document acronym/consistency state,
  queued/active cancellation, regex failure/reuse, concurrent callers, and input
  limits. Vet passes for the facade and harness.
- **Cancellation probe:** cancellation requested at 20 ms returned at 27.4 ms
  on a roughly 850 KiB, many-paragraph note; the same engine then analyzed another
  note. This measures that workload, not every possible analysis stage.
- **Pathological regex probe:** a 100 ms per-match limit produced a caught timeout
  after 147.7 ms, with worker reuse afterward. The regex clock is approximate.
  Recovery sits inside concurrent rule workers as well as the calling goroutine.
- **No helper executable or rule extraction in the observed run:** a Linux
  syscall trace contained only the harness's initial `execve`, no network calls,
  no YAML/INI file accesses, and no filesystem writes. The input JSON file and
  ordinary runtime reads are outside the in-memory rule-loading claim.
- **Pure Go builds pass:** native Linux amd64, cross-compiled Windows amd64 and
  macOS arm64. These are standalone prototype builds, not packaged Wails tests.

This measures preservation of existing suggestions. It does not judge editorial
usefulness, prove Windows antivirus caused earlier delays, or measure typing
latency in Figaro's native webview.

## Adaptations needed

Vale keeps its engine behind Go's `internal` import boundary. The disposable
fork adds a small facade inside that module and retains upstream's notices.
The source module and its checksum are pinned; no upstream fork was published.

The new loader reads the existing standalone rules from `embed.FS`, bypasses
filesystem style loading and its global GC tuning, and skips global style-path
initialization. The latter otherwise calls an XDG helper that can create a host
data directory even with global configuration disabled. Source text is also
forced to remain text, since Vale normally treats a string matching an existing
filename as a file to read.

The initial cross-build pulled in C/tree-sitter parsers through two code/comment
adapters. A `figaro_plaintext` build tag excludes those adapters and makes their
entry points return explicit errors. Figaro already projects Markdown to plain
prose before invoking Vale; the existing plain-text analysis path is preserved.
This does not create a general-purpose replacement for Vale's other formats.

## Integration requirements identified by the experiment

1. Carry cancellation further into NLP and source-mapping stages, and verify
   adversarial long paragraphs and individual rule costs. Per-match regex limits
   do not provide a whole-request hard deadline; cancellation cannot immediately
   interrupt allocation or an already executing stage. Panic recovery cannot
   contain fatal runtime errors or memory exhaustion as a separate process can.
2. Bound memory, output size, and work admission. The facade serializes callers,
   but production needs the existing newest-request coalescing, cancellation,
   stale-result handling, and shutdown lifecycle. The prototype keeps complete
   outputs for comparison; the dense 50k sample exceeds the production CLI
   adapter's 4 MiB response cap. This is engine equivalence, not proof that this
   sample succeeds through today's complete application adapter.
3. Keep the API restricted to trusted bundled rules, or adapt and audit additional
   asset/configuration paths before allowing them. This prototype does not expose
   user-supplied styles, script assets, inherited rules, or markup converters.
4. Run native Windows/macOS and assembled Wails startup, typing, save, cancellation,
   and shutdown checks. The Windows build removes the separate Vale executable;
   only a real managed Windows machine can establish its antivirus benefit.

The code and reproduction command are in
[tools/vale-embedded-prototype](../tools/vale-embedded-prototype/README.md).
That reproduction still keeps its temporary source and generated binaries outside
the application module. Production uses the separately adapted source under
`third_party/vale`; its behavior and changelog are maintained independently of
these historical measurements.
