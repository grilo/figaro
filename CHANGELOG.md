# Changelog

All notable user-facing changes are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Figaro adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Version headings
and comparison links use that format from 1.14.0 onward; historical entries
remain as originally published.

## [Unreleased]

_No changes yet._

## [1.32.1] - 2026-09-01

### Fixed

- Release theme verification now compares rendered color channels instead of
  browser-specific CSS color notation, keeping equivalent `rgb`, `color(srgb)`,
  and `oklab` paint stable across Chromium versions.

## [1.32.0] - 2026-09-01

### Added

- Markdown buffers now expose compact Raw Markdown and PDF preview icons beneath
  Document outline, and in-note Find announces its match count to screen readers.
- Kanban now has a **Board / Gantt** switch with column-colored task bars,
  faded completed tasks, localized weekends, date editing, and drag-to-move
  or resize. Gantt uses the application's existing status bar. Schedules stay
  in ignored vault metadata without adding hidden dates or IDs to Markdown; ambiguous
  task edits preserve their saved dates for explicit reconnection.
  Calendar Timeline and Gantt reuse the same buffered scrolling, panning, and
  date-position preservation rather than maintaining separate timeline widgets.

### Changed

- Mermaid diagrams now render full-width at a useful 300px default and share
  Vega-Lite's bottom-center vertical resize gesture; one portable height hint is
  written on release and honored in PDF Preview and export.
- The date-picker macro is now `@date`; `@due` is no longer offered. It inserts
  a date link in the configured Markdown/Wikilink style in prose and tasks;
  tasks also retain a metadata deadline. The checklist Calendar action does the
  same. Date and column pickers replace a single existing value on the line, or
  preserve multiple values and add the selection.
- Kanban timeline dates apply as soon as they are chosen or cleared, without
  Save/Cancel buttons. Escape closes the prompt; failed edits preserve saved
  dates and remain retryable.
- Calendar, Kanban, and Graph align their controls at the upper left. Choice
  switches across the three Figaro themes use Calendar's borderless styling,
  with visible keyboard focus.
- Task deadlines now live only in private metadata shared by Board, Gantt,
  Calendar, Today, and reminders. `@date` opens the Calendar picker and replaces
  its command with an ordinary date link; old due-looking Markdown links no longer
  schedule tasks. Moving into a non-TODO column records an unset start date
  without resetting existing starts or postponing overdue deadlines.
- Very large Markdown notes now mount their complete source and presentation in
  bounded frame-sized phases, preserving the full editor while avoiding one
  blocking parse/decorations task. Large Graph canvases likewise retain one
  stable layout and paint interruptible batches instead of recomputing every
  filtered view synchronously.

### Fixed

- Raw Markdown and PDF previews now preserve the editor's usable width when the
  navigation pane leaves too little room to dock them, using the same right
  pane as a responsive overlay without horizontal overflow. Empty Gantt boards
  no longer advertise drag gestures until tasks exist.
- Charts preserve authored category order instead of silently sorting labels.
  Empty Gantt boards now show a centered status, generic `@date` controls no
  longer use due-date wording, and shared tooltips disappear when their owner is
  removed or moves away from a stationary pointer.
- Hashtags open Kanban only when the tag itself is clicked; clicking empty
  editor space after an end-of-line tag now places the caret normally.
- Date-link edits preserve existing task schedules and start dates. Wikilink
  dates now contribute to Calendar associations alongside Markdown date links.
- Gantt's Start/End popup closes when clicking elsewhere without swallowing the
  next action. Escape closes nested calendars before the popup and also works
  during saving; dismissed popups never reopen or steal focus when saving finishes.
- Calendar and Kanban timelines no longer flash a different week while paging.
  Buffered updates preserve mounted days/task bars and the latest scroll
  position, including continued wheel movement during loading.
- Kanban's D date picker returns keyboard focus to the card after cancellation
  or selection. Deadline edits no longer rewrite or reload note contents;
  dirty-source and failed-write checks preserve the task.
- Rapid Gantt scrolling now coalesces row-window updates to one per animation
  frame. Graph filter, selection, and zoom remain responsive at 10,000 notes,
  and semantically unchanged filters no longer repaint the canvas.
- The Vega-Lite Chart Editor serializes preview rendering and keeps only the
  newest pending configuration, so rapid control changes cannot run overlapping
  Vega engines or publish a stale preview.
- The huge-vault browser profiler now supplies Graph and schedule fixtures,
  waits for complete canvas/Markdown presentation, records each completed
  scenario immediately, and continues to report later scenarios independently
  after a failure.

## [1.31.0] - 2026-08-31

### Added

- The Mermaid Editor now includes an adaptive **Style** mode. Every detected
  diagram type receives shared document, neutral, and accent themes, while
  supported types expose only their relevant element or series colors.
  Flowcharts additionally support clickable node selection, per-node color and
  shape, direction, and connection curves. All choices remain portable native
  Mermaid frontmatter or statements and render identically in notes and PDFs.
- Markdown tables can now be converted into reversible Vega-Lite charts from
  the left editor rail. The focused Chart Editor supports per-column marks,
  visibility, axes, colors, linear trendlines, shared stacks, gridlines,
  colorable thresholds, Pie and Waterfall modes, exact conversion back to the
  original table, and full-width charts with direct vertical resizing.
- Rendered Markdown images can now be resized directly in the editor with
  themed width, height, and proportional drag handles. Figaro stores the
  result as an Obsidian-style trailing `|WIDTHxHEIGHT` hint, shows live dimensions
  while dragging, preserves the rendered footprint while its source is
  revealed, and offers a left-side **original size** action.
- Markdown authoring now offers `@due`, `@table`, `@todo`, `@mermaid`, and
  `@drawio` macros that reuse Figaro's Calendar picker and focused editors,
  place the caret immediately after a new unchecked task marker, or create and
  link a named editable diagram beside the active note.
- Unfinished Markdown task items now show compact Kanban and Calendar actions
  in the left editor rail. They reuse column autocomplete and the shared date
  picker, and always serialize a selected column before the semantic due link
  regardless of which action was used first.

### Changed

- Pie and Waterfall charts can now use any table column as their category;
  numeric category/value assignments remain independently selectable and
  round-trip through the reversible Chart Editor metadata.
- Frontend workspace features now use explicit application wiring instead of
  circular module imports, and complex editor, file-tree keyboard, and native
  import workflows are split into independently tested responsibilities.
- Image width and proportional resizing stop at the writing surface's right
  edge, proportional resizing also stops at the editor's bottom edge, and
  height-only resizing is capped at ten times the source image height. PDF
  Preview and generated PDFs preserve the same authored dimensions.
- Ctrl/Cmd+mouse-wheel scaling now reveals the otherwise quiet status bar for
  three seconds so the active buffer's resulting **Scale** remains visible.
- Renaming a file referenced by other Markdown notes now reports how many notes
  are affected and asks whether to update every reference, keep the references
  unchanged, or cancel the rename.

### Fixed

- Mermaid styling now uses exact parsed nodes, includes chained and standalone
  nodes, and never mistakes icon labels for extra nodes. Existing native/class
  colors and custom themes are reflected correctly. Color controls use verified
  renderer mappings, XY colors preserve other plots and repeating palettes,
  and unsupported or unused palette controls are omitted. Style edits retain
  keyboard focus, palettes survive preview refreshes, the node editor is visible
  immediately, and compact panes no longer clip behind the footer.
- Flowchart node styling is now visible when it is needed: the selected-node
  color and shape editor appears before a height-bounded node list, selecting a
  preview node reveals that editor, and the list explains its purpose. Node
  color markers no longer resemble unchecked boxes, global controls are labeled
  as defaults, and Arrow keys plus Home/End move through individual nodes.
- Cartesian charts now consistently use the first table column as their
  category axis and no longer show a redundant Category selector. Pie and
  Waterfall retain their independent category controls.
- Linear trendlines can now be enabled for any visible numeric series with at
  least two rows, including charts whose first column contains text labels.
  Vega-Lite regresses against a hidden authored-row index while the chart keeps
  displaying the original category labels.
- Disabled linear-trendline controls now explain the exact blocker when the
  user hovers, focuses, or clicks the complete checkbox label. The redundant
  dotted underline and question-mark target have been removed, and the shared
  tooltip now remains visibly layered above the Chart Editor modal.
- Enabling a Vega-Lite threshold no longer removes the selected value axis.
  Threshold rules and labels now join the existing scale without suppressing
  left/right axes in vertical charts or bottom/top axes in horizontal charts;
  charts created with the earlier threshold shape reopen and upgrade safely.
- The Vega-Lite Chart Editor now uses its configuration width without a
  horizontal scrollbar: Mode and Orientation share one row, series color and
  trendline controls share a compact row, threshold controls share one row,
  and section separators and instructional filler have been removed. Per-series
  Left/Right or Bottom/Top placement and threshold
  Primary/Opposite placement are now direct segmented choices instead of a
  cycling button or combobox. The threshold stepper matches Settings' compact
  width, and the complete disabled trendline control explains why it is
  unavailable. Eye buttons now control column visibility without discarding the
  column's settings. Mixed-mark charts include every visible series in one legend, which
  can be placed on any of the chart's four sides, and the preview is borderless.
  Charts created by the earlier editor reopen safely and adopt the complete
  legend when next applied.
- The Vega-Lite Chart Editor now reflows column, mode, and guide controls before
  they can overlap, keeps mark labels and linear-trendline controls on one line,
  explains unavailable trendlines on hover, and replaces ambiguous category
  axis/color cells with one clear label. Square series and guide color controls
  now reuse the Kanban palette, while threshold values use the same editable
  minus/value/plus stepper as Settings and guide text fields use their available
  width. Combobox menus remain inside the visible viewport, and the preview and
  applied chart retain the same theme surface and data colors.
- The Chart Editor now renders container-width Vega-Lite charts through a
  WebKitGTK-safe measured surface, follows the active Figaro theme, replaces
  native select popups with themed comboboxes, and announces configuration or
  renderer failures instead of leaving a blank preview.
- Editing Markdown while PDF Preview is open no longer flashes transient
  updating text over an already rendered page; background refreshes stay quiet
  until the replacement snapshot is ready, while errors remain visible.
- PDF Preview now resolves note-relative local images through the vault route
  before they enter its sandbox, so images—including authored sizes—no longer
  appear as broken placeholders there.
- Image resizing now changes the Markdown size hint only when the pointer is
  released, producing one Undo/Redo step per completed drag. A cancelled drag
  restores its starting geometry, and a press without movement writes nothing.

## [1.30.0] - 2026-08-30

### Added

