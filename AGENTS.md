# Repository implementation requirements

These requirements apply to every change in this repository.

## Changelog updates are part of every feature

- Every user-facing feature, behavior change, and bug fix must update
  `CHANGELOG.md` under `[Unreleased]` in the same change. A feature is not
  complete until its changelog entry describes the outcome in user-facing
  language.
- Keep entries concise and place them under Added, Changed, or Fixed as
  appropriate. Before finishing any implementation, explicitly check that the
  current feature has a matching changelog entry.
- Preserve the Keep a Changelog heading/category order and comparison-link
  contract. Release preparation must validate and publish the exact dated
  changelog section as the GitHub release notes; generated commit summaries are
  not a substitute.

## Keep all documentation synchronized

- Every change must audit and update every affected documentation surface in
  the same change. User-facing workflows belong in `README.md`, and their
  detailed behavior contract belongs in `docs/PROMPT.md`; update
  `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/TESTING.md`,
  `docs/LIVEPREVIEW.md`, and `docs/PDF_STYLING.md` whenever their subject is
  affected. A changelog entry alone is not sufficient documentation.
- Before finishing, search all Markdown documentation for stale names,
  defaults, counts, commands, limitations, version numbers, and behavior
  descriptions related to the change. Explicitly confirm that every match is
  either updated or still correct.
- Release preparation must keep the version, license identifier, tag examples,
  changelog heading, package metadata, Wails metadata, and release workflow in
  agreement. Cut the accumulated `[Unreleased]` entries into the dated release
  section and leave a fresh `[Unreleased]` section for future work.

## Future implementation must preserve the dependency direction

- Keep pure decisions and transformations independent from filesystem, Wails,
  Git, browser-process, DOM, CodeMirror, timer, and global-state I/O. Application
  use cases may coordinate those effects only through explicit, injected ports;
  concrete adapters own the effects, and composition roots wire the layers.
- Apply this split to new features and to the portions of existing workflows
  changed by a task whenever an operation contains both deterministic decisions
  and external effects. Extract the decision as a pure plan, transformation, or
  reducer; keep effect execution in an adapter or use-case coordinator. Do not
  perform unrelated whole-system rewrites to reach an otherwise clean seam.
- Split behavior at those seams before merely dividing a large source file.
  Moving coupled logic and I/O into a smaller service is not an architectural
  improvement unless the logic becomes independently testable.
- Do not create ceremonial layers for a trivial pass-through that contains no
  policy, branching, sequencing, or reusable transformation. Introduce an
  interface only when a use case needs to substitute, constrain, or test a real
  effect boundary.
- Declare narrow interfaces beside the use case that consumes them. Preserve
  root-scoped `os.Root` adapter tests for path containment, symlink safety,
  atomic replacement, permissions, and rollback; an in-memory fake cannot
  establish those properties.
- Eagerly load and initialize bundled application modules and feature
  dependencies during startup. Do not add interaction-triggered `import()`,
  first-use module fetching, or feature-code lazy loading. Work that inherently
  depends on a user request or user data—such as opening a hosted Draw.io
  document, scanning Vault health, or generating a PDF—may remain
  demand-driven, but its application code and local dependencies must already
  be ready. The architecture suite rejects dynamic imports in first-party
  application modules; do not weaken that guardrail. Prove import direction and feature
  registration below the browser layer; keep one representative assembled
  startup check for post-ready module requests instead of adding an end-to-end
  startup case per feature.

## Testing strategy and feature-specific regressions

- Every new behavior and every bug fix must add or update a regression test
  that names and directly exercises that exact feature. A generic smoke test,
  an unrelated existing test, or a manual check alone is not sufficient.
- Put each assertion at the lowest layer capable of proving it. Prefer, in
  order: pure logic tests with plain inputs; use-case tests with small injected
  fakes; adapter or component tests using real temporary files, jsdom, or a
  concrete CodeMirror instance; then a small end-to-end or real-browser check
  only for a boundary that lower layers cannot represent.
- Test every affected boundary without duplicating the entire feature at every
  layer. Pure rules, cancellation/error sequencing, collision planning,
  backend arguments, and state transitions do not belong in Playwright.
  End-to-end coverage is reserved for irreducible browser or native behavior
  such as computed layout and cursor geometry, focus handoff, sandboxed or
  cross-origin frames, actual clipboard/composition events, and printable
  browser output.
- Before adding a new end-to-end spec, identify the exact browser-only risk,
  prefer extending an existing focused boundary scenario, and keep the test to
  one representative workflow. If a lower-layer regression can prove the
  behavior, do not add an end-to-end test.
- Treat existing end-to-end assertions of pure rules, backend arguments, or
  failure matrices as migration debt. When touching such a scenario, establish
  equivalent lower-layer coverage first, then remove the redundant browser
  branches; do not preserve them merely because they already exist.
- Before finishing, identify the user-visible acceptance cases (success,
  cancellation/error, and non-destructive collision behavior where relevant)
  and make each one observable at the appropriate layer. Follow the detailed
  strategy and exception list in `docs/TESTING.md`.

