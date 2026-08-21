# Figaro UI audit

Audit snapshot: 2026-08-21. The approved consolidation is represented by the
[visual catalogue](index.html) and used by the production interface.

## Consolidated foundation

Fourteen approved families now use shared production
primitives in `frontend/design-system/primitives.css`. Both Figaro and this
catalogue load that canonical asset, and `approved-components.json` records the
approved selector set:

| Family | Shared primitive | Feature classes retain |
| --- | --- | --- |
| Settings pickers | `.ui-picker`, `.ui-picker-trigger`, `.ui-picker-menu` | Selection policy, values, and controller wiring |
| Steppers | `.ui-stepper`, `.ui-stepper-button`, `.ui-stepper-value` | Font-size, text-width, and bounded editable tab-size value policy |
| Compact actions | `.ui-button` and semantic variants | Labels, placement, and feature events |
| Icon actions | `.ui-icon-button` and size variants | Accessible names, icons, and host-specific dimensions |
| Badges and counts | `.ui-badge` and semantic variants | Count source and feature color roles |
| Menus and popovers | `.ui-menu`, `.ui-menu-item`, labels, and separators | Positioning and separate context, tabs, picker, and properties controllers |
| Tooltips | `.ui-tooltip` | Hint text, rich feature content, anchor selection, and lifecycle |
| Form fields | `.ui-field` | Context density, input type, validation policy, and value handling |
| Calendar days | `.ui-date-picker` and its grid/day primitives, including approved weekend, five-level note-density, selected-surface, and due-outline states | Anchor position, locale week policy, activity data, effective selection, and task mutation |
| Notices | `.ui-notice` and semantic variants | Message content, placement, and workflow lifecycle |
| Document tabs | `.ui-document-tabs`, `.ui-document-tab`, and state modifiers | Overflow geometry, ordering, drag placement, and tab controller behavior |
| Editor folding | `.ui-editor-fold-control`, `.ui-editor-block-guide` | Source-code fold ranges, editor-sized heading/fenced-code/table labels, and CodeMirror gutter behavior |
| Indeterminate activity | `.ui-spinner` | Delayed visibility, status text, busy ownership, and operation lifecycle |
| Determinate progress | `.ui-progress` and `.ui-progress-value` | Numeric value, label, compact host geometry, and update policy |

The primitives own the repeated border, radius, surface, typography, focus,
hover, active, disabled, busy, selected, and semantic-color rules. Existing
feature classes remain as behavior selectors and deliberate layout hooks; they
must not recreate the primitive's state language.

The tab rail combines its document-tab family with the approved
`.ui-icon-button`, `.ui-menu`, and `.ui-menu-item` primitives. Its
overflow-only visibility, scroll geometry, and theme-token edge fades remain
narrow tab-layout behavior rather than another button or menu variant. The
two-ended filename treatment and muted parent-path copy are content/layout
hooks within that same approved tab and menu family.

Kanban keyboard focus reuses the existing card surface and global focus token;
it does not introduce a new component state. Home's small instructional copy
uses the established `--text-muted` semantic token so both native themes meet
contrast without a feature-specific color.

Editor folding uses the approved typed block guide for Markdown and the
approved disclosure control for source-code regions. CodeMirror retains
ownership of fold ranges, announcements, pointer dispatch, and keyboard
commands; the shared primitives own only their themed interaction states.
The rendered table's direct delete action reuses the approved danger-ghost
button; its side-lane placement and narrow-width flow within the measured widget
are table-layout hooks rather than a new component or visual variant.

The title-bar Markdown `?` reuses the approved icon button, and Recently
deleted reuses Settings sections plus the approved compact action. Backlink,
History-count, and status Undo controls are native buttons whose existing
status typography remains deliberately link-like, including the pointer
cursor. File-menu shortcut text is a muted content-alignment hook inside the
approved menu item, not a new menu state or variant.

Raw Text Preview's **Copy to Clipboard** action reuses the approved primary
`.ui-button`; its toolbar grouping, exact-source scroll following, clipboard
lifecycle, and live status are feature behavior rather than a new component or
button variant.

The file tree reuses its established selected surface exclusively for single
and multiple operation selection, the global focus token for independent
roving focus, and `--warning-color` for unsaved buffers. The active document
retains non-visual `aria-current` semantics while the active tab carries its
visible state. The explicitly approved `cut-marked` feature variant adds only a
compact scissors indicator through the established trailing-status geometry;
it does not introduce another row surface or theme token. Managed-only files
use semantic default icons and normal opacity rather than a disabled-looking
state. Their hover/focus explanation reuses the approved `.ui-tooltip` surface
in a viewport-positioned overlay; the file-tree hook owns only its placement,
content, and lifecycle.

The sidebar Calendar reuses the approved date-picker day primitive at its
narrow grid dimensions. Its explicitly approved modifiers derive weekend
muting from neutral theme tokens, five note-density levels from
`--success-color`, the movable selected surface from `--accent-color`, and the
independent due outline from `--danger-color`. Calendar's narrow layout hook
applies the established selected state to Today until another actionable day is
chosen, then reveals the unselected day's activity surface; the normal focus
ring remains reserved for keyboard focus.
The activity tooltip reuses the approved `.ui-tooltip` surface; Calendar owns only
its compact content, viewport placement, and hover/focus lifecycle. No bundled
theme receives a calendar-specific hue or selector.

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
so all 17 theme files now contain token overrides only.

## Intentional differences

| Family | Decision | Reason |
| --- | --- | --- |
| Cards and panels | Keep layouts distinct; share theme tokens only | Settings, Home, Kanban, results, Vault health, and Properties have different hierarchy and interaction |
| Switches and checkboxes | Keep separate semantics; share focus tokens only | Persistent binary settings are switches; independent selections remain checkboxes |
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

- `tests/frontend/unit/designSystemCatalog.test.js` verifies all fourteen
  families in both the catalogue and production sources, enforces exact
  agreement between the approved registry and canonical stylesheet, rejects
  the superseded picker/stepper/action rule blocks, verifies theme-derived
  Calendar activity modifiers, and keeps cards and toggles intentionally
  distinct.
- Existing component tests retain ownership of dialog, Settings, frontmatter,
  tabs, and feature behavior.
- `tests/e2e/designSystemCatalog.spec.js` is the single computed-style
  boundary: it checks themed picker and tooltip paint, tooltip hover/focus and
  Escape behavior, shared stepper backgrounds, the primitive inventory, theme
  switching, and direct-`file://` operation.

## Later review, not part of this merger

- Evaluate shared surface/elevation tokens for cards without merging their
  layouts.
- Revisit whether theme and font picker controllers can share more behavior
  only after their keyboard and persistence policies have a common contract.
- Continue reducing literal spacing and radius values when a changed feature
  provides a clean, tested seam; do not perform a mechanical whole-file
  rewrite.
