<p align="center">
  <img src="figaro.appicon.png" width="96" alt="Figaro application icon">
</p>

<h1 align="center">Figaro</h1>

<p align="center"><strong>From your first note to a finished document.</strong></p>

<p align="center">
  Write in Markdown, connect your ideas, organize your work, and export polished PDFs.
  Your files stay on your computer.
</p>

<p align="center">
  <a href="https://github.com/grilo/figaro/releases/latest"><strong>Download for Linux, Windows, or macOS</strong></a>
  · <a href="docs/README.md">User guides</a>
  · <a href="CHANGELOG.md">What's new</a>
</p>

![A library project in Figaro Dark, with linked research notes, a comparison table, and next steps](docs/images/figaro-editor.png)

Figaro is a free desktop workspace for people who write, research, and plan in
Markdown. Keep a reading journal, develop an essay, or work through a project
with its notes and tasks together. Start with a few files and add structure as
you need it. You don't need an account.

## A workspace you can make your own

- **Keep control of your notes.** Your writing, images, and diagrams live in
  ordinary files. Open them in another editor, back up the folder, or keep it
  under version control.
- **Find room to write.** Markdown renders around the line you are editing.
  Collapse the sidebar for Pure mode, with optional typewriter scrolling and
  paragraph focus. Outside Pure mode, the status bar stays visible while you write.
- **Revise with local feedback.** Choose writing lenses for spelling, clarity,
  directness, inclusive language, or formulaic phrasing. Review suggestions
  beside your words and decide what to keep.
- **Connect ideas to action.** Link related notes, follow backlinks, and turn
  tasks in your notes into a Kanban board or calendar plan.
- **Finish something worth sharing.** Add tables, diagrams, charts, or math,
  then export a PDF with your choice of page styling.

## Capture an idea and follow it

Use **Quick note** to catch a thought before it disappears. Link it to an
existing note as you write, or create a new one from the link completion menu.
Search helps you return to a phrase, a topic, or a half-remembered title.
Backlinks show which notes mention the current one. The graph gives you
another way to explore those connections.

Keep several notes open in tabs, and middle-click a tab to close it. Figaro asks
before discarding unsaved changes. Typing and moving the caret keep the tab strip
stable, including in long notes with charts.
Cursor movement also keeps breadcrumbs and pane controls stable. Image previews
stay mounted during ordinary movement, and an open Outline updates only the
headings whose active state changes. Editing prose retains Outline rows and an
unchanged task board, while heading and task edits continue to update their
navigation targets. Formatting and ordinary code previews also reuse unchanged
state as the cursor moves, keeping long notes from rereading every code block.
Typing prose—including text with bold formatting, curly apostrophes, lists and
blockquotes—reuses previews and guide positions. Helper-rail navigation and Pure
phrase focus also reuse their prepared data in long notes. Frequent buffer
updates keep remembered cursors intact without revisiting every open tab.
Entering source updates the affected block while other previews stay in place. Find navigation
reuses its match list, and remembered cursors update directly even with many
open tabs. Lists, blockquotes and links also reuse their prepared display state
as the caret moves. Writing hints skip unchanged link labels, and relative line
numbers refresh when the caret changes logical lines. Revealed list and blockquote
markers share the body font so wrapped rows stay aligned.
Ordinary clicks inspect nearby source before looking up footnotes. Code
indentation guides and long-line completion avoid repeated broad scans; edits
after formulas retain their previews, and unchanged Mermaid diagrams reuse
their diagnostic results as prose changes.
Deleting the active note from the file tree closes its tab and returns to the
most recently used remaining tab. Closing the final tab returns to Home.

Rename a file or folder with **F2** or its context menu. The status bar identifies
the current step, from saving open files and checking references to renaming and
refreshing. Files such as CSS stylesheets skip the reference question when no
Markdown links point to them.

Use **Document outline** to jump through a long note. Selecting a heading brings
it to the top of the editor, with its section ready to read below it.
Cursor memory updates independently of tab and toolbar presentation, so moving
through a note does not refresh the workspace shell. Contributors can trace
cursor and typing work with the [editor update guide](docs/EDITOR_UPDATES.md).

Related Settings options, including Navigation and Vim mode, sit together in
inset groups with their headings above the controls. Their background matches
the workspace beneath Settings.

**Settings → Editor → Smooth mouse-wheel scrolling** optionally eases wheel
steps in the editor. It is off by default, respects reduced motion, and always
leaves macOS scrolling native. Keyboard and pointer actions stop the animation.

Ordinary prose edits keep Outline rows, Properties, writing marks in other
paragraphs, and unchanged Markdown previews in place. Editing a list or quote
refreshes its affected line. Heading, code and soft line-break edits keep unrelated
previews in place; changes to Markdown structure still refresh them. Kanban catches up with unsaved tasks when you return to it; saves and
open previews continue to use the latest buffer.

