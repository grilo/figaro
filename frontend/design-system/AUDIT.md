# Figaro UI audit

Audit snapshot: 2026-08-28. The approved consolidation is represented by the
[visual catalogue](index.html) and used by the production interface.

## Consolidated foundation

Eighteen approved families now use shared production
primitives in `frontend/design-system/primitives.css`. Both Figaro and this
catalogue load that canonical asset, and `approved-components.json` records the
approved selector set:

| Family | Shared primitive | Feature classes retain |
| --- | --- | --- |
| Settings pickers | `.ui-picker`, `.ui-picker-trigger`, `.ui-picker-menu` | Values, persistence, and shared `settingsPicker.js` combobox wiring |
| Steppers | `.ui-stepper`, `.ui-stepper-button`, `.ui-stepper-value` | Font-size, text-width, and bounded editable tab-size value policy |
| Compact actions | `.ui-button`, its quiet variant, and semantic variants | Labels, placement, and feature events |
| Segmented choices | `.ui-segmented-control` and its quiet variant containing `.ui-button` choices | Group labels, selected value, and feature persistence |
| Icon actions | `.ui-icon-button` and size variants | Accessible names, icons, and host-specific dimensions |
| Badges and counts | `.ui-badge`, `.ui-badge--muted`, and `.ui-badge--warning` | Count source and feature color roles |
| Menus and popovers | `.ui-menu`, `.ui-menu-item`, labels, and separators | Positioning and separate context, tabs, picker, and properties controllers |
| Tooltips | `.ui-tooltip` | Hint text, rich feature content, anchor selection, and lifecycle |
| Form fields | `.ui-field`, `.ui-field--quiet` | Context density, input type, validation policy, and value handling |
| Independent checkboxes | `.ui-checkbox` | Labels, semantic checked state, and feature-owned value mutation |
| Calendar days | `.ui-date-picker` and its grid/day primitives, including approved weekend, five-level note-density, selected-surface, and due-outline states | Anchor position, locale week policy, activity data, effective selection, and task mutation |
| Notices | `.ui-notice` and semantic variants | Message content, placement, and workflow lifecycle |
| Document tabs | `.ui-document-tabs--titlebar`, `.ui-document-tab--connected`, `.ui-document-tab--side-connected`, and state modifiers | Title-bar or sidebar placement, overflow geometry, ordering, drag placement, and tab controller behavior |
| Editor folding | `.ui-editor-fold-control`, `.ui-editor-block-guide` | Source-code fold ranges, editor-sized heading/fenced-code/table/Draw.io labels, and CodeMirror gutter behavior |
| Graph canvas | `.ui-graph-canvas` | Node/edge drawing, hit testing, pan/zoom, keyboard selection, and refresh lifecycle |
| Indeterminate activity | `.ui-spinner` | Delayed visibility, status text, busy ownership, and operation lifecycle |
| Content skeletons | `.ui-skeleton` | Calendar grid and Kanban column/card geometry, loading ownership, and replacement lifecycle |
| Determinate progress | `.ui-progress` and `.ui-progress-value` | Numeric value, label, compact host geometry, and update policy |

The primitives own the repeated border, radius, surface, typography, focus,
hover, active, disabled, busy, selected, and semantic-color rules. Existing
feature classes remain as behavior selectors and deliberate layout hooks; they
must not recreate the primitive's state language.

Calendar's approved Timeline variant uses the shared segmented-choice and icon
button primitives for presentation/range navigation. Its `.calendar-timeline-note`
feature variant owns the approved 8px stacked note geometry and derives any
note-specific tonal surface and Lucide icon from the same direct appearance
entry as the file tree; its hover, focus, active, loading, and error states stay
within the Calendar surface contract. The track and ordinary day columns reuse
the main workspace surface, while locale-weekend columns alone retain the
former subtle Timeline tint. Grab/grabbing cursors, temporary selection
suppression, three-day wheel scrolling, and continuous edge paging remain feature-owned
input/layout behavior rather than another component state. Its six-week sparse
buffer and disposal on workspace exit do not introduce another visual family.

