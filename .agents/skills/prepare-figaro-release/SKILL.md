---
name: prepare-figaro-release
description: Prepare a reviewable Figaro release proposal, recommend a major/minor/patch version, and verify it when asked to prepare or publish a Figaro release. Finalize or publish only with the user's approval of the version and action. Does not apply to dependency bumps, ordinary Git pushes, release questions, or audits of this skill.
---

# Prepare Figaro Release

Prepare everything needed for the user to choose a version and approve the next
action. Natural-language release requests and `$prepare-figaro-release` use the
same workflow. The user's explicit instructions and existing authorization take
precedence; do not ask again for an action and version already approved.

## Prepare the proposal

1. Inspect the current branch, status, pending diff, recent history, stable tags
   reachable from `main`, and `CHANGELOG.md`. Include the complete pending work:
   the final release target stages all current non-ignored changes. Preserve
   unrelated edits and identify anything that should not enter a release.
   Read the release workflow in `CONTRIBUTING.md` from the repository root.
2. Compare the changes since the highest stable tag reachable from `main`,
   including uncommitted work. Recommend **patch** for compatible fixes,
   **minor** for compatible new capabilities, or **major** for incompatible
   changes to supported workflows or data contracts. Explain concrete evidence;
   do not classify solely by commit prefixes or changelog categories. Show the
   exact patch, minor, and major candidate versions and identify your recommendation.
   Minor resets patch to zero; major resets minor and patch. Never use an
   untagged package version as the previous release. If no stable tag exists,
   explain the missing baseline and propose an explicit initial version from
   the repository evidence without treating it as approved.
3. Review and repair the accumulated `[Unreleased]` notes and affected
   documentation using actual changes. Do not invent an entry to make an empty
   release pass. An informational question or request to audit this skill does
   not authorize these edits or release execution.
4. Use the recommended version as a **provisional candidate**, or the user's
   selected version when one is already available, to run:

   ```bash
   make release-check VERSION=vMAJOR.MINOR.PATCH
   ```

   Substitute the exact candidate. This validates synchronized metadata and the
   exact dated release notes in a disposable directory, then runs the shared
   complete verification suite. It does not cut the repository changelog,
   stage files, commit, tag, or push. Builds and tests may update generated
   artifacts. It may run on a feature branch; finalization requires `main`.
   Report failing or unavailable checks and complete independent preparation;
   do not bypass checks or claim the release is verified. Apply relevant native
   checks from `docs/TESTING.md`; Chromium does not prove desktop webview behavior.
5. Present the base tag, exact candidate versions, recommendation and reason,
   curated release-note body, pending-change scope, verification results, and
   any blockers. State the proposed action explicitly: local commit/tag or
   publication. Ask the user to select the version and give the go-ahead only
   after the available preparation is concrete and reviewable. If approval is
   already explicit for this version and action, continue within that scope.

## Apply the approved action

Selecting a version alone does not authorize a commit, tag, or publication.
Approval to prepare, inspect, or verify does not authorize finalization. A clear
go-ahead in response to a proposal authorizes the action named in that proposal;
do not require a magic phrase or another confirmation. Approval to finalize
locally does not authorize publication. Never publish without explicit approval.

After the version and action are approved, inspect changes since the proposal.
If the release contents or target changed materially, update the proposal and
obtain approval for the revised scope. Keep the resolved version fixed for
execution and retries; rerunning a bump after creating a tag would select a
different version.

For an approved **local commit and tag**:

```bash
make release-local VERSION=vMAJOR.MINOR.PATCH
```

For approved **publication**:

```bash
make release VERSION=vMAJOR.MINOR.PATCH
```

These targets synchronize npm/Wails versions, cut a bracketed dated changelog
section and comparison links, validate its exact notes, rerun verification on
the selected version, stage all non-ignored changes, commit, and create an
annotated tag. Only `make release` pushes `main` followed by that exact tag.
Pushing the tag starts the GitHub release workflow; report that workflow's
result separately from successful Git pushes.

A matching annotated tag at `HEAD` can resume with the same explicit version.
Later uncommitted changes or a conflicting tag stop the command. Preserve them,
explain the conflict, and do not discard work or move a tag to force a retry.
Fix verification or changelog failures from evidence; when nothing is ready to
release, stop without creating a release. The tag workflow publishes the exact
dated changelog body and repairs that same body on retry.

Use these targets rather than individual Git/metadata commands or `npm version`.
Never use reset, clean, force-push, or a tag move to prepare a release.
