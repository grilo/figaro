---
name: prepare-figaro-release
description: Release Figaro when asked. Recommend a major/minor/patch version with evidence, tag and publish it, watch the GitHub workflows until the release is finished, and fix and retry failures. Also handles requests only to prepare or check a release. Does not apply to dependency bumps, ordinary commits or pushes, release questions, or audits of this skill.
---

# Release Figaro

A release request ("release", "cut a release", "publish vX.Y.Z",
`$prepare-figaro-release`) authorizes the whole workflow below: choose the
version, publish it, and follow CI until the GitHub release exists. Tell the
user which version you chose and why; do not wait for approval unless the user
asked you to. A request only to prepare, check, or discuss a release stops after
step 4 and reports the recommendation.

## 1. Inspect the pending work

Inspect the current branch, status, pending diff, recent history, stable tags
reachable from `main`, and `CHANGELOG.md`. Releases are cut from `main` and
include all current non-ignored changes; identify anything that should not
enter the release and stop to ask only in that case. Read the release process
in `CONTRIBUTING.md` from the repository root.

## 2. Choose the version

Compare the changes since the highest stable tag reachable from `main`,
including uncommitted work. Choose **patch** for compatible fixes, **minor** for
compatible new capabilities, or **major** for incompatible changes to supported
workflows or data contracts. Explain the concrete evidence; do not classify
solely by commit prefixes or changelog categories. Minor resets patch to zero;
major resets minor and patch. Never use an untagged package version as the
previous release. If the user named a version or bump, use it. If no stable tag
exists, explain the missing baseline and ask for an explicit initial version.

## 3. Repair the notes

Review the accumulated `[Unreleased]` notes and affected documentation against
the actual changes. Do not invent an entry to make an empty release pass; when
nothing is ready to release, stop and say so.

## 4. Verify the candidate

```bash
make release-check VERSION=vMAJOR.MINOR.PATCH
```

This validates synchronized metadata and the exact dated release notes in a
disposable directory, then runs the complete verification suite without
changing the changelog, index, commits, tags, or remotes. Its browser checks
start their own fresh server (`CI=1`), matching GitHub Actions, so a local
pass cannot rely on state from earlier runs; keep that when changing the
suite, and use the same setting when reproducing a CI-only failure. Fix
failures from evidence and rerun. Never bypass a check or claim verification that did not
run. Apply relevant native checks from `docs/TESTING.md`; Chromium does not
prove desktop webview behavior.

## 5. Publish

Tell the user the base tag, the chosen version and reason, and the release-note
body, then run:

```bash
make release VERSION=vMAJOR.MINOR.PATCH
```

This synchronizes npm/Wails versions, cuts the dated changelog section and
comparison links, reruns verification, stages all non-ignored changes, commits,
creates an annotated tag, and pushes `main` followed by that tag. Resolve the
version once and always use the explicit `VERSION` form; rerunning a bump after
tagging would select a different version. A matching annotated tag at `HEAD`
resumes a failed push with the same command.

## 6. Follow CI until the release is finished

Pushing the tag starts the release workflow. Use the local `gh` CLI:

```bash
gh run list --commit "$(git rev-parse HEAD)"
gh run watch <run-id> --exit-status
gh release view vMAJOR.MINOR.PATCH
```

Watch both the tag's release workflow and the ordinary CI run for the release
commit. The release is finished only when the release workflow succeeds and
`gh release view` shows the published release with its archives and
`SHA256SUMS`. Report pushes, CI, and publication as separate results.

## 7. Fix and retry failures

Read the failing job log (`gh run view <run-id> --log-failed`) and classify it:

- **Transient** (runner, network, or service outage with no code cause): rerun
  the failed jobs with `gh run rerun <run-id> --failed` and keep watching.
- **Needs a code or configuration fix**: reproduce it locally when possible, fix
  it on `main` with a regression test and a `Fixed` changelog entry, verify, and
  release the next patch version through steps 4–6. The failed tag stays as it
  is and never becomes a published release.

Repeat until a release is published. Stop and ask the user only when a failure
cannot be fixed from the evidence (for example missing secrets or permissions)
or the fix would change the release scope materially.

Use the make targets rather than individual Git/metadata commands or
`npm version`. Never use reset, clean, force-push, or move or delete a tag.