The approved graph-canvas primitive owns its stable surface, grab, panning,
loading, focus, touch, and selection-suppression states; hovering does not tint
the complete canvas. The adapter supplies inherited/custom node color and icon
pixels, arrow pixels, persistent trace behavior, the fixed layout policy,
floating composition of existing field/button/icon-button primitives, and
status wiring. The pressed Orphans choice reuses the ordinary `.ui-button`
contract already exercised by Card density rather than adding a graph variant.

Compact buttons distinguish unavailable input from active work: native
`disabled` uses the ordinary unavailable cursor and opacity, while a disabled
button marked `aria-busy="true"` (or the equivalent behavior hook) retains the
wait cursor. Validation failures therefore never masquerade as background
activity.

The approved `.ui-button--quiet` variant supports low-emphasis source and
disclosure-adjacent actions. It removes resting border and surface paint, uses
muted text, and restores the standard tonal surface, normal text, and focus
halo when relevant. Expanded Properties applies it to **Edit YAML** with the
existing `FileCode2` glyph; the frontmatter hook owns only header density and
the source-reveal event.

The connected rounded title-bar rail combines its document-tab family with the approved
`.ui-icon-button`, `.ui-menu`, and `.ui-menu-item` primitives. Its
shell alignment, overflow-only visibility, offset-preserving overflow
measurement, bounded navigation, scroll geometry, and theme-token edge fades
remain narrow tab-layout behavior rather than another button or menu variant.
The first tab is flush with the buffer boundary in both short and overflowing
rails. The shared sidebar rail paints outward onto that same boundary pixel,
so bordered themes do not show adjacent file-tree and tab rules; borderless
themes remain transparent. The two-ended filename treatment and muted
parent-path copy are content/layout hooks within that same approved tab and
menu family. Empty rail content needs no special visual-state marker: the
title bar—not the rail—owns the
lower-divider token, while an opaque active connected tab can stack above and
cover only its segment of a visible line. Empty and inactive rail space
therefore cannot produce a startup, final-tab, or right-controls kink. Figaro
Dark and Figaro Light deliberately make that divider and the tab outline
transparent, using the shared editor surface as their only selected-tab fill.
Connected title-bar tabs use the shared 8px radius on their top corners. Their
active state keeps square lower corners but adds two pointer-transparent radial
feet with inverse 8px curves, yielding those feet to drag/drop indicators and
retaining the borderless editor seam without a pill silhouette. Overflow
reveal includes their full radial bounds rather than clipping a foot or leaving
a false edge fade.
The workspace layout reuses the same radius at its top-left corner whenever the
active title-bar tab is not first; a selected first tab suppresses that host
radius so the approved connected-tab surface remains continuous. Visible theme
divider and sidebar-rail paint pauses around the rounded host corner and returns
in the square state. Its host underlay matches the sidebar surface rather than
the application canvas, preventing either source of a faded-square silhouette.
While the inactive first tab is hovered, the underlay reuses its approved hover
surface and the tab stacks above the unchanged 1px divider mask so the junction
has neither a contrasting wedge nor a double-painted line.
The approved side-connected modifier rotates that same browser-tab contract
onto the left workspace edge: inactive destinations remain flat, while the
selected Calendar, Kanban, or Graph control keeps rounded left corners, removes
all tab borders, opens its right edge, and uses two radius-matched radial
corners to round that edge's junctions into the semantic workspace surface
above the sidebar rail. The modifier keeps every border channel explicitly
transparent and limits its transition to surface/text paint, preventing a
zero-width border from interpolating through the light text color during a
pointer selection. The `.sidebar-workspace-tab` hook owns footer and
collapsed-rail reach, plus suppressing an idle theme resizer tint while a side
tab is selected; resizer hover, keyboard focus, and drag feedback remain
visible. Shared tab hover, focus, selected, and theme states remain in the
primitive family.
CRT Phosphor keeps its outer navigation glow without a redundant inset rule.

Kanban keyboard focus reuses the existing card surface and global focus token;
it does not introduce a new component state. Home's small instructional copy
uses the established `--text-muted` semantic token so all three Figaro themes
meet contrast without a feature-specific color.

