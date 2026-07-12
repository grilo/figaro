# Changelog

All notable user-facing changes are recorded here from this point forward.

## Unreleased

### Added

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
- Regression coverage for PDF styling, live preview, file creation, rename,
  session repair, and Linux desktop integration.

### Changed

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

### Fixed

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
