# English grammar context expansion — 19 September 2026

This third batch expands noun/verb and its/their/your contexts and adds five pronoun/question checks. At this stage, Figaro enabled 15 selected Vale-port rules and 39 pure Go checks (54 IDs). The baseline is the complete pending 49-check implementation captured before this batch. Both snapshots preserve the other pending editor, spelling, session, and history work.

## Behavioral comparison

The same inputs were sent to the production Go adapter and the official native Harper 2.10.0 language server. Harper used its default rules with spelling disabled, Markdown parsing, and English isolation disabled. Figaro results retain only Harper/FigaroGrammar alerts and count the corresponding target rule; they do not measure the combined coverage of every Figaro provider.

| Corpus | Cases | Baseline Figaro | Expanded Figaro | Native Harper |
| --- | ---: | ---: | ---: | ---: |
| reviewed / positive | 120 | 38 | 120 | 90 |
| reviewed / negative | 209 | 5 | 0 | 40 |
| upstream / positive | 361 | 125 | 248 | 347 |
| upstream / negative | 184 | 0 | 0 | 1 |

The reviewed rows include existing cases in the selected areas. Across the complete shared regression fixture, this batch adds 83 positive examples and 133 valid/ambiguous examples: 218 positive and 422 valid rows overall. Every single-error positive must produce exactly its intended grammar finding, and every offered correction must leave no grammar finding. Negative columns count cases flagged by the corresponding rule, so zero is desired.

| Target check (upstream positive cases) | Cases | Baseline | Expanded | Native Harper |
| --- | ---: | ---: | ---: | ---: |
| CompoundSubjectI | 9 | 0 | 9 | 9 |
| DoIAdjective | 12 | 0 | 12 | 12 |
| HavePronoun | 4 | 0 | 4 | 4 |
| ItsContraction | 28 | 9 | 19 | 27 |
| ItsPossessive | 20 | 7 | 16 | 20 |
| MultipleSequentialPronouns | 3 | 0 | 2 | 3 |
| NounVerbConfusion | 100 | 12 | 40 | 97 |
| PossessiveYour | 3 | 1 | 1 | 2 |
| SubjectPronoun | 10 | 0 | 10 | 10 |
| TheirToThere | 51 | 22 | 43 | 51 |
| TheirToTheyre | 43 | 20 | 30 | 36 |
| ThereToTheir | 32 | 25 | 28 | 31 |
| TheyreToTheir | 31 | 23 | 27 | 30 |
| YourPredicateAdjective | 15 | 6 | 7 | 15 |

The 545 upstream rows were mechanically extracted from literal Rust and Weir regression tests for the fourteen selected families. This is a regression comparison, not a held-out accuracy evaluation. Upstream positive labels do not establish that a proposed correction is correct English. No arbitrary dataset or entire-project parsing coverage is claimed.

Remaining gaps include semantic effect/affect choices, dialect-dependent noun/verb spelling, casual ur/ya/yr substitutions, broader clause parsing, and ambiguous object or gerund phrases. Reviewed examples preserve psychological affect, weighting samples, “effect change,” “tell me they left,” “give me it,” possessive gerunds, and proper-name modifiers. Adjacent-pronoun advice has no automatic replacement.

Native Harper can also produce poor or disputed corrections in valid contexts; its findings on the reviewed valid rows are included above. Expanded Figaro produced no grammar finding on either retained negative set. Corrections that differ from the upstream corrected string are retained in the raw comparison for review; multi-error examples may receive only one of their corrections. Figaro’s product projection additionally withholds blocks with masked code, quotes, or technical text, so visible product coverage can be lower than this plain-input Go comparison.

The native reference archive, source/test hashes and Apache-2.0 provenance are recorded in [SOURCE.json](../../internal/writing/grammar/SOURCE.json). Native Rust source or an executable is not bundled into Figaro.

## Packaged Linux verification

Six fresh packaged Wails/WebKitGTK launches (three per snapshot, alternating order) ran on an isolated 1280×800 Weston/pixman display. Every run passed full review/rendering, Apply preserving Markdown, keyboard Undo, persisted rule-specific Ignore, twelve edits and a disk save while analysis remained pending, cancellation/reuse, eager module readiness, and shutdown with work in flight. The expanded build exercised “My mother and **me** went home”; baseline exercised its existing “**Your** welcome” correction. No private-display processes were retained.

An earlier set of attempts ran concurrently with full coverage verification. One unchanged-baseline run hit the existing native analysis deadline before its 10k-word measurement, and another baseline launch took about 61 seconds to become ready. Those attempts are retained under `runs/final-*` and in the JSON, and excluded from the isolated timing table. After coverage finished, the complete pairs were rerun without concurrent test/build workloads. This does not establish performance or timeout behavior under arbitrary system load.

This harness adds instrumentation only to external QA snapshots; size measurements use separately built production binaries with no BenchmarkReport symbol. Native events were delivered through DOM/CodeMirror keyboard/input events, not physical hardware input. No editor geometry or decoration implementation changed in this batch. Windows/macOS runtime behavior remains unmeasured.

| Measure | 49-check baseline | 54-check build |
| --- | ---: | ---: |
| Process launch to app ready, median | 1276.6 ms | 1213.0 ms |
| Ready range, three launches | 1225.2–1282.7 ms | 1205.3–1221.4 ms |
| Full review + render frame, 1001 words, pooled median | 42.0 ms | 44.5 ms |
| Full review + render frame, 10010 words, pooled median | 288.0 ms | 301.5 ms |
| Production binary | 59,491,656 B | 59,524,424 B |
| Deterministic gzip-9 binary tar | 20,365,170 B | 20,375,033 B |

Increment over the 49-check baseline: **32.0 KiB unpacked / 9.6 KiB gzip**. Timing samples include warm full-review runs with 1,001/10,010-word shared prose. Small timing differences are observations from this machine, not a general speed claim.

## Evidence and reproduction

[The checked-in JSON](writing-grammar-context-2026-09-19.json) contains the six native reports, raw timing samples, comparison counts, binary hashes, runtime source hashes and verification-input hashes. The full corpus, native diagnostics/actions, snapshots, binaries and orchestration scripts are stored locally at `/home/grilo/benchmarks/figaro-grammar-context-20260919`. These external files are not release assets.

Run the repository grammar verification commands in [the grammar contract](../WRITING_HARPER.md#verification-and-maintenance). The external `scripts/corpus_compare.py` rebuilds both Go adapters and replays the pinned native comparison; `scripts/build.py` and `scripts/instrument.py` record the initial clean-snapshot build steps, and `scripts/final-native.py` records the final Go update and instrumentation removal. They mutate their external snapshots and are not repeatable in place. Replay the verified binaries with `scripts/run.py baseline,grammar 3 <new-label>`. `scripts/report.py` verifies runtime source hashes and regenerates this summary from the recorded `isolated-*` runs. Final verification passed: all 290 frontend suites / 2,410 tests with coverage; all Go packages with 77.7% statement coverage; writing/desktop and nested Vale race checks; whole-repository lint and integrity/architecture checks; the Chromium production-startup boundary; and Windows amd64/macOS arm64 writing-test cross-compilation.