Editor folding uses the approved typed block guide for Markdown and the
approved disclosure control for source-code regions. CodeMirror retains
ownership of fold ranges, announcements, pointer dispatch, and keyboard
commands; the shared primitives own only their themed interaction states.
Expanded controls now use the approved primitive's quiet rest state and reveal
through a measured proximity class, gutter hover, caret relevance, or keyboard
focus. A folded control stays visible. This is a visibility policy within the
existing component contract, not a new visual variant.
The rendered table's direct delete action reuses the approved danger-ghost
button; its side-lane placement and narrow-width flow within the measured widget
are table-layout hooks rather than a new component or visual variant. Its
cell-local row and column commands reuse the approved menu, label, separator,
disabled, focus, and hover states without adding a table-menu variant.
Standalone Draw.io images reuse the same approved two-guide stack as Mermaid:
`drawio` owns the whole-image fold and `editor` opens the editable target. The
feature hook carries only source coordinates and busy ownership; it adds no
primitive, state, or visual variant.

The title-bar `?` help trigger reuses the approved icon button. Its Markdown,
Macros, and Shortcuts topic tabs use the approved compact button and accent variant; the
tablist layout, spacious viewport-bounded popover geometry, contained topic
scrolling, and content switching add no new component family or visual state.
Recently deleted reuses Settings sections plus the approved compact
action. Backlink, History-count, and status Undo controls are native buttons
whose existing status typography remains deliberately link-like, including the
pointer cursor. File-menu shortcut text is a muted content-alignment hook
inside the approved menu item, not a new menu state or variant.

The two-region footer is a shell-layout correction, not a new component family
or visual variant. Its application-status region reuses the approved progress,
spinner, tooltip, and native inline action while following the shared sidebar
width plan; its buffer-status region retains the existing telemetry and native
history/backlink actions, arranged as a left-anchored state group and a
right-anchored document-metrics group. `--application-status-surface` lets
themes join the left region to navigation without duplicating status selectors.
The ordinary-writing rest treatment preserves that same 24px shell and content:
it clears every item while hover, focus, progress, activity, errors, and actions
restore the full presentation. Only the application-status contents change
opacity; its region remains fully
opaque so `--application-status-surface` continues the sidebar plane rather
than blending with the buffer surface. It therefore adds no compact-footer
component family.

Calendar reuses that exact footer shell instead of removing it: the 24px row
and file-tree-aligned application-status region remain painted and live, while
the buffer-status region uses `visibility: hidden` plus suppressed pointer
events. This keeps Calendar/Kanban/Graph workspace geometry stable, removes the
irrelevant telemetry from paint, focus, hit testing, and the accessibility
tree, and introduces no new footer variant.

Pure mode is likewise a shell composition state, not a new component
or visual variant. It repositions the approved titlebar tabs, icon buttons, and
two-region footer as edge overlays and lets the existing collapsed rail remain
the spatial anchor. At
rest, `theme-surfaces.css` resolves the titlebar to transparent and derives its
hover/focus reveal from `--editor-surface`; the footer retains its existing
theme surfaces. The 28px resting approach band gives the transparent title bar
a deliberate pointer target without occupying its full revealed height.
Pointer proximity and `:focus-within` expose the complete title-bar controls.
Document outline remains omitted, and the transparent non-interactive footer
exposes only its real word-count node at bottom-right; neither pointer/focus nor
meaningful status restores the other controls. The application live region
remains assistive-only and hidden actions cannot receive focus. The shared
reduced-motion tokens make the title-bar transition immediate when requested.

The editor's border budget is a surface policy rather than a component family.
Rendered code and both Properties states use the same `--hover-bg`, 8px radius,
and borderless unelevated surface; collapsed metadata and unused
source-footprint space also drop decorative outlines. Table grids, individual
fields, internal dividers, errors, focus, and semantic interaction states retain
their existing boundaries. Quiet code-copy paint is likewise an interaction
state within the rendered code surface.

The explicitly approved `.ui-checkbox` family replaces native webview paint for
independent selections in Properties and dialogs. The primitive owns its theme-
token rest, checked, hover, focus, disabled, checkmark, and reduced-motion
states; feature classes retain only behavior and layout. Settings switches and
source-coupled Markdown task checkboxes remain deliberately distinct.

