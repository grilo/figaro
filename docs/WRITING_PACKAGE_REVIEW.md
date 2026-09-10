# Writing package coverage review — 2026-09-07

This implementation review follows the decision that every lens must be useful on its own. Sharing advice with another lens is not a reason to disable a rule. Intentional wording can receive contextual advice; an unreviewed replacement must not become an Apply action.

The subsequent UI consolidation groups Spelling, Repetition, Consistency, and
Grammar & punctuation under **Proofreading**, and Plain language plus Readability
under **Clarity**. Directness, Inclusive language, and Formulaic writing remain
separate. Check-family names in this dated review still identify the unchanged
provider rules and their internal memberships. No provider rule was removed.
The subsequent [corpus correction pass](WRITING_CORPUS_FIXES.md) adds contextual
guards and stricter spelling replacement safety while retaining this inventory.

## Changes

- Formulaic writing expands from 21 to 30 pinned Slopless rules. It includes clichés, corporate phrasing, wordiness, redundant phrases, complex-word density, exclamation density, word frequency, hedge stacking, and layered qualifications. Em dashes and curly punctuation remain included. [All 47 remaining exclusions](WRITING_SLOPLESS.md) remain explicit.
- Plain language now exposes the full retext-simplify phrase inventory and native wordiness observations as advice. Only the existing seven reviewed phrase forms can contribute automatic simplification edits. The corpus follow-up suppresses mismatched technical/postal noun senses, including “request”, while retaining useful verb/phrase advice.
- Restore 20 previously unbundled Vale rules: five write-good, ten proselint, and five Microsoft. These extend existing lenses with openings, modifiers, jargon, archaic or potentially ambiguous wording, redundant acronyms, spelling consistency, and sentence length. No new lens or visual component is introduced.
- Inclusive language restores 43 additional native pattern IDs covering generic occupational titles, their plural forms, exclusionary assumptions, accessibility descriptions, and related expressions. This is advisory expansion; the seven reviewed word forms retain their existing alternatives. Personal pronouns, family relationships, personal identity, and medical diagnoses remain protected from inferred rewrites.
- Consistency expands from nine to 29 exact technical names. It also receives proselint’s spelling-variant consistency observations. Brand spelling is conditional on the intended technology; no general terminology house style is imposed.
- Deduplicate only an equivalent concern at the same location (plus the existing verified passive-verb span equivalence). Different rhetorical concerns and length versus readability-formula advice remain separate. Shared findings record all contributing lenses and evidence; only enabled lenses supply Apply actions. Ignore is stable across toggling lenses and remains reversible after restart.

## Execution and safety

All application modules remain eagerly bundled. Slopless and retext execute in the existing prose worker after deferred snapshot bookkeeping and the 500 ms analysis debounce; the embedded Vale worker runs asynchronously after projection. Plain language, Directness, Repetition, Consistency, and Readability now request Vale evidence independently. Enabling one after a cached Formulaic-only result starts the missing analysis. Typing still clears stale results immediately and invalidates late generations; no analyzer runs synchronously in the typing handler.

Microsoft’s sentence-length rule emits a first-word anchor. The pure Vale adapter validates it and maps it to the full existing prose sentence before source validation and deduplication; the corpus follow-up also verifies that sentence’s own above-30-word count. The local length check uses the same threshold. Protected text and unmappable spans remain rejected. Slopless frequency reports identify the first occurrence of each repeated word and its verified count, so separate words can be ignored independently.

Current mapping version **11**, editorial policy **4**, spelling vocabulary **1** (the initial package review used mapping 10 / policy 3). Dependency versions and upstream revisions are unchanged. The 29 canonical names are defined in `frontend/js/core/writingTextlintModel.js`; the 43 additional Inclusive advisory IDs are in `frontend/js/core/writingPackagePolicy.js` and have individual real-adapter fixtures.

## Package-by-package decisions