- Calendar now offers a **Timeline** presentation: a horizontally scrollable
  run of days stacks 8px note pills on each date, carries each note's custom
  color and Lucide icon, and opens or reuses its document tab at the first
  occurrence of that date. A sparse six-week window keeps more than two weeks
  buffered around the viewport; approaching either edge silently loads the
  adjacent week without moving the visible dates, and leaving Calendar releases
  that Timeline DOM and cache. Locale-defined weekends receive
  the former Timeline-surface tint while ordinary days blend into the main
  pane. Wheel and trackpad input advances by at least three days, and dragging
  empty Timeline space pans without selecting its labels.
- A new **Graph** workspace maps all saved Markdown notes and vault-local links
  with a compact floating search, borderless zoom controls, an **Orphans**
  choice button, clear directed arrows, pan/zoom, and keyboard navigation.
  File-tree folder colors inherit through brighter nested tints, note colors
  and icons override them, click pins link tracing, and Ctrl/Cmd-click opens a
  note while graph counts replace irrelevant buffer status.
- F1 Help now includes a local search for Markdown syntax, Macros, Shortcuts,
  and Settings; results jump to the matching reference row or open and focus
  the exact Settings control without executing commands.
- The left and right pane separators now support Left/Right, Shift+Left/Right,
  and Home/End resizing with labelled separator semantics and a compact focus
  marker.
- Figaro Help now documents pressing Escape followed by Tab or Shift+Tab to
  move keyboard focus out of the editor while retaining Tab indentation.
- Ctrl/Cmd-clicking an external HTTP or HTTPS Markdown link now opens it in
  the operating system's default browser from either rendered preview or
  revealed source, and the external-link tooltip advertises that shortcut.

### Changed

- Calendar, Kanban, and Graph now act as borderless browser-style tabs connected
  to the workspace's left edge across every theme, mask the shell divider along
  the selected row, round both workspace-side junctions, stay open when
  reselected, and never add duplicate tabs to the document title bar; Calendar
  uses an uninterrupted 50/50 central workspace with its month centered in the
  left pane and selected-day notes in the right pane. Calendar retains the
  shared status-bar spacing but hides meaningless buffer telemetry, while hashtag
  and dashboard entry points reuse the same Kanban board.
- The editor's top-left corner now uses the shared tab radius whenever the first
  title-bar tab is not selected, applies it through every inner editor layer to
  prevent a faded square edge, masks theme divider rails around the curve,
  matches its underlay to the sidebar surface, and retains a seamless square
  connection when the first tab is selected; hovering the inactive first tab
  now paints that underlay and stacks above the divider mask instead of exposing
  a wedge or double-painted line.
- Active title-bar tabs now use inverse 8px curves at their lower junctions,
  matching the top-corner roundness without turning the tab into a pill.
- Specialized Settings controls now expose explicit accessible names and use
  the shared hover/focus tooltip for concise explanations of arcane options.
- **Figaro CRT Phosphor** now uses borderless dark overscan, stronger curved
  glass falloff with fine dithering to prevent visible gradient rings, 35%
  horizontal scanlines, soft phosphor bloom, restrained flicker/breathing, and
  one softened beam pulse per minute; reduced-motion preferences retain the
  static glass while suppressing its motion.
- Removed obsolete screen-effect hooks, unconsumed styles and tokens, and
  unused JavaScript module wrapper exports without changing visible behavior.

### Fixed

- Calendar now keeps the shared 24px status-bar footprint while hiding only
  main-pane buffer telemetry, preventing a vertical jump when switching to
  Kanban, Graph, or a document.
- Calendar, Kanban, and Graph no longer flash a light border while their
  connected sidebar tab changes from pressed to selected.
- Save failures now override Pure mode with a blocking Retry/Copy/Keep editing
  dialog, preserve the dirty buffer, avoid repeated Auto-Save popups, and stop
  **Save and exit** from closing the window before every buffer is confirmed
  saved.

## [1.29.0] - 2026-08-28

### Added

- Pure mode now uses enabled-by-default, smoothly retargeted typewriter
  scrolling to keep authored input near 42% of the viewport. Its new Settings
  section can disable that motion, dim everything outside the current phrase
  or paragraph, and optionally **Adapt text to window size** across three stable
  bands.

### Changed

- Collapsing the sidebar now enters Pure mode even when a details pane is open:
  the pane is temporarily hidden and inert, then returns intact on expansion.
  The former Pure-on-collapse opt-out is retired and cleared, so a collapsed
  file editor now has one predictable meaning.
  Pure mode also removes sticky headings and breadcrumbs, while the empty
  **Add properties** action stays quiet until its top slot, first-line caret,
  or keyboard focus makes it relevant.

## [1.28.2] - 2026-08-28

### Fixed

- Release validation now checks keyboard-focused catalogue tooltips from a
  settled viewport, avoiding false failures caused by the separate
  scroll-dismiss behavior on slower runners.

## [1.28.1] - 2026-08-28

### Fixed

- Fresh npm installations now verify the installed Jest syntax-compatibility
  package instead of accidentally relying on ignored dependencies from its
  source directory, keeping local and release validation consistent.

## [1.28.0] - 2026-08-28

### Added

- New vaults now receive a Mermaid flowchart example in `Welcome.md`, alongside
  current Quick Note, sidebar, and PDF-export guidance.
- **Pure editing chrome**, enabled by default with a Settings opt-out, now lets a file editor fill the
  window when the sidebar is collapsed. The left rail remains, while title-bar
  controls return as a non-shifting edge overlay on hover or keyboard focus;
  only the live word count remains at bottom-right, while the rest of the
  status bar and Document outline stay absent. Workspace views and an open
  details pane restore the normal shell.
  Its enabled state, collapsed rail, and active buffer now return together
  across restarts without flashing the expanded sidebar.

### Changed

- **Edit YAML** in expanded Properties is now a quiet, borderless source action
  with a small file-code icon, muted resting text, tonal hover paint, and the
  standard keyboard-focus halo.
- Pure editing chrome now opens its hidden title bar from a 28px top
  approach zone, so the controls appear sooner as the pointer moves upward.
- The editor now follows a writing-surface border budget: rounded rendered code,
  collapsed and expanded Properties, metadata chips, and unused rendered-block
  footprint space are borderless, while tables, fields, focus, errors, and
  internal structure retain purposeful boundaries. Both Properties states now
  keep the same rounded tonal surface.
- Independent-selection checkboxes now use a shared theme-aware control with
  deliberate rest, checked, hover, keyboard-focus, and disabled states instead
  of the browser's native paint.
- The sidebar now drops decorative borders from Search notes and Quick note,
  and selected files no longer show a leading accent stripe or shadow. Filled
  surfaces, hover paint, label weight, keyboard focus, and accessible selection
  state continue to identify each control.
- Quick Note now uses each theme's quiet neutral writing-surface treatment—a
  subtle primary-text wash at rest and the standard hover surface when
  relevant—instead of a red accent wash; its red action icon, muted `INBOX`
  label, and ordinary Inbox Mail icon remain unchanged.
- The top-bar sidebar toggle now uses a panel icon, while Document outline uses
  a distinct nested-list icon for the current note's heading hierarchy.
- Search notes now keeps its count circle hidden until matching results appear,
  then hides it again when the search is empty, dismissed, cleared, or a result
  is opened.
- Expanded block controls now stay quiet until the pointer approaches their
  rendered block or left rail, the caret enters their source, or keyboard focus
  reaches them; the reveal path remains continuous and folded controls stay
  visible.
- During ordinary focused writing, the fixed-height status bar now clears all
  of its content until hover or keyboard focus restores it. In Pure editing
  chrome, the footer never reveals on hover or focus: only the live word count
  remains at bottom-right, even while application status changes.
- The active-buffer status bar now left-aligns changes, backlinks, editing
  mode, scale, and encoding while right-aligning line/column, word and
  character counts, and reading time.
- Rendered fenced code now shows numbered code lines without displaying its
  backtick fence or language tag, and its borderless tonal surface now has 8px
  rounded corners; entering the block still reveals the complete portable
  Markdown source.
- Stable rendered blocks no longer display the **Markdown footprint** label.

### Fixed

- Vim's physical arrow keys now use the same Normal and Visual motions as
  `h`/`j`/`k`/`l`, including Properties and rendered-block boundaries, instead
  of letting Figaro's ordinary Up/Down handler intercept them.
- Pure editing chrome now keeps the floating Document outline launcher hidden
  even while its top chrome is revealed.
- Pure editing chrome no longer leaves the tab rail visible merely because the
  collapsed-sidebar toggle retains pointer or keyboard focus; only the top
  document edge and the tab/window groups reveal that chrome.
- Existing collapsed-sidebar profiles without a saved Pure-chrome preference
  now enter the intended edge-to-edge editor automatically instead of retaining
  the ordinary title-bar row.
- During ordinary writing, the lower-left application-status region now keeps
  the sidebar's solid surface while its **Ready** content recedes, removing
  the editor-colored strip beneath the sidebar.
- Quiet block-control stacks no longer intercept the pointer before their
  controls reveal, and browser workflows now approach receded block and status
  controls through the same hover path as a user.
- Startup now hydrates saved editor interaction and layout preferences before
  the restored buffer becomes visible or interactive, preventing transient
  sticky headings, outline controls, diagnostics, pre-Vim input, and late
  line-number gutter shifts. The first shell frame also uses the saved sidebar
  width and an accurate **Starting Figaro…** status.
- Vertical wheel input over rendered code now scrolls an overflowing preview
  first, then resumes document scrolling when the preview reaches its top or
  bottom; a code block with only a horizontal scrollbar no longer traps the
  vertical gesture.
- Clean frontend dependency installs now use one portable local-package lock
  layout across supported npm versions instead of failing with a misleading
  package/lockfile mismatch.
- Pressing a rendered code block's native scrollbar no longer reveals the raw
  fence or moves the editor caret.

## [1.27.0] - 2026-08-27

### Added

- Ctrl/Cmd+N now creates and focuses a collision-safe Quick Note in Inbox;
  Ctrl/Cmd+Shift+N remains the daily-note command.
- A failed local `.drawio.svg` image in Markdown now offers an accessible
  **Create Draw.io diagram** action when absent and **Open Draw.io diagram**
  when an empty file already exists, without changing the note source.
- Standalone local Draw.io images now use a left-side `drawio` / `editor`
  guide stack for collapsing the preview or opening its editable diagram
  directly from the note.
- Vertical wheel input over the Calendar month grid now browses the previous
  or next month, with deliberate trackpad accumulation and native scrolling
  preserved for the selected-day details.
- Markdown selections now support conventional one-step-undo formatting
  shortcuts for Bold, Italic, Link, Strikethrough, and Inline Code.
- Markdown tables now have a themed grid editor opened from their left-side
  **editor** guide, with editable auto-growing cells, guarded row/column
  controls, local Undo/Redo, read-only Markdown inspection, and one-transaction
  Apply/Cancel behavior.
- Holding Shift while clicking or dragging across cells, or using
  Alt+Shift+Arrow, now selects a rectangular table range for Merge; Split
  restores the original cells while the editor stays open, and merged cells
  render consistently in live preview, PDF Preview, and generated PDFs.
