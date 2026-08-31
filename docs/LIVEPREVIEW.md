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
* **Typed block guides and folding:** Editor-sized monospace gutter labels exist only for top-level headings, fenced code blocks, tables, and standalone image lines. Expanded controls rest at zero opacity with pointer events disabled. Non-heading stacks reveal when the pointer enters the rendered block or its uninterrupted approach rectangle through the 42px left rail; heading guides reveal only for the caret, keyboard focus, or that narrow rail lane. Folded controls remain visible and operable until expanded. Headings use `h1`–`h6`; a typed fence uses the normalized first language token such as `yaml`, while an untyped fence uses `code`; tables use `table`; ordinary images use `image`; and editable images use `drawio`. The left rail is right-aligned just outside the centered writing surface. Mermaid and Draw.io use a fold/`editor` stack; sized images use `image`/`original size`; tables use `table`/`editor`/`chart`/`delete`; and managed Vega-Lite charts use `vega-lite`/`editor`/`table`. **original size** is disabled when no authored image size exists and otherwise removes only the size hint. Each secondary action sits directly beneath its fold control, inherits the same helper primitive, and remains outside the writing surface. A hidden maximum-length spacer keeps the rail's overlay width stable when folding removes nested labels, so the centered content never shifts. Every guide aligns with the top of its corresponding line or rendered block. Activating a fence, table, or image guide makes its live-preview provider yield to CodeMirror's native fold row; expanding restores the rendered widget whenever the cursor remains outside that source. A Draw.io `editor` action resolves the authored note-relative or vault-root destination and opens the existing diagram directly, creating it through the same safe workflow when absent; a table `editor` action opens the isolated transactional grid, `chart` opens the reversible Chart Editor, and the managed Vega-Lite `table` action restores its embedded original after confirmation. Activating a heading guide folds its complete section through the last block before the next peer or ancestor, so descendants remain grouped with their parent. The adapter preserves the clicked guide's viewport coordinate and introduces only the trailing scroll reserve needed to prevent end-of-document clamping, so the same pointer coordinate can immediately reverse the action. Frontmatter, prose, lists, quotes, math, HTML, rules, and indented code receive no guide. Folding is editor-only and never changes source, Raw Text Preview, or PDF output. Heading-shaped fence content remains part of its code block rather than becoming a heading guide. Source-code modes keep their normal chevron fold gutter, with the same quiet expanded and persistent folded states.

