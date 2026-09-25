# Repository implementation requirements

These requirements apply to every change in this repository.

For read-only audits and discussions, report findings without changing product
files, release metadata, or the commit proposal. Repository skills are discovered
under `.agents/skills/`; use the release skill for release preparation and the
PKM audit skill for requested editor UX audits. Skill maintenance or an audit of
a skill does not authorize running its product-changing workflow.

## Start with the feature index and load the applicable contracts

- Start implementation with `npm run context` to list routes, then
  `npm run context -- <feature>` for only that area's paths, symbols, and sections.
  When the route is already known, skip the list. Use `docs/FEATURE_INDEX.md` as
  a browsable fallback, reading the selected section instead of the whole index.
  Read the relevant symbols and sections first; widen the search when callers,
  shared contracts, failures, or cross-feature effects require it. Keep complete
  logs on disk and report focused failures and summaries.
- Before changing behavior or tests, read `.agents/guidance/testing.md` and the
  applicable contract linked from `docs/TESTING.md`.
- Before changing CodeMirror, cursor/widget behavior, or Markdown syntax, read
  `.agents/guidance/editor.md`. Before changing visible UI, CSS, theme tokens,
  or design-system components, read `.agents/guidance/ui.md`. New component
  families, primitives, and visual variants still require explicit user approval.
  These are explicit read requirements even when working from the repository root;
  do not rely on automatic discovery of nested instruction files.
- When adding, moving, renaming, splitting, or removing modules, feature entry
  points, named source symbols, tests, documentation sections, or verification
  commands, update the affected routes in `docs/feature-map.json` in the same change. Update a route
  when ownership changes even if its old path still exists. Add a route for a
  new feature area; list entry points rather than every helper. A route's
  `docs` name the few sections that own current behavior; benchmarks and
  performance follow-ups go in its `history`, which `npm run context` shows
  only with `--history`. Regenerate
  `docs/FEATURE_INDEX.md` with `npm run context:generate`, then run
  `npm run context:check`. Before finishing, explicitly check that the index
  still describes the changed area. Never hand-edit the generated index.
- The index is a starting set, not an exhaustive dependency or test-selection
  oracle. Focused checks do not replace required integrity, architecture,
  broader coverage, or browser/native checks for affected boundaries.

## Changelog updates are part of every feature

- Every user-facing feature, behavior change, and bug fix must update
  `CHANGELOG.md` under `[Unreleased]` in the same change. A feature is not
  complete until its changelog entry describes the outcome in user-facing
  language.
- Keep entries concise and place them under Added, Changed, or Fixed as
  appropriate. Before finishing any implementation, explicitly check that the
  current feature has a matching changelog entry.
- Preserve the Keep a Changelog heading/category order and comparison-link
  contract. Release preparation must validate and publish the exact dated
  changelog section as the GitHub release notes; generated commit summaries are
  not a substitute.

## Keep all documentation synchronized

- Every change must audit and update every affected documentation surface in
  the same change. Everyday how-to belongs in the matching user guide listed in
  `docs/README.md`, and the detailed behavior contract in `docs/PROMPT.md`;
  update `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/TESTING.md`,
  `docs/LIVEPREVIEW.md`, and `docs/PDF_STYLING.md` whenever their subject is
  affected. A changelog entry alone is not sufficient documentation.
- Give each fact one owner and link to it instead of restating it. User
  guides own how-to, `docs/PROMPT.md` owns product behavior,
  `docs/LIVEPREVIEW.md` owns editor mechanics, `ARCHITECTURE.md` owns module
  boundaries and data flow, `docs/PDF_STYLING.md` owns print classes and CSS,
  and the testing docs say in a line which test owns which guarantee, without
  narrating its assertions. Keep sections under about 1,500 words so a route
  can point at one; add a subheading rather than growing a section.
- `README.md` is the product pitch, not a feature list. Change it only when
  what Figaro is, its headline capabilities, platforms, requirements, privacy
  stance, or limitations change. Never add fixes, performance or stability
  notes, settings, shortcuts, or edge cases to it; they belong in the
  changelog, a user guide, or the specification. Prefer replacing a sentence
  to adding one. A test enforces its word budget; move detail into a guide
  rather than raising the budget.
