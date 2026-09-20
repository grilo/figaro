# Contextual usage and noun agreement — 20 September 2026

A later [quality follow-up](writing-quality-2026-09-20.md) resolves the known
unsafe spelling alternatives, reduces advice noise, broadens existing grammar
contexts and reports remaining gaps on a fresh sample. Results below describe
this earlier checkpoint.

## Scope and method

Proofreading grows from 114 to **175 rule IDs**: 15 Vale-port rules and 160 pure Go checks. This batch adds 60 selected Harper reference families, an independently authored NounSubjectAgreement rule, and broader MassNouns handling for “fewer time” and similar amounts. Grammar policy is 6; mapping is 19. [The grammar contract](../WRITING_HARPER.md#contextual-usage-and-noun-subjects) lists the rules, reviewed examples and exclusions.

The shared regression corpus contains **468 positive and 905 valid/ambiguous examples**, up by 113 and 222 respectively. Single-error cases require one intended grammar finding; offered corrections must leave the sentence free of grammar warnings. Deliberately combined lexical/agreement errors also verify a single stable correction. These are agent-reviewed regression examples used during implementation, not a held-out accuracy estimate or independent human evaluation.

Five initially proposed families were replaced after usage review: FedUpWith, CraveFor, CommitmentTo, SufficeItToSay and Nonetheless. The replacements are LetsConfusion, DoMistake, FriendOfMe, HaveAHardTime and HowDoesCompared. Valid and ambiguous alternatives remain protected; the grammar contract links the dictionary evidence.

## Behavioral comparison

The production Go adapter, saved pre-batch adapter and official native Harper 2.10.0 language server received the same **931 inputs**. The extraction covers the 60 new reference families and existing MassNouns; additional authored noun-subject cases have no claimed matching Harper rule ID. Harper used its default rules with spelling disabled, Markdown parsing, and English isolation disabled. Counts track the corresponding target rule, excluding other Figaro writing providers.

| Corpus | Cases | 114-check Figaro | 175-check Figaro | Native Harper |
| --- | ---: | ---: | ---: | ---: |
| reviewed / positive | 118 | 5 | 118 | 99 |
| reviewed / negative | 234 | 0 | 0 | 57 |
| upstream / positive | 409 | 14 | 217 | 399 |
| upstream / negative | 170 | 0 | 0 | 7 |

Negative columns count flagged valid/ambiguous cases; zero is desired. Expanded Figaro emitted **no grammar finding of any kind across the 404 comparison negatives**. A first replay exposed six false positives in noun/verb context, questions, countable compounds and “for reasons of”; a later replay caught the literal “has a look to it.” Added nominalized-adjective tests also reproduced and fixed “the poor/dead/blind are.” All are retained as regressions.

The upstream set contains 579 mechanically extracted literal Rust/Weir cases: 409 positive and 170 negative. Figaro detects 217 of the positive cases; native Harper detects 399. The gap includes broader parsing, unselected spelling/hyphenation variants and intentionally withheld meanings. Some upstream proposed edits change acceptable wording or leave another error; this is a behavioral comparison, not an accuracy ranking. Product Markdown masking may further withhold plain-input findings or actions. The independent noun-subject positives are included in the authored row, so native target-ID counts do not measure an equivalent rule for those cases.

The [source manifest](../../internal/writing/grammar/SOURCE.json) pins Harper 2.10.0, its Apache-2.0 reference archive and 152 source/test hashes. It accounts for 154 additional Go IDs beyond the original six and identifies NounSubjectAgreement as independently authored. No native Harper executable, Rust source, new worker, network dependency or runtime is bundled.

## Whole-document review

The same six frozen Markdown documents ran through all bundled JS providers, native Go, actual English dictionaries, Markdown projection and the combined resolver. Existing finding ranges, messages and offered edits remain identical. Two correct edits are added; none are removed.

| Document | Visible findings before → after | Review cards before → after |
| --- | ---: | ---: |
| serve-static | 63 → 63 | 44 → 44 |
| p-map | 33 → 33 | 26 → 26 |
| workshop | 17 → 18 | 17 → 18 |
| garden | 15 → 15 | 14 → 14 |
| service-note | 12 → 12 | 11 → 11 |
| walk | 12 → 13 | 12 → 13 |

The workshop gains “The spare chairs is” → “…are”; the walk gains “fewer time” → “less time.” Detection of pre-annotated errors increases from 17/20 to **19/20 overall, or 19/19 eligible errors** after excluding the deliberately masked quotation. Neither technical manual nor the valid garden note gains a finding.

The quotation remains excluded. The previously reviewed unsafe technical spelling alternatives (25 edits at 17 occurrences) and duplicate advice are unchanged. Those other-provider issues remain unresolved. This small frozen corpus is useful regression evidence, not a general accuracy claim; [the original document review](writing-documents-2026-09-20.md) records source/license provenance and editorial judgments.

## Packaged Linux verification

Six fresh packaged Wails/WebKitGTK launches, three per build in alternating order, ran on a private 1280×800 Weston/pixman display with disposable vault/configuration/cache directories. All passed full review/rendering, Markdown-safe Apply, keyboard Undo, persisted rule-specific Ignore, twelve edits and a disk save while analysis remained pending, cancellation/reuse, eager module readiness, and shutdown with work in flight. The expanded build exercised “The spare chairs **is** ready”; the baseline exercised “**Your** welcome.”

Both packaged snapshots use identical non-grammar runtime code and vendored assets. Only the grammar package and two frontend grammar/configuration files differ. The runtime hash manifest verifies that the expanded inputs still match the repository. QA instrumentation is confined to external snapshots; production-size binaries contain no BenchmarkReport symbol.

The Agent Workspace tools were unavailable in this session, so the existing headless native harness provided the isolated display. Native UI events use DOM/CodeMirror input and keyboard events, not physical hardware. Owned build and coverage jobs finished before timing runs; unrelated system workloads were not controlled. Windows/macOS runtime behavior remains unmeasured.

| Measure | 114-check baseline | 175-check build |
| --- | ---: | ---: |
| Process launch to app ready, median | 1184.6 ms | 1158.3 ms |
| Ready range, three launches | 1155.6–1199.6 ms | 1150.7–1185.8 ms |
| Native initialization, median | 131.0 ms | 134.0 ms |
| Full review + render frame, 1001 words, pooled median | 40.5 ms | 39.5 ms |
| Full review + render frame, 10010 words, pooled median | 340.5 ms | 286.5 ms |
| Production binary | 59,648,328 B | 59,715,880 B |
| Deterministic gzip-9 binary tar | 20,423,263 B | 20,450,934 B |

The batch adds **66.0 KiB unpacked / 27.0 KiB gzip**. Review samples use identical 1,001/10,010-word prose, discard the first warm-up and pool four remaining samples per size per launch. Timings are local observations, not speed guarantees.

## Evidence and reproduction

[The checked-in JSON](writing-grammar-usage-2026-09-20.json) includes per-family comparison results, whole-document differences, all six native reports, sizes/hashes, runtime-source hashes and verification-input hashes. Full snapshots, corpora, native diagnostics/actions, build artifacts and scripts are external at `/home/grilo/benchmarks/figaro-grammar-usage-20260920`.

`scripts/corpus_compare.py` rebuilds both Go adapters and replays the native corpus. The repository’s `scripts/evaluate-writing-documents.mjs` accepts `--source-root` and `--output` for the two complete-document replays. External `scripts/prepare-native.py`, `build-release.py` and `instrument.py` record one-time snapshot preparation/builds; do not rerun snapshot mutations in place. `scripts/run.py baseline,grammar 3 <new-label>` replays QA binaries on a private display. `scripts/report.py` verifies source hashes and regenerates this report from `isolated-*` runs.

Verification passed: 303 frontend suites / 2,670 tests with coverage (83.43% statements, 71.98% branches, 83.62% functions, 86.95% lines); all Go packages with 78.5% statement coverage against the 72% floor; full Go and nested Vale race checks; lint, integrity/architecture, bridge-fixture equivalence, feature-index and whitespace checks; the Chromium production-startup boundary; and Windows amd64/macOS arm64 writing-test cross-compilation. Final focused grammar coverage contains 314 tests in six frontend suites. The pure rules and native adapter consume the same reviewed corpus; five additional CodeMirror Apply/Undo cases preserve Markdown emphasis.