### Inline Styles (Bold `**text**`, Italic `*text*`, Code `` `code` ``)
* **Cursor inside node bounds:** Show the boundary delimiters (`**`, `*`, `` ` ``). Keep the inner text styled (bolded, italicized, or monospaced).
* **Cursor outside node bounds:** Apply a zero-width or hidden display class to the boundary delimiters only. The inner text remains seamlessly formatted.
* **Source editing shortcuts:** Ctrl/Cmd+B, Ctrl/Cmd+I, Ctrl/Cmd+K,
  Ctrl/Cmd+Shift+X, and Ctrl/Cmd plus backtick apply Bold, Italic, Link,
  Strikethrough, and Inline Code as ordinary Markdown in one history
  transaction. Marker commands toggle matching surrounding syntax without
  changing the selected prose; the Link command moves the caret into the new
  destination. Ctrl/Cmd+Shift+B toggles the application sidebar.

### Fenced Code (```` ```javascript ````)
* **Editor preview:** Rendered fences use the bundled local highlighter, the declared language when supported, and automatic detection for an untyped fence. The inactive preview shows numbered code lines without the opening/closing backticks or language tag. Moving into the block restores its complete editable Markdown source. Wheel and native scrollbar interaction stays inside the preview without moving the CodeMirror selection.
* **Shared indentation:** The vault-persistent Tab Size setting supplies one 2–8-space (four-space default) CodeMirror tab-size/indent unit to ordinary Markdown, revealed fences, source-code files, Vim `>`, the focused Mermaid source editor, and rendered GFM table source. Rendered fences and Raw Text Preview use the matching CSS tab width. Changing the preference does not rewrite existing source or affect printable output.
* **Printable parity:** PDF Preview and generated PDFs reuse that highlighter and emit `.figaro-print-code` plus highlight.js-compatible token classes. Unsupported languages remain escaped, printable source text; highlighting never changes the saved fence.
* **Horizontal-rule print meaning:** The editor continues to render `---`, `***`, and `___` as ordinary thematic separators with normal cursor reveal. The printable renderer alone turns a standalone body `---` thematic-break token into an invisible page break; frontmatter delimiters and Setext heading underlines keep their parser-defined roles, while `***` and `___` stay visible rules.
* **GFM tables:** CodeMirror's Markdown syntax tree identifies tables, and Figaro replaces an unfocused table range—including immediately adjacent Figaro merge metadata—with a read-only `.cm-live-table` semantic preview. Selecting the range reveals the exact source; a primary rendered-cell click maps the cell's source row/column to the first authored content position after leading whitespace, while a drag from that cell remains a root-editor selection. The ordinary right-click menu stays editor-wide. The guide-launched modal provides editable auto-growing cell text, guarded row/column structure, and a hidden-by-default read-only Markdown pane. Ordinary clicks and unmodified drags retain native textarea caret/selection behavior; only Shift-click, Shift-drag, or Alt+Shift+Arrow starts a rectangular cell range. Its labelled icon toolbar uses separate editing and structural rows, grouping the theme-tinted Delete Row/Delete Column controls at the structural row's end. Merge/Split are contextual, header cells are tinted, and operations that cut a span are disabled with themed tooltips. Modal history is isolated; Apply revalidates and replaces the exact source range once, Cancel has no root transaction, and dirty Escape asks before discarding. In-session Split can restore cached cell values; after reopening it keeps the combined anchor and clears covered cells. The table preview keeps the full writing-column width but uses compact 90% typography, a 1.4 line height, and reduced outer/cell padding. Its visual surface is the sole overflow owner: wheel/touch gestures move it first and chain to CodeMirror at its boundary, native scrollbar presses remain inside it, and a fitting table passes wheel input straight through the document. The live preview and PDF renderer share Markdown-It output for alignment, inline formatting, literal code, `<br>` line breaks, anchored bare `^` row spans, and rectangular spans stored as invisible `<!-- figaro:table-merge A2:C3 -->` metadata.
* **PDF scroll anchors:** Printable block tokens carry body-relative Markdown line ranges. The PDF frame and CodeMirror synchronize the source position at a shared 30% viewport marker, while generated covers/contents and other unmapped regions retain percentage fallback. Diagram SVG replacement inherits its source fence range. This scroll-only bridge never changes the editor selection: Arrow Up/Down, Vim motion, mouse placement, and bidirectional drag selection remain CodeMirror-owned.
* **Quiet PDF refresh:** PDF Preview shows preparation feedback for its first document only. Once a snapshot is visible, editing Markdown keeps that settled page and status in place without flashing the transient loading badge or updating copy; the replacement is sent when ready, and failures still surface in the status row.

### Links (`[Display Text](https://url.com)`)
* **Cursor inside node bounds:** Show the entire raw string exactly as written.
* **Cursor outside node bounds:** Mask the opening `[`, the closing `]`, and the entire `(https://url.com)` token. Apply a distinct clickable link class to the remaining "Display Text".
* **External URLs:** Ctrl/Cmd-left-clicking an HTTP or HTTPS target delegates the validated URL to the operating system's default browser from either the rendered label or revealed source. Vault Markdown targets remain in Figaro. The external hover tooltip shows the URL and repeats the modifier-click shortcut.
* **Same-document fragments:** Clicking either the rendered label or the label/fragment in revealed source for `[Jump](#section)` moves the editor selection to the heading with that stable slug. The destination is link syntax, never a Kanban hashtag, and a missing fragment reports the missing heading without reading or creating a file.
* **Missing-note review:** A click on a rendered conventional Markdown link must map the widget back to the exact source destination. When a same-folder canonical name match exists, **Use existing note** replaces only that revalidated destination as a normal undoable edit, keeps the display text byte-for-byte unchanged, and follows the existing note. A stale range, unavailable target, cancellation, or different-folder name-only match must not edit source.
* **Reference links:** Full (`[text][id]`), collapsed (`[text][]`), and shortcut (`[text]`) references become clickable replacement widgets only when the document contains a matching definition. An unresolved bracket label stays source text with ordinary prose color, no underline, and a text cursor. Definitions are collected from non-frontmatter, non-fenced source lines when the document changes; the corresponding link-decoration pass remains limited to visible ranges. Reference widgets and their active raw source must preserve Arrow Up/Down movement, mouse placement, and bidirectional drag selection.
* **Authoring a new target:** Link autocomplete ranks existing notes through the native search index, emphasizing titles and paths while retaining prefix, accent, and conservative typo matching, and may append one explicit **Create note** action. That action creates beside the current note through the normal same-name review, inserts the configured Markdown/Wikilink syntax only after successful creation, and leaves the current buffer active.
* **URL paste:** Pasting an `http(s)`, `www`, `mailto`, or XMPP URL over selected plain prose wraps that exact label as a Markdown link. The same one-transaction source result applies to native paste, Vim Visual `p`/`P`, and the editor Paste menu; link/code selections and named Vim registers retain their normal paste behavior.
* **Accepted source-reveal reflow:** Revealing the complete raw Markdown for a long destination can wrap the active paragraph and move following lines. This is intentional: the active range shows the exact editable source with stable font metrics, without reserving destination-sized space while rendered or substituting shortened source.

