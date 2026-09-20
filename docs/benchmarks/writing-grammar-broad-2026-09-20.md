# Broad English grammar expansion — 20 September 2026

This is the historical policy-5 snapshot. The [subsequent usage batch](writing-grammar-usage-2026-09-20.md) adds noun-subject agreement and amount checks; the counts and remaining gaps below describe this earlier build.

## Scope and method

This batch adds 60 selected checks, increasing Proofreading from 54 to 114 rule IDs (15 Vale-port rules and 99 pure Go checks). The [grammar contract](../WRITING_HARPER.md#broad-phrase-and-mechanics-coverage) lists all 60 additions and their reviewed boundaries. It also expands selected affect/effect contexts and prevents a split-word correction from competing with generic pronoun/verb agreement at the same occurrence. Grammar policy is 5; mapping is 18.

Rules with similar matching and replacement needs share an eagerly built phrase index and bounded context checks. They do not add a runtime, executable, network dependency or worker. The shared regression fixture now contains 355 positive and 683 valid/ambiguous examples: this batch adds 119 and 234 respectively. Every single-error positive must produce only its intended grammar finding; every offered correction must leave no grammar finding.

## Behavioral comparison

The production Go adapter and official native Harper 2.10.0 language server received the same 894 inputs in the 60 new families plus the existing NounVerbConfusion family. Native Harper used its default rules with spelling disabled, Markdown parsing, and English isolation disabled. Counts below track the corresponding target rule, excluding other Figaro writing providers.

| Corpus | Cases | 54-check Figaro | 114-check Figaro | Native Harper |
| --- | ---: | ---: | ---: | ---: |
| reviewed / positive | 149 | 30 | 149 | 141 |
| reviewed / negative | 280 | 0 | 0 | 75 |
| upstream / positive | 373 | 40 | 210 | 365 |
| upstream / negative | 92 | 0 | 0 | 5 |

Negative columns count flagged valid/ambiguous cases; zero is desired. Expanded Figaro produced no grammar finding of any kind on either retained negative set. Native findings are a comparison, not a correctness oracle. The additional 16 ambiguity regressions were first reproduced as bad Figaro corrections, then fixed while retaining every reviewed positive. They protect literal noun phrases, mathematical variables, rubric terms, weather-related wording and auxiliary contexts.

The 465 upstream rows were mechanically extracted from literal Rust and Weir tests, including phrase-set and closed-compound families. This is a regression comparison, not a held-out accuracy estimate. The expanded matcher detects 210 of 373 upstream-positive cases; broader parsing, unselected spelling variants, ambiguous phrase meanings and contexts outside the reviewed guards remain gaps. Some upstream positive examples have more than one error, and native fixes can be disputed. Product Markdown masking and exact-span guards may further withhold plain-input findings or actions. The JSON records per-family results; the external comparison retains complete diagnostics and available native actions.

Reviewed phrase mappings are adapted from the pinned Harper source. The [provenance manifest](../../internal/writing/grammar/SOURCE.json) recorded Apache-2.0 attribution, the archive pin, 94 source/test hashes, and all 93 additional Go rule IDs beyond the original six at this snapshot. The current manifest also includes later additions. No native Harper executable or Rust source is bundled.

## Whole-document review

The same six frozen Markdown documents were replayed through all bundled JS providers, native Go, real English dictionaries, Markdown projection and the combined resolver. Existing finding ranges, messages and offered edits are unchanged. Two findings are added; none are removed.

| Document | Visible findings before → after | Review cards before → after |
| --- | ---: | ---: |
| serve-static | 63 → 63 | 44 → 44 |
| p-map | 33 → 33 | 26 → 26 |
| workshop | 17 → 17 | 17 → 17 |
| garden | 15 → 15 | 14 → 14 |
| service-note | 10 → 12 | 9 → 11 |
| walk | 12 → 12 | 12 → 12 |

The two added edits are correct in the complete service-note context: “look forward to meet” → “look forward to meeting” and “more cheaper” → “cheaper.” Detection of pre-annotated errors rises from 15/20 to 17/20 overall, or 15/19 to 17/19 after excluding the deliberately masked quotation. The technical manuals and valid garden note gain no findings.

The remaining eligible seeds are “The spare chairs is” and “fewer time”; these require additional agreement/countability coverage. The masked quotation remains excluded. Previously recorded unsafe technical spelling alternatives (25 edits at 17 occurrences) and duplicate advice are unchanged. This batch does not resolve those other-provider issues or turn the six documents into an independent-human accuracy pilot. See the [earlier complete editorial review](writing-documents-2026-09-20.md) for those judgments and source/license provenance.

## Packaged Linux verification

Six fresh packaged Wails/WebKitGTK launches, three per build in alternating order, ran on a private 1280×800 Weston/pixman display with disposable vault/configuration/cache directories. All six passed full review/rendering, Markdown-safe Apply, keyboard Undo, persisted rule-specific Ignore, twelve edits and a disk save while analysis remained pending, cancellation/reuse, eager module readiness, and shutdown with work in flight. The expanded build exercised “I look forward to **meet** you”; the baseline exercised “**Your** welcome.”

The saved pre-batch baseline predates other pending editor changes. The packaged comparison aligns those non-grammar files and vendored assets with the expanded build; the only remaining runtime-source differences are this grammar batch. A first baseline run was interrupted by the harness before completing the initial pair to make this alignment. Its artifacts are retained under `runs/initial-*`, outside the table. The plain Go/document comparisons use the original snapshot; editor UI changes do not participate in those pipelines.

The QA instrumentation is confined to external snapshots. Production-size binaries contain no BenchmarkReport symbol. Native UI events use DOM/CodeMirror input and keyboard events, not physical hardware input. Full coverage/build jobs owned by this task finished before the timing runs; unrelated system workloads were not controlled. Windows/macOS runtime behavior remains unmeasured.

| Measure | 54-check baseline | 114-check build |
| --- | ---: | ---: |
| Process launch to app ready, median | 2162.8 ms | 2339.2 ms |
| Ready range, three launches | 1815.4–2712.2 ms | 1993.1–2526.0 ms |
| Native initialization, median | 259.0 ms | 258.0 ms |
| Full review + render frame, 1001 words, pooled median | 98.5 ms | 97.0 ms |
| Full review + render frame, 10010 words, pooled median | 560.5 ms | 597.0 ms |
| Production binary | 59,573,576 B | 59,631,944 B |
| Deterministic gzip-9 binary tar | 20,386,899 B | 20,416,062 B |

The batch adds **57.0 KiB unpacked / 28.5 KiB gzip**. Review samples use identical 1,001/10,010-word prose, discard the first warm-up, and pool four remaining full-review samples per size per launch. Timings are local observations, not a general speed or latency guarantee.

## Evidence and reproduction

[The checked-in JSON](writing-grammar-broad-2026-09-20.json) includes comparison counts, per-rule upstream results, document differences, six native reports, binary sizes/hashes, runtime source hashes and verification-input hashes. Complete source snapshots, corpora, native diagnostics/actions, binaries and scripts are external at `/home/grilo/benchmarks/figaro-grammar-broad-20260920`.

The external `scripts/corpus_compare.py` rebuilds the two Go adapters and replays the native corpus. `scripts/prepare-native.py`, `build-release.py` and `align-baseline.py` record one-time snapshot preparation and baseline alignment; they are not repeatable in place. An initial `build.py` vendoring attempt failed because the dependency symlink changed esbuild importer identity. Vendoring in the real checkout passed and reproduced the captured assets byte-for-byte; the final builds verify those captured assets. `scripts/run.py baseline,grammar 3 <new-label>` replays the completed QA binaries; `scripts/report.py` verifies source hashes and regenerates this report from `isolated-*` runs.

Verification passed: 300 frontend suites / 2,561 tests with coverage (83.35% statements, 71.82% branches, 83.54% functions, 86.89% lines); all Go packages with 77.0% statement coverage against the 72% floor; writing/desktop and nested Vale race checks; lint, integrity/architecture, fixture equivalence, feature-index and whitespace checks; the Chromium production-startup boundary; and Windows amd64/macOS arm64 writing-test cross-compilation. Go and frontend tests consume the same reviewed grammar corpus and generated production bridge.
