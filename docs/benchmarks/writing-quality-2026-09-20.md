# Writing quality follow-up — 20 September 2026

## Scope and method

This change addresses four tasks: unsafe spelling suggestions in the known
sample, noisy or duplicate advice, broader contexts in existing grammar
families, and evaluation on fresh documents. The rule inventory stays at **175
IDs**. Grammar policy advances from 6 to 7, mapping 19 to 20, editorial policy
4 to 5, and spelling vocabulary 2 to 3; provider versions are unchanged.

The six earlier documents and focused examples informed implementation. A
separate eight-document sample was frozen at **08:46:31 UTC**, before behavior
changes. Runtime inputs were frozen at **09:13:09 UTC**, before the first fresh
engine run. Their hashes still match the repository after evaluation. Fresh
results did not prompt further behavior changes in this batch.

Both document runs use the production Markdown projection, bundled JS providers,
actual US/UK dictionaries, native Go engine and combined finding resolver, with
all lenses enabled and no personal dictionary or saved decisions. Each visible
occurrence and each offered replacement has a separate judgment in the
[JSON ledger](writing-quality-2026-09-20.json). Judgments are agent-authored,
with no independent human adjudication. An unnecessary warning can have a
meaning-changing replacement; the two counts must not be conflated.

## Known-document regressions

| Measure, six documents / 2,119 prose words | Before | After |
| --- | ---: | ---: |
| Visible occurrences | 154 | 95 |
| Clear errors correctly identified | 19 | 19 |
| Useful optional advice | 10 | 10 |
| Unnecessary advice | 115 | 63 |
| Misleading advice | 10 | 3 |
| Offered replacement choices | 44 | 19 |
| Unsafe replacement choices | 25 | **0** |
| Occurrences offering unsafe choices | 17 | **0** |

All **19 eligible annotated errors** remain detected; the twentieth annotated
error is deliberately inside a protected quotation. The four errors found by
preceding grammar work are already present in this batch's baseline. These
numbers are development-regression evidence, not fresh accuracy measurements.

Recognition-only vocabulary protects terms such as async, dotfiles, etags and
fallbacks. Lower-camel identifiers and acronyms defined in visible prose stop
producing spelling alarms. A generated English suggestion cannot merely remove
a terminal `s` from a dictionary-unknown word. Recognition does not authorize a
rewrite or add words to the user's dictionary.

