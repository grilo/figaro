# Local writing engine

Writing review connects the existing shared Writing lenses pane, Pure picker,
owned editor snapshots, rooted preference adapter, and spelling implementation.
The implementation uses packaged Vale CLI output because its stdin/JSON and
process-cancellation boundary is smaller than importing its application internals.
The prose parser and pure resolver run in the same eager worker; the resolver owns
meaning, policy, equivalence, source safety, and grouping. Full projections and raw
observations stay there. Separate eager workers run spelling and durable-decision
tracking. The UI receives resolved suggestions and computed active decision IDs. The user-approved suggestion primitive adds rounded, borderless grouping.

## Capability and packaging contract

The UI exposes five groups: Proofreading (Spelling, Repetition, Consistency,
Grammar & punctuation), Clarity (Plain language, Readability), Directness,
Inclusive language, and Formulaic writing. The check-family names below describe
provider routing and stable persisted IDs, not separate UI choices. Consolidation
retains rules, Ignore identities, asynchronous workers, and exact saved subsets.
Partial groups are labelled; selecting one enables all supported members.
Configured pane controls use the approved shared animated disclosure with a
visible resting surface, inert closed content, and reduced-motion support; Pure
keeps setup visible. Disclosure state is presentation only and never starts
analysis or writes preferences. Spanish
Proofreading contains spelling only and says so in its short summary. Each lens
uses one sentence plus an info button for persistent coverage help, limitations,
and three or four illustrative Before/After examples for supported checks.
Partial-selection details appear in help and the accessible checkbox description.
Spanish help shows spelling examples; unavailable lenses explain support and omit
examples. Help keeps its size during repeated top/bottom scrolling. It never
changes source, starts analysis, or saves preferences.

All prose checks receive the full mapped English document after debounce;
the existing punctuation/terminology checks skip execution when a pure prefilter
finds no candidate opening marks or reviewed technical names. Slopless reviews
eligible prose, with smart-quotes separately reading the typography projection.
All rule code and parsers initialize eagerly.
English US and UK use the same initial prose rules; dictionary differences remain
with the note’s selected analysis language. There is no automatic language detection.

