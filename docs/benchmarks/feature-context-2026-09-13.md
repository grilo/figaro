# Feature discovery context baseline — 13 September 2026

This measures UTF-8 bytes returned by the feature-discovery CLI, not model tokens,
reasoning, total task cost, or application performance. Samples were captured in
the same working tree immediately before and after the compact-output correction.
The comparison includes both formatting changes and narrower route ownership.

| Discovery sample | Before (bytes) | After (bytes) | Change |
| --- | ---: | ---: | ---: |
| `list` | 775 | 1,167 | +50.6% |
| `editor-links` | 1,884 | 1,008 | -46.5% |
| `writing` | 1,773 | 768 | -56.7% |
| `search` | 1,576 | 701 | -55.5% |

The three selected-route samples represent linked-note navigation, writing
analysis/scheduling, and global note search. Their output is 46–57% smaller. The
list grew because it now covers 25 routes instead of 16, including previously
missing feature owners. Root instructions now recommend this 1,167-byte list,
then one selected route, instead of reading the full earlier 16,536-byte index.
The old CLI already supported listing; the change makes that compact path the
explicit default. The full generated index remains available for browsing.

These byte counts cover discovery output only. An agent still needs relevant
source symbols, documentation sections, tests, and shared contracts. The old
writing/search labels also covered areas now assigned their own routes; a task
that spans them must request those routes too. Do not extrapolate these numbers
to a percentage of tokens saved per completed change.

Reproduce the current outputs from the repository root (invoke Node directly so
npm's command banner does not enter the measurement):

```bash
node scripts/feature-workflow.mjs context | wc -c
node scripts/feature-workflow.mjs context editor-links | wc -c
node scripts/feature-workflow.mjs context writing | wc -c
node scripts/feature-workflow.mjs context search | wc -c
npm run context:check
```

[Recorded measurements](feature-context-2026-09-13.json) include the feature-map
hash and instruction sizes. Raw before/after samples from this run are retained
locally in ignored `test-logs/context-review-2026-09-13/`. Later map edits may
change output sizes; retain this dated baseline rather than silently replacing it.

For future end-to-end comparisons, use comparable changes and record completed
acceptance cases, source/docs read, test iterations, and actual task-token usage
when available. Include failures and rework. This baseline alone does not establish
that broader refactoring would reduce total development cost.
