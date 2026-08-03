<p align="center">
  <img src="figaro.appicon.png" width="112" alt="figaro logo">
</p>

<h1 align="center">figaro</h1>

<p align="center">
  A local-first Markdown workspace for notes, tasks, diagrams, and beautiful printable documents.
</p>

<p align="center">
  Your knowledge stays in ordinary files, in a folder you control. No account, cloud service, or proprietary database required.
</p>

> **Figaro** is a desktop personal knowledge manager designed to make a plain-folder vault feel focused, capable, and pleasant to use.

## Why figaro?

figaro combines the durability of plain Markdown with a desktop workspace that helps you write, navigate, plan, and publish without putting your notes behind a service.

- **Own your data.** Notes, images, source files, editable diagrams, settings, and history live in your local vault.
- **Write without leaving the flow.** Markdown is rendered live, while the active line remains ordinary source text for precise editing.
- **Turn notes into action.** Hashtags become a drag-and-drop Kanban board; date links feed a calendar; links produce backlinks.
- **Ship polished documents.** Frontmatter can add a cover page, table of contents, and a note-specific print stylesheet before an interactive PDF export that preserves links and references.

## Highlights

| Write | Organize | Visualize and share |
| --- | --- | --- |
| Live Markdown preview with tables, task lists, callouts, footnotes, math, images, and internal links | Vault file tree, tabs, global search, backlinks, date-aware calendar, and persistent sessions | Mermaid, Vega, Vega-Lite, editable Draw.io SVGs, and interactive PDF export |
| CodeMirror-powered editing for Markdown and supported source files such as CSS, JavaScript, JSON, Go, Python, Rust, SQL, YAML, and more | Quick notes in a real Inbox, hashtag-driven Kanban with portable due dates, and local Git history with automatic or explicit commits | Cover pages, depth-limited tables of contents, and vault-local print stylesheets |
| Optional Vim mode, language-aware syntax highlighting, folding, completion, and theme-aware indent guides | Drag-reorderable and pinnable tabs plus a Today dashboard for daily notes, Inbox review, tasks, pins, recent notes, and rediscovery | Seventeen built-in themes, including Figaro Light and Figaro Dark, plus separate prose/code font pickers, font size and reading-width controls |

## A workspace built around plain files

Every vault is an ordinary directory. Markdown remains Markdown, images remain image files, code remains code, and Draw.io diagrams are saved as editable `.drawio.svg` files. figaro stores vault-specific settings and workspace state in `.config/` inside the vault, rather than converting your notes into a database. Device-specific window state and the selected PDF-browser executable are kept separately in the operating system's per-user local application-data directory, so syncing or moving a vault cannot carry one computer's window geometry or installed-software paths to another.

Opening a `.md` file through the desktop file association asks whether to import it when it is outside the selected vault. Importing creates and opens a collision-safe vault copy. Choosing **Keep outside vault** opens the original in an editable external tab and adds a temporary root shortcut to the file tree with a distinct symlink-file icon; saving still writes to that exact original with normal conflict protection, while search, recent notes, Kanban, Calendar, Git history, and saved workspaces continue to ignore it. The normal final **Delete** menu position becomes **Remove from file tree** for that shortcut and clearly warns that removal never deletes or modifies the original. Dropping files or folders from the operating system onto a file-tree folder or the vault root asks before copying them into that destination and explains that their originals remain untouched. Dropping them into an editor buffer instead asks whether to insert their paths into the note or import them. A successful file import opens that file in a new active tab; folder imports are recursive with their structure intact and leave the current buffer active. An external tab is selected only after its original content has loaded, so a failed read cannot leave another note visible beneath the external tab title. Existing vault content is never overwritten, and cancelling changes nothing.

Open tabs use a horizontally scrolling rail that always brings the active tab
fully into view when it is opened, selected, restored, or pinned. Subtle themed
edge fades show when more tabs lie to either side, while the keyboard-accessible
**All tabs** menu appears only when the rail actually overflows.

**Figaro Dark** and **Figaro Light** are companion themes: midnight fur and quiet ivory paper share the same collar-red moments of intent, brass metadata, and calm semantic colors. Their darker/lighter navigation frame, raised reading surface, tactile Settings cards, and fine collar stitch distinguish the workspace without competing with notes.

Paste a screenshot or other raster image from the clipboard directly into an open Markdown note. Figaro saves it beside the note as `image1.png`, `image2.png`, and so on, inserts portable Markdown such as `![Image1](image1.png)`, and renders it immediately. Existing files are never overwritten, and the same action is available through Ctrl/Cmd+V or the editor context menu.