### Rich Clipboard Paste
* **Source-first conversion:** Semantic external clipboard HTML is converted to ordinary Markdown before insertion, so the normal live-preview, Raw Text Preview, and PDF renderers receive the same portable source. Presentation-only HTML, internal Figaro source, explicit plain paste, and paste inside frontmatter, code/Mermaid, HTML, links, URLs, images, escapes, or entities stay literal.
* **Cursor contract:** One handled rich paste is one CodeMirror history transaction. Block insertion supplies only the blank-line boundaries needed to keep adjacent prose separate. Arrow Up/Down, mouse placement, and bidirectional drag selection around the inserted source remain native CodeMirror behavior; revealed table source accepts inline conversion without introducing block geometry.

### Footnotes (`text[^reference]` and `[^reference]: definition`)
* **Existing definitions:** Clicking a reference selects and reveals its matching definition. Clicking that definition returns to the exact reference that initiated the jump; if no journey is recorded, the first matching reference is the fallback.
* **Missing definitions:** Clicking an unresolved reference inserts `[^reference]: ` immediately after the complete source paragraph as one undoable edit. The definition retains at least one blank line before and after it, and the focused cursor lands after the trailing space so its body can be entered immediately.
* **Scope:** Navigation and creation remain inside the active note and never fall through to note creation, file reads, or Kanban hashtag routing. Repeated clicks find the newly inserted definition instead of creating duplicates.

### Lists (`- item`, `1. item`)
* **Exit behavior:** Pressing Enter on an empty second list item removes that marker and exits the list immediately. It must not require a second Enter or disturb Arrow Up/Down, mouse placement, or bidirectional drag selection across the boundary.

### Figaro authoring macros (`@due`, `@table`, `@todo`, `@mermaid`, `@drawio`)
* **Portable source first:** Accepting `@todo` inserts `- [ ] ` and leaves the caret after its trailing space. `@table` and `@mermaid` insert complete portable block source with safe blank-line boundaries, then open the existing focused editor for that exact new range. Cancelling a structured editor keeps the inserted Markdown and discards only modal draft changes.
* **Due picker:** Accepting `@due` opens the shared caret-anchored Calendar picker without changing the token. Cancelling is non-destructive; selecting a day atomically replaces the unchanged token with `[due YYYY-MM-DD](YYYY-MM-DD.md)` and restores editor focus.
* **Draw.io creation:** Accepting `@drawio` keeps the token intact while a name prompt defaults to `diagram1`. Confirmation creates the normalized `.drawio.svg` file beside the active note, atomically replaces the unchanged token with an explicit `![Diagram](./name.drawio.svg)` sibling reference, and opens the existing Draw.io Editor. Cancelling or a create failure leaves the source untouched; if the token changes while creation is pending, the created file remains discoverable but is not opened or linked.
* **Cursor and selection contract:** Macro completion is a normal CodeMirror history transaction. The inserted list, table, and fence retain their existing Arrow Up/Down, feature-key, mouse-placement, and bidirectional drag-selection behavior; no macro adds a replacement widget or a second rendering path.

### Hashtags (`#todo`, `#urgent`)
* **Completion context:** A whitespace-delimited partial hashtag may open the normal CodeMirror completion list in ordinary Markdown prose. A line-leading `#` remains heading syntax, and completion stays disabled in frontmatter, code, links, URLs, and HTML.
* **Tagged-line due actions:** Pressing Space after any valid standalone hashtag, including an unsaved custom column, exposes **Add due date…**, **Due today**, and **Due tomorrow** without requiring checkbox syntax. Lines containing `#done`, lines with an existing semantic due link, CSS color tokens, headings, and excluded Markdown syntax remain quiet. The shared picker is anchored at the caret, returns focus to the editor, and inserts ordinary Markdown rather than a replacement widget. Its month grid uses the Calendar workspace's operating-system locale, starts with Today selected when adding a date, and shares its theme-derived weekend, note-intensity, due-outline, and activity-tooltip states.
* **Cursor contract:** Accepting a tag or due-date action leaves the selection at the end of the inserted source. Arrow Up/Down, mouse placement, and bidirectional drag selection around that line must continue to use CodeMirror's normal source geometry.

