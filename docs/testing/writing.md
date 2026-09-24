# Writing testing contracts

[Shared strategy and commands](../TESTING.md) · [Feature index](../FEATURE_INDEX.md)

## Writing review regression coverage

`writingAnalysisModel.test.js` covers equivalent local/native comma-spacing edits
with different source spans, Unicode/CRLF/Markdown offsets, input ordering, one
Apply action, retained provenance, and distinct conflicting or advisory corrections.
`node scripts/profile-writing.mjs` verifies all combined native/JavaScript editorial
fixtures in main CI, tag CI, and local release verification. Its failure must stop
release finalization before a commit or tag; the shell release tests inject that failure.
The 2026-09-20 packaged Linux WebKitGTK regression passed seven checks with the
actual native and worker analyzers: one finding/action, exact Apply, fresh removal,
one Undo, one restored finding, and persisted Ignore. Input used DOM-dispatched
clicks/keys and CodeMirror transactions in an isolated disposable vault.

`spellingDictionarySettings.test.js` covers accessible loading/empty states,
normalized search, bounded lists, Add/Remove/Undo, pending/failed mutations,
retry focus, concurrent additions, and disposal. It also proves the compact
Settings launcher, shared modal inert/focus lifecycle, retained dialog draft,
and close-during-save failures without focus theft. `spellingDictionaryModel.test.js`
owns pure list ordering/filtering/bounds, while the dictionary use-case test owns
serialization across Add and Remove. The Settings tab test proves injection,
Editor placement, and subscription cleanup; the lens-view test keeps Manage
dictionary available even with spelling disabled. Rooted Go tests prove Remove
persists across a new App, preserves note bytes, and rejects corrupt/newer files
and outside symlinks. Undo preserves additions made after removal. The existing
Settings browser scenario checks exact cutout/workspace paint, heading placement,
large-list overflow with stationary search/actions, focus trapping and restoration,
and the real Proofreading-to-dialog handoff. Persistence rules stay below the
browser layer.
The 2026-09-20 packaged Linux WebKitGTK check passed 12 assertions for group
paint/placement, the dictionary dialog, a 301-word list, search and close focus.
Those native interactions used DOM-dispatched input; physical Windows/macOS
input and their webviews were not exercised by that check.

Spelling regressions cover Lezer-parsed reference IDs/definitions, indented code
(including nested lists/quotes), continued prose, unfinished/BOM/CRLF frontmatter,
Unicode offsets, explicit labels and advisory implicit link/image labels.
`writingSpelling.test.js` uses both bundled English dictionaries for valid
possessives, unknown stems and suffix-preserving corrections; it also feeds real
results into the pane to prove misleading Apply/bulk controls are absent.
`spellingDictionaryModel.test.js` covers regular personal plurals and possessives,
case/apostrophe normalization, malformed or unrelated endings, exact entries,
language scope, canonical accent matching, possessive-first additions, and dictionary isolation. Real-dictionary cases in
`writingSpelling.test.js` compare personal forms with the existing Hunspell noun
model and guard eager package mapping. `spellingDictionary.test.js` proves
restored words suppress standalone marks and context-menu suggestions;
`writingAnalysis.test.js` proves successful additions refresh both pane and inline
results and changing to Spanish restores exact-word behavior. Existing serialized
save/failure coverage remains applicable. Pure Go and rooted adapter regressions
prove terminal possessives, NFC deduplication, restart, load without rewriting,
unknown-field preservation, and unchanged note text/private permissions. These are lookup rules, with no new cursor/layout boundary.
`writingTechnicalModel.test.js` covers ambiguous slash/dot prose versus protected
URLs, email, explicit paths, identifiers and common filenames. Real spelling
cases cover all-caps errors, ordinary capitals, conservative name guesses, and
composed/decomposed accents at exact source offsets. The runtime test proves the
same technical policy reaches prose projection; mapping version 25 invalidates
older evidence.
Resolver tests reject protected or corrupt spelling ranges. They also protect
implicit reference keys from other prose fixes. Test these eligibility and
grammar cases below the browser layer. Keep the existing browser checks for
link interaction and eager startup.

`writingFootnoteModel.test.js` owns marker/escape recognition; `writingRuntime.test.js`
and `writingSpelling.test.js` prove defined and unresolved footnotes are excluded
while body and inline-note prose remain eligible at exact Unicode/CRLF offsets.
These are analysis-only rules; editor geometry and printable syntax are unchanged.

`writingIncremental.test.js` compares cached Markdown mappings and complete
findings with fresh analysis across Unicode, CRLF, entities, quotes, protected
blocks, reference changes, paragraph moves/splits and frontmatter. It proves a
one-block parse for a safe edit and retention of 4,100 small paragraph results
under the existing 4 MiB cap. `writingSourceProjection.test.js` owns pure edit
planning, offset rebasing and recovery after injected parser/projection failure.