## CodeMirror cursor and widget contract

- Any CodeMirror extension, decoration, replacement, widget, keymap, or editor
  layout change must be checked for cursor movement. Test Arrow Up/Down across
  the changed region and every feature-specific key (for example table-cell
  arrows, Tab, Shift+Tab, and Enter), from both directions when applicable.
- Also verify mouse placement and drag selection around replaced source. Block
  widgets must obey the measured-height contract in `docs/LIVEPREVIEW.md` and
  be registered in `tests/frontend/unit/blockWidgetLayout.test.js`.
- Keep focused CodeMirror unit/component coverage. Add or extend one
  real-browser regression only when actual layout, selection, or cursor
  geometry is affected, and run the native packaged webview check described in
  `docs/TESTING.md`; jsdom and Chromium cannot prove WebKitGTK, WebView2, or
  WKWebView cursor geometry.

## Markdown rendering surfaces

- A Markdown syntax feature is incomplete until the editor, live/interactive
  rendering, PDF preview, and generated PDF all preserve and render it.
- Put syntax and transformation cases in focused editor and printable-renderer
  tests. Extend the consolidated real-browser preview/export contract with one
  representative case only when the browser rendering boundary changes;
  preview and export may share a renderer, but their workflow wiring must
  remain asserted without multiplying equivalent end-to-end cases.

## All UI elements must be deliberately styled

- Every new or changed visible element must use Figaro's theme tokens and
  established component language. Shipping raw browser or operating-system
  defaults for controls, menus, dialogs, states, spacing, or typography is not
  considered complete.
- Style every state the user can encounter, including hover, keyboard focus,
  active/open, selected, disabled, loading, empty, validation, and error states
  where applicable. Preserve accessible names, contrast, focus indication,
  reduced-motion behavior, and keyboard operation while styling.
- Cover structure, state, accessible names, and event handling in component
  tests. Add or extend a focused real-browser regression only when computed
  style, geometry, browser focus, or native event behavior is material and
  cannot be established in jsdom; do not create a browser workflow merely
  because an element is visible.

## Reuse the approved design system and require approval for new components

- Production UI and the visual catalogue must consume the canonical shared
  primitives in `frontend/design-system/primitives.css`. Reuse an approved
  primitive and semantic modifier before adding feature-local presentation;
  feature classes may retain behavior, placement, and deliberately different
  dimensions, but must not recreate shared hover, focus, active, selected,
  disabled, loading, validation, or error states.
- `frontend/design-system/approved-components.json` is the allowlist of
  approved component families, primitives, and variants. Adding a component
  family, a primitive, or a visual variant requires explicit user approval
  before implementation. A general feature request does not implicitly grant
  that approval. If no approved component can satisfy the requirement, stop,
  explain the gap and proposed addition, and ask for approval before writing
  the new component code or styles.
- Reusing an approved primitive, adding a narrow feature layout hook, or
  changing a component's content or behavior within its existing contract does
  not create a new component and does not require another approval.
- Every approved component change must keep the registry, production
  stylesheet link, catalogue specimen, audit, and focused design-system tests
  synchronized. The application stylesheet must not redefine canonical
  `.ui-*` primitive blocks.
- Keep semantic defaults in `frontend/design-system/tokens.css`, stable
  art-direction selectors in `frontend/design-system/theme-surfaces.css`, and
  bundled theme files as token-only `:root` overrides. Required and optional
  theme keys belong in `theme-contract.json`.
- Preserve the exact eager cascade recorded by
  `frontend/design-system/style-manifest.json` in the application, catalogue,
  and `frontend/styles.css` compatibility aggregate. New responsibility
  modules belong under `frontend/styles/`; do not replace explicit startup
  links with interaction-triggered loading.

## Prepare the Git handoff, but never commit

- Once requested work is complete and verified, write a concise, helpful
  proposed commit message to `.git/COMMIT_TEMPLATE`. Keep the repository's
  `prepare-commit-msg` hook configured to copy that proposal into a new plain
  `git commit`; do not configure `commit.template`, because Git rejects an
  otherwise valid commit when that template is saved without edits. The user
  must be able to review the proposed message and finish with an unchanged
  `:wq`.
- Before preparing every new change, review the existing proposal and rewrite
  it to match the complete pending work. Add newly completed features and
  remove or revise stale details from an earlier proposal, so the message is
  accurate even when several changes are prepared without an intervening
  commit.
- Never run `git commit` on the user's behalf except during an explicit
  `$prepare-figaro-release` invocation. That skill verifies the complete
  release and commits all current non-ignored repository changes with the
  generated metadata, then creates its local annotated tag. It publishes only
  those release refs when the user explicitly requests publication.

## Release-preparation skill

- When asked to prepare or publish a Figaro release, read and follow
  `skills/prepare-figaro-release/SKILL.md` in full. It owns the release
  target, metadata generation, verification, local commit and tag, and the
  explicit-publish boundary.
