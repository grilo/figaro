# Curated English grammar checks

## Scope

Proofreading adds 15 reviewed rules from **vale-cli/Harper 0.1.0** (derived from
Harper 2.7) and 162 conservative Figaro grammar checks: 177 rule IDs in total.
The second batch added 28 independent implementations reviewed against native
Harper 2.10.0; the third expands their context and adds five pronoun/question
checks. Policy 5 added 60 phrase, construction, word-boundary, and punctuation
checks. Policy 6 adds 60 contextual usage checks, a separate noun-subject rule,
and broader mass-noun quantifiers. They run in the existing
embedded Go engine. No Harper executable, Wasm module, new runtime, network
service, or additional worker is required. This is a selected grammar expansion,
not full Harper parity or general semantic understanding.

Choose **English US** or **English UK** and enable **Proofreading**. Suggestions
use the existing explanation, Apply, Ignore, and Undo controls. Advisory-only
rules explain the construction without offering a guessed edit. Spanish remains
spelling-only.

## Selected rules

| Rule | Reviewed concern | Apply |
| --- | --- | --- |
| BetterOffWith | better of with → better off with | Yes |
| SimplePastToPastParticiple | have went → have gone | Yes; adapted perfect-tense subset |
| SupposedTo | are suppose to → are supposed to | Yes; requires a preceding form of be |
| TheMy / TheMy2 | my the / the my | Advice only |
| DespiteOf | despite of | Advice only |
| IsBeenAuxSequence | is been → has been | Yes |
| AnAnother / AnotherAn | an another / another an → another | Yes |
| TheAnother | the another → the other / another | Reviewed alternatives |
| SomeOfThe | some the → some of the | Yes |
| EachOthersPossessive | each others → each other's | Yes |
| SomebodyElses | somebody's else → somebody else's | Yes |
| ForTheNthTime | for second time | Advice only |
| WillNonLemma | will goes | Advice only; lowercase modal, preserving the name Will |

The pinned [inventory](writing-harper-inventory.json) accounts for all 547 port
YAML files: selected rules, explicitly deferred candidates, and rules not yet
reviewed. These statuses describe the Vale files; the 154 additional Go
implementations have a separate inventory and do not enable their corresponding
YAML versions. Unreviewed files are not bundled. ProgressiveNeedsBe is deferred
because it incorrectly changes valid phrases such as “I have swimming lessons,”
“running water,” and “working parents.” Other deferred candidates include an
incorrect article replacement, regional wording, and overlaps with spelling or
the new infinitive checks.

SimplePastToPastParticiple is adapted to perfect tenses, accepts curly apostrophes
in *I've*, and omits ambiguous noun forms. This avoids incorrect corrections of
“I am broke,” “I have saw blades,” and “We have rose bushes.” Capitalized
name-like targets are withheld. SupposedTo requires a preceding form of *be*
to preserve “What do you suppose to be true?” WillNonLemma accepts lowercase
modals to preserve “Will goes to school.” The manifest records upstream and
bundled hashes for all three adaptations. Other selected YAML files retain
their upstream bytes.

## Core agreement and infinitive checks

| Check | Example | Conservative boundary |
| --- | --- | --- |
| PronounVerbAgreement | She go → She goes | Sentence-initial pronouns; skip invariant past forms and embedded/compound subjects |
| IAmAgreement | I are ready → I am ready | Leave “John and I are ready” alone |
| PronounInflectionBe | They is ready → They are ready | Present-tense *be* only |
| InflectedVerbAfterTo | I want to goes → I want to go | Require an explicit infinitive cue; preserve “look forward to seeing” and “used to working” |
| ModalOf | could of finished → could have finished | Require a following participle and a clear modal reading; preserve “could of course finish” |
| MissingTo | I want go → I want to go | Narrow *want* constructions; skip ambiguous noun readings such as “want help” or “need work” |

## Added constructions and homophones