Writing review has focused tests for real pinned retext/textlint output, Markdown/UTF-16
mapping, conservative Vale/retext equivalence, independent lens filtering, conflicting
fixes, counts, and occurrence continuity. Use-case tests cover debounce/coalescing,
late work after ownership/configuration changes, partial failures, persisted suppression, and
current-input reuse and accepted-word filtering. `writingInline.test.js` checks
current ranges, overlapping advice, immediate mark/tooltip invalidation, real
CodeMirror Escape handling, spelling-only actions, keyboard exit, and retryable
dictionary errors. `spellingDictionary.test.js` covers serialized/pessimistic
saves, load retry, and inline/context-menu filtering. Document-preference tests
cover independent combinations, late loads, and save failures while switching notes. Pure Go
dictionary tests validate words, schema, and preservation; rooted adapter tests
cover reopen/deduplication, unchanged notes, permissions, corrupt-file refusal,
and outside symlinks. Component tests cover accessible actions, bounded distinct-card
mounting, identical-occurrence grouping, focus, and one isolated CodeMirror undo transaction. Worker tests prove
warm cooperative cancellation, timeout termination, and cancellation before initialization. `writingProse.test.js`
checks replacement-worker cache recovery, matching-source reuse, exclusion of
unrequested prose, and failed recovery retaining partial spelling. Adapter tests
exercise restart between analysis and delayed spelling resolution; the analysis
use-case test drives the real result view to prove partial status, Retry, full
recovery, and rejection of late recovery after ownership/language changes. Real Go adapter tests
verify embedded Vale rule IDs/Unicode coordinates, fixed in-memory configuration,
bounded input/output, and cancellation/deadline/close independent of worker exit. Rooted settings tests
cover explicit v1/v2-to-v3 migration, separate note choices and restart, unknown fields, corrupt/newer refusal, and an
outside `.config` symlink; history tests preserve file-scoped commits.

`writingDecisionsModel.test.js` checks unique-context occurrence anchors,
Unicode/serialization, language scope, known-edit anchor remapping, distinctive
one-sided reload matching, ambiguous/changed-target refusal, and
acronym acceptance without hiding other advice. `writingDecisions.test.js` proves
pessimistic save/retry, idempotent command reuse, per-document isolation and late
completion after disposal, reload overlapping background tracking after an
uncertain removal, reordered/new loaded IDs, queued edits without source rewind,
failed tracking during reload, overlapping tracking/load failures in both completion
orders with one successful retry, reload coalescing, queued reanchors during an in-flight save, definite
capacity recovery, and uncertain-write reconciliation through injected ports. The integration suite recreates
the controller and switches notes, adds future acronym occurrences, and reverses
each decision through production components. It also delivers a new note’s
mount event before its controller is selected, then proves that first-edit
Ignore anchors survive nearby/multiple edits and controller recreation. View tests assert loading/disabled,
error/retry, empty state, accessible disclosures, standard buttons and scoped
restore callbacks. Pure Go plans cover version/schema/record validation, unknown
metadata, ID collisions and replay; rooted adapters prove actual new-App reload,
concurrent read/modify/write, context-only reanchor/restart without resurrection,
reversal, private permissions, corrupt-file
preservation and outside symlink refusal without changing Markdown. Persistence
belongs below the browser layer; the existing inline browser scenario adds only
async Ignore/Restore focus handoff. Repeat actual keyboard/pointer operations
and Pure restoration in the packaged native webview.

The existing `outline.spec.js` covers shared-pane/Pure geometry and focus. One
`editorUX.spec.js` writing scenario covers source navigation around rendered
Markdown, arrow movement, mouse/drag selection, dotted computed paint, the
hover-to-popup pointer path, visible before/after examples, borderless rounded
suggestion backgrounds, sidebar-edge popup containment, Apply/Ignore, Ctrl/Cmd+., Tab/Shift+Tab, Escape,
keyboard activation, focus restoration, and undo. The same boundary scenario
covers rendered-link paint, hover-to-Apply, preserved link activation, vertical
source transitions and drag selection in both directions. `writingLinkHints.test.js`
keeps exact inline/wiki/reference label mapping, overlapping sentence hints,
protected destinations, widget identity, trimmed reference-label padding, tooltip restoration and
immediate stale-hover rejection before repaint
below the browser layer. It also indexes findings by result identity, bounds
queries to the viewport, retains unchanged mounted label plans and verifies
zero offscreen finding-bound reads during legitimate DOM reconciliation.
`TestProductionBuildRejectsMissingStartupBundleAndWorkers` uses Go's actual embed
validation in a temporary module: source-only builds work without generated
files, a prepared production build is accepted, and removing the application
bundle or any worker fails the production build. `releaseMetadata.test.js`
requires an explicit, synchronous Bash preparation step before Windows
compilation. These checks cover packaging; they do not claim WebView2 execution.

`productionBundle.spec.js` verifies actual worker initialization without browser errors, eager bundles, and no post-ready feature
module requests. Repeat these editor checks in the packaged native webview;
Linux WebKitGTK results and 1k/10k-word measurements are in
[WRITING_ENGINE.md](../WRITING_ENGINE.md). Windows/macOS native checks require those
platforms; CI runs their Go adapter contracts. Reproduce the local editorial and
Node timing report with `node scripts/profile-writing.mjs` after frontend preparation.

