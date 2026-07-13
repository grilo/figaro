# Figaro architecture notes

This is a decision-oriented companion to the product specification. It records
the parts of Figaro whose implementation is intentionally less obvious than a
straightforward feature description. It is not an exhaustive API reference.

## Boundaries and source of truth

Figaro is a Wails desktop application with three deliberately separate layers:

- Go owns vault-scoped filesystem operations, settings, session repair,
  history, native window integration, and browser-backed PDF export.
- The frontend owns the workspace UI, CodeMirror editor, transient editor
  state, rendering, and accessibility behavior.
- The vault is the source of truth for notes and files. Figaro-specific state
  lives beneath the vault's `.config/` directory rather than in a database.

The Wails asset server embeds `frontend/` at package-build time. Backend code
may use an on-disk fallback during development, but a released application must
not depend on a package manager, CDN, or source checkout at runtime.

## Session state is not settings

`settings.json` stores durable preferences such as theme, fonts, and feature
choices. Open tabs, their ordering, and the active workspace state live in the
dedicated session record. Keeping them separate makes startup recovery
predictable: malformed, missing, or old session data can be discarded without
damaging user preferences. Compatibility cleanup removes legacy tab keys from
`settings.json` rather than trying to merge two competing sources of truth.

## Theme identity and generated assets

The built-in default theme ID remains `default` even though its user-facing
name is **Figaro Dark**. Saved preferences therefore continue to work after the
name change; the temporary `figaro-dark` ID is canonicalized back to `default`.

Browser modules, KaTeX assets, icon derivatives, and Wails bindings are
generated assets. The source material and generator scripts are tracked, while
the generated output is recreated before development and package builds. This
keeps the repository small while ensuring packaged applications are
self-contained.

## PDF preview: isolated frame and message bridge

The PDF preview must accept note-local CSS that can style `html` and `body`
without allowing that CSS to affect Figaro's interface. A normal application
`div` or shadow root is not sufficient: shadow DOM changes the styling contract
and selector behavior, while an unscoped `div` leaks user CSS into the app.

The preview therefore uses the fixed local frame at
`frontend/pdf/preview-frame.html`. It is sandboxed with `allow-scripts` only:

- It does **not** receive `allow-same-origin`, popup, form, or top-navigation
  permissions.
- It has a restrictive CSP and runs only Figaro's nonce-protected bridge
  script. Markdown source HTML is disabled, the generated body is sanitized,
  and user CSS is inserted as stylesheet text inside the frame.
- The frame applies print CSS to its actual `html` and `body`, preserving the
  documented PDF stylesheet behavior, including page and background rules.

The parent application never accesses `iframe.contentDocument` or a frame DOM.
That is essential: an iframe can become opaque or cross-origin in WebKitGTK,
and touching it after a navigation causes sandbox violations and can leave the
preview unusable.

Instead, the two contexts use a narrow `postMessage` protocol. Each load of
the fixed frame receives an unguessable bootstrap token in its URL fragment;
each render then receives its own token. The parent validates the frame
`WindowProxy`, bootstrap token, and render token, while the frame validates
that messages came from its parent. The bootstrap token matters after a bad
navigation: a foreign page retains the iframe's `WindowProxy`, but cannot
forge `ready` and receive the printable document snapshot.

| Direction | Messages | Purpose |
| --- | --- | --- |
| Parent → frame | `render`, `set-content-progress`, `set-document-progress`, `scroll-fragment`, `ping` | Supply the printable snapshot and synchronize position. |
| Frame → parent | `ready`, `rendered`, `render-error`, `scroll`, `link`, `reference-missing` | Report lifecycle, navigation requests, and scrolling. |

The frame captures anchor activation itself, before browser navigation:

- `#fragment`, table-of-contents, footnote, and return links scroll within the
  frame.
- `http(s)`, `mailto`, and `tel` URLs are sent to the parent, which uses the
  native Wails browser opener.
- Vault-local links are sent to the parent and opened through Figaro.
- Unsupported schemes stay in the frame and produce an explanatory status.

Scroll synchronization is deliberately lower-frequency than native scrolling.
The frame and CodeMirror each scroll locally at the display's normal cadence;
only the latest document-relative position crosses the bridge, at most about
30 times per second. Bursts are coalesced and a trailing update preserves the
final position. Programmatic editor movement is recognized as such so a delayed
browser scroll event cannot echo back into the preview. Do not make scroll
events a one-for-one bridge protocol: that makes WebKitGTK pay a cross-frame
message and a CodeMirror position update for every visual frame.

As defence in depth, the frame gives copied document links a blocked popup
fallback and the parent reloads the fixed bridge document if it stops reporting
ready. `postMessage('*')` is intentional here because a sandbox without
`allow-same-origin` has an opaque origin; the source/window and token checks
are the authentication boundary. No external document is allowed to become the
permanent preview.

When changing this code, do not reintroduce parent-side frame DOM access just
to simplify scrolling or link handling. Extend the protocol instead. The
browser-level tests must cover external links, fragments, footnote return
links, a vault-local link, closing the preview, and generating a PDF after a
link interaction.

## PDF rendering and export snapshots

`pdfExport.js` builds one semantic printable HTML contract used by both the
preview and the final browser export. It owns generated cover pages, tables of
contents, callouts, footnotes, task lists, and diagram replacement. The preview
adds only screen geometry and a selected stylesheet; the final export uses the
same body and default print CSS.

Before **Generate PDF**, Figaro saves the exact in-memory Markdown and selected
stylesheet snapshots used by the preview. This avoids a race where an edit is
visible in the pane but an older on-disk version is exported.

## Rename and link rewriting

File-tree rename is more than a filesystem move. It delegates path changes to
the vault layer and rewrites affected Markdown links, then updates open-tab
paths and refreshes backlinks. Treat a rename as a workspace-wide operation;
adding a second, frontend-only move path would bypass backlink consistency.

## Linux desktop integration

Linux desktop shells cache icon bitmaps aggressively. On startup, Figaro writes
a content-hashed icon filename, removes only older Figaro-owned icon resources,
refreshes icon and desktop caches, and points the launcher at the new path.
This is why the code looks more involved than a one-time `.desktop` install:
the goal is reliable upgrades on GNOME and Fedora, not merely a correct first
launch.

## Testing layers

Unit tests validate pure parsing, UI contracts, and bridge messages in jsdom.
jsdom does not enforce real iframe sandbox origins, so it cannot be the only
test for the PDF preview. Before releasing changes to the preview bridge, run
the real WebKitGTK/Wails path on Linux as well as the browser/PDF integration
tests. The regression suite should specifically prove that no user click can
navigate the preview frame away from Figaro's local bridge.
