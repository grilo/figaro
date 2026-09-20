# Additional grammar checks: coverage and native verification

Measured 19 September 2026. This batch adds 28 independent Figaro checks, bringing the reviewed inventory to 15 Harper-port YAML rules plus 34 pure Go checks (49 rule IDs). All six paired native application runs passed.

## Behavioral comparison with native Harper

Native Harper 2.10.0 was run through its official Linux language server on the same strings, with default linters except spelling, American dialect, Markdown parsing, `isolateEnglish=false`, and zero diagnostic delay. Figaro used its actual Go adapter on plain input. This is a native-rule comparison; Figaro’s Markdown projection and whole-block masking are separately tested and can withhold additional visible findings. Counts below concern the named candidate rule on each case; other Harper concerns are excluded. A hit means at least one target finding, not complete correction of every occurrence.

| Corpus | Cases | Figaro target hits | Native Harper target hits |
| --- | ---: | ---: | ---: |
| Reviewed positive | 114 | 114 | 77 |
| Reviewed negative | 208 | 0 | 31 |
| Upstream positive | 683 | 297 | 633 |
| Upstream negative | 414 | 2 | 27 |

The 114 added positive examples and 208 valid/ambiguous examples were reviewed for this implementation and used while tuning it. They are a regression corpus, not a held-out accuracy estimate. No Figaro grammar rule flags those 208 valid cases. Native Harper has substantially broader coverage of its own upstream positive tests: **633/683 versus 297/683**. This remains a conservative subset, not parity.

The 1,097 mechanically extracted upstream cases retain upstream positive/negative labels, which are not independent English judgments. Figaro flags two upstream negative examples containing plural `2020's`; both are accepted differences because the intended decade is plural. The remaining upstream negative examples receive no Figaro grammar finding. Harper itself flags 27 target-rule cases labelled negative by the extracted source corpus, demonstrating why those labels cannot be treated as a production precision score.

The original 21-check baseline has none of the 28 target IDs. It also incorrectly flags past forms such as “found” and “felt”; this batch guards those ambiguous past/base forms. Baseline target-rule zeros therefore do not imply that the old engine had zero grammar false positives.

### Corrections, spans, and dialect boundaries

- Figaro validates every reviewed replacement and requires the corrected sentence to have no remaining grammar warning. All native Figaro alert spans in the comparison were checked against the exact source slice; frontend fixtures additionally check Unicode, CRLF, repeated occurrences, entities, links, emphasis and protected text.
- `Did she went home?` agrees with native Harper on the exact `went` → `go` edit. Other valid alternatives differ: Figaro prefers `a piece of advice` or `piece of luggage` rather than replacing the noun with `tip` or `suitcase`.
- Conflicting modals remain advisory in Figaro; native Harper offers removal alternatives. Multi-line and noncontiguous Markdown replacements also remain advisory.
- The correction review rejected compound-noun edits such as `car park` → `cars park` and `rubber ball` → `rubbers ball`. Those uncertain constructions now abstain. Additional guards preserve “better advise,” possessive gerunds, “a clothing shop,” existential modals, human apposition such as “You programmers are welcome,” and “If there were a problem.”
- A separate 12-string probe ran native Harper in American and British dialects. Figaro applies the same narrow grammar policy under English US/UK and leaves practice/practise, licence/license, collective nouns, embedded subjunctives, and regional “might could” unchanged. This is not a comprehensive dialect evaluation; spelling retains its separate language dictionaries.

### Positive coverage by candidate

The numbers below count cases with a target finding. A missing upstream denominator means the extraction did not recover that generated rule.