These 28 rule IDs are narrower than their native Harper counterparts. Each has
independent positive and valid-sentence cases; an upstream name does not promise
identical parsing or coverage.

| Check | Reviewed example | Boundary |
| --- | --- | --- |
| DidPast | Did she went? → Did she go? | A nearby verb after did/didn't; ambiguous past/base forms withheld |
| DoubleModal | We will can go | Advice only; regional pairs such as “might could” withheld |
| ModalBeAdjective | You should ready → You should be ready | Reviewed predicates; preserve “could kind of see” |
| OughtToBe | It out to be → It ought to be | Explicit subject and “out to be” |
| LetToDo | let her to help → let her help | Pronoun/indefinite object and base verb; permits nearby only/just/not |
| ThereIsAgreement | There is two problems → There are two problems | Clear number and common noun; skip measures, collectives, invariant nouns, coordinated groups, and singular subjunctive “were” |
| OneOfTheSingular | one of the problem → one of the problems | Skip ambiguous noun compounds such as “car park” and collective readings |
| MassNouns | an advice → a piece of advice | Reviewed advice/information/info/equipment/furniture/luggage/homework/clothing/software; preserve attributive “a clothing shop,” “a software rendered game” and capitalized technical names |
| CriteriaPhenomena | one criteria → one criterion | Explicit singular/plural cues |
| ItsPossessive | wagged it's tail → wagged its tail | Noun phrase in a possessive slot |
| ItsContraction | Its raining → It's raining | Clear subject and reviewed predicate |
| ThereToTheir | I like there plan → I like their plan | Possessive cues; preserve locative “There lies…” and existential modals |
| TheirToThere | Their are two problems → There are two problems | Existential construction or strong place cue |
| TheirToTheyre | Their waiting → They're waiting | Clear subject and predicate |
| TheyreToTheir | I like they're plan → I like their plan | Possessive slot; preserve “They're doctors/leaving/not allowed…” |
| PossessiveYour | You comments may… → Your comments may… | Bare you requires a reviewed non-human noun head; also you're → your in possessive slots; preserve “You programmers/people…” |
| YourPredicateAdjective | Your welcome → You're welcome | Reviewed predicates; preserve “your right to vote” and possessive gerunds |
| ThenThan | better then before → better than before | Explicit comparison; temporal “back than” → “back then”; preserve “was younger then” |
| ToTwoToo | is to expensive → is too expensive | Reviewed to/too contexts; the word “two” is not automatically rewritten |
| NounVerbConfusion | good advise → good advice; I belief → I believe | Advice/advise, breath/breathe, complaint/complain, belief/believe, intent/intend and selected affect/effect phrases; “How much do you weight?” → “…weigh?”; preserve “better advise,” psychological affect, weighting samples and “effect change” |
| WereWhere | Do you know were they went? → …where… | Reviewed place clauses and were predicates |
| Everyday | I do everyday → I do every day | Adverbial cues; every day thing → everyday thing; preserve attributive everyday |
| Discuss | discuss about the plan → discuss the plan | Preserve approximate amounts and “something to discuss about…” |
| AskNoPreposition | ask to him → ask him | Person objects after ask, plus narrow sentence-initial tell cases |
| AllowTo | allows to swim → allows swimming | Preserve passive “is allowed to”; uncertain inflected cases are advisory |
| WorthToDo | worth to try → worth trying | Reviewed regular/irregular gerunds |
| ElsePossessive | someone elses book → someone else's book | Indefinite pronoun and a following noun |
| PluralDecades | in the 1990's → in the 1990s | Four-digit decade in a plural context; preserve possible possessives such as “1990's music” |

## Pronoun and question context

The third batch adds five checks and broadens the existing homophones and
noun/verb pairs. A bare subject supplies agreement in “She belief” → “She
believes”; an auxiliary retains the base verb in “Did you intent” → “Did you
intend.” Possessive ordinals such as “it's 100th cycle,” clear proper-name
predicates such as “I hope its Katie,” and existential perfect/modal forms such
as “their have been delays” and “their should be a warning” are covered.