### Images (`![Alt Text](image.png)`)
* **Cursor inside node bounds:** Display the plain text markdown markup exactly. Do not show the image preview.
* **Cursor outside node bounds:** Completely hide the plain text markup string. Instantiate and inject an inline block widget immediately after the node containing a functional HTML `<img>` tag pointing to the parsed URL.
* **Optional size hint:** A trailing alt-text hint such as `![Portrait|320x180](portrait.jpg)` gives the rendered image an authored width and height while keeping `Portrait` as its accessible alt text. The hint remains hidden until the cursor reveals the source. PDF Preview and generated PDF HTML translate it to standard image width/height attributes and inline pixel geometry; PDF Preview explicitly resolves note-relative local sources through the vault before the document enters its sandbox.
* **Direct resizing:** Hovering or focusing the rendered image exposes three themed 28px handles: right changes width only, bottom changes height only, and bottom-right preserves the current aspect ratio. Their shared tooltip names the operation. Dragging a handle never reveals or changes the Markdown, suppresses all handle tooltips until the pointer leaves and re-enters, resizes only the mounted image, and displays the current `W × H` in its center. Width-only and proportional gestures stop at the writing surface's right edge; proportional gestures also stop at the editor's bottom edge; height-only gestures may continue to ten times the intrinsic height. Pointer release writes changed final geometry once as one Undo/Redo history item; release without movement writes nothing; pointer cancellation restores the starting rendered geometry and writes nothing; a later completed drag starts a new item.
* **Source and reset continuity:** Clicking the image body still reveals its exact Markdown. The rendered geometry is retained as a themed source placeholder, so surrounding text moves only when the hint changes. The left `image` guide folds the complete image; its **original size** action removes the hint and restores intrinsic dimensions without opening the source. Arrow Up/Down, mouse placement, and bidirectional drag selection remain CodeMirror-owned around both states.
* **Loading/error continuity:** A pending or missing image uses Figaro's semantic panel, muted-text, border, accent, and danger tokens, with animation disabled for reduced motion. Its complete measured placeholder remains exactly one source line high, so moving the cursor into the source does not shift the next line.
* **Missing Draw.io action and preview recovery:** When a failed local destination ends in `.drawio.svg`, Figaro inspects the exact vault target. Valid saved SVG is rendered directly as the normal image preview, recovering from an earlier blank-file or cached failed request; an absent target gives the one-line placeholder the approved accent **Create Draw.io diagram** action, while an empty or otherwise non-renderable file gives **Open Draw.io diagram**. Returning to a Markdown file deliberately remounts its image widgets, while ordinary selection changes reuse them, so a Draw.io save is re-read without polling. Every image-field generation uses a local cache-busting preview URL; a successful file-tree deletion emits an immediate path-deleted signal, so the active note remounts and cannot retain an image-loader cache entry for the removed SVG. The action consumes its own pointer/keyboard activation rather than revealing source, keeps the Markdown unchanged, and opens the vault file in the Draw.io tab. A successful Create action changes to Open even while the hidden note editor remains mounted, so closing an unchanged blank diagram cannot expose a stale busy state. Ordinary failures still reveal source on pointer placement; Arrow Up/Down and bidirectional drag selection around either replacement remain native CodeMirror behavior.

### Task Checkboxes (`- [ ] Task` or `- [x] Task`)
* **Cursor on line:** Show the raw `- [ ]` or `- [x]` string for standard text editing.
* **Cursor off line:** Dynamically substitute the text marker `[ ]` or `[x]` with an interactive HTML `<input type="checkbox">` widget reflecting the correct state. Its action-oriented accessible name includes the cleaned task text, and its wrapper provides a 24px pointer target without changing source geometry.
* **Task actions:** An unfinished syntax-backed task receives two approved 22px icon buttons in the left helper rail. Kanban opens CodeMirror's existing saved-column autocomplete list; Calendar opens the shared localized due-date picker, preselecting an existing date and allowing it to be cleared. Checked tasks, frontmatter examples, and fenced task syntax receive no actions.
* **Canonical source order:** Calendar selection removes any prior valid semantic due links and appends the chosen link at the line end. Kanban selection inserts a missing standalone tag before that link and moves an already valid due link behind the task text/tags. Calendar-first and Kanban-first therefore converge on `- [ ] Task #column [due YYYY-MM-DD](YYYY-MM-DD.md)`. Kanban's parser remains order-independent for valid same-line due links.
* **Widget Interactivity:** Pointer click or keyboard Space must dispatch the same single editor transaction that toggles the source character between a space and an `x`; native visual state alone is never authoritative. Keyboard activation restores focus to the remounted checkbox. Arrow Up/Down from either direction and bidirectional drag selection across the replacement retain normal CodeMirror behavior.

