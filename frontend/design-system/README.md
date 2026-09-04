# Figaro design system

Segmented choices use the former Settings surface as Figaro's canonical
pill-shaped track. A separate `::before` highlight uses the shared
`--choice-selected-*` tokens and slides beneath equal-width options as
`aria-pressed` moves; the same CSS supports the app's one- through four-option
groups without feature-owned paint or script measurements. Quiet groups remove
only the outer border. Forced colors paint the selected button directly,
reduced motion removes the slide, and neither state replaces the explicit
keyboard-focus outline. Figaro Dark retains its red treatment, while Figaro
Light supplies the stronger warm control layer first established in Settings.
Calendar, Kanban, and Graph
controls share their upper-left workspace inset; feature styles own placement
only.

This directory is the review surface for Figaro's visual language. The
[component catalogue](index.html) displays the current production elements
after the approved primitive consolidation, including shared foundations,
intentional feature variants, states, selector names, and computed theme
tokens.

The approved file-tree warning and danger variants are supplemental states:
they retain the semantic/custom file icon and 24px row geometry, then add a
token-based inset tint and trailing alert glyph. The persistent file-attention
status action and its diagnostics reuse the existing semantic button, modal,
notice, and tooltip primitives. Its no-findings state has zero geometry even
though the shared button primitive loads later in the cascade; color is never
their only signal.

The catalogue is deliberately not a second component implementation:

- `index.html` contains mostly static specimens using the production classes
  from `primitives.css` and feature hooks from the responsibility modules under
  `frontend/styles/`. Controls
  whose open state is meaningful reuse their production controller;
  native-select comboboxes use `frontend/js/selectCombobox.js`, while
  Theme/Font appearance specimens use `frontend/js/settingsPicker.js`, rather
  than copying either behavior into the catalogue.
- `catalog.css` styles only the catalogue shell and constrains normally
  positioned overlays so their open states can be inspected.
- `themeCatalogModel.js` owns pure theme-manifest validation, stylesheet-path
  construction, and catalogue-search matching.
- `catalog.js` owns manifest fetching, DOM indexing, theme-link replacement,
  filtering, computed-token display, and eager wiring of those shared
  production controls.
- `catalogEntry.js` imports the canonical theme manifest and initializes the
  catalogue; `catalog.bundle.js` is its checked-in classic-script build so the
  same behavior works when `index.html` is opened directly over `file://`.
- `AUDIT.md` records the merged boundaries, intentional exceptions, and rules
  for future component work.
- `approved-components.json` is the explicit allowlist of component families,
  primitives, and variants. Extending it requires user approval before
  implementation.
- `tokens.css` defines shared semantic defaults, component dimensions, and
  optional theme art-direction values.
- `theme-surfaces.css` maps those art-direction values to stable production
  selectors; this includes structural divider/resizer and split-status-surface
  hooks plus inert-by-default vignette, anti-banding dither, repeating texture,
  inset glass shadow, phosphor bloom, glass animation, and beam hooks. Individual themes
  therefore never own selectors or timers, and reduced motion can disable both
  screen-effect layers centrally.
- `theme-contract.json` lists the required palette plus optional semantic and
  art-direction tokens, while `style-manifest.json` records the eager cascade
  shared by the application and catalogue.