| Provider | Review outcome and retained limits |
| --- | --- |
| retext-simplify 8.0.0 | Retain the native phrase inventory with contextual technical/postal noun guards. Keep Apply restricted to seven reviewed forms; no provider rule is omitted. |
| retext-passive 5.0.0 | All native detections remain enabled; advisory only because participles can describe states. |
| retext-repeated-words 5.0.0 | All native detections remain enabled, including intentional repetitions such as “had had”; reviewed source edits remain optional. |
| retext-indefinite-article 5.0.0 | Retain reviewed pronunciation corrections and the explicit uncertain-pronunciation guard. Dialect-sensitive “herb”, “historic”, and ambiguous initialisms need pronunciation information the engine lacks. |
| retext-contractions 6.0.0 | Retain contraction checks. Curly-to-straight typography-only changes are routed to the typography lenses; preserve the author’s apostrophe convention for actual contraction repairs. |
| retext-redundant-acronyms 5.0.0 | All native checks retained; proselint adds coverage within the same Plain-language lens. |
| retext-quotes 6.0.2 | All supported native quotation/apostrophe checks retained; choose the prevailing convention, with first occurrence breaking a tie. This is a consistency policy, not a mandatory straight/curly style. |
| retext-equality 7.1.0 | Review the pinned 425-pattern inventory. Expand contextual occupational/expression/accessibility advice by 43 IDs. Retain explicit allowlists for Apply and advisory eligibility: unrelated personal titles, relationships, neutral identity labels, diagnoses, and uncertain regional/cultural substitutions need context the checker cannot establish. The lens does not infer pronouns or erase self-description. |
| retext-sentence-spacing 6.0.0 | Same-line extra sentence spaces remain eligible. Preserve authored line breaks, masked quotations, and gaps across regions; these exclusions protect source structure. |
| retext-diacritics 5.0.0 | All native matches retained. Accented names and borrowed words remain optional; source mappings and quotation protection gate edits. |
| retext-readability 8.0.0 | All configured native formulas remain, age 16, minimum 15 words, threshold 5/7. Restrict to complete paragraph prose; masked content would give misleading estimates. Keep sentence-length advice separately. |
| @textlint-rule/no-unmatched-pair 2.0.4 | Retain all supported native opening-pair reports with validated one-character anchor correction. Closing-only/crossed-pair detection is a package limitation, not an exclusion. No guessed punctuation insertion. |
| textlint-rule-terminology 5.2.16 | Review bundled defaults; adopt 20 more exact technical names. Retain explicit terms instead of blanket defaults, which include semantic substitutions (“argument” to “parameter”), naming migrations, regional forms, and forced hyphenation. Those need a selected author/project style. Dotted technical tokens remain protected source rather than ordinary prose. |
| nspell 2.1.5; dictionary-en/en-gb/es 4.0.0/3.0.0/4.0.0 | No rule subset is hidden for overlap. Preserve selected language, personal dictionary, contractions/possessives, code/reference protection, and unknown-word limits. This is dictionary spelling, not contextual homophone detection. |
| Figaro rules | Consistency, capitalization, punctuation spacing/repeated commas, long sentences, acronym expansion, and pronunciation exceptions remain registered. No unit-spacing rules are added: attached forms such as 8.1Mib are explicitly supported. |
| Slopless 0.2.38 | 30/77 rules, all contributing advisory evidence only. See the separate complete inventory and deferred-rule explanations. No authorship classifier or probability claim. |

Vale is pinned to **3.20.0**. The inventories below cover every rule at each pinned upstream revision, not merely files already bundled. Included YAML is copied unchanged, with SHA-256 manifests and existing licenses retained. Inclusion never passes native imperative messages or unchecked substitution actions directly to the writer.

### write-good