The file tree supports internal Copy/Paste for files and complete folders through its context menu or Ctrl/Cmd+C and Ctrl/Cmd+V while the tree is focused. Paste saves dirty source tabs first, and repeated or same-folder pastes never overwrite content: Figaro creates `Folder copy`, `Folder copy 2`, or `note copy.md`. Links inside copied Markdown are adjusted so internal links follow copied counterparts and links leaving the copied tree still reach their original vault targets; incoming links elsewhere continue to point at the source. A folder cannot be pasted into itself or one of its descendants, and the refusal dialog directs you to select its parent for a sibling copy. When an internal move or native filesystem drop meets an existing same-named directory, Figaro asks whether to merge the contents instead of replacing anything. A confirmed merge keeps both trees and names file collisions `note (copy).md`, `note (copy 2).md`, and so on; cancelling leaves both directories untouched. Renaming uses a contextual dialog that shows the current folder, selects only a file's editable stem, validates the name in place, and explains that affected links are updated automatically.

Right-click any file or folder and choose **Pin** to keep it ahead of its unpinned siblings; a pin marker stays at the row’s right edge. Pin state is stored with the vault and follows rename, move, copy, merge, and delete operations. A top-level `Inbox` is pinned by default when it exists, but **Unpin** is always available and persists that choice. **Customize appearance…** assigns a searchable Lucide icon and one of the Kanban accent colors to an editable entry. The picker keeps the ten most recently used icons close at hand and includes **Reset** to restore Figaro's defaults. Appearance follows the same path operations. The active file has the strongest tree marker; other open files retain a quieter marker; unsaved tabs use a compact accent dot. Those markers update in place during tab switches and edits, so large expanded trees do not need a full DOM rebuild. The top-level `Inbox` also uses a Mail icon until you customize it.

The default vault is `./vault`. Point figaro at another location with the `VAULT_PATH` environment variable:

~~~bash
VAULT_PATH="$HOME/Documents/notes" make dev
~~~

On first launch, an empty vault receives a welcome note with examples and a short getting-started guide.

### Desktop window state

figaro remembers the window's last normal width and height and whether it was maximized. It deliberately does not remember screen coordinates: every launch is centered by the native Wails window backend, avoiding an unreachable frameless window after a monitor is disconnected or its layout changes. Minimized, fullscreen, and incomplete transition states are never restored; closing while minimized retains the last meaningful normal or maximized state.

The custom frameless window uses a quiet one-pixel outline around all four edges, with a slightly stronger top highlight. The outline follows the rounded application corners and adapts to the active theme without interfering with native edge resizing.

The default normal size is `1280 × 800`, and restored dimensions are clamped to the application's `800 × 500` minimum. A missing, malformed, unsupported, zero/negative, or implausibly large state record falls back to the safe default. Window state is stored outside the vault at:

- Linux: `$XDG_CONFIG_HOME/figaro/window-state.json`, or `$HOME/.config/figaro/window-state.json` when `XDG_CONFIG_HOME` is unset.
- macOS: `$HOME/Library/Application Support/figaro/window-state.json`.
- Windows: `%LocalAppData%\figaro\window-state.json`.

If the platform cannot provide or write its local application-data directory, figaro remains usable with the safe defaults but cannot persist the changes for the next launch.

### Machine-local browser selection

PDF export normally discovers an installed Chrome/Chromium-family browser automatically. If needed, choose a specific executable under **Settings → PDF Export → Browser engine**. figaro verifies the choice by starting its real headless PDF engine with an isolated temporary profile; a matching filename or version response alone is not accepted. If a configured browser is later moved, removed, or cannot start, export falls back to automatic discovery.

The selected executable is device-specific and is stored outside the vault in `machine-settings.json`: beside `window-state.json` under `$XDG_CONFIG_HOME/figaro` (or `$HOME/.config/figaro`) on Linux, `$HOME/Library/Application Support/figaro` on macOS, and `%LocalAppData%\figaro` on Windows. Existing vault-scoped browser selections are migrated once; an existing machine-local choice takes precedence.

### Search, planning, and history

**Quick note** creates an empty, collision-safe timestamped Markdown file in a real `Inbox` folder, opens it, and places focus in the editor. The action sits above the file tree and remains available as an icon in the collapsed sidebar rail, making it suitable for an ad-hoc thought without first choosing a title or location.