- Spreadsheet paste and **Convert selection to table…** now recognize
  semicolon-separated CSV, including quoted semicolons and European decimal
  commas.

### Changed

- Rendered task checkboxes now expose the task and intended action to assistive
  technology, provide a 24px pointer target, and update Markdown identically
  from click or keyboard Space while retaining keyboard focus.
- Opening Settings now focuses its semantic page heading, and the Theme, Font,
  and Code Font pickers share one arrow/Home/End/Enter/Space/Escape/Tab
  combobox contract with announced selection state.
- Clicking a rendered Markdown table cell now reveals the source with the
  caret at the beginning of that exact cell's content instead of at a generic
  table boundary.
- Table structural commands now live in the dedicated table editor instead of
  changing the ordinary editor right-click menu. A normal cell click edits
  text without entering range-selection mode, while contextual disabled
  controls explain which selection or split is required.
- Table-editor controls now use labelled icons in two task-oriented rows;
  row and column insertion remain grouped by target, while the adjacent
  Delete Row and Delete Column actions use the theme's danger treatment.
- Automatic table paste now prioritizes Excel/LibreOffice HTML, explicit TSV,
  and explicit comma-or-semicolon CSV; untyped delimited text needs at least
  three consistently rectangular rows before Figaro converts it.
- A standalone Markdown `---` in the document body now creates an invisible
  page break in PDF Preview and generated PDFs; frontmatter, Setext headings,
  and the `***` / `___` thematic separators keep their existing meanings.
- Toggle Sidebar now uses Ctrl/Cmd+Shift+B, leaving conventional Ctrl/Cmd+B
  available for Markdown Bold.

### Fixed

- Real shifted key events now route Ctrl/Cmd+Shift+F to global search without
  opening in-document Find; Ctrl/Cmd+F remains local to the active file.
- Figaro Dark's dim secondary text now meets 4.5:1 contrast on its darker
  interactive surfaces, and the browser-development shell loads the real
  bundled theme palette and complete theme list for faithful visual checks.
- Creating a missing Draw.io image now activates its new blank diagram before
  refreshing the file tree, so a slow or stalled vault refresh cannot leave
  the Markdown action stuck on **Creating diagram…**. Closing the unchanged
  blank diagram now restores an **Open Draw.io diagram** action instead of the
  same permanent spinner, and returning after an SVG save restores the rendered
  diagram preview even if the original image request had already failed.
- Deleting a referenced Draw.io file from the file tree now immediately
  invalidates its cached buffer preview and restores the missing-file action.
- Invalid **Convert selection to table** input now leaves **Convert** visibly
  disabled with its validation message instead of showing the operating
  system's busy cursor.
- Closing the sidebar Calendar now mirrors its opening movement with a visible
  downward transition before the panel becomes hidden, while reduced-motion
  preferences retain their near-instant behavior.
- **Merge Notes** in the file-tree context menu is now enabled only when at
  least two Markdown notes are selected; an unrelated open note no longer
  makes the action available for a single selection.

## [1.26.0] - 2026-08-24

### Changed

- Figaro's development and test toolchain now uses Babel 8 and requires Node.js
  22.18+ on the 22.x line or Node.js 24.11+; Jest's internal Babel 7 syntax
  helpers remain isolated behind a clean local compatibility package.
- Live Markdown, print preview, and PDF generation now share a coordinated
  Markdown-It 15 renderer and matching plugin set while preserving the existing
  syntax and output contract.
- Unicode processing and PDF destination resolution now use the current
  `x/text` 0.41 and pdfcpu 0.15 dependency lines.
- The README now features a current Figaro Dark workspace showing connected
  title-bar tabs, the styled vault tree, activity and due-date Calendar states,
  live Markdown, document Outline, and split status bar.

### Fixed

- Calendar details now reserve enough room at normal window heights to show a
  due task and linked note above the fixed workspace tools, while longer result
  lists continue to scroll independently.

## [1.25.2] - 2026-08-24

### Changed

- Figaro Dark now uses a subtly brighter reading surface across the active tab,
  editor, gutter, and buffer status, making it easier to distinguish from the
  titlebar and file tree without adding a border.
- Rendered Markdown tables now use denser typography and spacing, allowing
  common tables to fit their source-height preview without unnecessary
  clipping while retaining full editor width.

### Fixed

- Clicking or dragging a rendered table's scrollbar, or scrolling over its
  cells, now keeps the preview rendered and the editor caret unchanged; cell
  clicks still reveal the table's Markdown source for editing.

## [1.25.1] - 2026-08-24

### Added

- Figaro help now includes a third **Shortcuts** topic covering global and
  editor commands, and unmodified F1 toggles the help surface from anywhere
  while returning focus to its invoker when closed.

### Changed

- Find and Replace now uses three stable compact bands for search/navigation,
  matching options, and replacement actions instead of wrapping controls into
  an unpredictable panel height.
- Standard editing now uses a thin theme-colored insertion caret; the
  contrasting block cursor is reserved for Vim Normal mode.
- Under tab-width pressure, document tabs now preserve the filename before
  yielding space from the muted parent path.

### Fixed

- Empty blockquotes now exit one quote level with a single Enter, matching the
  existing empty-list behavior while preserving nested quote levels.
- Opening a note from the file tree now reuses that activation's file snapshot
  instead of reading the same file twice.
- Missing-image loading and error states now use semantic theme colors and a
  stable one-source-line footprint, so revealing their Markdown does not move
  adjacent content.
- Icon-only shell controls now expose explicit assistive names for sidebar,
  window, and details-pane actions.

## [1.25.0] - 2026-08-23

### Added

- Added the **Figaro CRT Phosphor** theme with an accessible phosphor palette,
  locally bundled monospace typography, a subtle vignette and screen
  perspective, plus one faint scan-line pass about every five minutes that is
  disabled by reduced-motion preferences.

### Changed

- The due-date picker opened after a tagged-line Space now mirrors the sidebar
  Calendar: Today starts selected, the operating-system locale controls weekday
  order and weekends, and the same live note-intensity fills, due outlines,
  theme colors, and activity tooltips appear in both calendars.
- Pressing Space after any valid standalone Kanban hashtag now offers **Add due
  date…**, **Due today**, and **Due tomorrow** for that tagged line, including
  prose and unsaved custom columns; `#done` and already dated lines stay quiet.
- The title-bar `?` help now separates supported **Markdown** syntax from
  Figaro-specific **Macros**. Relative-date shortcuts, Calendar date links,
  Kanban system/custom hashtags, semantic task due dates, and their completion
  actions now live together in the keyboard-accessible Macros topic. The help
  surface is also wider and taller, with stable geometry when switching topics.
- Vertical wheel navigation over document tabs and the new
  Ctrl+PageUp/PageDown buffer shortcuts now stop at the first and last open tab
  instead of wrapping around.
- Document tabs now use the approved connected rounded design-system variant
  inside the title bar, aligned to the live sidebar edge through collapse and
  resize while preserving overflow controls, reordering, and native window
  dragging.
- Figaro Dark and Figaro Light now use flat connected workspace surfaces:
  titlebar and file tree share one color while active tab and editor share
  another; incidental sidebar and tab borders are removed, and the few
  remaining tools/status separators are deliberately subtle.
- The footer now has a file-tree-width application-status region for startup
  progress, activity, messages, and Undo, plus a remaining buffer-status region
  for editor telemetry and file actions. Both follow sidebar resize/collapse;
  every Figaro theme continues its file-tree palette into the application
  region, while Dark and Light continue the editor color into the buffer region.

### Fixed

- Newly opened Markdown buffers with complete Properties now place the cursor
  on the first body line instead of on the frontmatter card; remembered cursor
  selections and explicit line targets still take precedence.
- Overflowing tab rails now preserve their horizontal offset while measuring
  the all-tabs control, keeping short and crowded rails consistently flush with
  the buffer at their leading edge.
- Bordered themes now paint the file-tree rail and leading tab outline on one
  shared boundary pixel instead of adjacent lines; CRT Phosphor also drops its
  redundant inset sidebar rule while retaining the outer glow.
- Title-bar divider ownership now remains stable through startup and final-tab
  closure, eliminating empty-rail and right-controls kinks; themes that expose
  the divider keep it continuous and let the selected tab cover only its own
  segment.
- Figaro Dark and Figaro Light no longer show a differently colored CodeMirror
  gutter strip between the file tree and editor; the gutter now continues the
  native reading surface.
- Calendar now selects Today on its first opening in each app session and
  restores the last day selected when reopened during that session, without
  carrying a stale selection into the next launch.

## [1.24.1] - 2026-08-21

### Changed

- Calendar and Kanban now show immediate theme-aware shimmer skeletons while
  uncached month or board data loads, with stable view-shaped placeholders and
  a static reduced-motion fallback instead of an apparently empty surface.

## [1.24.0] - 2026-08-21

### Added

- Common text, PDF, image, code, data, archive, media, shell, and Draw.io files
  now receive semantic file-tree icons, with a generic fallback and preserved
  custom-icon overrides.
- Cut file-tree entries now show an accessible scissors marker until Paste,
  replacement by Copy, or Escape cancellation; partial failures retain the
  marker only on unresolved sources.

### Changed

- Raw Text Preview now follows the active editor's matching source position
  with lightly coalesced parallel scrolling and provides a **Copy to
  Clipboard** action for the complete current Markdown snapshot.
- Tooltips now use one theme-aware design-system surface throughout Figaro,
  including document-outline hints, dynamically mounted controls, Calendar
  activity, managed-file guidance, and Markdown link previews. They appear on
  hover or keyboard focus, stay inside the viewport, and dismiss with Escape.
- Calendar now follows the operating-system locale's first weekday and weekend
  rules, keeps ordinary weekdays legible, shades distinct-note activity through
  five theme-derived intensity levels, and gives due days a theme-danger outline
  with every due title available on hover or keyboard focus. Public holidays
  are intentionally not guessed or requested.
- Calendar now uses one full theme-accent surface that moves from Today to a
  selected note/link/due day and restores the previous day's activity intensity,
  without a persistent accent border. It keeps the month grid stationary while
  browsing details and reflects accepted date shortcuts from unsaved Markdown
  immediately. Daily-note counts and selected-day rows now agree.
- The file tree now uses one selected surface for both single and multiple
  operation targets. Active buffers retain non-visual current-page semantics
  without a competing background, while managed-only files use normal opacity,
  keep the current buffer open on ordinary selection, and explain through a
  themed hover/focus tooltip that double-click opens them in the operating
  system's default application. Their context-menu action is now **Open** and
  performs the same safe native handoff.
- File-tree Ctrl/Cmd multi-selection now accepts any internal file or folder,
  and Cut/Copy/Paste transfers the complete selected set with safe batch
  validation and retryable partial-failure handling.