`writingNextPackages.test.js` exercises real sentence-spacing, diacritics, and
readability output: Unicode/Markdown-safe fixes, line-break preservation, optional
accented names versus the unaccented verb “resume,” short/protected sentence
exclusions, and one finding retaining length/formula evidence. The use-case
regression covers retry, individual Apply, and occurrence Ignore; component
coverage checks explicit space counts and accessible replacement buttons. These
rule additions do not change CodeMirror decoration or cursor geometry. Keep the
rule matrix below the browser layer and reuse the assembled production startup
check for eager dependencies. Harper's isolated evaluation and reproduction
command are recorded in [WRITING_ENGINE.md](../WRITING_ENGINE.md#harper-evaluation).

`writingSlopless.test.js` runs every one of the 29 selected real Slopless rules,
checks the complete 77-rule inclusion/exclusion inventory, protected Markdown,
CRLF/Unicode/encoded offsets, one quote-style finding per mark under Formulaic
writing with mark-only fixes, stable merged evidence,
examples, reversible serialized Ignore, and no typography under Consistency.

`writingQuality.test.js` runs every lens help example and every offered lens
replacement through all lenses, with real US/UK dictionaries, and requires no
new finding. It also covers acronym-definition wording and Ignore decisions
saved under a check's former kind. `writingCorpusSafety.test.js` covers
Directness reader-assumption scope: instructions and reader-addressed sentences
are reviewed, descriptions and titles are not. `writingLensesModel.test.js` and
`writingLensesView.test.js` cover distinct group IDs and per-lens counts whose
number is described rather than added to the checkbox name.
The analysis use-case checks independent Formulaic execution, debounce and stale
results; component tests cover the independent Formulaic writing checkbox and existing styled actions.
Rooted preference tests cover Formulaic choices across restart and Apply to all.
These rules change no CodeMirror extension, cursor geometry or PDF syntax; reuse
the assembled production startup check for browser worker compatibility.

`writingTextlint.test.js` exercises the real unmatched-pair and terminology rules,
their exact Unicode/Markdown ranges, canonical case, independent lens selection,
advisory examples, protected content, and the relevance prefilter. It also proves
familiar acronym exceptions and lowercase definitions against pure projected
prose. The native Go regression verifies the exact Microsoft.Acronyms pin/hash,
sole bundled Microsoft rule, definitions, familiar acronyms, and attached units.
Editorial fixtures explicitly preserve `8.1Mib`, `10MB`, and `20ms`. Worker tests
cover initialization failure/termination/retry; use-case tests retain successful
JavaScript findings after Vale timeout and exercise safe Apply/Ignore. Existing
inline/catalogue components cover the new examples and accessible buttons.
These additions change no CodeMirror extension, decoration geometry, or PDF syntax.

The inline-review follow-up was checked in the packaged Linux WebKitGTK app
with disposable vault data: dark/light popup styling, hover Apply and Undo,
Ignore, Ctrl+., Tab/Shift+Tab, Escape, bidirectional arrow/drag selection, and
Pure mode. A spelling dictionary addition survived restart and left note text
unchanged. The code/model tests own failure and stale-action matrices; the
native check establishes the actual webview geometry and focus boundary.

### Workspace consistency and scheduling safety

The existing `kanbanDueDate.spec.js` exercises the card's top-right action and
bottom-left/right date-control geometry, non-crossed pill paint, direct pointer
picker delivery, Escape focus handoff, picker placement, and clear-both menu,
not backend argument matrices. `kanban.test.js` owns exact S/D/Delete,
modifier/repeat dispatch, dirty-source refusal, retained endpoints, and
failed-write card retention. The existing Gantt browser boundary compares Calendar/Kanban/Graph
control insets and keeps footer geometry fixed. The focused Kanban presentation
scenario verifies that the real Board/Gantt track, loading columns, columns, and
cards are borderless theme surfaces, while card hover and keyboard focus remain
observable. It also compares the computed track and selected-segment paint for
Settings' Kanban choices, Board/Gantt, and Month/Timeline in both native themes,
preventing a Settings context rule from restyling the shared primitive. The
same browser boundary samples the Board/Gantt highlight across real animation
frames, requires an intermediate transform, and checks the settled pill against
the selected option's geometry. Static design-system coverage requires the
one- through four-option selectors plus forced-colors and reduced-motion fallbacks.
Catalogue tests verify that explicit quiet choices stay borderless
and theme-relative in representative dark and light themes; ordinary choices
may still use optional `--choice-*` outlined defaults. Static contracts retain
forced-colors borders for Settings and Kanban. The existing editor boundary
covers caret-anchored `@date`, Arrow Up/Down, and task mouse/drag selection; normal
macro completion component tests cover Enter/Tab/Space and source undo. The
task-rail component also refuses handoff after switching notes, including an
identical-source note while loading or choosing its date.


Right-pane restoration regressions cover per-tab open/closed selections, stale
activation rejection, Settings and planning toggles, and one width policy in the
pure/coordinator/component suites. The existing Outline launcher browser scenario
checks compact button geometry, selected paint, visibility of every launcher,
switching below the old PDF width minimum, and the restored Settings round trip.
It also checks buffer-status alignment with the pane open, resized, switched,
overlaid, and closed; compact metrics fit the exposed buffer and the window
resize grip stays at the window corner. The existing Pure-mode scenario keeps
its word-count-only footer assertion.
The existing writing picker scenario checks the portalled Settings combobox,
Pure focus, vertical cursor movement and mouse selection. Language-support and
apply-all ordering/error/metadata matrices stay below the browser layer in the
writing view/use-case and rooted Go settings tests. The pure lens model proves
that language changes uncheck unsupported lenses without selecting them again
on return; preference tests cover atomic save/retry and cleanup of older choices
without a startup write. The model also covers each disabled-lens explanation;
`writingAdditionalRules.test.js` covers curated term alternatives, capitalization,
punctuation, the above-30-word readability boundary, and protected spans. Real runtime
fixtures cover article pronunciation, quoted context, Unicode and Markdown
mapping, independent lens selection, and advisory-only long sentences. Use-case
coverage checks new-lens failure/retry and requesting Vale after it becomes
needed. Rooted preferences tests save/reopen the new IDs and preserve note text;
the bulk settings plan covers them for existing documents and defaults.
Components exercise the shared tooltip on checkbox/label, unchanged selection on
click, live reason updates, removal on enabling, and accessible descriptions.
The existing writing-picker browser scenario verifies native hover delivery
from a disabled checkbox and its label and viewport containment of the tooltip.
That same scenario covers a sentence-wide Readability underline across emphasis,
its advisory example, the taller Pure picker, and native keyboard/drag geometry.
Components assert unchecked/disabled states and the footer layout adapter’s
shared width and close reset. Native WebKitGTK must also
check pane widths, footer alignment, corner-grip placement, restoration, combobox
focus, and cursor/selection behavior.

The package expansion adds `writingPackages.test.js` and
`writingTypographyModel.test.js`: real pinned package outputs, contextual
Inclusive language alternatives, protected quotes/paths, separate contraction
and typography goals, paired quotation edits across formatting, encoded-marker
refusal, and proselint provenance/deduplication are checked below the browser.
Rooted Go tests persist Inclusive language with the existing lenses and verify
the fourteen selected proselint rules against their pinned SHA-256 manifest. The
real-adapter editorial report uses `expected` for combined output and optional
`workerExpected` for JavaScript-only output in fixtures that require Vale. The existing writing-picker
browser scenario checks consolidated lens controls, paired quote Apply/Undo, and the
same Pure/keyboard/drag geometry; native WebKitGTK repeats those boundaries.

The next package additions use `writingNextPackages.test.js` for same-line
spacing, optional diacritics, and conservative formula eligibility and distinct length/complexity advice.
The pure package-policy model protects projection boundaries; real package
fixtures cover output and source mapping. Existing use-case/component suites
verify retry, individual actions, space-count labels, and optional accent wording.
No new editor decoration or layout is introduced by these rules.

### Writing review audit regressions

`writingEditorialSafety.test.js` exercises the actual pinned adapters for correct
and incorrect article pronunciations, wrapped context, US/UK uncertainty, and
inclusive pronoun/identity false corrections. The shared editorial fixture report
adds independent negative examples for unicorn/hour, personal references, soft
wrapped acronym definitions, and ordinary uppercase words. These establish
specific correctness cases, not an aggregate language-accuracy claim.

`writingReviewModel.test.js` proves grouping and all-or-nothing bulk planning
for 120 occurrences, protected source, stale ownership/revision/configuration,
analyzing states, overlaps, and contextual/multiple-choice exclusions. Component
tests bound both single-passage and many-passage cards to four initially, expose
occurrence navigation, accessible Show more focus, early actions, lazy technical
diagnostics, and alternative disclosure. The real CodeMirror integration proves
bulk edit/Undo/Redo without touching code, reanchored Ignore after recreation,
and deletion of an ignored paragraph without relocating Ignore to similar text.
The existing writing browser scenario checks only actual bulk focus/history and
compact geometry in addition to its existing pointer/keyboard boundary.


### Second writing audit and asynchronous review regressions

`writingRuntime`, `writingSpelling`, and `writingDecisionsIntegration` cover wiki
destinations, fragments, embeds, explicit display aliases, and guarded bulk Undo.
`writingTextlint` covers ordinary capital words from bundled dictionary data,
hyphenated/eX acronym expansions, real undefined acronyms, and protected-boundary
negative cases. `writingDecisionsModel` bounds context searches for 1,000 inactive
records against 500 repeated terms without a timing-sensitive unit assertion.
`writingDecisions` injects background tracking, proves input observation does not
read source or invoke work, and covers worker failure/retry, immutable uncertain
commands, pending edits, deletion, and persistence. Real CodeMirror integration
recreates the controller after delayed storage to prove the correct occurrence
remains visible. `writingAnalysis` rejects late background resolutions;
`writingAdapters` proves eager worker wiring, ordered cross-note jobs, and actual
cancellation. The existing production startup browser check expects all three
workers ready without new feature requests after startup.

For the native boundary, use an owned vault to compare a ~34k-character note with
500 repeated terms and 100 inactive decisions against a zero-decision control.
Record actual beforeinput-to-next-frame latency with lenses disabled and enabled,
plus stale-result, delayed Ignore, restart, Ctrl+., arrows, bidirectional drag, and
bulk Undo/Redo checks. Report these as local observations, not universal latency
guarantees. Pure correctness and backend failure matrices remain below the browser.

### Third writing audit recovery regressions

The decision use-case tests reproduce an uncertain removal followed by Reload
while a tracking response is pending. They cover surviving/new/reordered IDs,
queued edits without source rewind, tracking failure, coalesced reloads, and
disposal. The prose use case and adapter tests reproduce a worker replacement
after analysis but before resolution, including delayed spelling, cache reuse,
and explicit partial failure if recovery cannot rebuild the missing prose.
The analysis test uses the production result view to verify retained spelling,
the warning and Retry action, successful full retry, and late recovery guards.
These failure sequences belong below the browser; native fault injection checks
the assembled bridge/worker integration without adding browser test branches.

The independent-lens package review adds `writingPackageReview.test.js` and
shared native fixtures: every restored Vale rule, each added Inclusive pattern,
shared concern identity, enabled-lens-only fixes, separate same-sentence advice,
and serialized Ignore are checked below the browser. Native Go tests execute
all twenty restored Vale rules and validate Unicode ranges and pinned files.
The existing terminology/Slopless suites cover every selected term/rule.
Use-case regressions cover new Vale lens routing and missing-evidence cache
invalidation while typing proceeds. See [the package review](../WRITING_PACKAGE_REVIEW.md).

### Consolidated writing lens controls

`writingLensesModel` proves that five groups cover all nine check families, full
group activation/deactivation, lossless legacy subsets, spelling-only Spanish
Proofreading, and no automatic re-enabling on return to English.
`writingLensesView` checks five labels, group counts, native mixed state with the
approved Partial badge, disabled reasons, live short summaries, and whole-group
events. Preferences tests reopen controllers after save/retry to verify complete
group persistence without startup writes. The pane/Pure integration confirms
shared grouped choices and spelling activation while preserving document ownership.
Existing browser selectors use Proofreading and Clarity; no new browser scenario
or editor decoration/geometry change is introduced by consolidation. The subsequent approved disclosure is covered by the regressions below.
Group IDs are distinct from check IDs, and legacy check-ID actions still toggle
their group. Per-lens counts use the approved muted badge: the model counts each
visible finding once, the view hides counts for unselected groups and when
analysis is unavailable, and the pane integration verifies a real analysis
count. The outline browser scenario selects groups by their stable names.

### Animated writing disclosure

`disclosure.test.js` covers ARIA linkage, summary updates, inert closed content,
rapid reversals, stable icon DOM, programmatic focus return, disabled/busy
recovery, and disposal. `writingLensesModel` owns document/loading/default
expansion policy; view tests prove that saves preserve expansion and Pure keeps
its controls visible. Catalogue tests enforce registration and production reuse.
The existing catalogue browser workflow verifies actual resting label/summary
contrast in Figaro Dark, CRT and Light, hover/focus paint, intermediate grid
height and chevron rotation, Tab skipping/re-entry, narrow layout and reduced
motion. The existing writing-picker workflow retains assembled pane/Pure focus
and editor cursor/selection coverage. No editor widget, decoration, saved text,
PDF rendering or geometry policy changes.

### Writing lens help

`writingLensHelp.test.js` covers short summaries, three/four editorial examples,
partial-selection detail, language-specific coverage, unsupported examples,
limitations, independent info actions, ARIA, persistent help, dismissal/focus,
live updates, and document/owner/disposal cleanup. `floatingMenuModel` proves
left placement, height clamping, and narrow-window fallback with plain geometry.
The pane/Pure integration checks portal containment, nested Escape, and release
when switching to Pure. The existing catalogue browser scenario checks narrow
help scrolling and shared theme paint; the existing writing-picker scenario
checks clipping, pointer persistence, native Tab/Shift+Tab, focus return and Pure
containment. No extra end-to-end scenario or editor geometry change is introduced.
`floatingMenu.test.js` models border and native-scrollbar metrics to prove stable
outer dimensions during explicit/ancestor/resize placement and skipped internal
scroll events. The catalogue workflow uses four actual wheel-driven top/bottom
round trips in a short viewport and asserts unchanged help bounds; this browser
boundary catches the real scroll-metric feedback that jsdom cannot render.

### Writing corpus safety regressions

`writingSpelling.test.js` requires every lens replacement (inclusive
alternatives, consistent terms and capitalization, terminology) to pass the
real US/UK dictionaries, and keeps miscased product names flagged.

`writingCorpusSafety.test.js` covers technical vocabulary and acronym plurals,
reviewed-only spelling bulk plans and controls, dictionary apostrophe safety,
quote/possessive boundaries, all four emphasis forms, numeric compounds, balanced
URL punctuation, mapped sentence-length thresholds, contextual noun/inclusive
guards, and forward/reverse/plural acronym definitions. Each family retains
positive controls for useful advice and protected-source negative cases. The
existing package inventory remains intact; updated fixtures distinguish contextual
suppression from removing a provider rule. Pure and real-package tests establish
these changes; they do not alter CodeMirror geometry or require another browser
workflow. Existing worker cancellation/recovery and long-note checks remain
required. Corpus counts are diagnostic observations, not precision/recall or
production-readiness scores; see [WRITING_CORPUS_FIXES.md](../WRITING_CORPUS_FIXES.md).

### Writing rename continuity and long-note analysis

`writingPathContinuity` tests pending storage before/during rename, failure
release and retry. `writingPathModel` coverage in the same suite distinguishes
folder boundaries and specific merge copy names. The mounted writing-lenses
component retains choices and reversible decisions at the new path; the existing
file-tree scenarios assert native move/merge/rename calls use the barrier.
`internal/settings/writing_relocation_test.go` covers pure metadata preservation
and conflicts. Desktop rooted tests cover rename, folder move, merge collision
names, restart/Restore, corrupt records, escaping symlinks, private permissions,
rollback and temporary-file cleanup. The injected writer test covers an uncertain
second write; a real rooted failure separately proves first-file rollback and
outside-path protection.

`writingTokenCache`, `writingParagraphRule` and `writingWorkBudget` tests establish
bounded reuse, independent token objects, unchanged relative offsets and bounded
source-size deadlines. Worker lifecycle tests retain short-job timeouts, prove
long-job cancellation/recovery and cap stalled resolution at thirty seconds.
Native tests verify long-note budgets, prompt caller cancellation, bounded
admission, and cooperative engine reuse. JavaScript workers retain timeout/error termination and five-second ordinary
initialization/short-job deadlines. Prose/spelling cancellation retains the warm
worker and waits for its acknowledgement before admitting another job.

Run `node scripts/verify-writing-performance.mjs` for exact real-package findings
and source-map comparisons, an upstream punctuation comparison, and the real
worker message boundary with foreground timers, cancellation and recovery. Run
`node scripts/profile-writing.mjs --long` for the existing 51 combined editorial
fixtures and 1k/10k plus unique numbered 25k/50k technical workloads. Keep timing
reports and environment metadata; do not encode noisy stopwatch thresholds in
unit tests. Foreground Node timers are not native typing/input-to-paint evidence.
No editor decoration/layout changed here; existing cursor/native webview checks
remain applicable rather than duplicating them for pure computations.

The [writing usefulness corpus proposal](../WRITING_CORPUS.md) defines the separate
editorial evaluation: licensed untouched prose, reviewed minimal pairs, whole
documents, harmful-Apply tracking, noise per 1,000 words and held-out human review.
It is a proposal, not a collected or annotated corpus or a quality pass claim.

The [embedded Vale evaluation](../VALE_EMBEDDED_PROTOTYPE.md) is historical evidence.
Production regressions compare complete alert multisets against 72 pinned CLI
fixtures, including Unicode and repeated runs, and exercise the worker lifecycle
with held fake analyzers plus real rules. Run `go test -race ./internal/writing`
and `(cd third_party/vale && go test ./...)`. `node scripts/profile-writing.mjs`
now profiles the production adapter. The [integration report](../VALE_INTEGRATION.md)
records native Linux save/typing/cancellation evidence, syscall observations,
and platform limits. Native Windows/macOS execution remains required for those
platforms. `scripts/check-go-coverage.sh` also runs the nested Vale tests; native
platform CI runs them separately. The release metadata regression rejects
executable-preparation steps and requires notices in each archive. No benchmark
establishes editorial usefulness.

`designSystemBundle.test.js` checks that generated catalogue comments lose trailing whitespace while strings and template literals retain their exact contents; regeneration remains idempotent.

Release-action dispatch regressions explicitly enable Make directory diagnostics and still require exactly the selected release command; nested Make output cannot masquerade as the command under test.

Release browser regressions use the current five-lens disclosure and scope Settings
combobox checks to the active Settings panel. Spelling is no longer a startup
preference gate or a Properties picker. At narrow buffer widths, the status bar
hides its editor-state group, keeps visible metrics inside the buffer, and leaves
the window resize grip at the physical corner. `statusBar.test.js` owns group names
and reading order; `editorSettings.test.js` owns auto-commit writes and rollback.
The README and product specification share a native Linux editor screenshot.
The README also illustrates in-place writing review and PDF Preview with
separate captures. `releaseMetadata.test.js` verifies the shared editor image
references and its PNG signature. For documentation changes, verify relative
links and images, render the README at repository-page width, and inspect each
capture for readable content and complete controls. Use demonstration files
in an isolated native session; keep screenshots free of private notes.

The rooted writing adapter tests verify every pinned Vale rule against its
`SOURCE.json` hash. Git attributes preserve those bytes across platform checkouts;
the exact Microsoft sentence-length rule retains its upstream final blank line.

The desktop fixture helper resolves temporary-directory symlinks before opening
its vault, so expected file URLs and synthetic watcher events use the same
canonical root as the app. Its alias regression reproduces macOS `/var` versus
`/private/var` behavior on any runner that supports directory symlinks.

The CI and Release PDF integration steps pass `--no-sandbox` only to their
trusted, authored Chromium fixture on disposable Ubuntu runners, whose AppArmor
policy blocks the downloaded browser's namespace sandbox. The override uses the
existing opt-in test argument port; it does not change application browser
arguments or other jobs. `releaseMetadata.test.js` parses both workflows to
verify that step-level scope. The real PDF integration test still checks page
numbers, destinations, and external-link annotations.

Windows permission assertions use Go's actual platform contract: private POSIX
mode bits are asserted on Unix; file preservation compares the mode reported
before and after rewriting on every platform. Persistence, containment, and
rollback scenarios still run on Windows. The Snap discovery fixture supplies
Linux lookup results through its injected port, and the pure candidate planner
always emits Linux paths. Mention-path policy tests cover nested slash/backslash
keys, traversal, non-Markdown targets, and equivalent self-links before the
rooted relationship integration test performs an edit.

The catalogue disclosure regression samples intermediate body geometry, then
waits for the arrow's final computed transform. A fixed sampling window does
not guarantee CSS transitions have finished when rendering frames are delayed;
that timing must not turn a working reveal into a release failure.

## Passage activity dates

`internal/activity` tests source-line identity across prepends, edits, moved
passages, repeated text, Unicode/CRLF, partial histories, and large notes.
`internal/history` tests immutable snapshot reads, cache reuse, service restart,
recorded renames, bounded traversal, and uncommitted notes. Desktop activity
relocation tests exercise real rooted rename/folder/merge operations across
restart and subsequent commits, collision preservation, metadata corruption,
symlink containment, rollback and private permissions. Editor navigation tests
cover the opt-in setting's persistence and frontend failed-save rollback.

`TestGetFileActivityNormalizesNestedVaultPathsForGit` exercises the desktop entry
point with slash, backslash, mixed, and normalized nested paths (including spaces),
checks that recorded activity loads without modifying the note, and rejects
traversal, drive-prefixed, and NUL-containing paths. It runs on each native CI and
release platform so Windows `filepath` normalization is tested with Windows
semantics. The existing rename/folder/merge restart regression also runs there;
the lower-level history tests retain their strict rejection of backslashes.

Frontend `activityModel`, `activityReview`, `activityWorkerClient`,
`activityGutter`, `activityPane`, and `activityView` unit tests own grouping, source offsets,
selected-range remapping and pane restoration, debounce, coalescing, cancellation, stale results,
worker deadlines/recovery, caret preservation, safe excerpts and accessible
actions. `editorGutterAccessibility` covers labelled activity controls while
line numbers remain decorative, including when block guides are off. Attribution
policies are not repeated in browser tests. The gutter component also checks
coalesced before-paint reservation after background enable/disable updates,
cancellation on destruction, and retained visibility classes across focus changes.
Pure date-label cases cover current
and other years, day/month order, and leading zeroes in the two-digit year;
the gutter component verifies compact visible labels and full accessible dates.
Temporary-date regressions cover immediate typing, background refresh/error
retention, Git takeover with a different day, midnight edits, same-day grouping
and tooltip updates, resets/reopening, and excluding programmatic loads. The
adapter test injects its date function and uses the CodeMirror transaction time;
no timing or attribution rules are duplicated in browser tests. Native keyboard
typing confirmed immediate same-day grouping, retention after worker analysis,
arrow movement through the new passage, and tooltip replacement after a real
Git commit.

The existing `editorUX.spec.js` block-guide scenario enables activity dates to
check actual outer/inner rail geometry immediately after switching line numbers
on, off and on again, and reads a restored block guide's gap in the same browser
callback that enables it. This prevents a later resize or animation frame from
concealing an unmeasured gutter. The scenario also checks shared row alignment,
transparent helper/activity current rows, keyboard/fold/mouse selection, source
widgets, pane focus and width restoration through Settings. Static geometry
checks wait for the finite Pure-mode transitions and read compared rectangles
in one frame, so movement between snapshots cannot create a false overlap.
Run the native
packaged webview cursor check with dates enabled as well: Welcome line 23
**Text formatting** → Up to 22 → Down to 23, then both directions across Mermaid
and table blocks, date keyboard activation, and bidirectional drag selection.
Keep native QA in a disposable vault on an isolated display.

`editorBlockActionLayout.test.js` verifies the DOM adapter's measurement order:
new gutter widths take effect before centered writing-edge measurements, while
stable widths avoid an extra measurement. Layout decisions remain covered by
`editorBlockActionLayoutModel.test.js`.

The implementation was checked on Linux GTK 3.24.52 / WebKitGTK 2.52.6 using
an instrumented packaged build and a disposable vault. Native arrows, date
activation, source diffs, bidirectional drag, Settings restoration and Pure
suppression passed. A 12,000-word / 1,000-paragraph note kept 40 measured editor
transactions between 4 and 12 ms while draft activity was enabled. These are
local dispatch measurements, not a guarantee for every document or platform.

## Curated grammar regression coverage

[The grammar contract](../WRITING_HARPER.md#verification-and-maintenance) owns
the 15-rule port corpus and 162 pure Go checks. Run `npm run test:focus --
writing-grammar`, `go test ./internal/writing/...`, and the nested Vale race
suite. The checked-in native bridge fixture is verified by Go and consumed by
frontend projection/action tests. The shared reviewed minimal-pair corpus also runs directly against the pure
Go package. Every single-error positive rejects competing grammar suggestions,
and each offered correction must leave the sentence free of grammar warnings.
CodeMirror component tests prove Apply, Undo, Ignore, advisory-only
modal review, homophones and multiword fixes across emphasis, and stale-action
refusal; rule matrices belong below the browser. A dense Unicode line checks
exact mapping and independent protected-context caches.
The context expansion adds reviewed noun/verb minimal pairs, possessive
ordinals, proper-name predicates, existential auxiliaries, compound subjects,
questions, and advisory adjacent pronouns. Valid cases protect object pronouns,
possessive gerunds, technical nouns and dialect variants. Pure and native tests
require each correction to leave the sentence free of grammar findings. The
native merge test keeps unrelated doubled-determiner occurrences and rules.
Infinitive/auxiliary minimal pairs protect “going to be” contraction corrections
and possessive gerunds with a later finite predicate. Unicode/emphasis probes
exercise the exact production bridge mapping. The [whole-document evaluation](../benchmarks/writing-documents-2026-09-20.md)
runs all providers and dictionaries through the combined review stage with
frozen sources and separately recorded editorial judgments.
The broad batch adds phrase/literal minimal pairs, gerunds, comparisons, ordinals,
mathematical variables, comma separators, split-word priority, and conditional
advice. Apply/Undo tests cover phrase and gerund edits across emphasis; generated
bridge probes withhold cross-delimiter and cross-line replacements. The Vale CLI
equivalence test uses the embedded Vale adapter, while the combined native
corpus verifies additional pure Go findings and rejects competing corrections.
Native QA must also exercise real eager workers, the Wails bridge, typing/save,
cancellation/reuse, and shutdown. Existing productionBundle coverage proves
there are no interaction-triggered module requests.

The usage batch adds 60 rule families plus independently authored noun-subject
agreement and extends mass-noun quantifiers. The shared corpus protects literal
word meanings, prepositional attraction, collective/invariant subjects,
mandative perfects, question auxiliaries, countable noun compounds, and accepted
regional or split-word variants. Production bridge probes cover preposition,
word-choice, possessive, agreement and countability Apply/Undo across emphasis,
explicit link labels, masked code/technical text, Unicode repetition and
multiline advisory spans. The native reference comparison includes the 60
Harper families and MassNouns; the independent noun-subject rule has no claimed
matching Harper rule ID. Report corpus judgments separately from native parity.

## Writing quality regression coverage

`writingQuality.test.js` checks real US/UK dictionary behavior across the pane,
underlines and context-menu suggestions, including technical vocabulary,
lower-camel-case identifiers, current-note acronym definitions and definition
removal with a warm suggestion cache. It covers plural suffix preservation,
balanced multiline punctuation in full/incremental analysis, meaningful positive
controls for context suppression, and merged indirect-opening advice with both
sources, independent lenses and saved/legacy Ignore decisions under partial output.

Grammar policy 7 adds 86 positives and 95 distinct valid examples across 29
existing families, including the discovered software-modifier regression. Every
single-error case must remain one actionable grammar concern and resolve cleanly
after applying it. Native bridge probes add Unicode/CRLF repetition, protected
text and clause-boundary negatives. Four new CodeMirror cases apply and undo
question, multiword-preposition, intervening-adverb and software-countability
corrections across emphasis. The native reference comparison and fresh-document
judgments are recorded separately in the
[quality evaluation](../benchmarks/writing-quality-2026-09-20.md).

The subsequent document-gap regressions cover args/backoff/Ctrl/debounce across
both English dictionaries and every spelling surface, PascalCase/dotted members,
technical noun/API-parameter senses, temporal/classifying “just,” reported route
descriptions and overlooked risks, literal birds and weather, adjectival tired
states, and observed past scenes, with meaningful advice controls. The 177-rule
corpus contains 573 positives and 1,041 valid examples. New bridge probes cover
agreement across a modifier, perfect “saw,” local quantity/splice eligibility
beside code, protected phrases/quotations, conditional clauses, and Unicode/CRLF.
Three Apply/Undo cases and advisory-only comma Ignore run in CodeMirror. Serial
clause coordination is a required negative. Replay both existing document
manifests; the previously fresh sample is now a development regression corpus.

`writingRelevance.test.js` checks technical passive descriptions across every
provider span shape, explicit-actor and unrelated-sentence controls, familiar
vocabulary versus useful phrase shortening, and meaningful modifiers versus
broad emphasis. Real package output proves independent quote/apostrophe
conventions, protected code, exact advisory marks, and current whole-note policy
after incremental paragraph edits. Replay both development manifests and retain
all prior judgments; record any lost useful advice or correction separately.

`writingDescriptionContext.test.js` checks 29 descriptive/technical passive
patterns across native full spans and package participle-only spans, 16 actor
and boundary controls, eight meaningful existential contexts across all three
providers, seven weak/hidden/disconnected complements, overlapping grammar
corrections and actual bundled output. The frozen-document replay combines real
Go, package and spelling output; keep every prior useful finding and safe edit.
The [context follow-up](../benchmarks/writing-context-2026-09-20.md) records the
remaining findings and the representative packaged WebKitGTK workflow.

Typing retention is also covered by `editorTypingInventory.test.js`: 10 and
1,000 findings retain mapped positions without enumerating the snapshot getter,
with bounded edited-range invalidation, immutable old snapshots and disabled
stale actions. Paragraph edits must still remove affected marks. Existing
writing-inline/retention cases own structural edits, global advice and refresh.