The sidebar search finds both note names and Markdown body text. It supports title-only, recent-notes, and case-sensitive filters, plus keyboard navigation. Use Ctrl/Cmd+F for fast in-document find, including case-sensitive, whole-word, and regular-expression matching. Search, backlinks, Kanban, and Calendar share an in-memory vault index, so normal saves and single-file external edits replace only that note's source and planning contributions instead of rebuilding unrelated vault data. The index maintains folded-text terms for fast case-insensitive substring search, reverse backlinks by target path and basename, and pre-grouped Calendar days by month; case-sensitive searches continue to compare the original text. Search returns each note's first matching line and exact match count, avoiding oversized results for common terms. Unsaved Kanban changes update directly from the editor buffer, while a Figaro save updates the local board snapshot without waiting for the watcher to reload it; collapsed folders defer building their descendants until you open them. Calendar and Kanban stay in a fixed footer below the file tree: Calendar expands inside the sidebar, while Kanban opens or returns to its single workspace tab. Kanban density and column flow are persistent Settings preferences, and card/column position is kept while cards refresh. Choosing **Stacked** makes the board scroll vertically as one page. Clicking an already active Kanban button closes that view with a short exit transition. When the sidebar is collapsed those controls and Quick note remain available in a narrow tool rail. Settings is the gear beside the window controls and follows the same animated open, focus, and close behavior; its **About** card shows the exact packaged Figaro version for support and troubleshooting. The Calendar highlights daily notes named `YYYY-MM-DD.md` and notes that link to them; date links open a workspace results tab. The un-tabbed **Today** dashboard safely opens or creates `Inbox/YYYY-MM-DD.md`, creating the real Inbox folder when needed; an existing root daily note still opens for compatibility. It also exposes Quick note and recent Inbox captures, and keeps up to six unfinished tasks, vault pins, recent notes, and one stable daily rediscovery suggestion close at hand. It derives those small collections from the existing tree and requests only the bounded task projection rather than loading the complete board.

Kanban cards can set or clear a date from their calendar control. Figaro writes that deadline on the task's own Markdown line—for example, `- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)`—so the note remains portable, searchable, Git-visible, and linked to the matching daily note. The status bar's **md cheatsheet** keeps this complete task due-date pattern beside the normal task syntax for quick reference. Due and overdue work is called out inside Today; Calendar marks due-task days and lists their source lines. When unfinished work is due today, the persistent Kanban icon, label, and count use the warning treatment even with the sidebar collapsed. Reminders stay inside Figaro: the application does not request operating-system notification permission or run a background reminder service.

**Relationships** expands the familiar backlink view into two quiet sections: notes that already link to the current note and plain-text mentions that do not. Each result includes nearby context. **Link this mention** changes only the selected plain-text occurrence, saves any open Markdown buffers first, and uses the active Markdown/Wikilink preference; existing links and fenced code are left alone.

**Outline** appears quietly in the status bar only when the active Markdown note has headings. It opens a nested heading navigator in the same right pane used by History, Markdown Preview, and PDF Preview, highlights the section at the cursor or reading position, and moves the editor directly to a selected heading. Switching notes or opening another right-pane view closes it cleanly.

**Auto-Save** writes the active dirty file on the interval you choose. **Auto-Commit** is a single on/off safety toggle: when enabled, every successful save records only that saved file. There is no interval scheduler and Figaro never auto-commits the whole vault, so a note’s restore history cannot collect another note’s changes. The status bar stays focused on the document: a **Save to history** action appears only when the active file has a version waiting to be recorded, then disappears again. Clicking it safely saves pending editor text and records only that file without disturbing unrelated staged changes. The adjacent **Changes** count opens file history. History identifies versions by their date and latest-state marker rather than exposing Git hashes. Selecting an older revision makes the editor read-only and offers **Compare to current** for a full-width, source-preserving Markdown diff that keeps only changed lines and a little surrounding context before **Revert to this version**. Reverting first preserves the current content, then commits the restored version and refreshes History with that new latest commit.

Under **Settings → Vault care → Review…**, **Vault health** runs a read-only scan for missing vault-local links, orphaned common attachments, duplicate filenames, and frontmatter opened with `---` but never closed. It ignores external URLs, email links, and fenced code. Findings open their reported source note; the scan never edits, renames, or deletes a file.

## Markdown, diagrams, and PDFs

### Markdown and code

