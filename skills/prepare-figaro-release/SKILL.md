---
name: prepare-figaro-release
description: Prepare or publish a Figaro stable GitHub release when asked to release, version, push, or publish Figaro. Run the complete verification suite, synchronize release metadata and the changelog, create the release commit and annotated local tag, and publish only the release refs when the user explicitly requests publication.
---

# Prepare Figaro Release

Prepare exactly one stable `vMAJOR.MINOR.PATCH` release. Require the target
version from the user; do not infer a version bump or turn a failed tag into a
replacement release without an explicit version.

## Prepare or publish

Require the target version from the user. If they explicitly ask to **push** or
**publish** the release, run:

```bash
make release VERSION=vMAJOR.MINOR.PATCH
```

This target owns the clean-`main`, unused-tag, Git-identity, release-metadata,
full-suite, scoped-commit, local-tag, and ordered `main`-then-tag push checks.
It publishes only that release commit and tag; it does not push another branch,
tag, or unrelated working-tree change.

If the user asks only to prepare a release locally, run instead:

```bash
make release-local VERSION=vMAJOR.MINOR.PATCH
```

Do not replace either target with individual commands, `npm version`, a
force-push, a tag move, a reset, or a clean operation. Never infer permission
to publish from “prepare”, “tag”, or “commit”. State that pushing the tag starts
the GitHub release workflow, which builds and publishes the archives.
