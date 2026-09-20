# Writing and lenses

[All guides](README.md) · [Notes and planning](NOTES_AND_PLANNING.md) · [Diagrams and export](DIAGRAMS_AND_EXPORT.md)

## Write in Markdown

Figaro renders the surrounding document while keeping the active source
editable. Use headings, lists, links, tables, callouts, footnotes, math, and code
blocks. The help button (**?**) opens Markdown syntax and Figaro macros.
Writing lenses ignore footnote identifiers such as `[^reference]`, including
undefined references. They still review the actual footnote text; an identifier
is not a spelling or style suggestion.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd+B | Toggle bold |
| Ctrl/Cmd+I | Toggle italic |
| Ctrl/Cmd+K | Insert or edit a link |
| Ctrl/Cmd+Shift+X | Toggle strikethrough |
| Ctrl/Cmd+backtick | Toggle inline code |
| Ctrl/Cmd+Shift+V | Paste exact plain text |
| Ctrl/Cmd+Shift+B | Toggle the sidebar and Pure mode |
| Ctrl/Cmd+. | Review a writing suggestion at the caret |
| Ctrl/Cmd+Shift+L | Open lens controls in Pure mode |

Pasting rich text preserves supported formatting as Markdown. A URL pasted
over selected prose creates a link. Spreadsheet tables can become Markdown
tables. Use plain-text paste when you want the clipboard text unchanged.

Press Enter on an empty list or quote line to leave one structural level.
Fold headings and blocks using their left-side guides. Raw Text Preview shows
the complete source, including Properties, and can copy it to the clipboard.

**Settings → Editor** includes optional Vim editing, relative line numbers,
and Tab Size. Tab Size defaults to four spaces and accepts values from two to
eight; it does not rewrite existing indentation. Press Escape, then Tab or
Shift+Tab, to move keyboard focus out of the document editor.

Your restored note is ready to edit while writing engines and vault indexing
prepare in the background. Auto-Save and the close guard are installed before
you can type. Saving writes the note to disk first; Git history and task/index
updates follow. A failure in those follow-up steps leaves your saved text intact.
The writing engine runs inside Figaro and reuses its bundled rules in memory.
It does not extract or launch a separate Vale executable. Unchanged Markdown
block mappings and paragraph checks are retained while you edit; review still
uses the current complete note for consistency and punctuation conventions.

## Focus on a draft

Collapsing the sidebar enters **Pure mode**. The writing fills the window,
with a word count and controls that appear when needed. The top controls return
when you approach the upper edge. Expand the sidebar to restore the workspace.

Open **Settings → Appearance → Pure mode** for typewriter scrolling and
phrase or paragraph focus. You can also let text sizing follow the window.
Typewriter scrolling starts enabled; adaptive text sizing starts disabled.

## See when a passage changed

Enable **Settings → Editor → Navigation → Activity dates** to show recorded
Git dates in the outer margin, always including the year: **7 Sep 26**. This
setting starts off and applies across the vault. Headings, paragraphs, and
rendered blocks keep their existing editor
controls in the inner margin, aligned with the text and optional line numbers.
Pure mode hides the dates with the other chrome.

A date applies to the consecutive passages below it until the next marker.
The same day can appear again after a different day: **7 Sep 26 → 3 Sep 26 → 7 Sep 26**.
Scrolling into a group repeats its date at the first visible passage so you
keep the context. Prepending a meeting or moving unchanged text does not
refresh older passages' dates.

Click a date to open those passages in **History → Activity**. Review a change,
expand **View changes**, or use its link button to go to the passage in the
current note. This view keeps your draft editable. **Versions** opens the
existing saved-note history. You can also open History from the status bar and
choose Activity when margin dates are hidden. Closing the pane restores editor
focus; switching away and back restores the document's pane for the session.

New typing immediately shows today's local date. It groups with adjacent
passages from the same day, and its tooltip explains that some changes have
not yet been recorded. This temporary display date stays through background
analysis and saves while editing; it is discarded when the note is reopened
or Figaro closes. Recorded Git dates take over when available.