| Dependency / immutable pin | Upstream and notices | Emitted checks / scope | Fix support |
| --- | --- | --- | --- |
| Vale 3.20.0 | [Vale release](https://github.com/vale-cli/vale/releases/tag/v3.20.0), MIT in `internal/writing/assets/LICENSE` | Packaged native CLI; explicit Figaro configuration, stdin prose, JSON output | Selected rules are advisory; no native generated actions |
| write-good `c9ceca7f574248a201d5524b001099c5626c7519` | [Pinned style source](https://github.com/vale-cli/write-good/tree/c9ceca7f574248a201d5524b001099c5626c7519), MIT in `internal/writing/styles/LICENSE` | Seven rules: Passive, TooWordy, Cliches, Illusions, So, ThereIs, Weasel; E-Prime and Vale built-ins disabled | Detection only; compatible retext evidence can contribute a phrase fix |
| retext-passive 5.0.0 | [Source](https://github.com/retextjs/retext-passive), MIT | `retext-passive` plus native rule IDs; participle-based possible passive detection | Advisory only |
| retext-simplify 8.0.0 | [Source](https://github.com/retextjs/retext-simplify), MIT | `retext-simplify` plus native message subtypes; all native phrases map to contextual wordiness or vocabulary advice | Seven reviewed phrase forms offer verified alternatives, case matched, contiguous source only |
| retext-repeated-words 5.0.0 | [Source](https://github.com/retextjs/retext-repeated-words), MIT | `retext-repeated-words`; possible adjacent repetition, including upstream intentional-pattern exceptions | Keep one occurrence when the mapping is safe |
| retext-indefinite-article 5.0.0 | [Source](https://github.com/retextjs/retext-indefinite-article), MIT | English “a/an” with reviewed pronunciation exceptions and protected-context guards | Replace only the article; withhold uncertain pronunciation families |
| retext-contractions 6.0.0 | [Source](https://github.com/retextjs/retext-contractions), MIT | Missing/misplaced contraction apostrophes; correct straight/curly punctuation is not a grammar warning | Keep the existing apostrophe style, or follow the prevailing authored style |
| retext-redundant-acronyms 5.0.0 | [Source](https://github.com/retextjs/retext-redundant-acronyms), MIT | Redundant expanded acronym wording such as “ATM machine” | Individual contiguous phrase fixes |
| retext-quotes 6.0.2 | [Source](https://github.com/retextjs/retext-quotes), MIT | Quote/nesting and apostrophe conventions inferred from the note | Validated delimiter-only edits; paired/nested quote changes are one transaction |
| retext-equality 7.1.0 | [Source](https://github.com/retextjs/retext-equality), MIT | Reviewed roles, expressions, and accessibility descriptions; 43 additional advisory IDs | Curated individual alternatives; personal pronouns and identity descriptions are withheld |
| retext-sentence-spacing 6.0.0 | [Source](https://github.com/retextjs/retext-sentence-spacing), MIT | One-space suggestions between same-line sentences under Consistency | Adjacent-word context, explicit space counts, safe contiguous source only; line breaks preserved |
| retext-diacritics 5.0.0 | [Source](https://github.com/retextjs/retext-diacritics), MIT | Optional accented forms of selected names and borrowed words under Consistency | Individual contextual alternatives, preserving capitalization and source syntax |
| retext-readability 8.0.0 | [Source](https://github.com/retextjs/retext-readability), MIT | Conservative complex-sentence advice under Readability | Advisory only; length and complexity remain separate concerns |
| @textlint-rule/textlint-rule-no-unmatched-pair 2.0.4 | [Source](https://github.com/textlint-rule/textlint-rule-no-unmatched-pair), MIT | Unmatched opening punctuation under Grammar & punctuation | Advisory example; no guessed closing position |
| textlint-rule-terminology 5.2.16 | [Source](https://github.com/sapegin/textlint-rule-terminology), MIT | 29 reviewed technical names under Consistency; defaults/file configuration disabled | Exact canonical spelling, individual safe source edits |
| Slopless 0.2.38 | [Source](https://github.com/berelevant-ai/slopless), MIT in bundled writing notices | 30 selected English rules under Formulaic writing; [all 47 exclusions](WRITING_SLOPLESS.md) | Advisory examples and reversible Ignore only, including em-dash/curly-punctuation advice |
| Microsoft `8b272ae9d6d6d82d54e3aafa8c1eb4550e4e971e` | [Pinned source](https://github.com/vale-cli/Microsoft/tree/8b272ae9d6d6d82d54e3aafa8c1eb4550e4e971e), MIT in `internal/writing/styles/Microsoft/LICENSE` | Acronyms, Adverbs, Jargon, Passive, SentenceLength, Wordiness; hashes in `SOURCE.json` | General example only; no guessed expansion |
| proselint `8e24adbaa5dc6593b331f8bfab23c9af044af406` | [Pinned source](https://github.com/vale-cli/proselint/tree/8e24adbaa5dc6593b331f8bfab23c9af044af406), BSD-3-Clause in `internal/writing/styles/proselint/LICENSE` | Fourteen selected rules; full inventory in [package review](WRITING_PACKAGE_REVIEW.md), hashes in `SOURCE.json` | General examples only; no generated replacements |
| Figaro writing rules 1 | `frontend/js/core/writingAdditionalRules.js`, repository license | Curated consistency, punctuation, and paragraph sentence length | Individual term/punctuation fixes; Readability is advisory |
| Existing nspell 2.1.5 | [Source](https://github.com/wooorm/nspell), MIT | `figaro-spelling`; the same exclusions, dictionary policy, and conservative suggestions as existing spellcheck | Existing conservative word alternatives, plus current-snapshot validation |

The eagerly bundled parser dependencies are unified 11.0.5, remark-parse 11.0.0,
remark-gfm 4.0.1, remark-math 6.0.0, remark-frontmatter 5.0.0, retext-english 5.0.0,
retext-syntax-urls 4.0.0, vfile 6.0.3, and micromark-util-decode-string 2.0.1 (MIT).
They supply syntax/prose parsing rather than additional user-facing checks.
The actual textlint rules run through `@textlint/kernel` 15.8.0 and the maintained
`@textlint/textlint-plugin-text` 15.8.0 (MIT), warmed before worker readiness.
`assert` 2.1.0 and `process` 0.11.10 (MIT) supply their browser dependencies.
The build narrowly replaces terminology's optional Node file loaders with
throwing adapters: accidental file/default loading fails instead of reading
external configuration. The reviewed term array is the only input. Initialization
failure rejects readiness and terminates the worker; Retry creates a fresh one.
`analyzeWriting` is the asynchronous production entry point; `analyzeRetext`
remains the focused retext adapter used by its own tests.
`retext-syntax-urls` does not replace Markdown parsing. The worker bundle uses
the non-DOM character-reference decoder so entity handling also works in workers.
Native observation details preserve versions, rule/message IDs, original spans,
messages, severity, and expected actions. Evidence independence is unknown;
corroboration does not produce numerical confidence or increase priority.

US spelling uses dictionary-en 4.0.0, UK uses dictionary-en-gb 3.0.0, and Spanish
uses dictionary-es 4.0.0. Existing dictionary-specific notices remain in
`frontend/vendored/spellcheck/`; Spanish retains its GPL/LGPL/MPL choice of terms.
Generated `frontend/vendored/writing/NOTICES.txt` carries dependency notices.
Selecting a lens does not change those spelling resources.

Build preparation verifies release-archive SHA-256 values before extracting the
Vale executable. `cmd/prepare-writing-assets/main.go` is the checksum manifest
for Linux, Windows, and macOS amd64/arm64. Native macOS preparation embeds both
architectures; cross builds explicitly prepare their target. Runtime extracts
only bundled assets to a private cache directory and removes it on shutdown.
Configuration (`--config` plus `--no-global`) and process working directory are controlled by Figaro, never
inferred from the vault. Source passes through stdin and is not written to a
scratch note. Vale input/output is bounded at 4 MiB. Initialization has a
five-second deadline; analysis uses source-size budgets bounded to 5–30 seconds
(two seconds per started 64 Ki UTF-16 units in workers or UTF-8 bytes in Vale).
Workers use the full source for resolve/recovery and the larger before/after
source for decision tracking. Cancellation still terminates active work immediately. The installed app needs no Node, package manager, network
analyzer, custom styles, or user-installed Vale.

## Asynchronous execution contract

Typing only queues immutable document readers and actual numeric changed ranges.
Coalesced tasks dispatch worker requests; neither input handlers nor microtasks
scan review history. The prose worker resolves partial/final engine evidence,
converts Vale spans, matches suppressions, maps display identity, and prepares
cards/inline findings. Generation checks discard superseded results. Decision
jobs run in a separately serialized worker, including with all lenses disabled;
context uniqueness is computed once rather than once per repeated candidate.
No worker failure falls back to main-thread analysis. Resolution explicitly
requires completed prose evidence when selected checks need it.
`usecases/writingProse.js` caches by exact source and rebuilds missing evidence
inside a replacement worker after failure. If rebuilding fails, it returns
independent spelling results with an explicit failure and excludes unmappable
Vale output. The coordinator keeps partial status and Retry analysis until a
full recovery succeeds; a later spelling completion cannot silently clear it. Source edits still clear
stale marks immediately, and explicit Apply validates current source before its
normal undoable editor transaction. UI rendering remains bounded to the requested
card page; saved-decision rows consume background activity results.

Wiki syntax ranges come from the same pure target-first parser used by navigation.
Every lens protects destinations, heading fragments, and embeds, including hidden
aliased targets; only safe explicit display aliases remain eligible prose.

## Editorial scope and source safety

Plain language exposes all native simplification matches as contextual advice. Automatic simplification edits remain restricted to this reviewed set:

- `in order to` → `to`
- `due to the fact that` → a retext-provided shorter alternative
- `at this point in time` → a retext-provided shorter alternative
- `utilize`, `utilizes`, `utilized`, `utilizing` → the corresponding simpler word

Other simplification observations remain visible without Apply. The known noun
“request” → “ask” problem restricts editing, not the availability of contextual
advice. The redundant-acronym package separately supplies its reviewed acronym
alternatives. Native Vale and Slopless substitutions never become edits directly.

Selecting Directness enables an invitation to consider naming the actor,
without an additional profile gate. Selected proselint qualifying-phrase and emphatic-punctuation advice is also
available, always advisory. Both passive detectors can identify “was written,” with retext returning
only “written”; verified auxiliary/participle anchors merge those into one finding.
Detector lexicons are incomplete: retext-passive does not identify every passive
participle (for example “rejected” in the representative prompt). Vale may supply
additional evidence; neither detector establishes that passive wording is wrong.

The consistency check family within Proofreading checks a reviewed set of mixed forms: email/e-mail,
website/web site, online/on-line, offline/off-line, and ebook/e-book, plus exact
PDF/pdf and HTML/html capitalization. It flags both authored forms and offers
the other, without imposing one preferred spelling or making a bulk edit.
Ordinary sentence capitalization does not count as a term mismatch.
`retext-quotes` separately checks quote and apostrophe typography. The pure
`writingTypographyModel.js` chooses the prevailing outer quote style (first
occurrence on a tie), then the first quote in that style determines outer
single/double nesting. Apostrophes independently follow prevailing authored
prose, falling back to the quote style when none exist. Correct consistent
straight or smart styles remain untouched. The typography projection exposes
quote punctuation without allowing prose checks to rewrite quoted wording.
Grouped paired/nested quote fixes validate each delimiter and preserve every
other source byte, including Markdown formatting. Encoded/escaped delimiters
remain advisory; unsafe or overlapping marker edits are refused.

The sentence-spacing package suggests one space between same-line sentences.
Figaro expands its whitespace span to adjacent words for usable underlines and
Before/After examples, retaining the original whitespace evidence. The example
label states the space counts explicitly. It never crosses a prose region,
hidden content, or authored soft/hard line break. Discontinuous Markdown and
encoded whitespace remain advisory. Diacritics are optional contextual choices:
“Beyonce” can become “Beyoncé,” “cafe” can become “café,” and “his resume” can
become “his résumé”; the verb “resume” is unchanged. An accented form is never
imposed automatically, and all edits use the existing exact-source guard.

`textlint-rule-terminology` reviews JavaScript, TypeScript, GitHub, GitLab,
PostgreSQL, GraphQL, WebAssembly, Markdown, and SQLite, plus 20 further technical
names including MongoDB, PowerShell, WordPress, OpenAPI, and Cloudflare. The
complete 29-name list is in `core/writingTextlintModel.js`. It offers the exact
canonical case even for an uppercase source such as “JAVASCRIPT.” Other default
terms, preferred regional spellings, and subjective substitutions are disabled.
Quoted text, code, links' destinations, paths, and identifiers stay protected.
Encoded or discontinuous Markdown can receive advice but never a destructive fix.

Grammar & punctuation uses pinned article and contraction analysis, spaces before comma,
semicolon, colon, question mark and exclamation mark, and repeated commas.
Article context must reach the next prose word without crossing an excluded
range. Sentence-initial “A” becomes “An”; acronym capitalization alternatives
retain the chosen form. Contractions repair missing/misplaced apostrophes while
preserving the existing style, or using the prevailing convention if absent.
Correct straight/curly contraction typography belongs to Consistency or optional Formulaic style advice, rather than Grammar. Ellipses and expressive punctuation remain unchanged.

Editorial policy version 4 retains the correction to the upstream article treatment for reviewed
consonant-sounding vowels (“a unicorn,” “a European”) and silent consonants
(“an hour,” “an honest answer”). Unknown `u`/`eu` families and dialect-dependent
`herb`/`historic`, SQL, and URL pronunciations are withheld. Reviewed cases can
span a soft wrap within eligible prose; context cannot cross protected spans.
These are selected rules, not complete agreement or contextual-homophone checks.

The unmatched-pair rule flags supported opening marks left without a matching
closer, including parentheses, brackets, braces, and straight double quotes.
The pinned package reports one position after the opener; the adapter verifies
the native message and shifts the underline to the actual punctuation. Escaped
marks and existing protected regions are excluded. Pairing may span sentences.
This is not a complete nesting validator: lone closing marks, some crossing
nests, and curly English quote pairs are outside its coverage. All findings stay
advisory with a general example; Figaro never guesses where to insert a closer.

Readability checks paragraph sentences of more than 30 words using the existing
sentence parser and reviews complex sentences with `retext-readability`.
Figaro uses `age: 16`, `minWords: 15`, and `threshold: 5/7`, requiring at least
five agreeing formulas. These conservative settings differ from the package's
five-word / four-formula defaults because short sentences can skew its estimates.
The package applies Dale–Chall, Automated Readability, Coleman–Liau, Flesch,
Gunning-Fog, SMOG, and Spache. It estimates each sentence, not the whole note's
reading grade. Both checks skip headings, table cells, and sentences containing
excluded spans. Length and formula advice remain separate even at identical spans. Equivalent
length findings from Figaro and Microsoft retain both native sources. Microsoft
uses the same threshold; its native anchor expands only when the mapped sentence itself exceeds 30 words. The local check preserves eligible long-sentence coverage when native sentence boundaries disagree. The explanation distinguishes measured length from formula
estimates and includes a general splitting/simplifying example; no automatic
rewrite or reading-grade score is offered, and the estimates do not measure
writing quality. Mapping/configuration version 11 includes package pins, editorial policy version 4, spelling vocabulary version 1,
reviewed terms/acronym exceptions, and formula options so stale findings cannot survive a policy change. All prose
lenses support English US/UK, save independently with the existing version 3
preferences, and reuse dotted marks, grouped cards, Ignore, and guarded fixes.
Vale runs when Plain language, Directness, Repetition, Consistency, or Readability needs it. Enabling one of these check families through its UI group
after another prose lens requests missing native evidence before reuse.

Plain language adds redundant acronyms, clichés, and corporate jargon. Identical
cliché/corporate-jargon spans merge into a single stock-phrase finding with both
sources; overlapping but independent editorial goals remain distinct. Directness
adds selected qualifying phrases from proselint Hedging and repeated `!`/`?`
from Hyperbole. These are not semantic certainty or exaggeration detectors.
Their explanations invite review, explicitly retain accurate uncertainty, and
show general examples without fabricated source-specific replacements. Fourteen selected proselint files are copied unchanged from the immutable revision;
their SHA-256 manifest and license travel with the bundled style directory.
The adapter and profiler consume the same `styles/figaro.ini` configuration.

Plain language also reviews undefined acronyms using `Microsoft.Acronyms`
from the pinned Microsoft style. It checks three-to-five-letter uppercase
acronyms and retains upstream familiar exceptions (including API, JSON, and PDF),
plus Figaro's reviewed ATM/PIN exceptions. The native rule recognizes title-case
expansions; a pure supplemental policy also accepts lowercase expansions whose
initials match, such as “service level objective (SLO).” Definitions anywhere in
eligible prose count, regardless of first-use order, including soft line wraps.
Reverse definitions (`SLO (service level objective)`) and plural acronym forms
are recognized. A bounded noun-of-noun reorder also accepts forms such as
“automatic insertion of semicolons (ASI)”; arbitrary rewordings remain unsupported.
The bundled English dictionary’s lowercase three-to-five-letter headwords also
keep ordinary capitals such as KEEP/SHORT quiet; uppercase dictionary entries do
not exempt unknown abbreviations. Hyphenated expansions supply separate initials,
with conventional eX initials supported (for example user-experience design / UXD).
Ambiguous capitals that are also ordinary words favor avoiding false alarms.
The supplemental match does not cross paragraphs, quoted text, or hidden source. This is a bounded
pattern check, not semantic knowledge of an acronym's meaning. Advice invites
the writer to consider their audience and includes a general SLO example, with
persistent Ignore and document-scoped acceptance, but no fabricated expansion or Apply action. No other Microsoft or Google
style rules are bundled. Number/unit spacing is deliberately excluded: `8.1Mib`,
`10MB`, and `20ms` stay as authored.

Inclusive language is the eighth, independently selected lens. `retext-equality`
provides observations, but Figaro offers only reviewed chair-title, mankind,
manpower, man-made, blacklist, and whitelist alternatives. Obviously/simply/easy/
easily/clearly remain contextual advice only. Personal pronouns, disability and
identity descriptions, and unreviewed substitutions are withheld. Exact source
mapping alone cannot establish editorial suitability. Remaining alternatives
are individual guarded choices, never automatic or bulk edits. It uses the existing
language restrictions, per-note persistence, shared controls, and persistent occurrence Ignore.

Prose analysis excludes Markdown blockquotes and balanced straight or
curly single/double quotations inside one prose block. Escaped quotes do not delimit,
in-word apostrophes remain ordinary prose, and unmatched quotes remain analyzable. This
is a bounded syntax rule, not attribution or language inference. Frontmatter,
code, diagram bodies, math, link destinations, URL/path tokens, and recognized
technical identifiers are protected. Existing spelling exclusions remain separate.

All issue/edit ranges are half-open UTF-16 offsets into the owned immutable source.
Vale reports one-based inclusive code-point columns; real Unicode adapter tests
establish the conversion. Markdown extraction records each projected unit's exact
source range. Entities, escapes, line endings, and markup may produce explanation-
only phrase findings when a contiguous syntax-preserving replacement cannot be proven.
Quote-style fixes are the narrow exception: the resolver validates only delimiter
edits and assembles one replacement preserving all intervening source bytes.
Every normalized finding also captures its exact source slice independently
from projected wording; inline freshness checks therefore support a long
sentence across Markdown formatting without accepting stale source.
Apply checks identity, revision, effective configuration, bounds, and original
source synchronously, then makes one isolated undoable transaction. Group context
and display IDs never authorize an edit. Display continuity follows only unambiguously unchanged prefix/suffix ranges
within the current session. Durable occurrence decisions instead require a unique
match of their saved source wording and surrounding context. Overlap alone never merges independent findings.

The exact settings schema and workflow are in [PROMPT.md](PROMPT.md#77a-writing-lenses-and-local-review).
Version 3 saves lens combinations and language per note path. Versions 1/2
read primary plus overlays as independent lenses and retain legacy vault choices
as defaults; explicit save migrates without losing unknown fields or other notes.
The former profile gate is removed. Proofreading and the analysis language are the sole
spelling controls; old Settings and YAML values are preserved but ignored.

Spelling eligibility uses the existing pure Lezer Markdown parser through
`core/spellingModel.js`. It excludes explicit reference IDs, definitions and
indented code (including nested blocks), preserves exact UTF-16 offsets, and
shares unfinished/closed YAML boundaries with metadata. The spelling adapter,
context-menu lookup and worker resolver use the same ranges; protected or
mismatched observations never become actionable findings. Defined shortcut and
collapsed link/image labels stay advisory, with an explanation: their visible
text is also the reference key. All prose fixes crossing those labels are
withheld; explicit `[label][id]` labels remain editable.

Pure dictionary policy in `core/spellingSuggestionsModel.js` recognizes valid
English plural/name possessives such as `users’` and `James'`. Unknown stems
remain checkable. Candidate stem corrections retain the exact authored
apostrophe and possessive suffix and must pass dictionary validation; they
cannot merely remove or relocate possession. Spanish keeps its own dictionary
policy. Parsed emphasis marks are separated before technical-token masking;
underscores do not hide prose or truncate possessives. Closing single quotes
are outside spelling tokens, and numeric compounds remain intact. The reviewed
English vocabulary recognizes common technical terms and acronym plurals.
Unreviewed capitalized-word alternatives require an adjacent transposition;
invented possessive apostrophes are withheld, while reviewed contraction shapes
remain available. Recognition of a term never
authorizes a rewrite. Analysis parsing and resolution remain worker-only; no scans are added
to input handlers. Mapping/configuration version 11 invalidates older evidence.

## Corpus context guards

The [corpus correction contract](WRITING_CORPUS_FIXES.md) covers the eight
confirmed patterns. Shared pure context guards suppress mismatched technical
function/request/parameter/type and postal-address advice without removing any
provider rules. They also distinguish inclusive reader assumptions from
negation, limiting phrases, established easy-read wording and descriptive
clarity. Surviving tone advice explains the reader assumption specifically.
URL masking preserves surrounding punctuation and balanced internal parentheses.
All checks remain in the asynchronous worker architecture.

## Inline review and personal spelling words

Current findings decorate their existing source text with the same dotted
underline as spellcheck. Hover opens an explanation, before/after wording for available fixes, and applicable Apply/Ignore
actions; Ctrl/Cmd+. opens and focuses the popup at the caret, Tab/Shift+Tab
traverse its buttons, and Escape restores editor focus. The popup works with the
pane closed and in Pure mode. Source edits clear it and its marks immediately;
its actions retain the displayed snapshot and share pane source guards. Marks
do not replace source or change printable Markdown. Multiple findings at the
same position share a popup. Rendered ordinary-link labels, explicit wiki aliases,
and reference labels carry these marks inside their existing widgets; the popup
keeps link destination/title information available. Label segments are mapped
purely and painted only for mounted widgets, without replacing widget identity,
changing activation, or introducing saved/printable syntax. Hover geometry uses
the complete widget range, so the pointer can enter the review popup. Passive advice includes a labelled general example
without manufacturing a document-specific actor or fix. The pane separates each
suggestion using a rounded borderless theme surface.

Spelling additionally offers Add to dictionary. Accepted whole words persist
per vault in version 1 `.config/spelling-dictionary.json`, with case-insensitive
matching and normalized apostrophes across spelling languages. Inline review and the existing context menu filter these words; the Spelling
lens owns both paths and deselecting it turns off spelling for this note. Saves
are serialized and pessimistic, and the rooted adapter preserves unknown fields,
rejects invalid/newer files and outside symlinks, and writes atomically. Failure
keeps the suggestion and offers retry. There is no dictionary management UI;
occurrence Ignore remains separate, is saved per note, and can be reversed in
Saved review decisions.

## Durable review decisions

**Ignore this occurrence** saves the exact canonical kind, language, source
wording, and up to 64 UTF-16 units of before/after context, avoiding split
surrogates. Known contiguous editor changes outside an intact target refresh
its context and queue a save after 500 ms. The adapter delivers the initial
immutable document snapshot only after its owning controller exists, including
when the mount event precedes deferred selection, so the first nearby edit can
refresh the saved context too; edits that intersect the target do
not get a guessed mapping. Reload first requires a unique complete context.
If none exists, exactly one target must match an unchanged context side with
at least 12 trimmed characters and two words and a unique occurrence of that
context side. Duplicated complete contexts
never fall back. Records remain available for reversal, with visible context
and an Inactive label when unidentifiable. This remains conservative matching,
not semantic identity tracking. Plain changed ranges adapted from actual
CodeMirror transactions distinguish deleting an ignored paragraph from changing
a similar paragraph. If an edit touches the target, optional `exactOnly: true`
persists the requirement for its original complete context; Undo can restore
that context, but another occurrence cannot inherit the weaker match.

**Accept “SLO” in this document** applies to all present/future undefined-acronym
findings for SLO in the selected analysis language. It does not suppress spelling,
redundant-acronym, or other rule kinds. These decisions are separate from the
vault-wide spelling dictionary and lens defaults; Apply to all documents does
not copy them. Both pane and inline actions validate the rendered source and
snapshot before constructing a decision. No decision edits Markdown.

Version 1 `.config/writing-decisions.json` stores
`{"version":1,"documents":{"Memo.md":{"decisions":[{"id":"example","type":"acronym","language":"en-US","acronym":"SLO"}]}}}`.
Per-document use cases load without creating a file and publish a changed decision
list only after a successful save. The rooted adapter locks read/modify/write,
uses private atomic replacement, preserves unknown fields and other documents,
and rejects corrupt/newer files, outside symlinks, invalid records, and colliding
IDs. Replaying add, remove, or reanchor is idempotent. Reanchor updates only
context on existing matching identities, preserving unknown fields and never
resurrecting removed records. New decisions are pessimistic; updated anchors
follow known edits asynchronously through an injected worker port, and overlapping
saves queue the newer context. Pending adds are tracked too, without modifying
their idempotent storage command; an add persists its reconciled anchor before
finishing. A deleted target cannot transfer Ignore to a surviving occurrence.
Tracking errors retain source changes for retry and suspend review rather than
scanning the UI thread or publishing unchecked suppressions.
Load errors show **Retry review decisions**. An uncertain save retains the
pending command for exact retry and offers **Reload saved decisions** to reconcile
the actual stored set. Reload requests coalesce and await the active tracking
job before installing that set. Further edits stay queued during loading and
then run in order against the loaded records, with results matched by ID. No
old source snapshot is appended behind newer edits, and removed records cannot
replace surviving or newly loaded decisions. A failed tracking job retains its
edit for recovery against the loaded set. Concurrent load/tracking failures
retain a separate retryable load state. Retry restores authoritative decisions
before draining queued source changes, so neither failure can strand Loading
or silently restart tracking against an unreconciled set. A definite capacity rejection instead releases that
command, explains the limit, and leaves Restore available to make room. Delayed responses stay with the
original note, including when the user switches away. Maximums are 1,000 records
per document and 16 MiB for the file; source snippets above 8,192 UTF-16 units
cannot be captured by the frontend. Renaming currently uses a new path's decision
set and leaves the old record intact.

**Saved review decisions** in the pane and Pure picker lists 25 records at a
time through existing buttons and suggestion cards. **Restore suggestion**
removes one occurrence decision; **Review acronym again** removes one acronym
acceptance. Reversal is available even with disabled lenses or changed text.
The controls show saving/errors and preserve accessible focus. Successful async
inline actions restore focus only while the originating editor/source still
owns it. The decisions participate in mapping/configuration version 11; adding
or removing them reuses current analyzer evidence and invalidates stale actions.

## Bounded review and bulk changes

The pure review model groups identical kind, intent, wording, message, and
replacement sets into one card, retaining all source occurrences. Previous/Next
navigates the selected occurrence; individual Apply/Ignore uses that occurrence.
The pane initially mounts four distinct cards and adds four through Show more
suggestions, even when every finding belongs to one passage. Counts distinguish
distinct suggestions from occurrences. Configured documents start with lens
setup collapsed; the language picker stays first. Pure keeps configuration
visible in its existing scrollable picker. Each lens states its coverage limits.

Apply-to-all is document-scoped and requires at least two identical occurrences,
exactly one fix each, and a reviewed kind: technical terminology, spelling,
complex-word/wordiness, punctuation-spacing, repeated-comma, or sentence-spacing.
Spelling also requires the adapter’s explicit reviewed-correction flag; a sole
dictionary candidate is insufficient. Other dictionary alternatives remain
individual and require contextual judgment. It is unavailable while checks are
still running. The pure plan validates the
complete snapshot and every source range, refuses overlaps, and either returns
all edits or none. One CodeMirror transaction makes the operation one Undo/Redo
step. Contextual, article, quotation, mixed-form consistency, and multiple-choice
advice remains individual; there is no blanket fix-all across unrelated rules.

Actions precede one comparison in both review surfaces. Only two alternatives
are initially visible; More alternatives reveals and focuses the next choice.
Details explains why the rule fired and when retaining the original is sensible.
Technical diagnostics is a separate disclosure; raw JSON is created only on
explicit request. All controls reuse approved primitives and existing theme states.

## Historical editorial evaluation (before the package coverage review)

[Labelled fixtures](../tests/fixtures/writing-editorial.json) contain both desired
and undesired advice. `node scripts/profile-writing.mjs` runs the actual pinned
retext, textlint, and packaged Vale implementations, checks canonical kinds (not just total
counts), and reports raw observations, suppression, and unique results. CI runs
this report after asset preparation. Normal unit tests also cover these fixtures.
The current report uses `workerRaw`/`workerMs` for combined JavaScript analysis;
older reports' `retextRaw`/`retextMs` fields reflect the earlier retext-only worker.
Timing workloads include both ordinary prose and repeated technical names with
paired punctuation, so the relevance prefilter does not hide full-kernel cost.

The initial 2026-09-06 run passed all 12 cases: all six expected visible findings were
present and there were zero unwanted findings by canonical concept in this set.
This small curated evaluation is not an estimate of accuracy on arbitrary prose.

| Fixture | retext raw | Vale raw | Unified visible |
| --- | ---: | ---: | ---: |
| Ordinary unflagged prose | 0 | 0 | 0 |
| Useful shorter phrase | 1 | 1 | 1 |
| Familiar vocabulary | 1 | 1 | 1 |
| Necessary technical noun | 2 | 0 | 0 |
| Passive with Directness unselected | 1 | 1 | 0 |
| Passive with Directness selected | 1 | 1 | 1 |
| Quoted wording/repetition | 0 | 0 | 0 |
| Intentional “had had” | 0 | 0 | 0 |
| Accidental adjacent repetition | 1 | 0 | 1 |
| Code, math, URL | 0 | 0 | 0 |
| Passive and shortening in one sentence | 2 | 2 | 2 |
| Unsupported prose language | disabled | disabled | 0 |

Retained technical-noun observations demonstrate deliberate suppression; passive advice
appears only when Directness is selected. Multiple independent concepts share a passage but retain separate
findings. Pure tests additionally cover ambiguous overlaps, conflicts, duplicate
evidence, malformed/unknown output, CRLF/Unicode, and stale/colliding fixes.

## Native verification and measurements

Measured on 2026-09-06 using an AMD Ryzen 7 9800X3D host exposed through VMware,
Ubuntu 26.04, GTK 3.24.52, WebKitGTK 2.52.6, and an isolated 1360×960 Xvfb display
with software rendering. The binary used `desktop,production,webkit2_41` tags.
No user desktop or personal vault was used. The workspace MCP was unavailable,
so this check used a rootless isolated X server and a disposable vault.

In the packaged Linux app, both prose engines initialized and merged their
results. Source navigation selected the exact phrase around rendered emphasis;
Arrow Up/Down from both directions, mouse placement, and drag selection worked.
Apply changed only “utilize” to “use,” preserved `**ordinary words**`, and one
Undo restored the exact original saved Markdown. The final bundled spelling
worker returned the existing `teh` → `the` correction for both occurrences.
Chromium additionally verified keyboard Enter activation, shared-pane/Pure focus,
and eager worker startup without post-ready application module requests.
Windows WebView2 and macOS WKWebView were not available locally; CI exercises
their Go/platform contracts but does not establish native cursor geometry there.

A native instrumentation overlay ran three repetitions at each size against the
actual worker, Wails Vale adapter, pure resolver, and bounded passage view. The
fixture repeats a 15-word sentence in separate paragraphs: 1,005/10,005 actual
words, yielding 201/2,001 findings. Both engines contribute equal raw counts and
merge to those unique counts. No analyzer timed out in these six runs.

| Approximate words | retext worker ms | Vale bridge/process ms | Main-thread resolver ms | Render-to-next-frame ms | Combined ms |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 53 / 27 / 24 | 106 / 106 / 93 | 10 / 6 / 4 | 14 / 10 / 10 | 183 / 149 / 131 |
| 10,000 | 160 / 140 / 157 | 143 / 144 / 141 | 39 / 37 / 21 | 19 / 22 / 15 | 361 / 343 / 334 |

One final process launch reached application readiness in 1,319 ms. A second
worker pair initialized with already-read assets in 41 ms; cold spelling dictionary
load plus analysis took 82 ms. The separate CLI report measured extraction plus
Vale version initialization at about 135 ms. These are small local samples,
not cross-platform latency guarantees or cold disk-cache measurements.

Thirty synthetic CodeMirror typing transactions in a 10,005-word note, starting
while a retext worker run was active, had a 16 ms median, 21 ms p95, and 35 ms
maximum time to the next animation frame. These transactions do not measure
physical keyboard latency or prolonged typing under every combination of lenses.
Use-case tests separately establish the maximum of one active and one latest
pending request, 500 ms debounce, immediate stale-action invalidation, and real
worker/process cancellation. At that historical stage, main-thread resolution took up to 39 ms on
this dense fixture. The second-audit implementation below moves it into the worker. Paragraph incremental
analysis is deferred; passage mounting is paged without dropping finding counts.

Raw measurements and editorial output are in
[writing-2026-09-06.json](benchmarks/writing-2026-09-06.json).
`scripts/profile-writing-native.js` is test instrumentation only. To reproduce,
prepare/build the frontend, create a disposable vault with `Welcome.md` and no
selected lenses, inject that module into a copy of `frontend/index.html` through
a Go `-overlay` build, and run the packaged binary on an isolated display with
separate XDG cache/config/data paths. It opens and edits that disposable note and
writes `Writing-benchmark.json` through the native API. Never inject it into a
personal-vault build. The production entry never loads this script.

## Validation and remaining limits

The initial inline-review follow-up on 2026-09-06 passed 239 frontend suites and
1,496 tests, focused Go dictionary/bridge checks, and eight focused Chromium
workflows. Final viewport-only mark and shortcut checks also passed. In the
packaged Linux WebKitGTK app on the same isolated-display setup, dark/light
popups used the theme tokens; hover-to-button Apply, one Undo, occurrence Ignore,
Ctrl+., Tab/Shift+Tab, Escape, arrow movement, and mouse/drag selection worked.
Inline keyboard review also worked in Pure mode. Add to dictionary saved the
word without changing the note, removed its spelling mark, and retained that
choice after restarting in Figaro Light with line numbers enabled. No duplicate
standalone spelling marks appeared. Native Windows/macOS were not available.

The initial writing-engine frontend run passed 236 suites and 1,486 tests, including shared
editorial cases, failure recovery, and occurrence continuity. The frontend
coverage check also passed. All Go package tests and the 74.5%
statement-coverage floor check passed. Native
process tests use actual children to verify both cancellation and five-second
termination/reaping. Regression boundaries and commands are listed in
[TESTING.md](TESTING.md); the writing-related browser cases remain focused on
startup, real focus, selection geometry, and undo.

No full-sentence rewrites, Apply all, displayed readability grades, structural analysis,
custom rules, persistent style-rule ignores, remote AI, or writing profiles
are included. Personal spelling words are the explicit persistence exception.
English checks are opt-in and whole-document; quotations and technical-token
recognition are conservative heuristics. An unavailable/failed provider is reported
as partial and can be retried; it never establishes that a document is clean.

The documentation audit updated README, the product contract, architecture,
contributor/build guidance, testing guidance, live-preview notes, the design-system
audit, and the Unreleased changelog. Remaining pane/shortcut references are still
correct. PDF styling and printable syntax behavior are unaffected, so
`docs/PDF_STYLING.md` needs no change. The approved component registry and
catalogue remain valid because this feature composes existing primitives.

The subsequent lens simplification passed the complete frontend suite (239
suites, 1,498 tests), followed by 76 focused checks after the final tooltip-bounds
change, plus seven Chromium workflows and focused Go settings/dictionary tests.
The updated real retext/Vale editorial run still passes all 12 cases. Preferences
now belong to each note; the retired profile was replaced in the fixtures with
explicit Directness on/off selection. The native Linux follow-up confirmed the
reported `teh` correction despite both old Settings and YAML being disabled,
source-preserving Apply/Undo, themed examples/cards, and sidebar-edge tooltip
containment in the final light build. The dark build was also visually checked.

In the final native build, Ctrl+., Tab/Shift+Tab, Escape, bidirectional vertical
navigation, mouse placement, source selection around emphasis, and the Pure
picker retained normal behavior. Changing one note’s combination persisted only
that note; switching to another showed its independent choices, and selecting
Spelling there exposed `teh` immediately. Returning restored the original note’s
combination. The tooltip at the right edge remained fully visible before the
sidebar. That earlier check used the language buttons, now replaced by the
shared Settings combobox.


The language combobox now leads the controls and offers only None, English US,
English UK, and Spanish. Support decisions disable all lenses for None and
English-only prose lenses for Spanish, unchecking unsupported selections.
Switching back does not reselect them. Hovering the checkbox or its label
explains the specific reason through the shared tooltip and accessible
description. Temporary loading/applying states and failed loads have their own
reasons; enabling a lens clears its unavailable explanation.
Load-time cleanup remains in memory
until an explicit preference change; language changes persist the cleared set
together and retain it through save failure and retry.
Apply to all documents drains pending saves, atomically updates all document
entries and defaults, and refreshes cached notes only after success. Cards omit
passage excerpts and the hover hint, show a source-link icon, and use standard
buttons for actions. Pane modes share a width and restore with their document
when returning from Settings, planning, or another note.


The pane/language follow-up passed 240 frontend suites (1,505 tests), followed
by 59 focused checks after the final status simplification, Go writing-settings
and native bridge contracts, and the existing Chromium launcher, picker,
inline-review, spelling and production-bundle workflows. Packaged WebKitGTK
kept Outline/PDF/Raw at a dragged 248px with every launcher visible, restored
Raw after Settings, and restored Writing after Settings/Calendar round trips.
The final build showed disabled Spanish prose lenses, saved Apply to all
documents through the native bridge without changing either note, and refreshed
the second note's choices. Actual Arrow Up/Down traversed the paragraph in both
directions; mouse drag selected source around rendered emphasis. Pure kept the
pane suppressed and focused the shared language combobox. Screenshots confirmed
language-first controls, the source-link icon, and visible suggestion buttons.


Documentation audit: README, product contract, architecture, contributor/testing,
live-preview, PDF-preview, and design-system guidance now describe the shared
width, restored panes, Settings combobox, disabled language support, bulk saves,
and source-link actions. Searches across Markdown found no remaining active
contracts for a hidden open Outline launcher, inert workspace reselection,
Lenses layer, language segments, or a separate PDF width minimum. References to
retired profiles/frontmatter describe migration or their removal; older dated
validation remains historical. The source-link title uses Figaro's tooltip to
explain the jump explicitly. The existing primitive registry and eager style
manifest remain unchanged; the catalogue consumes the updated production views.


The language-unchecking and buffer-footer follow-up passed all 241 frontend
suites (1,513 tests), lint, test integrity, and three existing Chromium boundary
scenarios. Pure model and preference tests cover clearing unsupported selections,
returning to English without reselecting them, and save failure/retry. Packaged
WebKitGTK saved Spanish with only Spelling checked, then returned to English
with the prose lenses still unchecked. The buffer footer followed the pane edge
at both 320px and a dragged 248px; a compact overlay kept the footer within
the exposed editor and hid reading time. Pure hid the pane and window grip while
retaining its full-width footer. Native Arrow Up/Down in both directions and
forward/reverse source selection across emphasis preserved the document.

The follow-up documentation audit updated the language-selection contract and
footer alignment across all affected guidance. Remaining retention references
concern source, saved metadata, or historical verification, not unsupported
lens selections. Changelog entries under Unreleased cover both outcomes.


Disabled-lens tooltip follow-up: 44 focused frontend checks and the existing
Chromium writing-picker scenario passed, along with lint, builds, and test
integrity. The browser confirmed tooltip delivery from both the disabled
checkbox and its label within the viewport. The documentation audit updated
current availability contracts; remaining disabled-lens references still
describe valid behavior or earlier verification. Editor layout, Markdown
rendering, and PDF behavior are unaffected.


Consistency, Grammar & punctuation, and Readability verification passed all
242 frontend suites (1,545 tests), followed by 142 focused checks after adding
the catalogue advisory example. Rooted Go writing-preference contracts and
three existing Chromium scenarios passed, including eager production startup,
spelling input, sentence-wide underlines across emphasis, and the seven-lens
Pure picker. Native WebKitGTK confirmed the three independent selections,
word-count explanation and splitting example, Ctrl+./Tab/Shift+Tab/Escape,
vertical movement through wrapped underlines, mouse placement, source selection,
and article Apply/Undo restoring the complete original Markdown.

The existing real-adapter profiler passed all 18 editorial fixtures. On this
Linux run its 10,000-word medians were 126.8 ms for the worker runtime, 137.0 ms
for Vale, and 22.1 ms for resolution; these are observations, not universal
latency guarantees. Markdown documentation was audited for obsolete lens counts,
availability, package versions, fix behavior, and readability limitations. All
current matches are updated or remain valid; earlier measurements are historical.
The existing primitive registry/cascade and PDF rendering behavior are unchanged.


The package expansion added contractions, redundant acronyms, quotation style,
selected proselint rules, and the independent Inclusive language lens. The full
frontend run passed 244 suites / 1,580 tests; after preserving original upstream
contraction alternatives in provenance, 19 focused suites / 176 tests passed.
Focused Go checks covered pinned Vale rule hashes, cancellation, the native
bridge, and rooted eight-lens preferences. Lint, integrity, eager builds, and
the existing production-startup and writing-picker browser scenarios passed.

Native Linux WebKitGTK verification used a disposable vault on the same isolated
Xvfb setup. The eight controls fit in the pane and 545px Pure picker. Paired
quote Apply changed both delimiters around `**two**` in one transaction, and
one Undo restored the exact Markdown. Inclusive alternatives stayed inside the
editor bounds; keyboard Apply/Undo and occurrence Ignore worked without a
dictionary action. Ctrl+., Tab/Shift+Tab, Escape, vertical navigation across the
quotation, and forward/reverse mouse selection preserved source and focus.
The isolated app and display were stopped after verification. Windows/macOS
native geometry remains unverified locally.

All 29 real-adapter editorial fixtures passed. The 1k-word runtime/Vale/resolver
medians were 37.1 / 95.3 / 2.0 ms; the 10k-word medians were 297.1 / 132.3 / 20.2 ms.
The broader eager rule set increases worker time versus the earlier sample;
these local measurements are not universal latency guarantees. Raw results:
[writing-packages-2026-09-06.json](benchmarks/writing-packages-2026-09-06.json).

The Markdown audit updated every current lens-count, scope, package/version,
quotation, fix-safety, and control-style reference in affected documentation.
Remaining seven-lens references describe the earlier verification; other
seven-count matches concern unrelated features and remain correct. The new
Unreleased entry covers these additions. PDF rendering and the approved
component registry/cascade are unaffected; the catalogue reuses the existing
production suggestion view for Inclusive language.

## Harper evaluation

Harper 2.7.0 (Apache-2.0) was evaluated in an isolated npm directory and is **not
bundled**. Its [JavaScript documentation](https://writewithharper.com/docs/harperjs/introduction)
labels the API early access. The reproducible probe uses its local Wasm files,
awaits `LocalLinter.setup()` before analysis, and examines default rule output
with overlap suppression disabled so all evidence can be reviewed. It runs
Figaro's mapped prose in plaintext mode, including all 36 English editorial
fixtures and 12 additional positive/negative/context probes. This is a small
integration evaluation, not an accuracy benchmark or a replacement-engine score.

The package exposes 823 configurable rule entries. It adds useful agreement
coverage (“She go” → “She goes”) and accepts the corrected form. Its defaults
also suggest reducing valid “had had” and changing the article in `a "safe"
example` after Figaro masks the quotation. The latter is a context issue in
this integration: a valid range alone cannot establish a safe recommendation.
Other reports overlap existing article, spelling, repetition, acronym, hedging,
and spacing checks. Masked-whitespace reports are rejected by Figaro's range
mapping. Two simple agreement probes (“These is…” and “This are…”) were not
detected; no general grammar-coverage claim is warranted. The emoji probe
confirms `span()` uses UTF-16 in 2.7.0, while serialized inner Rust spans use
code points; the evaluation checks every span against its reported text.

Local setup took 536 ms. The 1k/10k-word median lint times were 15.5/144.6 ms,
excluding projection and resolution, on the report's Node/CPU environment.
These timings do not establish webview startup or typing latency. The full
Wasm file is 15,848,134 bytes and the slim file is 15,634,488 bytes; this version's
full-binary setup also initializes its slim glue. No runtime network dependency
is inherent, but shipping it would require explicit worker startup, asset and
notice packaging, bounded cancellation, an allowlisted rule mapping, protected
context guards, and real webview validation. The existing local writing engine
continues to ship. A selected-rule Harper integration is deferred until those
editorial and adapter boundaries are established.

Reproduce without installing Harper into the application:

```sh
npm install --prefix /tmp/figaro-harper-evaluation --ignore-scripts --save-exact harper.js@2.7.0
node scripts/evaluate-writing-harper.mjs /tmp/figaro-harper-evaluation/node_modules/harper.js
```

Raw evidence: [Harper evaluation](benchmarks/writing-harper-evaluation-2026-09-06.json).

## Sentence-spacing, diacritics, and formula verification

At that stage, the three pinned retext packages passed all 37 real-adapter editorial fixtures.
The complete frontend suite passed 245 suites / 1,622 tests, including exact
source mapping, line-break preservation, optional accent alternatives, short
sentence and protected-context exclusions, merged readability evidence,
retry/Ignore/Apply, and explicit spacing labels. Lint, test integrity, production
build, and the existing Chromium eager-startup check passed. These additions
change rule output and existing component content without changing editor
extensions, decoration layout, Markdown syntax, or PDF rendering. Native cursor
geometry was not rerun for this rule-only change; the preceding native evidence
covers the unchanged editor mechanism.

The real 1k-word runtime/Vale/resolver medians were 46.0 / 93.6 / 1.8 ms; at 10k
words they were 389.4 / 134.9 / 19.8 ms. The added packages increase eager worker
runtime from the preceding 297.1 ms sample; these measurements are observations,
not universal latency guarantees. The worker remains subject to the existing
five-second deadline and termination/retry mechanism at that stage. Raw results:
[spacing/readability report](benchmarks/writing-spacing-readability-2026-09-06.json).

The documentation audit updated all current package, threshold, evidence,
example, and availability contracts. Earlier fixture counts and timings remain
explicit historical results. The Unreleased entry covers the user-visible
additions. The approved component registry and cascade are unchanged; the
catalogue reuses the production example renderer for spacing counts. PDF styling
and printable syntax require no changes.

## Paired punctuation, terminology, and acronym verification

The preceding expansion passed all 46 real-adapter editorial fixtures and the full
frontend suite (246 suites / 1,681 tests). Native Go writing adapter tests, lint,
test integrity, the production build, and the existing Chromium startup check
passed. The browser check now observes actual worker readiness and initialization
errors; it caught a missing browser process dependency during development,
resolved by eagerly bundling the real compatibility dependency. The dependency
policy also confirms the maintained scoped text parser, with no deprecated locked
packages. The npm installation audit reported zero vulnerabilities.

Acceptance coverage exercises each rule with its own lens, exact canonical
technical-name Apply, advisory-only punctuation/acronym examples, Ignore,
initialization failure and retry, surviving Vale timeout, stale edit refusal,
Unicode/Markdown mappings, definitions and familiar exceptions, and explicit
preservation of attached units. No editor extension, cursor geometry, visual
primitive, Markdown syntax, or PDF renderer changed; native cursor verification
was not repeated for these rule additions.

Local 1k-word JavaScript/Vale/resolver medians were 49.0 / 93.9 / 1.9 ms for
ordinary prose and 52.6 / 102.5 / 0.1 ms for technical names with punctuation.
At 10k words they were 400.2 / 138.3 / 22.8 ms and 951.4 / 104.6 / 0.3 ms,
respectively. The relevance prefilter keeps ordinary prose near the preceding
worker cost; the technical sample exercises the full textlint kernel. These
measurements exclude browser scheduling and are not typing-latency guarantees.
The five-second termination/retry boundary was unchanged at that stage. Raw data:
[punctuation, terminology, and acronyms report](benchmarks/writing-terminology-acronyms-2026-09-06.json).

The Markdown audit updated current package, rule-count, mapping-version,
example, and source-safety contracts across user, architecture, contributor,
testing, live-preview, and design-system documentation. Earlier fixture counts,
timings, and engine descriptions remain explicitly historical; the version 3
preference schema and eight-lens count remain correct. The Unreleased entry
covers all three additions and the explicit unit-spacing exclusion. The existing
catalogue now demonstrates the acronym example through the production view;
the approved component registry, CSS cascade, and PDF styling are unaffected.

## Durable-decision verification

The persistence change passed pure policy and use-case tests, component and
controller-recreation tests, and the full settings/desktop/writing Go suites.
Rooted tests use a new App instance to prove reload, independent documents,
concurrent changes, per-record removal, private file permissions and original
file preservation on corruption or symlink errors. The full frontend suite passed 250 suites / 1,693 tests; lint and the
test-integrity guard also passed. Existing Chromium inline and Pure
workflows passed, along with the assembled eager production startup check.

A packaged Linux build with `desktop,production,webkit2_41` was checked on a
private Xvfb display with a disposable vault and isolated configuration. It
used the current bundled application plus a temporary observation harness;
product files were not instrumented. Keyboard Ctrl+., Tab/Shift+Tab and Enter
accepted SLO and ignored one `utilize` occurrence. Both decisions remained
after the process was restarted. The Pure picker showed Saved review decisions
in its existing scrollable surface; Review acronym again and Restore suggestion
removed the records and restored the respective underlines without editing
source. Arrow Up/Down round trips returned to the same position, and forward/
reverse mouse selections crossed the marked/formatted text without source
changes. Escape and successful async actions preserved the intended focus.
The isolated app and display were stopped after verification. Windows/macOS
native UI behavior was not exercised locally.

The documentation audit replaced current session-only dismissal descriptions
with durable per-document behavior and synchronized mapping version 5. Existing
preference schema version 3, eight-lens counts, and historical measurements
remain correct. The Unreleased entry describes persistence and reversal; the
production catalogue demonstrates the same controls. PDF styling and Markdown
rendering are unchanged because decisions never modify source or printable syntax.

## Audit fixes verification — 2026-09-06

The first audit pass covered its eight original findings: reviewed inclusive/article policy,
soft-wrapped acronym definitions and uppercase exceptions, recoverable decision
saves, durable known-edit anchors with inactive feedback, compact configuration,
writer-facing Details, and bounded grouped review with guarded bulk actions.
The optional version-1 `exactOnly` decision field disables approximate fallback
after target edits/deletions; actual editor ranges keep a deleted repeated
paragraph from transferring Ignore to a surviving one. Existing version-1 data
loads without migration; the effective policy/mapping signature is version 6.

Verification passed 252 frontend suites / 1,747 tests, the settings/desktop/writing
Go suites, lint, test integrity, catalogue/application builds, and three focused
Chromium workflows for inline bulk focus/Undo, Pure geometry/scrolling, and eager
production startup. The [51-case editorial and timing report](benchmarks/writing-audit-fixes-2026-09-06.json)
uses actual bundled adapters. Its ordinary-prose medians were 47/375 ms in the
JavaScript worker and 93/135 ms in Vale at approximately 1k/10k words; technical
10k-word JavaScript work measured 883 ms. These are adapter timings from this run,
not end-to-end typing latency or a comparison under controlled load.

A current native Wails/WebKitGTK build ran in an isolated Xvfb display and
private vault. Correct unicorn/pronoun/acronym cases stayed quiet. Edited Ignore
context survived process restart and could be restored; a full 1,000-decision
list recovered by removing one record and saving another. Deleting an ignored
paragraph persisted exact-only matching and kept its similar surviving phrase
visible. At 1000 × 720 with light theme and 150% editor text, first-card actions
fit without scrolling setup. The Pure picker scrolled to its last checkbox on
keyboard focus; inline shortcuts, arrows and bidirectional selection preserved
source. A single passage with 120 identical findings rendered one card and seven
visible controls; Apply-to-all changed all 120, one Undo restored all, and Redo
reapplied them. Existing source guards and component tests separately reject
stale, overlapping, protected, and contextual bulk plans.

Native verification used an external observation overlay without instrumenting
product files. Windows/macOS webviews, screen readers, and 200% UI scaling were
not tested. General grammar understanding, semantic acronym validation, and
rename migration remained outside that audit pass. Rename/move continuity is implemented below. Current docs/catalogue/changelog
contracts were synchronized; historical measurements and version references
remain historical. PDF styling and syntax rendering remain unchanged.


## Second audit fixes and asynchronous review — 2026-09-06

The second pass protects wiki destinations/fragments and embeds in prose and
spelling, recognizes ordinary dictionary capitals and hyphenated/eX definitions,
and tracks new Ignore decisions through edits made during storage. The add action
persists a reconciled anchor; deletion produces an inactive exact-only record and
leaves the surviving occurrence visible after a full native restart. The version-1
storage schema and rooted atomic adapter remain unchanged; mapping is now 7.

Prose parsing, raw mapping, finding resolution, suppression, display continuity,
and card preparation stay in the prose worker. Decision matching and inactive-ID
calculation run in a separate eager worker, with no synchronous fallback. Typing
queues immutable document readers and numeric ranges in coalesced tasks. A pending
refresh retains the current note context and shows Analyzing; a tracking failure
directs Retry to saved decisions. Programmatic buffer replacement also refreshes
review when there are no authored edit ranges.

In the owned native ~34k-character / 500-repeat fixture, 100 inactive decisions
with lenses disabled measured 16 ms from beforeinput to the next animation frame,
versus 20 ms in this run’s zero-decision control and 2,361 ms in the preceding audit.
Seven keys with all eight lenses enabled measured 10–17 ms. Six keys during an
active refresh measured 10–17 ms and retained Analyzing status. These are local
single-run observations, not paint-time, cross-platform, or average guarantees.
[Raw second-pass measurements](benchmarks/writing-second-audit-fixes-2026-09-06.json).

Native WebKitGTK also verified protected wiki targets and editable aliases,
ordinary capitals/UXD with a genuinely undefined SLO still marked, delayed Ignore
and restart, Ctrl+., Tab/Shift+Tab, Enter, Undo, arrows, and bidirectional drag.
The existing Chromium spelling hover/right-click/selection workflow and assembled
three-worker startup contract passed. Worker cancellation, delayed results,
tracking failure/retry, immutable uncertain commands, 1,000 inactive-record search
bounds, and correct programmatic refresh have focused lower-layer regressions.
The full frontend suite passed 253 suites / 1,772 tests; focused Go packages, lint,
test integrity, application build, and catalogue build also passed. Results are
recorded with the benchmark report. Current Markdown documentation matches were
updated or confirmed correct; older mapping versions/timings remain explicitly
historical. No new visual primitive,
Markdown syntax, or PDF renderer was introduced; the shared component registry
and stylesheet cascade remain unchanged. PDF styling documentation remains valid.

### Third audit recovery verification — 6 September 2026

Reload now settles the active decision-tracking job before installing the saved
set, retains subsequent edits, and matches worker results by ID. Worker-local
prose resolution explicitly rebuilds required evidence after a restart; a failed
rebuild preserves spelling with a partial-results warning and Retry.

The complete frontend suite passed 254 suites / 1,784 tests. The added regressions
cover the exact uncertain-removal/reload overlap, new/reordered identities,
queued edits, failed tracking, coalesced reload, disposal, cache recovery,
partial status/retry, and stale recovered results. Focused rooted Go decision
checks, lint, integrity, the application build, and the existing assembled
Chromium startup check passed.

A fresh isolated Linux WebKitGTK 2.52.6 build repeated both audit faults using
controlled delays/errors. After the lost removal response plus delayed tracking,
only decision B remained in both the sidebar and storage, including after a
note switch. After a worker error plus delayed spelling, both the article and
spelling suggestions returned instead of a misleading spelling-only completion.
Five native keys after recovery reached the next animation-frame callback in
7–11 ms on the small fixture; this is a local input observation, not a universal
latency guarantee. Persistent rebuild failure and Retry are covered through the
production use case/result view; no new cursor, layout, or export behavior was
introduced. Windows/macOS native runs were not available for this verification.


## Fourth audit fixes — 7 September 2026

New-document mount events no longer discard the initial decision-tracking
snapshot before its controller exists. Component regressions cover Ignore before
the first nearby or multi-range edit, updated anchors, and controller recreation.
Overlapping reload/tracking failures retain a retryable load prerequisite; tests
cover both failure orders, authoritative reconciliation, and queued edits.

Rendered ordinary-link, explicit wiki-alias, and reference-link labels now
reuse the existing dotted mark and hover menu. Pure mapping covers label padding,
Unicode, overlapping sentence advice, and protected destinations. The viewport
adapter preserves widget identity, restores ordinary tooltip information when
checks clear, and rejects cached hover choices immediately when findings change,
even before the next paint. No new visual primitive or printable syntax is added.

Verification passed 255 frontend suites / 1,797 tests, including 45 focused
writing tests; lint, test integrity, and the application build passed. The
existing Chromium writing scenario covers visible widget underlines, popup
pointer travel, safe Apply/Undo, unchanged link activation, vertical movement,
and drag selection from both directions. The assembled startup check retains
all three eager workers without post-ready feature requests.

A private native GTK 3.24.52 / WebKitGTK 2.52.6 app and disposable vault verified
the first nearby edit after Ignore, saved updated context across a full process
restart, and one successful Retry after an uncertain removal plus overlapping
worker/load failures. Ordinary, wiki and reference labels showed current hover
actions; native Ctrl+., Tab/Shift+Tab, Enter, Undo, vertical movement and both drag
directions preserved source. A padded reference label was also underlined.
Native Windows/macOS and a fresh large-document timing benchmark were not run.

### Fifth audit fixes — spelling source safety and possessives

Mapping/configuration version 8 shares Lezer-based spelling eligibility with
worker resolution and context-menu lookup, protects reference definitions and
indented code, and keeps implicit reference labels advisory. English possessive
validation and candidate generation now retain the author's suffix. Metadata and
writing reuse the same pure leading-frontmatter range scanner.

Verification passed 255 frontend suites / 1,805 tests, including real US/UK
possessive dictionaries, protected/corrupt spelling ranges, implicit link/image
labels and visible action coverage. Lint, test integrity and application builds
passed. The existing Chromium writing interaction and assembled eager-startup
checks passed (two workflows). Native GTK 3.24.52 / WebKitGTK 2.52.6 verified
label-only reference Apply/Undo with its destination intact, valid possessives
without spelling marks, a stem correction preserving its curly apostrophe,
implicit-label explanations without unsafe Apply, Ctrl+., Tab/Shift+Tab, Enter,
vertical movement and bidirectional drag selection. The private app/display
were stopped. Native Windows/macOS and a fresh large-document benchmark were
not run for this change; no typing-handler work was introduced.

## Initial Formulaic writing verification (historical)

The initial ninth-lens implementation used 21 selected Slopless 0.2.38 rules, including `em-dashes`
and `smart-quotes`. [WRITING_SLOPLESS.md](WRITING_SLOPLESS.md) documents every
inclusion/exclusion, typography semantics, source safety and advisory behavior.
Mapping/configuration version 9 includes this pin and exact selected rule map.
The earlier eight-lens audits and timing results above remain historical records.

Verification for this addition passed 256 frontend suites / 1,848 tests, focused
rooted WritingLenses/WritingDecision Go tests, lint, test integrity, and the
assembled Chromium production-startup check. An advisory-heavy Node sample
measured 178 ms analysis / 8 ms resolution for 810 words and 1,254 ms / 27 ms
for 8,100 words, with zero rejected observations. These are full runtime costs,
not UI input latency measurements; production executes that work in the prose
worker. No native geometry check was repeated because no CodeMirror extension,
layout, decoration type or PDF syntax changed. Evidence is recorded under
`/home/grilo/Downloads/figaro-slopless-2026-09-07/`.

## Independent-lens package coverage — 7 September 2026

The [complete package review](WRITING_PACKAGE_REVIEW.md) supersedes earlier
selection limits and overlap-based exclusions. Mapping 10/editorial 3 restores
30 Slopless rules, 20 additional native Vale checks, all native simplification
advice with reviewed-only Apply, 43 additional Inclusive advisory IDs, and 29
canonical technical names. Different same-sentence concerns remain distinct,
shared concerns retain all lens memberships, and only enabled lenses supply fixes.
Historical fixture counts and timings above describe their original snapshots.

## Rename continuity and long-note performance — 7 September 2026

File/folder rename, move and folder-merge collision names now carry both writing
preferences and saved review decisions to the destination. IDs, anchors, language,
exact-only flags and unknown fields are preserved; Restore remains available
after restart. The frontend retains document controllers and gates storage around
the native mutation, so pending writes cannot recreate old-path records. The
backend uses a dedicated writing-state lock, validates both metadata files,
refuses destination collisions, and rolls back writes on ordinary operation
failures. This uses rooted atomic replacement for each file; it does not add a
crash-recovery journal spanning the filesystem move and multiple metadata files.
External renames are not inferred.

Profiling identified repeated Slopless tokenization and sentence-splitter's
allocation of document-prefix padding for every punctuation paragraph. A
reproducible vendor adapter memoizes the unchanged Slopless tokenizer with a
4,096-entry / 2 MiB estimated-weight LRU cleared after analysis. Results are
copied for each caller. A paragraph-local adapter rebases the unchanged
unmatched-pair rule and reports its relative errors against the original node.
No rules, text or global acronym/repetition context are removed or split into
approximate independent chunks. Longer jobs receive the bounded budgets above;
the foreground never falls back to running these engines.

The [real-adapter report](benchmarks/writing-long-note-2026-09-07.json) records
three runs per workload on Node 24.20.0 / AMD Ryzen 7 9800X3D:

| Workload | Words | JavaScript median | Vale median |
| --- | ---: | ---: | ---: |
| Ordinary prose | ~1,000 | 101 ms | 114 ms |
| Ordinary prose | ~10,000 | 897 ms | 270 ms |
| Technical prose with punctuation | ~10,000 | 894 ms | 252 ms |
| Unique numbered technical paragraphs | 25,007 | 2,189 ms | 922 ms |
| Unique numbered technical paragraphs | 50,014 | 4,898 ms | 3,942 ms |

The preceding readiness run measured 3,297 ms and 3,881 ms JavaScript medians
for the same 10k ordinary/technical workloads. These are separate local runs,
not a controlled hardware benchmark or native typing/input-to-paint guarantee.
The 50k workload shows why the former universal five-second deadline did not
provide reliable completion headroom. Dense findings remain subject to the
existing output-size limits; larger size budgets are not unlimited analysis.

All 51 combined retext/textlint/Vale editorial fixtures pass.
`node scripts/verify-writing-performance.mjs` compares complete observations and
source maps against the unmodified tokenizer path on 54 texts, compares the
paragraph adapter directly with the pinned punctuation package on five texts,
and exercises actual worker messages, foreground timers, cancellation and fresh
analysis after recovery. It is behavioral/performance evidence, not a measure
of suggestion usefulness. The [corpus proposal](WRITING_CORPUS.md) describes
licensed sources and independent human annotation needed for that evaluation.


## Corpus safety correction and release assessment — 7 September 2026

[WRITING_CORPUS_FIXES.md](WRITING_CORPUS_FIXES.md) records the eight corrections
at mapping 11/editorial 4/local rules 3/spelling vocabulary 1. The unchanged
eight-document corpus now yields 1,347 findings instead of 1,710, and 15
Apply-capable occurrences instead of 81. The 63 replacement sets judged unsafe
in the earlier agent review no longer offer Apply at those occurrences. Fewer
findings are not themselves an accuracy score; useful positive controls remain.

The cleaned corpus plus six additional documents covers 14 documents and 35,633
Markdown source words, including code. The newer accessibility document still
receives six misleading individual spelling alternatives, including
“webpage” → “seepage”. Those alternatives cannot be bulk-applied, but their
editorial quality remains a release limitation. Additional documents that informed
corrections are now regression material, not independent holdout evidence.

The final 265 frontend suites / 2,053 tests, focused Go suites, all 51 native
editorial fixtures, 54 source/bundle comparisons, five punctuation comparisons
and 57 native corpus controls pass. The real prose worker keeps foreground
timers advancing and cancels/recovers. Three-run median JavaScript/Vale costs
were approximately 0.93/0.25 seconds for 10k technical words and 4.74/3.50
seconds for 50k numbered technical words. This profile excludes spelling and
does not measure native input-to-paint latency. No editor geometry or input
handler changed in this correction.

This supports an opt-in beta, not an unqualified production-readiness claim for
suggestion usefulness. The next quality gate is better individual spelling
candidate eligibility plus an independently reviewed, frozen evaluation set.
No release metadata, tag, commit or publication was produced by this assessment.