| Check | Reviewed example | Boundary |
| --- | --- | --- |
| SubjectPronoun | Me and Alex went → Alex and I went | Sentence-initial compound subject, capitalized name, and following verb; preserve object phrases and fragments |
| CompoundSubjectI | My mother and me went → My mother and I went | Possessive noun phrase and following verb; preserve “between my mother and me” |
| HavePronoun | Has we finished? → Have we finished? | Initial question with I/you/we/they and a supported complement |
| DoIAdjective | Do I ready yet? → Am I ready yet? | Reviewed adjective and complement; preserve verbal “Do I ready the equipment?” and “Do I calm the baby?” |
| MultipleSequentialPronouns | I we need to leave | Advice only for selected incompatible pronoun sequences; preserve “tell me they left,” “give me it,” and uppercase IT/US |

Expanded contexts still preserve possessive gerunds (“their planning a party
pleased us” and “your running today surprised us”), noun modifiers (“its Google integration”), psychological *affect*,
the verb *weight*, and dialect-dependent spelling. Capitalization-sensitive technical names such as eBay and iOS are withheld from
compound-subject reordering. Figaro does not expand casual
abbreviations such as *ur/ya/yr*. A reviewed contraction correction replaces
overlapping generic doubled-determiner advice at the same occurrence.

The pinned dictionary provides lexical hints, not a complete syntactic parse.
Figaro verifies regular morphology because the port's dictionary labels some
past forms as base verbs. These rules deliberately miss uncertain constructions,
complex subjects, uncertain proper-name contexts, dialect-dependent noun/verb pairs, and semantic
homophone choices. Domain-specific count nouns may still need Ignore. General
Harper parity is not claimed. The [comparison report](benchmarks/writing-grammar-expansion-2026-09-19.md)
records second-batch gaps and correction differences. The
[context-expansion comparison](benchmarks/writing-grammar-context-2026-09-19.md)
records the third batch against its 49-check baseline.

The subsequent policy-4 correction distinguishes infinitives and passive/perfect
auxiliaries from a later finite predicate. “Their going to be late” again offers
“They're,” while “Their going to be late worried us” remains possessive. The
bounded eight-token guard retains negation/modifiers and does not implement a
full clause parser. The [whole-document review](benchmarks/writing-documents-2026-09-20.md)
records the fix, combined-provider findings, and remaining misses.

## Broad phrase and mechanics coverage

Policy 5 adds 60 checks to the existing 54. Reviewed phrase mappings are adapted
from the pinned Harper 2.10.0 source; their matcher and contextual decisions run
in pure Go. This larger batch groups rules that share bounded matching and
source-safe replacement behavior. It does not enable all native variants.

| Family | Added checks | Reviewed examples |
| --- | --- | --- |
| Complements and comparisons (7) | LookingForwardTo, InterestedIn, SinceDuration, AdjectiveDoubleDegree, LookForwardTo, GetUsedTo, UseToUsedTo | look forward to meet → …meeting; interested on music → …in music; since two days → for two days; more cheaper → cheaper |
| Common expressions (21) | AllIntentsAndPurposes, BareInMind, MootPoint, AMeansToAnEnd, AdNauseam, Albeit, AllOfASudden, AsFollows, AtAllCosts, BatedBreath, BeckAndCall, CaseInPoint, FreeRein, InLieuOf, InOfItself, OnTheSpurOfTheMoment, PeaceOfMind, PerSe, SneakPeekPreview, WhetYourAppetite, Ado | for all intensive purposes → for all intents and purposes; bare in mind → bear in mind; baited breath → bated breath |
| Word choice and prepositions (19) | WaistWaste, TheWhetherWeather, DigestiveTract, ExplanationMark, ExtendOrExtent, GrindToAHalt, InThisThatRegard, InflectionPoint, MakeDoWith, ResponsibilityFor, WreakHavoc, WroteToRote, GetRidOf, StatuteOfLimitations, TrialAndError, ThanksALot, InAnIdealWorld, OutOfSync, BackhandedCompliment | waist of time → waste of time; make due with → make do with; statue of limitations → statute of limitations |
| Word boundaries (7) | Itself, Misunderstood, Misunderstand, Misused, Furthermore, Meanwhile, Therefore | it self → itself; miss understood → misunderstood; further more → furthermore |
| Mechanics (5) | CorrectNumberSuffix, CapitalizePersonalPronouns, CommaFixes, HyphenateNumberDay, DoubleEdgedSword | 21th → 21st; i'm → I'm; hello,world → hello, world; a 3 day trip → a 3-day trip |
| Conditional advice (1) | IfWouldve | If I would have known, I would… receives advice about an unreal past condition; no automatic edit |

