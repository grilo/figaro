#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repository_root"

fail() {
    printf 'Release was not prepared: %s\n' "$*" >&2
    exit 1
}

publish=false
if [ "${1:-}" = '--push' ]; then
    publish=true
    shift
fi

requested_version="${1:-}"
if [ "$#" -ne 1 ] || [ -z "$requested_version" ]; then
    fail 'use: make release VERSION=vMAJOR.MINOR.PATCH'
fi

version="${requested_version#v}"
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    fail "${requested_version} is not a stable vMAJOR.MINOR.PATCH version"
fi
tag="v${version}"

if [ "$(git branch --show-current)" != 'main' ]; then
    fail 'release preparation requires the main branch'
fi
if [ -n "$(git status --porcelain)" ]; then
    fail 'release preparation requires a clean working tree'
fi
if git rev-parse --verify --quiet "refs/tags/${tag}" >/dev/null; then
    fail "local tag ${tag} already exists"
fi
if ! git config --get user.name >/dev/null || ! git config --get user.email >/dev/null; then
    fail 'configure git user.name and user.email before preparing a release'
fi

release_date="$(date +%F)"
node skills/prepare-figaro-release/scripts/sync-release-metadata.mjs "$version" --date "$release_date"
git diff --check

npm ci
npm run vendor
npm run lint
npm run test:unit
go vet . ./internal/... ./cmd/...
go test . ./internal/... ./cmd/...
go test -race . ./internal/... ./cmd/...
npx playwright install --with-deps chromium
npm run test:pdf

unexpected_changes="$(git diff --name-only | grep -Ev '^(CHANGELOG\.md|package-lock\.json|package\.json|wails\.json)$' || true)"
if [ -n "$unexpected_changes" ]; then
    printf 'Release was not prepared: verification changed files outside release metadata:\n%s\n' \
        "$unexpected_changes" >&2
    exit 1
fi
untracked_changes="$(git ls-files --others --exclude-standard)"
if [ -n "$untracked_changes" ]; then
    printf 'Release was not prepared: verification created untracked files:\n%s\n' \
        "$untracked_changes" >&2
    exit 1
fi

git diff --check
git add -- package.json package-lock.json wails.json CHANGELOG.md
if git diff --cached --quiet; then
    fail 'metadata generation produced no release commit'
fi
git commit -m "chore(release): prepare ${tag}"
git tag -a "$tag" -m "Figaro ${tag}"

if [ "$(git rev-parse HEAD)" != "$(git rev-parse "${tag}^{}")" ]; then
    fail "${tag} does not point to the release commit"
fi

if [ "$publish" = true ]; then
    git push origin main
    git push origin "$tag"
    printf '\nRelease %s has been published.\n' "$tag"
else
    printf '\nRelease %s is prepared locally and has not been published.\n' "$tag"
    printf 'Push the release commit first, then the tag:\n'
    printf '  git push origin main\n'
    printf '  git push origin %s\n' "$tag"
fi
