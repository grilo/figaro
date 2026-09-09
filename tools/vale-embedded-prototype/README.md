# Embedded Vale prototype

This historical experiment compiles Vale 3.20.0 into a Go program, loads Figaro's
YAML rules from `embed.FS`, and invokes the engine directly. The application now
uses the separately maintained [production integration](../../third_party/vale/README.md).
Running this experiment changes only its disposable workspace.

## Reproduce

From the Figaro repository root, after preparing its normal frontend assets:

```sh
bash tools/vale-embedded-prototype/run.sh
```

Requires Python 3, the repository's supported Node version, Go 1.26.6, and a host
C compiler for Go's race detector. The initial build downloads pinned Go modules
and an explicitly checksum-verified historical Vale CLI for comparison only;
normal application builds do not download or bundle that executable. Analysis
itself is offline. The script creates a fresh `/tmp/figaro-vale-embedded-*`
workspace and keeps the fork, binaries, projected samples, logs, and JSON report
there for inspection. It does not install a fork into the application or modify
the upstream Go module cache. Delete that specific workspace when finished.

`bootstrap.py` verifies upstream's module checksum before copying it, preserves
upstream notices, and refuses patches whose source anchors no longer match.
The `*.go.in` files become Go sources only in that disposable module. The added
facade resides inside the upstream module, where Go permits importing Vale's
`internal` packages. The project uses a temporary adapted copy, not a published
or supported upstream library API.

`run.sh` vets the facade and harness, runs the focused tests with the race
detector, builds a native Linux/host harness and Windows amd64/macOS arm64 cross
builds, then compares the engines. Cross compilation does not prove native
Windows/macOS startup, antivirus behavior, or Wails integration.

## What changes inside the temporary fork

- Add an in-memory loader for the 27 pinned standalone YAML rules and a serial,
  context-aware facade with the existing 4 MiB input ceiling.
- Force source text to remain text even if it happens to name an existing file.
  Skip global style-path initialization, including its implicit XDG directory
  creation, when global configuration is disabled.
- Add cancellation checkpoints around analysis stages and rule calls. Bound
  individual regex matches to 100 ms and contain rule panics in each worker.
- Add a `figaro_plaintext` build tag that excludes the two code/comment adapters
  importing tree-sitter's C parsers. Those entry points return explicit errors.
  Figaro already supplies projected prose, so they are not needed by this path.
- Initialize the rules once and reuse them across documents. The memory loader
  also bypasses upstream's process-wide GC tuning during filesystem style loads.

This loader supports the fixed Figaro rule set, not arbitrary Vale configuration,
inherited rules, dictionaries, script assets, or external markup converters.
Those additional paths have not been adapted or audited for in-process use.

## Evidence and scope

`samples.mjs` uses the current production Markdown-to-prose projection for 51
editorial fixtures, 20 additional package fixtures, five complete project
documents, three synthetic workloads near 1k/10k/50k words, and a Unicode/CRLF
case. No truncation or per-document finding cap is applied by the harness.
`compare.py` compares full serialized alert multisets, preserving duplicates:
rule IDs, ranges, messages, severity, links, descriptions, and action parameters.
It also checks that all three repeated runs of each engine agree. The CLI is the same pinned upstream release used by Figaro v1.38.0 and receives
the same projected strings and fixed configuration. Its download and extraction
occur in the disposable workspace, outside the timed analysis loop.

Engine timings are measured inside one process after rule initialization; CLI
timings include process startup. The JSON reports initialization separately and
records retained Go heap after GC, which is not peak memory or process RSS.
Timings are three-run observations on one host, not a statistical performance
claim. The fixtures test preservation, not editorial usefulness or AI authorship.

The focused tests cover host-configuration isolation, literal filename inputs,
cross-document state isolation, queued and active cancellation, a pathological
regex and worker reuse, concurrent callers, and oversized/pre-cancelled input.
Cancellation has a generous test ceiling, not a promised response time.

**This is not a production replacement.** Cancellation remains cooperative:
NLP processing, source mapping, allocation, and a regex already executing cannot
be interrupted immediately. Per-match limits do not establish a whole-request
hard deadline. A goroutine is not equivalent to a killable process, and panic
recovery does not contain fatal runtime errors or memory exhaustion. The
production integration adds lifecycle/shutdown wiring, request coalescing,
resource limits, and further regressions. Native Windows/macOS execution still
needs validation on those platforms.

Measured findings are in
[the prototype report](../../docs/VALE_EMBEDDED_PROTOTYPE.md).