| Rule | Reviewed Figaro / cases | Upstream Figaro / cases | Upstream native Harper / cases |
| --- | ---: | ---: | ---: |
| AllowTo | 3/3 | 3/3 | 3/3 |
| AskNoPreposition | 3/3 | 7/11 | 11/11 |
| CriteriaPhenomena | 4/4 | 6/11 | 11/11 |
| DidPast | 8/8 | 19/20 | 19/20 |
| Discuss | 2/2 | 0/0 | 0/0 |
| DoubleModal | 1/1 | 0/5 | 5/5 |
| ElsePossessive | 2/2 | 3/4 | 4/4 |
| Everyday | 5/5 | 10/18 | 17/18 |
| ItsContraction | 4/4 | 9/28 | 27/28 |
| ItsPossessive | 3/3 | 7/20 | 20/20 |
| LetToDo | 6/6 | 18/33 | 33/33 |
| MassNouns | 5/5 | 14/33 | 31/33 |
| ModalBeAdjective | 4/4 | 2/3 | 3/3 |
| NounVerbConfusion | 9/9 | 12/100 | 97/100 |
| OneOfTheSingular | 3/3 | 7/14 | 14/14 |
| OughtToBe | 2/2 | 3/3 | 3/3 |
| PluralDecades | 3/3 | 23/112 | 83/112 |
| PossessiveYour | 3/3 | 1/3 | 2/3 |
| TheirToThere | 6/6 | 22/51 | 51/51 |
| TheirToTheyre | 3/3 | 20/43 | 36/43 |
| ThenThan | 4/4 | 10/22 | 22/22 |
| ThereIsAgreement | 9/9 | 4/6 | 6/6 |
| ThereToTheir | 3/3 | 25/32 | 31/32 |
| TheyreToTheir | 2/2 | 23/31 | 30/31 |
| ToTwoToo | 5/5 | 9/14 | 14/14 |
| WereWhere | 5/5 | 13/24 | 21/24 |
| WorthToDo | 3/3 | 21/24 | 24/24 |
| YourPredicateAdjective | 4/4 | 6/15 | 15/15 |

## Packaged Linux application measurements

| Measurement | Previous 21 checks | Expanded 49 checks |
| --- | ---: | ---: |
| App ready (ms) | 1132.36 | 1135.80 |
| Native preparation (ms) | 121.00 | 135.00 |
| 1,001-word native check (ms) | 9.00 | 10.00 |
| 1,001-word full prose review (ms) | 41.00 | 39.00 |
| 10,010-word native check (ms) | 166.00 | 166.00 |
| 10,010-word full prose review (ms) | 277.00 | 272.50 |
| Unpacked binary (MiB) | 56.45 | 56.53 |
| Gzip bundle (MiB) | 19.25 | 19.28 |

Incremental size: **77,856 bytes (76.0 KiB) unpacked / 31,278 bytes (30.5 KiB) gzip**. Three interleaved fresh launches per build; startup ranges overlap. Initialization overlaps other startup work and is not additive. These samples establish local behavior, not a general performance guarantee.

The common 1,001/10,010-word corpus is the same as the first-batch native benchmark. Each full review requires nonempty resolved evidence and renders real bounded result cards. The new homophone Apply path is separately exercised in every expanded-build launch.

Typing-to-next-frame medians were 19.0 → 16.0 ms, and cancellation medians were 4.0 → 1.0 ms. Those are scripted native-webview observations, not hardware input latency.

### Native workflow

- The pane offers `You're` for `**Your** welcome.`; Apply preserves emphasis and one keyboard Undo restores the original text.
- Ignore persists the distinct `grammar.figarogrammar.yourpredicateadjective` identity.
- Twelve edits and an exact disk save succeed while native analysis is confirmed pending.
- Cancellation rejects obsolete work, the same engine handles the next request, and shutdown completes with work pending.
- All applications and the private display exit; no post-ready application-module requests occur.

### Dense-line mapping probe

A separate one-off Node probe mapped 5,000 repeated homophone findings in a single 70,000-character line. Before reusing Unicode offsets and block eligibility it took about 13,291 ms; afterward it took 8.7 ms with the same 5,000 outputs. This synthetic observation motivated the cache change; it is not a native interaction benchmark or a timing threshold in tests. The regression test checks exact Unicode positions and isolation between protected/unprotected inputs.

## Validation and reproducibility

- 290 frontend suites / 2,400 tests; full integrity and architecture coverage.
- All Go packages; 77.3% statement coverage overall (72% floor), 94.6% in the pure grammar package; writing/desktop and nested Vale race checks.
- Whole-repository lint, production Chromium startup, and Windows amd64/macOS arm64 writing-test cross-compilation.
- Native runtime measurements cover Linux only. Windows/macOS runtime behavior is unmeasured.

The [raw native samples, coverage counts, dialect probe, and source hashes](writing-grammar-expansion-2026-09-19.json) accompany this report. Full case-by-case diagnostics/actions, source corpus, extracted upstream source, scripts, production payloads, and logs are retained in `/home/grilo/benchmarks/figaro-grammar-expansion-20260919`. The source reference and license provenance are pinned in `internal/writing/grammar/SOURCE.json`.

Platform: `Linux-7.0.0-31-generic-x86_64-with-glibc2.43`. Native webview: `Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15 wails.io/605.1.15`.

The [first-batch report](writing-grammar-2026-09-19.md) remains the record for the earlier 15+6 implementation and its separate baseline. Do not add timing samples from the two reports as if they were one run.
