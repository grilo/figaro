#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repository_root"

fail() {
    printf 'Release was not prepared: %s\n' "$*" >&2
    exit 1
}

publish=false
check_only=false
case "${1:-}" in
    --push) publish=true; shift ;;
    --check) check_only=true; shift ;;
esac

requested_version="${1:-}"
if [ "$#" -ne 1 ] || [ -z "$requested_version" ]; then
    fail 'use: make release-check|release-local|release major|minor|patch or VERSION=vMAJOR.MINOR.PATCH'
fi

case "$requested_version" in
    major|minor|patch)
        latest_tag="$(git tag --merged HEAD --sort=-v:refname | sed -nE '/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/ { p; q; }')"
        if [ -z "$latest_tag" ]; then
            fail "no stable release tag is reachable from HEAD; use VERSION=vMAJOR.MINOR.PATCH"
        fi
        IFS=. read -r latest_major latest_minor latest_patch <<< "${latest_tag#v}"
        case "$requested_version" in
            major) version="$((latest_major + 1)).0.0" ;;
            minor) version="${latest_major}.$((latest_minor + 1)).0" ;;
            patch) version="${latest_major}.${latest_minor}.$((latest_patch + 1))" ;;
        esac
        printf 'Resolved %s release from %s to v%s.\n' "$requested_version" "$latest_tag" "$version"
        ;;
    *)
        version="${requested_version#v}"
        if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
            fail "${requested_version} is not a stable vMAJOR.MINOR.PATCH version"
        fi
        printf 'Preparing explicit release v%s.\n' "$version"
        ;;
esac
tag="v${version}"

# Validate the proposed metadata and exact notes in a disposable directory.
# Verification can run on a feature branch; finalizing a release requires main.
if [ "$check_only" = true ]; then
    preview_root="$(mktemp -d)"
    trap 'rm -rf -- "$preview_root"' EXIT
    cp package.json package-lock.json wails.json CHANGELOG.md "$preview_root/"
    node .agents/skills/prepare-figaro-release/scripts/sync-release-metadata.mjs \
        "$version" --root "$preview_root" --date "$(date +%F)"
    (cd "$preview_root" && node "$repository_root/scripts/extract-release-notes.mjs" "$tag")
    ./scripts/verify-release.sh
    printf '\nProvisional release %s verified; version selection and release approval are still required.\n' "$tag"
    printf 'Repository release metadata, index, commits, tags, and remotes were not changed by release preparation.\n'
    exit 0
fi

if [ "$(git branch --show-current)" != 'main' ]; then
    fail 'release preparation requires the main branch'
fi
if ! git config --get user.name >/dev/null || ! git config --get user.email >/dev/null; then
    fail 'configure git user.name and user.email before preparing a release'
fi

tag_exists=false
if git rev-parse --verify --quiet "refs/tags/${tag}" >/dev/null; then
    tag_exists=true
    if [ "$(git cat-file -t "refs/tags/${tag}")" != tag ]; then
        fail "local tag ${tag} is not an annotated release tag"
    fi
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse "${tag}^{commit}")" ]; then
        fail "local tag ${tag} does not point to HEAD"
    fi
    if [ -n "$(git status --porcelain)" ]; then
        fail "local tag ${tag} already exists; commit or discard later changes before resuming"
    fi
fi

release_date="$(date +%F)"
if [ "$tag_exists" = true ]; then
    metadata_check="$(node .agents/skills/prepare-figaro-release/scripts/sync-release-metadata.mjs \
        "$version" --date "$release_date" --dry-run)"
    if printf '%s\n' "$metadata_check" | grep -q '^  '; then
        fail "local tag ${tag} exists, but its checked-out metadata is not synchronized"
    fi
else
    node .agents/skills/prepare-figaro-release/scripts/sync-release-metadata.mjs "$version" --date "$release_date"
fi
node scripts/extract-release-notes.mjs "$tag" >/dev/null
./scripts/verify-release.sh

if [ "$tag_exists" = false ]; then
    git add -A
    git diff --cached --check
    if git diff --cached --quiet; then
        if [ "$(git log -1 --format=%s)" != "chore(release): prepare ${tag}" ]; then
            fail "metadata is already synchronized for ${tag}, but HEAD is not its release commit"
        fi
    else
        git commit -m "chore(release): prepare ${tag}"
    fi
    git tag -a "$tag" -m "Figaro ${tag}"
fi

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
