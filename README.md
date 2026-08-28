<p align="center">
  <img src="figaro.appicon.png" width="112" alt="Figaro application icon">
</p>

<h1 align="center">Figaro</h1>

<p align="center">
  A local-first Markdown workspace for notes, planning, diagrams, and printable documents.
</p>

<p align="center">
  <a href="https://github.com/grilo/figaro/releases/latest">Download</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
  ·
  <a href="docs/PROMPT.md">Documentation</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

![Figaro Dark showing a Markdown roadmap, populated vault, activity calendar, due task, document outline, and buffer status](docs/images/figaro-editor.jpg)

Figaro is a desktop knowledge workspace built around ordinary files. It combines
a source-first Markdown editor with search, backlinks, daily notes, Kanban,
calendar planning, diagrams, local history, and
browser-quality PDF export.
There is no account, hosted database, or required cloud service.
The writing surface stays central while the styled vault tree, activity
calendar, due tasks, document outline, and buffer telemetry remain close at
hand without changing the underlying Markdown.

## Features

- **Plain-file vaults.** Notes, images, code, stylesheets, and editable
  `.drawio.svg` diagrams remain normal files in a directory you control.
- **Source-first Markdown editing.** The active line stays editable Markdown
  while surrounding content renders headings, tables, tasks, callouts,
  footnotes, math, images, links, and fenced code. Editor-sized gutter guides
  fold headings, fenced code, tables, and standalone local Draw.io images
  without changing the saved source;
  each guide stays aligned to its block and under the pointer while toggling.
  Rendered fences and tables contract to one native fold row, typed fences use
  their language name, and rendered GFM tables reveal their exact Markdown
  source whenever the cursor enters them. Tables remain semantic previews;
  their left-side `editor` guide opens a focused grid for cell edits,
  row/column commands, local Undo/Redo, and Shift-held rectangular Merge/Split.
  Applying the modal is one document undo step, while an ordinary table click
  still reveals bare Markdown and the `delete` guide remains direct. Their compact
  typography and spacing fit common grids inside the source-height slot, while
  genuinely larger grids keep their own scrollbar; wheel, touch, and scrollbar
  interaction never reveal source or move the editor caret. Mermaid/Vega
  diagrams, fenced code, display math, and tables retain
  their Markdown source height while rendered, so entering and leaving them
  does not move the surrounding note. Graphics fit down; rendered code shows
  numbered code lines without its fence markers; and code/table scrollbars stay
  interactive inside the reserved space. Vertical wheel input scrolls an
  overflowing preview while it can move, then continues through the document
  at either edge; a horizontal-only scrollbar does not trap vertical scrolling.
  Decorative outlines stay off rendered code, both collapsed and expanded
  Properties, and unused source-footprint space. Properties keeps the same
  rounded tonal surface in either state, with theme-aware checkboxes inside;
  expanded Properties presents **Edit YAML** as a quiet file-code action that
  gains tonal paint only on hover or keyboard focus;
  tables, individual fields, focus, errors, and structural dividers retain their
  meaningful boundaries. Successfully loaded images, Properties,
  links, and task checkboxes keep their normal sizing. A rendered task checkbox
  has a named 24px target and changes the underlying Markdown from either a
  click or keyboard Space; an image that is still
  loading or cannot be found instead uses a themed one-source-line placeholder,
  so revealing its Markdown does not move nearby text. When that missing local
  image ends in `.drawio.svg`, the placeholder instead offers **Create Draw.io
  diagram**; it creates the referenced file relative to the note and opens the
  normal Draw.io editor without rewriting the Markdown. If that file already
  exists but has not yet been saved as renderable SVG, the action becomes
  **Open Draw.io diagram**. A standalone Draw.io image also gets a left-side
  `drawio` / `editor` stack: collapse its preview or open the editable diagram
  without finding the asset in the file tree. Expanded block controls stay
  transparent until the pointer approaches their block/left rail, the caret
  enters their source, or keyboard focus reaches them; the approach lane has no
  dead gap, and folded controls remain visible. Home/document-start navigation and Vim
  `gg` leave Properties rendered; Arrow Up (equivalent to Vim `k`) deliberately enters its
  raw YAML. Opening a Markdown note with complete Properties and no remembered
  or requested position starts the cursor on its first body line. Click a
  footnote reference to jump to
  its definition and back; an
  unresolved reference creates a spaced, undoable definition immediately after
  its paragraph and places the cursor after the colon.
