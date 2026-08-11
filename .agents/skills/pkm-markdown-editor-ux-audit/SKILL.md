---
name: pkm-markdown-editor-ux-audit
description: >
  Perform a rigorous UI/UX audit of a desktop personal knowledge management,
  Markdown, note-taking, or text-editor application. Evaluate writing and editing
  mechanics, Markdown live preview, navigation, search, linking, information
  architecture, keyboard workflows, data trust, accessibility, visual ergonomics,
  perceived performance, and discoverability. Use Nielsen heuristics,
  ISO 9241-110 interaction principles, Cognitive Dimensions of Notations,
  WCAG 2.2/WAI-ARIA practices, and editor-specific heuristics. Produce
  evidence-backed, prioritized findings with actionable fixes.
---

# PKM / Markdown Editor UX Audit

## Mission

Audit this application as a serious **knowledge-work tool**, not as a marketing
website and not primarily as a visual-design exercise.

The application may resemble Obsidian, Typora, VS Code, Bear, Logseq, Notion,
iA Writer, or another Markdown/text editor, but do not assume that copying any
competitor is automatically correct.

The primary question is:

> How effectively can a person capture, write, edit, organize, connect, retrieve,
> and trust their knowledge without the interface interrupting their train of thought?

Treat uninterrupted thought and editing continuity as first-class UX requirements.

Do not modify the product during the audit unless explicitly instructed.

When browser/app automation, screenshots, accessibility trees, source code, or
runtime instrumentation are available, use them as evidence. Never claim to
have tested behavior you could not directly exercise or inspect.

---

# 1. Evaluation framework

Use five overlapping lenses.

## A. Nielsen usability heuristics

Evaluate:

1. Visibility of system status
2. Match between system and real world
3. User control and freedom
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency
8. Aesthetic and minimalist design
9. Error recognition, diagnosis, and recovery
10. Help and documentation

Do not merely produce ten headings and search for one issue under each.
Use them as diagnostic tags for observed problems.

## B. ISO 9241-110 interaction principles

Evaluate:

- Suitability for the user's tasks
- Self-descriptiveness
- Conformity with user expectations
- Learnability
- Controllability
- Use-error robustness
- User engagement

Pay particular attention to controllability and error robustness because editing
software manipulates valuable user-authored data.

## C. Cognitive Dimensions of Notations

Markdown is a notation, so evaluate the interaction between the notation and its
editor using these dimensions.

### Viscosity
How much work is required to make a conceptually simple change?

Examples:
- Renaming a note
- Changing heading structure
- Moving content between sections
- Reformatting a table
- Converting bullets to tasks
- Changing a link target
- Moving a note without breaking relationships

### Visibility / juxtaposability
Can the user see the information needed to understand or edit something?
Can relevant notes, backlinks, outline sections, search results, references, and
properties be inspected together when useful?

### Hidden dependencies
Does changing something unexpectedly affect something elsewhere?

Examples:
- Renames and backlinks
- Embedded blocks
- Aliases
- Properties/frontmatter
- Relative attachment paths
- Heading/block references

The interface should help expose consequential dependencies before or immediately
after they matter.

### Premature commitment
Does the application force organizational decisions before the user has enough
information?

Examples:
- Choosing a folder before capturing a thought
- Naming a note before writing it
- Choosing metadata before content exists
- Deciding where a pane belongs before opening something

### Error-proneness
Does the notation or UI invite accidental destructive edits, malformed Markdown,
broken links, lost selections, or unintended formatting?

### Hard mental operations
Does the user have to mentally translate between Markdown source, rendered
appearance, hierarchy, relationships, or UI state?

### Role expressiveness
Is the purpose of a control, syntax element, panel, property, link state, icon,
or formatting state evident from its presentation?

### Consistency
Once one editing behavior is learned, can similar behavior be predicted elsewhere?

### Secondary notation
Can whitespace, indentation, typography, color, positioning, folding, and other
visual cues help comprehension without changing the underlying Markdown?