Every family has reviewed positive and valid/ambiguous counterexamples.
Complements require supported lexical cues: “look forward to work” can refer to
a noun, and “interested on Monday” is a time adjunct. Duration checks preserve
starting points such as “two days ago.” Comparisons preserve counting phrases
such as “more cheaper chairs.” Weather advice requires an explicit forecast,
weather adjective, or “under the weather” context.

Phrase matching preserves literal readings including “give her a piece of my
mind,” “the responsibility of the manager,” “we miss used books,” “the case and
point are separate objects,” “let it self-regulate,” and rubric explanation
marks. Initial mathematical *i*, identifier-adjacent ordinals, numeric comma
separators, and single-letter coordinates remain unchanged. These are bounded
exceptions, not a general semantic parser. Number-day hyphenation requires a
reviewed noun head; conditional advice requires an initial pronoun clause and
a comma-separated result clause.

The same update corrects “had a strong affect on” and “that decision will effect
everyone,” preserving psychological *affect*, “effect change,” and “effect
everyone's release.” A split-word correction suppresses competing pronoun/verb
agreement only at its own occurrence: “She miss understood” offers
“misunderstood,” while a separate “She go” still receives agreement advice.

The [broad-batch report](benchmarks/writing-grammar-broad-2026-09-20.md) compares
the 54- and 114-check builds against the pinned native reference and replays the
six-document evaluation. The older reports retain their historical counts.

## Contextual usage and noun subjects

Policy 6 adds the following 60 reviewed Harper reference families. The rules
share the existing eager phrase index or bounded pure context scan; they do not
enable every upstream variant or treat the upstream tests as a correctness oracle.

| Family | Added checks | Reviewed examples |
| --- | --- | --- |
| Prepositions and complements (21) | AccuseOf, AspireTo, GoodAt, FascinatedBy, JealousOf, PassionateAbout, TakeCareOf, TakePrideIn, ReasonForDoing, InFavourOfDoing, CureFor, ExceptOf, TakeALookTo, AwareOf, BewareOf, CuriousAbout, InspiredBy, InsteadOf, LaughOfAt, SimilarLike, AwaitFor | accused him for stealing → …of stealing; good in swimming → good at swimming; in favour helping → in favour of helping |
| Common expressions (15) | AsOpposedTo, DueDiligence, EnMasse, EnRoute, ForALongTime, HalfAnHour, InHindsight, InTheSameVein, OneAndTheSame, OnceInAWhile, RulesOfThumb, PointsOfView, PassersBy, StateOfTheArt, OneFellSwoop | as oppose to → as opposed to; for along time → for a long time; several rule of thumbs → several rules of thumb |
| Word choice (12) | PiqueInterest, QuiteQuiet, PrincipleToPrincipalRoleNoun, ToLoseTooLoose, BoarderBorder, SeamToSeem, DoesOrDose, SafeToSave, SaveToSafe, WasAloud, SpinalChord, HopHope | peaked my interest → piqued my interest; principle investigator → principal investigator; safe the file → save the file |
| Word boundaries (7) | Notwithstanding, Henceforth, Whereas, Beforehand, Alongside, EveryTime, OvertimeCompoundNoun | hence forth → henceforth; everytime → every time; their over time pay → their overtime pay |
| Verb and possessive constructions (5) | LetsConfusion, DoMistake, FriendOfMe, HaveAHardTime, HowDoesCompared | Lets go → Let’s go; did a mistake → made a mistake; a friend of me → a friend of mine; how does it compared → …compare |

