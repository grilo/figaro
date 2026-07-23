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

### Inline Styles (Bold `**text**`, Italic `*text*`, Code `` `code` ``)
* **Cursor inside node bounds:** Show the boundary delimiters (`**`, `*`, `` ` ``). Keep the inner text styled (bolded, italicized, or monospaced).
* **Cursor outside node bounds:** Apply a zero-width or hidden display class to the boundary delimiters only. The inner text remains seamlessly formatted.

### Links (`[Display Text](https://url.com)`)
* **Cursor inside node bounds:** Show the entire raw string exactly as written.
* **Cursor outside node bounds:** Mask the opening `[`, the closing `]`, and the entire `(https://url.com)` token. Apply a distinct clickable link class to the remaining "Display Text".

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

Markdown diagnostics are a separate idle-time editor extension, not a
live-preview decoration pass. The persistent, on-by-default **Show Markdown
lint** setting can remove or restore that extension without changing the
document. Its inline squiggles and hover tooltip must not add block geometry or
alter text metrics, so normal cursor movement, mouse placement, and drag
selection keep the same layout contract.

Wrapped Markdown bullet and ordered-list rows use an inline hanging indent:
every continuation display row begins at the item body, whether the list marker
is raw source or its rendered widget. The indent is recalculated with that
line's preview state and must not introduce a block widget or vertical geometry.

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
