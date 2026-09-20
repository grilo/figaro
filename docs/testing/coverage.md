# Coverage testing contracts

[Shared strategy and commands](../TESTING.md) · [Feature index](../FEATURE_INDEX.md)

## What is covered

- Vault path safety, atomic file operations, local-link/unlinked-mention and
  Vault-health scanning including conservative similar-note classification,
  single-file-only Auto-Commit migration and isolation,
  history comparison/restoration, exact pre-delete file and recursive-folder
  archives, durable recently-deleted recovery with collision refusal, and
  non-destructive save/commit/registry failures, Draw.io file handling and
  export-recovery states, print stylesheet resolution, and printable-document
  preparation.
- Editor behavior, CodeMirror language modes, current-note heading-fragment
  completion, typed Markdown block-guide folding, exact Raw Text Preview, persistent Markdown diagnostics
  and their hover/F8 guidance, per-note Proofreading and the analysis language,
  ignored legacy settings/frontmatter, the dynamic editor accessible name,
  per-buffer undo/redo ownership, one-Enter empty-list and empty-blockquote exit, smart URL paste
  for native, Vim Visual `p`, and editor-menu paths, and wrapped-list cursor/selection geometry,
  frontmatter, footnotes, diagrams, tabs, session
  persistence, Kanban presentation/loading and keyboard-order states,
  file-tree actions and roving keyboard-tree states, and
  stale-response guards.
- Application shortcut coverage splits the case-normalized decision from the
  capture-phase DOM effects: the pure model distinguishes local Find, global
  search, Quick Note, daily note, and sidebar commands; one browser scenario
  sends real shifted and unshifted key events and observes each user-visible
  destination without synthetic lowercase-key assumptions.
- Pure and component coverage for tab-reorder planning and drag thresholds,
  application-wide selection suppression during the active gesture, cleanup
  after drop and cancellation, pin-group boundaries, tab-overflow direction,
  nearest active-tab reveal, bounded vertical-wheel and Ctrl+PageUp/PageDown
  direction, high-resolution accumulation, preservation of horizontal wheel
  scrolling, two-ended
  filename/path presentation with filename-priority compression, conditional all-tabs visibility, keyboard menu
  selection, and the disabled-by-default vault-relative editor breadcrumb.
  The focused browser scenario drags a real primary pointer from the tab rail
  into the file tree and back, retaining no selected text while asserting the
  temporary computed `user-select` guard. It also owns real vertical-wheel and
  Ctrl+PageUp/PageDown tab switching, first/last clamping, preservation of the
  flush leading-tab alignment across overflow-button measurement, the actual
  flex widths, horizontal scrolling, and computed pseudo-element fade opacity
  that cannot be represented by jsdom.
  `tabManager.test.js` also verifies middle-button press cancellation over tab
  surfaces, closing on release, unchanged input outside tabs, and cancelled
  dirty-tab closure. The same pointer browser scenario verifies that a trusted
  middle press is prevented while its subsequent `auxclick` still closes the
  tab. In packaged Windows/WebView2, middle-click a tab label and its close
  button: no autoscroll cursor should appear, and release should close only
  that tab. Cancel closing a dirty note and verify its text remains. Chromium
  on Linux proves the event sequence, not the Windows autoscroll UI.
- Browser rendering of cover pages, table of contents, fenced-code token colors,
  Mermaid, Vega, and Vega-Lite in the PDF export pipeline; focused printable
  renderer coverage also proves that CodeMirror table `<br>` markers become
  real breaks and anchored `^` markers become vertical row spans without
  rewriting source. The same renderer coverage proves that only a parsed body
  `---` thematic break becomes an authored PDF page break: frontmatter and
  Setext headings remain structural, and `***` / `___` remain visible rules.
  The consolidated browser case carries one authored break and representative
  highlighting/math through the real vendored renderer used by preview/export.
  Plugin anchor, task, footnote, and inline-transformation rules remain in
  `export.test.js`, rather than a duplicate browser matrix. Observe dependency
  loading through browser request events, not the size-limited Resource Timing
  buffer, which can omit eagerly loaded modules in the assembled application.
