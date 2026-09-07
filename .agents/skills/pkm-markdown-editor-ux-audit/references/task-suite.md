# Full audit task suite

For a full audit, exercise supported tasks below. For a focused audit, select
the affected tasks and their immediate neighbors; record the remaining tasks as
not tested. Follow the setup and evidence boundaries in [SKILL.md](../SKILL.md).

If functionality does not exist, mark it **unsupported**; do not invent a failure.

Use [the working fixture](../fixtures/MARKDOWN_TORTURE_TEST.md) where practical.

## T1 — Orientation

Start from the normal application state in the owned disposable vault.

Determine without documentation:
- Current note
- Current workspace/vault/library
- How to create a note
- How to find a note
- Where navigation lives
- Whether the document is editable
- Where important secondary information lives

Record any ambiguity during the first 60 seconds.

## T2 — Capture

Create a note quickly from the current context.

Evaluate whether capture requires unnecessary organizational decisions.

Try creating another note without first selecting a folder/location.

## T3 — Basic writing

Write several paragraphs.

Perform:
- Word navigation
- Paragraph navigation
- Selection
- Copy/paste
- Undo/redo
- Find
- Replacement if supported

Assess typography, caret visibility, scroll behavior, line width, spacing,
selection contrast, and distraction.

## T4 — Markdown torture note

Create or load the torture-test fixture containing:
- H1, H2, H3 headings
- Several paragraphs
- Bold
- Italic
- Strikethrough if supported
- Inline code
- External link
- Internal/wiki link
- Unordered list
- Ordered list
- Nested list
- Task list
- Blockquote
- Fenced code block
- Horizontal rule
- Image or embed
- Table
- Properties/frontmatter if supported
- Callout/admonition if supported

Edit every structure from:
1. Before it
2. Inside it
3. Immediately after it

Test Arrow keys, Home/End, Enter, Backspace, Delete, Tab, Shift+Tab, selection,
copy/paste, undo, and redo.

This is the most important editor-mechanics test.

## T5 — Live Preview transition

For every rendered Markdown construct:
1. Approach it with the caret
2. Enter it
3. Edit its syntax
4. Exit it
5. Return to it
6. Select across it

Observe geometry and state transitions.

Explicitly report any:
- Content jump
- Cursor jump
- Scroll jump
- Width change
- Height change
- Selection discontinuity
- Flashing/re-rendering
- Loss of syntax visibility when needed
- Controls appearing in disruptive locations

## T6 — Paste behavior

Test:
- Plain text
- Multiline text
- Markdown
- URL over selected text
- Rich text from a browser if possible
- Text containing list indentation
- Table-like text

Record whether transformation is expected, discoverable, reversible, and source-safe.

## T7 — Navigation and refinding

With multiple notes available:
- Open a known note
- Find a vaguely remembered note
- Navigate back
- Navigate forward
- Switch between recent notes
- Use file tree/navigation if available
- Use quick switcher/command palette if available
- Open a result without losing useful context

Search once by title and once by remembered body text.

Evaluate result ranking, highlighting, context snippets, keyboard operation, and
return-to-previous-context behavior.

## T8 — Linking

Create an internal link to another note.

Then:
- Follow it
- Return
- Rename the target
- Inspect backlinks if supported
- Link to a heading/block if supported
- Create a link to something that does not yet exist if supported

Measure friction between the thought "these concepts are related" and successfully
encoding that relationship.

## T9 — Organization

Try:
- Rename
- Move
- Duplicate
- Delete
- Restore/undo delete
- Change metadata/properties
- Use tags/folders if supported

Observe whether organizational actions pull the user excessively away from the
document.

## T10 — Tabs, panes, and context

If supported:
- Open several notes
- Split the workspace
- Close/reopen
- Reorder
- Navigate between panes
- Resize panes
- Compare two notes

Check whether active pane, active note, and keyboard focus remain obvious.

Check whether the user can answer:

> "If I click this link or search result, where will it open?"

before doing so.

## T11 — Keyboard-only pass

Put the mouse aside.

Attempt the primary workflow:

**Find note → open → edit → format → follow link → return → search → create note → save/close**

Record every point where keyboard-only use:
- Fails
- Becomes undiscoverable
- Requires excessive Tab presses
- Loses focus
- Traps focus
- Produces ambiguous focus
- Conflicts with editor keybindings

## T12 — Visual resilience

Test where possible:
- Normal window
- Narrow window
- Maximized window
- 125–150% zoom/scaling
- Dark theme
- Light theme
- Long note
- Long filenames
- Deeply nested folders
- Many tabs
- Empty state

Look for clipping, overlap, weak hierarchy, tiny targets, text truncation,
horizontal scrolling, inaccessible controls, or loss of content focus.

## T13 — Failure and recovery

Test safe reversible cases:
- Accidental text deletion + undo
- Close/reopen note
- Rename
- Failed search
- Malformed Markdown
- Broken/missing internal link
- Missing attachment if practical
- Delete then recover if the product safely supports recovery

Never deliberately risk irreplaceable user data.

Evaluate how clearly the system explains unusual states.

---
