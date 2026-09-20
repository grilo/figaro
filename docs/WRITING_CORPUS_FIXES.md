# Writing corpus safety corrections — 2026-09-07

This contract follows the eight-document pattern audit. It covers correctness
and review safety; it does not establish general writing quality or complete
grammar coverage. Mapping version 24 (including the later grammar-context and quality updates), editorial policy 8, local-rule version 3
and spelling vocabulary version 4 invalidate older analysis snapshots. This corpus-safety work preserves provider versions, independent lens memberships,
and saved review data. The later [curated grammar expansion](WRITING_HARPER.md)
adds separately reviewed rules.

## Corrected behavior

| Audit pattern | Current behavior | Regression boundary |
| --- | --- | --- |
| Unsafe dictionary bulk guesses | English technical vocabulary and acronym plurals are recognized. Ordinary capitalized prose gets case-matched alternatives; uncertain mixed-case/name-only alternatives still require an adjacent transposition. Spelling bulk actions require an explicit reviewed correction, not one candidate. Dictionary alternatives cannot invent possession; reviewed contractions remain supported. | Real dictionaries, pure bulk planner, suggestion-card actions |
| Closing quotes and numeric compounds | Quotation delimiters stay outside lexical edits. Valid possessives retain their suffixes. Forms such as `base-10` and `8.1Mib` remain intact. | Source tokenization and dictionary adapter |
| Underscore emphasis | Parsed emphasis delimiters are masked before identifier detection. Underscore and asterisk forms check the same prose without truncating suffixes. | All four emphasis forms, multiword possessives, protected paths/code |
| Short fragments called long sentences | Native anchors must identify an eligible mapped sentence containing more than 30 words. The local check uses the same threshold and retains coverage when native boundaries differ. | Native-output conversion, local threshold, soft wraps and block boundaries |
| Balanced URL parentheses | URL content retains its balanced internal parentheses; surrounding punctuation stays visible to the paired-punctuation rule. | Pure URL ranges and actual bundled textlint |
| Wrong word senses in Clarity | Bounded context guards suppress mismatched technical noun and postal-address advice. Useful verb/phrase cases remain enabled. | Positive/negative context pairs and resolver |
| Misleading Inclusive tone advice | Easy-read terminology, negation, limiting constructions, “just as/like” comparisons and descriptive clarity have narrow guards. Surviving tone advice explains reader assumptions. | Actual package output and pure context policy |
| Narrow acronym definitions | Forward/reverse and plural definitions work across the document within each eligible prose block, including after headings. Initial matching includes hyphenation, eX forms and a limited noun-of-noun reorder; it does not infer meanings. | Pure recognition, hidden-region negatives and native/resolver evaluation |

The single-word alternatives returned by a dictionary are still suggestions,
not verified semantic rewrites. Only reviewed spelling corrections may be bulk
applied. A real word used in the wrong context, an unfamiliar name, or an
unsupported inflection may still need author judgment. Vocabulary recognition
and correction confidence are separate policies.

Curly punctuation and unspaced em-dash checks remain in Formulaic writing.
Contextual suppression does not remove an upstream rule or require another
lens. Sentence-length advice now uses one above-30-word threshold; the earlier
local-only 35-word threshold is retired to avoid losing valid native coverage
when Markdown block boundaries disagree.

## September quality follow-up

The six-document follow-up identified 25 unsafe spelling alternatives at 17
occurrences. Recognition-only vocabulary now includes `async`, `dotfile(s)`,
`etag(s)`, `fallback(s)`, middleware, npm, backpressure, fallthrough and pathname(s).
Lower-camel-case identifiers are opaque source tokens; ordinary capitals and
ambiguous slash/dot prose remain eligible. Generated English suggestions cannot
simply remove a final `s` from a dictionary-unknown word. Forward/reverse acronym
definitions in visible spelling prose also suppress spelling alarms for that
note, without entering the cross-document suggestion cache.

The shared advice policy recognizes technical options, numeric limits, forwarding
and web addresses, as well as “look forward to.” It withholds actor advice for
“unexpected” and agentless “disappointed,” and cliché advice for a literal
end-of-day instruction. Unmatched-pair warnings are checked against visible,
properly nested pairs in the same block. Equivalent “there is/are” observations
merge across Plain language and Directness, retaining both sources, independent
lens selection and prior occurrence Ignore decisions. Other concerns stay distinct.

Grammar policy 7 broadens existing families; see
[the context contract](WRITING_HARPER.md#broader-contexts-and-quality-follow-up).
The [quality report](benchmarks/writing-quality-2026-09-20.md) replays the known
six documents and evaluates a separately frozen eight-document sample after
tuning. It reports retained errors and advice as well as improvements.

The [document-gap follow-up](benchmarks/writing-gaps-2026-09-20.md) fixes the
unsafe choices and five missed errors found in that sample, adds identifier and
literal-sense controls, and explicitly converts it to development regression
material. It does not claim that arbitrary dictionary alternatives are safe.

## Suggestion relevance

The [relevance review](benchmarks/writing-relevance-2026-09-20.md) groups the
remaining unnecessary findings before changing policy. Reviewed familiar words
no longer produce synonym-only tasks. Meaningful manner, frequency and degree
retain bounded context guards. Technical passive descriptions require a
reviewed predicate and nearby subject/context, while explicit actors remain
reviewable. Curly punctuation must conflict with the current authored straight
convention; it is not evidence of a formulaic passage by itself. Useful
shortening, grammar corrections and all selected package rules remain available.

## Descriptive and existential context

The [context follow-up](benchmarks/writing-context-2026-09-20.md) implements the
next selected batch: reviewed timed maintenance, physical/location descriptions,
elliptical API behavior, possessive-gerund reactions and meaningful existential
quantity, location and availability. Explicit actors, weak introductions and
independent grammar findings remain available. Shared pure policy handles both
full native passive spans and participle-only package spans. Sentence, paragraph
and protected-text boundaries cannot provide missing context. All 32 targeted
unnecessary findings disappear from the existing development sets, leaving five
other findings; prior editorial labels and source bytes remain unchanged.

## Verification and evaluation limits

`writingCorpusSafety.test.js` names the exact regressions and retains positive
controls. Existing package-inventory, spelling, review, decision and worker
suites remain applicable. `scripts/verify-writing-performance.mjs` compares the
bundled and source adapters, verifies the paragraph optimization, and checks
foreground timer progress plus real-worker cancellation/recovery. The long-note
profile covers 10k, 25k and 50k words. None of these checks is native
input-to-paint evidence, and this change adds no input-handler scans or editor
geometry changes.

The original September 7 evaluation kept three kinds of evidence separate:

1. The unchanged eight-document source snapshot permits before/after comparisons.
2. Clean extraction removes website code-language headers and figure-download
   controls. Those are corpus artifacts rather than author mistakes.
3. Additional documents probe unseen wording. Once such a document informs a
   correction it becomes a regression source, not an independent holdout.

For that original evaluation, full diagnostics and public source text remain
local, with source/license hashes and provider evidence in the owned directory.
The later September 20 evaluations commit licensed frozen source fixtures and
review ledgers, including the [fresh quality sample](benchmarks/writing-quality-2026-09-20.md).
Document counts and fewer findings do not establish precision or recall. Agent
judgments and a small technical/instructional corpus cannot replace the
independent human labels and broader genres in [WRITING_CORPUS.md](WRITING_CORPUS.md).

See the local verification record for actual runs, corpus deltas and remaining
release limits:
`/home/grilo/Downloads/figaro-writing-corpus-fixes-2026-09-07/verification.md`.
