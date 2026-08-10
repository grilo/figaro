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

![Figaro editing a featured Markdown document with a populated vault and live preview](docs/images/figaro-editor.jpg)

Figaro is a desktop knowledge workspace built around ordinary files. It combines
a source-first Markdown editor with search, backlinks, daily notes, Kanban,
calendar planning, diagrams, local history, and browser-quality PDF export.
There is no account, hosted database, or required cloud service.

## Features

- **Plain-file vaults.** Notes, images, code, stylesheets, and editable
  `.drawio.svg` diagrams remain normal files in a directory you control.
- **Source-first Markdown editing.** The active line stays editable Markdown
  while surrounding content renders headings, tables, tasks, callouts,
  footnotes, math, images, links, and fenced code. Fold controls beside `#`
  headings collapse nested sections without changing the saved source.
- **Fast navigation.** Use compact drag-reorderable document tabs, optional
  path breadcrumbs, full-vault search, backlinks, unlinked mentions, a heading
  outline, recent notes, pins, and file-tree customization.
- **Capture and planning.** Quick notes and daily notes live in a real `Inbox`;
  hashtags form a Kanban board, and portable due-date links feed the Today
  dashboard and calendar.
- **Diagrams and data graphics.** Render Mermaid, Vega, and Vega-Lite blocks,
  or edit Draw.io diagrams while keeping the saved SVG readable outside Figaro.
- **Document publishing.** Preview Markdown and paginated output, add cover
  pages and tables of contents, apply vault-local print CSS, and generate linked
  PDFs.
- **Local history.** Optional per-file Auto-Commit, explicit history saves,
  comparisons, and restoration keep unrelated vault changes separate.
- **Configurable workspace.** Choose from seventeen themes, prose and code
  fonts, Vim editing, line numbers, diagnostics, and fully local spellcheck
  dictionaries.

## Download

Download the latest build from
[GitHub Releases](https://github.com/grilo/figaro/releases/latest).

| Platform | Package |
| --- | --- |
| Linux | x86-64 `.tar.gz` |
| Windows | x86-64 `.zip` |
| macOS | Universal Intel and Apple Silicon `.zip` |

Release archives include Figaro, the changelog, and the GPL license. Builds are
currently unsigned, so Windows SmartScreen or macOS Gatekeeper may ask you to
confirm the first launch.

Linux requires GTK 3 and WebKitGTK 4.1 or 4.0 at runtime. PDF generation uses an
installed Chrome, Chromium, Brave, or Edge browser; macOS can also use its
built-in WebKit engine.

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

Machine-specific settings, such as window geometry and a selected PDF browser,
are stored in the operating system's per-user application-data directory
instead of the vault.

Opening a Markdown file from outside the vault offers two safe choices:

- **Import** creates a collision-safe vault copy and opens it.
- **Keep outside vault** edits the original through a temporary file-tree
  shortcut without adding it to search, planning, history, or saved sessions.

Files and folders can also be copied or dropped into the tree. Figaro asks
before importing, preserves directory structure, and never silently overwrites
existing content.

When a new or renamed Markdown note resembles another note in the same folder
after ignoring spacing, punctuation, and capitalization, Figaro offers to open
the existing note first. It never merges notes automatically. The on-demand
**Settings → Vault care** scan lists repeated filenames separately and only
shows them as informational; it only suggests cross-folder name variants when
their content also strongly overlaps.

The same guard applies when activating a missing conventional Markdown link.
Choosing **Use existing note** changes only its destination—for example,
`[Inner Source](Inner%20Source.md)` becomes
`[Inner Source](InnerSource.md)`—then opens the existing note. The visible label
stays intact, while **Create anyway** deliberately keeps the original target.
While authoring a link, autocomplete also offers **Create note** when there is
no exact target in the current folder; it creates the note there and inserts
the configured portable link syntax. A bare `[label]` stays ordinary text
unless the document contains a matching Markdown reference definition.

## Writing and planning

Markdown diagnostics identify structural problems without changing source.
Offline spellcheck is disabled by default; choose **Settings → Spellcheck →
Language** to select English (US), English (UK), Spanish (Spain), or **None**.
The setting separates the vault default from per-note frontmatter controls, and
spellcheck text never leaves the device.

Optional Vim editing keeps wrapped-row motion and Visual selections compatible
with rendered Markdown, and vertical motions stop at the exact first and last
document positions instead of wrapping on a backwards native geometry result.
Vim `p`/`P` use the operating-system clipboard while retaining the unnamed
register as a fallback, and ordinary yanks and deletes are available to other
desktop applications. On Windows Spanish layouts, a grave dead key followed by
Space produces one backtick in Vim Insert mode whether WebView2 reports native
composition immediately, late, without event text, or not at all; repeating
the physical input three times produces one triple-backtick fence.

Quick notes create collision-safe timestamped files in `Inbox`. The Today
action creates the dated note in the same folder and continues to open legacy
root daily notes. A top-level Inbox is pinned by default but can be unpinned or
restyled like any other folder.

Kanban cards are ordinary Markdown task lines. Hashtags define columns, and due
dates remain portable links:

```markdown
- [ ] Submit report #todo [due 2026-08-14](2026-08-14.md)
```

Typing a standalone hashtag suggests saved Kanban columns even at the end of
ordinary prose. On an unfinished checkbox task with no existing due date, an
exact tag also offers **Add due date…**, **Due today**, and **Due tomorrow**;
paragraphs, completed tasks, and already dated tasks remain tag-only.

The same dates appear in the Today dashboard and calendar. Figaro keeps
reminders inside the application and does not request operating-system
notification access. A Kanban column with a chosen color shows that color as a
small header swatch; an uncolored column keeps the neutral palette icon. At
normal window heights, the calendar keeps its monthly grid visible when large
vaults make the neighboring file tree scroll, and empty dates use compact,
muted guidance below the grid.

## Diagrams and PDFs

Mermaid, Vega, and Vega-Lite blocks render directly in notes and printable
documents. Draw.io editing uses the hosted diagrams.net editor, but the
resulting `.drawio.svg` file stays in the vault and remains readable offline.
Mermaid source is checked before parsing; oversized diagrams and unsafe YAML
ordered maps remain editable source instead of blocking the editor or PDF
renderer.

Markdown Preview shows a live themed document. PDF Preview adds pagination,
cover pages, a depth-limited table of contents, footnotes, internal links, and
optional vault-local CSS. Generated PDFs are written beside their source note.
See [PDF styling](docs/PDF_STYLING.md) for the supported print contract.

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
Figaro leaves the item untouched.

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