figaro has a source-first live preview: move onto a line to edit its Markdown exactly as written; move away to read the rendered result. It supports headings, emphasis, strikethrough, highlights, task checkboxes, links, callouts, tables, images, KaTeX math, footnotes, blockquotes, and fenced code blocks. Large notes remain responsive because normal cursor movement preserves unaffected preview decorations and interactive widgets are limited to the visible editor region; word statistics settle shortly after a rapid typing burst while dirty content remains immediately safe to save. Markdown notes receive local, non-destructive diagnostics for unclosed frontmatter or code fences, skipped heading levels, and accidental trailing whitespace; hover a squiggle for the fix and press F8 to move to the next issue. They are on by default and can be disabled with **Settings → Markdown diagnostics → Show Markdown lint**. Offline spellcheck is off by default: **Settings → Spellcheck → Language** offers **None** to disable it across every note, or English (US), English (UK), and Spanish (Spain) to enable a global fallback; it never sends note text to a service. Correctly spelled hyphenated compounds such as `faster-than-usual` remain unmarked. Right-click an underlined unknown word to choose a local high-confidence replacement; every suggestion is verified against the active dictionary, while ambiguous words deliberately show no replacement. The change is a normal undoable edit. Wrapped bullet, numbered-list, and blockquote text uses a hanging indent beneath its item or quoted body. The optional editor gutter is controlled by **Settings → Show line numbers** and is off by default. Standalone CSS hex colors display a theme-aware swatch and native picker; valid hex-shaped tokens take precedence over hashtags while the source and PDF text remain unchanged. Markdown tables use `codemirror-markdown-tables` for interactive cell editing, formatting, Arrow-key movement, Tab/Shift+Tab navigation, Vim modal editing, and row/column controls. Their alignment and structure are preserved in the live PDF preview and generated PDF.

On Windows Spanish layouts, dead keys keep their normal composition behavior:
AltGr+4 then `n` makes `ñ`, the diaeresis key then `u` makes `ü`, and acute,
grave, and circumflex accents combine with their matching letters. Press Space
for the standalone accent or Backspace to cancel it without changing the note.

Vim Normal mode uses each theme's block-cursor and cursor-text colors instead of the adapter's fixed fallback red, including after returning from an interactive table to the document. Insert mode uses a visible 4 px line caret, and `:w`, `:q`, `:wq`, and `:x` are ready as soon as Vim mode is enabled. Under **Settings → Vim Mode**, enable **Move by visual rows** to make `j`, `k`, and Up/Down follow wrapped display rows; it is disabled while Vim itself is off and retains normal source-line semantics for operators such as `dj`. **Enter rendered blocks** is a separate, off-by-default Vim preference: `j` and `k` reveal rendered block source, while tables enter their first or last interactive cell instead of being skipped.

Vertical movement and scrolling stop at the first and last document boundaries:
Arrow Up/Down, Vim `j`/`k`, and wheel or trackpad input never wrap to the
opposite end. Explicit navigation commands such as Home, End, `gg`, and `G`
remain available for intentional jumps.

Under **Settings → Links style**, choose Markdown links such as `[Welcome](Welcome.md)` (the default) or conventional target-first Wikilinks such as `[[Welcome.md|Welcome]]`. Note autocomplete follows that preference. In Markdown links, typing a fragment such as `[Jump](#point` suggests headings from the current note, including duplicate-heading suffixes; frontmatter and fenced-code examples are ignored. Changing the preference always asks whether to rewrite links, keep existing syntax, or cancel; a rewrite touches only links that resolve to existing Markdown files in the vault, reloads affected open notes, and leaves external URLs, email addresses, images, code, and unresolved links unchanged.

#### Tables

Type `|` on an empty line and choose a 2×2, 3×3, or 4×4 table. Existing GFM
pipe tables become interactive automatically when opened. To convert existing
CSV, TSV, or consistently pipe-delimited text, select it, right-click, and
choose **Convert selection to table…**; Figaro previews the detected delimiter,
dimensions, header choice, and resulting Markdown before replacing anything.

Normal paste also recognizes clear tabular clipboard data. Content copied from
a spreadsheet or HTML table, tab-separated rows, pipe-delimited rows, and
unambiguous CSV is inserted directly as a Markdown table through Ctrl/Cmd+V or
the existing **Paste** context-menu action. There is no separate paste mode;
ordinary prose and inconsistent rows remain ordinary text, while existing GFM
tables keep their separator and alignment with safe surrounding boundaries.

