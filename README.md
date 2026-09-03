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
a source-first Markdown editor with search, backlinks, a vault graph, daily
notes, Kanban, calendar planning, diagrams, local history, and
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
  fold headings, fenced code, tables, and standalone images
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
  meaningful boundaries. Hovering a successfully loaded image reveals themed
  width, height, and proportional handles with generous pointer targets and
  explanatory tooltips. Dragging resizes only the mounted image and updates the
  centered size readout while leaving the source untouched. Releasing the pointer writes
  the final `|WIDTHxHEIGHT` hint as one Undo/Redo step; cancellation restores
  the starting size. Resizing respects the writing surface's right/bottom edges,
  and height-only resizing is capped at ten times the original height. Clicking
  the image still reveals its Markdown without moving following text, and the
  left-side **original size** action removes the hint and restores intrinsic
  dimensions. Properties, links, and task checkboxes keep their normal sizing.
  A rendered task checkbox
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
  Active title-bar tabs keep 8px convex top corners and use inverse 8px curves
  at their lower junctions, producing the familiar browser-tab connection
  without a bottom border.
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
  available without creating tens of thousands of DOM elements. Very large
  Markdown notes mount source and full live presentation in short phases, so
  opening one does not monopolize the interface.
- **Connected note graph.** Open **Graph** below the file tree to explore every
  saved Markdown note and its links. Borderless zoom controls, a compact search,
  and the **Orphans** choice float directly over the canvas. Clear directed
  arrows are always visible, while node colors inherit vault file-tree
  appearance choices and brighten through nested folders; note-specific colors
  and Lucide icons override that inheritance. Hover traces direct links, click
  pins that trace until the canvas is clicked elsewhere, and Ctrl/Cmd-click
  opens the note. Drag to pan, use the wheel or buttons to zoom, and fit the
  complete graph to view. Large vaults keep one stable layout; filtering,
  tracing, and zooming repaint in responsive batches.
- **Capture and planning.** Ctrl/Cmd+N captures a Quick Note in the real
  `Inbox`, while Ctrl/Cmd+Shift+N opens the daily note;
  hashtags form a Kanban board, and private task deadlines feed the Today
  dashboard and calendar. Calendar months and the Kanban board show
  theme-aware, reduced-motion-safe skeletons instead of an empty surface while
  their indexed data is loading. Scroll vertically over the month grid to move
  through months; the selected-day results retain their own native scrolling.
  The Calendar workspace divides evenly between a horizontally and vertically
  centered month on the left and the selected day's due tasks and linked notes
  on the right. The two panes share one uninterrupted surface. Calendar keeps
  the shared status-bar row to prevent vertical movement between workspaces,
  but leaves its main-pane buffer region blank. Switch to **Timeline**
  for horizontally scrollable days: notes on the same date stack as compact
  pills, direct file-tree colors and icons carry over, and a click opens or
  reuses the note tab at that date's first occurrence. A six-week sparse window
  keeps more than two weeks ready on either side; approaching an edge silently
  loads the adjacent week in place, and the operating-system locale determines
  which days receive the reserved weekend tint. Ordinary day columns blend
  into the main pane; wheel or trackpad input moves at least three complete days,
  and dragging empty Timeline space pans without selecting text. Switching away
  from Calendar releases the rendered Timeline and its range cache.
- **Diagrams and data graphics.** Render Mermaid, Vega, and Vega-Lite blocks,
  open Mermaid's 32 chart types and 76 starter templates in a focused live
  editor, resize Mermaid and managed Vega-Lite canvases vertically from their
  bottom-center edge handle, or edit Draw.io diagrams while keeping the saved SVG
  readable outside Figaro. A new vault's `Welcome.md` includes a ready-to-render Mermaid example.
- **Source and publishing tools.** Preview the exact raw Markdown or paginated
  output, preserve fenced-code syntax colors, add cover pages and tables of
  contents, use a standalone `---` as a PDF page break, apply vault-local print
  CSS, and generate linked PDFs. Compact Raw and PDF icons sit directly beneath
  the Document outline launcher on every Markdown buffer.
