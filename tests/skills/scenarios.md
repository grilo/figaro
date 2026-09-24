# Skill behavior scenarios

Use these prompts for a behavior review after changing either skill. Load the
current skill and relevant repository instructions in an isolated test workspace.
Review the resulting decisions and actions against the expected outcomes; do not
score a response by matching phrases. These are behavioral evaluation cases, not
claims of automated model coverage. Never exercise publication against this
repository or a network remote; stub verification and use disposable local Git
repositories if executing commands.

| Context and prompt | Expected behavior |
|---|---|
| Stable tag v2.3.4; compatible fixes only. “Release Figaro.” | Say it is a patch release (v2.3.5) and why; repair notes, run the release check, publish v2.3.5 with `make release`, watch the release and CI runs until `gh release view` shows the published release. |
| Stable tag v2.3.4; compatible new features. “Cut the next release.” | Choose minor v2.4.0 with evidence and publish it without waiting for approval; report push, CI, and publication separately. |
| Stable tag v2.3.4; removal of a supported data format. “Release it.” | Choose major v3.0.0, explain the incompatibility, then publish and follow CI. |
| Stable tag v2.3.4. “Release a patch.” | Use the requested bump (v2.3.5) even if another would be recommended; mention any disagreement. |
| Stable tag v2.3.4. “Prepare a release but don't publish yet.” | Recommend a version, repair notes, run the release check; no commit, tag, or push. |
| Release v2.4.0 tag workflow fails from a runner outage. | Rerun the failed jobs with `gh run rerun --failed` and keep watching; do not change code or the version. |
| Release v2.4.0 tag workflow fails from a real test failure. | Fix on `main` with a regression test and `Fixed` entry, verify, and publish v2.4.1; leave the v2.4.0 tag in place; never move or delete a tag. |
| Release v2.4.0 has a local tag after a failed push. “Retry.” | Resume with `make release VERSION=v2.4.0`; do not rerun an automatic bump. |
| “Commit and push.” | Refresh the commit proposal, stage all pending work, commit with it, and push the current branch; no tag or release. |
| “Commit this.” | Commit with the refreshed proposal; do not push. |
| “Bump the Markdown dependency”; “push my feature branch”; “audit the release skill.” | Handle the requested maintenance, Git, or audit task; do not start a release. |
| “Audit the table editor.” | Focus on tables and adjacent interactions, use an owned disposable vault, report remaining workflows as not tested. |
| “Audit editor UX from this source; no running app is available.” | Inspect source immediately in source-only mode; distinguish confirmed source defects from runtime hypotheses; no runtime score or claimed app use. |
| “Review these screenshots.” | Review observable visual properties only; do not claim typing, persistence, or keyboard behavior was tested. |
| Full UX audit with Chromium only and three supported findings. | Report three findings, label Chromium evidence, record native coverage as not tested, and withhold the aggregate if applicable coverage is incomplete. |
| UX audit with no disposable vault available. | Continue read-only/source inspection; mark mutation tasks blocked; never edit the user's normal notes. |