### Progressive evaluation
Can users continuously see whether their work is producing the intended result?
This is particularly important for Live Preview.

### Provisionality
Can users sketch, write incomplete Markdown, create incomplete links, or defer
organization without fighting validation or modal workflows?

Do not assume every cognitive dimension should be minimized. Identify useful
trade-offs.

## D. Accessibility and keyboard interaction

Use WCAG 2.2 and WAI-ARIA Authoring Practices as reference points.

Check at minimum:

- Entire primary workflow operable by keyboard
- Logical focus order
- Clearly visible keyboard focus
- Focus is not hidden behind overlays or sticky UI
- Focus returns somewhere predictable after dialogs and menus
- Escape behavior is consistent
- Popovers and menus do not trap focus accidentally
- Tooltips are not the sole way of discovering essential information
- Drag-only operations have alternatives
- Small icon controls have sufficient hit area/spacing
- Editor has an accessible name
- Relevant state changes can be conveyed non-visually
- Selection is distinguishable
- Current/active state is not encoded by color alone
- Zoom does not destroy the workflow
- High-contrast or equivalent theme treatment remains usable

Pay special attention to conflicts involving `Tab`, because a text editor may
legitimately use Tab for indentation while keyboard users also need a way to
move focus out of the editor.

## E. Editor-specific UX heuristics

These are mandatory.

### E1. Cursor-neighborhood stability

Typing should not make nearby content unexpectedly jump.

Test:
- Moving into and out of formatted Markdown
- Headings
- Links
- Emphasis
- Code
- Lists
- Tables
- Images/embeds
- Properties
- Callouts

When syntax appears or disappears around the cursor, the visual position of the
text being edited should remain as stable as reasonably possible.

Flag:
- Horizontal jumps
- Vertical reflow
- Caret displacement
- Scroll jumps
- Sudden line-height changes
- Controls appearing directly under the pointer
- Formatting widgets that shift text

This is one of the highest-priority criteria.

### E2. Selection fidelity

Selection must behave like users expect from a high-quality text editor.

Test:
- Word selection
- Line selection
- Selecting across Markdown tokens
- Selecting rendered links
- Selecting across inline widgets
- Selecting across multiple paragraphs
- Shift+Arrow
- Ctrl/Cmd+Shift+Arrow
- Home/End
- Copy
- Cut
- Paste
- Drag selection
- Triple-click where applicable

Watch especially for invisible Markdown syntax producing surprising selection
boundaries.

### E3. Structural-edit predictability

Test Backspace, Delete, Enter, Tab, Shift+Tab, and paste around:

- Empty lists
- Nested lists
- Task lists
- Blockquotes
- Headings
- Fenced code
- Tables
- Links
- Embeds
- Frontmatter/properties

A structural convenience is a UX failure if users cannot reliably predict what
it will do.

### E4. Formatting/source continuity

Live Preview must feel like editing the same document, not switching between
unrelated representations.

Check:
- Markdown appears when necessary to edit it
- Rendering returns without distracting delay
- Entering source syntax does not radically change geometry
- Selections survive representation changes
- Undo behaves coherently across source/render transitions
- Malformed/incomplete syntax remains editable
- Users can access literal source when necessary

### E5. Source fidelity

The visual editor must not make the underlying Markdown feel unsafe.

Test several visual edits, then inspect the resulting Markdown.

Flag:
- Gratuitous rewrites
- Unexpected whitespace normalization
- Unstable formatting
- Reordered properties
- Escaped characters the user did not request
- Broken hand-written formatting
- Excessive document churn from tiny edits

A Markdown editor should respect that the source file itself may be valuable.

### E6. Undo integrity

Undo/redo should follow the user's mental model of actions.

Test:
- Typing words
- Deleting selections
- Formatting
- Paste
- Drag/drop
- Moving blocks
- Table edits
- Automatic formatting
- Rename/move operations where applicable

Flag undo steps that are too coarse, too fragmented, skip transformations, or
unexpectedly affect unrelated content.

