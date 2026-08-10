# Functional & Behavioral Specification: Obsidian-Style Live Preview for CodeMirror 6

## 1. High-Level Core Philosophy
Implement a CodeMirror 6 (CM6) extension that creates an inline "Live Preview" experience for Markdown. The system operates on a binary visibility rule driven by the user's cursor/selection state:

* **Active/Editing State (Cursor INSIDE):** When the cursor or selection overlaps with a Markdown syntax node or resides on its containing line, the raw syntax delimiters (e.g., `**`, `#`, `[ ]`) must be completely visible and editable as raw text.
* **Preview State (Cursor OUTSIDE):** When the cursor/selection leaves the node or line, the raw syntax delimiters must be visually masked (hidden), and the block/inline elements must render as their rich visual equivalent.

---

## 2. Granular Element Behaviors & State Transitions

Your implementation must accurately transition states for the following elements based on viewport-bound syntax tree parsing (`@lezer/markdown`):

### Headers (`# Heading`)
* **Cursor on line:** Show the `#` marks. Apply the corresponding heading typography class to the line block.
* **Cursor off line:** Hide the `#` marks and any trailing spaces. Keep the typography styling active on the line to prevent layout snapping.
* **Typed block guides and folding:** Editor-sized gutter labels appear only for top-level headings, fenced code blocks, and tables. Headings use `h1`–`h6`; a typed fence uses the normalized first language token such as `yaml`, while an untyped fence uses `code`; tables use `table`. Activating a fence or table guide folds that source block. Activating a heading guide folds its complete section through the last block before the next peer or ancestor, so descendants remain grouped with their parent. Frontmatter, prose, lists, quotes, images, math, HTML, rules, and indented code receive no guide. Folding is editor-only and never changes source, Raw Text Preview, or PDF output. Heading-shaped fence content remains part of its code block rather than becoming a heading guide. Source-code modes keep their normal chevron fold gutter.

