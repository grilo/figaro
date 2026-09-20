# Writing descriptive context — 20 September 2026

## Scope and method

This implements the 32-finding batch selected by the preceding
[suggestion-relevance review](writing-relevance-2026-09-20.md): 28 passive
descriptions and four meaningful existential statements. Both frozen document
sets are development regressions. Source bytes, annotations and editorial
judgments remain unchanged. No new holdout or independent human review is claimed.

Shared pure policy recognizes reviewed timed maintenance, physical/location
descriptions, elliptical API behavior and possessive-gerund reactions. It also
preserves concrete “there is/are” quantity/location and availability wording,
including “there is still time” and “there is no reason.” The guards use bounded
projected prose, retain explicit actors even after a time/location, and cannot
use hidden text or cross sentence/paragraph boundaries to infer missing context.
They work with both full native spans and participle-only package spans.

| Preserve without advice | Keep useful review available |
| --- | --- |
| The battery was replaced at 16:20. | The battery was replaced at noon by the engineer. |
| Their going to be thanked surprised the helpers. | Their going to be told to leave. |
| There are two large jugs on the shelf. | There are several ways in which we can improve this. |
| Make changes while there is still time. | There is a need to review the totals. |

Independent grammar findings remain available at overlapping positions. No
automatic edit is introduced. Mapping advances from 22 to 23 and editorial
policy from 7 to 8; grammar policy 8, vocabulary 4 and dependencies are unchanged.

## Results

| Measure | Reviewed eight: before | Reviewed eight: after | Known six: before | Known six: after |
| --- | ---: | ---: | ---: | ---: |
| Visible findings | 24 | 14 | 54 | 32 |
| Unnecessary findings | 12 | 2 | 25 | 3 |
| Clear errors detected | 8 | 8 | 19 | 19 |
| Useful optional style findings | 4 | 4 | 10 | 10 |
| Safe replacement choices | 8 | 8 | 19 | 19 |
| Unsafe replacement choices | 0 | 0 | 0 | 0 |

All **32 targeted unnecessary findings disappear**, leaving five unrelated
findings. All 27 clear errors, 14 useful optional findings and 27 safe replacement
choices remain. No new finding appears and no prior judgment is rewritten.
The eight-document set retains all six seeded errors and two separately noted
published errors. The older set retains all 19 eligible annotations; its
twentieth annotation remains intentionally protected quotation text.

The [occurrence ledger](writing-context-2026-09-20.json) links the unchanged prior
report, source hashes, retained/suppressed status, replacement checks and native
verification. This measures the reviewed regressions after tuning, not general
accuracy on new writing.

## Remaining findings

The five remaining unnecessary findings belong to separate areas:

- Spelling: “Cymraeg” and the technical abbreviation “dir.”
- Acronyms: the MIT license label.
- Readability: one technical sentence about concurrent function executions.
- Reader assumptions: “simply” before a masked middleware call.

These are left for a separate review. A later quality evaluation should use an
untouched sample after context tuning is complete.

## Validation and reproduction

`writingDescriptionContext.test.js` adds 62 cases covering provider span shapes,
explicit actors, sentence/paragraph/protected-text boundaries, useful weak
introductions, overlapping grammar and actual bundled output. The five focused
suites pass all 237 tests.

The complete frontend run passes **312 suites / 2,891 tests**. Coverage is
83.65% statements, 72.46% branches, 83.76% functions and 87.10% lines, above
every required floor. Integrity, architecture, lint, generated feature-index
and whitespace checks pass. All 54 source/bundle and five punctuation probes
pass, including actual worker cancellation/recovery and foreground timers.
The production build and its assembled Chromium startup scenario pass with no
post-ready feature-module requests.

The packaged Linux WebKitGTK workflow verifies quiet timed/gerund/existential
examples, useful introductions and actor advice, the preceding grammar fixes,
Markdown-safe Apply, keyboard Undo, persisted Ignore, typing/saving during
analysis, cancellation/reuse, eager startup and shutdown with work pending.
An uninstrumented production binary is built before the native probe. Recorded
writing-source and runtime hashes match the native candidate.

This batch changes pure frontend policy, with no native grammar or storage
change. Go suites from the preceding grammar work are not counted as new
verification here. Concurrent editor/dictionary work retains its own acceptance
checks. Windows/macOS native runtimes were not tested.

Replay the unchanged manifests from the repository root:

```sh
node scripts/evaluate-writing-documents.mjs --manifest tests/fixtures/writing-quality-documents/manifest.json --output /tmp/figaro-writing-quality.json
node scripts/evaluate-writing-documents.mjs --output /tmp/figaro-writing-known.json
```

Local raw results, logs, candidate snapshots and native probes are under
`/home/grilo/benchmarks/figaro-writing-context-20260920`.
