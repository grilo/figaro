# Writing and lenses

[All guides](README.md) · [Notes and planning](NOTES_AND_PLANNING.md) · [Diagrams and export](DIAGRAMS_AND_EXPORT.md)

## Write in Markdown

Figaro renders the surrounding document while keeping the active source
editable. Use headings, lists, links, tables, callouts, footnotes, math, and code
blocks. The help button (**?**) opens Markdown syntax and Figaro macros.

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

## Focus on a draft

Collapsing the sidebar enters **Pure mode**. The writing fills the window,
with a word count and controls that appear when needed. The top controls return
when you approach the upper edge. Expand the sidebar to restore the workspace.

Open **Settings → Appearance → Pure mode** for typewriter scrolling and
phrase or paragraph focus. You can also let text sizing follow the window.
Typewriter scrolling starts enabled; adaptive text sizing starts disabled.

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
- **Add to dictionary** accepts a spelling across this vault.
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

These checks offer advice, not a quality score. Grammar coverage does not include
subject–verb agreement or contextual homophones such as "their/there." Passive
voice and qualifying language can be appropriate. Inclusive suggestions need
context, and personal pronouns remain the author's choice.

Acronym review looks for definitions with matching initials throughout eligible
prose. A definition can appear before or after the first use. It does not verify that an
expansion is correct. Code, math, metadata, and link destinations are protected;
prose lenses also skip quoted passages. Number/unit spacing is not checked.

Formulaic writing includes optional advice about unspaced em dashes and curly
quotes or apostrophes. Those preferences do not establish AI authorship.
See [rule coverage](WRITING_SLOPLESS.md), the [writing engine reference](WRITING_ENGINE.md),
and the [evaluation limits](WRITING_CORPUS_FIXES.md) for more detail.