A dash has an explanation on hover: existing text can be **unrecorded** or its
earlier attribution can be **unknown**, with no observed edit date. Auto-Save
writes files; Auto-Commit or **Save to history** records the dates. Loading errors offer Retry. Large or ambiguous
histories may have unknown passages rather than guessed dates.

These dates describe edits, including temporary dates for current typing,
rather than the date of the meeting or event.
Keep using `@today`, `@tomorrow`, or an explicit date for those links. Activity
adds no Markdown or PDF content and does not add dates to Calendar. Git history
and vault-local move metadata keep attribution available after restarting.

## Choose writing lenses

Open **Writing lenses** beside the document. Choose **Analysis language** first,
then select any combination of lenses:

| Lens | What it reviews |
| --- | --- |
| Proofreading | Spelling, repeated words, terminology, quotation consistency, and selected grammar and punctuation |
| Clarity | Wordy phrases, jargon, clichés, unexplained acronyms, and long or complex sentences |
| Directness | Possible passive constructions, qualifying phrases, and emphatic punctuation |
| Inclusive language | Generic roles, exclusionary expressions, and accessibility wording |
| Formulaic writing | Stock phrasing, rhetorical patterns, repetition, and optional typography preferences |

Proofreading includes selected English verb agreement, infinitive, auxiliary,
possessive, number, homophone, and phrase checks: for example, “She go” →
“She goes,” “your welcome” → “you’re welcome,” and “an advice” → “a piece of
advice.” It also checks “I belief,” compound subjects such as “my mother and
me went,” and questions such as “Has we finished?” and “Do I ready yet?”
Selected prepositions and word choices also cover “good in swimming,” “a friend
of me,” and “safe the file.” Noun-subject and amount checks catch “The chairs
is ready” and “fewer time,” while preserving “fewer time slots.”
These include 15 reviewed Harper-port rules and 160 Figaro checks. Apply checks the exact current text and can
be undone; Ignore remembers only that rule at that occurrence. Uncertain cases
and paragraphs with masked quoted/code context are left alone. See the
[curated grammar scope](WRITING_HARPER.md) for examples and limits.

Further context checks catch “What dose this sign mean?” and “We all seam to
agree,” while preserving “beware in the forest” and “a software rendered game.”
Common technical words such as async, dotfiles and etag, lower-camel-case
identifiers and acronyms defined in your note avoid misleading spelling advice.
Balanced multiline parentheses and literal end-of-day instructions receive
fewer false warnings. Equivalent “there is/are” advice appears once even when
both Clarity and Directness are selected; saved Ignore decisions still apply.
Checks now follow a noun subject across one prepositional modifier, such as
“the box of tools were,” and distinguish “had saw the tool” from “saw blades.”
“Amount of times” can become “number of times.” A possible comma splice receives
advice so you can choose the connection between the clauses. API members,
PascalCase identifiers and reviewed technical abbreviations avoid unrelated
spelling guesses. Literal timing, bird food and adjectival states are preserved.

English US and UK support spelling and prose checks. Spanish supports spelling
only under Proofreading. Changing the language clears unsupported checks.
They stay off until you select them again. Hover a disabled lens for an
explanation. **None** disables all checks.

New notes start without a language or lenses unless the vault has saved
defaults. Choices belong to each document. **Apply to all documents** copies
the current language and combination to existing documents and sets defaults
for future notes in this vault. It does not change note text.

Expand **Lenses** to change the combination. Each info button explains coverage,
limitations, and examples. **Partial** means only some checks in a group are
enabled, including choices retained from an older version. Select the group to
enable all supported checks. Control spelling here. Legacy spellcheck
frontmatter stays as ordinary metadata.

## Review suggestions

Analysis runs locally in background workers after a typing pause and uses
unsaved text. Dotted underlines mark eligible words and phrases. Hover one, or
place the caret inside it and press **Ctrl/Cmd+.**, to see an explanation and
available actions. Escape returns to editing.

- **Apply** offers a reviewed replacement when available. Other hints give
  examples for manual revision, such as naming the actor in a passive sentence.
