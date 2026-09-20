# Whole-document writing review — 20 September 2026

A later [quality follow-up](writing-quality-2026-09-20.md) resolves the known
unsafe spelling alternatives, reduces advice noise, broadens existing grammar
contexts and reports remaining gaps on a fresh sample. Results below describe
this earlier checkpoint.

The possessive-gerund guard again allows corrections such as “Their going to
be late” → “They're going to be late.” Infinitives and their passive/perfect
auxiliaries no longer count as the later finite verb that makes a possessive
gerund valid. “Their going to be served surprised us” remains unchanged.
This historical evaluation used 54 grammar IDs, grammar policy 4, and mapping 17.
The [later broad-batch comparison](writing-grammar-broad-2026-09-20.md) replays
the same six sources with 114 IDs, grammar policy 5, and mapping 18. The
[subsequent usage batch](writing-grammar-usage-2026-09-20.md) replays them again
after adding noun-subject and countability coverage.

## Corpus and method

Six complete Markdown documents were frozen before the comparison: two
unchanged MIT-licensed technical manuals and four original agent-authored notes
covering a practical draft, UK field notes, a service handover, and a narrative.
The [manifest](../../tests/fixtures/writing-documents/manifest.json) records
pinned upstream revisions, source and license hashes, language, preprocessing,
and 20 seeded errors with exact UTF-16 offsets. The manuals retain their own
MIT notices; original fixtures and annotations use the repository license.
No user's notes were collected. Source text has not been cleaned after seeing
results; badges, code, headings, links, tables, quotes and footnotes remain.

All nine internal checks were enabled with the selected US/UK dictionary and
an empty personal dictionary. The runner uses the actual bundled JS analysis,
production spelling adapter with bundled Hunspell dictionaries, production Go
engine, and `resolveWritingReview`. The latter produces the combined findings,
cards, source-validated actions, and bulk plans. This is an assembled adapter
evaluation; separate native QA checks the Wails/webview and editor actions.

Every one of the 150 visible occurrences and 40 offered replacements was read
in context. The [review ledger](writing-documents-2026-09-20.json) records the
source identity, label, rationale and edit judgment for each. These are agent
judgments, not independent human gold labels. This small, partly synthetic,
technical-heavy sample does not establish general precision or usefulness,
and does not complete the pilot proposed in [WRITING_CORPUS.md](../WRITING_CORPUS.md).

## Results

| Document | Projected prose words | Visible occurrences | Cards | Seeded errors found |
| --- | ---: | ---: | ---: | ---: |
| serve-static manual | 630 | 63 | 44 | — |
| p-map manual | 483 | 33 | 26 | — |
| Workshop draft | 243 | 17 | 17 | 7/8 |
| UK garden notes | 261 | 15 | 14 | — |
| Service handover | 242 | 10 | 9 | 5/8 |
| River walk | 260 | 12 | 12 | 3/4 |
| **Total** | **2,119** | **150** | **122** | **15/20** |

The word denominator counts letter-bearing whitespace tokens in the actual
prose projection; it excludes masked content and is not a count of every word
in the source files. With all optional lenses enabled, the review labels are
15 definite errors, 10 useful optional suggestions, 115 unnecessary suggestions,
and 10 misleading suggestions. Unnecessary plus misleading occurrences are
about 59 per 1,000 projected words, affecting all six documents. These
context-dependent agent ratings are exploratory; they are not a release gate.

The pre-fix snapshot found 10 of the 20 seeded errors. The change adds exactly
five correct contraction findings; all other visible findings and offered
edits are unchanged. The sixth seeded contraction is inside a blockquote,
which the existing prose contract masks. Among the 19 eligible seeded errors,
coverage therefore changes from 10/19 to 15/19. This is synthetic coverage,
not recall on naturally occurring errors. No possessive-gerund control gained
a grammar finding. US/UK spelling controls, code, frontmatter, URL targets and
footnote identifiers retained their existing treatment.

### Findings to address next

1. **Unsafe technical spelling alternatives.** Seventeen occurrences offer
   25 replacements judged unsafe: `async` → `sync`, `dotfile(s)` → `defile(s)`,
   unrelated alternatives for `etag`, and edits that change `fallbacks`.
   All pass the source-range checks, but change the intended technical meaning
   or number. The other 15 offered edits correctly repair seeded mistakes.
   No bulk action is available in this corpus. Dictionary alternatives are
   explicitly presented for review; range validity does not establish meaning.
2. **False and unnecessary advice.** The manuals flag established terms and
   names such as middleware, npm and API identifiers. A balanced parenthesis
   is called unmatched. “Was unexpected” and “were disappointed” attract
   actor-based passive advice despite being state descriptions. Literal “at
   the end of the day,” technical “forward/function/web address,” and the
   gardener's defined LAI acronym also expose context or cross-provider gaps.
3. **Duplicate advice.** “There are two large jugs” receives both plain-language
   wordiness and directness-opening advice at exactly the same source span.
   Grouping reduces 150 occurrences to 122 cards but keeps both of these cards.
4. **Grammar misses.** The four eligible seeded misses are “The spare chairs
   is,” “look forward to meet,” “more cheaper,” and “fewer time.” The quoted
   contraction is separately excluded by the current product contract. Manual
   inspection also noticed “will be added to the file name and search for” in
   the untouched serve-static manual; it was not pre-annotated and is not
   included in seeded coverage.

These findings are recorded for follow-up. This change fixes the contraction
regression; it does not change spelling policy, quotation eligibility, optional
style thresholds, or the set of supported grammar rules.

## Reproduction and verification

```sh
node scripts/evaluate-writing-documents.mjs --output /tmp/figaro-writing-documents.json
# Optional comparison against another complete source checkout:
node scripts/evaluate-writing-documents.mjs --source-root /path/to/checkout --output /tmp/figaro-writing-baseline.json
npm run test:focus -- writing-grammar
go test ./internal/writing/...
```

The runner refuses changed document hashes or invalid annotated spans. Keep
human/agent labels separate from analyzer output. The frozen baseline, full raw
before/after evidence, logs, native QA sources and binaries are local at
`/home/grilo/benchmarks/figaro-writing-evaluation-20260920`. The corpus and review
ledger are checked in so the current engine can be evaluated without a network
request. Once used to guide a future fix, these documents are regression data,
not an independent holdout.

The shared grammar fixture now contains 236 positive and 449 valid/ambiguous
examples. The new minimal pairs cover infinitives, passive/perfect auxiliaries,
negation, modifiers, later finite predicates and all three possessive forms.
The native bridge fixture adds Unicode/emphasis and valid-gerund cases.
Pure/native tests require the intended single-error diagnosis and no grammar
finding after each correction; frontend tests validate source mapping.

Verification passed: 290 frontend suites / 2,422 tests with coverage, application
Go tests at 77.7% statement coverage, application and nested Vale race suites,
lint, integrity/architecture checks, the feature index and the existing Chromium
production-startup scenario. Writing test binaries cross-compile for Windows
amd64 and macOS arm64.

One packaged Linux Wails/WebKitGTK run on a private Weston display passed eager
readiness, combined review/rendering, the actual “😀 **Their** going to be
served” suggestion, Markdown-preserving Apply, keyboard Undo, persisted Ignore,
typing and disk save during pending analysis, cancellation/reuse, and shutdown
with work in flight. Native source and event instrumentation exist only in an
external QA snapshot. The test used synthetic DOM/CodeMirror input; it does not
establish physical-input behavior or Windows/macOS runtime behavior. Its report
is included in the JSON ledger. All private-display processes were closed.
