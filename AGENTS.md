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