- Space now toggles the focused internal file-tree row's operation selection
  without opening it; Enter remains the activation key.

## [1.23.2] - 2026-08-17

### Fixed

- Mermaid live previews now reuse cached SVG output and defer first-time diagram
  renders until scrolling is quiet, reducing pauses when navigating through
  long rendered notes.

## [1.23.1] - 2026-08-17

### Fixed

- Long Markdown documents now keep the selected source line visible when
  keyboard navigation crosses rendered blocks. Normal and Vim vertical motion
  applies a post-paint physical viewport correction plus a CodeMirror
  remeasure, so down/up/down, Page Up, and Page Down no longer leave stale text
  gaps that only mouse scrolling can repair.

## [1.23.0] - 2026-08-17

### Changed

- Markdown tables now use CodeMirror's GFM syntax tree plus a read-only,
  source-preserving preview instead of a nested table editor. Entering a table
  reveals the exact Markdown, while live preview and PDF output share GFM
  formatting and Figaro's `<br>` and `^` table conventions.

### Fixed

- Live table previews, PDF Preview, and generated PDFs now turn portable `<br>`
  cell markers into real line breaks and support anchored `^` data cells as
  vertical row spans without changing the saved Markdown.

## [1.22.0] - 2026-08-16

### Changed

- Startup now restores the last confirmed appearance and active note before
  full-vault indexing begins. Inactive tabs remain metadata-only, the file tree
  loads alongside the index, and compact bottom-left progress stays visible
  while the remaining eager workspace data warms in the background.

### Fixed

- Opening Figaro or an associated Markdown file while Figaro is already
  running now restores and focuses the existing window, forwarding the file to
  its normal Import/Keep outside flow instead of opening another instance.

## [1.21.1] - 2026-08-15

### Fixed

- Undo and redo now stay inside their open file buffer across tab switches,
  instead of allowing Undo to restore another file's complete contents; an
  externally changed buffer safely starts with fresh history.
- Pasting a URL over a Vim Visual selection now creates the expected Markdown
  link through both `p`/`P` and the editor's Paste menu.
- Startup now applies the saved theme before vault discovery begins or its
  loading card appears, and the progress track renders at its full height.

## [1.21.0] - 2026-08-14

### Added

- Smart Paste now converts genuinely rich clipboard content into portable
  Markdown, including conservative repairs for common AI-chat code and math
  structure, while preserving literal, internal, image, URL, and table paste
  behavior; Ctrl/Cmd+Shift+V remains an exact plain-text bypass.

### Changed

- Interactive tables now place a compact **delete** action beneath their
  left-side **table** helper, using destructive color only on hover or focus;
  when that rail cannot fit beside the editor, the same action moves above the
  table instead of overlapping the sidebar or grid.

## [1.20.1] - 2026-08-14

### Fixed

- Release and CI builds now require patched Go 1.26.6 or newer, preventing
  binaries from being built with reachable standard-library vulnerabilities.

## [1.20.0] - 2026-08-14

### Added

- Ctrl/Cmd+mouse-wheel over the editor now changes text scale only for the
  current open buffer. A compact status-bar **Scale** button shows that value
  and resets it to the permanent **Default Text Size** from Settings.
- Large vaults now show an immediate **Loading vault** workspace with live
  indexed-note counts and determinate progress until the initial vault is ready.
- Global note search now supports natural multi-word queries, prefix and
  conservative typo matching, accent-insensitive terms, relevance-ranked
  best-match excerpts, and low-result **Did you mean…?** suggestions.

### Changed

- Editor text scaling now keeps a constant line-height ratio, avoiding the
  previous double increase in vertical spacing above the 100% default.
- A new global **Tab Size** setting uses a `− number +` control from 2–8
  spaces (4 by default) and now keeps Tab/Shift+Tab, Vim indentation, code
  files and fences, Mermaid source, tables, and raw-source display consistent.
- Rendered Mermaid/Vega diagrams, fenced code, display math, and Markdown
  tables now keep their Markdown source height in the editor, preventing the
  surrounding note from jumping when source is revealed. Oversized graphics
  fit down, while code and tables remain readable through contained scrolling.
- Markdown/Wikilink completion now reuses global search relevance with stronger
  title and path weighting, so partial and misspelled targets rank consistently.
- The experimental Projects workspace, its project/task metadata model, and
  its Board, Table, and Gantt surfaces have been removed. Existing Markdown
  files remain ordinary vault content and are not modified or deleted.
- Obsolete frontend helpers and styles, redundant PDF and watcher wrappers,
  stale test bindings, an unused Babel runtime, and a redundant production
  Playwright declaration are no longer carried after their callers were removed.
- Mermaid's **editor** action now sits directly beneath the left-side
  **mermaid** fold helper, keeping both controls outside the centered writing
  column and returning the full block width to the diagram.
- Footnote references now navigate to their definitions and back; clicking an
  unresolved reference creates its definition after the current paragraph and
  places the cursor in its empty body.

### Fixed

- Clicking the global-search **Titles**, **Recent**, or **Aa** filter now reruns
  the query and resizes the existing open result list instead of closing it.
- Global search paths, excerpts, line/count details, and highlighted matches
  now retain readable text contrast across every bundled theme.
- The editor helper rail now keeps one editor-sized monospace control stack
  aligned to the writing column. Folding a heading no longer shifts the note
  when a wider nested guide such as `mermaid` disappears.
- Mermaid controls no longer duplicate when a fence begins beside the
  zero-width **Add properties** widget at the start of a note.
- Home/document-start navigation and Vim `gg` now keep the frontmatter
  Properties card rendered; only deliberate Arrow Up or Vim `k` entry reveals
  its raw YAML automatically.
- Native builds can regenerate the CodeMirror color helper without restoring
  an otherwise-unused production Babel runtime.
- Expanding a folded block at the end of a document now keeps its guide under
  the pointer after the restored preview completes CodeMirror measurement.
- Clicking the left-side `mermaid` helper now collapses an already-rendered
  diagram into a native fold row, and expanding restores its live preview.
- **Delete table** occupies a clear right-side lane when space allows and moves
  above its table at narrow widths.

## [1.19.0] - 2026-08-13

### Added

- Revealed Mermaid fences now show debounced syntax-error squiggles and hover
  explanations directly in the Markdown editor.

## [1.18.1] - 2026-08-13

### Fixed

- Updated the PDF dependency chain to a patched WebP decoder, resolving the
  reachable GO-2026-5061 dependency-audit finding.
- Failed browser checks now retain Playwright reports, traces, screenshots,
  and test attachments in both CI and release verification for 14 days.
- The Mermaid Editor now keeps its inherited Vim mode and cursor styling after
  live syntax diagnostics update the temporary CodeMirror document.

## [1.18.0] - 2026-08-13

### Added

- Mermaid blocks now expose a right-side **Mermaid Editor** with all 32 chart
  types and 76 version-matched Live Editor templates, an editable source pane,
  live SVG preview, inline syntax diagnostics, last-known-good error recovery,
  and atomic, undoable Apply or non-destructive Cancel.
- Mermaid Editor previews now fit oversized diagrams to the available pane and
  support pointer-centered wheel zoom, drag panning, arrow-key panning, and
  keyboard zoom/reset controls while repainting SVGs sharply at each scale.

### Changed

- The Mermaid Editor now uses compact, left-aligned **Diagram** and **Template**
  pickers with a tighter 4 px gap. Empty, whitespace-only, or template-backed
  blocks preview each selection immediately, while existing or manually edited
  source requires an explicit **Replace with template**.

### Fixed

- The Mermaid Editor now inherits Vim and visual-row navigation from the main
  editor, and its right action gutter no longer paints stray full-height bars.
- The disabled **Replace with template** action now uses an ordinary cursor
  instead of incorrectly suggesting that background work is in progress.
- The Mermaid preview's empty-state notice now disappears permanently after
  the first successful SVG render.
- Opening or closing Document Outline at narrow widths now keeps each Mermaid
  Editor action attached to its diagram without covering it throughout the pane
  animation; extremely narrow writing areas reserve a compact action row above
  the diagram until side-by-side space returns.

## [1.17.0] - 2026-08-12

### Added

- PDF Properties now offers opt-in physical page numbers and matching table-of-contents
  destination numbers through `page-numbers: true`; cover pages remain visually
  unnumbered, ordinary exports remain single-pass, and **Upgrade copy** migrates
  existing print CSS into a separate version-2 starter without overwriting it.

### Changed

- Settings now packs its existing cards into two intrinsic-height groups on
  wide windows and one logical stack on narrower windows, eliminating the
  stretched Appearance and PDF boxes while retaining every setting's keyboard
  order and immediate visibility.

### Fixed

- Markdown and PDF Preview scrolling now follows source-line anchors, retaining
  its smooth coalesced updates while avoiding accumulated drift around tall code
  blocks, tables, diagrams, and other differently sized rendered content.

## [1.16.0] - 2026-08-12

### Added

- File-tree **Cut**, **Copy**, and **Paste** now provide a conventional
  keyboard and context-menu move workflow, with subtle shortcut hints and the
  same collision, dirty-tab, link-rewrite, and delayed-activity protections as
  drag/drop.
- Successful file-tree deletion now offers a ten-second status-bar **Undo**;
  **Settings → Vault care → Recently deleted** keeps every recovery record
  available afterward and restores its exact local Git snapshot without
  replacing an occupied path.
- File-tree copy/import, move/merge, rename, and delete operations now mark the
  tree busy immediately and show a status-bar spinner only when work lasts at
  least one second; overlapping operations and reduced-motion preferences are
  handled without flashing or stale activity.
- Pressing **F2** on a focused vault file or folder now opens the existing safe
  rename workflow.

### Changed

- The file tree now uses one selected-document state that follows the active
  tab. Keyboard focus and Ctrl/Cmd multi-selection remain distinct, clean
  background tabs no longer add visual dots, and unsaved buffers use the only
  secondary file marker.
- The file-tree context menu is shorter: Raw Text and PDF preview remain in the
  editor context menu and Properties, while the tree menu prioritizes file
  operations and shows shortcuts for Cut, Copy, Paste, Rename, and Delete.

### Fixed

- Backlink and committed-change counts are now real keyboard-operable buttons
  without changing their link-like appearance or pointer cursor, and History
  versions form an arrow-navigable selection list.
- The Markdown cheatsheet now opens reliably from a `?` help button immediately
  left of Settings; while closed, its controls no longer remain in the Tab
  order.
- Copying a file or folder in a large vault now retains the warm search,
  planning, relationship, and file-tree projections, indexes only the copied
  subtree, and suppresses the duplicate native-watcher refresh. Unobserved
  external Markdown changes still select the complete rebuild fallback.

## [1.15.1] - 2026-08-12

### Changed

- Updated the bundled KaTeX runtime to 0.18.4, the Markdown-It footnote plugin
  to 1.0.2, and the filesystem, Unicode, and platform Go modules to their
  current compatible releases while retaining Markdown-It 14 compatibility.

