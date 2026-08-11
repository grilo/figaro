---
title: Markdown UX Torture Test
aliases:
  - Editor Torture Test
tags:
  - ux-test
  - markdown
status: draft
---

# Markdown UX Torture Test

Use this fixture to stress editing mechanics. Do not merely inspect how it renders:
move the caret into, through, and out of every construct; select across boundaries;
edit syntax; undo; redo; paste; delete; and restore.

## Plain prose

This is an ordinary paragraph intended to expose typography, line wrapping,
selection behavior, caret visibility, and scroll stability. Edit words near the
start, middle, and end of the paragraph.

A second paragraph contains **bold text**, *italic text*, ***combined emphasis***,
~~strikethrough~~, and `inline code`. Move through every boundary using Arrow keys,
Ctrl/Cmd+Arrow, Home/End, and Shift-selection.

## Links

External link: [CodeMirror](https://codemirror.net/)

Internal link examples:

- [[Another Note]]
- [[Another Note|aliased link]]
- [[Another Note#Specific Heading]]

Try creating an incomplete link: [[unfinished

Test selecting from plain text before a link into text after the link.

## Lists

- First item
- Second item
  - Nested child
  - Another child
    - Third level
- Final item

1. First numbered item
2. Second numbered item
   1. Nested numbered item
   2. Another nested item
3. Final numbered item

- [ ] Open task
- [x] Completed task
- [ ] Task with **formatting** and a [[Another Note|link]]

Test Enter, Backspace, Delete, Tab, and Shift+Tab at the start, middle, and end of
each nesting level.

## Blockquote

> A blockquote containing **formatted text** and an [external link](https://example.com).
>
> A second quoted paragraph.
>
> - A list inside the quote
> - Another item

## Code

Inline transition test: before `const value = 42` after.

```ts
export function greet(name: string): string {
  return `Hello, ${name}`;
}
```

Move the caret before, inside, and after the fenced block. Test selecting across
the opening and closing fences.

## Horizontal rule

Text before.

---

Text after.

## Table

| Feature | Status | Notes |
|:--------|:------:|------:|
| Live Preview | Active | Edit this cell |
| Links | Working | [[Another Note]] |
| Inline Markdown | Test | **bold** / `code` |
| Long content | Pending | This cell intentionally contains a longer sentence to exercise width and wrapping behavior. |

Test:

- entering every cell;
- Tab and Shift+Tab;
- Enter;
- multi-cell selection if supported;
- copy/paste;
- adding/deleting rows;
- adding/deleting columns;
- alignment changes;
- undo/redo;
- editing inline Markdown inside a cell;
- entering and leaving the table repeatedly.

## Callout

> [!NOTE]
> This is a callout/admonition fixture.
>
> Edit the marker, title, and body separately if supported.

## Image / embed

![Alt text](example-image.png)

![[example-image.png]]

If the application can safely handle a missing attachment, observe the failure state.

## Escaping and punctuation

Literal characters:

\*not italic\*

\# not a heading

Pipe: \|

Backticks: ``code with ` inside``

Brackets: [ text ] ( text )

## Incomplete syntax

**unfinished bold

[unfinished link](

`unfinished inline code

> [!NOTE

```text
unfinished fenced block

## Long heading intended to exercise clipping truncation navigation outline behavior and horizontal geometry changes

Long uninterrupted token:

aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

## Final navigation target

Return here after following links or searching elsewhere. Verify that the previous
caret position, scroll position, active pane, and selection state behave sensibly.
