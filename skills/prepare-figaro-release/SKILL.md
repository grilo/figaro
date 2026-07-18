---
name: prepare-figaro-release
description: Prepare or publish a Figaro stable GitHub release when asked to release, version, bump, push, or publish Figaro. Run the complete verification suite, derive and report major/minor/patch releases from the latest tag when requested, synchronize release metadata and the changelog, explain actionable changelog failures, commit all current non-ignored repository changes, create the annotated release tag, and publish only the release refs when the user explicitly requests publication.
---

# Prepare Figaro Release

Use the repository release targets; they own the release state machine and do
not require the user to remember individual Git or metadata commands.

## Prepare or publish

Require either a target version or a `major`, `minor`, or `patch` bump from the
user. If they explicitly ask to **push** or **publish** the release, run one of:

```bash
make release patch
# replace patch with minor or major when appropriate
make release VERSION=vMAJOR.MINOR.PATCH
```

The bump form reads the highest stable tag reachable from `main`, reports its
base tag and resolved target, and changes only the requested number. Do not
treat an untagged package version as a prior release. The target verifies the
`main` branch, Git identity, release metadata, and complete suite. It moves the
accumulated changelog entries into the dated release, stages all non-ignored
changes currently in the repository, creates one release commit and annotated
tag, then pushes only `main` and that tag in order. It never uses `git clean`, a
reset, a force-push, or a tag move.

When the command reports an empty or malformed `Unreleased` section, follow its
printed repair steps: add a concise user-facing entry grouped under **Added**,
**Changed**, or **Fixed**, then rerun the same command. If there is no entry to
add, do not create a release.

The command is safe to repeat for the same version: when the matching local tag
already points at `HEAD`, it verifies the release again and resumes the pushes.
It refuses to resume if later uncommitted changes would make the tag ambiguous.

If the user asks only to prepare a release locally, run instead:

```bash
make release-local patch
# replace patch with minor or major when appropriate
make release-local VERSION=vMAJOR.MINOR.PATCH
```

It performs the same verification, commit, and tag steps without pushing.

Do not replace either target with individual commands, `npm version`, a
force-push, a tag move, a reset, or a clean operation. Never infer permission
to publish from “prepare”, “tag”, or “commit”. State that pushing the tag starts
the GitHub release workflow.
