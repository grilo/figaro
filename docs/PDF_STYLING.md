# Styling PDF exports

Figaro's PDF export has a polished built-in style. A custom stylesheet is
optional and is intended for document-specific branding, typography, and print
layout.

## Live preview

Choose the compact **PDF** icon beneath Document outline, the editor context
menu's **Preview PDF**, or **Properties → PDF layout**. The adjacent **Raw
Markdown** icon opens the exact source preview. The file-tree context menu
deliberately prioritizes file operations.
The right pane renders the same
printable document structure used for export inside an isolated preview, so a
note stylesheet cannot change the application interface. It updates after a
short delay while you edit the note or its selected stylesheet; changes saved
outside Figaro are picked up when the file tree refreshes too.

**Preview Raw Text** is a separate right-pane source surface. It preserves the
exact Markdown, including frontmatter and unrendered HTML, and deliberately
does not load this stylesheet, PDF page geometry, cover pages, or
table-of-contents sections; use **Preview PDF** when checking print styling.

The editable stylesheet is applied after the preview's screen geometry, so
ordinary `html` and `body` rules affect the page just as they do in the final
PDF. A final geometry-only guard then keeps the paper centered and capped to
the stylesheet's `@page size`, even if a general `body` rule requests an
unbounded width. Widening the preview pane therefore adds room around the
paper rather than stretching its contents. Named paper sizes, orientation,
and explicit CSS lengths are reflected in the preview, with A4 as the
fallback. The preview preserves its position after a refresh and synchronizes
source-line anchors with the active Markdown note. Tall code blocks, tables,
and diagrams therefore do not accumulate the drift caused by comparing only
whole-document percentages. Its own scrolling
stays native and smooth; the companion editor receives coalesced position
updates rather than a cross-frame update for every display frame, and a new
reader scroll always overrides a settling programmatic editor update. Table-of-contents,
footnote, and return links stay within the rendered preview instead of
navigating to a vault URL. Web links open in your default browser, while
vault-local document links open through Figaro rather than replacing the
preview frame. The preview uses a fixed sandboxed document and a narrow
message bridge, so note CSS remains isolated while link actions cannot
navigate the preview away from Figaro; see [Architecture notes](../ARCHITECTURE.md)
for the implementation rationale.

The code icon in the preview toolbar opens **Figaro PDF style reference** for
the document currently on screen. It lists every generated class and ID,
shows the exact printable `body` HTML, and offers **Copy HTML**. Use it when a
selector below needs more context or when frontmatter changes the generated
cover and table-of-contents structure; the reference is derived from the
current preview rather than a generic sample.

Use **Generate PDF** in the preview toolbar to persist the exact Markdown and
selected stylesheet snapshots currently shown in the preview, then run the
native PDF export. This also covers an edit followed immediately by
**Generate PDF**—the export does not fall back to an older saved stylesheet.
The preview is a screen representation of the printable document; final
pagination remains the browser engine's responsibility and is most accurately
checked in the generated PDF.

The first preview may show its preparation state. Later Markdown or stylesheet
edits keep the current page visible and suppress transient updating text while
the next printable snapshot is prepared; errors still appear in the status row.

Printable tables use the same canonical Markdown-It rendering path as the
editor's source-preserving GFM table preview. Bare `<br>`/`<br/>` cell markers
become real line breaks, while the same text inside inline code remains
literal. Figaro also accepts a bare `^` in a data cell as a vertical merge with
the immediately preceding data cell in that column; consecutive markers extend
the preceding cell's `rowspan`. A caret without an anchor remains visible. The
table editor can also author rectangular spans as adjacent
`<!-- figaro:table-merge A2:C3 -->` metadata. Figaro removes that private
comment from visible output and applies the matching `rowspan`/`colspan` in
both PDF Preview and generated PDFs. Rendering never rewrites the Markdown
source.

Authored image geometry uses Figaro's optional Obsidian-style trailing
alt-text hint (a Figaro extension, not CommonMark or GFM):
`![Portrait|320x180](portrait.jpg)`. The printable Markdown renderer removes
the hint from the accessible alt text and emits a standard `<img>` with
`width="320"`, `height="180"`, and matching inline pixel geometry. PDF Preview
and generated PDFs therefore match the editor's resized image. An unsized
image retains its natural aspect ratio and the ordinary printable max-width
guard; document CSS applied later may deliberately override either form.
Note-relative and vault-root local sources are resolved from the Markdown
note's directory to an explicit `/vault/…` URL before PDF Preview enters its
sandbox, while generated PDF assets retain the equivalent note-relative base.