- Dependency security coverage for patched root lockfile entries and embedded
  packages that `npm audit` cannot see. Mermaid's actual browser bundle remains
  behind a pure pre-parse size and ordered-map policy until its embedded YAML
  parser reaches a fixed release; the representative PDF browser scenario
  proves rejected source remains printable.
- The Figaro Dark, Light, and CRT Phosphor theme assets, including their warm or
  phosphor reading surfaces, contiguous active tab, shared single-pixel
  file-tree/tab boundary, borderless but filled Search/Quick Note controls,
  stripe-free operation-selection surface and weight, tactile borderless
  Settings card, focus token, text/link contrast, and at
  least 4.5:1 rendered contrast for Home's small muted instructions. Figaro
  Dark additionally holds dim and muted tokens against the conservative hover
  surface plus the application-status text at 4.5:1 or above. The debug shell
  must load the real manifest and theme CSS before these computed checks. Native
  Dark/Light coverage additionally compares computed titlebar/file-tree and
  editor/gutter/buffer-status colors, proves the internal sidebar, tab, workspace, and
  status borders are transparent, and keeps only the subtle tools divider and
  status separators. Figaro Dark also asserts that its editor plane has a
  deliberate luminance lift over the navigation plane. CRT coverage checks its
  borderless glass, separate beam, and reduced-motion contracts.
- Browser workflows for contextual Relationships, keyboard-triggered mention
  linking, the themed Vault-health Settings entry and finding navigation, and
  the full-width, non-overlapping History source comparison before restoration,
  plus the nested Document outline's visual hierarchy, active-section
  tracking, top-right launcher positioned beneath the complete sticky
  hierarchy, keyboard-open current-heading focus and close-to-launcher restoration,
  a focusable explanatory disabled launcher on heading-free notes, guarded
  Enter/Space activation, immediate re-enablement when a heading appears, each sticky ancestor entering separately as its real source row
  crosses the covered editor edge even while CodeMirror's virtual viewport is
  unchanged, sticky title text matching CodeMirror's computed normal font size,
  full-width flush strip geometry without floating-card radius or shadow, keyboard jump,
  Arrow Up/Down movement, editor-focus handoff, and the right pane's atomic
  visible/`aria-hidden`/`inert` focus boundary.
- The sandboxed PDF-preview bridge: user `html`/`body` styles apply inside the
  frame, external links cannot navigate it away, and fragment/footnote-return
  links remain in the rendered document. A routed note-relative local image
  must load inside that real opaque-origin frame with any authored dimensions
  intact; `pdfPreviewImageModel.test.js` owns the pure resolution/containment
  plan and jsdom covers DOM rewriting plus attribute preservation. Once the
  first render settles, a deliberately suspended editor refresh must leave the
  loading badge hidden, the settled status unchanged, and the prior bridge
  snapshot mounted until the new printable document is ready.
  Printable block source ranges and the shared 30% marker must keep
  editor/preview positions aligned across several differently sized code
  blocks, with percentage fallback for unmapped areas.
  High-frequency scroll reports are coalesced before they can cause a matching
  burst of editor updates. The
  real-browser suite also verifies that printable Markdown preparation enters
  the module-worker path before the preview document is applied and that the
  document-side pass adds visible syntax-token colors before it enters the
  sandboxed frame.
- Release metadata consistency across npm, Wails, the GPL license, Keep a
  Changelog headings and comparison links, exact-version GitHub release notes,
  documented tag command, and all three binary archive definitions.
- The Settings About card's packaged-version normalization, backend failure
  fallback, closed-panel cancellation, accessible component state, and
  Wails-metadata injection.
- The design-system catalogue's approved registry, canonical stylesheet links,
  shared-primitive and production-hook inventory, manifest-backed theme
  selector, safe path rules, computed token refresh, component filtering, and
  reuse of the production themed combobox, with only one representative
  real-browser theme switch.

