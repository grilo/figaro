# Editor implementation requirements

Read this contract when routed here by the root AGENTS.md. It retains the
repository requirements; the feature index only helps locate implementation.

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