- **Ignore this occurrence** remembers that suggestion at that place in the note.
- **Add to dictionary** accepts a spelling across this vault. English US/UK
  also accept its regular plural and singular/plural possessives, with straight
  or curly apostrophes. This works for previously saved words too; verb endings
  and irregular plurals are not inferred. Adding a singular possessive also
  accepts its base and regular plural. Adding a terminal-apostrophe possessive
  accepts the unpossessed s-ending word without guessing its singular. Spanish
  keeps exact-word acceptance. Equivalent Unicode accent encodings match in
  both built-in and personal dictionaries without rewriting your text.
- **Accept an acronym in this document** accepts that acronym for the note's
  analysis language, including future occurrences.
- **Details** explains the rule and when keeping your wording may be appropriate.

In the pane, the link icon jumps to the relevant passage. Identical advice
shares one card with occurrence navigation. **Show more suggestions** reveals
more cards. Suitable repeated replacements offer **Apply to all occurrences**
within the current document as one Undo/Redo action. Other suggestions remain
individual decisions.

If analysis fails, the pane identifies partial results and offers **Retry
analysis**. Failed preference or review-decision saves also offer recovery
actions. An unsuccessful write does not count as a saved choice.

## Keep and reverse decisions

Manage accepted words from **Settings → Editor → Personal dictionary → Manage…**
or the **Manage dictionary…** shortcut under Proofreading. The resizable dialog
keeps search and actions above/below its scrolling list, with immediate saves
and Undo for removal; Settings retains only the count and launcher.

Ignored occurrences, accepted acronyms, the personal dictionary, and document
choices survive restarts. Open **Saved review decisions** to choose **Restore
suggestion** or **Review acronym again**. You can also remove inactive decisions.
The saved-decision list has a limit of 1,000 records and explains how to make room.

Known nearby edits can preserve an ignored occurrence. Changed or ambiguous
passages are shown again instead of assigning an old decision to the wrong text.
Renaming or moving notes inside Figaro preserves writing choices and decisions.
Figaro does not match renames made outside the app. These records live in
the vault's `.config/` folder, separately from the Markdown.

## Use judgment

These checks offer advice, not a quality score. Grammar checks cover selected
constructions, simple pronoun agreement, and contextual homophones. Complex
subjects, domain-specific usage, and ambiguous meanings still need your review. Passive
voice and qualifying language can be appropriate. Inclusive suggestions need
context, and personal pronouns remain the author's choice.

Acronym review looks for definitions with matching initials throughout eligible
prose. A definition can appear before or after the first use. It does not verify that an
expansion is correct. Code, math, metadata, and link destinations are protected;
prose lenses also skip quoted passages. Number/unit spacing is not checked.

Writing review avoids synonym-only advice for familiar words such as “remain,”
“contains” and “however,” and preserves reviewed descriptions of manner,
frequency and degree. Directness leaves reviewed technical process descriptions
alone while retaining actor-focused passive advice. Timed maintenance, reviewed
physical states, elliptical API descriptions and possessive-gerund reactions
also stay unmarked. Concrete “there is/are” statements about location, quantity
or availability, such as “there is still time,” remain unchanged. Weak
introductions such as “there is a need to” stay reviewable. These are bounded
context guards, not a claim to understand every sentence.

Formulaic writing includes optional advice about unspaced em dashes and curly
quotes or apostrophes that differ from the note’s prevailing straight style.
Consistent curly punctuation is preserved. Quotation and apostrophe conventions
are inferred separately, with first occurrence breaking ties; code and quoted
wording do not set the prose apostrophe convention. Those preferences do not
establish AI authorship.
See [rule coverage](WRITING_SLOPLESS.md), the [writing engine reference](WRITING_ENGINE.md),
and the [evaluation limits](WRITING_CORPUS_FIXES.md) for more detail.


While typing, retained underlines use mapped source ranges and invalidate the
edited paragraph without enumerating all findings in a long note. They remain
read-only until fresh review arrives; changing Markdown structure still clears
stale marks. See the [typing inventory](benchmarks/editor-typing-inventory-2026-09-20.md)
for measured work and the remaining analysis costs.