---

## 3. Strict Architectural & Performance Guardrails

When writing the TypeScript extension, you must adhere to the following CodeMirror 6 structural constraints to prevent common errors:

1.  **View Optimization:** All syntax tree iterations and decoration evaluations must be bound strictly to the current viewport ranges (`view.visibleRanges`). Do not compute decorations for the entire document.
2.  **State Triggers:** Recompute the decoration set dynamically if and only if: the document changes (`update.docChanged`), the selection changes (`update.selectionSet`), or the view scrolls (`update.viewportChanged`).
3.  **Coordinate Sorting Rule:** You must collect all decorations in a mutable array, ensure they are strictly sorted by their incremental document positions, and then construct the final set using `Decoration.set(builder, true)`. Overlapping or unsorted ranges will crash the editor.
4.  **Stable Metrics:** Ensure inline styles retain their typographic metrics (font-size, line-height) across both states. Revealing exact source may legitimately wrap or reflow a line because it adds the hidden Markdown characters; do not introduce an additional style-driven size jump.

The shared editor document and selected file tab must change ownership
together. In particular, an external capability read completes before its tab
becomes active; a failed or superseded read leaves the previous tab and
CodeMirror document paired. Never select a destination tab while another tab's
source is still mounted.

Markdown diagnostics are a separate idle-time editor extension, not a
live-preview decoration pass. The persistent, on-by-default **Show Markdown
lint** setting can remove or restore that extension without changing the
document. In addition to conservative Markdown structure checks, it sends each
complete Mermaid fence through the shared parser and maps failures back onto
the revealed raw source. Its inline squiggles and hover tooltip must not add
block geometry or alter text metrics, so normal cursor movement, mouse
placement, and drag selection keep the same layout contract.

Wrapped Markdown bullet, ordered-list, and plain blockquote rows use an inline
hanging indent. Every continuation display row begins at the item or quote
body. For blockquotes, the indent accounts for the visible `>` while the line
is active and only its remaining separator whitespace while it is passive.
The indent is recalculated with that line's preview state and must not change
source, introduce a block widget, or alter vertical geometry.
At the end of an otherwise empty blockquote line, Enter removes exactly one
quote marker in one transaction. An outer quote becomes a blank line; a nested
quote retains its outer markers and can be exited one level at a time.

## 4. Block Widget Geometry Contract

CodeMirror's vertical cursor movement, click mapping, selections, and scrolling
depend on its internal height map matching the browser's rendered layout. The
DOM element returned by a block `WidgetType.toDOM()` is the measured boundary.
Anything that occupies vertical space outside that boundary can corrupt
coordinate calculations and make the cursor jump across unrelated source
lines.

Startup has a related document-level measurement boundary. The restored editor
is mounted only after saved interaction and layout preferences have hydrated,
then its complete container remains `visibility: hidden` for two animation
frames. This lets CodeMirror measure the real document, line-number gutter, and
restored selection/scroll geometry before publishing one stable first frame;
it does not replace or relax any widget's measured-height contract below.

Pure mode adds a view-only writing presentation without changing Markdown or
replacing source. Typewriter scrolling gives `.cm-content` measured top and
bottom padding derived from the current scroller height so the first and last
caret rows can occupy the same 42% anchor as an interior row. Only authored
typing, deletion, completion, and paste transactions request the keyed
coordinate read; pointer selection, Find, navigation, programmatic document
replacement, and widget actions do not. The adapter cancels or retargets one
requestAnimationFrame ease, never queues scrolls, and writes the target directly
for reduced motion. Wheel/pointer input cancels an in-flight ease.