Clicking the Outline, Writing lenses, Raw, PDF, or History launcher while typing
keeps focus in the editor, so you can carry on writing. Click inside the sidebar
to use its controls; keyboard activation still provides the usual pane access.

When a note becomes a project, its tasks can stay beside the thinking that
produced them. Add a hashtag such as `#todo` to put a task on the board. Use
Calendar for dates or Gantt for a longer schedule. Open a card to return to its
source note.

Return to a project note and see when its passages changed. Enable **Activity
dates** in **Settings → Editor → Navigation**, then click a margin date such as
**7 Sep 26** to review the recorded changes. Dates and block controls stay clear
of the text when you switch line numbers or block guides on or off. Edits that
change a block label keep the centered text steady while you focus elsewhere
and return, including with Activity dates or Pure mode. Adding a new
meeting at the top preserves the older text's dates. New writing shows today's
date immediately while waiting for history to record it. Use explicit date links
for the meeting's scheduled day. Activity works for notes inside folders too,
and follows renames and moves made in Figaro on every supported platform.

[Explore notes and planning →](docs/NOTES_AND_PLANNING.md)

## Refine a draft in your own voice

With Vim **Move by visual rows** enabled, Up/Down and `j`/`k` finish traversing
wrapped prose before revealing an adjacent diagram or code block. No blank line
is needed between the block and the paragraph.

Writing lenses underline words and phrases for review. Unchanged Markdown mappings, paragraph checks and spelling lookups are reused as you edit; review work waits while you type. Previous cards stay visible while refreshing, with their actions disabled. Underlines in unchanged paragraphs follow edits; the edited paragraph and document-wide advice wait for fresh checks. Hover a suggestion to
see its explanation and, where available, a replacement you can apply in
place. Choose any combination of **Proofreading**, **Clarity**,
**Directness**, **Inclusive language**, and **Formulaic writing** for each
document.

Proofreading also catches selected English grammar mistakes such as “She go,”
“I have went,” “your welcome,” and “an advice.” It also reviews selected
homophones, uncountable nouns, verb complements, and plural decades. It catches
“I belief in you,” “their should be a warning,” and “my mother and me went,”
plus selected question forms such as “Has we finished?” It corrects “their going
to be late” while preserving possessive phrases such as “their going to be late
worried us.” Broader phrase checks catch “for all intensive purposes,”
“look forward to meet,” and “more cheaper,” alongside ordinal endings, selected
compound words, and comma spacing. Further checks catch “good in swimming,”
“a friend of me,” “The spare chairs is ready,” and “fewer time,” while preserving
valid phrases such as “fewer time slots.” Review a suggested correction, apply it
with Undo support, or ignore that occurrence. Ambiguous constructions remain
unchanged; these are focused checks rather than a complete grammar judgment.

Context checks also catch “What dose this sign mean?” and “We all seam to agree,”
while preserving literal uses such as “beware in the forest.” Technical terms
such as `async`, `dotfiles`, and `etag`, lower-camel-case identifiers, and acronyms
defined in your note avoid misleading spelling replacements. Balanced multiline
parentheses and literal scheduling phrases receive fewer false warnings.
Equivalent “there is/are” advice shares one finding across selected lenses.
Matching comma-spacing corrections also appear once, with one Apply action.
Review also catches “the box of tools were,” “had saw the tool,” and “amount of
times.” Possible comma splices receive advice without an automatic rewrite.
API members, Ctrl, args, backoff and debounce avoid spelling guesses that change
their meaning; literal “just before lunch” and “food for the birds” stay intact.

Footnote identifiers such as `[^reference]` are excluded from writing advice,
even before their definitions exist. The footnote's explanatory text is checked.

![An invitation draft with an in-place suggestion to shorten “in order to” to “to”](docs/images/figaro-writing.png)

Checks run locally in the background. Vale is built into Figaro and reuses its
rules in memory, without extracting or launching a separate executable. Your restored note is available while
writing lenses and vault indexing get ready, with Auto-Save and close protection
already active. Saves write your text to disk first; Git history and index
updates follow. A slow Git write allows newer edits to save while it records the
captured revision. Cursor movement avoids redundant browser-storage writes, and
slow workspace-session writes retain only the newest waiting snapshot. Keyboard
navigation also reuses unchanged Outline, focus, and diagram information and
avoids refreshing file-tree markers that have not changed. You can ignore a suggestion, add a word
to your dictionary, or return to a saved review decision later. Manage accepted
words through **Settings → Editor → Personal dictionary → Manage…**, or use
**Manage dictionary…** under **Proofreading** in Writing lenses. Both open a
resizable dialog with search, Add, Remove, and Undo. Its word list scrolls inside
the dialog, keeping Settings compact. Changes save automatically for every note in this vault.
Returning from Settings or another workspace panel keeps the editor’s writing
margin stable from its first visible frame. In English,
adding a word also accepts its regular plural and possessives, such as
`figarowords`, `figaroword's`, and `figarowords'`. This also applies to previously
saved words. Adding `figaroword’s` also accepts the base word and its plural;
adding `figarowords’` accepts the unpossessed `figarowords`. Visually identical
accent encodings match consistently without changing your note text. Capitalized
words receive case-matched suggestions, and all-caps and slash/dot-separated prose
is checked too. Your choices survive restarts. Repeated suggestions share a card, and suitable replacements
offer an action to apply the same change throughout the document.

