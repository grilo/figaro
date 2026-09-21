# Figaro's live Markdown adapter

`index.js` is the checked-in downstream ESM implementation consumed by both the
application bundle and Jest. It includes Figaro's reviewed widget geometry,
source reveal, folding, link, and cursor-work changes. `scripts/vendor.sh` does
not replace this package; `vendor:markdown` builds the separate printable
Markdown renderer. An upstream replacement must preserve and revalidate these
contracts rather than copying over this artifact.

Formatting markers and Markdown styles visit only `view.visibleRanges`. Marker
visibility is a pure plan in `frontend/js/core/markdownFormattingModel.js`;
an interval index queries current/previously visible markers and only changed
visibility patches decorations. Unchanged reveal state retains decoration identity. Block code uses complete
cached descriptors because its replacements participate in document geometry,
then consults the shared pure selection interval index on cursor updates and
patches only changed blocks. `canMapMarkdownProseEdit` checks completed paragraphs
within equally advanced partial or complete trees,
unchanged paragraph/list/quote ancestry and the shared changed-text prose policy
before mapping cached code/image/table/guide positions and decorations. Formatted
prose and Unicode punctuation are eligible; changed delimiters, newlines and
image-bearing paragraphs use the broader block check or fall back.
`markdownProjectionEdit` proves local parsed block/ancestor bounds before
heading, code, table and soft line-break updates patch only affected payloads.
Code descriptors read only changed fences. Unmoved descriptors retain their reveal
index. Code widgets resolve click positions from the mounted decoration, so
retained payloads remain correct when scrolled out of view and remounted. Structural/uncertain edits, parser,
folding, drag and reveal-policy changes retain explicit invalidation; unrelated
settings keep block descriptors and decorations.
The existing code widget and click handler own DOM and input.
Figaro composition supplies an optional `previewReuse` port to `codeBlockField`.
It retains the highlighted `pre` subtree across source/viewport returns, with
fresh copy/pointer controls and current mapped positions. Source, language and
highlighter registration generation validate reuse. This port keeps DOM cache
ownership outside the vendor module without adding an application import.

Ordinary links separately retain visible descriptors and a selection interval
index. Cursor movement patches only changed source reveal; document/parser/
viewport/configuration changes refresh source. Drag settlement reprojects cached
descriptors. Link widget equality includes its title and callback configuration
so cached labels never retain stale actions or tooltips.

`markdownWorkFacet` accepts an optional counter callback. The application wires
its diagnostics collector at editor composition; standalone uses have a no-op
collector. There is no dependency on application state, storage, or timers.
Shared imports point only to pure transformations.

The old upstream `index.js.map` is retained as provenance, but its stale source
mapping directives are removed from the patched implementation. It must not be
used to report locations in the changed code. Production is rebuilt eagerly
with `npm run build:app`.

Run `vendoredMarkdownCursor.test.js`, `markdownFormattingModel.test.js`,
`markdownLinksProjection.test.js`,
`editorInteractionContract.test.js`, `codeBlockInteraction.test.js`, and the
broader checks in `docs/testing/editor.md`. Retain the existing browser/native
cursor, folding, copy-button, pointer and source-height workflows. Do not use
operation counts as claims about input-to-display latency.

Typing follow-up: `canMapMarkdownInlineEdit` shares the block proof and compares
inline syntax boundaries in affected paragraphs through the pure
`markdownInlineStructuresMatch` helper. Formatting markers/styles map their
ranges; ordinary links map only when no link source was touched. New/changed
inline structures fall back to visible syntax projection. The differential
`editorTypingInventory.test.js` compares incremental and fresh projections.