The optional Phrase/Paragraph focus decoration is also geometry-neutral. The
syntax adapter supplies the nearest Markdown structural block and locale-aware
sentence-like phrase segments; the pure model selects the bright range. Only
visible surrounding lines/marks receive an opacity class, and mounted block
widget roots receive the equivalent class without changing their measured
height. Any non-empty selection, mouse drag, or open Find panel removes every
dim decoration. Adaptive typography, when requested, changes active font size
and writing width together across three hysteretic bands, then requests the
normal CodeMirror/source-footprint measurements. Normal mode, source text,
temporary buffer-scale ownership, and print rendering remain unchanged.

Every decoration created with `block: true` must follow these rules:

1. The widget root and its visual surface must have zero top and bottom
   margins. This includes widgets supplied by vendored extensions such as the
   `.cm-block-widget--table` root and `.cm-live-table` surface supplied by Figaro.
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

### Stable source footprints

These editor block families deliberately preserve the visual height of their
Markdown source: Mermaid, Vega, and ordinary Vega-Lite fences; ordinary fenced code;
multi-line display math; and GFM tables. The measured root receives the source
line count and CodeMirror's current `defaultLineHeight` as an immediate
fallback. The eager `sourceFootprintExtension` then measures the raw lines with
CodeMirror's active font, wrapping, and content width, and fixes the root's
height, minimum height, and maximum height to that result. Width and font-size
changes remeasure existing slots. This keeps the next source line at the same
browser coordinate when a selection reveals or hides raw source, including
long wrapped rows.

Figaro-managed, table-backed Vega-Lite charts are the deliberate authored-
geometry variant. Their root uses the chart's stored height plus 44 pixels of
widget chrome instead of the wrapped JSON measurement. While source is
revealed, every compact fence line is non-wrapping and the opener receives the
remaining `calc(... - Nlh)` placeholder height, so the following source line
does not move. The SVG fills the available width and is centered vertically in
that slot. Managed interactive charts merge the current Figaro text, muted,
border, and surface tokens into Vega's runtime defaults, leaving the authored
JSON portable; container measurement uses a short-lived connected off-screen
target because WebKitGTK cannot reliably size a detached node. Empty geometry
or renderer errors remain visible and announced instead of mounting a blank
SVG. The managed specification gives every visible mixed-mark series one shared
legend and preserves its selected Top/Right/Bottom/Left position in the live
widget. Cartesian charts always use the first table column as their category.
When a numeric series has a trendline, the managed data adds a collision-safe
hidden authored-row index for Vega-Lite regression and maps the generated line
back to the unchanged visible category labels. Threshold rule/text overlays share the selected value scale without
suppressing its existing axis. Their live widget and Chart Editor preview share `--editor-surface`, so
alpha-blended data marks do not change appearance when the chart is applied.
The only resize handle sits at the bottom center; pointer movement updates
the DOM height and center readout, pointer cancellation restores the start, and
pointer release emits at most one source transaction.

Ctrl/Cmd+mouse-wheel text scaling is an editor-only, per-open-buffer reflow.
The active scale changes `--font-size-editor` while the unitless
`--line-height-editor` ratio stays at `1.65`; scaling both would compound row
height. The adapter anchors the source position beneath the wheel through
CodeMirror correction measurements, then requests the same wrapped-source and
sticky-heading measurements used by width changes. Tab switches restore the
buffer's temporary value, and the status-bar reset returns to the permanent
Settings default without touching Markdown or printable output.
Each handled wheel gesture also reveals the complete normal-mode footer for
three seconds before its existing quiet-state fade resumes, making the new
effective **Scale** observable without changing footer geometry.

Graphic content follows the pure fit plan in
`frontend/js/core/sourceFootprintModel.js`: scale down to the available width
or height, never enlarge, and center the result in unoutlined whitespace when
it is shorter than its slot. Diagram loading and error
messages occupy the same root. Code and tables are not scaled. Code uses
contained scrolling at its normal typography on a borderless tonal surface;
its numbered rows omit a separator rule and its quiet copy control appears on
block hover or keyboard focus. Tables keep their structural grid and use a denser full-width
surface so typical rows fit and keep that surface as their only scroll owner.
Scrollbar presses stay inside the widget rather than moving CodeMirror's
selection. Vertical wheel/touch input scrolls that surface while it can move,
then uses normal browser chaining to continue through the document at its top
or bottom. A horizontal-only scrollbar therefore never traps a vertical
gesture. Table source height is its header plus the separator and body rows.

