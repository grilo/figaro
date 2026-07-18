---
name: prepare-figaro-release
description: Prepare a Figaro stable GitHub release when asked to release or version Figaro. Run the complete verification suite, synchronize release metadata and the changelog, create the release commit and annotated local tag, and stop before any push.
---

# Prepare Figaro Release

Prepare exactly one stable `vMAJOR.MINOR.PATCH` release. Require the target
version from the user; do not infer a version bump or turn a failed tag into a
replacement release without an explicit version.

## Preconditions

Run from the repository root. Before changing anything, require all of the
following:

1. `git branch --show-current` reports `main`.
2. `git status --porcelain` is empty.
3. The requested stable version has the form `vMAJOR.MINOR.PATCH` and the
   local tag does not already exist.
4. Git has `user.name` and `user.email` configured.

Abort before mutation if a precondition fails. Never reset, clean, amend,
move an existing tag, force-push, or push any ref.

## Prepare and verify

1. Set `version` to the requested number without its `v` prefix and set
   `release_date` to today's local `YYYY-MM-DD` date.
2. Run the metadata generator:

   ```bash
   node skills/prepare-figaro-release/scripts/sync-release-metadata.mjs "$version" --date "$release_date"
   ```

   It updates `package.json`, the two root version fields in
   `package-lock.json`, `wails.json`, and moves the populated `Unreleased`
   changelog section into a dated release heading. Do not use `npm version`.
3. Inspect `git diff --check` and the resulting diff. If the changelog does
   not accurately describe the release, correct it before continuing.
4. Run the same complete verification suite enforced by the release workflow:

   ```bash
   npm ci
   npm run vendor
   npm run lint
   npm run test:unit
   go vet . ./internal/... ./cmd/...
   go test . ./internal/... ./cmd/...
   go test -race . ./internal/... ./cmd/...
   npx playwright install --with-deps chromium
   npm run test:pdf
   ```

   Do not commit or tag if any command fails. Report the failing command and
   leave its diagnostic output and the uncommitted release changes for review.

## Commit and tag locally

After every check succeeds, stage only the generated release files:

```bash
git add -- package.json package-lock.json wails.json CHANGELOG.md
git commit -m "chore(release): prepare v$version"
git tag -a "v$version" -m "Figaro v$version"
```

Verify that the commit and tag point to the same `HEAD`. Do not include
unrelated files and do not change the tag after creating it.

## Handoff

State prominently that the release is prepared locally but is **not
published**. The only remaining action is to push the release commit first,
then its tag:

```bash
git push origin main
git push origin vMAJOR.MINOR.PATCH
```

Explain that the second command starts the release workflow, which builds and
publishes the archives. Include the exact requested tag in the commands.