The focused release checks are `tests/frontend/unit/releaseMetadata.test.js`,
`tests/frontend/unit/releaseNotes.test.js`,
`tests/frontend/unit/dependencySecurity.test.js`,
`tests/frontend/unit/nodePrerequisite.test.js`, and
`tests/frontend/unit/releasePreparation.test.js`. They cover the
release-metadata generator's successful bracketed version/changelog cut,
comparison-link update, non-destructive invalid-version rejection, and
idempotent retry. The release-note parser independently proves exact-version
selection, canonical Keep a Changelog category order, non-empty groups, and
exclusion of neighboring releases and link definitions. Workflow assertions
require both validation and publication to use that parser, forbid GitHub's
generated-note path, and require retries to edit the curated body. The release shell test runs
the publishing and local-only paths against disposable Git repositories and a
local bare remote, proving that pending non-ignored files join the release
commit, each automatic version bump resolves from the latest tag, and an
interrupted release can resume its matching tag and push. They also prove an
empty `[Unreleased]` section leaves the worktree untouched and gives the user the
next steps instead of only reporting the failure. The dependency-security test
keeps every `brace-expansion` and `js-yaml` copy above its denial-of-service
advisory range and guards the ESLint major that provides that patched
dependency graph. The
Node-prerequisite test exercises every accepted and rejected release-line
boundary and keeps package metadata aligned with the build checks. The release
script downloads Playwright's pinned browser without using its `--with-deps`
system-package installer, so it never triggers a password prompt.
Update them whenever a release version, license, changelog convention,
packaged documentation file, tag workflow, Make target, or
release-preparation skill changes; they prevent a tag from publishing binaries
whose visible metadata disagrees with the source release.

The release metadata suite also parses the actual workflow to require native
Windows and macOS Go tests before compilation and artifact upload. It checks
asset preparation, mandatory failure propagation, and publication's dependency
on the entire build matrix. These contracts prevent publishing a build whose
platform tests failed in ordinary CI. Local release checks cover the current
host; native Windows/macOS results are still required in the tag workflow.

`tests/release/prepare-release.test.sh` also executes provisional verification
on a dirty feature branch. It checks the shared verification command sequence,
the exact candidate notes, successful and interrupted checks, and malformed
notes while preserving repository metadata, staged/unstaged/untracked work,
commits, tags, and a local bare remote. Tool processes are replaced at the shell
boundary; this tests release coordination, not the full Go/browser suite itself.
It also checks that approved publication runs the same verification sequence and
that verification failure prevents finalization from creating commits or tags.
`scripts/verify-release.sh` is shared by provisional and approved release paths.

`tests/frontend/unit/skillContracts.test.js` parses actual skill YAML, checks
discovery and local reference resolution, and parses the UX Markdown fixture to
prove its heading, note, and attachment cases remain usable. The intentionally
unfinished fence is last and only the designated missing image is absent.
`tests/frontend/unit/commitHandoff.test.js` uses disposable Git repositories and
a linked worktree to prove plain commits consume distinct proposals and explicit
messages remain intact. These checks require no application/browser scenario.

For a skill behavior change, also review the realistic prompts and expected
actions in `tests/skills/scenarios.md`. They cover version recommendations,
preparation versus finalization/publication approval, unchanged approved retries,
unrelated requests, and focused/source-only UX evidence. This is a behavioral
review set, not automated model coverage or permission to publish during a test.

UX audit reports identify scope, dirty build state, runtime/engine, theme, scale,
fixture vault, and evidence availability. Each task/runtime records passed,
failed, not tested, blocked, or unsupported. Source-only inspection cannot prove
geometry, focus, persistence, or input behavior. Withhold aggregate scores for
partial coverage; do not relabel unavailable native checks as passed Chromium
checks. Use owned disposable vaults for mutating exercises and retain relevant
evidence before cleaning up only those artifacts.

The browser suite is intentionally not a substitute for the desktop webview:
when changing the PDF preview bridge, also run the packaged Linux build and
exercise it in Wails/WebKitGTK. The preview's origin/sandbox boundary is
documented in [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
Its unit coverage must also exercise a reader scroll that arrives while an
editor-to-preview update awaits its programmatic echo; the reader's newest
position must win rather than being delayed behind a parent-side timeout.
