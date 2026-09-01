# Workspace consistency and task scheduling audit

Follow-up authoring preference: editor `@date` and checklist Calendar actions now
insert ordinary preferred-style date links as well as updating task metadata.
The findings below concern deadline authority, which remains metadata-only;
visible date links do not carry special `due` semantics. Single dates/tags are
replaced, multiple values preserved, and date-only edits retain known schedules.

**Product:** Figaro v1.32.0 release scope<br>
**Platform:** Linux; development browser and repository test harness<br>
**Date:** 2026-08-31<br>
**Evidence:** live DOM inspection, source, focused component/native-adapter tests,
and existing real-browser boundary scenarios.

## 1. Executive verdict

This was a scoped workflow audit, not a whole-editor assessment. The strongest
pattern is reuse of the Calendar date picker and one application status bar.
The weakest was competing deadline representations: Board/editor actions wrote
Markdown while Gantt used metadata. That hidden dependency demanded unnecessary
attention and was the highest-risk inconsistency. The most valuable improvement
is one deadline model with safe source references and non-destructive failures.
The reported card disappearance on D was not reproduced in the controlled
browser fixture; the original picker did return focus to a nested date button,
losing the card's advertised keyboard commands.

## 2. Scorecard

Pre-change, scoped heuristic scores only:

| Category | Score | Weight | Evidence |
| --- | ---: | ---: | --- |
| Writing/editing, navigation/refinding, general linking | N/A | — | Outside this pass |
| Workspace consistency | 6/10 | 10 | Opposite view-switch placements |
| Data confidence | 6/10 | 10 | Competing Markdown/metadata dates |
| Keyboard/accessibility | 7/10 | 10 | D worked, but Escape lost card ownership |
| Visual ergonomics | 7/10 | 10 | Shared controls, inconsistent treatment |
| Discoverability | 6/10 | 5 | Help still advertised a separate date syntax |
| General responsiveness | N/A | — | No performance benchmark |

Reweighted scoped score: approximately 64/100, not a product-wide measurement.

## 3. Top findings

### WORK-01 — View switches require different pointer travel

- Severity S2; priority P2; confidence high.
- Tags: Nielsen consistency, ISO conformity, editor spatial stability.
- Evidence: Calendar presentation group precedes content at upper left; Kanban
  view group followed its title/instructions on the right.
- Reproduction: open Calendar, then Kanban.
- Impact: repeated workspace switching requires relearning control placement.
- Fix/acceptance: common 24px-left/14px-top inset, including Graph controls;
  existing Gantt browser scenario compares actual coordinates.

### DATA-01 — Deadline actions target different stores

- Severity S3; priority P1; confidence high.
- Tags: hidden dependencies, source fidelity, data confidence.
- Evidence: old SetTaskDueDate, @date, post-tag completions, and rail actions
  serialized links; Gantt wrote task-schedules.json.
- Reproduction: schedule from Board/editor, then inspect source and Gantt.
- Impact: one apparent deadline had competing representations.
- Fix/acceptance: metadata-only dates across Board/Gantt/Calendar/Today,
  exact-source checks, safe save sequencing, no old-link fallback/migration.

### KEY-01 — Picker cancellation loses card shortcut ownership

- Severity S2; priority P2; confidence high for focus; disappearance unverified.
- Tags: controllability, focus management, command locality.
- Evidence: the old picker restored its nested anchor button; card shortcuts
  require the card itself to own the event.
- Reproduction: focus card, D, Escape, then D again.
- Fix/acceptance: restore card focus; D/repeat/modifiers never remove a tag,
  Delete remains explicit, write failure leaves the card intact.

## 4. Editing mechanics

Only task/date authoring was changed. Command removal is one source transaction;
source undo is distinct from metadata persistence. Existing task-checkbox
mouse/drag and Arrow Up/Down boundaries remain covered. General tables, code,
paste, and other live widgets were outside this pass.

## 5. Knowledge-work workflow

Capture a task, assign its column, choose @date, switch Board/Gantt, and revisit
the same deadline in Calendar. Initial indexing never invents a start date;
the first move into a non-TODO column does. Existing starts and late deadlines
are preserved. Ambiguous identity retains metadata for explicit reconnection.

## 6. Keyboard and accessibility

D opens the calendar, Escape restores card focus, and modifiers/repeat are
guarded. Date picking retains the existing Arrow-key calendar behavior.
Choice controls retain accessible group/pressed states and visible focus.

## 7. Visual and writing ergonomics

Reuse Calendar's borderless choice treatment across the three Figaro themes.
No new component family was needed. Other themes retain configurable outlined
defaults. Help no longer presents old due links as authoring syntax.

## 8. What already works

- Shared Calendar picker: locale and activity styling remain familiar.
- One application footer: switching workspaces does not shift the main pane.
- Separate metadata: task scheduling never adds hidden IDs to valuable Markdown.
- Conservative identity: ambiguous records are preserved, never reassigned by guess.

## 9. Priority plan

Implemented DATA-01 first at the model/effect boundary, then KEY-01 focus and
safety regressions, then WORK-01 shared-token/placement consistency.
No broader editor redesign was proposed.

## 10. Regression checklist

- Metadata create/change/clear, stale references, failed saves, corrupt config.
- First start, repeat move, return to TODO, overdue deadline, ambiguous identity.
- D/Escape focus, explicit Delete, modifiers/repeat, no note reload.
- @date cancellation, source transaction, completion keys, editor navigation.
- Three-theme choice paint/focus and common workspace control coordinates.

## Appendix A — Tested tasks

Orientation, task organization, task navigation, keyboard focus, date authoring,
theme/control resilience, and safe failure paths were in scope. Full Markdown
torture, general search/linking, clipboard, and multi-pane scale were not.

## Appendix B — Unverified concerns

The user's original vanishing-card event was not reproduced. The tests now
exercise its reported shortcut and cancellation path explicitly. Packaged
native-webview cursor/focus behavior requires the repository's native smoke
check; Chromium and jsdom do not establish that boundary.