**NounSubjectAgreement** is an independently authored additional rule. A
bounded determiner/common-noun phrase with an adjacent auxiliary supports
“The spare chairs is” → “…are,” “The chair are” → “…is,” and “My books has
arrived” → “…have arrived.” It withholds prepositional attraction, coordinated,
collective and invariant nouns, nominalized adjectives such as “the poor,” singular counterfactual *were*, and embedded
mandative *have*. It does not parse arbitrary noun subjects or correct every
finite verb. **MassNouns** additionally changes *fewer* to *less* before reviewed
uncountable heads such as time, money, water and information, while preserving
“fewer time slots,” “fewer traffic jams,” and “fewer research papers.”

Context matters: “loose the arrows,” “the laugh of the baby,” “the boarder of
the school,” “a look to it,” “for reasons of logging,” “do diligence,” “before
hand surgery,” and “Over time pay increased” keep their literal readings.
Prepositions require a reviewed complement; location and time adjuncts remain
untouched. Lexical corrections such as *dose/does* suppress generic pronoun
agreement only at that exact occurrence, retaining unrelated agreement advice.

Five initial candidates were replaced during review: FedUpWith, CraveFor,
CommitmentTo, SufficeItToSay and Nonetheless. The batch preserves accepted or
ambiguous usage rather than prescribing those preferences. Dictionaries record
[suffice (it) to say](https://dictionary.cambridge.org/us/dictionary/english/suffice-it-to-say),
[intransitive crave for/after](https://www.collinsdictionary.com/dictionary/english/crave),
and [none the less](https://www.collinsdictionary.com/us/dictionary/english/nonetheless).
The reviewed corpus also protects “fed up of” and “commitment towards.”

The [usage-batch report](benchmarks/writing-grammar-usage-2026-09-20.md) compares
this implementation with the 114-check baseline and native Harper, then replays
the frozen full documents and packaged Linux workflow. Historical reports keep
the counts and limitations measured at their original snapshots.

## Broader contexts and quality follow-up

Policy 7 kept the same 175 rule IDs and broadened 29 existing families:
AccuseOf, AspireTo, AwaitFor, BewareOf, BoarderBorder, CuriousAbout, CureFor,
DoesOrDose, FascinatedBy, FriendOfMe, HaveAHardTime, InHindsight, InTheSameVein,
JealousOf, LaughOfAt, LetsConfusion, MassNouns, OvertimeCompoundNoun,
PassionateAbout, PrincipleToPrincipalRoleNoun, QuiteQuiet, ReasonForDoing,
SafeToSave, SeamToSeem, SimilarLike, SpinalChord, TakeCareOf, TakePrideIn,
and Whereas. The shared corpus adds 86 positive examples and 95 distinct valid
sentences, for 554 positives and 1,000 valid examples overall.

Bounded modifiers and complements now support “the boarder between the two
countries,” “We all seam to agree,” “What dose a business analyst do?” and
“You should definitely safe your changes.” Countability includes software and
info while preserving noun compounds, including “a software rendered game.”
Selected plural possessives, invitations and noun-subject contrasts also gain
coverage. The checks still decline arbitrary dependencies across clauses,
prepositional attraction, uncertain names, and many valid lexical alternatives.

Counterexamples preserve locative “beware in the forest,” “what dose it takes,”
“the laugh of the baby,” vocal music chords, “for the standard reasons of
wanting stability,” “a book on hindsight bias,” and countable heads following
mass-noun modifiers. Some upstream positive tests prescribe uncertain or
incorrect rewrites; they are comparison inputs, not an acceptance target.
The countability and responsibility readings follow the reviewed uses of
[software](https://dictionary.cambridge.org/us/grammar/british-grammar/countability-software)
and [take care of](https://dictionary.cambridge.org/grammar/british-grammar/word-patterns-take-care);
ambiguous caution phrases remain unchanged.

The [quality report](benchmarks/writing-quality-2026-09-20.md) compares the same
409 upstream positive cases before and after this change, includes all negative
controls, and separates those development examples from the fresh documents.

## Document gap corrections

Policy 8 has **177 rule IDs**: 15 Vale-port rules and 162 pure Go checks. It
closes the five errors identified in the later document review:

- NounSubjectAgreement follows the original noun across one bounded
  prepositional modifier: “The box of tools were” → “was,” and “The instruments
  near the bridge has been checked” → “have.” Coordinations, relative clauses,
  collective/invariant heads and singular counterfactual “were” remain excluded.
- SimplePastToPastParticiple permits “saw” → “seen” after perfect auxiliaries,
  with at most two reviewed intervening adverbs and an explicit object
  determiner/pronoun. “Saw blades,” “saw dust,” and the ordinary past “I saw”
  remain unchanged. The adapted YAML hash and source notice are updated.
- The independently authored CountableAmount check recognizes reviewed discrete
  heads in “amount of times/requests/errors.” It preserves measured amounts and
  noun compounds, and includes the article when “an amount” becomes “a number.”
- The independently authored CommaSplice check reviews two substantial clauses
  with explicit subjects and finite predicates. It leaves the author to choose
  a conjunction, semicolon or sentence break. Dependent clauses, parenthetical
  “I think,” short rhetorical lists and serial coordination remain unchanged.

The corpus now has **573 positives and 1,041 valid/ambiguous examples**. Native
bridge fixtures cover Markdown emphasis, Unicode/CRLF and protected contexts;
Apply/Undo tests cover all three new correction shapes. Comma-splice advice has
rule-specific Ignore and no Apply action. [The gap report](benchmarks/writing-gaps-2026-09-20.md)
replays the reviewed documents; they are now regression material, not holdout gold.

## Source and execution contract

- The native adapter loads the pinned dictionary and all rules eagerly. Sequence
  models have immutable, content-addressed identities, so separately constructed
  engines cannot reuse a different dictionary under the same model name.
- Grammar decisions and morphology live in `internal/writing/grammar`, without
  I/O, timers, editor state, or global application state. The adapter converts
  rune offsets to Vale's one-based, inclusive Unicode columns; the existing
  frontend resolver maps them to UTF-16 source ranges.
- Grammar is requested even when its check family is the only selected family.
  Enabling it after a cached result without native evidence starts the missing
  native analysis. Existing queue, cancellation, deadline, error/retry, saving,
  and shutdown behavior remains in effect.
- A prose block containing masked quotation, inline code, or technical text is
  withheld from the contextual grammar checks. CountableAmount is an explicit
  exception: its finding spans its complete visible phrase. CommaSplice is
  advisory-only and verifies its own bounded clauses, allowing an opaque
  technical subject without reading hidden contents. Neither exception can
  underline or replace protected text. Removing masked words must never create
  false adjacency for the remaining rules. Formatting and explicit link labels can remain eligible; a fix is
  offered only for an exact, contiguous, editable source slice. Entity encodings,
  changes spanning Markdown delimiters, and implicit reference identifiers never
  receive a destructive replacement. A replacement that crosses an authored
  newline is also withheld; native multi-line constructions remain advisory.
- Only the explicit frontend allowlist can expose native grammar actions. Fixes
  require a reviewed rule, a bounded literal replacement, exact matched text,
  and a fresh document snapshot. Existing Vale style rules stay advisory.
  Article advice covered by an *an another* correction is suppressed.
- Replacements preserve matched capitalization and existing or prevailing
  apostrophe style. Per-review Unicode offset tables and block-eligibility
  caches avoid rescanning a dense long line once per finding.
- Each rule has its own canonical kind and occurrence identity, so saved Ignore
  decisions do not suppress a different grammar rule. No persistent schema
  change is needed. Context-sensitive grammar has no bulk Apply action.
- Sequence expansion, tagged tokens, pure grammar tokens, alerts, and serialized
  output are bounded. Crossing a limit fails the scan instead of returning a
  silently truncated success. Cancellation remains cooperative inside a native
  scan; the caller and shutdown never wait for that scan to finish.

## Verification and maintenance

`tests/fixtures/writing-grammar.json` contains a reviewed positive
and correct-sentence corpus for every enabled rule. Pure Go tests cover additional
verb forms, ambiguity, Unicode, CRLF, repeated positions, protected boundaries,
and work limits. The embedded adapter checks real alerts, hashes, and source
coordinates. Nested Vale tests exercise dictionary isolation, bounded sequence
loading, cancellation, reuse, and repeated Unicode offsets under the race detector.
The pinned Vale CLI equivalence test exercises the embedded Vale adapter directly;
combined-engine corpus tests additionally verify the Figaro Go findings.

`writing-grammar-native.json` is a checked-in bridge fixture generated through
the production Go profiling adapter and the real Markdown projection. Go tests
verify it against the current engine; frontend tests resolve the same output into
Proofreading cards and safe fixes. CodeMirror component tests exercise Apply,
one-step Undo, Ignore, and rejection of a stale action after editing. The second
batch exercises homophone and multiword replacements across emphasis, distinct
advisory-only modal Ignore, and a dense Unicode line with independent context
caches. The third batch adds compound-subject and question Apply/Undo, adjacent
pronoun Ignore, and independently reviewed object/gerund/name minimal pairs.
The broad batch adds phrase, gerund, comma, ordinal, contraction and number-day
bridge probes, Apply/Undo across emphasis, and advisory conditional Ignore.
Cross-delimiter or cross-line replacements are withheld. Pure regressions cover
literal and clause boundaries, competing split-word advice, repeated Unicode
offsets and the finding limit. The usage batch adds literal/preposition, noun
subject and countable-compound counterexamples, lexical-correction priority,
and Apply/Undo for preposition, agreement, amount, possessive and word-choice edits.

Focused verification:

```sh
npm run test:focus -- writing-grammar
node scripts/vendor-writing.mjs
node scripts/update-writing-grammar-fixtures.mjs
# Review the generated fixture diff; generation does not establish correctness.
go test ./internal/writing/...
(cd third_party/vale && go test -race ./...)
```

Keep licenses and both upstream/bundled hashes in
`internal/writing/styles/Harper/SOURCE.json`; the Go implementations and adapted
phrase mappings record
their native Harper reference version, archive hash, test/source hashes, and
154-rule additional inventory in `internal/writing/grammar/SOURCE.json`. Updating dependencies does not
implicitly enable more rules. Add independent correct-sentence cases before
expanding the allowlist or morphology. Re-run native initialization, full review,
Apply/Undo, typing/save, cancellation/reuse, and shutdown checks for engine changes.

## Native verification — 19 September 2026

The [context-expansion report](benchmarks/writing-grammar-context-2026-09-19.md)
compares the 49-check baseline with the then-current 54, including the five new
pronoun/question checks and the final native verification.

The [second-batch comparison and native benchmark](benchmarks/writing-grammar-expansion-2026-09-19.md)
compares the original 21 checks with the then-current 49 and records native Harper coverage.
The results below describe the earlier first batch.

The [paired native benchmark](benchmarks/writing-grammar-2026-09-19.md) and
[raw samples](benchmarks/writing-grammar-2026-09-19.json) cover actual Wails/WebKitGTK
startup, full prose review and rendering, Apply/Undo, persisted Ignore, saving
while analysis is pending, cancellation/reuse, and shutdown. The uninstrumented
Linux binary grows by 1.90 MiB (0.46 MiB as gzip). All six final runs passed.
Windows/macOS runtime behavior remains unmeasured.