- **Built-in reference.** Press F1 or use the title-bar `?` to search Markdown
  syntax, Macros, Shortcuts, and Settings. Help results jump to the matching
  reference row without dismissing the reference when clicked; Settings results
  open the existing Settings view and focus the exact control. Closing the
  reference returns focus to the control or editor that invoked it. Find and
  Replace keeps its search, matching options, and replacement actions in three
  compact predictable rows and announces the
  current/total result count—or that no match exists—to assistive technology.
- **Local history.** Optional per-file Auto-Commit, explicit history saves,
  comparisons, and restoration keep unrelated vault changes separate; the
  active-note status check does not scan unrelated vault files.
- **Configurable workspace.** Choose from eighteen themes, including **Figaro
  CRT Phosphor** with dark borderless overscan, a strong curved-glass vignette,
  fine anti-banding dither, 35% horizontal scanlines, soft text bloom and
  breathing, and one softened beam pulse per minute.
  Figaro Dark and Figaro Light use one flat titlebar/file-tree surface and one
  flat active-tab/editor/buffer-status surface—including the editor gutter—with
  quiet inactive tabs and only subtle separators where status or sidebar tools
  still need grouping. Figaro Dark lifts that uninterrupted reading plane
  slightly above its darker navigation plane for clearer workspace orientation.
  CRT motion stays off when the operating system requests reduced motion while
  its static glass treatment remains. Prose and code fonts, Vim editing, line
  numbers, sticky headings,
  block guides, document outline, diagnostics, and fully local spellcheck
  dictionaries remain independently configurable. On launch, Figaro applies
  those saved interaction and layout choices before revealing the restored
  editor, while the first shell frame already uses the saved sidebar width.
  Both vertical pane separators are keyboard-operable without becoming a
  visually dominant bar: arrows move the separator by 8px, Shift+Arrow by
  32px, and Home/End reach the pane-width limits.
  Ctrl/Cmd+
  mouse-wheel temporarily scales the active editor buffer; its status-bar
  **Scale** control resets to the permanent **Default Text Size** chosen in
  Settings, the complete status row stays visible for three seconds after each
  wheel gesture, and closing the buffer discards the temporary scale.

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
writing view returns on the next launch. The Focus scope menu opens directly
below its control, including while the Settings view is scrolled.

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
While the document editor owns Tab for indentation, press Escape and then Tab
or Shift+Tab to move keyboard focus out of the editor.

**Settings → Editor → Show line numbers** adds a cursor-relative gutter. The
cursor line stays unnumbered; the lines immediately above and below show `1`,
then `2`, and so on. Only visible gutter rows are refreshed as the cursor moves.

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
explicit TSV, then explicit CSV with comma-or-semicolon dialect detection. If
Excel also exposes a copied range as an image, the validated table wins and no
image asset is created.
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
editing chrome, routine footer chrome remains absent regardless of hover,
focus, or application activity; the live word count remains at bottom-right,
and an active file-attention warning remains reachable at bottom-left.
Outside Pure mode, progress, errors, activity, and **Undo** never collapse. Every Figaro theme continues its
file-tree palette into the application cell; Figaro Dark and Figaro Light also
continue the editor color through the complete buffer cell.

Figaro also uses that bottom-left cell for persistent file diagnostics without
opening warning dialogs during startup. Normal vault indexing identifies files
that cannot safely enter the editor or search: files over 50 MB are rejected
before their contents are allocated, while binary, invalid UTF-8, and unreadable
files are isolated without interrupting healthy notes. An affected tree row
keeps its normal file icon and adds a warning/danger tint and status glyph;
hover or keyboard focus explains the exact problem and a click opens recovery
guidance. Collapsed folders show the number and highest severity beneath them.
The status action opens the same diagnostic list, including **Show in file
tree**, **Open externally**, **Reveal in folder**, and **Check again** only when
those actions apply. Warnings indicate a safely skipped or degraded feature;
danger is reserved for unreadable files or work that may not be persisted.
Repeated unchanged diagnostic snapshots stay inert, so background checks do
not remount the tree or interrupt a context menu, keyboard focus, or a
managed-file double-click. When there are no findings, the diagnostics action
is fully hidden and contributes no geometry to the fixed 24px status row.

