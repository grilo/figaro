# Writing document-gap corrections — 20 September 2026

This follow-up fixes the remaining reviewed failures from the
[previous evaluation](writing-quality-2026-09-20.md). That eight-document sample
now guides implementation and is regression material, not untouched evaluation.

## Changes and evidence

Grammar policy 8, mapping 21, editorial policy 6 and spelling vocabulary 4 fix
the reviewed document failures:

- Preserve technical abbreviations, reviewed hyphenated components, PascalCase
  names and dotted API members. Ordinary misspellings remain eligible.
- Withhold wordiness/inclusive advice for reviewed technical parameter, retry,
  temporal and reported-route contexts. Preserve literal bird food, weather
  exposure, adjectival tiredness and observed past scenes.
- Follow noun subjects across one prepositional modifier, distinguish perfect
  “had saw the tool” from tool nouns, and correct reviewed “amount of times”
  constructions, including beside inline code.
- Advise on bounded likely comma splices without offering an automatic rewrite.
  Preserve dependent clauses, parentheticals and coordinated clause lists.

The [grammar contract](../WRITING_HARPER.md#document-gap-corrections) describes
the guards and limits. There are now 177 grammar rule IDs: 15 curated Vale-port
rules and 162 pure Go checks, with 573 positive and 1,041 valid/ambiguous cases.

## Document replay

These are the same frozen Markdown bytes as the preceding evaluation. No new
holdout sample was collected. All lenses are enabled, so the totals include
optional style advice. Judgments are by the agent, not independent human gold.

| Measure | Reviewed eight: previous | Reviewed eight: current | Known six: previous | Known six: current |
| --- | ---: | ---: | ---: | ---: |
| Visible findings | 119 | 85 | 95 | 91 |
| Clear errors detected | 3 | 8 | 19 | 19 |
| Useful optional style findings | 4 | 4 | 10 | 10 |
| Unnecessary findings | 100 | 73 | 63 | 62 |
| Misleading findings | 12 | 0 | 3 | 0 |
| Offered replacement choices | 18 | 8 | 19 | 19 |
| Unsafe replacement choices | 14 | 0 | 0 | 0 |
| Seeded errors detected | 3 / 6 | 6 / 6 | 19 / 20 | 19 / 20 |

The twentieth older annotation is inside an intentionally protected quotation:
all 19 eligible older errors remain detected. The new eight-document total
includes six seeded errors and **two separately reported, post-hoc errors** in
the published `p-retry` document. Those two are not added to the seeded-error
denominator. The comma splice is advisory; the countable quantity has a reviewed
replacement. All 27 currently offered replacement choices across both corpora
retain valid source ranges and preserve the intended meaning in agent review.

All retained findings keep their preceding judgments after matching document,
kind, exact UTF-16 range and replacement choices. Five newly detected occurrences
are reviewed individually. The [machine-readable ledger](writing-gaps-2026-09-20.json)
contains every current finding, judgment, action, removed occurrence, source hash
and replay result. It preserves the original report rather than rewriting its
historical results. Technical masking changes the eight-document projected word
count from 2,687 to 2,685; the source bytes did not change.

## Verification

- All 305 frontend suites and 2,770 tests pass. Coverage is 83.11% statements,
  71.97% branches, 83.30% functions and 86.71% lines, above required floors.
- Full Go and nested Vale race checks pass. Go statement coverage is 78.8%
  against a 72% floor; the pure grammar package has 97.1% coverage.
- Real native bridge fixtures cover the new corrections, formatted Apply and
  one-step Undo, rule-specific Ignore, protected spans and Unicode/CRLF ranges.
- All 54 source/bundle and five punctuation comparisons pass, including actual
  worker cancellation/recovery. Lint, integrity and architecture checks pass.
- The assembled production startup browser check passes, with no post-ready
  module fetching. A production Linux binary builds successfully.
- The packaged Linux WebKitGTK run passes visible grammar review, Markdown-safe
  Apply, keyboard Undo, persisted Ignore, typing and saving during analysis,
  cancellation/reuse, eager startup and shutdown with queued work. Its embedded
  quality probe verifies the technical protections and new grammar detections.

The final native check used a private Go cache after the shared cache returned
missing-artifact errors. The checked writing source, grammar data and bundled
runtime match the recorded candidate hashes. Concurrent editor/dictionary work
was present in the shared workspace; these results do not substitute for its
separate native acceptance checks. Windows/macOS native runtimes were not tested.

The one final native run measured 44–69 ms for the repeated 1,001-word pipeline
and 410–464 ms for 10,010 words. It reported 1.23 seconds from process launch to
ready and 150 ms for initialization. These are diagnostic measurements on a
shared machine, not a performance comparison or physical-input latency claim.

## Remaining limits and reproduction

The reviewed failures are resolved, but this is still a bounded pattern checker.
The eight-document sample retains **73 unnecessary findings** with every lens
enabled: style relevance remains the largest measured gap. Detecting six known
seeded errors after tuning does not establish broad grammar recall. No complete
sentence parser, general semantic understanding or native Harper parity is
claimed. A later independent evaluation should follow a larger coherent change,
rather than treating each tuned sample as fresh evidence.

Run the existing whole-document evaluator from the repository root:

```sh
node scripts/evaluate-writing-documents.mjs --manifest tests/fixtures/writing-quality-documents/manifest.json --output /tmp/figaro-writing-quality.json
node scripts/evaluate-writing-documents.mjs --output /tmp/figaro-writing-known.json
```

The committed JSON contains the replay data and source hashes. Local build,
coverage, browser and native logs, candidate snapshots and the ledger-generation
script are under `/home/grilo/benchmarks/figaro-writing-gaps-20260920`.
