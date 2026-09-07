# Writing corpus safety corrections — 2026-09-07

This contract follows the eight-document pattern audit. It covers correctness
and review safety; it does not establish general writing quality or complete
grammar coverage. Mapping version 11, editorial policy 4, local-rule version 3
and spelling vocabulary version 1 invalidate older analysis snapshots. Provider
versions, registered rules, independent lens memberships and saved review data
are unchanged.

## Corrected behavior

| Audit pattern | Current behavior | Regression boundary |
| --- | --- | --- |
| Unsafe dictionary bulk guesses | English technical vocabulary and acronym plurals are recognized. Unreviewed capitalized-word alternatives require an adjacent transposition. Spelling bulk actions require an explicit reviewed correction, not one candidate. Dictionary alternatives cannot invent possession; reviewed contractions remain supported. | Real dictionaries, pure bulk planner, suggestion-card actions |
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

## Verification and evaluation limits

`writingCorpusSafety.test.js` names the exact regressions and retains positive
controls. Existing package-inventory, spelling, review, decision and worker
suites remain applicable. `scripts/verify-writing-performance.mjs` compares the
bundled and source adapters, verifies the paragraph optimization, and checks
foreground timer progress plus real-worker cancellation/recovery. The long-note
profile covers 10k, 25k and 50k words. None of these checks is native
input-to-paint evidence, and this change adds no input-handler scans or editor
geometry changes.

The evaluation keeps three kinds of evidence separate:

1. The unchanged eight-document source snapshot permits before/after comparisons.
2. Clean extraction removes website code-language headers and figure-download
   controls. Those are corpus artifacts rather than author mistakes.
3. Additional documents probe unseen wording. Once such a document informs a
   correction it becomes a regression source, not an independent holdout.

Full diagnostics remain local, with source/license hashes and provider evidence
in the owned evaluation directory. Public source texts are not committed here.
Document counts and fewer findings do not establish precision or recall. Agent
judgments and a small technical/instructional corpus cannot replace the
independent human labels and broader genres in [WRITING_CORPUS.md](WRITING_CORPUS.md).

See the local verification record for actual runs, corpus deltas and remaining
release limits:
`/home/grilo/Downloads/figaro-writing-corpus-fixes-2026-09-07/verification.md`.