Click a cell to edit it. Arrow keys move within the table, Tab and Shift+Tab
move between cells, Enter moves down a column and adds a row at the bottom, and
Shift+Enter creates a line break inside a cell. Click or drag the row, column,
and table-edge handles to sort, align, add, move, duplicate, clear, delete, or
resize table content. When Vim mode is on, cells use the same modal controls as
the surrounding Markdown note. The status bar follows the focused cell's
Normal, Insert, Visual, or Replace state, and each mode keeps its cursor visible
at the nested editing position. In Normal mode, `h` and `l`
move one character within the cell and stop at its first or final character;
`j` and `k` move between table rows. Visual `h`, `j`, `k`, and `l` move between
cells, while Insert mode remains text entry. The Insert-mode line caret stays
visible at the exact editing position inside the active cell.
Visual `h` and `l` stop at the current row's first and last columns without
wrapping or creating rows, and `j` leaves the table's bottom edge without
adding a row. Leaving either table edge restores the document's themed Normal
block cursor. Visual cell transitions retain Visual mode. In both Normal and
Visual modes, `:` opens Vim's document command bar, `/` searches the whole note
forward, and `?` searches it backward without changing the table's rows.
Cancelling a prompt returns focus to the originating cell. Vim `u`/Ctrl+R and
the ordinary undo/redo shortcuts operate on the whole Markdown document and
restore the same cell and cursor instead of jumping to another cell.

Files recognised by CodeMirror's language registry open in the same editor as proper code files, with syntax highlighting, folding, completions, Vim support, and indentation guides. Unsupported or binary files stay safely non-editable in the file tree.

### Diagrams

Use fenced blocks for live Mermaid, Vega, and Vega-Lite output:

~~~~markdown
~~~mermaid
flowchart TD
  Idea --> Draft --> Publish
~~~

~~~vega-lite
{
  "data": { "values": [{ "month": "Jul", "notes": 12 }] },
  "mark": "bar",
  "encoding": {
    "x": { "field": "month", "type": "nominal" },
    "y": { "field": "notes", "type": "quantitative" }
  }
}
~~~
~~~~

Create a Draw.io diagram from the File Tree context menu. figaro opens diagrams.net for editing and saves a self-contained `.drawio.svg` file. While the hosted editor connects, Figaro keeps a themed loading panel over the canvas rather than showing a blank white buffer. On a dark Figaro surface, diagrams.net opens in its dark editing appearance; saving still requests a light SVG export so the diagram remains portable and predictable in notes and PDFs. Once saved, that SVG continues to render normally in notes even when you are offline; only opening the Draw.io editor needs a connection to diagrams.net. If its export reports an error or does not return within 30 seconds, Figaro clears the Saving state, explains the failure, and lets you use **Save** again.

### Properties and interactive PDF export

Leading YAML frontmatter is presented as a compact Properties card. Its disclosure arrow expands and collapses the structured panel from the same left-edge position. Picker menus remain interactive when their options extend beyond the card, without passing hover or clicks into the Markdown beneath. A note without frontmatter keeps a subtle **Add properties** block; expanding it inserts the default YAML skeleton and immediately shows the rendered panel instead of placing the cursor in raw YAML. Moving the editor cursor into any frontmatter still reveals its portable source. Frontmatter can control document metadata and the printable layout without changing your Markdown body:

~~~yaml
---
title: "Quarterly review"
subtitle: "What changed and what comes next"
author: "Ada Lovelace"
date: 2026-07-12
cover-page: true
toc-depth: 2
# Optional: choose Create starter in PDF layout first.
print-stylesheet: "pdf.css"
# Optional: override the global spellcheck language for this note.
spellcheck: en-GB
---
~~~

- `cover-page: true` creates one title page.
- `toc-depth` accepts `0` through `6`; `0` disables the table of contents.
- `print-stylesheet` selects a vault-local CSS file relative to the note and takes precedence over a sibling `_print.css`.
- `spellcheck` accepts `en-US`, `en-GB`, or `es`; `false` disables checking for this note. Omitting it inherits **Settings → Spellcheck**. A mixed-language note may use `spellcheck: [en-GB, es]`.
- Footnotes such as `[^source]` print as numbered links to a final Footnotes section, with links back to each reference.
- Mermaid, Vega, and Vega-Lite blocks are rendered to inline SVG for the printed document.

PDF exports use a polished built-in style by default. To customize one, choose **Create starter** in the Properties panel's **PDF layout** section. Figaro proposes a note-local `pdf.css`, copies its comprehensive editable example only after you confirm, selects it for the note, and opens it. It never creates stylesheets during startup or export, and it never overwrites an existing CSS file. See [PDF styling](docs/PDF_STYLING.md) for the stable selectors, page-layout guidance, and the distinction between document headings and unsupported repeated page headers/footers.

