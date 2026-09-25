# Formulaic writing: Slopless rule selection

Figaro pins **Slopless 0.2.38** (MIT) and enables **29 of its 77 exported rules**.
The remaining **48 rules** are listed below. The package is an English textlint
provider; it runs locally in the existing eager prose worker after debounce.
This is an optional lens, disabled on new notes until selected, and available
for English (US) and English (UK). Selecting Spanish or None unchecks it.

Every finding is advisory, with an explanation and illustrative before/after
example. Slopless contributes no Apply or Fix all action: choosing dash
punctuation or rewriting rhetoric needs context. The existing Ignore action persists per
occurrence and can be reversed through Saved review decisions. Identical
occurrences share a card. Only the same concern at the same location shares
one finding; different concerns on the same sentence remain separate. Clarity and Formulaic writing
each work alone. A shared finding can offer a
reviewed plain-language fix only while Clarity’s plain-language checks are enabled. All native
evidence remains available, and Ignore follows the concern across lens changes.

**Typography is included at the user's request.** `em-dashes` detects an em dash
without whitespace on either side; spaced em dashes and en dashes are outside
this rule. Quotation and apostrophe style also belongs to Formulaic writing, but
comes from the reviewed `retext-quotes` check rather than Slopless: it follows
the note’s prevailing straight or curly convention in both directions and can
apply a mark-only fix. Emphatic punctuation (“!!”) from proselint is also
Formulaic advice; `exclamation-density` stays quiet when a paragraph’s only
exclamation marks form that single run, so one “!!” gets one finding. Blockquotes, code,
frontmatter, math, reference definitions,
URLs and wiki targets stay excluded. These checks do not establish AI
authorship or produce an AI probability score.

## Included rules

- `cliches`
- `corporate-speak`
- `wordiness`
- `simplicity`
- `redundancy`
- `exclamation-density`
- `word-repetition`
- `hedge-stacking`
- `softening-language`

- `em-dashes`
- `boilerplate-framing`
- `generic-signposting`
- `negation-reframe`
- `contrastive-aphorism`
- `blame-reframe`
- `universalizing-claims`
- `authority-padding`
- `boilerplate-conclusion`
- `summative-closer`
- `formulaic-challenges`
- `lesson-framing`
- `observer-guidance`
- `response-wrapper`
- `llm-disclaimer`
- `formal-transition-density`
- `repeated-sentence-starts`
- `empty-emphasis`
- `superficial-analysis`
- `semantic-thinness`

## Excluded rules

### Duplicated typography

This rule reported the same curly marks as the retext-quotes quotation and
apostrophe checks, but only in one direction and without a fix. Formulaic
writing uses retext-quotes alone, so each mark receives one finding.

`smart-quotes`.

### Readability metrics

Deferred pending formula-specific guidance and threshold calibration for this lens. A formula score
or paragraph limit alone is not a formulaic-writing diagnosis. Overlap with Clarity’s readability
checks is not a reason to exclude these forever.

`coleman-liau`, `flesch-kincaid`, `gunning-fog`, `paragraph-length`.

### Specialist academic and narrative advice

These need genre-specific guidance and fixtures; the current lens does not know whether a passage is
academic writing, fiction, or another genre. They remain candidates for a future expansion rather
than blanket prohibitions on those styles.

`academic-boilerplate`, `academic-formula-frames`, `tortured-phrases`, `body-action-density`,
`empty-beat`, `emotion-telling`, `flat-action-cadence`, `low-information-beat-density`,
`perception-verb-density`, `narrative-cliches`, `genre-cliches`, `self-help-cliches`.

### Broad vocabulary and phrase policies

These broad vocabulary lists and frequency policies remain deferred. Their individual word senses,
thresholds, and explanations need further evaluation before presenting them as useful
formulaic-writing advice. A word’s presence alone does not establish a formulaic passage. This is a
coverage limitation, not a claim that other lenses cover every entry or that intentional style
should never be flagged.

`actually-overuse`, `llm-vocabulary`, `llm-vocabulary-density`, `prohibited-words`,
`quietly-filler`, `quietly-overuse`, `silently-filler`, `jargon-faker`, `skunked-terms`,
`uncomparables`, `humble-bragger`, `prohibited-phrases`, `seo-filler`.