[Pinned upstream source](https://github.com/vale-cli/write-good/tree/c9ceca7f574248a201d5524b001099c5626c7519).

Included (7): `Cliches`, `Illusions`, `Passive`, `So`, `ThereIs`, `TooWordy`, `Weasel`.

Excluded (1): `E-Prime`.

E-Prime prohibits all forms of “to be”. That is a separate constrained-writing mode, not the contract of Directness; detecting passive constructions does not require adopting it. The restored So/ThereIs checks are optional opening advice, and Weasel is presented neutrally as modifier review. Illusions retains its upstream case-sensitive matching alongside retext repetition.

### proselint

[Pinned upstream source](https://github.com/vale-cli/proselint/tree/8e24adbaa5dc6593b331f8bfab23c9af044af406).

Included (14): `Airlinese`, `Archaisms`, `Cliches`, `CorporateSpeak`, `Hedging`, `Hyperbole`, `Jargon`, `Malapropisms`, `Oxymorons`, `RASSyndrome`, `Skunked`, `Spelling`, `Uncomparables`, `Very`.

Excluded (20): `AnimalLabels`, `Annotations`, `Apologizing`, `But`, `Currency`, `Cursing`, `DateCase`, `DateMidnight`, `DateRedundancy`, `DateSpacing`, `DenizenLabels`, `Diacritical`, `GenderBias`, `GroupTerms`, `LGBTOffensive`, `LGBTTerms`, `Needless`, `Nonwords`, `P-Value`, `Typography`.

The remaining rules fall into four concrete groups: Annotations treats ordinary note TODO/NOTE text as unfinished publication artifacts; Apologizing treats “More research is needed” as excessive apology without establishing its role; AnimalLabels/DenizenLabels/GroupTerms and gender/LGBT substitutions need identity, domain, or referent context; Currency/Date*/Typography/Needless/Nonwords/Cursing/But impose publication, register, regional, or typography choices not configured in these lenses. P-Value is a specialist scientific-reporting check. Their omission is not justified by overlap. Archaisms, Skunked, Oxymorons, and Uncomparables are now contextual review rather than upstream declarations of error.

### Microsoft

[Pinned upstream source](https://github.com/vale-cli/Microsoft/tree/8b272ae9d6d6d82d54e3aafa8c1eb4550e4e971e).

Included (6): `Acronyms`, `Adverbs`, `Jargon`, `Passive`, `SentenceLength`, `Wordiness`.

Excluded (41): `AMPM`, `Accessibility`, `Auto`, `Avoid`, `BiasFree`, `Contractions`, `Dashes`, `DateFormat`, `DateNumbers`, `DateOrder`, `Ellipses`, `ExclamationPoints`, `FirstPerson`, `Foreign`, `Gender`, `GenderBias`, `GeneralURL`, `HeadingAcronyms`, `HeadingColons`, `HeadingPunctuation`, `Headings`, `Hyphens`, `Militaristic`, `Negative`, `Ordinal`, `OxfordComma`, `Percentages`, `Plurals`, `QuestionMarks`, `Quotes`, `RangeTime`, `Semicolon`, `Spacing`, `Suspended`, `Terms`, `UIVerbs`, `URLFormat`, `Units`, `Uppercase`, `Vocab`, `We`.

The remaining rules encode a Microsoft house style or need information outside projected prose: heading/UI/URL structure, preferred regional date/time/punctuation/capitalization conventions, author viewpoint/register, organization vocabulary, and context for identity or militaristic metaphors. Examples include prescribed Oxford commas, mandatory contractions, bans on first-person writing, and punctuation placement inside quotation marks. Negative prescribes an en dash for negative numbers; importing that as a correction would be misleading. Units/Spacing and number formatting remain out under the explicit user preference. Passive, Adverbs, Jargon, Wordiness, and SentenceLength are restored because they fit existing contextual lens contracts even where they overlap.

## Verification

Focused regressions cover all 30 Slopless rules, all 20 restored Vale rules through the real embedded engine and pure adapter, all 43 restored Inclusive IDs, and all 29 canonical technical names. Resolver tests prove independent lenses, enabled-lens-only actions, exact concern deduplication, separate same-sentence advice, and serialized/restored Ignore. Use-case tests prove newly supported Vale lenses invalidate a missing-evidence cache and accept typing while analysis is pending. Existing protected-source, pronunciation, identity, cancellation, retry, and worker-startup tests remain applicable.

No component, CodeMirror decoration mechanism, layout, or cursor geometry changes in this review. UI coverage uses the existing styled cards, examples, and actions; browser validation is the representative assembled eager-startup boundary rather than duplicated end-to-end rule cases.

Verification completed: **257 frontend suites / 1,952 tests**, **51/51** combined
real retext/textlint/Vale editorial fixtures, focused native writing/settings/desktop
tests, the Chromium production-startup regression, lint, test integrity, and
application/catalogue builds. The 10,000-word profiling workloads completed in
the background-runtime path; these concurrent-verification measurements are
not UI input-latency claims. Logs and timings are retained at
`/home/grilo/Downloads/figaro-writing-package-review-2026-09-07/`.

The documentation search updated current selection counts, mapping/editorial
versions, fix/advice distinctions, engine routing, and deduplication descriptions.
Dated earlier audits and benchmark results remain explicitly historical.
`git diff --check` still reports the three previously present whitespace-only
lines inside generated upstream Lezer comments in the catalogue bundle; its
exact generated-output check passes. No handwritten whitespace issue remains.