## [1.15.0] - 2026-08-12

### Added

- Added a deterministic, opt-in 10,000-document stress fixture, backend/browser
  performance profiles, and differential correctness oracles for testing huge
  vault optimizations without committing generated notes or silently losing
  filesystem, index, Git-status, relationship, or keyboard behavior.
- Vertical mouse-wheel input over the document tab rail now cycles through
  open tabs in either direction and wraps at the ends; horizontal and modified
  wheel gestures retain their native behavior.

### Changed

- Large searches now keep only a bounded result window in the DOM, reducing a
  10,000-note search from seconds to about 100 ms in the reference profile
  while preserving mouse, keyboard, and assistive-technology reachability.
- Large Kanban columns now mount bounded card windows and reconcile saved order
  in linear time, reducing the 10,000-card reference render from about two
  seconds to about 120 ms while preserving keyboard moves and drag/drop.
- Large expanded file trees now mount a bounded row window, reducing the
  21,630-row reference render from roughly 2.5 seconds to about 130 ms while
  preserving hierarchy, keyboard navigation, context menus, and activation.
- Large backlink collections now mount a bounded card window, reducing the
  10,000-relationship reference render from over one second to about 100 ms
  while preserving complete counts, keyboard reachability, and source opening.
- Cold vault indexing now uses compact sorted search postings and shares
  immutable text representations for identical notes, cutting the reference
  10,000-note build from roughly two seconds to roughly one second with
  substantially lower retained memory.
- Large file and directory moves now validate and reuse the warm vault index
  for link-rewrite candidates and moved projections, cutting the reference
  subtree move from more than two seconds to well below one second while retaining a
  complete-scan fallback for unobserved external changes.
- Active-note Git status now compares only that path across HEAD, the index,
  and its root-scoped worktree state, reducing the reference 10,000-file check
  from over one second to well below one millisecond without conflating other
  files or changing tracked, staged, ignored, or untracked results.
- File-tree refreshes now reuse an immutable metadata snapshot and remap known
  creates and moves in memory, reducing the warm reference refresh for 10,000
  documents from hundreds of milliseconds to about 16 ms. Generated PDF/CSS
  files and external content timestamps remain coherent, while broad or
  ambiguous changes retain the complete root-scoped scan fallback.

## [1.14.0] - 2026-08-11

### Added

- Interactive Markdown tables now include a direct **Delete table** action
  that removes the complete table as one undoable edit.
- Kanban cards are now keyboard-operable: Tab moves through cards across
  columns, Up/Down persist vertical order, and Left/Right move a task to the
  adjacent hashtag column.

### Changed

- Release preparation now uses Keep a Changelog headings and comparison links,
  validates the exact version section, and publishes its curated categories as
  the GitHub release notes instead of inferring them from commit history.
- Sticky heading titles now use the editor's normal text size instead of a
  smaller fixed UI size.
- Markdown block guides now align with the top of their heading, fenced-code,
  or table element and keep the clicked guide at the same screen position
  while collapsing or expanding, including at the end of a note.
- Long document tabs now preserve both ends of the filename and show their
  parent vault path; the All tabs menu also shows the full path context.
- The active document now leads the browser and native window title, for
  example `Project brief.md — Figaro`; Home uses `Figaro`.

### Fixed

- Sticky heading ancestors now appear separately as their source rows reach
  the visible editor edge instead of arriving late in virtual-viewport batches.
- Search now exposes its active result to assistive technology, keeps focus in
  the field when dismissed, gives metadata accessible contrast, and preserves
  the distinguishing tail of very deep parent paths instead of reducing
  repeated filenames to identical locations.
- File-tree, document-tab, and editor context menus now expose menu semantics
  and support Shift+F10/Menu, Up/Down, Home/End, Escape, and focus restoration.
- The file tree now places keyboard focus on one real row: Tab enters the
  current item, arrows traverse or expand/collapse its hierarchy, Home/End
  reach the boundaries, and Enter/Space activates it.
- Repeated Left/Right arrow presses now continue across document tabs instead
  of moving focus into the editor after the first switch.
- Failed saves now retain the dirty buffer and announce the concrete failure
  cause through the live status bar.
- The status bar now remains one fixed-height row at narrow window widths and
  hides lower-priority details instead of wrapping or overflowing vertically.
- Long-running file-tree moves now announce the item being moved and ignore
  duplicate drag attempts until the first move finishes.
- Dragging a document tab beyond the tab rail no longer selects text in the
  file tree or other workspace regions beneath the pointer.
- Linux PDF export now discovers supported Chromium-family Snap commands under
  `/snap/bin` and uses a Snap-visible workspace so confined browsers can start
  and read the document being exported.
- Fenced code now keeps its language-aware syntax colors in PDF Preview and
  generated PDFs instead of exporting as uniformly colored source text.
- The document-outline launcher now stays beneath the complete sticky-heading
  hierarchy instead of overlapping it.
- Fenced-code and table guides now visibly collapse their live-rendered
  widgets into a single native fold row and restore them without changing the
  Markdown source.
- Same-document Markdown fragment links such as `[Jump](#section)` now move to
  the matching heading from rendered or raw source instead of opening Kanban
  or offering to create a note.
- The main editor now exposes its document name to assistive technology, and a
  closed right pane no longer leaves its invisible Close button in the Tab order.
- Small Home instructions now meet text-contrast requirements in both native
  Figaro themes.
- One Enter now exits an empty second Markdown list item.
- Pasting a URL over selected prose now creates a Markdown link without losing
  the label, including selections made in Vim Visual mode.

## 1.13.1 - 2026-08-11

### Changed

- Markdown block guides now use the editor's normal text size and appear only
  for headings, fenced code blocks, and tables. Typed fences show their
  language, such as `yaml`, while untyped fences use `code`.
- Sticky heading hierarchies now span the full editor width as a flat strip
  instead of appearing as a floating card.

## 1.13.0 - 2026-08-10

### Added

- Markdown notes now keep the complete active heading hierarchy at the top of
  the editor and offer a compact top-right launcher for a typed, nested document
  outline in the right pane.
- Settings now persist independent, enabled-by-default controls for sticky
  headings, Markdown block guides and folding, and the document outline.

### Changed

- Markdown fold arrows are replaced by quiet typed guides such as `h1`,
  `list`, `raw`, and `mermaid`; activating a guide collapses its block or
  complete nested heading section without changing source. Source-code fold
  arrows remain unchanged.
- **Preview Markdown** is now **Preview Raw Text** and shows the exact,
  selectable Markdown source—including frontmatter and unrendered HTML—in the
  right pane.

### Fixed

- Windows keyboard input now uses Wails v2.14 with a pinned native-host fix and
  is left to WebView2 and CodeMirror instead of remapping Spanish physical keys
  or synthesizing dead-key output, so ordinary backticks stay single and
  AltGr+4 can compose tilded characters normally.

## 1.12.2 - 2026-08-10

### Fixed

- Updated vulnerable build/test dependencies and now rejects oversized or
  YAML ordered-map Mermaid input before the vendored parser runs, preventing
  crafted diagrams from exhausting the editor or PDF renderer.
- Windows Vim Insert mode now deduplicates delayed backtick composition at
  CodeMirror's actual DOM-change boundary, including when WebView2 omits the
  `InputEvent` text, so three physical inputs produce one Markdown code fence.

## 1.12.1 - 2026-08-08

### Fixed

- Windows Vim Insert mode now accepts WebView2's native Spanish-layout
  backtick composition, falls back when no text arrives, and repairs delayed
  composition duplicates so each resolved key inserts exactly one backtick.

## 1.12.0 - 2026-08-07

### Added

- Settings now offers an optional editor breadcrumb that shows the active
  note's vault-relative path. It is disabled by default and hides for workspace
  views and files kept outside the vault.
- Markdown `#` headings now have compact fold controls that collapse their
  complete nested section without changing the note's source or rendered
  output.

### Changed

- Document tabs now use a compact, contiguous rail with quiet inactive states,
  always-available close controls, and a clear accent along the active tab's
  top edge.
- The Properties panel now focuses on document metadata and layout settings;
  Markdown and PDF preview commands remain available from context menus.

### Fixed

- Dragging a document tab now reorders it reliably in packaged desktop
  webviews without selecting its title text or depending on inconsistent
  native HTML drag events.
- Windows Vim Insert mode now inserts one backtick from Spanish-layout dead-key
  input instead of duplicating it when WebView2 also sends delayed text.
- Up/Down and Vim visual-row movement now recover when a stale browser height
  map reports no movement, skips lines, or returns a backwards position at a
  document edge, instead of leaving the cursor stuck or wrapping around.
- Vim Visual mode now keeps its selection active and reveals fenced code source
  when `j` or `k` crosses a rendered block, even when normal rendered-block
  entry is disabled.
- Vim `p` and `P` now use text from the operating-system clipboard, synchronize
  ordinary Vim yanks and deletes back to it, and fall back to the unnamed Vim
  register whenever clipboard access is empty or unavailable.

## 1.11.1 - 2026-08-06

### Added

- Link autocomplete now offers to create a valid new note beside the current
  note when no exact same-folder target exists, then inserts the configured
  Markdown-link or Wikilink syntax without interrupting writing.

### Changed

- Spellcheck settings now explain vault-wide and per-note behavior in a compact,
  two-row information panel instead of one long paragraph.

### Fixed

- Calendar now opens to its intended height in large vaults instead of being
  squeezed by a long file tree, while both the tree and date results remain
  independently scrollable.
- Calendar empty-date guidance now uses the same compact, muted typography as
  the rest of the monthly panel.
- Bare bracket labels such as `[a link]` no longer look clickable when they
  have no reference definition; defined Markdown references remain navigable.

## 1.11.0 - 2026-08-05

### Added

- Typing a standalone hashtag now suggests saved Kanban columns in ordinary
  Markdown prose. On an unfinished checkbox task without a due date, an exact
  tag also offers the shared date picker plus Today and Tomorrow shortcuts.
- Creating or renaming a Markdown note now warns when the same folder already
  contains a name that differs only by spacing, punctuation, or capitalization,
  offering to open the existing note before an explicit create/rename-anyway
  choice.
- Vault health now separates ordinary filenames repeated across folders from
  possible duplicate notes. Cross-folder name variants are suggested only when
  their note content also strongly overlaps, and both notes open for comparison.
- Activating a missing Markdown link now offers to use a similarly named note
  from the same folder. That choice updates only the link destination, preserves
  its visible label, verifies the source and target before editing, and opens the
  existing note; creating the variant remains an explicit alternative.

### Changed

- Kanban column color controls now replace their neutral palette icon with a
  small swatch of the selected color, making the current choice visible in the
  board header.
- File-tree deletion now clearly warns that items bypass the system Trash,
  saves affected open files, and records their current contents in local Git
  history before removal; a save or archive failure leaves the item untouched.

