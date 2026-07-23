# Changelog

All notable user-facing changes are recorded here from this point forward.

## Unreleased

_No changes yet._

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