- **Fast navigation.** Use connected rounded, drag-reorderable document tabs
  in the title bar, whose lower edge meets the workspace and whose leading edge
  sits flush with the buffer at the live sidebar boundary, plus optional
  path breadcrumbs, full-width editor-sized sticky heading hierarchies that
  add each active ancestor as its source row reaches the visible stack,
  relevance-ranked full-vault search with natural multi-word queries, prefixes,
  conservative typo tolerance, accent-insensitive matching, best-match excerpts,
  and low-result spelling suggestions,
  backlinks, unlinked mentions, a top-right document-outline launcher that
  stays beneath the sticky hierarchy, recent notes, pins, and file-tree
  customization. Long tabs preserve their differentiating filename ending and
  show their parent path; at narrow widths the parent path yields space before
  the filename does. Repeated arrow presses continue through the tab list,
  while vertical mouse-wheel input and Ctrl+PageUp/PageDown switch buffers and
  stop at the first or last tab. Divider ownership remains stable with or
  without documents, so themes that draw one cannot leave startup or final-tab
  seams; Figaro Dark and Figaro Light instead use a borderless active tab whose
  editor-matched surface opens directly into the buffer. Themes with a visible
  file-tree rail paint it on the same boundary pixel as the leading tab edge.
  Search results expose their selected option to assistive technology and put
  a tail-preserving parent path on its own readable line so even deeply nested
  repeated filenames remain distinguishable. Compact paths, excerpts, and
  match details retain the normal text color, including inside highlighted
  matches, across every bundled theme. **Titles**, **Recent**, and **Aa** rerun
  the current query inside the open popup, resizing that same result list
  without dismissing it. The active document leads the
  browser and native window title, and custom context menus support Shift+F10,
  arrows, Home/End, and Escape. Tab enters one current file-tree row; standard
  tree arrows then traverse, expand, collapse, and return to parent folders.
  Tab dragging remains selection-free even when the pointer crosses the file
  tree or another workspace region. Large searches, expanded trees, Kanban
  columns, and backlink sets retain their complete logical content while
  mounting bounded windows, so keyboard and assistive navigation remain
  available without creating tens of thousands of DOM elements.
- **Capture and planning.** Ctrl/Cmd+N captures a Quick Note in the real
  `Inbox`, while Ctrl/Cmd+Shift+N opens the daily note;
  hashtags form a Kanban board, and portable due-date links feed the Today
  dashboard and calendar. Calendar months and the Kanban board show
  theme-aware, reduced-motion-safe skeletons instead of an empty surface while
  their indexed data is loading. Scroll vertically over the month grid to move
  through months; the selected-day results retain their own native scrolling.
  The selected day's due tasks and linked notes
  remain visible above the fixed workspace tools and scroll independently when
  the result set is long.
- **Diagrams and data graphics.** Render Mermaid, Vega, and Vega-Lite blocks,
  open Mermaid's 32 chart types and 76 starter templates in a focused live
  editor, or edit Draw.io diagrams while keeping the saved SVG readable outside
  Figaro. A new vault's `Welcome.md` includes a ready-to-render Mermaid example.
- **Source and publishing tools.** Preview the exact raw Markdown or paginated
  output, preserve fenced-code syntax colors, add cover pages and tables of
  contents, use a standalone `---` as a PDF page break, apply vault-local print
  CSS, and generate linked PDFs.
- **Built-in reference.** Press F1 or use the title-bar `?` to open stable
  Markdown, Macros, and Shortcuts topics; closing the reference returns focus
  to the control or editor that invoked it. Find and Replace keeps its search,
  matching options, and replacement actions in three compact predictable rows.
