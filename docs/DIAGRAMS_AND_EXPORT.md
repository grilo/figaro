# Diagrams and export

[All guides](README.md) · [Writing](WRITING.md) · [PDF styling](PDF_STYLING.md)

## Tables

Write a Markdown table or type `@table` to insert one and open the Table Editor.
Click a rendered cell to edit its Markdown source. The left-side **editor**
guide opens a grid editor for rows, columns, alignment, and cell merges.

Hold Shift while clicking or dragging cells, or use Alt+Shift+Arrow, to select a
rectangle for Merge. Split applies to a merged cell. **Show Markdown** displays
the source. **Apply** writes the temporary draft as one undoable edit;
**Cancel** leaves the note unchanged and asks before discarding edits.

Paste a spreadsheet range to create a table, or select delimited text and use
**Convert selection to table…** in the editor context menu. Review the delimiter
and preview before converting. Comma, semicolon, tab, and pipe delimiters are
supported.

Tables support inline formatting and `<br>` line breaks. Figaro also supports
vertical spans using `^` and stores rectangular merges in adjacent Markdown
comments. Those extensions render in Figaro and its PDFs; other Markdown tools
may display them differently.

## Mermaid diagrams

Type `@mermaid` to insert a fence and open the Mermaid Editor. You can also
write a `mermaid` code block and use its left-side **editor** guide.

Choose a diagram type and template, then edit **Source** or use **Style** for
supported colors, shapes, and other choices. Choose **Replace with template**
to replace source you have already edited. In a flowchart, select a node
in the list or preview to edit it.

Use the mouse wheel or `+` and `-` to zoom, drag or use arrows to pan, and press
`0` to reset. Syntax errors keep the last valid preview available while you fix
the source. **Apply** changes the fence as one undoable edit; **Cancel** keeps
the original. The Table, Mermaid, and Chart editors can be resized from their
lower-right handles.

An unstyled live diagram follows the app theme. Explicit styling stays in the
Mermaid source and carries into PDF output. Drag a live diagram's lower edge to
change its height; Figaro records the height in a Mermaid comment.

## Charts and Draw.io

Use **chart** beside a rendered table to open the Chart Editor. Choose
Cartesian, Pie, or Waterfall and configure series, axes, colors, trendlines, and
guides. Review the preview, then create the chart. The resulting Vega-Lite block
preserves the original table. Its **table** action can restore that source after
confirmation. Unsupported manual changes to chart JSON remain untouched.

Vega and Vega-Lite code blocks also render directly in notes and PDFs.

Type `@drawio` to create a named `.drawio.svg` beside the note, insert an image
reference, and open the Draw.io Editor. A missing Draw.io image reference offers
**Create Draw.io diagram** too. Editing uses the hosted diagrams.net service;
saved SVG output stays local and can be viewed offline. Closing an unsaved blank
diagram leaves its empty local file available to reopen.

## Preview and generate a PDF

Open **PDF Preview** beside the document, or choose **Preview PDF** from its
context menu. The preview follows Markdown and stylesheet edits. **Raw Text
Preview** is a separate view of the exact source.

Use **Properties** for document options such as a cover, table of contents, and
page numbers. Set `page-numbers: true` for physical page footers and matching
table-of-contents destinations; a cover stays visually unnumbered.

A standalone `---` in the Markdown body becomes a page break in PDF output.
It remains a normal separator in the editor. Use `***` or `___` when you want a
visible separator in both places.

Choose a vault-local stylesheet for custom print styling. The preview
reflects the document's page size, fonts, colors, tables, images, and diagrams.
Use its code icon to inspect the generated HTML and available styling hooks.
The [PDF styling guide](PDF_STYLING.md) covers setup, Properties, and examples.

**Generate PDF** saves the current Markdown and selected stylesheet snapshots,
then writes the PDF beside the source note. Final pagination depends on the
browser engine; inspect the generated PDF before distributing it. Export needs
Chrome, Chromium, Brave, or Edge, or the built-in WebKit engine on macOS.
