# Figaro design system

This directory is the review surface for Figaro's visual language. The
[component catalogue](index.html) displays the current production elements
after the approved primitive consolidation, including shared foundations,
intentional feature variants, states, selector names, and computed theme
tokens.

The catalogue is deliberately not a second component implementation:

- `index.html` contains mostly static specimens using the production classes
  from `primitives.css` and feature hooks from the responsibility modules under
  `frontend/styles/`. Controls
  whose open state is meaningful reuse
  their production controller; the themed select-only combobox is enhanced by
  `frontend/js/selectCombobox.js` rather than copied into the catalogue.
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
  selectors; individual themes never own selectors.
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
status instead of cloning its animation or paint. The progress family owns the
shared determinate track and value fill; hosts supply its value and geometry
without redefining those states. The approved stepper accepts either a
read-only value or a bounded numeric `.ui-stepper-value`; the latter suppresses
native spinner buttons so the shared decrement/increment controls remain the
only visible step actions while keyboard entry stays available. The root
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
the page. Select-only Settings specimens use Figaro's button/listbox
enhancement, because a native host popup cannot reliably inherit application
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