- **Local history.** Optional per-file Auto-Commit, explicit history saves,
  comparisons, and restoration keep unrelated vault changes separate; the
  active-note status check does not scan unrelated vault files.
- **Configurable workspace.** Choose from eighteen themes, including Figaro
  CRT Phosphor with its phosphor-green palette, faint vignette, near-imperceptible
  screen perspective, and one soft scan-line pass about every five minutes.
  Figaro Dark and Figaro Light use one flat titlebar/file-tree surface and one
  flat active-tab/editor/buffer-status surface—including the editor gutter—with
  quiet inactive tabs and only subtle separators where status or sidebar tools
  still need grouping. Figaro Dark lifts that uninterrupted reading plane
  slightly above its darker navigation plane for clearer workspace orientation.
  The scan animation stays off when the operating system requests reduced
  motion. Prose and code fonts, Vim editing, line numbers, sticky headings,
  block guides, document outline, diagnostics, and fully local spellcheck
  dictionaries remain independently configurable. On launch, Figaro applies
  those saved interaction and layout choices before revealing the restored
  editor, while the first shell frame already uses the saved sidebar width.
  Ctrl/Cmd+
  mouse-wheel temporarily scales the active editor buffer; its status-bar
  **Scale** control resets to the permanent **Default Text Size** chosen in
  Settings, and closing the buffer discards the temporary scale.

For an iA Writer-like writing view, collapse the sidebar; **Settings →
Appearance → Pure mode** tunes the experience. The active file
expands to the physical top and bottom of the window while the 44px rail and
sidebar toggle remain. Any open details pane is preserved but temporarily
hidden and inert, then returns intact when the sidebar expands. Tabs and window
controls return only inside the upper 28px approach band, while sticky headings,
breadcrumbs, Document outline, and every footer item except the bottom-right
word count remain absent. The empty **Add properties** action similarly waits
for its top slot, the first-line caret, or keyboard focus.

Smooth typewriter scrolling is enabled by default in Pure mode and keeps
authored input near 42% of the viewport without reacting to mouse selection,
Find navigation, or programmatic jumps. The same Settings section can turn it
off, dim everything outside the current phrase or paragraph, and optionally
**Adapt text to window size** using three stable bands. Reduced motion makes caret
repositioning immediate. Figaro remembers all three Pure behavior preferences,
the expanded/collapsed sidebar state, and the active buffer, so the same
writing view returns on the next launch.

## Download