### E7. Mode transparency

At every moment, users should understand whether they are:
- Editing
- Reading
- Navigating links
- Selecting
- Searching
- Editing a property
- Editing an embedded component
- Interacting with a table/widget
- Operating a command palette or modal surface

Avoid hidden modes.

### E8. Command locality

Frequently used actions should be available near the object being acted upon,
through predictable shortcuts, or through a searchable command system.

Do not demand that every command be visible at once.

Evaluate the balance between:
- Contextual controls
- Keyboard shortcuts
- Context menus
- Command palette
- Menus/toolbars

### E9. Spatial stability

Sidebars, tabs, toolbars, metadata, find widgets, hover controls, formatting
controls, and status indicators should not make the workspace repeatedly resize
during routine writing.

### E10. Writing focus

The document should remain the visual center of gravity while writing.

Flag persistent UI that competes with content without providing continuously
useful context.

Do not confuse "minimal" with "good". Dense professional interfaces are
acceptable when the density is useful and structured.

### E11. Information scent

Icons, labels, panel titles, context menus, link styling, search results, and
commands should give enough information to predict their effect before activation.

### E12. Data confidence

At all times users should be able to form an accurate mental model of:
- Whether the note exists
- Where it exists
- Whether changes are saved
- Whether synchronization is relevant
- Whether an external edit occurred
- What rename/move/delete will affect
- Whether destructive actions can be recovered

Uncertainty about user data is high severity.

---

# 2. Core knowledge-work journey

Audit the application as a continuous workflow, not disconnected screens.

Use this journey:

**Capture → Write → Structure → Connect → Navigate → Retrieve → Revisit → Revise**

Ask at every stage:
- How many interruptions occur?
- How often does the user leave the keyboard?
- How often must they change modes?
- How much UI state must they remember?
- How often is context lost?
- How reversible are actions?
- How confidently can they predict the result?

---

# 3. Mandatory task suite

Perform as many of these tasks as the application supports.

If functionality does not exist, mark it `N/A`; do not invent a failure.

Use `fixtures/MARKDOWN_TORTURE_TEST.md` where practical.

## T1 — Orientation

Start from the normal application state.

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

# 4. PKM-specific evaluation

A good PKM interface is not merely a good editor.

Evaluate these separately.

## Capture friction
Can an idea be recorded before it disappears?

## Refinding
Can something be retrieved when the user remembers:
- Title
- Approximate title
- One phrase
- Topic
- Linked concept
- Recent context

## Connection formation
How quickly can the user create meaningful relationships among notes?

## Relationship visibility
Are backlinks, outgoing links, tags, metadata, references, and hierarchy visible
when useful without permanently crowding the writing surface?

## Context preservation
After following a link, running a search, or opening a reference, can the user
easily return to the previous thought?

## Organizational flexibility
Can organization emerge gradually?

Avoid forcing a rigid taxonomy too early unless the product intentionally requires one.

## Scale behavior
Consider whether patterns that work with 20 notes still make sense with:
- 500 notes
- 5,000 notes
- Long titles
- Many backlinks
- Deeply nested structures
- Large search-result sets

Do not invent performance results you did not measure. Evaluate interaction
scalability separately from runtime scalability.

---

# 5. Visual and writing ergonomics

Evaluate the editor as an environment someone may stare at for hours.

## Typography
Check:
- Body readability
- Heading hierarchy
- Code differentiation
- Metadata differentiation
- Link differentiation
- Emphasis without excessive visual noise
- Legibility of muted text

## Measure
Check whether typical prose line length feels comfortable and whether users can
control or indirectly affect document width where appropriate.

Do not apply a rigid universal character count.

## Vertical rhythm
Paragraphs, headings, lists, code, tables, quotes, and embeds should feel like
parts of one document rather than unrelated components.

## Contrast hierarchy
Distinguish:
1. Document content
2. Active UI
3. Secondary UI
4. Disabled/inactive UI

Avoid making important navigation so faint that visual minimalism damages usability.