The sidebar extends that budget through the explicitly approved quiet field
variant: Search notes keeps the shared filled field, focus halo, disabled, and
validation states while its resting and hover border is transparent. Quick
Note keeps its accent icon and focus halo with an invisible
geometry-preserving border; its resting surface uses a 3% primary-text/sidebar
mix and its relevant state reuses the standard hover token rather than another
red accent surface. Its
muted `INBOX` destination and the file tree's ordinary Inbox Mail glyph remain
unchanged. File-tree operation selection keeps its
accent-tinted surface, heavier label, `aria-selected`, and independent keyboard
outline without the former leading stripe or selected-row shadow.
Its compact result-count badge is conditional result feedback rather than
permanent field decoration: the badge remains hidden until matching results are
open and leaves with that result interaction. The existing icon-button family
also now carries distinct semantics without a new variant: `PanelLeft` toggles
workspace navigation and `ListTree` opens the active document hierarchy. Both
production mappings are repeated in the catalogue.

Raw Text Preview's **Copy to Clipboard** action reuses the approved primary
`.ui-button`; its toolbar grouping, exact-source scroll following, clipboard
lifecycle, and live status are feature behavior rather than a new component or
button variant.

A failed local Draw.io image reuses the approved accent `.ui-button` for both
its Create and Open actions and the
approved `.ui-spinner` inside the image widget's existing one-source-line
footprint. The `.cm-drawio-action-button` hook owns only that host geometry;
canonical primitives continue to own hover, focus, disabled, busy, and theme
paint, so these action states add no component family or visual variant.

Calendar and Kanban reuse the approved `.ui-skeleton` surface while their
feature classes retain only the dimensions that foreshadow the month grid,
columns, and cards. The primitive owns the theme-derived fill and moving
highlight, becomes static under reduced motion, and stays hidden from the
accessibility tree behind each view's explicit busy/status announcement.

The file tree reuses its established selected surface exclusively for single
and multiple operation selection, the global focus token for independent
roving focus, and `--warning-color` for unsaved buffers. Selection deliberately
uses surface and weight instead of a leading stripe or shadow. The active document
retains non-visual `aria-current` semantics while the active tab carries its
visible state. The explicitly approved `cut-marked` feature variant adds only a
compact scissors indicator through the established trailing-status geometry;
it does not introduce another row surface or theme token. Managed-only files
use semantic default icons and normal opacity rather than a disabled-looking
state. Their hover/focus explanation reuses the approved `.ui-tooltip` surface
in a viewport-positioned overlay; the file-tree hook owns only its placement,
content, and lifecycle.

The central Calendar workspace and due-date popup both reuse the approved date-picker day
primitive and one shared presentation plan at their narrow grid dimensions.
Its explicitly approved modifiers derive weekend
muting from neutral theme tokens, five note-density levels from
`--success-color`, the movable selected surface from `--accent-color`, and the
independent due outline from `--danger-color`. Calendar's narrow layout hook
applies the established selected state to Today until another actionable day is
chosen, then reveals the unselected day's activity surface; the normal focus
ring remains reserved for keyboard focus.
The activity tooltip reuses the approved `.ui-tooltip` surface; the shared
calendar adapter owns only its compact content, viewport placement, and
hover/focus lifecycle. The popup retains only overlay positioning plus its
shortcut and footer layout, so this parity change adds no component family or
visual variant. No bundled theme receives a calendar-specific hue or selector.

The eager tooltip controller converts ordinary static and dynamically mounted
`title` hints into one body-level `.ui-tooltip`, opens it after a short hover or
immediately on keyboard focus, associates it with the anchor through
`aria-describedby`, clamps or flips it within the viewport, and dismisses it on
Escape, activation, scrolling, resizing, or window blur. Iframe `title` values
remain untouched because they name embedded documents. Disabled switch inputs
delegate hover geometry to their visible labels. Markdown link previews reuse
the same surface and retain only their structured link/status content locally.
CodeMirror diagnostic and autocomplete panels are interactive popovers—not
concise hints—and retain their separately themed library structure.

