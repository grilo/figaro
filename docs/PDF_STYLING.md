# Styling PDF exports

Figaro's PDF export has a polished built-in style. A custom stylesheet is
optional and is intended for document-specific branding, typography, and print
layout.

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
| Task lists | `.figaro-print-task-list`, `.figaro-print-task-item`, `.figaro-print-task-checkbox`, `.figaro-print-task-label` |
| Printable diagrams | `figure.figaro-print-diagram`, `.figaro-print-diagram-content` |
| Math | `.katex-block`, `.katex-display`, `.katex` |
| Footnotes | `.footnote-ref`, `.footnotes-sep`, `.footnotes`, `.footnote-backref` |

The generated order is cover, contents, then
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

## Headers are not page headers

`h1`–`h6` are document headings and are fully stylable. Figaro currently does
not provide repeated running page headers or footers: the browser export has
its native header/footer feature disabled, and browser CSS margin boxes are not
a portable replacement. Do not rely on `@top-*` or `@bottom-*` rules for a
cross-platform Figaro PDF.