## Chrome density
Ask whether every persistent UI region earns its screen space.

## Icon comprehension
Flag unlabeled icons when their meaning cannot reasonably be inferred or learned
through consistent context.

## Hover dependency
Important controls should not become effectively undiscoverable merely because
they are hidden until pixel-perfect hover.

## Motion
Animations should clarify state or spatial relationship. Routine typing and
navigation should not feel animated.

---

# 6. Interaction-cost observations

For important tasks, record approximate:
- Clicks
- Keystrokes
- Context switches
- Mode switches
- Pointer travel
- Dialogs/popovers
- Times the document loses focus

Do not optimize blindly for the lowest click count.

A slightly longer interaction can be better if it is safer, easier to understand,
or easier to reverse.

Pay particular attention to repeated friction in actions performed dozens or
hundreds of times per day.

---

# 7. Severity model

Rate each observed issue:

## S0 — Not a usability problem
No action required.

## S1 — Cosmetic / polish
Noticeable imperfection with negligible effect on completion or concentration.

## S2 — Minor usability problem
Creates real friction but users can easily work around it.

## S3 — Major usability problem
Regularly interrupts work, causes confusion, makes an important workflow
substantially harder, or creates significant accessibility problems.

## S4 — Critical
Threatens user data, makes a core workflow unusable, creates severe loss of
context, or makes the application inaccessible for a major interaction mode.

Do not inflate severity merely because an issue is visually obvious.

---

# 8. Priority

Assign:

- **P0 — Fix immediately:** critical/data-risk/blocker
- **P1 — High:** major issue in a core repeated workflow
- **P2 — Medium:** meaningful friction or significant polish issue
- **P3 — Low:** opportunistic improvement

Priority must consider:
- Severity
- Frequency
- Importance of the affected workflow
- Number of users likely affected
- Whether the problem compounds over time

A tiny annoyance in every keystroke may deserve higher priority than a larger
issue encountered once per month.

---

# 9. Product scorecard

Score each category from 0–10 based only on observed evidence.

| Category | Weight |
|---|---:|
| Writing & editing mechanics | 25% |
| Navigation & refinding | 15% |
| Knowledge linking & organization | 10% |
| Information architecture & workspace | 10% |
| Data confidence, undo & recovery | 10% |
| Keyboard & accessibility | 10% |
| Visual/writing ergonomics | 10% |
| Discoverability & learnability | 5% |
| Perceived responsiveness & stability | 5% |

If a category genuinely does not apply, mark it `N/A` and reweight rather than
assigning an arbitrary score.

A high aesthetic score must never compensate for poor editing mechanics or data trust.

---

# 10. Evidence standard

Every reported problem must include direct observed evidence.

For each finding record:

**ID:** e.g. `EDIT-03`

**Title:** specific problem, not generic category.

Bad:
> Markdown editing is confusing.

Good:
> Entering a rendered link expands its syntax and shifts the remainder of the paragraph to the right.

**Severity:** S1–S4

**Priority:** P0–P3

**Confidence:** High / Medium / Low

**Framework tags:** examples:
`Nielsen-3`, `ISO-Controllability`, `CD-Viscosity`,
`Editor-Cursor-Stability`, `WCAG-Focus`

**Location:** exact screen/component/workflow.

**Evidence:** what was directly observed.

**Reproduction:** shortest repeatable sequence.

**Impact:** why this matters during actual knowledge work.

**Recommendation:** concrete behavioral/design change.

**Acceptance criteria:** observable conditions that would demonstrate the problem is fixed.

**Screenshot/reference:** when available.

Do not report speculative problems as facts.

If something merely appears suspicious but cannot be tested, label it:

> **Unverified concern**

and explain what test would confirm it.

---

# 11. Recommendation rules

Recommendations must describe desired behavior before proposing implementation.

Prefer:

> Keep the text baseline stationary when inline Markdown syntax is revealed.

over:

> Add 12 px padding to `.cm-formatting-link`.

Only propose implementation details when the cause is evident.