Choose **Preview Markdown** from a Markdown file's file-tree or editor context menu, or the Properties panel. It opens a live, themed rendering of the current note in the right pane and refreshes as the note changes. This preview deliberately uses normal Markdown rendering rather than PDF page geometry, print stylesheets, cover pages, or table-of-contents generation; the existing `.md` note remains the portable source, so no duplicate Markdown export is needed.

Choose **Preview PDF** from a Markdown file's context menu, editor context menu, or the Properties panel. Figaro opens a live, isolated preview in the right pane and refreshes it shortly after Markdown or the selected CSS stylesheet changes. Newer edits invalidate stale diagram and print work immediately, so a rapid burst renders only its final snapshot; printable Markdown parsing runs in a module worker when available, keeping the editor input path clear while retaining a compatible fallback. The code icon in its toolbar opens **Figaro PDF style reference**, listing every class and ID in the current printable document alongside the generated body HTML, with a one-click copy action. Drag the splitter to make the preview pane wider: it can grow until the editor reaches a 320 px working width, while the paper remains centered and capped to its `@page size` instead of stretching with the pane. Named A3/A4/A5, B5, Letter, Legal, Ledger/Tabloid, and Executive sizes, portrait/landscape orientation, and explicit CSS lengths are reflected in the preview; A4 is the fallback. The editor's decorative side padding contracts when space is tight. Editor/preview line synchronization is paused during the drag and aligned once after release, preventing resize jitter while preserving synchronized reading position; a new reader scroll always takes precedence over a pending programmatic editor echo.

Choose **Generate PDF** in that pane when the result is ready. figaro then looks for an installed Chrome/Chromium-family browser, including Ungoogled Chromium and its Flatpak launcher, then Edge; on macOS it can use the system Safari/WebKit engine. Chromium candidates are accepted only after the same isolated headless DevTools startup used by a real export succeeds. It writes `<note>.pdf` beside the Markdown file (safely replacing the previous export) and opens it with your default viewer. The export deliberately aborts if no viable browser engine is found rather than creating a PDF with dead links, TOC entries, or footnote references.

An export of the active dirty note uses the current editor content without forcing a save first. A `print-stylesheet` must be a vault-local relative CSS path; it overrides a sibling `_print.css` for that note. Leave it blank or omit it to retain the built-in style.

## Getting started

### Prerequisites

- Go 1.25 or newer
- Node.js 20.19+ (20.x), 22.13+ (22.x), or 24+ for JavaScript tooling and tests
- Wails v2 CLI
- The platform dependencies required by Wails. On Linux, Figaro uses GTK3 with WebKitGTK 4.1 when available (WebKitGTK 4.0 is also supported).
- A locally installed Chrome, Chromium (including Ungoogled Chromium and Flatpak installs), Brave, or Edge browser for interactive PDF export. macOS can fall back to its built-in Safari/WebKit engine.
- ImageMagick 6 or 7 for the generated application icons; `make dev` and package builds create them automatically when absent.

Install the Wails CLI version that matches this project's Go dependency:

~~~bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
~~~

On Linux, run `make doctor` before your first build. It checks the actual
`pkg-config` libraries and prints a package-manager-specific command if
anything is missing. For example, Fedora needs
`gcc pkgconf-pkg-config gtk3-devel webkit2gtk4.1-devel ImageMagick`; current
Debian/Ubuntu uses `build-essential pkg-config libgtk-3-dev
libwebkit2gtk-4.1-dev imagemagick` (or `libwebkit2gtk-4.0-dev` on older
releases).

### Run in development

~~~bash
git clone https://github.com/grilo/figaro.git
cd figaro

make bootstrap
make dev
~~~

For browser DevTools alongside the Wails app:

~~~bash
./scripts/debug.sh
~~~

The development file server is then available at `http://localhost:34115`.
The script also enables the loopback-only WebKit inspector for that development
session. Normal launches leave it disabled; to opt in manually, run
`FIGARO_WEBKIT_INSPECTOR=1 make dev`.

To trace a Draw.io save in the development console, run
`window.__figaroDrawioDebug = true` before reproducing it. The trace records
only protocol event names, actions, byte counts, and outcomes—not diagram XML
or SVG contents. Inspect `window.__figaroDrawioProtocolTrace` to copy its last
100 entries. Use `localStorage.setItem('figaro.drawio.debug', 'true')` to retain
it across a reload, then remove that key when finished.