## 1.10.2 - 2026-08-04

### Changed

- Reworked the project README into an application-focused overview with a
  current screenshot, moving development, testing, build, and release guidance
  into the contributor guide.

## 1.10.1 - 2026-08-04

### Added

- The Markdown cheatsheet now shows the portable Markdown syntax for assigning
  a due date to a Kanban task.

### Changed

- Spellcheck settings now use one Language picker with a **None** option that
  disables checking across every note, while retaining the last selected
  dictionary for later re-enabling.
- **Create today’s note** now creates the dated note inside the real `Inbox`
  folder, creating that folder when needed while continuing to open existing
  root daily notes.

### Fixed

- Properties picker options that extend beyond the expanded card now remain
  interactive instead of focusing or moving the cursor in the note beneath.

## 1.10.0 - 2026-07-31

### Added

- Kanban tasks can store a due date as a portable Markdown link, set or clear
  it from a themed keyboard-accessible calendar, and surface due work in
  Kanban, Today, and Calendar without a separate task database.

### Changed

- The workspace overview is now a Today dashboard with a safe open-or-create
  daily-note action, quick capture, Inbox items, unfinished tasks, pinned
  files and folders, recent notes, and a stable daily rediscovery suggestion.
- Unfinished tasks due today now give the persistent Kanban control a warning
  treatment and in-app count; Today also calls out due and overdue work, with
  no operating-system or background notifications.

## 1.9.0 - 2026-07-31

### Added

- Files and folders can now be pinned ahead of their unpinned siblings from the
  file-tree context menu, with a right-edge marker; a top-level `Inbox` starts
  pinned when present and can be explicitly unpinned.

### Changed

- Opening an external Markdown document now asks whether to import it before
  opening. Keeping it outside the vault adds a temporary root shortcut with a
  distinct icon; the existing Delete menu position becomes **Remove from file
  tree**, and removal never deletes or modifies the original file. Native
  file-tree drops now confirm the destination before copying, and external tabs
  become active only after their original content has loaded.
- Offline spellcheck is now disabled by default for new and missing settings.
- Notes without frontmatter now create the default properties and immediately
  show the rendered Properties panel. One stable, rotating disclosure arrow
  expands and collapses the panel, while cursor navigation into frontmatter
  still reveals the raw YAML.

### Fixed

- Vertical editor navigation and scrolling now stop symmetrically at the first
  and last document boundaries instead of a further downward move wrapping to
  the top.

## 1.8.1 - 2026-07-28

### Fixed

- Clean source checkouts now include the design-system catalogue's 32px brand
  icon, so its direct-file view and release verification do not depend on a
  previously generated local asset.

## 1.8.0 - 2026-07-28

### Added

- Settings now includes an About card showing the packaged Figaro version.
- Added a searchable design-system catalogue that displays Figaro's shared UI
  primitives, intentional feature variants, states, production selectors, and
  computed tokens across every bundled theme.

### Changed

- The Go desktop application now lives in a capability-oriented
  `internal/desktop` package, leaving the repository root as a small executable
  and embedded-asset boundary without changing Figaro workflows.
- Figaro's former monolithic application stylesheet is now an eagerly loaded,
  responsibility-based CSS stack shared with the design-system catalogue.
  Every bundled theme is a token-only override backed by a tested palette and
  art-direction contract, making theme changes consistent across components.
- Pickers, steppers, compact and icon actions, badges, menu presentation,
  fields, and notices now share tokenized production primitives, giving their
  themed interaction states one consistent implementation while preserving
  feature-specific behavior and layout.
- Figaro and its design-system catalogue now load one canonical approved
  component stylesheet; remaining Home, search, Kanban, Properties, Settings,
  and cheatsheet controls use those shared primitives instead of parallel
  presentation rules.

### Fixed

- Newly opened, selected, restored, and pinned tabs now remain fully visible in
  the horizontal tab rail. The **All tabs** menu appears only for real overflow,
  while themed edge fades show where additional tabs remain.
- Settings pickers now retain their themed focus ring while open, including
  themes that customize the Settings control surface.
- The design-system catalogue's custom-picker specimen now shows its compact
  chevron instead of an oversized black triangle.
- Design-system select-only comboboxes now use Figaro's production themed
  listbox, so their open menus follow the active theme instead of the host
  toolkit's native popup styling.
- Font-size and text-width steppers now use one continuous background across
  their minus button, current value, and plus button.
- The local catalogue and browser-test server now disables asset caching, so a
  normal reload shows current component-style changes during review.
- The design-system catalogue now loads its CSS, themes, fonts, icons, search,
  and interactive controls when `index.html` is opened directly from a file
  explorer, without requiring the local development server.

## 1.7.0 - 2026-07-25

### Changed

- Bundled editor features, language parsers, and diagram engines now initialize
  during application startup, avoiding first-use loading pauses while working.
- The Markdown cheatsheet now shows the full quoted syntax for the supported
  Note, Warning, Info, Tip, Danger, and Example admonitions.

### Fixed

- Wrapped blockquotes now keep continuation rows aligned beneath the quoted
  body in both editing and live-preview states.

## 1.6.5 - 2026-07-25

### Fixed

- Updated development-only lint and test dependencies to remove the
  `brace-expansion` denial-of-service advisory from Figaro's install audit.

## 1.6.4 - 2026-07-25

### Fixed

- Vim Normal mode in the main editor now uses each theme's block-cursor and
  cursor-text colors instead of the Vim adapter's fixed red fallback, including
  after stepping out of an interactive Markdown table.
- Vim Visual mode now remains active while moving between interactive Markdown
  table cells. In both Normal and Visual modes, `:` commands and `/` searches
  open in the document editor, so they cannot add table rows or text; searches
  cover the whole note and cancellation returns to the originating cell,
  including on WebKitGTK's legacy text-input event path.
- In Normal mode, Vim `h` and `l` now move within the active interactive table
  cell and stop at its first or final character. Visual mode retains cell-to-
  cell movement without wrapping or creating rows at table edges.
- Vim Insert mode now keeps its line caret visible at the active editing
  position inside interactive Markdown table cells.
- Interactive Markdown table cells now keep Normal and Replace cursors visible
  and report the focused nested Vim mode in the status bar.
- Vim `?` now searches backward across the whole note from a table cell, with
  the same non-mutating prompt and cancellation behavior as `/`.
- Vim and conventional undo/redo now use the document history inside table
  cells and return to the originating cell and cursor instead of jumping to
  another cell.

## 1.6.3 - 2026-07-24

### Added

- Vim users can opt into **Enter rendered blocks** so `j` and `k` reveal
  rendered Markdown source or enter the first and last table cells instead of
  skipping visual widgets.

### Fixed

- Interactive Markdown tables now show only the active cell's Vim caret rather
  than a second full-height cursor at the start of the cell.
- Vim Normal and Visual mode now use `h`, `j`, `k`, and `l` to move between
  interactive Markdown table cells.
- Vim `j` now leaves the bottom of an interactive table without appending an
  unexpected row.
- Opening and closing Settings now preserves each file's cursor selection, and
  current per-file selections are saved for the next launch.

## 1.6.2 - 2026-07-24

### Fixed

- PDF Preview now keeps a reader's newest scroll position when a preceding
  editor synchronization report is still settling.

## 1.6.1 - 2026-07-24

### Added

- Draw.io diagrams now show a themed, accessible loading indicator while the
  hosted editor opens instead of exposing a blank white buffer.

### Changed

- Draw.io follows Figaro's dark appearance while editing, while saved editable
  SVGs continue to use the light export theme for portable notes and PDFs.

### Fixed

- Windows Spanish dead keys now compose `ñ`, `ü`, and accented letters instead
  of inserting the accent immediately; Space emits the spacing accent and
  Backspace cancels it without deleting note text.

## 1.6.0 - 2026-07-24

### Added

- Added a live, themed **Markdown Preview** in the right pane, available from
  Markdown context menus and the Properties panel.
- Markdown links now suggest current-note heading fragments while typing a
  destination such as `[Jump](#heading)`.

### Fixed

- Vim Normal and Insert modes now work inside interactive Markdown table cells.
- Vim `:w`, `:q`, `:wq`, and `:x` commands are ready as soon as Vim mode is
  enabled.

## 1.5.1 - 2026-07-23

### Fixed

- Spellcheck no longer marks correctly spelled hyphenated compounds such as
  `faster-than-usual` as errors.

## 1.5.0 - 2026-07-23

### Added

- Added an enabled-by-default **Show Markdown lint** setting for turning local
  Markdown diagnostic markers on or off without changing note text.
- Added offline spellchecking with built-in English (US), English (UK), and
  Spanish dictionaries, a persistent global default, and per-note frontmatter
  overrides.
- Added conservative local spelling replacements to an editor right-click menu;
  every candidate is verified against the active dictionary, ambiguous words
  are withheld, and a chosen replacement remains undoable.
- Added a Chromium integration check that uses the real diagrams.net Save
  workflow when its hosted editor is reachable.
- Added an opt-in, metadata-only Draw.io protocol trace for development
  diagnosis; it never logs diagram contents.

### Changed

- Changed the spellcheck default-language selector to Figaro's themed,
  keyboard-accessible combobox.

### Fixed

- Wrapped bullet and numbered list items now keep continuation rows aligned
  beneath the item body in the editor.
- Draw.io saves now recover from an editor export error or a stalled export
  instead of leaving the diagram permanently in its Saving state.

## 1.4.1 - 2026-07-22

### Fixed

- Updated the development-only `brace-expansion` dependency to remove its
  high-severity denial-of-service advisory from Figaro's install audit.

## 1.4.0 - 2026-07-22

### Added

- Markdown notes now flag unclosed frontmatter or fenced code, skipped heading
  levels, and accidental trailing whitespace with local themed hover guidance
  and F8 diagnostic navigation.
- Vim users can enable persistent **Move by visual rows** to make `j`, `k`,
  and the Up/Down arrows follow wrapped display rows while retaining normal
  operator motions such as `dj`.

### Fixed

- Vim Insert mode now shows a high-contrast 4 px line caret instead of an
  opaque block that could hide the character at the insertion point.
- Markdown diagnostic hover cards now use the active Figaro theme surface
  instead of CodeMirror's white default, with readable editor-sized and padded
  diagnostic text and accent-coloured warning markers.

## 1.3.3 - 2026-07-21

### Added

- Opening a Markdown file through the desktop file association now shows an
  editable external tab that saves back to the original file and can be copied
  into the vault without overwriting an existing note.
- Dragging files or folders into an editor now lets you choose between inserting
  their paths or importing them into the vault; imported files open in a new
  active tab, while folder imports preserve their structure and keep the
  current buffer active without overwriting existing files.

## 1.3.2 - 2026-07-21

### Fixed

- Windows AltGr+4 now recognizes WebView2's `AltGraph` modifier and inserts
  `~` instead of the blank/dead character.

