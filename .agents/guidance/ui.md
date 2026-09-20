# Ui implementation requirements

Read this contract when routed here by the root AGENTS.md. It retains the
repository requirements; the feature index only helps locate implementation.

## All UI elements must be deliberately styled

- Every new or changed visible element must use Figaro's theme tokens and
  established component language. Shipping raw browser or operating-system
  defaults for controls, menus, dialogs, states, spacing, or typography is not
  considered complete.
- Style every state the user can encounter, including hover, keyboard focus,
  active/open, selected, disabled, loading, empty, validation, and error states
  where applicable. Preserve accessible names, contrast, focus indication,
  reduced-motion behavior, and keyboard operation while styling.
- Cover structure, state, accessible names, and event handling in component
  tests. Add or extend a focused real-browser regression only when computed
  style, geometry, browser focus, or native event behavior is material and
  cannot be established in jsdom; do not create a browser workflow merely
  because an element is visible.

## Reuse the approved design system and require approval for new components

- Production UI and the visual catalogue must consume the canonical shared
  primitives in `frontend/design-system/primitives.css`. Reuse an approved
  primitive and semantic modifier before adding feature-local presentation;
  feature classes may retain behavior, placement, and deliberately different
  dimensions, but must not recreate shared hover, focus, active, selected,
  disabled, loading, validation, or error states.
- `frontend/design-system/approved-components.json` is the allowlist of
  approved component families, primitives, and variants. Adding a component
  family, a primitive, or a visual variant requires explicit user approval
  before implementation. A general feature request does not implicitly grant
  that approval. If no approved component can satisfy the requirement, stop,
  explain the gap and proposed addition, and ask for approval before writing
  the new component code or styles.
- Reusing an approved primitive, adding a narrow feature layout hook, or
  changing a component's content or behavior within its existing contract does
  not create a new component and does not require another approval.
- Every approved component change must keep the registry, production
  stylesheet link, catalogue specimen, audit, and focused design-system tests
  synchronized. The application stylesheet must not redefine canonical
  `.ui-*` primitive blocks.
- Keep semantic defaults in `frontend/design-system/tokens.css`, stable
  art-direction selectors in `frontend/design-system/theme-surfaces.css`, and
  bundled theme files as token-only `:root` overrides. Required and optional
  theme keys belong in `frontend/design-system/theme-contract.json`.
- Preserve the exact eager cascade recorded by
  `frontend/design-system/style-manifest.json` in the application, catalogue,
  and `frontend/styles.css` compatibility aggregate. New responsibility
  modules belong under `frontend/styles/`; do not replace explicit startup
  links with interaction-triggered loading.