### Build a desktop binary

~~~bash
make linux
make windows
make darwin
make icons          # regenerate all icon variants from figaro.appicon.png
~~~

### Publish a GitHub release

Publish a stable semantic-version release in one command:

~~~bash
make release patch  # latest reachable vMAJOR.MINOR.PATCH tag → next patch
make release minor
make release major
~~~

To publish a specific approved version instead, use:

~~~bash
make release VERSION=vMAJOR.MINOR.PATCH
~~~

The bump commands read the highest stable release tag reachable from `main` and
increment only the requested number. Before changing files, Figaro prints the
resolved base and target, such as `Resolved minor release from v1.3.0 to
v1.4.0.` An untagged package version is not a prior release. Every form
synchronizes the version metadata and changelog, runs the full local release
suite, commits all current non-ignored repository changes into the release
commit, creates the annotated tag, then pushes `main` and that exact tag. It
never discards work with a clean or reset operation. If `Unreleased` has no
entries, it leaves files unchanged and explains how to add a grouped changelog
entry—or that there is no release to create. Rerunning the same version after an
interrupted attempt verifies the tagged release again and resumes its pushes.
It downloads Playwright's pinned Chromium when needed but never installs
operating-system packages or requests a password. To run every local action
without publishing, use:

~~~bash
make release-local patch
make release-local VERSION=vMAJOR.MINOR.PATCH
~~~

`$prepare-figaro-release` selects the publishing target only when the request
explicitly says to publish the release.

After `make release-local`, publish its already-created release commit and tag
with:

~~~bash
git push origin main
git push origin vMAJOR.MINOR.PATCH
~~~

The `vMAJOR.MINOR.PATCH` release tag must match the versions in `package.json`,
`package-lock.json`, and `wails.json`; the workflow refuses inconsistent
metadata or a tag that is not on `main`. The tag-triggered release workflow
verifies the complete test suite, builds a
Linux amd64 archive, a Windows amd64 archive, and one universal Intel/Apple
Silicon macOS archive, then publishes them with `SHA256SUMS` and generated
release notes. Each archive includes the README, changelog, and GPL license.
Release builds are currently unsigned, so Windows SmartScreen
or macOS Gatekeeper may ask the user to confirm the first launch.

The Makefile prepares a clean checkout itself: it downloads Go modules, runs
`npm ci` when the locked frontend dependencies are absent or changed, and
regenerates vendored browser assets when their inputs or outputs require it.
It also generates missing icon variants and prints actionable native-package
hints through `make doctor`. It automatically selects Wails' WebKitGTK 4.1
support on distributions such as current Fedora; WebKitGTK 4.0 is also
supported. The current Windows target uses Wails' pure-Go WebView2 path, so it
cross-builds from Linux without MinGW-w64. Wails v2 builds Linux only on Linux
and macOS only on macOS; `make all` selects the targets supported by the
current host. `./scripts/build-fedora.sh` is a convenience wrapper around
`make linux`.

For contributor setup, verification commands, and the platform build notes in one place, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Test the project

The test suite covers the Go vault backend, CodeMirror behaviour, tab/session state, diagram rendering, and the printable-document pipeline.

~~~bash
# Prepare ignored browser assets before testing a fresh checkout.
make bootstrap

# Go backend
go vet . ./internal/... ./cmd/...
go test . ./internal/... ./cmd/...
go test -race . ./internal/... ./cmd/...

# JavaScript unit and integration tests
npm run lint
npm run test:unit

# Browser-only geometry, event, frame, and printable-output boundaries
npx playwright install chromium    # first time only
npm run test:pdf
~~~

Most behavior is covered below the browser layer. The Playwright suite is kept
for the smaller set of contracts that require real layout, browser events,
frames, or printable output. See [the testing strategy](docs/TESTING.md) before
adding an end-to-end scenario.

## Review the design system

Figaro includes a searchable
[component catalogue](frontend/design-system/index.html) for reviewing the
shared UI primitives and intentional feature variants. It shows production
selectors and states, computes token values from the active theme, and builds
its theme selector from the same 17-theme manifest used by the application.
Figaro and the catalogue both load the canonical
`frontend/design-system/primitives.css` asset, so catalogue changes cannot
silently diverge from the controls used in the application.