### Inline Styles (Bold `**text**`, Italic `*text*`, Code `` `code` ``)
* **Cursor inside node bounds:** Show the boundary delimiters (`**`, `*`, `` ` ``). Keep the inner text styled (bolded, italicized, or monospaced).
* **Cursor outside node bounds:** Apply a zero-width or hidden display class to the boundary delimiters only. The inner text remains seamlessly formatted.

### Links (`[Display Text](https://url.com)`)
* **Cursor inside node bounds:** Show the entire raw string exactly as written.
* **Cursor outside node bounds:** Mask the opening `[`, the closing `]`, and the entire `(https://url.com)` token. Apply a distinct clickable link class to the remaining "Display Text".
* **Missing-note review:** A click on a rendered conventional Markdown link must map the widget back to the exact source destination. When a same-folder canonical name match exists, **Use existing note** replaces only that revalidated destination as a normal undoable edit, keeps the display text byte-for-byte unchanged, and follows the existing note. A stale range, unavailable target, cancellation, or different-folder name-only match must not edit source.
* **Reference links:** Full (`[text][id]`), collapsed (`[text][]`), and shortcut (`[text]`) references become clickable replacement widgets only when the document contains a matching definition. An unresolved bracket label stays source text with ordinary prose color, no underline, and a text cursor. Definitions are collected from non-frontmatter, non-fenced source lines when the document changes; the corresponding link-decoration pass remains limited to visible ranges. Reference widgets and their active raw source must preserve Arrow Up/Down movement, mouse placement, and bidirectional drag selection.
* **Authoring a new target:** Link autocomplete lists existing notes first and may append one explicit **Create note** action. That action creates beside the current note through the normal same-name review, inserts the configured Markdown/Wikilink syntax only after successful creation, and leaves the current buffer active.

### Hashtags (`#todo`, `#urgent`)
* **Completion context:** A whitespace-delimited partial hashtag may open the normal CodeMirror completion list in ordinary Markdown prose. A line-leading `#` remains heading syntax, and completion stays disabled in frontmatter, code, links, URLs, and HTML.
* **Task due actions:** Only an exact known tag in an explicit unchecked Markdown task without an existing semantic due link may add **Add due date…**, **Due today**, and **Due tomorrow**. The shared picker is anchored at the caret, returns focus to the editor, and inserts ordinary Markdown rather than a replacement widget.
* **Cursor contract:** Accepting a tag or due-date action leaves the selection at the end of the inserted source. Arrow Up/Down, mouse placement, and bidirectional drag selection around that line must continue to use CodeMirror's normal source geometry.

### Images (`![Alt Text](image.png)`)
* **Cursor inside node bounds:** Display the plain text markdown markup exactly. Do not show the image preview.
* **Cursor outside node bounds:** Completely hide the plain text markup string. Instantiate and inject an inline block widget immediately after the node containing a functional HTML `<img>` tag pointing to the parsed URL.

### Task Checkboxes (`- [ ] Task` or `- [x] Task`)
* **Cursor on line:** Show the raw `- [ ]` or `- [x]` string for standard text editing.
* **Cursor off line:** Dynamically substitute the text marker `[ ]` or `[x]` with an interactive HTML `<input type="checkbox">` widget reflecting the correct state. 
* **Widget Interactivity:** Clicking the checkbox widget must capture the event, prevent default behavior, and programmatically dispatch an editor transaction to mutate the underlying document string (toggling the character between a space and an `x`).

---

## 3. Strict Architectural & Performance Guardrails

When writing the TypeScript extension, you must adhere to the following CodeMirror 6 structural constraints to prevent common errors:

1.  **View Optimization:** All syntax tree iterations and decoration evaluations must be bound strictly to the current viewport ranges (`view.visibleRanges`). Do not compute decorations for the entire document.
2.  **State Triggers:** Recompute the decoration set dynamically if and only if: the document changes (`update.docChanged`), the selection changes (`update.selectionSet`), or the view scrolls (`update.viewportChanged`).
3.  **Coordinate Sorting Rule:** You must collect all decorations in a mutable array, ensure they are strictly sorted by their incremental document positions, and then construct the final set using `Decoration.set(builder, true)`. Overlapping or unsorted ranges will crash the editor.
4.  **No Layout Snapping:** Ensure inline styles retain their typographic metrics (font-size, line-height) across both states so that text does not shift horizontally or vertically when the cursor enters a line.

The shared editor document and selected file tab must change ownership
together. In particular, an external capability read completes before its tab
becomes active; a failed or superseded read leaves the previous tab and
CodeMirror document paired. Never select a destination tab while another tab's
source is still mounted.

Markdown diagnostics are a separate idle-time editor extension, not a
live-preview decoration pass. The persistent, on-by-default **Show Markdown
lint** setting can remove or restore that extension without changing the
document. Its inline squiggles and hover tooltip must not add block geometry or
alter text metrics, so normal cursor movement, mouse placement, and drag
selection keep the same layout contract.

Wrapped Markdown bullet, ordered-list, and plain blockquote rows use an inline
hanging indent. Every continuation display row begins at the item or quote
body. For blockquotes, the indent accounts for the visible `>` while the line
is active and only its remaining separator whitespace while it is passive.
The indent is recalculated with that line's preview state and must not change
source, introduce a block widget, or alter vertical geometry.

## 4. Block Widget Geometry Contract

CodeMirror's vertical cursor movement, click mapping, selections, and scrolling
depend on its internal height map matching the browser's rendered layout. The
DOM element returned by a block `WidgetType.toDOM()` is the measured boundary.
Anything that occupies vertical space outside that boundary can corrupt
coordinate calculations and make the cursor jump across unrelated source
lines.

Every decoration created with `block: true` must follow these rules:

1. The widget root and its visual surface must have zero top and bottom
   margins. This includes widgets supplied by vendored extensions such as the
   `.tbl-table-widget` root from `codemirror-markdown-tables`.
2. Visual spacing around a widget must be measured. Use the transparent
   wrapper provided by `frontend/js/blockWidget.js` and express spacing as
   wrapper padding. Widgets that need no surrounding spacing must still use
   the shared block-widget marker.
3. Do not allow child margins to collapse outside the measured root. The
   shared spacing wrapper establishes the required formatting context.
4. Adding a new block widget, changing a block widget's DOM structure, or
   changing its spacing CSS requires updating
   `tests/frontend/unit/blockWidgetLayout.test.js` so the new root and surface
   are covered by the contract test.
5. Do not treat the Arrow Up/Down safety guard as permission to violate this
   contract. It is defense in depth; correct widget geometry is the primary
   fix and also protects mouse placement, selection, and scrolling.

The Mermaid block widget also uses the shared pre-parse security policy. Source
over 50,000 characters or YAML frontmatter containing an ordered-map tag never
reaches the vendored parser. The measured widget displays its normal error
state, and moving the selection into the block reveals the unchanged source.

The same guard enforces symmetric document boundaries independently of widget
geometry. Arrow Down at the final position and Arrow Up at the first position
are consumed without moving; a browser result that crosses in the opposite
direction is clamped back to the requested source line's edge. A result that
claims success without moving, or skips more than one source line, falls back
to the adjacent source line at the nearest source column unless the skipped
source is exactly covered by a folded range. A fold is one intentional visual
row: downward movement reaches the next visible line, while upward movement
normalizes the hidden range endpoint back to its visible heading. Vim `j`/`k`
and Up/Down share these invariants in both source-line and optional visual-row
mode. A backwards native geometry result keeps the exact Vim cursor position
at the first or last row, and viewport scrolling remains at the corresponding
boundary. Wraparound is never enabled by a preference.

The frontmatter Properties replacement keeps one left-edge disclosure control
across collapsed and expanded states. CodeMirror's scroller reserves a stable
scrollbar gutter so opening the taller panel cannot shift that control
horizontally. Expanding a note without frontmatter inserts the default YAML in
panel mode; Arrow navigation into the replaced range must still reveal raw
source, and leaving it must restore the compact card. The expanded widget root
also owns a paint layer above subsequent positioned editor lines. A picker
listbox may visually extend past the measured card, but every exposed option
must remain the pointer hit target; hover keeps the picker focused and clicking
an option must not place the CodeMirror selection beneath it. Cover this with
the focused frontmatter component and block-widget layout tests plus
`tests/e2e/frontmatterProperties.spec.js`.

Inline diagnostic decorations, including spellcheck's dotted unknown-word
marks, must remain source-length-preserving and must not introduce a widget,
line-height, padding, or block replacement. They are checked with the same
Arrow Up/Down, mouse placement, and drag-selection contract as other editor
decorations.

Before merging any block-widget change, run the required checks documented in
[`TESTING.md`](TESTING.md#block-widget-and-cursor-regressions). Layout changes
must also be exercised in the packaged desktop webview. At minimum, open the
Welcome note, place the cursor on `### Text formatting` (line 36), and verify
that Arrow Up moves to line 35 and Arrow Down returns to line 36 without a
larger jump.

The optional Vim **Enter rendered blocks** motion changes selection state, not
widget geometry: Normal `j`/`k` place the selection inside an adjacent rendered
block so its normal source-first replacement logic reveals portable Markdown.
Visual `j`/`k` always keeps its original anchor, extends the range into an
adjacent fenced block, and reveals that source even when the option is off;
crossing a preview can therefore never collapse Visual mode. Tables remain
interactive widgets and receive their first or last cell. Their nested
cell editor is the only cursor surface while it has focus; the synchronized
outer selection must never paint a second full-cell caret. In Vim Insert mode,
the nested editor's line caret must remain visible and aligned with its actual
text insertion point. If the desktop engine leaves CodeMirror's custom cursor
layer empty, the nested editor uses its native accent caret instead, never both.
Normal mode's full block and Replace mode's underline cursor must also remain
visible inside the focused cell; the unfocused root editor must not make either
nested cursor transparent. When focus leaves the first or final table cell, the
root editor must restore its live Vim mode marker before painting its cursor, so
the document block cursor remains themed instead of reverting to the adapter's
red fallback. Undo/redo may rebuild the table widget, but must return focus and
the caret to the originating cell after that rebuild.
