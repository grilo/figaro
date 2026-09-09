# Vale source embedded in Figaro

This is a locally adapted subset of Vale 3.20.0, compiled into Figaro through
the root module's `replace` directive. It exposes `embedded.New(fs.FS)` and
`Engine.Analyze(context.Context, string)`. Upstream keeps the engine behind
Go's `internal` boundary; this facade is maintained by Figaro and is not an
upstream-supported public API.

`SOURCE.json` pins the canonical module, revision, and module checksum.
`UPSTREAM_FILES.json` records the corresponding upstream hashes for retained
files and identifies Figaro additions. The upstream MIT notice is in `LICENSE`;
the application release also ships `THIRD_PARTY_NOTICES.md`.

## Included behavior

The library receives the existing Markdown-to-prose projection and loads the
27 pinned YAML rules from `internal/writing/styles` through `embed.FS`. It uses
the original plain-text linting, Unicode coordinate mapping, sentence splitting,
and six rule types: existence, substitution, conditional, consistency,
repetition, and occurrence. The JSON alert contract remains unchanged.

The CLI, executable assets, filesystem configuration loader, structured-data
views, markup converters, tree-sitter/C parsers, spelling dictionary package,
scripts, and unused rule implementations are omitted. Some upstream core and
NLP helpers remain to keep the adaptation small; the restricted facade never
exposes filesystem assets, custom configurations, remote NLP, or POS rules.
Source strings are always text, including strings naming existing files.
Rule errors report embedded asset names without opening host files.

## Execution contract

- Sentence data and rules initialize eagerly before readiness; scans run in
  memory without extracting files, discovering host settings, or starting
  another executable.
- Figaro's coordinator in `internal/writing/vale.go` admits one active scan and
  one pending replacement, reclaims cancelled pending snapshots, and returns
  promptly to cancelled/timed-out callers. The library serializes actual scans
  and runs at most two independent rules concurrently within a scan.
- Input and serialized output are limited to 4 MiB each. Intermediate work is
  limited to 65,536 regex matches per walk, 65,536 derived NLP blocks, and 32,768
  alerts. Regex matches have a 100 ms approximate timeout; match walks check a
  one-second budget every 64 matches. Crossing a limit returns an error and
  discards the scan, never a silently truncated successful result.
- Cancellation checkpoints cover lint stages, rule loops, block creation, and
  source mapping. Already-running segmentation, allocation, or regex work is
  cooperative; there is no process-level hard kill or isolation from fatal
  runtime errors. The application caller and shutdown do not wait for it.

## Updating the source

1. Download the selected canonical Go module into the Go module cache and
   verify its checksum and revision. Do not edit the cache. Compare retained
   files against `UPSTREAM_FILES.json` and the upstream source.
2. Review upstream changes and port the memory loader, restricted facade,
   fixed configuration, literal-text input, cancellation, error containment,
   and work limits. Keep converters and executable paths out of the dependency
   graph. Update the nested module and root module with `go mod tidy`.
3. Update `SOURCE.json`, the upstream file inventory, notices, root module pin,
   and `internal/writing.Version`. Rules have their own provenance and tests;
   changing engine version does not implicitly approve different rules.
4. Run `(cd third_party/vale && go test -race ./...)`, the root writing and
   desktop suites, and `node scripts/profile-writing.mjs --long`. Review every
   change to the 72-case CLI equivalence fixture. The optional historical
   prototype harness downloads a checksum-pinned CLI only into a disposable
   workspace; no normal build may download or embed it.
5. Cross-build Windows/macOS and exercise startup, typing, saving, cancellation,
   reuse, and shutdown in a native Wails webview. Keep the current limits and
   evidence in [the integration report](../../docs/VALE_INTEGRATION.md) accurate.

`scripts/check-go-coverage.sh` runs this nested module's tests separately; Go's
root `./...` pattern does not descend into nested modules.
