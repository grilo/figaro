# Repository implementation requirements

These requirements apply to every change in this repository.

## Changelog updates are part of every feature

- Every user-facing feature, behavior change, and bug fix must update
  `CHANGELOG.md` under `Unreleased` in the same change. A feature is not
  complete until its changelog entry describes the outcome in user-facing
  language.
- Keep entries concise and place them under Added, Changed, or Fixed as
  appropriate. Before finishing any implementation, explicitly check that the
  current feature has a matching changelog entry.

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
  agreement. Cut the accumulated `Unreleased` entries into the dated release
  section and leave a fresh `Unreleased` section for future work.

## Feature-specific tests are part of the feature

- Every new behavior and every bug fix must add or update a regression test
  that names and directly exercises that exact feature. A generic smoke test,
  an unrelated existing test, or a manual check alone is not sufficient.
- Test every affected boundary. A feature spanning the Go vault backend,
  frontend workflow, editor DOM, preview, or PDF export needs focused coverage
  at each affected boundary, including a real-browser test when layout,
  keyboard behavior, or printable output is involved.
- Before finishing, identify the user-visible acceptance cases (success,
  cancellation/error, and non-destructive collision behavior where relevant)
  and make each one observable in tests.

## CodeMirror cursor and widget contract

- Any CodeMirror extension, decoration, replacement, widget, keymap, or editor
  layout change must be checked for cursor movement. Test Arrow Up/Down across
  the changed region and every feature-specific key (for example table-cell
  arrows, Tab, Shift+Tab, and Enter), from both directions when applicable.
- Also verify mouse placement and drag selection around replaced source. Block
  widgets must obey the measured-height contract in `docs/LIVEPREVIEW.md` and
  be registered in `tests/frontend/unit/blockWidgetLayout.test.js`.
- Keep a focused automated cursor regression and run the native packaged
  webview check described in `docs/TESTING.md`; jsdom and Chromium cannot prove
  WebKitGTK, WebView2, or WKWebView cursor geometry.

## Markdown rendering surfaces

- A Markdown syntax feature is incomplete until the editor, live/interactive
  rendering, PDF preview, and generated PDF all preserve and render it.
- Add focused editor tests plus printable-renderer and real-browser PDF tests
  for the syntax feature. Preview and export may share a renderer, but both
  user workflows must remain explicitly asserted.

## All UI elements must be deliberately styled

- Every new or changed visible element must use Figaro's theme tokens and
  established component language. Shipping raw browser or operating-system
  defaults for controls, menus, dialogs, states, spacing, or typography is not
  considered complete.
- Style every state the user can encounter, including hover, keyboard focus,
  active/open, selected, disabled, loading, empty, validation, and error states
  where applicable. Preserve accessible names, contrast, focus indication,
  reduced-motion behavior, and keyboard operation while styling.
- Add a focused real-browser regression for visual UI work. Assert the
  component structure and meaningful computed styles or geometry, plus its
  keyboard/focus behavior; a jsdom-only assertion is not sufficient.

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
- Never run `git commit` on the user's behalf. Preparing the message and local
  template is the final handoff; the user owns the review and commit action.