### Author-defined terminology

These require a separate term policy. Figaro already has a small reviewed terminology set and does
not supply a Slopless term configuration.

`recommended-terms`, `required-terms`.

### Section-dependent advice

These require reliable first/last-sentence section boundaries. The current textlint input is
protected projected prose, not the Markdown section tree.

`affirmation-closers`, `false-question`, `llm-openers`.

### Formatting and source artifacts

These impose additional heading/colon conventions or inspect placeholders, timestamps and hidden
controls. They need dedicated source-aware review beyond this prose lens.

`artifact-placeholders`, `colon-dramatic`, `fake-timestamps`, `hidden-unicode-controls`,
`sentence-case`.

### Citation-sensitive claims

The projected prose omits link destinations, definitions and quoted evidence. These checks cannot
reliably establish whether a source is missing. The included authority-padding rule is framed only
as optional wording advice and explicitly does not verify citations.

`uncited-authority`, `weasel-attribution`.

### Additional cadence and density constraints

These broader fragment, predicate, list, and document-density rules remain deferred pending
appropriate spans and specific guidance. Deliberate rhythm is not itself a reason for permanent
exclusion. The included word-frequency rule now identifies each repeated word separately, alongside
repeated openings and transitions.

`demonstrative-emphasis`, `fragment-stacking`, `repeated-predicate-end`, `triple-sentence-repeat`,
`triple-word-repeat`, `significance-density`.

The [package review](WRITING_PACKAGE_REVIEW.md) records the same inclusion policy across the other
providers.

## Integration and limits

`writingSloplessRuntime.js` imports only the selected public rule modules.
`writingTextlintRuntime.js` registers them with the existing kernel and text
parser before worker readiness. Every rule receives protected prose. Invalid,
hidden and cross-region native ranges are refused. Consequently, block-to-block
rhetoric and patterns that span protected content are not reported. Earlier
Ignore choices for a curly apostrophe continue to apply to the matching
apostrophe-style finding.

`core/writingSloplessModel.js` owns the selection, neutral presentation,
examples, UTF-16 range validation and repeated-word anchors.
Mapping/configuration version 25 includes the package pin and exact selected
rule map. No CLI, runtime configuration files, model API, network service or
interaction-triggered module import is used. Package upgrades require another
rule review and an updated inventory; upstream additions are never enabled
automatically.

Regression coverage is in `writingSlopless.test.js`: each included real rule
with complete full-scan/incremental equivalence before and after prepending prose,
protected Markdown, CRLF/Unicode/encoded source, exact typography marks,
same-concern deduplication, distinct-concern retention, examples, independent selection, preserved
Consistency behavior,
and reversible serialized Ignore. Shared use-case/worker tests cover debounce,
late-result rejection, cancellation and retry. Component tests cover the Formulaic writing
control and the existing inline buttons; rooted Go tests cover preference
save/restart and Apply to all documents. The production browser startup check
verifies eager worker readiness without later module requests.

The additional density rules remain contextual: complex-word clusters, more than one exclamation
mark per paragraph, words repeated more than five times in a paragraph, and stacked qualifications
are prompts to review. The native thresholds are not correctness requirements. Word frequency
anchors the first occurrence of each repeated word and states its count; ignoring one word does not
hide another word or sentence-opening advice.

### Long-note runtime adapter

The vendor build wraps the pinned tokenizer with Figaro's bounded cache, cleared
between package batches, preserving the original tokenization function and
returning separate token objects to callers. Exact unchanged paragraphs also
reuse raw rule diagnostics across edits, rebased onto the current Markdown
projection. All included rules operate within paragraphs, sentences, or strings;
document-wide Figaro policy still receives the complete note. No Slopless rule is
removed or reconfigured for performance.
The build checks the wrapper seam when vendoring; complete real-package output
equivalence is checked by `node scripts/verify-writing-performance.mjs`. See
[long-note
evidence](WRITING_ENGINE.md#rename-continuity-and-long-note-performance--7-september-2026)
and the separate [usefulness corpus proposal](WRITING_CORPUS.md).
