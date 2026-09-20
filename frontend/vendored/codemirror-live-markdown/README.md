# Figaro's live Markdown adapter

`index.js` is the checked-in downstream ESM implementation consumed by both the
application bundle and Jest. It includes Figaro's reviewed widget geometry,
source reveal, folding, link, and cursor-work changes. `scripts/vendor.sh` does
not replace this package; `vendor:markdown` builds the separate printable
Markdown renderer. An upstream replacement must preserve and revalidate these
contracts rather than copying over this artifact.

Formatting markers and Markdown styles visit only `view.visibleRanges`. Marker
visibility is a pure plan in `frontend/js/core/markdownFormattingModel.js`;
unchanged reveal state retains decoration identity. Block code uses complete
cached descriptors because its replacements participate in document geometry,
then consults the shared pure selection interval index on cursor updates and
patches only changed blocks. `canMapMarkdownProseEdit` checks complete trees,
unchanged paragraph/list/quote ancestry and the shared changed-text prose policy
before mapping cached code/image/table/guide positions and decorations. Formatted
prose and Unicode punctuation are eligible; changed delimiters, newlines and
image-bearing paragraphs fall back. Unmoved descriptors retain their reveal
index. Code widgets resolve click positions from the mounted decoration, so
retained payloads remain correct when scrolled out of view and remounted. Structural/uncertain edits, parser,
folding, drag and configuration changes retain explicit invalidation.
The existing code widget and click handler own DOM and input.

`markdownWorkFacet` accepts an optional counter callback. The application wires
its diagnostics collector at editor composition; standalone uses have a no-op
collector. There is no dependency on application state, storage, or timers.
Shared imports point only to pure transformations.

The old upstream `index.js.map` is retained as provenance, but its stale source
mapping directives are removed from the patched implementation. It must not be
used to report locations in the changed code. Production is rebuilt eagerly
with `npm run build:app`.

Run `vendoredMarkdownCursor.test.js`, `markdownFormattingModel.test.js`,
`editorInteractionContract.test.js`, `codeBlockInteraction.test.js`, and the
broader checks in `docs/testing/editor.md`. Retain the existing browser/native
cursor, folding, copy-button, pointer and source-height workflows. Do not use
operation counts as claims about input-to-display latency.