A disk-full save failure is treated as one urgent incident even when note,
workspace-state, and Git writes fail together. Figaro keeps each dirty buffer
in memory, offers Retry, Copy unsaved text, or Keep editing, and leaves the
danger status visible until writes succeed. If `vault/.config/settings.json`
is malformed, Figaro preserves it as a timestamped `settings.invalid-*.json`
copy before restoring defaults. A Git repository that cannot be opened disables
only local history; editing and note saves remain available while the status
explains how to repair and recheck it.

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
Before renaming a file referenced by other Markdown notes, Figaro reports how
many notes are affected and offers to update every reference, keep the authored
references unchanged, or cancel. A rename with no incoming Markdown reference
proceeds without that extra question; folder moves retain their link-preserving
behavior.

Concise interface hints use one theme-aware tooltip throughout Figaro. A hint
appears after a short hover or immediately on keyboard focus, remains inside the
window, closes with Escape, and is dismissed if layout moves or removes its
owning control. Escape suppresses that hint only until the pointer or keyboard
focus leaves its control, so returning to it shows the guidance again. Calendar
activity, managed-file guidance, and
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
Ctrl/Cmd-click an external HTTP or HTTPS link to open it in the operating
system's default browser; its hover tooltip includes the same shortcut, while
vault Markdown links continue to navigate inside Figaro.

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
task syntax is optional. Scheduling stays in private metadata, not date strings:

```markdown
- [ ] Submit report #todo
```

Type `@date` on that line and accept it with Enter, Tab, or Space to open the
shared localized calendar. Choosing a date inserts `[[YYYY-MM-DD]]` or
`[YYYY-MM-DD](YYYY-MM-DD.md)` according to Settings → Links, with no `due`
prefix. Its generic dialog, shortcut group, and clear action all say **date**;
task-specific Board/Gantt controls retain deadline terminology. This works in plain prose too; only tasks also save a metadata deadline
through normal note conflict protection. An untagged checklist item joins `#todo`.
The left Calendar action on an unfinished checklist item uses the same flow.
Both replace the sole date on the current line; with no dates or multiple dates,
they add the chosen date instead. A date link counts once, not once per repeated
date in its source. Cancel changes nothing; clearing the metadata deadline keeps
authored date references. Existing task starts survive date-link edits.
The left Kanban action similarly replaces a sole hashtag, or adds the column
when there are zero or multiple hashtags (without duplicating an existing tag).
Code, images and other links are left alone. Space after a hashtag remains
ordinary typing; normal hashtag completion remains available. Clicking the
hashtag itself opens its Kanban column, while adjacent line space remains
available for placing the caret and continuing the text.

Calendar and Kanban place their view switches at the upper left; Graph's
floating controls use the same inset. All segmented choice controls use the
Calendar's borderless treatment in Figaro Dark, Light, and CRT Phosphor,
including hover/selection while retaining a visible keyboard-focus ring.

The title-bar `?` guide keeps general Markdown syntax under **Markdown** and
collects Figaro-specific authoring forms under **Macros**. Alongside
`@today`, `@tomorrow`, and `@yesterday`, type `@date` to insert a date link and
also attach a metadata deadline on tasks, `@todo` to start `- [ ] ` with
the caret ready for the task text, `@table` to insert a basic GFM table and open
the Table Editor, or `@mermaid` to insert an empty Mermaid fence and open the
Mermaid Editor. `@drawio` prompts with `diagram1`, creates a sibling
`diagram1.drawio.svg`, inserts `![Diagram](./diagram1.drawio.svg)`, and opens
the Draw.io Editor. Accept a completion with Enter, Tab, or Space. The help surface
keeps the same viewport-bounded dimensions when you switch topics; longer topic
content scrolls inside that surface.

The board is fully keyboard-operable. Tab advances through every card in
column order; Up/Down persists a card's vertical position, Left/Right moves it
to the adjacent column, Enter opens its note, D changes its due date, and
Delete removes that column tag. Pointer drag remains available.

