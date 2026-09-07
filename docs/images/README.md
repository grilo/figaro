# Documentation screenshots

These unmodified PNG captures show Figaro running in native Linux WebKitGTK on
2026-09-07. The demo notes describe a library evening and contain no private
user content.

| Image | What it shows |
| --- | --- |
| [Editor](figaro-editor.png) | Linked research notes, a table, and tasks in Figaro Dark |
| [Writing review](figaro-writing.png) | An in-place explanation and replacement for a wordy phrase |
| [PDF Preview](figaro-pdf.png) | The same note in the editor and the built-in print style |

The captures use an isolated 1280 × 850 Xvfb display, a disposable vault, and
the existing native verification build. Its development-only command bridge
opens notes and operates normal product controls; it does not change UI styling.
The bridge is not part of the release. The README and product specification
share the editor image. The other two images illustrate separate workflows.

When replacing screenshots, use authored demo content and keep the relevant
controls fully visible. Inspect readability at repository-page width.
Capture the real app without altering the image or adding simulated features.
Update image descriptions and their consumers in the same change.
