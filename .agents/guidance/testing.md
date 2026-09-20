# Testing implementation requirements

Read this contract when routed here by the root AGENTS.md. It retains the
repository requirements; the feature index only helps locate implementation.

## Testing strategy and feature-specific regressions

- Every new behavior and every bug fix must add or update a regression test
  that names and directly exercises that exact feature. A generic smoke test,
  an unrelated existing test, or a manual check alone is not sufficient.
- Put each assertion at the lowest layer capable of proving it. Prefer, in
  order: pure logic tests with plain inputs; use-case tests with small injected
  fakes; adapter or component tests using real temporary files, jsdom, or a
  concrete CodeMirror instance; then a small end-to-end or real-browser check
  only for a boundary that lower layers cannot represent.
- Test every affected boundary without duplicating the entire feature at every
  layer. Pure rules, cancellation/error sequencing, collision planning,
  backend arguments, and state transitions do not belong in Playwright.
  End-to-end coverage is reserved for irreducible browser or native behavior
  such as computed layout and cursor geometry, focus handoff, sandboxed or
  cross-origin frames, actual clipboard/composition events, and printable
  browser output.
- Before adding a new end-to-end spec, identify the exact browser-only risk,
  prefer extending an existing focused boundary scenario, and keep the test to
  one representative workflow. If a lower-layer regression can prove the
  behavior, do not add an end-to-end test.
- Treat existing end-to-end assertions of pure rules, backend arguments, or
  failure matrices as migration debt. When touching such a scenario, establish
  equivalent lower-layer coverage first, then remove the redundant browser
  branches; do not preserve them merely because they already exist.
- Before finishing, identify the user-visible acceptance cases (success,
  cancellation/error, and non-destructive collision behavior where relevant)
  and make each one observable at the appropriate layer. Follow the detailed
  strategy and exception list in `docs/TESTING.md`.