- Before finishing, run `npm run docs:stale -- <term> [term…]` for stale
  names, defaults, counts, commands, limitations, version numbers, and
  behavior descriptions related to the change. It searches the living
  documentation (not the changelog, generated index, benchmarks, vendored or
  fixture text) and prints one short line per hit. Explicitly confirm that
  every match is either updated or still correct.
- Release preparation must keep the version, license identifier, tag examples,
  changelog heading, package metadata, Wails metadata, and release workflow in
  agreement. Cut the accumulated `[Unreleased]` entries into the dated release
  section and leave a fresh `[Unreleased]` section for future work.

## Future implementation must preserve the dependency direction

- Keep pure decisions and transformations independent from filesystem, Wails,
  Git, browser-process, DOM, CodeMirror, timer, and global-state I/O. Application
  use cases may coordinate those effects only through explicit, injected ports;
  concrete adapters own the effects, and composition roots wire the layers.
- Apply this split to new features and to the portions of existing workflows
  changed by a task whenever an operation contains both deterministic decisions
  and external effects. Extract the decision as a pure plan, transformation, or
  reducer; keep effect execution in an adapter or use-case coordinator. Do not
  perform unrelated whole-system rewrites to reach an otherwise clean seam.
- Split behavior at those seams before merely dividing a large source file.
  Moving coupled logic and I/O into a smaller service is not an architectural
  improvement unless the logic becomes independently testable.
- Do not create ceremonial layers for a trivial pass-through that contains no
  policy, branching, sequencing, or reusable transformation. Introduce an
  interface only when a use case needs to substitute, constrain, or test a real
  effect boundary.
- Declare narrow interfaces beside the use case that consumes them. Preserve
  root-scoped `os.Root` adapter tests for path containment, symlink safety,
  atomic replacement, permissions, and rollback; an in-memory fake cannot
  establish those properties.
- Eagerly load and initialize bundled application modules and feature
  dependencies during startup. Do not add interaction-triggered `import()`,
  first-use module fetching, or feature-code lazy loading. Work that inherently
  depends on a user request or user data—such as opening a hosted Draw.io
  document, scanning Vault health, or generating a PDF—may remain
  demand-driven, but its application code and local dependencies must already
  be ready. The architecture suite rejects dynamic imports in first-party
  application modules; do not weaken that guardrail. Prove import direction and feature
  registration below the browser layer; keep one representative assembled
  startup check for post-ready module requests instead of adding an end-to-end
  startup case per feature.

## Git handoff, commits, and pushes

- Once requested work is complete and verified, write a concise, helpful
  proposed commit message to the path returned by
  `git rev-parse --git-path COMMIT_TEMPLATE`, so linked worktrees use their own
  Git metadata directory. Keep the repository's
  `prepare-commit-msg` hook configured to copy that proposal into a new plain
  `git commit`; do not configure `commit.template`, because Git rejects an
  otherwise valid commit when that template is saved without edits.
- Before preparing every new change, review the existing proposal and rewrite
  it to match the complete pending work. Add newly completed features and
  remove or revise stale details from an earlier proposal, so the message is
  accurate even when several changes are prepared without an intervening
  commit. State only verification that was actually run for the pending work.
- Commit or push only when the user asks. When asked to commit, refresh the
  proposal, stage all current non-ignored changes, and create a normal commit
  using the proposal as its message. When also asked to push, push the current
  branch to its remote. Report the commit and the push result. Never force-push, amend or
  rewrite pushed commits, skip hooks, or push a different branch or tag.
- A release request follows the release skill below, which covers its own
  commit, tag, push, and CI follow-through.

## Release skill

- When asked for a Figaro release, read and follow
  `.agents/skills/prepare-figaro-release/SKILL.md` in full. Tell the user
  whether the release is major, minor, or patch and why, then tag and publish
  that version, watch the GitHub workflows until the release is finished, and
  fix and retry any failure. A request only to prepare, check, or discuss a
  release does not publish.
