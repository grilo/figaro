#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
mock_bin="$(mktemp -d)"
fixture_root="$(mktemp -d)"
remote_root="$(mktemp -d)"
local_fixture=''
local_remote=''
bump_patch_fixture=''
bump_minor_fixture=''
bump_major_fixture=''
bump_minor_output=''
no_tag_fixture=''
no_tag_output=''
no_entries_fixture=''
no_entries_output=''

cleanup() {
    rm -rf "$mock_bin" "$fixture_root" "$remote_root" "${local_fixture:-}" "${local_remote:-}" \
        "${bump_patch_fixture:-}" "${bump_minor_fixture:-}" "${bump_major_fixture:-}" \
        "${bump_minor_output:-}" "${no_tag_fixture:-}" "${no_tag_output:-}" \
        "${no_entries_fixture:-}" "${no_entries_output:-}"
}
trap cleanup EXIT

for command in npm go; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "$mock_bin/$command"
    chmod 755 "$mock_bin/$command"
done
printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [ "${1:-}" = playwright ] && [ "${2:-}" = install ] && [ "${3:-}" = --with-deps ]; then' \
    '    printf "release verification must not install operating-system dependencies\\n" >&2' \
    '    exit 1' \
    'fi' \
    'exit 0' > "$mock_bin/npx"
chmod 755 "$mock_bin/npx"

make_fixture() {
    local root="$1"
    mkdir -p "$root/scripts" "$root/skills/prepare-figaro-release/scripts"
    cp "$repository_root/scripts/prepare-release.sh" "$root/scripts/"
    cp "$repository_root/skills/prepare-figaro-release/scripts/"{sync-release-metadata.mjs,releaseMetadata.cjs} \
        "$root/skills/prepare-figaro-release/scripts/"
    cp "$repository_root/"{package.json,package-lock.json,wails.json,CHANGELOG.md} "$root/"
    printf '%s\n' \
        '# Changelog' \
        '' \
        '## Unreleased' \
        '' \
        '### Changed' \
        '' \
        '- Release fixture change.' \
        '' \
        '## 1.0.0 - 2030-01-01' \
        '' \
        '### Added' \
        '' \
        '- Previous release.' > "$root/CHANGELOG.md"
    git -C "$root" init --quiet --initial-branch=main
    git -C "$root" config user.name 'Release test'
    git -C "$root" config user.email 'release-test@example.invalid'
    git -C "$root" add .
    git -C "$root" commit --quiet -m 'Initial release fixture'
}

run_release() {
    local root="$1"
    shift
    PATH="$mock_bin:$PATH" "$root/scripts/prepare-release.sh" "$@"
}

make_fixture "$fixture_root"
git init --bare --quiet "$remote_root"
git -C "$fixture_root" remote add origin "$remote_root"
printf 'Included in the release commit.\n' > "$fixture_root/RELEASE-NOTES.md"
run_release "$fixture_root" --push v2.3.4

test "$(git -C "$fixture_root" rev-parse HEAD)" = "$(git -C "$fixture_root" rev-parse 'v2.3.4^{}')"
test "$(git --git-dir="$remote_root" rev-parse refs/heads/main)" = "$(git -C "$fixture_root" rev-parse HEAD)"
test "$(git --git-dir="$remote_root" rev-parse 'refs/tags/v2.3.4^{}')" = "$(git -C "$fixture_root" rev-parse HEAD)"
test "$(git -C "$fixture_root" show 'v2.3.4:RELEASE-NOTES.md')" = 'Included in the release commit.'

run_release "$fixture_root" --push v2.3.4

local_fixture="$(mktemp -d)"
local_remote="$(mktemp -d)"
make_fixture "$local_fixture"
git init --bare --quiet "$local_remote"
git -C "$local_fixture" remote add origin "$local_remote"
run_release "$local_fixture" v2.3.5

test -z "$(git --git-dir="$local_remote" for-each-ref)"
test "$(git -C "$local_fixture" rev-parse HEAD)" = "$(git -C "$local_fixture" rev-parse 'v2.3.5^{}')"
run_release "$local_fixture" --push v2.3.5
run_release "$local_fixture" --push v2.3.5
test "$(git --git-dir="$local_remote" rev-parse refs/heads/main)" = "$(git -C "$local_fixture" rev-parse HEAD)"
test "$(git --git-dir="$local_remote" rev-parse 'refs/tags/v2.3.5^{}')" = "$(git -C "$local_fixture" rev-parse HEAD)"

bump_patch_fixture="$(mktemp -d)"
bump_minor_fixture="$(mktemp -d)"
bump_major_fixture="$(mktemp -d)"
for bump_fixture in "$bump_patch_fixture" "$bump_minor_fixture" "$bump_major_fixture"; do
    make_fixture "$bump_fixture"
    git -C "$bump_fixture" tag -a v2.3.4 -m 'Figaro v2.3.4'
done

run_release "$bump_patch_fixture" patch
test "$(git -C "$bump_patch_fixture" rev-parse HEAD)" = "$(git -C "$bump_patch_fixture" rev-parse 'v2.3.5^{}')"

bump_minor_output="$(mktemp)"
run_release "$bump_minor_fixture" minor > "$bump_minor_output"
grep -q 'Resolved minor release from v2.3.4 to v2.4.0.' "$bump_minor_output"
test "$(git -C "$bump_minor_fixture" rev-parse HEAD)" = "$(git -C "$bump_minor_fixture" rev-parse 'v2.4.0^{}')"

run_release "$bump_major_fixture" major
test "$(git -C "$bump_major_fixture" rev-parse HEAD)" = "$(git -C "$bump_major_fixture" rev-parse 'v3.0.0^{}')"

no_tag_fixture="$(mktemp -d)"
no_tag_output="$(mktemp)"
make_fixture "$no_tag_fixture"
if run_release "$no_tag_fixture" patch > "$no_tag_output" 2>&1; then
    printf 'expected an automatic bump without a release tag to be rejected\n' >&2
    exit 1
fi
grep -q 'no stable release tag is reachable from HEAD' "$no_tag_output"
test -z "$(git -C "$no_tag_fixture" status --porcelain)"

no_entries_fixture="$(mktemp -d)"
no_entries_output="$(mktemp)"
make_fixture "$no_entries_fixture"
printf '%s\n' \
    '# Changelog' \
    '' \
    '## Unreleased' \
    '' \
    '_No changes yet._' \
    '' \
    '## 2.3.4 - 2030-04-05' \
    '' \
    '### Added' \
    '' \
    '- Previous release.' > "$no_entries_fixture/CHANGELOG.md"
git -C "$no_entries_fixture" add CHANGELOG.md
git -C "$no_entries_fixture" commit --quiet -m 'Clear unreleased changelog entries'
git -C "$no_entries_fixture" tag -a v2.3.4 -m 'Figaro v2.3.4'
if run_release "$no_entries_fixture" minor > "$no_entries_output" 2>&1; then
    printf 'expected an empty Unreleased changelog to be rejected\n' >&2
    exit 1
fi
grep -q 'Nothing new is ready to release as v2.4.0.' "$no_entries_output"
grep -q 'Add a concise user-facing entry under "## Unreleased"' "$no_entries_output"
test -z "$(git -C "$no_entries_fixture" status --porcelain)"