Writing review preserves familiar words, meaningful modifiers and reviewed technical
process descriptions, including timed maintenance and API behavior. Concrete
“there is/are” statements about location, quantity or available time stay unmarked.
Formulaic punctuation follows the note’s prevailing quote
and apostrophe styles instead of warning about consistent curly punctuation.

The advice is optional. Grammar checks cover selected issues, and readability
hints need judgment. Formulaic writing cannot tell you who wrote a text.
English US and UK support spelling and prose checks; Spanish supports spelling only.

[Learn about writing and lenses →](docs/WRITING.md)

If a launch is slow, **Settings → Vault care → Open startup logs** opens local
timings for troubleshooting. If the controls do not respond, the
[startup troubleshooting guide](docs/GETTING_STARTED.md#troubleshoot-a-slow-launch)
also lists the log folders you can open directly.

## Turn a draft into a document

Build a table, sketch a Mermaid diagram, or turn a table into a chart without
leaving your note. Figaro renders these alongside your writing and carries them
into PDF output. Returning to a prepared diagram restores its preview without
the rendering delay, and rendered blocks retain measured source heights across
navigation. During held-key bursts, Mermaid previews settle after navigation pauses.
New or invalidated diagrams wait for a pause in typing or scrolling.
Code, formulas, tables, and loaded images also reuse prepared content when you
return from their source or scroll back. Editing the content refreshes its
preview; image resizing and Draw.io file refreshes keep their normal behavior.

![A library proposal beside its styled PDF preview in Figaro](docs/images/figaro-pdf.png)

Preview the document while you edit. Add a cover, a table of contents, page
numbers, and a local stylesheet when you need more control. Generate the PDF
beside the source note, ready to share while the editable original stays yours.

[Explore diagrams and export →](docs/DIAGRAMS_AND_EXPORT.md)

## Download and get started

Get the latest build from [GitHub Releases](https://github.com/grilo/figaro/releases/latest).
Figaro is free software under the GNU General Public License (GPL) version 3 or later.

| Platform | Download |
| --- | --- |
| Linux | x86-64 `.tar.gz` |
| Windows | x86-64 `.zip` |
| macOS | Universal Intel and Apple Silicon `.zip` |

1. Download and extract the archive for your platform.
2. Start Figaro. It uses a folder called `vault` in its working directory by default.
3. Open the welcome note or choose **Quick note** to start writing.

To use another notes folder, set `VAULT_PATH` before launching. The
[setup guide](docs/GETTING_STARTED.md) includes examples and explains how to
import existing notes.

Builds are unsigned; Windows or macOS may ask you to confirm the
first launch. Linux needs GTK 3 and WebKitGTK 4.1 or 4.0. PDF generation needs
Chrome, Chromium, Brave, or Edge; macOS can also use its built-in WebKit engine.

## Your files and privacy

Editing, search, planning, local history, and writing review run on your
computer. Figaro does not require an account, analytics service, or proprietary
storage format. Optional Draw.io editing opens the hosted diagrams.net editor;
the saved diagram stays in your notes folder.

Figaro works with one vault at a time. It has no built-in cloud sync,
encryption, mobile app, or plugin system. Local history helps recover changes
and deleted notes; keep a separate backup of your folder as well.

## Learn more or contribute

The [user guides](docs/README.md) cover setup, writing, planning, diagrams, and
export. For deeper reference, see the [product specification](docs/PROMPT.md)
and [PDF styling guide](docs/PDF_STYLING.md).

Found a problem or have an idea? [Open an issue](https://github.com/grilo/figaro/issues).
Code contributions are welcome; the [contributor guide](CONTRIBUTING.md) covers
development and testing. Start with `npm run context` for a compact feature list;
the [feature index](docs/FEATURE_INDEX.md) maps changes to source, documentation,
and focused checks. See [LICENSE](LICENSE) for the GPL terms and
[third-party notices](THIRD_PARTY_NOTICES.md) for dependency and theme credits.