Switch **Board / Gantt** in the Kanban header to plan the same tasks on a
horizontal timeline. Bars use their column's color; `#done` tasks are faded.
Click a task or bar to choose **Start** and **End** with the shared date picker,
which applies each choice immediately—there is no Save/Cancel step. Click outside
to close the schedule popup and its calendar. Escape closes the calendar first,
then the schedule popup, returning focus to the invoking control. Closing never
undoes dates already chosen; **Unscheduled** clears both dates immediately.
Failed changes keep the last saved dates and can be
retried through the picker. Drag a bar to move its whole range, or either end to resize it;
Escape cancels a drag. **Open note** opens the source at the task line.
End-only tasks show a one-day bar; start-only tasks show ongoing work through
today. Undated tasks remain **Unscheduled**. A task’s first move into any column
other than TODO sets its start date. Further moves keep that original start;
returning to TODO does not erase it. An overdue deadline remains unchanged.
Pan empty timeline space, scroll horizontally, or use the week arrows and
**Today**. Task names stay pinned, weekends follow your locale, and counts use
the existing application status bar without adding another footer.
Gantt and Calendar Timeline reuse the same scrolling widget: wheel gestures
move at least three days, buffered outer weeks extend automatically while
preserving the visible date without a flashing replacement frame. Overlapping
days and task bars stay mounted, and continued scrolling during a range load
is preserved. Panning never selects text. Wheel over the
task-name column to scroll a long task list vertically.
An empty Gantt keeps a centered **No tasks yet** explanation visible even when
the wide date track has been scrolled away from its origin. Drag and resize
instructions remain hidden until at least one task exists.

Task schedules live in `vault/.config/task-schedules.json`, outside Git history,
not in your Markdown. Save dirty notes before scheduling them. Unique task text
keeps its dates when lines shift or column tags change; Figaro file/folder moves
also retain schedules. Renamed task text and ambiguous duplicate edits keep their
dates under **Reconnect**, where you explicitly choose the intended task. A
reconnection cannot overwrite another task's schedule. **End** is the same due
date used by Board, Calendar, Today, and reminders. Old `[due …](….md)` links
remain ordinary Markdown links; they no longer schedule tasks. There is no
migration or hidden task ID in your notes. Press D on a focused card to open
the date picker; Escape returns focus to that card without changing it.


Calendar, Kanban, and Graph share three persistent browser-style tabs attached
to the workspace's left edge. Each stays flat while inactive, then becomes
borderless, opens on its right side, and blends into its central workspace when
selected, including across themes that tint the sidebar divider or resize hit
area. Its two workspace-side junctions use the same rounded browser-tab radius
instead of ending in square notches. None creates a duplicate document-title
tab, and reselecting the active control keeps that workspace open. Hashtags and
**Open board** reuse the same
Kanban workspace and can focus the relevant column. Graph keeps one all-notes
canvas session without adding graph-only chrome to the shared right pane.
The main pane keeps that browser-tab silhouette at its top-left corner: it is
rounded with the shared tab radius unless the first title-bar tab is selected
and needs a square, uninterrupted connection to the editor. Every mounted
editor or workspace layer inherits that corner so no square inner edge bleeds
through the rounded host.
Themes with visible title-bar and sidebar dividers pause those rules around the
same 8px curve instead of leaving a faded square underneath it. The transparent
cutout reveals the matching sidebar surface rather than the differently colored
application canvas. Hovering the inactive first tab temporarily carries its
hover surface through that cutout and paints above its 1px divider mask,
preventing a contrasting wedge or double-painted line.

The same metadata deadlines appear in the Today dashboard and calendar. Figaro keeps
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
while a new launch starts fresh on the current local date. Empty days other
than Today are not interactive. Accepted date
shortcuts and other date links update the open calendar from the unsaved editor
buffer, and selecting a day always shows the same daily/linked notes counted by
its square. The month grid stays in place while the detail region changes or
scrolls independently in the equal-width right pane. There is no middle rule,
and Calendar retains the fixed status-bar footprint with its irrelevant
main-pane buffer telemetry hidden.
The session-only **Month / Timeline** choice defaults to Month. Timeline shows a
centered six-week range around its anchor; **Today** returns to the current date, the arrow
buttons page by two weeks, and wheel, trackpad, scrollbar, or keyboard input
move horizontally. Each wheel/trackpad event advances by at least three day
columns, while grabbing empty space pans directly and suppresses text selection
until release. When only two weeks remain before either loaded edge, Timeline
silently shifts the range by one week while preserving the visible dates'
positions; the backend still returns only populated dates, and switching away
from Calendar discards the Timeline DOM and cache. Weekdays share the main-pane
surface; Timeline uses its former subtle surface tint only for the same
`Intl.Locale` weekend set as Month, including regional Friday/Saturday weekends;
Figaro does not guess or download public holidays.

