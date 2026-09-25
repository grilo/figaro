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
  paragraph focus. Long notes stay responsive, even on a slow or cloud-synced disk.
- **Revise with local feedback.** Choose writing lenses for spelling, clarity,
  directness, inclusive language, or formulaic phrasing. Review suggestions
  beside your words and decide what to keep.
- **Connect ideas to action.** Link related notes, follow backlinks, and turn
  tasks in your notes into a Kanban board or calendar plan.
- **Finish something worth sharing.** Add tables, diagrams, charts, or math,
  then export a PDF with your choice of page styling.

## Capture an idea and follow it

Use **Quick note** to catch a thought before it disappears, then link it as you
write: completion finds an existing note or creates a new one. Search,
backlinks, and the graph help you find your way back.

When a note becomes a project, its tasks can stay beside the thinking that
produced them. Tag a task with `#todo` to put it on the board, then plan dates
in Calendar or a longer schedule in Gantt. Turn on **Activity dates** to see
when each passage last changed.

[Explore notes and planning →](docs/NOTES_AND_PLANNING.md)

## Refine a draft in your own voice

Choose any mix of **Proofreading**, **Clarity**, **Directness**, **Inclusive
language**, and **Formulaic writing** for each document. Hover an underlined
phrase to see why it was flagged and, where it helps, a replacement you can
apply. Or ignore it, or add the word to your dictionary.

![An invitation draft with an in-place suggestion to shorten “in order to” to “to”](docs/images/figaro-writing.png)

Every check runs on your computer. Proofreading catches slips such as “your
welcome” and “I have went,” but the advice is yours to take or leave: grammar
checks cover selected issues, and style hints need judgment. English (US and
UK) has spelling and prose checks; Spanish has spelling.

[Learn about writing and lenses →](docs/WRITING.md)

## Turn a draft into a document

Build a table, sketch a Mermaid diagram, turn a table into a chart, or add math
without leaving your note. Figaro draws them beside your writing and carries
them into the PDF.

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
export. Found a problem or have an idea? [Open an issue](https://github.com/grilo/figaro/issues).
Code contributions are welcome; start with the [contributor guide](CONTRIBUTING.md).
See [LICENSE](LICENSE) for the GPL terms and
[third-party notices](THIRD_PARTY_NOTICES.md) for dependency and theme credits.