Mermaid live widgets use a bounded source-keyed SVG cache with in-flight
deduplication, so CodeMirror virtualization does not rerun the Mermaid engine
for identical source. Cached SVG ids are rebased for each mounted widget so
internal references remain local. First-time diagram renders are serialized
through an injected queue and scheduled after a short scroll-quiet period and
an idle opportunity; the loading state remains inside the already measured
source footprint while the editor is moving.

This generalized source-footprint policy is editor-only. Successfully loaded
images use the separate authored-geometry/source-placeholder contract above;
frontmatter/Properties,
links, task checkboxes, inline math, and other inline replacements must not
receive the `cm-source-footprint` marker. Loading, missing-image, and
missing-Draw.io action placeholders use their own one-source-line continuity
rule without joining the generalized footprint allowlist. Raw Text Preview and both printable surfaces keep
their independent natural layout. Raw Text Preview nevertheless follows the
main editor one way by sampling the source offset at a shared viewport marker
and measuring that exact character in its plain `pre`; a short coalescing
interval smooths scroll events without deriving its position from rendered
widget heights. Its **Copy to Clipboard** action copies the complete current
source snapshot and does not depend on editor or DOM selection.

Every rendered table extends its left block guide into a three-button stack.
`table` remains the fold/expand control; `editor` opens the isolated grid; and
`delete` removes the complete table plus adjacent merge metadata, returns focus
to the root editor, and remains undoable through shared CodeMirror history.
The destructive action is visually quiet at rest and adopts the theme's danger
color on hover or keyboard focus. All controls remain outside the writing
surface while the left margin can contain them. If the measured editor margin
is narrower than an action, the stack moves into a content-sized row above the
grid; it never enters the sidebar or covers cells. The table retains the full
available width in either layout. Right-clicking a table uses the same ordinary
editor menu as prose; table structure is owned by the guide-launched modal.

The Mermaid block widget also uses the shared pre-parse security policy. Source
over 50,000 characters or YAML frontmatter containing an ordered-map tag never
reaches the vendored parser. The measured widget displays its normal error
state, and moving the selection into the block reveals the unchanged source.

Every Mermaid fence extends its left block guide into a two-button stack.
`mermaid` remains the fold/expand control; `editor` opens the focused Mermaid
workspace directly beneath it. The guide is rebuilt from the current Markdown
tree in both rendered and raw-source states, and the application resolves its
range against a fresh diagram scan before opening the modal. Both controls use
the same shared helper primitive, face the writing surface, and remain outside
the note, so the action neither narrows nor overlaps the diagram. Primary-pointer
activation preserves the note's selection until the modal opens; keyboard
activation is native. Disabling Markdown block guides removes the complete
stack without changing source. A folded Mermaid fence keeps only its one-row
expand control; expanding restores `editor` with the block.
While Document Outline animates the available editor width, a bounded
CodeMirror measurement bridge follows that transition until the width is stable.
The Mermaid and table stacks follow the left writing edge in the same frame;
neither intersects rendered content or jumps to the top of the text body.

