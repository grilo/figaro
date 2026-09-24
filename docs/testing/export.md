# Export testing contracts

[Shared strategy and commands](../TESTING.md) · [Feature index](../FEATURE_INDEX.md)

## PDF preview page-geometry regressions

The preview pane may grow, but its document body must remain centered and
capped to the printable `@page size`. Keep unit coverage for the A4 fallback,
named sizes, portrait/landscape orientation, explicit one- and two-length
sizes, stylesheet ordering, and the final geometry guard. The real-browser
test must use a pane wider than the paper and a conflicting `body` width rule,
then assert the physical CSS width and centered gutters. This belongs in:

```bash
npm run test:unit -- --runTestsByPath tests/frontend/unit/pdfPreview.test.js
npx playwright test tests/e2e/pdfPreviewFrame.spec.js
```

## PDF page-number and contents regressions

Keep the opt-in property, legacy unnumbered markup, fixed-width TOC cells,
source maps, and starter-version hooks in frontend renderer tests. The desktop
use-case test injects render/resolve/inject/write ports and must prove ordinary
exports stay one-pass, numbered contents use exactly two passes in the same
supplied session, and destination drift blocks publication. Root-scoped tests
prove **Upgrade copy** preserves its source and occupied targets.
`print_stylesheet_status_test.go` reads the starter marker only from the
leading comment, keeps unmarked and older files upgradable, and refuses to
append a current starter to itself; `frontmatter.test.js` disables the button
only for an up-to-date status. The pdfcpu
adapter owns actual internal-link destination resolution.

Preview scroll synchronization: `pdfPreview.test.js` sweeps a multi-line widget
monotonically with content padding and requires the inverse to land on the
same position, and keeps CodeMirror's own correction scrolls from echoing
while a wheel gesture takes over. `pdfPreviewFrame.test.js` covers gap
interpolation, programmatic echoes without lookups, the host lease against
layout scrolls, footnote exclusion, and source-position restore on re-render.
The `pdfPreviewFrame.spec.js` browser check confirms the same mapping with
real block geometry.

The opt-in real Chromium test is the one browser-only boundary: it verifies
CSS page-margin output, an unnumbered cover that still counts as physical page
1, numbered following pages, and link annotations. Set
`FIGARO_PDF_TEST_OUTPUT=/tmp/pdfs/figaro-page-number-contract.pdf` to retain the
otherwise temporary PDF for `pdfinfo`, `pdftotext`, and `pdftoppm` inspection.
Ordinary and release CI supply Playwright's pinned Chromium executable and run
this boundary; an unconfigured local `go test` continues to skip it.

## PDF browser discovery and Snap confinement regressions

Keep Linux browser discovery deterministic by injecting the `/snap/bin`
directory listing, filesystem lookup, and DevTools validator. The focused Go
contract must prove that unsupported Snap commands are ignored, browser-engine
priority is preserved, and a `/snap/bin/<snap>[.<app>]` command maps only to an
ephemeral workspace below `$HOME/snap/<snap>/common/figaro`. Path validation
must reject traversal and malformed Snap names.

For a workstation with Snap Chromium installed, run both opt-in boundaries.
The first exercises automatic discovery plus an actual isolated DevTools
startup; the second writes printable HTML, its browser profile, and the PDF to
the confinement-visible workspace and asserts page-margin support, an
unnumbered cover, physical destination pages, and internal/external link
annotations:

```bash
go test ./internal/pdfexport \
  -run 'Test(FindBrowserScansSnapBin|SnapBrowser)'
FIGARO_BROWSER_PDF_DISCOVERY_INTEGRATION=1 \
  go test -v ./internal/pdfexport -run '^TestFindBrowserAgainstOptInSystem$'
FIGARO_BROWSER_PDF_EXECUTABLE=/snap/bin/chromium \
FIGARO_PDF_TEST_OUTPUT=/tmp/pdfs/figaro-page-number-contract.pdf \
  go test -v ./internal/pdfexport -run '^TestRenderChromiumPDFAgainstOptInBrowser$'
```

## Raw text preview and heading-link regressions

Linked-note destination classification, percent decoding, date mentions, and
missing-note creation plans live in `core/linkedNoteNavigationModel.js` and its
plain-input tests. `usecases/linkedNoteNavigation.js` owns read/review/create/open
sequencing through injected ports; `linkedNoteNavigation.test.js` covers current-tab
reuse after an awaited read, cancellation, similar-note reuse, stale targets,
unavailable files, backend collisions, and failure reporting. `editor.test.js`
retains assembled click-to-navigation, new-note creation followed by file-tree
refresh, and source replacement coverage. The creation case uses the real editor
composition, so omitting the refresh port fails even if a use-case fake supplies
it. Pointer mapping, heading selection, and dispatch remain in the editor adapter; this
extraction changes no rendering, keymap, layout, or native clipboard boundary.

Raw Text Preview is an exact source surface, not a renderer or print-preview
shortcut. Keep unit coverage for frontmatter, HTML, fences, an explicitly empty
document, active/saved document refresh, clipboard success/failure, pure
source-anchor clamping, delayed editor-to-raw scroll following, listener
cleanup, and closing. The browser workflow must open it from a Markdown context
menu, assert exact text plus deliberate source geometry, copy the complete live
snapshot through the visible action, follow main-editor scrolling down and back
up, and close it by keyboard. Current-note heading completion must ignore frontmatter and fenced
examples, preserve duplicate anchor suffixes, and accept a keyboard selection
after typing `](#`.

`editorPreviewLaunchers.test.js` owns Markdown/document visibility, injected
Raw/PDF dispatch, mutual open state, busy re-entry, and disposal. The focused
Outline browser scenario owns the actual three-button rail geometry, themed
tooltip adoption, accessible expanded state, and click-to-open/click-to-close
behavior for both preview modes. At an 800px viewport with the navigation pane
expanded, that same scenario opens Raw and PDF Preview and asserts the pure
presentation plan selects the existing overlay placement, the editor retains at
least its 320px layout floor, at least 180px remains visibly exposed, and no
root horizontal overflow appears. Widening the same viewport must return the
pane to docked placement; no duplicate preview workflow is added.

```bash
npm run test:unit -- --runTestsByPath \
  tests/frontend/unit/rawTextPreview.test.js \
  tests/frontend/unit/rawTextPreviewModel.test.js \
  tests/frontend/unit/linkCompletions.test.js
npx playwright test \
  tests/e2e/rawTextPreview.spec.js \
  tests/e2e/headingLinkCompletions.spec.js
```