Download the latest build from
[GitHub Releases](https://github.com/grilo/figaro/releases/latest).

| Platform | Package |
| --- | --- |
| Linux | x86-64 `.tar.gz` |
| Windows | x86-64 `.zip` |
| macOS | Universal Intel and Apple Silicon `.zip` |

Release archives include Figaro, the changelog, and the GPL license. Each
GitHub release page reproduces the curated Added, Changed, and Fixed sections
for that exact version from the Keep a Changelog source. Builds are currently
unsigned, so Windows SmartScreen or macOS Gatekeeper may ask you to confirm the
first launch.

Linux requires GTK 3 and WebKitGTK 4.1 or 4.0 at runtime. PDF generation uses an
installed Chrome, Chromium, Brave, or Edge browser. Linux discovery includes
supported commands under `/snap/bin`, and macOS can also use its built-in
WebKit engine.

## Getting started

1. Download and extract the archive for your platform.
2. Start Figaro.
3. Open or create notes in the vault shown in the file tree.

Figaro uses `./vault` by default. Set the `VAULT_PATH` environment variable
before launch to use another directory. An empty vault receives a welcome note
with examples and a short introduction.

The Today dashboard is shown whenever no file tab is open. From there you can
create `Inbox/YYYY-MM-DD.md`, capture a timestamped quick note, review due and
overdue tasks, reopen recent notes, and rediscover older material.

## Working with files

The vault is the source of truth. Markdown stays Markdown, images remain image
files, Markdown heading sections can be folded in the editor, and code files
open with language-aware syntax highlighting, folding, completion, and
indentation guides. Vault-specific settings and workspace state live in
`.config/` inside the vault.

**Settings → Editor → Tab Size** sets one indentation width for the whole
writing environment. It defaults to four spaces and can be changed from 2 to
8 with the `− number +` control. Normal Tab/Shift+Tab, Vim `>`, Markdown code
fences, source-code files and their guides, the Mermaid source editor, rendered
GFM tables, rendered code, and Raw Text Preview all use that same
value; the preference never rewrites existing indentation or changes PDFs.

Pasting genuinely rich text from a browser, document editor, or AI chat into a
Markdown note preserves headings, emphasis, links, lists, quotes, code, tasks,
highlights, and rectangular tables as ordinary Markdown. Common clipboard-only
AI code-label, line-break, fence, and math-delimiter defects are repaired
without rewriting wording, URLs, or unrelated whitespace. Figaro keeps its own
copied Markdown exact, leaves source-only regions such as frontmatter and code
literal, and never fetches a remote HTML image while converting it. Use
Ctrl/Cmd+Shift+V for exact plain text; clipboard images, URL-over-selection,
spreadsheet tables, Vim Visual `p`/`P`, revealed table source, and the editor's Paste
menu retain their specialized behavior. A URL pasted over selected prose
becomes a Markdown link through the native shortcut, Vim paste commands, or
the menu. Spreadsheet paste prioritizes an Excel/LibreOffice HTML table, then
explicit TSV, then explicit CSV with comma-or-semicolon dialect detection.
Untyped delimited text is converted only when at least three rows form the same
rectangular shape, keeping shorter prose untouched.

Conventional Markdown editing shortcuts operate on the selected source as one
undoable edit: Ctrl/Cmd+B for bold, Ctrl/Cmd+I for italic, Ctrl/Cmd+K for a
link, Ctrl/Cmd+Shift+X for strikethrough, and Ctrl/Cmd plus backtick for inline
code. Repeating a formatting shortcut around its matching markers removes that
format. The sidebar toggle consequently uses Ctrl/Cmd+Shift+B.

GFM tables use CodeMirror's Markdown syntax tree for awareness and a
source-preserving semantic preview. The preview uses the same Markdown-It
renderer as PDF Preview and generated PDFs, so emphasis, alignment, links,
literal code, `<br/>` line-break markers, anchored `^` row spans, and
editor-created rectangular merges stay consistent across editor and printable
output. Move the cursor into the table—or click a rendered cell—to edit the raw
Markdown directly; scrolling or manipulating either preview scrollbar keeps
the semantic table rendered.

Use the table's left-side **editor** guide for a grid view. A normal cell click
places the native text caret without selecting the cell. Hold Shift while
clicking or dragging across cells, or use Alt+Shift+Arrow, to select a
rectangular body-cell range for Merge; Split is available only on a merged
cell. Header cells use a distinct theme tint. Labelled icon controls use one
row for history/cell/view actions and another for row/column structure, with
the two Delete actions grouped at the end in the theme's danger tint.
Row/column commands disable with an explanation when they would cut through a
merge, and the final column and header remain protected. Undo/Redo in the
window affects only its temporary draft; **Apply** writes one undoable
CodeMirror transaction, while **Cancel** writes nothing and confirms before
discarding changes. **Show Markdown** exposes a read-only source view. Figaro
stores rectangular spans as adjacent `<!-- figaro:table-merge A2:C3 -->`
metadata, which the live and printable renderers consume without displaying.

Machine-specific settings, such as window geometry and a selected PDF browser,
are stored in the operating system's per-user application-data directory
instead of the vault.

On launch, Figaro immediately reuses the last confirmed theme and fonts while
it reads the authoritative vault settings. It restores the previous active
note with one file read before starting full-vault indexing; other saved tabs
remain metadata-only until selected. The editor stays usable while the file
tree, search/planning index, and bundled language support warm concurrently.
Opening a note from the file tree likewise mounts the snapshot already read for
that activation instead of issuing a second read.
A compact `loaded / total` Markdown-note progress indicator in the bottom-left
application-status cell remains visible until the eager vault work is ready.
That cell follows the file-tree width through resize and collapse, while the
remaining footer keeps changes, backlinks, editing mode, scale, and encoding
left-aligned, with line/column, word/character counts, and reading time
right-aligned. While the editor is focused and no operation needs attention,
all content in that fixed 24px footer gently recedes; hovering the row, entering
an empty editor side margin, or focusing a footer control restores it. In Pure
editing chrome, all footer chrome remains absent regardless of hover, focus, or
application activity; only the live word count remains at bottom-right.
Progress, errors, activity, and **Undo** never collapse. Every Figaro theme continues its
file-tree palette into the application cell; Figaro Dark and Figaro Light also
continue the editor color through the complete buffer cell.

Opening a Markdown file from outside the vault offers two safe choices:

- **Import** creates a collision-safe vault copy and opens it.
- **Keep outside vault** edits the original through a temporary file-tree
  shortcut without adding it to search, planning, history, or saved sessions.

Figaro keeps one desktop instance. Opening an associated Markdown file while
Figaro is already running brings that window forward and presents the same
Import/Keep outside choice there instead of opening another window.

Files and folders can also be copied or dropped into the tree. Figaro asks
before importing, preserves directory structure, and never silently overwrites
existing content. An internal copy updates only the new subtree in Figaro's
warm discovery data, so large vaults do not rediscover every unrelated note
before showing the result. F2 renames the focused vault item, Delete opens the
recovery-aware confirmation, and Ctrl/Cmd+X, Ctrl/Cmd+C, and Ctrl/Cmd+V provide
conventional Cut/Copy/Paste. The tree context menu shows those shortcuts and
unsupported vault files remain selectable, renameable, revealable, pinnable,
stylable, and deletable without replacing the current editor buffer. A themed
row tooltip explains that they are not editable in Figaro and can be
double-clicked to open in the operating system's default application. Their
context menu presents the same action as **Open** rather than **Open in New
Tab**. **Merge Notes** becomes available only when at least two Markdown notes
are selected in the tree; merely having another note open does not enable it.
Common text, image, code, data, archive, media, and PDF extensions receive
semantic Lucide icons;
unrecognized files keep the generic file icon, and an explicit custom icon
still wins. Ctrl/Cmd+Click or keyboard Space can select any internal file or
folder; Cut and Copy operate on the selected set, while external shortcuts
remain single-target. Cut rows show a persistent scissors marker until Paste,
replacement by Copy, or Escape cancellation. The tree context menu keeps Raw
Text/PDF preview in the editor context menu and Properties. Copy/import,
move/merge, rename, and delete announce their activity immediately and add a
status-bar spinner if they run for at least one second. While a move is running,
Figaro ignores duplicate drag attempts instead of starting the same move twice.

Concise interface hints use one theme-aware tooltip throughout Figaro. A hint
appears after a short hover or immediately on keyboard focus, remains inside the
window, and closes with Escape. Calendar activity, managed-file guidance, and
Markdown link previews share that surface while retaining their richer content.

Every selected tree row uses the same accent-tinted surface, whether the
selection contains one entry or many. The active document remains available to
assistive technology as the current page but receives no competing tree
background; the active tab identifies the open buffer. Arrow-key focus remains
an independent outline, and a warning dot appears only for an unsaved in-memory
buffer.

Undo and redo are scoped to the active file buffer. Switching to another file
switches to that open buffer's own history, so Ctrl/Cmd+Z can never replace it
with a different tab's contents. Returning to an unchanged open buffer restores
its earlier undo and redo operations; a changed disk snapshot starts fresh.

When a new or renamed Markdown note resembles another note in the same folder
after ignoring spacing, punctuation, and capitalization, Figaro offers to open
the existing note first. It never merges notes automatically. The on-demand
**Settings → Vault care** scan lists repeated filenames separately and only
shows them as informational; it only suggests cross-folder name variants when
their content also strongly overlaps.

Vault deletion remains directly recoverable: the status bar offers **Undo**
for ten seconds, and **Settings → Vault care → Recently deleted** keeps the
Git-backed recovery record afterward. Restore refuses to replace a file or
folder that now occupies the original path.

The same guard applies when activating a missing conventional Markdown link.
Choosing **Use existing note** changes only its destination—for example,
`[Inner Source](Inner%20Source.md)` becomes
`[Inner Source](InnerSource.md)`—then opens the existing note. The visible label
stays intact, while **Create anyway** deliberately keeps the original target.
While authoring a link, autocomplete uses the same relevance engine as global
search, with note titles and paths weighted most strongly, and also offers
**Create note** when there is no exact target in the current folder; it creates
the note there and inserts the configured portable link syntax. A bare `[label]` stays ordinary text
unless the document contains a matching Markdown reference definition. A
same-document link such as `[Jump](#writing-and-planning)` moves directly to
that heading whether the link is currently rendered or showing raw source.

## Writing and planning

Markdown diagnostics identify structural problems and Mermaid syntax errors
without changing source.
Pressing Enter on an empty list item or blockquote exits one structural level
immediately; nested quotes step outward one level at a time.
Offline spellcheck is disabled by default; choose **Settings → Spellcheck →
Language** to select English (US), English (UK), Spanish (Spain), or **None**.
The setting separates the vault default from per-note frontmatter controls, and
spellcheck text never leaves the device.

Optional Vim editing keeps wrapped-row motion and Visual selections compatible
with rendered Markdown, and vertical motions stop at the exact first and last
document positions instead of wrapping on a backwards native geometry result.
In Vim Normal and Visual modes, the physical arrow keys follow the same
motions as `h`/`j`/`k`/`l`, including entry into Properties and rendered
blocks; Insert mode retains ordinary editing arrows.
Standard editing uses a thin theme-colored insertion caret; only Vim Normal
mode uses the contrasting block cursor.
Normal Arrow Up/Down and Vim `j`/`k` also reconcile the physical and virtual
viewports after keyboard motion, so long notes with rendered blocks keep their
selected text visible when scrolling direction reverses. Page Up/Page Down
receive the same repair.
Vim `p`/`P` use the operating-system clipboard while retaining the unnamed
register as a fallback, and ordinary yanks and deletes are available to other
desktop applications. Figaro leaves Windows keyboard-layout and dead-key
composition to WebView2 and CodeMirror in regular editing and Vim Insert mode.
It does not reinterpret Spanish physical key codes: the ordinary backtick key
inserts one character, while AltGr+4 remains available for native composition
with a following character such as `a` → `ã`. The desktop dependency is Wails
v2.14 with a pinned Windows-host fix that prevents AltGr input from being
reposted to the native window before WebView2 processes it.

Quick notes create collision-safe timestamped files in `Inbox`; press
Ctrl/Cmd+N from anywhere in Figaro to capture one directly. The Today
action creates the dated note in the same folder and continues to open legacy
root daily notes. A top-level Inbox is pinned by default but can be unpinned or
restyled like any other folder.

The expanded sidebar uses quiet surfaces instead of repeated outlines: Search
notes and Quick note remain borderless while their existing focus halo appears,
and selected files use a tinted surface plus a heavier label without a leading
accent stripe. Search and capture icons, hover paint, keyboard focus, and
accessible selection state remain intact. Quick Note's resting surface uses a
3% primary-text wash over the current sidebar and its relevant state uses the
theme's standard hover surface instead of a red wash; its red action icon,
muted `INBOX` label, and ordinary Inbox Mail icon keep their existing roles. The search-count circle appears only
while matching results are open. A panel-shaped top-bar icon now toggles the
workspace sidebar, while a nested-list icon opens the current note's outline.

Kanban cards are ordinary Markdown lines with standalone hashtags; checkbox
task syntax is optional. Hashtags define columns, and due dates remain portable
links:

```markdown
- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)
```

Typing a standalone hashtag suggests saved Kanban columns even at the end of
ordinary prose. After any valid tag except `#done`, press Space to choose
**Add due date…**, **Due today**, or **Due tomorrow** for that tagged line.
The actions also work for unsaved custom tags; lines containing `#done` and
already dated lines remain quiet. **Add due date…** opens the same localized
month view as the sidebar Calendar, with Today selected initially and the same
theme-aware weekends, note-intensity fills, due outlines, and activity details.
The title-bar `?` guide keeps general Markdown syntax under **Markdown** and
collects these Figaro-specific date, Kanban, and due-date forms under
**Macros**. Its spacious, viewport-bounded surface keeps the same dimensions
when you switch topics; longer topic content scrolls inside that surface.

The board is fully keyboard-operable. Tab advances through every card in
column order; Up/Down persists a card's vertical position, Left/Right moves it
to the adjacent column, Enter opens its note, D changes its due date, and
Delete removes that column tag. Pointer drag remains available.

The same dates appear in the Today dashboard and calendar. Figaro keeps
reminders inside the application and does not request operating-system
notification access. A Kanban column with a chosen color shows that color as a
small header swatch; an uncolored column keeps the neutral palette icon. At
normal window heights, the calendar keeps its monthly grid visible when large
vaults make the neighboring file tree scroll. Its first weekday and weekends
follow the operating-system locale; weekends are muted, while ordinary weekdays
remain fully legible. Days with associated notes use five contribution-style
intensity levels derived from the active theme, and due days keep an independent
theme-danger outline whose hover or keyboard-focus tooltip lists every due task.
The full theme-accent selection starts on Today and moves to a selected note or
due day; the day it leaves immediately recovers its underlying activity
intensity. The first Calendar opening in each app session selects Today;
closing and reopening it during that session restores the last selected day,
while a new launch starts fresh on the current local date. Opening moves the
panel upward into place and closing mirrors that displacement downward, using
the shared reduced-motion timing. Empty days other
than Today are not interactive. Accepted date
shortcuts and other date links update the open calendar from the unsaved editor
buffer, and selecting a day always shows the same daily/linked notes counted by
its square. The month grid stays in place while the detail region changes or
scrolls, and the common one-task/one-note state remains fully visible above the
fixed workspace tools. Figaro does not guess or download public holidays.

## Diagrams and PDFs

Mermaid, Vega, and Vega-Lite blocks render directly in notes and printable
documents. Draw.io editing uses the hosted diagrams.net editor, but the
resulting `.drawio.svg` file stays in the vault and remains readable offline.
You can write an image reference such as `![Flow](flow.drawio.svg)` before the
asset exists, then choose **Create Draw.io diagram** directly from its rendered
placeholder. Relative paths resolve from the note, while
`/Diagrams/flow.drawio.svg` resolves from the vault root. Closing a newly opened
blank diagram without saving leaves that normal empty file in the vault, so the
same placeholder offers **Open Draw.io diagram** the next time it is shown.
Once Draw.io saves valid SVG, returning to the note restores the rendered
diagram even when that image's earlier blank-file request had failed. Deleting
the asset from the file tree immediately removes that cached preview and
returns its note to the missing-diagram action.
Mermaid source is checked before parsing; oversized diagrams and unsafe YAML
ordered maps remain editable source instead of blocking the editor or PDF
renderer. When Mermaid source is revealed in the main editor, syntax errors are
marked in place with squiggles and hover explanations after the normal Markdown
diagnostics pause.

Live Mermaid previews reuse rendered SVGs when CodeMirror remounts them during
scrolling. New diagrams wait for a quiet, idle moment before rendering so
moving through long notes stays responsive.

Editor block helpers face the writing surface: heading, code, and table labels
are right-aligned in the left rail. Every Mermaid block extends that same guide
into a two-button stack, with **editor** directly beneath **mermaid**. The stack
follows the centered writing column, uses the same editor-sized monospace
helper type, and remains outside the note instead of occupying diagram space.
Its reserved overlay width stays stable as parent sections fold, so hiding a
wider nested label cannot move the note horizontally. The **editor** action
opens a focused source-and-preview workspace with the chart types and templates from
the version-matched Mermaid Live Editor catalogue. Linked **Diagram** and
**Template** pickers sit tightly together at the left and make empty, whitespace-only,
or already-template-backed blocks follow each selection immediately for quick
browsing. Existing or manually edited source is protected until **Replace with
template** is chosen. The temporary source editor inherits the main editor's
Vim and visual-row preferences and keeps its mode while live diagnostics
refresh. Oversized diagrams fit the preview pane; use the
mouse wheel or `+`/`-` to zoom, drag or use the arrow keys to pan, and press `0`
to reset. Zooming repaints the SVG at its new dimensions so text and lines stay
sharp. The left-side `mermaid` helper collapses a rendered diagram into one
native fold row and expands it back to the live preview. Syntax errors receive
underlines and hover explanations while the
preview stays on the last valid result. **Apply** replaces only that fence's
body as one undoable edit; **Cancel** leaves the note unchanged.

Raw Text Preview shows the exact Markdown source, including frontmatter. It
follows the main editor's matching source position with a small smoothing delay
and can copy the complete current Markdown snapshot directly to the clipboard.
PDF Preview adds pagination, cover pages, a depth-limited table of contents,
footnotes, internal links, fenced-code syntax colors, and optional vault-local
CSS. In the Markdown body, a standalone `---` becomes an invisible page break
in PDF Preview and generated output; it remains a normal thematic separator in
the editor, while `***` and `___` remain visible thematic separators everywhere.
Set `page-numbers: true` in Properties to add physical PDF footers and
matching destination pages to the table of contents; an optional cover stays
visually unnumbered. Existing custom stylesheets keep working, while
**Upgrade copy** creates a separate current starter with the old rules retained
as final overrides. Generated PDFs are written beside their source note.
See [PDF styling](docs/PDF_STYLING.md) for the supported print contract.

Live and printable tables convert portable `<br>` cell markers into real line
breaks. A bare `^` in a data cell continues the immediately preceding data cell
in that column as a vertical rowspan; consecutive carets extend it, while an
unanchored caret remains literal. The saved Markdown stays rectangular GFM and
is never rewritten by the preview. To turn existing delimited text into a
table, select it and choose **Convert selection to table…** from the editor's
right-click menu. The review dialog previews valid comma- or
semicolon-separated CSV, TSV, or pipe-delimited rows and lets the delimiter be
chosen explicitly; an invalid selection explains the problem and keeps
**Convert** disabled.

## Data and privacy

Figaro does not require an account, analytics service, or proprietary storage
format. Search, backlinks, planning, history, Markdown rendering, and
spellcheck run locally. The only hosted editing surface is the optional Draw.io
editor; saved diagram output remains local.

Local Git history is file-oriented. Auto-Commit records only a file that Figaro
successfully saved, and the **Save to history** action never sweeps unrelated
staged work into the note's history. Deleting from the file tree bypasses the
system Trash, but first saves affected open editors and records the file—or
every file in a folder—in local history. If that archive cannot be recorded,
Figaro leaves the item untouched. Each successful deletion is registered in
the vault's durable **Recently deleted** list and can be restored from its exact
Git snapshot without overwriting new content at the same path. A failed document save keeps the buffer dirty
and announces its concrete cause in the status bar so the text can be recovered
or saved again.

## Current limitations

- Figaro is a desktop, single-vault application.
- It does not include cloud synchronization, encryption, mobile clients, or a
  plugin system.
- Draw.io editing requires access to the hosted diagrams.net editor.
- PDF generation requires a supported browser engine installed on the machine.

## Documentation

- [Product and behavior reference](docs/PROMPT.md)
- [PDF styling guide](docs/PDF_STYLING.md)
- [Live-preview and editor contract](docs/LIVEPREVIEW.md)
- [Architecture](ARCHITECTURE.md)
- [Testing strategy](docs/TESTING.md)
- [Changelog](CHANGELOG.md)

## Contributing

Issues and pull requests are welcome. Development setup, build targets, test
commands, release procedures, design-system rules, and repository conventions
are documented in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Figaro is free software distributed under the
[GNU General Public License version 3 or later](LICENSE). You may use, study,
share, and modify it under those terms.

The Phosphor Design System attribution used by the CRT theme is recorded in
[Third-party notices](THIRD_PARTY_NOTICES.md).
