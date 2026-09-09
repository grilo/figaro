# Embedded Vale integration

Validated on 2026-09-08 against the pending changes after Figaro v1.38.0.

Figaro now compiles an adapted subset of Vale 3.20.0 into its Go backend. It
keeps the existing 27 rules and prose projection, initializes them in memory,
and reuses one engine. Normal builds no longer download a Vale executable;
runtime analysis neither extracts one nor launches a subprocess. Settings and
WebView locations are unchanged.

The integration removes the executable preparation command, cache installer,
checksum verification of cached executables, platform process launcher, and
build/workflow preparation steps. Source, provenance, maintenance instructions,
and the retained MIT notice live in [third_party/vale](../third_party/vale/README.md).
Release archives include the third-party notices. The root `LICENSE` is unchanged.

## Correctness and responsiveness

- All **72 pinned CLI fixtures** match every serialized alert field, including
  duplicate alerts, Unicode spans, messages, links, and action parameters. The
  fixture combines the 51 editorial cases, 20 package cases, and Unicode/CRLF
  case from the earlier prototype. A fresh checksum-verified download of the
  original Linux CLI reproduced all 72 baselines; the integrated engine matches
  them across repeated runs. This fixture tests preservation, not general
  editorial accuracy.
- All **51 editorial cases** pass through the production profiling adapter,
  including JavaScript checks, native rules, and result resolution.
- Backend tests with the race detector pass, including caller cancellation
  before an uncooperative analyzer stops, deadline/close behavior, pending
  replacement reclamation, rejected overflow, reuse after errors/panics,
  pre-cancellation, host-configuration isolation, literal filenames, and
  oversized input/output. Nested Vale tests cover intermediate match/block/alert
  limits and cancellation checkpoints. Go coverage is **76.2%**, above the
  72% required floor. Go vet passes.
- The frontend suite passes **2,140 tests** before the final packaging guard;
  the updated release metadata suite then passes all **9 tests**. Frontend lint
  passes. No editor behavior or visual controls changed.
- A production-tagged Linux Wails build, with an observation entry bundled via
  an overlay, ran against a disposable vault under its own Xvfb display. While
  a 4,500-paragraph native scan was pending, saving completed in **91 ms** and
  20 editor insertions reached the next animation frame in **15–32 ms** each.
  Cancellation returned in **1 ms**, and the same engine successfully analyzed
  the next note. These are observations on one host, not latency guarantees.
- The complete Windows amd64 application cross-builds with CGO disabled. The
  embedded harness also cross-builds for macOS arm64. Native platform CI runs
  both application contracts and the nested library tests.
- A syscall trace of the production analysis harness contained one initial
  `execve`, no network calls, no YAML/INI file accesses, and no filesystem writes.
  Ordinary Go runtime reads and thread creation remain. Dependency scanning of
  the writing package reported no known vulnerabilities at validation time.

## Performance

The production profiler uses a developer-only JSON-lines Go harness around the
actual application adapter, including its limits. This process exists only in
the measurement tooling; Figaro calls the engine directly. Rule initialization
took **48.8 ms** in this run. Median native analysis times across three runs:

| Workload | Words | Native analysis |
| --- | ---: | ---: |
| Ordinary prose with many suggestions | 1,000 | 14.2 ms |
| Ordinary prose with many suggestions | 10,000 | 255.6 ms |
| Technical names and punctuation | 10,000 | 166.4 ms |
| Unique numbered technical paragraphs | 25,007 | 897.0 ms |
| Unique numbered technical paragraphs | 50,014 | 3,544.7 ms |

The longer workload still requires substantial background work. These are
non-randomized observations on Linux amd64, Ryzen 7 9800X3D, Go 1.26.6, and Node
24.20.0. They do not measure Windows antivirus behavior or establish equivalence
to the historical prototype's differently bounded dense workloads.

Machine-readable results and the native observation are in
[the integration evidence](benchmarks/vale-integration-2026-09-08.json).
Reproduce the current full-scan profile with:

```sh
node scripts/profile-writing.mjs --long
```

## Limits and remaining platform validation

The coordinator retains one active request and one pending replacement. A
cancelled or timed-out caller returns promptly; the worker stops cooperatively
before another scan executes. Input/output are capped at 4 MiB, with additional
regex, block, and alert work limits documented in the vendored module. Exceeding
a limit fails the scan and keeps the existing retry UI available; it never
publishes a silently truncated success.

An in-process engine cannot provide the fatal-error containment of a separate
process. Segmentation, allocation, and already-running regex work cannot be
interrupted at an arbitrary instruction. These limitations are distinct from
the caller's prompt cancellation and the bounded admission queue.

Native Windows/macOS execution remains unverified here. In particular, only a
real managed Windows laptop can establish whether removing Vale extraction and
process startup resolves the observed antivirus delays. The change removes those
operations; it does not claim they were the sole cause of the earlier stalls.