The full style stack is modular and eagerly loaded: shared defaults are in
`frontend/design-system/tokens.css`, responsibility-based application modules
are under `frontend/styles/`, and stable theme surfaces are in
`frontend/design-system/theme-surfaces.css`. Every bundled theme is a
token-only `:root` override governed by
`frontend/design-system/theme-contract.json`, while
`style-manifest.json` records the canonical cascade order used by both the
application and catalogue.

Start the local asset server, then open the catalogue:

~~~bash
go run ./cmd/devserver
# http://127.0.0.1:34115/design-system/
~~~

Alternatively, open `frontend/design-system/index.html` directly from a file
explorer. Its relative assets and prebuilt catalogue script retain the same
styles, themes, search, and interactive specimens without requiring a server.

The accompanying [UI audit](frontend/design-system/AUDIT.md) records the nine
approved families, the feature hooks they permit, and the deliberately separate
card, switch, checkbox, and menu-controller boundaries. New component
families or visual variants are added only after explicit approval; approved
components are recorded in
`frontend/design-system/approved-components.json`.

## Architecture

`figaro` is deliberately small and direct:

- **Go + Wails v2** provides the desktop shell, vault-safe filesystem operations, configurable local Git auto-commit history, settings, and browser-backed interactive PDF export. The repository root is a thin executable/embed boundary; Wails assembly, the bound application, and capability-oriented adapter files live under `internal/desktop`, while reusable logic remains in smaller `internal/` packages.
- **Vanilla JavaScript + CodeMirror 6** provides the editor, live Markdown experience, workspace UI, and language support. Bundled feature modules, language parsers, Vim support, and diagram engines are loaded and initialized during startup so normal interactions do not pause for first-use code loading.
- **Browser dependencies** keep the editor, Markdown renderer, KaTeX, Mermaid, Vega, Vega-Lite, Vim mode, and language grammars available without a runtime package install. The Makefile recreates generated modules before desktop builds (or on demand with `make vendor`); KaTeX ships only its production JavaScript, CSS, and font assets. Python and Rust grammar support does not add a Python or Rust runtime to Figaro.
- **The vault** is the source of truth. Configuration lives under `.config/`; content remains portable files.

For the complete behaviour contract and implementation notes, see [the product specification](docs/PROMPT.md). Non-obvious implementation decisions are collected in [the architecture notes](ARCHITECTURE.md), and the test layout and commands are documented in [the testing guide](docs/TESTING.md).

## Repository layout

```
cmd/devserver/       Small static server used by browser-level tests and debugging
docs/                Product notes and contributor-facing testing guidance
internal/vault/      Root-scoped vault filesystem primitives
internal/settings/   Pure settings normalization and migration rules
internal/notes/      Note-save use case over an injected repository
internal/mutations/  Pure move, copy, merge, and collision planning
internal/desktop/    Wails assembly, bound App capabilities, and adapter tests
frontend/js/core/    Pure frontend models, plans, and layout rules
frontend/js/usecases/ Effect coordination through injected ports
frontend/js/adapters/ Browser and native effect adapters
frontend/js/controllers/ Feature wiring between state, use cases, and views
frontend/js/views/   DOM rendering with no backend ownership
frontend/design-system/ Shared UI assets, approved registry, catalogue, and audit
internal/links/      Pure Markdown link rewriting used by file moves
internal/history/    Local Git history and auto-commit service
frontend/            Wails webview, CodeMirror modules, themes, fonts, and vendored assets
scripts/             Optional build, debug, and vendor-maintenance helpers
assets/branding/     Generated square icon master used by application packages
tests/frontend/      Pure, use-case, adapter, component, and race tests
tests/e2e/           Small Playwright browser-boundary suite
main.go              Thin executable entry point and root-owned embedded inputs
main_test.go         Focused contract for packaged metadata and frontend embeds
```

Local vault data, generated binaries, test reports, and machine-specific helper
scripts are ignored for new work. Keep personal notes and build outputs outside
commits when contributing.

## Current limitations

- figaro is a desktop, single-vault application; it does not provide cloud sync, encryption, mobile clients, or a plugin system yet.
- The Draw.io editor is intentionally lightweight and uses the hosted diagrams.net editor. Saved SVG output remains local and offline-readable.
- PDF output uses a browser already installed on the machine. If none can be found, figaro explains how to install Chrome or Chromium instead of generating a degraded PDF.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, supported build targets, verification commands, and repository conventions.

## License

Figaro is free software distributed under the [GNU General Public License
version 3 or later](LICENSE). You may use, study, share, and modify it under
those terms. Distributed builds include the license and changelog; dependency
licenses remain with their corresponding vendored assets.