## Diagrams and PDFs

Mermaid, Vega, and Vega-Lite blocks render directly in notes and printable
documents. Draw.io editing uses the hosted diagrams.net editor, but the
resulting `.drawio.svg` file stays in the vault and remains readable offline.
From a Markdown note, `@drawio` creates the named editable SVG beside that note,
inserts an explicit same-directory image reference, and opens it immediately.
The prompt defaults to `diagram1` and accepts either a stem or the normal
`.drawio.svg` suffix.
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
moving through long notes stays responsive. Even a small diagram receives a
300px, full-writing-width canvas. Hover or focus it to expose the same themed
vertical resize handle used by charts, centered directly on the canvas's lower
edge so the control stays visible while the pointer approaches it. The live
height changes while dragging, then one `%% figaro:height N` Mermaid comment is
written on release as one Undo step. PDF Preview and generated PDFs honor that
height.

Rendered Markdown tables now add **chart** beneath their existing left-side
controls. It opens a reversible Vega-Lite Chart Editor: choose Cartesian, Pie,
or Waterfall; orient Cartesian charts horizontally or vertically; and configure
each numeric column's visibility, Bar/Stacked Bar/Line/Area/Points mark, primary
or opposite axis, color, and linear trendline. Trendlines use a hidden authored-row
index, so text categories such as month or product names remain visible while
Vega-Lite calculates change across table order. Gridlines and a
colorable labelled threshold are shared chart guides. Cartesian charts always
use the first table column as their category axis and preserve the table's
authored category order instead of alphabetically sorting labels. Pie and
Waterfall preserve that row order while keeping
independent themed Category pickers. Eye/eye-off buttons hide
columns while retaining their settings; every visible series appears in one
legend that can be placed on the top, right, bottom, or left. Stacked columns
share one primary stack, and the original table
is embedded losslessly in the generated chart. Pie and Waterfall category
pickers include every table column rather than fixing the first inferred label
column; their numeric value/change mapping remains independently selectable.
The first Cartesian column states where labels are placed without presenting
meaningless mark or color cells. Series and guide colors use the same square,
theme-aware palette control as Kanban; the complete unavailable trendline label
explains its actionable requirement on hover, keyboard focus, or click without
an extra underline or help icon, and the tooltip stays above the editor dialog.
Threshold visibility,
value, axis, and color share one row; values use an editable `− value +`
stepper, and the label field spans the configuration pane. Mode and
Orientation share one compact row; each numeric series exposes Left/Right or
Bottom/Top as a direct segmented choice, and thresholds use the same pattern
for Primary/Opposite without replacing or hiding that value axis. The pane has
no horizontal scrollbar, while only the
individual column mappings retain separator rules; section headings provide the
remaining grouping.
A managed `vega-lite` block adds
**editor** and **table** actions; **table** restores the exact original Markdown
after confirmation, while unsupported manual JSON changes are left untouched.
The borderless chart preview receives the larger side of the editor and centers
its SVG vertically. Its surface, axes, labels, and select-only comboboxes follow the
active Figaro theme; the applied chart uses that same surface so its data colors
do not change after creation. Narrow configuration panes reflow dense column
controls into multiple rows, and combobox menus flip and clamp to stay within
the visible window instead of colliding with or being clipped by nearby
controls. Rendering and configuration failures appear as an
announced error in the preview and keep **Create chart** disabled instead of
leaving a blank chart box. Preview work is serialized, and rapid choices retain
only the newest pending chart instead of rendering stale configurations in
parallel. In the note, charts fill the writing width and
expose one themed vertical handle centered on the lower canvas edge; the Markdown
changes once on release, so one drag is one Undo step. The same SVG
specification renders in PDF Preview and generated PDFs.