Semantic defaults and shared component tokens live in `tokens.css`; shared
primitives live in `primitives.css`; responsibility-based feature CSS lives
under `frontend/styles/`. Every file under `frontend/themes/` is a token-only
`:root` override. Both the application and catalogue eagerly load these same
assets in manifest order. The `.ui-*` classes own repeated presentation and
interaction states; feature classes remain only for behavior and deliberate
host layout. The approved `.ui-spinner` is the shared indeterminate activity
indicator; feature controllers own its delayed visibility and accessible live
status instead of cloning its animation or paint. An ordinary disabled
`.ui-button` represents an unavailable action and uses no busy cursor; a
genuinely pending button also declares `aria-busy="true"` (or the equivalent
internal busy hook) so its wait treatment has explicit operation ownership.
The approved `.ui-button--quiet` variant removes resting border and surface
paint for low-emphasis actions while retaining themed hover, active, focus,
disabled, and busy behavior. Expanded Properties uses it for its icon-and-label
**Edit YAML** source action.
The approved `.ui-picker--quiet` and `.ui-stepper--quiet` variants give Settings
controls a borderless theme surface without changing their controller or value
policy. A quiet picker opened by pointer uses tonal open paint without a focus
halo; `:focus-visible` restores the halo for keyboard users. Menus remain
elevated but borderless. Disabled/busy and validation states remain explicit,
and forced-colors mode restores system borders, focus, and selected paint.
The Mermaid and Chart editors consume the quiet picker, field, stepper, and
segmented variants wherever each control applies. Their standalone **Replace
with template** and **JSON** actions use the ordinary outlined button, as do
Calendar Timeline's **Today**, file-diagnostic recovery actions, and the Table
Editor toolbar. Graph search consumes the quiet
field already used by Search notes. Feature selectors may arrange
or size those controls but do not own interaction-state paint. Modal and
pane surfaces omit decorative frames while preserving structural table grids,
code gutters, semantic states, and forced-colors boundaries; the Table Editor
adds one feature-owned structural divider between Rows and Columns.
The shared modal header visibly advertises **ESC to close** and its lifecycle
handles that shortcut independently of focused fields or embedded editors.
Transactional editors compose the approved warning notice and ordinary/danger
buttons for their inline pending-change confirmation; nested pickers close
before the modal.
The explicitly approved `.custom-modal--resizable` feature variant is limited
to the Table, Mermaid, and Chart editor compositions. It places the existing
`.ui-image-resize-handle` primitive at the lower-right corner and retains that
primitive's hover, focus, active, reduced-motion, and forced-colors language;
feature code owns viewport-safe geometry, keyboard resizing, the live size
readout, and session-only reset behavior. Generic modal specimens and production
dialogs do not inherit the variant.
Open select-only menus are temporarily mounted in the body overlay and placed
from the invoking control by the shared pure planner. They track scrolling,
flip above when necessary, clamp within the viewport, and return to their
owning component on close; Help and sidebar-search results remain intentional
inline regions.
The approved `.kanban-gantt-bar` button variant adds column-tinted, 8px task
bars with a softer completed state. Its colour/state rules live in primitives;
the feature owns timeline geometry, visible endpoint resize hit regions that
contract on one-day bars to preserve a center drag target, and
the single full-height current-day marker. Each endpoint renders the approved
image-resize dot centered on the painted edge, half inside and half outside,
while the feature-owned hit region remains inside the bar. The catalogue
shows ongoing, completed, and disabled bars alongside the shared controls.
Checklist date/column actions reuse the date picker and completion list: content
updates describe preferred-style date links and single-value replacement without
introducing a control or variant.
Kanban Board cards likewise compose ordinary buttons into compact Start and Due
pills and the existing icon button into a top-right actions trigger. Feature CSS
owns only card placement, pill dimensions, and semantic due-state color; the
shared primitives retain interaction states. The catalogue mirrors the two-pill
layout without introducing another component family or visual variant.
The approved `.ui-segmented-control` composes ordinary `.ui-button` choices
into one labelled, mutually exclusive presentation control. Its moving
selection pill is structural paint and never receives pointer events. The quiet
variant removes the resting outline for low-chrome surfaces while preserving
shared hover, selected, keyboard-focus, disabled, and busy states; Calendar uses that
variant for its session-only **Month / Timeline** choice and Kanban for
**Board / Gantt**. Its pill track is theme-relative rather than a fixed color.
The document-tab family also includes the approved
`.ui-document-tab--side-connected` modifier used by the persistent Calendar,
Kanban, and Graph destinations. It preserves the same inactive, hover, and
focus language as title-bar tabs, while its borderless selected state opens the
seam toward the central workspace, rounds both junctions with the shared tab
radius, and paints above the theme rail. It leaves every border channel
transparent and transitions only background/text color so pointer selection
cannot interpolate through a light border frame. Feature CSS
supplies its sidebar reach and masks only the idle resizer tint at the selected
row; direct resizer hover, focus, and drag feedback stays visible.
The workspace layout also reuses that radius for its top-left corner unless the
first title-bar tab is selected, in which case the connected surface stays
square at the shared edge. Feature layout also pauses any visible title-bar
divider and sidebar rail around that curve so they cannot draw a square beneath
the rounded workspace.
Active title-bar tabs use the shared 8px radius on top and inverse radial feet
at their lower junctions. The tab box retains square lower corners and no
bottom border, avoiding a detached pill while preserving the editor seam.
The missing-Draw.io Markdown Create/Open action is one such compact accent
button: its feature hook fits the existing image footprint, while the shared
button and spinner primitives own every interaction and busy state.
Its left-side `drawio` / `editor` controls reuse the approved editor block-guide
stack and busy state without adding another guide variant.
The progress family owns the
shared determinate track and value fill; hosts supply its value and geometry
without redefining those states. The approved stepper accepts either a
read-only value or a bounded numeric `.ui-stepper-value`; the latter suppresses
native spinner buttons so the shared decrement/increment controls remain the
only visible step actions while keyboard entry stays available. Graph uses the
approved canvas, field, button, and icon-button families: shared CSS owns their
themed pressed, focus, busy, and panning states while deliberately keeping the
canvas surface stable on hover. The feature adapter owns their floating layout,
appearance-derived drawing and icons, pan/zoom, hit testing, persistent tracing,
and modifier-driven note opening. The root
`frontend/styles.css` remains a synchronized
compatibility aggregate, not the production entry point.