## 1.3.1 - 2026-07-21

### Fixed

- Closing Settings or Kanban tabs now returns you to the previously edited file tab
  instead of always jumping back to the first opened file.
- Windows AltGr+4 now inserts `~` in the editor instead of the blank/dead
  character seen on some Windows desktop webviews.

## 1.3.0 - 2026-07-18

### Changed

- Bump version number and generate binaries.
- `make release VERSION=vMAJOR.MINOR.PATCH` now includes current non-ignored
  worktree changes in its release commit instead of requiring manual cleanup,
  and rerunning the same version safely resumes a matching tagged release and
  its pushes without discarding work.
- `make release major`, `minor`, and `patch` now derive and publish the next
  stable version from the latest reachable release tag, with matching local-only
  commands and an explicit-version alternative.
- Release bumps now announce their selected tag and target version. Empty or
  malformed `Unreleased` changelog entries give clear repair steps instead of
  only a metadata error.
- Release verification now downloads Playwright's pinned Chromium without
  attempting to install operating-system dependencies or requesting a password.

## 1.4.0 - 2026-07-18

### Added

- A `make release VERSION=vMAJOR.MINOR.PATCH` command and matching
  `$prepare-figaro-release` Codex skill that verify the complete release suite,
  synchronize version metadata and the changelog, and create a local release
  commit and annotated tag before pushing `main` and that tag in order. A
  `make release-local` variant stops before publication, and the skill chooses
  publication only when explicitly asked.
- Persistent Kanban **Compact** and **Comfortable** card densities, a
  **Side by side / Stacked** column-flow choice in Settings, and a themed
  skeleton while a board is loading.
- A **Relationships** view that groups contextual backlinks with plain-text
  unlinked mentions; each mention can be linked safely in the selected
  Markdown or Wikilink style.
- A source-preserving **Compare to current** view beside each historical
  revision, with readable Markdown additions and removals before a restore.
- A read-only **Vault health** scan under Settings for missing vault-local
  links, orphaned common attachments, duplicate filenames, and unclosed YAML
  frontmatter, with findings that open their source notes.
- A heading-aware **Outline** control for Markdown notes. It opens a nested
  navigator in the right pane, follows the active section, and jumps directly
  to a selected heading.

### Changed

- Closing the final tab now leaves the centered workspace overview visible
  without creating or persisting a fake **Welcome** tab; legacy sessions are
  repaired automatically.
- Refreshed **Figaro Dark** and **Figaro Light** with a calmer fur-and-paper
  palette, framed navigation, raised reading surfaces, a deliberate collar-red
  accent, brass metadata, and matched semantic colors across both themes.
- The title bar no longer contains a workspace launcher, keeping its center
  clear for native window dragging.
- Active, open, and dirty file states now use a stronger marker, a quiet dot,
  and a low-noise local-history action. Clean files no longer expose Git
  status in the status bar; **Save to history** appears only when useful.
- File-tree and Kanban refreshes now preserve their current scroll position
  and the file tree retains keyboard focus during a structural refresh.
- Shared panel, layout, and control transitions now use a consistent 140–180
  ms timing range while retaining the reduced-motion path.
- Historical reverts now live beside the selected revision in the right-pane
  History list, commit the restored snapshot, and immediately show it as the
  latest committed version.
- The workspace overview now requests only its six unfinished Momentum cards, and Calendar reads
  pre-grouped month markers, avoiding full board payloads and all-date filters
  during ordinary navigation.
- Live PDF Preview now invalidates stale diagram and print-document work as
  soon as newer text arrives, then renders only the latest queued snapshot.
- Case-insensitive search and backlink lookups now use incrementally updated
  text and reverse-link projections, so repeated queries avoid rescanning
  unrelated notes while retaining substring, path, basename, and
  case-sensitive matching behavior.
- History now identifies versions by their date and **Latest committed** state
  instead of exposing internal Git commit hashes.
- **Auto-Commit** is now a simple on/off setting. When enabled, every
  successful save records only that file; interval and whole-vault commits are
  removed so one note's history cannot absorb another note's changes.

### Fixed

- History comparisons now span the available right-pane width without
  overlapping their controls, and collapse unchanged source into small context
  hunks around added and removed lines.
- Calendar refreshes now target the visible left-sidebar panel after a vault
  change, so an open Calendar reloads its current month correctly.
- Removed the unused legacy automation harness and its obsolete Welcome-note
  attribution.
- Saving or externally updating one Markdown note now changes only that note's
  Kanban, tag, and Calendar index contributions, keeping unrelated planning
  data in place in large vaults.
- Rapid typing now coalesces live-content notifications to the latest frame and
  updates editor word statistics shortly after typing settles, without risking
  unsaved tab content or delaying visible Kanban changes.
- Search, backlinks, Kanban, and Calendar now share one incremental vault
  index. Normal saves and external one-file edits refresh only that note, so
  navigating and typing in larger vaults stays responsive.
- Typing a Kanban hashtag now reprojects the open board directly from dirty
  editor buffers without backend calls, while collapsed folders mount their
  descendants only when opened.
- Large notes now keep live-preview decorations stable during ordinary cursor
  movement. Math, diagrams, frontmatter, links, and list widgets refresh only
  when their source or the visible/active editor region actually changes.
- Replaced the retired Python-era frontend compatibility layer with direct
  native Wails `App` bindings. Desktop controls, browser debugging, and
  frontend tests now use the same Go method names.
- Active and background file markers now update in place on mounted tree nodes
  during tab switches and dirty transitions, keeping large expanded trees
  responsive without changing collapsed-folder state.
- Figaro now projects its own saved note directly into Kanban and ignores the
  matching native watcher acknowledgement, avoiding a redundant complete-board
  reload while external Markdown edits still refresh normally.
- Vault indexing now derives tags, cards, dates, and backlinks in one document
  walk; broad search results send only a first-line preview plus the exact
  match count instead of every matching source line.
- Live PDF Preview now parses printable Markdown in a module worker before
  applying the latest document, with a safe in-thread fallback for desktop
  webviews that do not support module workers.

## 1.0.0 - 2026-07-17

### Added

- Theme-aware editor swatches and native color pickers for standalone CSS hex
  colors (`#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA`). Valid hex-shaped
  tokens take precedence over hashtags, while preview and PDF output preserve
  the original plain text.
- A persistent **Show line numbers** editor setting, disabled by default.
- A compact **Quick note** action above the file tree and in the collapsed
  sidebar rail that creates and opens collision-safe timestamped Markdown
  notes in a real `Inbox` folder, shown with a Mail icon by default.
- An active-file **Git clean / Uncommitted** status beside **Changes**. The
  highlighted state saves pending editor text and commits only that file when
  clicked, while preserving unrelated staged changes.
- An **On Save** auto-commit mode and a one-hour default interval. Manual and
  automatic saves can now immediately add the saved note to Git history.
- A non-destructive **Revert to this version** action in file history, with a
  confirmation that preserves the current contents as another Git revision.
- A PDF style reference from the preview toolbar showing the exact generated
  body HTML and its available classes and IDs for custom stylesheet authors.
- Tag-triggered GitHub releases for stable `vMAJOR.MINOR.PATCH` versions,
  publishing verified Linux amd64, Windows amd64, and universal macOS archives
  with generated release notes and SHA-256 checksums.
- Vault-wide **Links style** settings for conventional target-first Wikilinks
  or Markdown links, including preference-aware note autocomplete, safe
  existing-note conversion, open-buffer reloads, and matching editor, PDF
  preview, and export rendering.
- Interactive GFM Markdown tables powered by `codemirror-markdown-tables`,
  with `|`-triggered size completion, automatic CSV/TSV/spreadsheet paste,
  previewed selection conversion, formatting, row and column controls,
  keyboard cell navigation, cursor-safe movement, and matching rendering in
  PDF preview and export.
- Clipboard image paste for Markdown notes. Pasting a screenshot or supported
  raster image saves a collision-safe `image1`, `image2`, and so on beside the
  note, inserts portable relative Markdown, refreshes the file tree, and
  renders the image immediately in the editor, PDF preview, and export.
- Searchable Lucide icons and shared accent colors for individual files and
  folders. Appearance is stored with the vault, follows rename, move, copy,
  merge, and delete operations, and can be reset from the file-tree menu.
- Non-destructive directory drag/drop merging. When a same-named destination
  folder exists, Figaro now offers to merge recursively while retaining both
  directory trees and naming file collisions `name (copy).ext`,
  `name (copy 2).ext`, and so on.
- Figaro Light and Figaro Dark (the new default), two built-in themes derived
  from Figaro's warm ivory, black fur, and red badge palette.
- Live **PDF Preview** in the right sidebar for Markdown notes. It uses the
  same printable document structure as export, supports the selected
  frontmatter stylesheet, refreshes after Markdown or CSS edits, and exposes a
  **Generate PDF** action in the preview toolbar.
- A comprehensive bundled PDF starter stylesheet and in-app **Create starter**
  flow for note-local or shared print CSS.
- File-tree **Rename** actions for files and folders, including backlink
  rewriting, open-tab path updates, and refreshed rewritten links.
- Internal file-tree **Copy/Paste** for files and complete folders, including
  keyboard shortcuts, dirty-source persistence, link-aware copied Markdown,
  non-overwriting `copy` names, and actionable recursive-folder-copy refusal.
- Regression coverage for PDF styling, live preview, file creation, rename,
  session repair, and Linux desktop integration.
- `ARCHITECTURE.md`, a decision-oriented reference for non-obvious subsystem
  boundaries, including the PDF preview security model and message protocol.
- Machine-local desktop window-state persistence across Linux, macOS, and
  Windows. Figaro restores the last normal size and maximized state while
  deliberately centering every launch and never restoring minimized state or
  screen coordinates.

### Changed

- Figaro is now distributed under the GNU General Public License version 3 or
  later. Release archives include the license and changelog beside the app.
- Auto-save, auto-commit, and table-import dropdowns now use the same themed,
  keyboard-accessible combobox styling as the rest of Figaro.
- The editor's 100% text size is now ten percent smaller, while retaining the
  full Settings adjustment range around the new baseline.
- The file tree now gives background open notes a subtle marker distinct from
  the stronger active-note marker.
- The Markdown cheatsheet places Wikilinks directly after Markdown links and
  documents the complete `[[wikilink.md|wikilink]]` syntax.
- Updated the lint and test toolchain so clean npm installs no longer emit
  deprecated-package warnings, without changing application dependencies.
- The Links style setting now uses a fully themed, keyboard-accessible
  combobox instead of a platform-native dropdown.
- Kanban reflects hashtags from unsaved editor buffers without forcing a save,
  and keeps long cards compact while preserving their full text on hover.
- Calendar and Kanban now live in a fixed footer below the file tree. Calendar
  expands inline, Kanban and the title-bar Settings gear open, focus, or close
  their single workspace tabs with short entrance and exit transitions, and
  collapsing the sidebar leaves a 44px navigation rail.