Editor block helpers face the writing surface: heading, code, and table labels
are right-aligned in the left rail. Every Mermaid block extends that same guide
into a two-button stack, with **editor** directly beneath **mermaid**. The stack
follows the centered writing column, uses the same editor-sized monospace
helper type, and remains outside the note instead of occupying diagram space.
Its reserved overlay width stays stable as parent sections fold, so hiding a
wider nested label cannot move the note horizontally. The **editor** action
opens a focused source/style-and-preview workspace with the chart types and templates from
the version-matched Mermaid Live Editor catalogue. Linked **Diagram** and
**Template** pickers sit tightly together at the left and make empty, whitespace-only,
or already-template-backed blocks follow each selection immediately for quick
browsing. Existing or manually edited source is protected until **Replace with
template** is chosen. **Source** retains direct CodeMirror editing; **Style**
detects the current diagram and reveals only controls Mermaid supports for that
type. Document, neutral, and accent presets are shared; authored dark or custom
themes are identified without falsely selecting a preset. Color choices keep
the current theme. Sequence diagrams, Gantt charts, timelines, pies, Git graphs,
and other supported types receive their relevant element or series palettes.
Palette controls follow the groups or series actually present (up to eight
slots outside XY); XY exposes one color per real bar/line plot and preserves
the other plots, including charts with repeating palettes. Unsupported element
controls are omitted, with an explanation instead of nonfunctional swatches.
Flowcharts add direction and
connection choices plus a node list: select a node there or directly in the
preview, then assign a Kanban-palette color or choose its original, rounded, or
pill shape. The selected node's editor appears first, above a height-bounded
list and the diagram-wide defaults. Mermaid's parsed node identities include
chained and standalone nodes without mistaking icon labels for extra nodes.
Existing native/class-based node colors are shown; **Use source/default color**
removes only the editor's override. A
short instruction plus solid color dots distinguish node selection from
visibility checkboxes. Use Arrow Up/Down or Home/End to move through the list;
selecting a node in the preview reveals the same editor. Styling actions retain
keyboard focus, and preview updates keep an open palette intact. Escape closes
the palette before the editor. Styling is written as portable Mermaid frontmatter, `style`
statements, and shape declarations, so the editor, live diagram, PDF Preview,
and generated PDF render the same source. Invalid source pauses styling until
it is fixed; compact/advanced YAML and overriding init directives remain
untouched and points back to Source mode. The temporary source editor inherits the main editor's
Vim and visual-row preferences and keeps its mode while live diagnostics
refresh. Oversized diagrams fit the preview pane; use the
mouse wheel or `+`/`-` to zoom, drag or use the arrow keys to pan, and press `0`
to reset. A click selects a flowchart node; moving the pointer continues to pan
without selecting it. The preview receives the larger side of the dialog;
on compact windows both panes fit above the footer without clipping.
Zooming repaints the SVG at its new dimensions so text and lines stay
sharp. The left-side `mermaid` helper collapses a rendered diagram into one
native fold row and expands it back to the live preview. Syntax errors receive
underlines and hover explanations while the
preview stays on the last valid result. **Apply** replaces only that fence's
body as one undoable edit; **Cancel** leaves the note unchanged.

Raw Text Preview shows the exact Markdown source, including frontmatter. It
follows the main editor's matching source position with a small smoothing delay
and can copy the complete current Markdown snapshot directly to the clipboard.
When the navigation pane leaves insufficient room to dock Raw or PDF Preview
beside a usable editor, the existing preview pane overlays the trailing edge
instead. The document keeps its layout width, at least 180px remains visible at
normal compact-window sizes, and widening the window docks the pane again.
PDF Preview adds pagination, cover pages, a depth-limited table of contents,
footnotes, internal links, fenced-code syntax colors, and optional vault-local
CSS. Note-relative local images load from the same vault location in the editor,
PDF Preview, and generated output, including any authored image dimensions. In
an open preview, ordinary Markdown edits refresh the rendered page quietly
without flashing a transient updating notice. In the Markdown body, a
standalone `---` becomes an invisible page break in PDF Preview and generated
output; it remains a normal thematic separator in the editor, while `***` and
`___` remain visible thematic separators everywhere.
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
Git snapshot without overwriting new content at the same path. A failed
document save keeps the buffer dirty and overrides Pure mode with a blocking
dialog that explains the concrete cause and offers **Retry**, **Copy unsaved
text**, or **Keep editing**. Repeated Auto-Save failures do not stack dialogs,
and **Save and exit** never closes the window until every dirty buffer has
actually saved.

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

The Phosphor Design System and afterglow-crt attributions used by the CRT
themes are recorded in [Third-party notices](THIRD_PARTY_NOTICES.md).