## Open the catalogue

Open `index.html` directly from a file explorer, or start the static
development server:

```bash
go run ./cmd/devserver
```

Then open:

```text
http://127.0.0.1:34115/design-system/
```

All HTML asset references are relative, so direct-file and local-server modes
load the same production CSS, themes, fonts, icons, and catalogue behavior.
The referenced 32px brand icon is source-controlled so this remains true in a
clean checkout; larger application-icon derivatives are still generated only
for native packaging.
The theme selector is populated from `frontend/themes/manifest.json`; it does
not maintain another theme list. Selecting a theme replaces the catalogue's
theme stylesheet and refreshes the displayed token values without reloading
the page. Select-only Settings specimens use Figaro's labelled button/listbox
enhancement with the same arrow, Home/End, Enter/Space, Escape, and Tab contract
as production, because a native host popup cannot reliably inherit application
theme tokens.

## Maintain the inventory

When adding or changing a visible production element:

1. Check `approved-components.json`. Obtain explicit approval before adding a
   component family, primitive, or visual variant that is not registered.
2. Add or update its specimen under the relevant indexed section.
3. Use its shared primitive and production feature class rather than
   reproducing the component in `catalog.css`.
4. Preserve the production element's accessible markup and intrinsic icon
   sizing, then show meaningful default, disabled, selected, loading,
   validation, and error states where they exist.
5. Add searchable terms and show the production selector beside the specimen.
6. Update the registry and unit catalogue inventory if an approved component
   group is added or
   removed.
7. Keep one browser regression for manifest-backed stylesheet application;
   exhaustive theme records and search rules belong in the lower-level test.
8. After changing catalogue JavaScript or the theme manifest, run
   `npm run build:design-system`. The unit contract rejects a stale bundle.
9. When a feature needs a different dimension or placement, add a narrow
   feature hook; do not recreate the primitive's hover, focus, disabled, open,
   selected, validation, or semantic rules.
10. Add theme values to `tokens.css` and `theme-contract.json`, then consume
    them through shared selectors. Keep every bundled theme selector-free.
11. If the eager CSS cascade changes, update `style-manifest.json`, both HTML
    entry points, and the `frontend/styles.css` compatibility imports together.

Catalogue-only containment rules are acceptable for pinning menus, dialogs,
and loaders in view. They must not redefine the element's production visual
language.