Figaro-managed charts remain ordinary fenced `vega-lite` JSON in the document.
The Chart Editor stores a full-width Vega-Lite specification and its authored
vertical height, complete visible-series legend, and selected four-side legend
position plus the fixed first-column Cartesian category, so PDF Preview and
generated PDFs pass it through the same
shared SVG renderer as hand-written Vega-Lite. Editor-only controls, source
placeholders, and resize readouts are never printed; a renderer failure keeps
the original fence visible instead of dropping the chart. Printable CSS may
still override `.figaro-print-diagram` or its SVG when a document needs a
different print-specific fit. Interactive Figaro theme colors are supplied at
render time only for managed editor charts and are not serialized into the
portable Vega-Lite fence or imposed on the print surface.
Managed trendlines retain the visible first-column labels while Vega-Lite uses
their hidden authored-row positions as the regression predictor, so Preview and
export share the same nominal-category trend geometry.
Managed nominal encodings explicitly preserve table row order for Cartesian
categories, regression lookups, Pie legends, and slices; Vega-Lite is never
allowed to silently apply lexical category sorting.
Threshold overlays preserve the chart's selected value-axis labels in both the
interactive and printable renderers.

On Linux, automatic browser discovery includes supported Chromium-family
commands under `/snap/bin`. Figaro keeps each confined browser's temporary
profile, printable document, local assets, and generated output in that Snap's
user-common area for the duration of the export, then removes the temporary
workspace.

Fenced code uses the same bundled, offline highlighter as the Markdown editor.
A supported language tag such as `javascript` selects that grammar; an untyped
fence may be detected automatically. PDF Preview and generated PDFs therefore
share the same token markup and built-in light print palette. Unsupported
language tags remain escaped, readable source instead of failing export.

## Create and select a stylesheet

Open a Markdown note's **Properties → PDF layout** panel and choose **Create
starter** beside Print stylesheet. Figaro proposes `pdf.css` next to the note,
but you can choose any vault-local relative `.css` path. It copies the bundled
starter stylesheet once, records that path in `print-stylesheet`, refreshes the
file tree, and opens the CSS file for editing.

If the target already exists, Figaro asks whether to use it and never replaces
its contents. Startup and PDF export do not create or modify stylesheets.

When a note already selects a stylesheet, the same action becomes **Upgrade
copy** and proposes a `-v2.css` sibling. Figaro writes the current version-2
starter there, then appends every rule from the selected stylesheet as the
last override section. The source stylesheet and any existing target remain
byte-for-byte untouched. Review the copy, then keep the automatically updated
`print-stylesheet` value or switch back to the old file.

You can select an existing stylesheet from the same field to share a style
between notes. Paths are relative to the Markdown note; for example, a note at
`reports/weekly.md` can use `../styles/report.css`.

```yaml
---
cover-page: true
toc-depth: 3
page-numbers: true
print-stylesheet: "pdf.css"
---
```

Leave `print-stylesheet` absent or blank to use the built-in style (and an
optional sibling `_print.css` if you already use that convention). A selected
stylesheet must exist and be valid UTF-8 CSS when the note is exported.

`page-numbers: true` is opt-in. Chromium places the physical page counter in
the bottom-center margin and Figaro resolves each generated contents link to
its final physical destination page. A cover still counts as page 1 so every
destination remains physically accurate, but its footer is hidden. A numbered
document without a table of contents uses one browser render; a numbered table
of contents uses a provisional and final render in the same already-running
browser session. The status bar says **Paginating interactive PDF…** during
that work, and only the verified final file replaces the prior export.

