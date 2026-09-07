# Writing suggestion usefulness corpus

Proposal, 2026-09-07. This is a collection and annotation plan, not a completed
benchmark or evidence that the current suggestions are useful. The existing
51 editorial fixtures test selected behavior; the real-adapter equivalence
checks establish that performance changes preserve behavior. Neither measures
usefulness on representative writing.

## What to collect

Start with a 100-passage pilot, then expand to about 300 passages of 100–400
words from at least 50 distinct documents. Use five roughly equal strata:
technical explanation, practical instructions, scientific/educational prose,
narrative/essay writing, and informal notes or drafts. Keep full source documents
available to reviewers: a passage can depend on an acronym defined elsewhere.
Do not assume a published passage is error-free or that a flagged phrase needs
changing just because a package recognizes it.

Keep three separate evaluation sets:

- **Untouched human writing:** the main measure of useful versus distracting
  suggestions. Include polished and rough prose, neutral and personal voices,
  and both US and UK English. At least half the pilot should be passages that
  reviewers consider acceptable without changes.
- **Reviewed minimal pairs:** original acceptable wording alongside one deliberate
  mistake, or an original draft alongside a human-approved revision. Record the
  exact intervention and acceptable alternatives. Keep both members in the same
  split. Synthetic mistakes establish recall; they do not establish usefulness
  on natural mistakes.
- **Whole documents:** initially 20 notes spanning 1k, 5k, 10k, 25k and 50k words.
  Exercise distant acronym definitions, repeated terms, quotation conventions,
  rule density, late edits, cancellation and source mapping. Retain Markdown
  headings, lists, tables, links, quotes and code. Repeated synthetic paragraphs
  remain a separate stress workload, not a representative editorial corpus.

Spanish belongs in a separate spelling-only set, reflecting the actual product
coverage. Do not score unavailable prose lenses as missed Spanish corrections.

## Sources with usable redistribution terms

Verify and archive each selected document's license and revision before copying
it. This table identifies candidates, not a blanket clearance for every embedded
image, quotation, dataset or external link. Start with prose only; retain the
license, attribution and modification notices alongside the corpus data.

