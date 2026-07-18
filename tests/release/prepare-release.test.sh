#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
mock_bin="$(mktemp -d)"
fixture_root="$(mktemp -d)"
remote_root="$(mktemp -d)"

cleanup() {
    rm -rf "$mock_bin" "$fixture_root" "$remote_root"
}
trap cleanup EXIT

for command in npm go npx; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "$mock_bin/$command"
    chmod 755 "$mock_bin/$command"
done

make_fixture() {
    local root="$1"
    mkdir -p "$root/scripts" "$root/skills/prepare-figaro-release/scripts"
    cp "$repository_root/scripts/prepare-release.sh" "$root/scripts/"
    cp "$repository_root/skills/prepare-figaro-release/scripts/"{sync-release-metadata.mjs,releaseMetadata.cjs} \
        "$root/skills/prepare-figaro-release/scripts/"
    cp "$repository_root/"{package.json,package-lock.json,wails.json,CHANGELOG.md} "$root/"
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
run_release "$fixture_root" --push v2.3.4

test "$(git -C "$fixture_root" rev-parse HEAD)" = "$(git -C "$fixture_root" rev-parse 'v2.3.4^{}')"
test "$(git --git-dir="$remote_root" rev-parse refs/heads/main)" = "$(git -C "$fixture_root" rev-parse HEAD)"
test "$(git --git-dir="$remote_root" rev-parse 'refs/tags/v2.3.4^{}')" = "$(git -C "$fixture_root" rev-parse HEAD)"

if run_release "$fixture_root" --push v2.3.4; then
    printf 'expected duplicate release tag to be rejected\n' >&2
    exit 1
fi

local_fixture="$(mktemp -d)"
local_remote="$(mktemp -d)"
trap 'rm -rf "$mock_bin" "$fixture_root" "$remote_root" "$local_fixture" "$local_remote"' EXIT
make_fixture "$local_fixture"
git init --bare --quiet "$local_remote"
git -C "$local_fixture" remote add origin "$local_remote"
run_release "$local_fixture" v2.3.5

test -z "$(git --git-dir="$local_remote" for-each-ref)"
test "$(git -C "$local_fixture" rev-parse HEAD)" = "$(git -C "$local_fixture" rev-parse 'v2.3.5^{}')"
