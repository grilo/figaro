# Writing suggestion relevance — 20 September 2026

## Scope and method

This batch reviews the unnecessary suggestions left by the
[document-gap corrections](writing-gaps-2026-09-20.md). Both existing document
sets are development regressions. Source bytes and prior judgments remain
unchanged; no untouched sample or independent human review is claimed.

The eight-document sample had 73 unnecessary findings: 36 passive constructions,
17 ordinary-word substitutions, ten curly marks, six modifiers, two existential
openings, one readability estimate and one spelling observation. The older six
documents had 62 unnecessary findings. The implementation addresses coherent
categories rather than specific document names or complete fixture sentences:

- Preserve reviewed technical passive descriptions using bounded subject,
  predicate and context evidence. Keep explicit actors and unrelated prose
  reviewable; do not infer the meaning of hidden code or quoted text.
- Suppress isolated synonym-list matches for reviewed familiar words, including
  “remain,” “contains,” “however” and “provide.” Useful multiword shortening and
  complex-word advice remain available.
- Preserve reviewed meaningful descriptions of manner, frequency and degree,
  such as “work slowly,” “usually crowded” and “completely dark.” Broad emphasis
  such as “completely amazing” stays reviewable.
- Keep all 30 selected Formulaic rules. Curly punctuation now needs a mismatch
  with the note’s prevailing straight quote/apostrophe convention. Consistent
  curly styles produce no Formulaic warning. Current-note policy is recomputed
  after paragraph edits; unchanged raw analyzer results can still be reused.

Mapping advances from 21 to 22 and editorial policy from 6 to 7. Grammar policy
8, spelling vocabulary 4, dependencies and native grammar behavior are unchanged.

## Results

| Measure | Reviewed eight: before | Reviewed eight: after | Known six: before | Known six: after |
| --- | ---: | ---: | ---: | ---: |
| Visible findings | 85 | 24 | 91 | 54 |
| Unnecessary findings | 73 | 12 | 62 | 25 |
| Clear errors detected | 8 | 8 | 19 | 19 |
| Useful optional style findings | 4 | 4 | 10 | 10 |
| Unsafe replacement choices | 0 | 0 | 0 | 0 |

All 27 offered safe replacement choices remain. The eight-document result still
detects all six seeded errors plus the two separately identified published errors.
The older result detects all 19 eligible annotations; its twentieth annotation
is intentionally protected quotation text. No new occurrence is added and no
retained finding changes its editorial label. **98 of 135 unnecessary findings
are removed across both samples.** This is a regression improvement after tuning,
not an estimate of accuracy on other writing.

The [per-occurrence ledger](writing-relevance-2026-09-20.json) records retained
and suppressed findings against the preceding report, replacement checks and
source hashes. The previous report remains unchanged.

## Next batch selected

**Procedural/narrative passive descriptions and meaningful existential openings**
account for 32 of the 37 remaining unnecessary findings: 28 passive findings and
four “there is/are” findings. This is the next implementation batch, not part of
the completed policy above.

Representative acceptance pairs:

| Preserve without advice | Keep useful review available |
| --- | --- |
| “The battery was replaced at 16:20.” | “The decision was made by the board.” |
| “The labels were checked last week and remain correct.” | “The request was rejected by the manager.” |
| “There are two large jugs on the shelf.” | “There are several ways in which we can improve this.” |
| “Make changes while there is still time.” | “There is a need to review the totals.” |

The remaining passive cases also include elliptical API descriptions and
possessive-gerund reactions. Develop bounded minimal pairs for those families
before changing suppression. Preserve grammar findings at overlapping positions,
exact source ranges, independent lenses and saved Ignore decisions. Do not hide
all passive or existential constructions. Keep the other five remaining issues
(two spelling observations, one acronym, one readability estimate and one tone
observation) separate. A later evaluation should use an untouched sample after
this broader context work is complete.

## Validation and reproduction

- **310 frontend suites / 2,824 tests verified.** The full coverage run passed
  308 suites; two expectations still required the deliberately removed
  “contains” warning. After updating those expectations, both complete affected
  suites passed (139 tests). Product source did not change after the full run.
- Full-run coverage is 83.60% statements, 72.33% branches, 83.75% functions and
  87.07% lines, above every required floor. Integrity and architecture checks pass.
- All 54 source/bundle and five punctuation comparisons pass, including the
  real worker’s cancellation/recovery and continuing foreground timers.
- Lint, generated feature-index and whitespace checks pass. The production
  bundle builds and its assembled browser startup check passes without later
  feature-module requests.
- A production Linux binary and instrumented native candidate build. The
  WebKitGTK run verifies the new quiet technical/word/modifier/curly cases,
  retained explicit-actor advice and useful shortening, existing grammar fixes,
  Markdown-safe Apply, keyboard Undo, persisted Ignore, typing/saving during
  analysis, cancellation/reuse, eager startup and shutdown with work pending.

The recorded writing-source and runtime hashes match the native candidate.
This batch changes pure frontend policy; it does not change native grammar or
storage. Existing Go verification belongs to the preceding batch and was not
repeated here. Concurrent editor/dictionary changes remain subject to their own
acceptance checks. Windows/macOS native runtimes were not tested.

Replay both existing manifests from the repository root:

```sh
node scripts/evaluate-writing-documents.mjs --manifest tests/fixtures/writing-quality-documents/manifest.json --output /tmp/figaro-writing-quality.json
node scripts/evaluate-writing-documents.mjs --output /tmp/figaro-writing-known.json
```

Local replay output, logs, candidate snapshots and native probes are under
`/home/grilo/benchmarks/figaro-writing-relevance-20260920`.