Advice now respects selected technical senses, literal end-of-day instructions
and adjectival emotional states. Balanced multiline punctuation is checked
within its visible block. Equivalent “there is/are” advice shares one finding
across Plain language and Directness, retaining both sources, independent lens
selection and existing occurrence Ignore decisions. The detailed boundaries and
positive controls are in the [quality contract](../WRITING_CORPUS_FIXES.md#september-quality-follow-up).

## Grammar comparison

Twenty-nine existing families gain bounded complements, intervening modifiers,
questions, phrase variants and countability contexts. The shared regression
corpus now has **554 positive and 1,000 valid/ambiguous examples**, increases of
86 and 95. Single-error positives require the intended finding and a stable
correction; valid examples must remain free of grammar findings. The
[grammar contract](../WRITING_HARPER.md#broader-contexts-and-quality-follow-up)
lists the families and exclusions.

The actual before/after Go adapters and native Harper 2.10.0 received the same
1,112 comparison inputs. Upstream inputs are unchanged from the preceding
usage comparison; authored regression inputs include this batch's additions.

| Corresponding rule detected | Cases | Before | After | Native Harper |
| --- | ---: | ---: | ---: | ---: |
| Authored / positive | 204 | 121 | 204 | 182 |
| Authored / valid or ambiguous | 329 | 1 | 0 | 100 |
| Upstream / positive | 409 | 217 | **308** | 399 |
| Upstream / negative | 170 | 0 | 0 | 7 |

Negative columns count flagged cases, so zero is desired. Current Figaro emits
**no grammar finding of any kind across all 499 comparison negatives**. The
baseline's false alarm on “an information based system” is corrected; a
similar software-modifier regression is also retained in the shared fixtures.

This measures corresponding-family coverage, not correctness of every upstream
label or parity with Harper. Some upstream positives propose changes to valid
wording; broader parsing and uncertain meanings remain excluded. Independently
authored noun-subject examples do not have an equivalent Harper rule ID.
Product Markdown masking can withhold additional findings or edits. No Harper
executable or new runtime dependency is bundled.

## Fresh documents

The [manifest](../../tests/fixtures/writing-quality-documents/manifest.json)
records exact source/license hashes and normalization. Four published documents
cover technical reference (p-limit and p-retry), practical public guidance
(GOV.UK passports), and educational prose (NOAA ocean color). Four original
agent-authored documents cover a repair-library narrative, station handover,
orchard narrative and exhibition planning. Two originals contain six
pre-annotated errors; the other two were written as acceptable prose. Published
text has no seeded errors, which does not mean it is error-free.

The technical manuals share an author/package family with the earlier p-map
sample. The other sources and prose are new to this task. The sample is small,
mostly edited prose, and is not independent human gold.

| Document | Prose words | Visible before | Visible after |
| --- | ---: | ---: | ---: |
| p-limit | 527 | 54 | 39 |
| p-retry | 642 | 49 | 39 |
| NOAA ocean explanation | 94 | 2 | 2 |
| GOV.UK passport guidance | 291 | 9 | 9 |
| Repair-library draft | 296 | 10 | 10 |
| Station handover draft | 280 | 11 | 10 |
| Orchard narrative | 281 | 6 | 6 |
| Exhibition guidance | 276 | 4 | 4 |
| **Total** | **2,687** | **145** | **119** |

| Reviewed outcome | Before | After |
| --- | ---: | ---: |
| Clear errors identified | 3 | 3 |
| Useful optional advice | 4 | 4 |
| Unnecessary advice | 126 | 100 |
| Misleading advice | 12 | 12 |
| Offered replacement choices | 26 | 18 |
| Safe replacement choices | 4 | 4 |
| Unsafe replacement choices | 22 | **14** |
| Occurrences offering unsafe choices | 14 | **6** |

The 14 remaining unsafe choices are ten alternatives for two `args`
occurrences, two `backoff` → `kickoff` choices, `Ctrl` → `Curl`, and
`Debounce` → `Denounce`. All action ranges are valid; the proposed meanings
are wrong. They are individual suggestions, not bulk-safe corrections.
The earlier 25 unsafe choices are resolved, but **general spelling safety is
not established**.

Both builds detect **3 of 6 seeded errors**: recieved, seperate, and fewer
with equipment. Both miss “the small box of tools were,” “had saw,” and
“the instruments near the bridge has.” Reading the complete published text
also identified two unflagged p-retry issues: a comma splice and “amount of
times.” These are recorded separately as post-evaluation observations, not
silently added to the frozen six-error denominator.

Remaining noise includes dotted API members and PascalCase names, technical
“function” advice, conventional curly punctuation, process-focused passives,
and literal phrases. Examples of misleading advice include “for the birds”
about birds eating apples, “just before lunch” treated as minimizing language,
and actor advice for “I was tired.” The ledger includes a reason for every
label. Fewer findings alone do not demonstrate precision, recall or readiness.

## Packaged Linux verification

Six packaged Wails/WebKitGTK runs, three per variant in alternating order,
passed on an isolated Weston/pixman desktop with disposable vault/config/cache
folders. Agent Workspace tools were unavailable, so the existing isolated
native harness was used. No host desktop or personal vault was operated.

Each run exercised the actual worker/native/resolver pipeline, review rendering,
Markdown-preserving Apply, keyboard-event Undo, persisted rule-specific Ignore,
twelve editor transactions and a verified disk save during analysis,
cancellation/reuse, eager module readiness and shutdown with work pending.
The current build applied “What **dose** this sign mean” → “does.” A separate
real spelling-worker probe preserved technical words and a defined acronym,
retained the `teh` correction, and checked duplicate/literal advice suppression.

Both builds share the same editor runtime, including five unrelated concurrent
editor changes copied into the native baseline. Only 17 writing runtime inputs
differ. Production binaries were built before instrumentation; instrumented QA
binaries and their source modifications stay in external disposable snapshots.

| Local measure | Before | After |
| --- | ---: | ---: |
| Process to ready, median of three launches | 1204.5 ms | 1271.7 ms |
| Native initialization, median | 139 ms | 128 ms |
| Native analysis, 1,001 words, warm median | 12 ms | 13 ms |
| Native analysis, 10,010 words, warm median | 176 ms | 204 ms |
| Review through rendered frame, 1,001 words, warm median | 41 ms | 46.5 ms |
| Review through rendered frame, 10,010 words, warm median | 298 ms | 313 ms |
| Scripted edit to next frame, median / p95 | 16 / 17 ms | 16 / 28 ms |
| Cancellation, median | 1 ms | 4 ms |
| Production binary size | 59,724,072 B | 59,748,712 B |

The binary grows by **24.1 KiB**. These runs show a higher native-analysis cost
and modestly higher review time, not a performance improvement. Native-analysis
samples pool seven warm runs per size per launch; review samples pool four.
The timed review pipeline excludes spelling; the separate quality probe includes
it. Host workload is not controlled, there are only three process launches per
variant, and DOM-dispatched editor/keyboard events do not measure physical
input-to-paint latency. Windows/macOS runtime behavior remains unmeasured.

## Evidence and limitations

Verification passed:

- 305 frontend suites / **2,729 tests**, with coverage of 83.47% statements,
  72.08% branches, 83.65% functions and 86.98% lines; all required floors pass.
- All Go packages with **78.7%** statement coverage against the 72% floor;
  pure grammar coverage is 97.0%. Full Go and nested Vale race checks pass.
- All 54 source/bundle comparisons and five punctuation comparisons, with
  real-worker cancellation/recovery and advancing foreground timers.
- Lint, integrity/architecture, native bridge-fixture equivalence, feature-index
  and whitespace checks; the existing Chromium production-startup test.
- Linux production/QA builds and Windows amd64/macOS arm64 cross-builds.
  No platform-runtime claim follows from cross-compilation.

Reproduce current document output from the repository root:

```sh
node scripts/evaluate-writing-documents.mjs \
  --manifest tests/fixtures/writing-quality-documents/manifest.json \
  --output /tmp/figaro-writing-quality.json
```

The runner also accepts `--source-root` to replay a saved implementation. The
checked-in JSON contains both before/after document outputs, per-occurrence and
per-action judgments, comparison diagnostics, source hashes and all six native
reports. Full snapshots, native Harper action payloads, scripts, build artifacts
and logs are at `/home/grilo/benchmarks/figaro-writing-quality-20260920`.
External `scripts/report.py` validates the frozen runtime and rebuilds the JSON;
`corpus_compare.py` rebuilds the grammar adapters. Native `prepare-native.py`
and `instrument.py` record one-time snapshot mutations and must not be rerun
in place; `run.py baseline,grammar 3 <new-label>` replays the QA binaries.

Current contracts, README, contributor/test guidance, attribution and
Unreleased changelog describe the change. The feature index includes advice,
spelling, grammar and evaluation entry points. Historical reports retain their
original versions and results, with links to this follow-up. Live-preview and
PDF contracts still apply: this batch changes review policies and findings,
not Markdown rendering, editor geometry, persistence or export styling.

The fresh sample exposes unfinished quality work. Fixing its remaining cases
would make it development material for a subsequent batch; a new untouched
sample would then be needed. An independently annotated, broader corpus remains
necessary before claiming general writing quality.
