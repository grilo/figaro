# Styling PDF exports

Figaro's PDF export has a polished built-in style. A custom stylesheet is
optional and is intended for document-specific branding, typography, and print
layout.

## Live preview

Choose **Preview PDF** from a Markdown note's context menu, editor context
menu, or **Properties → PDF layout**. The right pane renders the same
printable document structure used for export inside an isolated preview, so a
note stylesheet cannot change the application interface. It updates after a
short delay while you edit the note or its selected stylesheet; changes saved
outside Figaro are picked up when the file tree refreshes too.

The editable stylesheet is applied after the preview's screen geometry, so
ordinary `html` and `body` rules affect the page just as they do in the final
PDF. The preview preserves its position after a refresh and synchronizes
relative scrolling with the active source Markdown note. Table-of-contents,
footnote, and return links stay within the rendered preview instead of
navigating to a vault URL. Web links open in your default browser, while
vault-local document links open through Figaro rather than replacing the
preview frame. The preview uses a fixed sandboxed document and a narrow
message bridge, so note CSS remains isolated while link actions cannot
navigate the preview away from Figaro; see [Architecture notes](../ARCHITECTURE.md)
for the implementation rationale.

Use **Generate PDF** in the preview toolbar to persist the exact Markdown and
selected stylesheet snapshots currently shown in the preview, then run the
native PDF export. This also covers an edit followed immediately by
**Generate PDF**—the export does not fall back to an older saved stylesheet.
The preview is a screen representation of the printable document; final
pagination remains the browser engine's responsibility and is most accurately
checked in the generated PDF.

## Create and select a stylesheet

Open a Markdown note's **Properties → PDF layout** panel and choose **Create
starter** beside Print stylesheet. Figaro proposes `pdf.css` next to the note,
but you can choose any vault-local relative `.css` path. It copies the bundled
starter stylesheet once, records that path in `print-stylesheet`, refreshes the
file tree, and opens the CSS file for editing.

If the target already exists, Figaro asks whether to use it and never replaces
its contents. Startup and PDF export do not create or modify stylesheets.

You can select an existing stylesheet from the same field to share a style
between notes. Paths are relative to the Markdown note; for example, a note at
`reports/weekly.md` can use `../styles/report.css`.

```yaml
---
cover-page: true
toc-depth: 3
print-stylesheet: "pdf.css"
---
```

Leave `print-stylesheet` absent or blank to use the built-in style (and an
optional sibling `_print.css` if you already use that convention). A selected
stylesheet must exist and be valid UTF-8 CSS when the note is exported.

## Cascade and page setup

Figaro adds its built-in CSS first and links the selected vault stylesheet
afterward. Normal CSS cascade rules therefore let your selectors override the
defaults without `!important` in most cases.

The Chromium export uses A4 by default and honors CSS page size settings. Use
`@page` for paper size and margins:

```css
@page {
  size: A4;
  margin: 18mm 16mm 20mm;
}
```

## Theme colors and advanced overrides

For ordinary page, cover, and text colors, edit the **Quick theme controls** at
the top of the starter stylesheet. The later rules consume those variables, so
these common customizations do not require selector-order knowledge:

```css
:root {
  --figaro-paper: #000;
  --figaro-cover-background: #000;
  --figaro-ink: #ffe600;
  --figaro-muted: #cbd5e1;
  --figaro-soft: #16202a;
  --figaro-code: #e2e8f0;
}
```

Use a selector override only for a genuinely selector-specific design change.
Put it at the **end** of the stylesheet—after any `body` or cover defaults—so
normal CSS cascade rules apply predictably:

```css
html,
body,
.figaro-print-cover {
  color: yellow;
  background: black;
}
```

The bundled starter has a **Personal overrides** comment at its end for this
advanced use.

The starter file at `frontend/pdf/starter-pdf.css` is the complete editable
example copied into a vault. It demonstrates every stable Figaro selector
listed below.

## Stable HTML hooks

Figaro treats these names as the PDF styling contract. Ordinary Markdown keeps
its semantic HTML, so standard selectors such as `p`, `table`, `blockquote`,
`pre`, `code`, `a`, `img`, and `h1`–`h6` remain available too.

| Area | Stable hooks |
| --- | --- |
| Whole Markdown body | `main.figaro-print-document` |
| Forced page break | `.figaro-print-page-break` |
| Cover wrapper | `.figaro-print-cover`, `.figaro-print-cover-inner` |
| Cover content | `.figaro-print-cover-kicker`, `h1.figaro-print-cover-title`, `.figaro-print-cover-subtitle`, `.figaro-print-cover-meta`, `.figaro-print-cover-author`, `.figaro-print-cover-date` |
| Contents wrapper | `nav.figaro-print-toc`, `h2.figaro-print-toc-title`, `ol.figaro-print-toc-list` |
| Contents levels | `.figaro-toc-level-1` through `.figaro-toc-level-6` |
| Markdown headings | `.figaro-print-document h1` through `.figaro-print-document h6` |
| Callouts | `blockquote.figaro-print-callout`, `.figaro-print-callout-note`, `.figaro-print-callout-warning`, `.figaro-print-callout-info`, `.figaro-print-callout-tip`, `.figaro-print-callout-danger`, `.figaro-print-callout-example` |
| Task lists | `.figaro-print-task-list`, `.figaro-print-task-item`, `.figaro-print-task-checkbox`, `.figaro-print-task-label` |
| Printable diagrams | `figure.figaro-print-diagram`, `.figaro-print-diagram-content` |
| Math | `.katex-block`, `.katex-display`, `.katex` |
| Footnotes | `.footnote-ref`, `.footnotes-sep`, `.footnotes`, `.footnote-backref` |

The generated order is cover, table of contents, then
`main.figaro-print-document`. Scope document-heading rules to that `main`
element so the cover title and contents title can have independent designs:

```css
.figaro-print-document h1 { color: #0b7285; }
.figaro-print-cover-title { font-size: 32pt; }
.figaro-print-toc-title { letter-spacing: .03em; }
```

Cover and contents sections receive `.figaro-print-page-break` when present.
For other authored content, CSS can use `break-before`, `break-after`,
`break-inside`, and their `page-break-*` fallbacks where appropriate.

## Callouts

Printable Markdown recognizes these quoted callout markers: `> [!note]`,
`> [!warning]`, `> [!info]`, `> [!tip]`, `> [!danger]`, and `> [!example]`.
They remain semantic `blockquote` elements and gain a callout class and
`data-callout-type` / `data-callout-label` attributes. The bundled starter
stylesheet exposes a color and soft-background variable for each type.

## Headers are not page headers

`h1`–`h6` are document headings and are fully stylable. Figaro currently does
not provide repeated running page headers or footers: the browser export has
its native header/footer feature disabled, and browser CSS margin boxes are not
a portable replacement. Do not rely on `@top-*` or `@bottom-*` rules for a
cross-platform Figaro PDF.
