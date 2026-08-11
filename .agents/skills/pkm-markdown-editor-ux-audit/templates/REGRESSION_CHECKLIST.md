# PKM / Markdown Editor UX Regression Checklist

Use after editor, layout, navigation, or knowledge-management changes.

## Editing continuity

- [ ] Caret does not jump when Markdown syntax is revealed or hidden.
- [ ] Inline syntax reveal does not cause distracting horizontal movement.
- [ ] Block rendering changes do not unexpectedly shift scroll position.
- [ ] Line height remains stable while entering/leaving inline constructs where practical.
- [ ] Cursor remains visible in all editor states.
- [ ] Clicking rendered content places the caret where the user expects.
- [ ] Returning from a widget/editor preserves a sensible caret position.

## Selection

- [ ] Shift+Arrow works across formatting boundaries.
- [ ] Ctrl/Cmd+Shift+Arrow works across formatting boundaries.
- [ ] Selection across links is predictable.
- [ ] Selection across inline widgets is predictable.
- [ ] Selection across paragraphs and block structures is preserved.
- [ ] Copy preserves the intended text/source.
- [ ] Cut removes exactly the intended content.

## Structural editing

- [ ] Enter behaves predictably in plain paragraphs.
- [ ] Enter behaves predictably in lists.
- [ ] Backspace behaves predictably at list boundaries.
- [ ] Tab / Shift+Tab indentation remains predictable.
- [ ] Empty-list exit behavior is consistent.
- [ ] Code-block boundaries are easy to enter and leave.
- [ ] Table navigation remains predictable.

## Live Preview / source fidelity

- [ ] Markdown syntax becomes available when needed for editing.
- [ ] Rendered state returns without distracting delay.
- [ ] Malformed/incomplete Markdown remains editable.
- [ ] Tiny visual edits do not gratuitously rewrite large source ranges.
- [ ] Hand-written Markdown formatting is preserved where possible.
- [ ] Properties/frontmatter are not reordered unexpectedly.
- [ ] Escaping is not introduced unnecessarily.

## Undo / redo

- [ ] Normal typing groups into sensible undo units.
- [ ] Formatting can be undone cleanly.
- [ ] Paste can be undone cleanly.
- [ ] Table operations can be undone cleanly.
- [ ] Drag/drop operations can be undone cleanly.
- [ ] Rename/move operations have predictable recovery where supported.
- [ ] Undo never unexpectedly affects unrelated content.

## Navigation and refinding

- [ ] Search can be opened and operated from the keyboard.
- [ ] Search results expose enough context to choose correctly.
- [ ] Following an internal link preserves navigation history.
- [ ] Back returns to a sensible note, pane, caret, and scroll context.
- [ ] Active note remains obvious.
- [ ] Active pane remains obvious.
- [ ] Recent-note switching remains efficient.
- [ ] Long filenames do not make navigation unusable.

## Linking / PKM

- [ ] Internal links are quick to create.
- [ ] Renaming a linked note behaves predictably.
- [ ] Broken links have a clear state.
- [ ] Backlinks remain discoverable without dominating the writing surface.
- [ ] Uncreated links can be represented safely if supported.
- [ ] Heading/block references remain understandable if supported.

## Keyboard and focus

- [ ] Core workflow is possible without a mouse.
- [ ] Keyboard can enter the editor.
- [ ] Keyboard can leave the editor.
- [ ] Tab behavior does not create an inescapable focus trap.
- [ ] Escape closes transient UI consistently.
- [ ] Dialog/menu closure returns focus predictably.
- [ ] Visible focus is always distinguishable.
- [ ] Focus is not hidden beneath overlays.
- [ ] Drag-only actions have keyboard or menu alternatives.

## Visual ergonomics

- [ ] Body text remains comfortable at normal scale.
- [ ] Heading hierarchy is clear.
- [ ] Links remain distinguishable.
- [ ] Muted text remains legible.
- [ ] Selection contrast is sufficient.
- [ ] Current/active state is not conveyed by color alone.
- [ ] Narrow windows remain usable.
- [ ] 125–150% zoom/scaling remains usable.
- [ ] Many tabs do not obscure which tab is active.
- [ ] Hover controls do not cause layout jumps.

## Data confidence

- [ ] Save/persistence state is understandable.
- [ ] External file-change state is understandable if applicable.
- [ ] Rename/move consequences are understandable.
- [ ] Delete behavior is recoverable where expected.
- [ ] Missing attachments have a clear failure state.
- [ ] The editor does not silently lose or corrupt Markdown.

## Product-specific regressions

- [ ]
- [ ]
- [ ]