| Source | Concrete starting material | Redistribution terms and value |
| --- | --- | --- |
| MDN Web Docs | [HTTP messages](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Messages) and explanatory JavaScript guides | Documentation is generally CC BY-SA 2.5 or later. Preserve attribution and applicable share-alike terms. Useful for technical nouns such as request, response and body, which can attract unhelpful simplification advice. [MDN licensing](https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license). |
| Python documentation | [Errors and exceptions](https://docs.python.org/3/tutorial/errors.html) and other tutorial chapters | Documentation uses PSF License Version 2. Retain the license/copyright notices and describe modifications. Code examples have separate dual-license provisions; do not apply those provisions to prose. Useful for precise terminology and prose mixed with code. [Python license](https://docs.python.org/3/license.html). |
| GOV.UK | Short service instructions, such as [registering to vote](https://www.gov.uk/register-to-vote) | Most content is Crown copyright under the Open Government Licence; the site identifies OGL v3.0 unless otherwise stated. Check page credits and exclude material outside that grant. Useful for concise instructions and British spelling. [GOV.UK terms](https://www.gov.uk/help/terms-conditions). |
| PLOS | [Ten simple rules for writing and sharing computational analyses in Jupyter Notebooks](https://doi.org/10.1371/journal.pcbi.1007007), plus research methods/discussion sections from other fields | PLOS articles generally use CC BY, subject to the article's specific notice. Preserve named authors, title, DOI, license/version and modification notice. Useful for justified hedging, passive voice, acronym definitions and long explanations. [PLOS terms](https://plos.org/terms-of-use/). |
| Standard Ebooks, supplementary | Older fiction or essays selected title by title | Editions are based on works believed to be in the US public domain; Standard Ebooks dedicates its own work to the public domain. This does **not** establish public-domain status elsewhere. Check the title/edition for intended distribution countries before including it. Useful for voice, intentional repetition and punctuation; do not let historical prose dominate a modern writing benchmark. [Collections policy](https://standardebooks.org/contribute/collections-policy), [project licensing explanation](https://standardebooks.org/about). |

The first four sources are the practical starting point. For informal notes and
modern narrative, invite contributions from authors who can license their own
writing explicitly, preferably under CC BY 4.0 or CC0. Obtain permission for
redistribution, remove private information before inclusion, and retain provenance.
Do not use users' vaults, issue comments, online essays or chat logs simply because
they can be read publicly. A repository's code license does not automatically
clear every separately credited document it contains.

Keep third-party texts under their original licenses in a clearly separated
data directory. Do not label the entire collection GPL solely because Figaro's
code is GPL. License our original annotations separately and identify edits to
share-alike text. No third-party corpus texts are imported by this proposal.

## Annotation contract

Give reviewers the intended audience, genre, analysis language and enabled
lenses. Have two people independently review the pilot and a substantial
held-out sample; adjudicate disagreements while retaining both initial labels.
An automated model can help organize cases, but must not supply the sole gold
judgment for advice generated by another automated system.

First review the writing without engine suggestions to identify actual problems
and passages worth keeping. Then show suggestions in randomized order without
package names. Label each suggestion:

| Label | Meaning |
| --- | --- |
| Definite error | A clear mistake with an appropriate correction in context. |
| Useful optional advice | A meaningful improvement for this audience without pretending the original is incorrect. |
| Unnecessary | Technically plausible advice with little benefit, redundant advice, or an intentional choice. |
| Misleading or harmful | Wrong diagnosis, contradictory explanation, lost meaning, inappropriate identity advice or a damaging replacement. |
| Needs context / disagreement | Insufficient evidence or unresolved reviewer disagreement; retain separately. |

Record diagnosis correctness, explanation clarity, example relevance and Apply
safety separately. A valid diagnosis can still offer a bad replacement. Store
source spans, accepted alternatives, rationale and whether a rewrite is actually
needed. For optional style, accept multiple valid rewrites and “keep original”;
do not score everything against a single canonical sentence.

Explicit negative controls should include technical request/response/body,
necessary uncertainty, useful passive constructions, quoted material, purposeful
repetition, personal pronouns/identity, US/UK spellings, Unicode punctuation,
attached units such as `8.1Mib`, and correctly defined acronyms before **and after**
first use. Place some definitions far from their uses. Include genuine article,
spelling, terminology and punctuation errors beside those controls.

Formulaic writing is an optional style lens, not an AI-authorship classifier.
Em dashes and curly quotes are ordinary punctuation. Test whether their advice
is appropriately presented under the selected lens, not whether their presence
identifies an author or proves a text was AI-generated.

## Measurements and release decisions

Report by lens, rule and genre, including sample counts and uncertainty:

- Precision for definite-error claims; usefulness of optional advice separately.
- Unnecessary and misleading suggestions per 1,000 words, plus affected-passage
  rate. A single repeated false positive can make a whole note unpleasant.
- Recall on human-annotated natural errors and on seeded errors **separately**.
  Review a random sample of unflagged spans to find missed problems.
- Meaning-preserving Apply rate and every damaging replacement. Batch fixes need
  their own all-occurrences review; correctness on one occurrence is insufficient.
- Duplicate advice, review burden and grouping: record underlying occurrences
  as well as visible cards so grouping cannot hide excessive detection.
- Actual user accept/ignore decisions in a consented trial, accompanied by a
  short reason. Acceptance alone is not evidence of linguistic correctness.
- Whole-note completion rate, p50/p95 latency, CPU/memory, cancellation/recovery,
  and foreground typing/frame latency on specified hardware and native webviews.

Use provisional targets only until the pilot establishes sample sizes and base
rates. A reasonable starting release gate is zero known damaging Apply cases,
at least 95% reviewed precision for definite-error claims, and at least 80%
useful ratings for optional advice. These are proposed product thresholds, not
measured results or universal standards. Report confidence intervals and do not
approve a rare rule from two successful examples. Set nuisance-rate limits from
pilot writer feedback rather than inventing a favorable aggregate threshold.

Split by complete document and, where possible, author/source family: about
60% development, 20% validation and 20% held-out evaluation. Prevent revisions,
neighboring passages and minimal-pair counterparts from leaking across splits.
Tune on development data, choose policy on validation data, and reserve the
held-out set for release decisions. Freeze the split before tuning.

## Collection manifest and staged rollout

For each document record: stable ID, title, authors/attribution, source URL,
pinned revision or DOI, retrieval date, license/version/URL and required notices,
SHA-256 of original and normalized text, language/genre, preprocessing changes,
source-to-passage offsets and split. Keep original text immutable. Annotations
reference a document hash and UTF-16 span, matching the editor's offset contract;
store Unicode/line-ending normalization explicitly.

First collect and license-check the pilot. Next annotate it and report the
current engine's results **before** changing thresholds. Expand underrepresented
rules and genres, freeze a held-out set, and then calibrate contextual policy.
Any reduction in noise must preserve each lens's independent coverage and be
supported by reviewed positive and negative cases. This work may justify changing
specific hints or Apply eligibility; passing the implementation suite alone cannot.

## Corpus correction follow-up

The [corpus safety contract](WRITING_CORPUS_FIXES.md) records the implementation
following the eight-document pattern audit. Keep website code-language headers
and figure-download controls out of prose, while preserving article captions
and fenced code. Preserve source/license hashes and count these as extraction
artifacts, not lens errors. Re-run the unchanged source snapshot for comparable
regressions and a separately cleaned snapshot for editorial evaluation. An
initial holdout that informs a fix becomes a regression set; it is no longer
independent evidence. Small document samples and agent judgments do not replace
the independent human labels and held-out precision/recall proposed above.
