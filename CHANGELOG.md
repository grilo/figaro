# Changelog

All notable user-facing changes are recorded here from this point forward.

## Unreleased

### Added

- Interactive GFM Markdown tables powered by `codemirror-markdown-tables`,
  with `|`-triggered size completion, automatic CSV/TSV/spreadsheet paste,
  previewed selection conversion, formatting, row and column controls,
  keyboard cell navigation, cursor-safe movement, and matching rendering in
  PDF preview and export.
- Clipboard image paste for Markdown notes. Pasting a screenshot or supported
  raster image saves a collision-safe `image1`, `image2`, and so on beside the
  note, inserts portable relative Markdown, refreshes the file tree, and
  renders the image immediately in the editor, PDF preview, and export.
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