The shared control-size tokens (`--ui-control-height`,
`--ui-compact-height`, and `--ui-badge-height`) and radius/padding tokens make
future density changes coherent without adding another feature-specific rule.
All primitive dependencies remain eagerly available in the ordered style
manifest. Shared defaults and optional art-direction values live in
`tokens.css`; `theme-surfaces.css` applies the latter through stable selectors,
so all 18 theme files now contain token overrides only. Figaro CRT Phosphor
adds no component variant: shared tokens supply its borderless overscan,
repeating dither and scanline textures, inset glass shadow, phosphor bloom,
independent glass motion, and beam layer. Both overlays are
pointer-transparent, and reduced-motion preferences remove their animations
while leaving the static treatment intact.

The native Dark/Light flattening uses this same approved surface contract, not
a new component or variant. Optional titlebar-divider, sidebar-tools-divider,
sidebar-resizer, editor-gutter, application-status, and status-separator tokens
let both palettes share the titlebar/file-tree/application-status and
active-tab/gutter/editor/buffer-status planes, remove incidental
seams, and preserve the two separators that still communicate grouping.
Figaro Dark now gives the shared reading-plane token a modest luminance lift;
the same approved token continues to style the active tab and buffer together,
so the improvement adds neither a seam nor a component-local override.

## Intentional differences

| Family | Decision | Reason |
| --- | --- | --- |
| Cards and panels | Keep layouts distinct; share theme tokens only | Settings, Home, Kanban, results, Vault health, and Properties have different hierarchy and interaction |
| Switches, independent checkboxes, and task checkboxes | Keep separate semantics; independent selections share `.ui-checkbox` | Persistent settings are switches, while Markdown tasks mutate source and keep editor-specific hit geometry |
| Menu controllers | Keep separate behavior | Context commands, tab selection, select-only pickers, and editable Properties fields have different state and keyboard policy |
| Feature layout hooks | Keep narrowly scoped | A tab close control, dialog action, or Properties field may need a different host dimension without owning another visual system |

## Architecture contract

1. Add a shared primitive only when it removes real duplication across
   features. A feature class may describe layout or behavior, not restate the
   shared visual states.
2. Preserve native semantics and keyboard operation. Shared appearance is not
   permission to merge unrelated controllers or state policies.
3. Keep deterministic variant decisions independent from DOM and backend
   effects. DOM code applies the chosen primitive and modifier classes.
4. Keep catalogue specimens on production classes. `catalog.css` may contain
   only review-shell and specimen-containment rules.
5. Initialize production and catalogue modules eagerly; do not introduce
   first-interaction imports.
6. When changing a primitive, inspect default, hover, focus, active/open,
   selected, disabled/busy, validation, and semantic states in both a dark and
   light theme.
7. Adding a component family, primitive, or visual variant requires explicit
   approval before implementation and a matching registry update. Reusing an
   approved primitive or adding a narrow host-layout hook is not a new
   component.
8. Keep themes selector-free. Add shared semantic values to `tokens.css`,
   register the contract in `theme-contract.json`, and keep the eager cascade
   synchronized through `style-manifest.json`.

## Verification

- `tests/frontend/unit/designSystemCatalog.test.js` verifies all eighteen
  families in both the catalogue and production sources, enforces exact
  agreement between the approved registry and canonical stylesheet, rejects
  the superseded picker/stepper/action rule blocks, verifies theme-derived
  Calendar activity modifiers plus graph canvas states, and keeps cards
  and toggles intentionally distinct.
- Existing component tests retain ownership of dialog, Settings, frontmatter,
  tabs, and feature behavior.
- `pickerModel.test.js` and `settingsPicker.test.js` own the shared appearance
  picker's arrow/Home/End/Enter/Space/Escape/Tab policy, labelled combobox and
  listbox semantics, active descendant, selection, and pointer choice. The
  catalogue specimen runs that production controller rather than a static copy.
- `tests/e2e/designSystemCatalog.spec.js` is the single computed-style
  boundary: it checks themed picker and tooltip paint, tooltip hover/focus and
  Escape behavior, shared stepper backgrounds, the primitive inventory, theme
  switching, and direct-`file://` operation.

## Later review, not part of this merger

- Evaluate shared surface/elevation tokens for cards without merging their
  layouts.
- Continue reducing literal spacing and radius values when a changed feature
  provides a clean, tested seam; do not perform a mechanical whole-file
  rewrite.
