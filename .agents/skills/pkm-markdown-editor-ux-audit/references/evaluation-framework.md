# Evaluation lenses

Consult the sections relevant to the selected audit scope: Nielsen, ISO,
Cognitive Dimensions, accessibility, editor mechanics, PKM, and visual ergonomics.
Use these to explain observed problems; they are not a quota of findings.

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

Prioritize the heuristics relevant to the selected audit scope.

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