- Widening PDF Preview now adds space around a centered paper surface instead
  of stretching its contents. The preview caps itself to the stylesheet's
  named, oriented, or explicit `@page size`, with A4 as the fallback.
- The frameless application window now has a theme-aware one-pixel highlight
  around all four rounded edges, with slightly stronger contrast along the top
  to make the custom window boundary feel more native without becoming a
  visible frame.
- All application dialogs now share a polished responsive shell, consistent
  icon and tone language, clearer action hierarchy, focus containment and
  restoration, reduced-motion support, and cross-theme contrast. Browser-style
  alerts have been replaced by in-app error messages.
- File and folder rename now uses a dedicated contextual dialog with the
  current location, file-stem selection, inline name validation, an unchanged
  state guard, and link-update guidance. Merge, overwrite, unsaved-change, PDF
  recovery, creation, and Kanban dialogs received the same UX pass.
- The PDF preview splitter can now use substantially more of the workspace
  while preserving a 320 px editor floor. When the editor becomes narrow its
  decorative horizontal padding contracts, then restores automatically.
- PDF preview/editor scroll synchronization pauses while the splitter moves
  and performs one editor-to-preview alignment after resize events settle,
  eliminating reflow-driven resize jitter without losing line-level sync.
- Manually selected PDF browsers now live in cross-platform machine-local
  settings instead of the vault. Existing vault preferences migrate once, and
  a browser is accepted only after its real isolated headless DevTools engine
  starts successfully.
- Figaro Dark now replaces Default Dark without changing saved `default`
  preferences; both Figaro themes received richer paper, fur, collar, and
  brass-inspired surface treatments.
- Rebuilt all packaged application icons from the cleaned Figaro badge asset,
  including Wails, webview, favicon, Windows, and desktop-shell sizes.
- Markdown context menus now offer **Preview PDF**; PDF generation remains an
  explicit action inside the preview pane.
- PDF preview now applies the selected stylesheet after its screen-only
  geometry, preserves relative scroll position across live refreshes, syncs
  scroll position with the active Markdown note, and keeps in-document
  fragment links inside the preview.
- PDF preview/editor scroll synchronization now coalesces rapid updates at a
  bounded cadence, preserving the final position without making the printable
  frame pay for a cross-frame update on every display refresh.
- Preview/editor scrolling now maps around generated cover and table-of-
  contents sections, keeping Markdown source positions aligned with the
  printable document body.
- Double-clicking the non-interactive area of the custom title bar now toggles
  native maximize/restore, matching normal desktop-window behavior.
- The Properties panel now names the PDF setting **Table of Contents** and
  keeps Properties/frontmatter controls on a stable single-line layout.
- New file creation starts with `Untitled.md` in the input. Names without an
  extension receive `.md`; explicitly entered extensions such as `.css` and
  `.js` are preserved.
- Linux desktop integration refreshes its launcher and icon assets on startup,
  and the native Wails window now uses Figaro's bundled icon.
- Settings now receive recoverable defaults at startup, while workspace state
  is normalized from the dedicated session file.
- PDF preview and export now render the six supported quoted callouts—Note,
  Warning, Info, Tip, Danger, and Example—with stable styling hooks and
  starter-stylesheet color controls.

### Fixed

- The active file's **Uncommitted** action now returns immediately after a new
  edit following an explicit commit, while keeping the tab's dirty marker in
  sync.
- Notes with no backlinks now return and display a normal empty result instead
  of emitting a misleading **Failed to load backlinks** error; genuine lookup
  and response failures remain visible in the logs.
- Linux startup and shutdown no longer query native window state before GTK
  realises the window or after teardown begins, avoiding GTK/GDK critical
  assertions in terminal output.
- Linux desktop launchers now reference a stable icon identity while Figaro
  continues refreshing content-versioned assets, restoring the Dash icon.
- Editor context menus now reposition above and to the left near viewport
  edges instead of being clipped off-screen.
- File and folder appearance dialogs now show the styled entry's name only
  once.
- Packaged desktop startup, including Linux under C/POSIX locales, once again
  connects to the vault and displays the file tree, Welcome workspace, note
  text, and interactive Calendar.
- Wikilink aliases now open their actual vault targets, and link-preview
  tooltips no longer intercept clicks.
- Rapid file-tab switching no longer saves the visible document into the wrong
  tab or lets a delayed document replacement overwrite the tab switched back
  to.
- Linux WebKitGTK screenshot paste now recovers image bytes when paste events
  omit the file or its MIME metadata, while ordinary text paste still falls
  through unchanged.
- Shift+Tab now moves backward through interactive Markdown table cells in
  WebKitGTK instead of moving focus out of the editor.
- The packaged WebKitGTK editor now initializes its lazily loaded indentation
  markers without a shorthand-assignment error that could leave the workspace
  controls visible but prevent notes from opening.
- Destructive confirmations now identify the exact consequence, use explicit
  labels, and focus Cancel first. Text-entry and merge dialogs no longer lose
  work from an accidental backdrop click, and every modal traps focus and
  returns it to the invoking control when closed.
- Chrome, Chromium, Edge, and Brave detection no longer relies on a separate
  `--headless --version` probe, whose launcher behavior could produce opaque
  Windows errors despite a valid executable. Validation now uses the same CDP
  startup as export, reports launch-stage output, and falls back to automatic
  discovery when a saved executable becomes unavailable.
- Chromium startup no longer forces `--disable-extensions`; the isolated
  temporary profile provides separation without conflicting with managed
  browser policy.
- PDF preview no longer couples the application to a sandboxed iframe DOM.
  A fixed local bridge handles links and scrolling by validated messages, so
  external URLs, footnote returns, and vault links cannot replace the preview
  with a cross-origin or filesystem document.
- Active title-bar actions now draw from the current theme's accent color
  instead of a fixed blue, and the reading-time indicator explicitly says
  “min read”.
- Linux startup now removes stale Figaro launcher icons, writes a content-
  versioned icon path, and refreshes the desktop caches so Fedora and GNOME do
  not retain a previous icon after an upgrade.
- Right-clicking empty file-tree space now opens vault-root actions.
- Preview-only white paper styling no longer overrides a user stylesheet's
  `html` background or inherited text color.
- File-tree vault-root actions remain available below short file lists, rather
  than only within the rendered file rows.
- Editor context menus preserve a selection when right-clicking inside it.
- File-tree context menus now retain one consistent action list; actions that
  do not apply to the target are shown disabled.
- Editor context-menu Copy and Cut now copy the explicit CodeMirror selection
  through the Clipboard API, with a legacy webview fallback.
- The bundled PDF stylesheet now ends with a clear personal-overrides section,
  and the styling guide explains that background overrides must follow earlier
  body or cover rules in the CSS cascade.
- The PDF starter now exposes top-level Quick theme variables for page, cover,
  and text colors, avoiding selector-order concerns for normal theming.
- Ctrl/Cmd+F now opens CodeMirror's native in-document find panel, with match
  navigation and case-sensitive, whole-word, and regular-expression options.
- Vim `:wq` and `:x` now wait for the current buffer to save successfully
  before closing its tab; Vim `/`, `n`, and `N` search behavior now has
  regression coverage as well.
- The Vim preference now applies during startup—even when Home opens before
  the editor exists—and the Settings switch, live mode, persisted value, and
  subsequent application runs remain synchronized.
- The in-document find panel now uses Figaro's themed colors throughout, with
  readable option labels, styled checkbox states, and clearer focus feedback.
- The in-document find panel now uses roomier, more readable inputs and
  controls, making better use of its available space without adding clutter.
- PDF generation now captures and saves the exact previewed Markdown and CSS
  snapshot before rendering, including edits made immediately before clicking
  **Generate PDF**.
- Missing, blank, malformed, or stale session data no longer restores phantom
  tabs; Figaro repairs the record and opens Welcome when no valid workspace
  remains.
- Legacy workspace-tab keys are removed from `settings.json`.

[Unreleased]: https://github.com/grilo/figaro/compare/v1.32.1...HEAD
[1.32.1]: https://github.com/grilo/figaro/compare/v1.32.0...v1.32.1
[1.32.0]: https://github.com/grilo/figaro/compare/v1.31.0...v1.32.0
[1.31.0]: https://github.com/grilo/figaro/compare/v1.30.0...v1.31.0
[1.30.0]: https://github.com/grilo/figaro/compare/v1.29.0...v1.30.0
[1.29.0]: https://github.com/grilo/figaro/compare/v1.28.2...v1.29.0
[1.28.2]: https://github.com/grilo/figaro/compare/v1.28.1...v1.28.2
[1.28.1]: https://github.com/grilo/figaro/compare/v1.28.0...v1.28.1
[1.28.0]: https://github.com/grilo/figaro/compare/v1.27.0...v1.28.0
[1.27.0]: https://github.com/grilo/figaro/compare/v1.26.0...v1.27.0
[1.26.0]: https://github.com/grilo/figaro/compare/v1.25.2...v1.26.0
[1.25.2]: https://github.com/grilo/figaro/compare/v1.25.1...v1.25.2
[1.25.1]: https://github.com/grilo/figaro/compare/v1.25.0...v1.25.1
[1.25.0]: https://github.com/grilo/figaro/compare/v1.24.1...v1.25.0
[1.24.1]: https://github.com/grilo/figaro/compare/v1.24.0...v1.24.1
[1.24.0]: https://github.com/grilo/figaro/compare/v1.23.2...v1.24.0
[1.23.2]: https://github.com/grilo/figaro/compare/v1.23.1...v1.23.2
[1.23.1]: https://github.com/grilo/figaro/compare/v1.23.0...v1.23.1
[1.23.0]: https://github.com/grilo/figaro/compare/v1.22.0...v1.23.0
[1.22.0]: https://github.com/grilo/figaro/compare/v1.21.1...v1.22.0
[1.21.1]: https://github.com/grilo/figaro/compare/v1.21.0...v1.21.1
[1.21.0]: https://github.com/grilo/figaro/compare/v1.20.1...v1.21.0
[1.20.1]: https://github.com/grilo/figaro/compare/v1.20.0...v1.20.1
[1.20.0]: https://github.com/grilo/figaro/compare/v1.19.0...v1.20.0
[1.19.0]: https://github.com/grilo/figaro/compare/v1.18.1...v1.19.0
[1.18.1]: https://github.com/grilo/figaro/compare/v1.18.0...v1.18.1
[1.18.0]: https://github.com/grilo/figaro/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/grilo/figaro/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/grilo/figaro/compare/v1.15.1...v1.16.0
[1.15.1]: https://github.com/grilo/figaro/compare/v1.15.0...v1.15.1
[1.15.0]: https://github.com/grilo/figaro/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/grilo/figaro/compare/v1.13.1...v1.14.0
