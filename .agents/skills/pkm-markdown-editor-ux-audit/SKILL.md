---
name: pkm-markdown-editor-ux-audit
description: Audit the UX of a desktop PKM, Markdown, note-taking, or text editor using observed evidence. Supports full workflow audits, focused interaction reviews, and source-only inspection. Use for requested editor UX audits, not ordinary implementation work or audits of agent instructions and skills.
---

# PKM / Markdown Editor UX Audit

Evaluate how well capture, writing, organization, linking, and retrieval preserve
attention and trust in authored data. Prioritize cursor, selection, undo, and
source fidelity over visual polish. Preserve effective expert workflows.
Do not modify the product unless the user explicitly requests implementation.
User scope and instructions take precedence over this skill's default procedure.

## Select scope and prepare evidence

- **Full:** A broad audit with access to a running application. Follow the core
  journey and the supported tasks in [the task suite](references/task-suite.md).
- **Focused:** Review the requested interaction or surface and its immediate
  neighbors. Use only the relevant task-suite sections; do not expand a table
  review into a whole-product audit. Screenshot-only reviews are focused visual
  inspections and cannot establish dynamic behavior.
- **Source-only:** Inspect code, tests, and documentation when requested or when
  runtime access is unavailable. Report implementation evidence and hypotheses;
  do not claim to have exercised the app or assign runtime usability scores.

Choose from the request and available tools without unnecessary confirmation.
If the preferred runtime is unavailable, disclose the limitation and complete
useful inspection in the appropriate mode. Keep unexercised behavior unverified.
For full/focused runtime audits, use the app before inspecting implementation
causes; reading launch instructions and preparing a safe fixture is allowed first.

Record build/commit and dirty state, platform, browser or webview engine, theme,
scale, scope, and available evidence. Read repository launch and test guidance.
For Figaro, use `CONTRIBUTING.md` and `docs/TESTING.md` from the repository root.
Use an available isolated desktop/browser workflow where practical. Native
WebKitGTK, WebView2, and WKWebView observations must be labelled separately from
Chromium; browser success is not proof of packaged native cursor geometry.

Before create/edit/rename/move/delete exercises, create an owned disposable vault
and copy the fixture bundle into it: [Markdown torture note](fixtures/MARKDOWN_TORTURE_TEST.md),
[Another Note](fixtures/Another%20Note.md) and the
[working image](fixtures/example-image.svg). Keep the deliberately missing image
missing. Verify the active vault path before mutation. Do not use the user's
normal vault or modify repository fixture originals. If isolation is unavailable,
continue observation/source inspection and mark mutation tasks blocked. Clean up
only owned test artifacts after retaining needed evidence; do not delete user
notes, reset unrelated settings, or close the user's existing application session.

## Run the selected audit

For a full audit, start with orientation, then follow:
Capture → Write → Structure → Connect → Navigate → Retrieve → Revisit → Revise.
Prioritize editing mechanics, keyboard/accessibility, workspace behavior,
reversible failures, then visual ergonomics. For focused audits, exercise the
relevant portion of that journey. Inspect implementation afterward to establish
root causes, without treating source inspection as observed runtime behavior.

Read [evaluation lenses](references/evaluation-framework.md) only for relevant
areas. Use Nielsen, ISO interaction principles, Cognitive Dimensions, WCAG and
editor-specific heuristics as diagnostic tags, not as a checklist of required
findings. Do not claim standards conformance from a heuristic review.

For changed or suspect editor regions, check entry and exit from both directions,
Arrow Up/Down, feature keys such as Tab/Shift+Tab and Enter, mouse placement,
drag selection, undo/redo, and resulting Markdown. Record real runtime evidence
for geometry and distinguish intended source reveal from disruptive movement.
Use the working link/image cases separately from malformed or missing targets.

## Record findings and coverage

Each finding needs a specific title, location, direct evidence and its type,
short reproduction or source reference, user impact, confidence, severity,
priority, recommendation, and observable acceptance criteria. Distinguish
confirmed behavior, confirmed source defects, and **unverified concerns**.
For concerns, name the test that would confirm or reject them. Never invent
measurements, findings, or product capabilities to complete a report.

Severity: **S1** cosmetic; **S2** workable friction; **S3** major workflow or
accessibility problem; **S4** data risk or an unusable core workflow. Use **S0**
for observations that are not problems. Priority: **P0** critical blocker;
**P1** major repeated workflow; **P2** meaningful improvement; **P3** polish.
Consider frequency and affected users as well as severity.

For each task and runtime, record **passed**, **failed**, **not tested**,
**blocked** (with reason), or **unsupported** (confirmed absent). Unsupported
functionality is not a defect unless it violates the product's intended contract.
Unverified implementation concerns do not count as failed runtime tasks.

Use the scorecard in the report template only when there is enough observed
runtime evidence for a category. Mark untested/blocked categories explicitly;
never give them zero or silently reweight them away. Only confirmed unsupported
categories may be excluded and remaining weights normalized. Withhold an overall
score for source-only or partial audits, when any applicable category lacks
coverage, or when an S4 issue makes an aggregate misleading. Otherwise compute
10 × sum(category score × weight) / sum(applicable weights), and accompany it
with the evidence limitations. The score is a heuristic, not scientific precision.

## Deliver the report

Use [the report template](templates/AUDIT_REPORT_TEMPLATE.md), omitting irrelevant
sections for focused or source-only work. Include up to ten consequential
findings, as few as the evidence warrants, plus patterns worth preserving.
State what was and was not tested. Link retained evidence to findings.

Describe desired behavior before implementation, and propose a local fix when
sufficient. Do not copy another editor's design without explaining its benefit.
Turn confirmed findings into focused acceptance cases using
[the regression checklist](templates/REGRESSION_CHECKLIST.md); it is a menu for
the affected scope, not a requirement to rerun every workflow after every change.
In Figaro, follow `docs/TESTING.md` to place each assertion at the lowest capable
layer and record any native verification still needed. Recommendations are not
authorization to implement new design-system components or change the product.