The focused Mermaid Editor owns a separate CodeMirror state. It copies the
root editor's current tab size and spaces-only indentation unit before receiving
input, so ordinary Tab and Vim `>` cannot diverge from the surrounding note. Parsing is
debounced and SVG rendering is serialized through an injected preview session;
only the newest generation may publish. Parser locations become lint
decorations and hover text. Invalid source leaves the most recently published
SVG in place with an explicit stale state. Its linked Diagram and Template
comboboxes update both source and preview immediately while the buffer is empty
or contains only whitespace, and after an explicit template replacement.
Opening meaningful nonempty source or manually editing the temporary buffer
protects that source until **Replace with template** is activated. The compact
comboboxes remain 4 px apart and left-aligned until the narrow single-column
breakpoint. A peer **Style** panel waits for inspection of the current diagram
type to expose only relevant Mermaid theme variables; flowcharts also receive
reversible node colors/shapes, direction, and connection curves. These controls
transform the temporary native Mermaid source, so live preview, printable
preview, and export do not require a second styling format. Parser errors
suppress styling controls, and unsupported compact YAML remains untouched. The
flowchart panel labels global colors as defaults, groups the curve with those
defaults, and presents the active node's fill and shape first, before a bounded
node chooser and the diagram-wide controls. Parsed identities include chained
and standalone nodes without treating icon labels as nodes. Native and
class-based fills remain visible and survive resetting the managed override.
Dark/custom themes are identified correctly; color and curve changes preserve
the theme. Palette controls follow actual groups/series, XY writes its native
plot palette, and unsupported controls are omitted. Instructions expose preview selection, solid dots distinguish colors
from checkboxes, and Arrow Up/Down or Home/End changes the active node without
hiding its editor. Style changes preserve focus; validation/render phases keep
open palettes anchored and update colors in place. Escape dismisses the palette
before the dialog. Preview selection scrolls that active editor into view. The
preview receives the larger pane as the dialog grows up to 1260 × 780 px, and
the panes stack vertically below 820 px without extending behind the footer.
The preview fits
each SVG within both pane dimensions at its reset scale. A non-passive wheel
handler performs pointer-centered zoom from 25% to 400%; primary-pointer drag
pans, `+`/`-` zoom, arrows pan, and `0` resets. These
controls update explicit SVG dimensions at every scale instead of magnifying a
cached composited layer, while translation is reserved for panning. The initial
empty-state node is removed after the first successful SVG and cannot obscure
later valid or last-known-good output. Preview navigation affects only the
temporary SVG surface and survives preview refreshes. On flowcharts, a click
selects the matching authored node for Style; pointer movement beyond the click
tolerance remains ordinary panning.
The temporary view receives the root editor's active Vim adapter and visual-row
mapping; its Normal, Insert, and Visual state is published through a CodeMirror
attribute compartment, so lint and preview-driven editor updates cannot erase
the mode cursor styling. Escape remains a Vim mode key while that view owns focus. Applying
calculates one replacement for the original fence body, leaving the opener and
closer untouched; cancelling does not dispatch to the note. Both paths destroy
the temporary view and return focus to the root editor.

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

Keyboard vertical motion receives a keyed CodeMirror measurement. After the
browser paints, the adapter compares the selected cursor rectangle with the
usable physical scroller, corrects `scrollTop` when a rendered block or line
gap has left those views out of sync, and requests one final CodeMirror measure.
This keeps the primary virtual viewport and selected source line synchronized
when a long wrapped note reverses from down to up and back to down. The repair
applies to normal Arrow Up/Down, Page Up/Page Down, and Vim `j`/`k`; it leaves
Markdown source unchanged and does not replace native mouse or wheel scrolling.

The frontmatter Properties replacement keeps one left-edge disclosure control
across collapsed and expanded states. CodeMirror's scroller reserves a stable
scrollbar gutter so opening the taller panel cannot shift that control
horizontally. Both states retain the same borderless `--hover-bg` surface, 8px
corners, and no elevation; the collapsed metadata stays pill-free, keyboard
focus restores an accent halo, and the expanded panel keeps only its internal
field and section boundaries. Its boolean inputs use the approved themed
checkbox rather than native webview paint. On the first mount of a Markdown buffer, complete leading
frontmatter supplies the initial selection at the start of its following body
line only when neither a remembered selection nor an explicit line target is
present. Expanding a note without frontmatter inserts the default YAML in panel
mode. Home/document-start commands, Vim `gg`, programmatic selection,
mouse placement, and drag selection keep that replacement rendered even when
their logical selection reaches its hidden range. Arrow Up / Vim `k` supplies
the explicit upward-entry event that reveals raw source; **Edit YAML** remains
an explicit source action, presented as the approved borderless quiet button
with a file-code glyph, muted resting text, tonal hover, and keyboard focus
halo. Leaving raw source restores the compact card.
The expanded widget root
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
Welcome note, place the cursor on `### Text formatting` (line 23), and verify
that Arrow Up moves to line 22 and Arrow Down returns to line 23 without a
larger jump.

Standard editing must retain a thin theme-colored insertion caret. The wider
line caret belongs only to Vim Insert mode, and the theme-derived block cursor
belongs only to Vim Normal mode; live-preview replacements may not leak that
block treatment into Standard mode.

The optional Vim **Enter rendered blocks** motion changes selection state, not
widget geometry: Normal `j`/Down and `k`/Up place the selection inside an adjacent rendered
block so its normal source-first replacement logic reveals portable Markdown.
Visual `j`/Down and `k`/Up always keep the original anchor, extend the range into an
adjacent fenced block, and reveal that source even when the option is off;
crossing a preview can therefore never collapse Visual mode. Tables use the
same source-range reveal as other rendered blocks, so Vim prompts, root
history, Arrow Up/Down, mouse placement, and drag selection stay on the root
CodeMirror editor. The separately invoked modal uses native cell textareas and
its own temporary history; it is not a nested live-preview editor or cursor
bridge.