Page numbers require Chromium 131 or newer. Figaro reports an explicit error
for older Chromium builds and Safari instead of silently producing an
unnumbered file. The live preview reserves the contents number column but can
only fill its final values during PDF generation.

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
  --figaro-code-keyword: #ff7b72;
  --figaro-code-string: #a5d6ff;
  --figaro-code-number: #79c0ff;
  --figaro-code-title: #d2a8ff;
  --figaro-code-comment: #8b949e;
  --figaro-code-type: #7ee787;
  --figaro-code-variable: #ffa657;
  --figaro-page-number-color: var(--figaro-muted);
  --figaro-page-number-font: Arial, sans-serif;
  --figaro-page-number-size: 9pt;
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
| Printable table merges | `td[data-figaro-table-merge="rowspan"]` on the anchor cell |
| Forced page break | `.figaro-print-page-break`; authored Markdown breaks also use `hr.figaro-print-authored-page-break` |
| Cover wrapper | `.figaro-print-cover`, `.figaro-print-cover-inner` |
| Cover content | `.figaro-print-cover-kicker`, `h1.figaro-print-cover-title`, `.figaro-print-cover-subtitle`, `.figaro-print-cover-meta`, `.figaro-print-cover-author`, `.figaro-print-cover-date` |
| Contents wrapper | `nav.figaro-print-toc`, `h2.figaro-print-toc-title`, `ol.figaro-print-toc-list` |
| Contents levels | `.figaro-toc-level-1` through `.figaro-toc-level-6` |
| Numbered contents | `.figaro-print-toc-entry`, `.figaro-print-toc-label`, `.figaro-print-toc-leader`, `.figaro-print-toc-page` |
| Markdown headings | `.figaro-print-document h1` through `.figaro-print-document h6` |
| Fenced code | `code.figaro-print-code`, `.hljs-keyword`, `.hljs-string`, `.hljs-number`, `.hljs-title`, `.hljs-function`, `.hljs-comment`, `.hljs-type`, `.hljs-variable`, and the other highlight.js-compatible token classes in the starter stylesheet |
| Callouts | `blockquote.figaro-print-callout`, `.figaro-print-callout-note`, `.figaro-print-callout-warning`, `.figaro-print-callout-info`, `.figaro-print-callout-tip`, `.figaro-print-callout-danger`, `.figaro-print-callout-example` |
| Task lists | `.figaro-print-task-list`, `.figaro-print-task-item`, `.figaro-print-task-checkbox`, `.figaro-print-task-label` |
| Printable diagrams | `figure.figaro-print-diagram`, `.figaro-print-diagram-content` |
| Math | `.katex-block`, `.katex-display`, `.katex` |
| Footnotes | `.footnote-ref`, `.footnotes-sep`, `.footnotes`, `.footnote-backref` |

Mermaid source that exceeds 50,000 characters or uses a YAML ordered-map tag
is preserved as its original printable code fence. It does not produce a
`figure.figaro-print-diagram`, and custom print CSS may style it like any other
fenced code block.

Themes, type-specific colors, and flowchart node styles created by the Mermaid
Editor's adaptive Style mode are stored as ordinary Mermaid frontmatter and
statements. PDF Preview and generated PDFs therefore render the same authored
colors and shapes through the shared Mermaid renderer; there is no separate
print-only style record to synchronize. Color edits preserve the source theme;
XY plots use the native `xyChart.plotColorPalette` (including repeated palettes),
and resetting an individual flowchart override preserves authored native/class
styling. These are source transformations, not preview-only CSS overrides.
When a diagram has no authored theme or custom variables, Figaro gives only its
in-application live canvas an ephemeral palette derived from the active UI
theme. Printable HTML, PDF Preview, and generated PDFs render the unchanged
source with Mermaid's document defaults, and the two SVG variants use separate
cache entries.
An optional `%% figaro:height N` directive inside a Mermaid fence records the
editor's vertical resize (180–900px). PDF Preview and generated PDFs apply that
height to the printable figure; the bottom-center lower-edge resize control itself remains
editor-only.

Each fenced `code.figaro-print-code` also carries
`data-highlight-language="…"`; automatically detected fences additionally carry
`data-highlight-detected="true"`. Override token colors after the built-in CSS,
or edit the starter's `--figaro-code-*` variables:

```css
.figaro-print-code .hljs-keyword { color: #7c3aed; }
.figaro-print-code .hljs-comment { color: #64748b; }
```

The generated order is cover, table of contents, then
`main.figaro-print-document`. Scope document-heading rules to that `main`
element so the cover title and contents title can have independent designs:

```css
.figaro-print-document h1 { color: #0b7285; }
.figaro-print-cover-title { font-size: 32pt; }
.figaro-print-toc-title { letter-spacing: .03em; }
```

Cover and contents sections receive `.figaro-print-page-break` when present.
A standalone `---` parsed as a thematic break in the Markdown body emits an
invisible `hr.figaro-print-authored-page-break.figaro-print-page-break`, making
it the source-level page-break notation for PDF Preview and generated PDFs.
Leading frontmatter delimiters never reach the body renderer, a `---` Setext
underline remains a heading, and `***` / `___` remain visible thematic rules.
For other authored content, CSS can use `break-before`, `break-after`,
`break-inside`, and their `page-break-*` fallbacks where appropriate.

## Callouts

Printable Markdown recognizes these quoted callout markers: `> [!note]`,
`> [!warning]`, `> [!info]`, `> [!tip]`, `> [!danger]`, and `> [!example]`.
They remain semantic `blockquote` elements and gain a callout class and
`data-callout-type` / `data-callout-label` attributes. The bundled starter
stylesheet exposes a color and soft-background variable for each type.

## Running headers and the supported footer

`h1`–`h6` are document headings and are fully stylable. Figaro does not provide
repeated running page headers or arbitrary footer content. The supported
exception is the bottom-center physical number emitted by `page-numbers: true`
on Chromium 131 or newer. Customize it through the three
`--figaro-page-number-*` variables above; do not rely on custom `@top-*` or
`@bottom-*` margin boxes for a cross-platform Figaro PDF.