Do not recommend:
- Adding tooltips everywhere
- Adding confirmation dialogs everywhere
- Adding labels to every icon
- Removing features merely to achieve minimalism
- Making every action visible in a toolbar
- Copying Obsidian/Notion/VS Code without explaining why
- Redesigning the entire UI when a local fix is sufficient

Preserve efficient expert workflows.

When discoverability and expert efficiency conflict, consider progressive
disclosure, command search, shortcuts, contextual actions, or learnable conventions.

---

# 12. Things to praise

The audit must identify **patterns worth preserving**, not only defects.

For every strong behavior, explain:
- What works
- Why it supports knowledge work
- What regression would damage it

This prevents a later redesign from accidentally removing good interaction patterns.

---

# 13. Audit procedure

Perform the audit in this order.

## Pass 1 — Naive orientation
Use the app before examining implementation details.
Record initial assumptions and confusion.

## Pass 2 — Core knowledge journey
Run Capture → Write → Structure → Connect → Navigate → Retrieve → Revisit → Revise.

## Pass 3 — Editor mechanics
Run the Markdown torture note and Live Preview tests.
Spend substantial time here.

## Pass 4 — Keyboard/accessibility
Repeat core workflows without a pointer.
Inspect focus and accessible semantics if tooling permits.

## Pass 5 — Workspace and scale
Stress tabs, panes, sidebars, search results, filenames, note length, and window sizing.

## Pass 6 — Failure/recovery
Test reversible errors and unusual states.

## Pass 7 — Visual polish
Only after interaction problems are understood, audit hierarchy, spacing,
typography, density, alignment, consistency, and visual polish.

## Pass 8 — Implementation inspection
If source code is available, inspect it only after the experiential audit.

Use implementation evidence to:
- Validate root causes
- Identify systemic versus local issues
- Make recommendations more practical

Do not let knowledge of the implementation excuse poor behavior.

---

# 14. Final report format

Use `templates/AUDIT_REPORT_TEMPLATE.md` as the report skeleton.

Produce the report in this order:

1. Executive verdict
2. Scorecard
3. Top findings
4. Editing mechanics
5. Knowledge-work workflow
6. Keyboard and accessibility
7. Visual and writing ergonomics
8. What already works
9. Priority plan
10. Regression checklist

The executive verdict should state:
- Overall usability level
- Strongest aspect
- Weakest aspect
- Whether the editor disappears into the writing process or repeatedly calls attention to itself
- Highest-risk issue
- Most valuable improvement

Do not imply scientific precision in the score. It is a structured comparative heuristic.

---

# 15. Required mindset

Be demanding.

This is software for people who may spend hours per day writing and thinking.

Small repeated interruptions matter.

A one-pixel visual inconsistency is usually less important than a one-character caret jump.

A beautiful sidebar is less important than reliable refinding.

A clever Markdown renderer is less important than trustworthy selection and undo.

A powerful feature that cannot be discovered or controlled is incomplete UX.

A visual abstraction that damages the user's confidence in their plain-text
source is suspect.

A keyboard workflow that is two seconds faster but unpredictable is not
necessarily better.

The best editor interactions often feel unremarkable because the interface gets
out of the way.

Judge the product by how little unnecessary attention it demands while still
making its state, structure, and capabilities understandable.

---

# 16. Conceptual references

Use these as conceptual references rather than rigid checklists:

- Jakob Nielsen — Ten Usability Heuristics
- ISO 9241-110:2020 — Interaction Principles
- Green & Petre — Cognitive Dimensions of Notations
- W3C WCAG 2.2
- WAI-ARIA Authoring Practices Guide
- Established desktop editor interaction conventions
- Obsidian-style Live Preview as a comparison for Markdown/source continuity
- Mature keyboard-centric editor conventions such as development editors

Competitive products are benchmarks, not specifications.

The final goal is not:

> "Does this behave like Obsidian?"

It is:

> "Does this interaction support fluid, predictable, safe knowledge work?"
