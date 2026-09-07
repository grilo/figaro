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
check_root="$(mktemp -d)"

cleanup() {
    rm -rf "$mock_bin" "$fixture_root" "$remote_root" "${local_fixture:-}" "${local_remote:-}" \
        "${bump_patch_fixture:-}" "${bump_minor_fixture:-}" "${bump_major_fixture:-}" \
        "${bump_minor_output:-}" "${no_tag_fixture:-}" "${no_tag_output:-}" \
        "${no_entries_fixture:-}" "${no_entries_output:-}" "$check_root"
}
trap cleanup EXIT

for command in npm go; do
    cat > "$mock_bin/$command" <<'MOCK'
#!/usr/bin/env bash
invocation="$(basename -- "$0") $*"
if [ -n "${FIGARO_TEST_COMMAND_LOG:-}" ]; then
    printf '%s\n' "$invocation" >> "$FIGARO_TEST_COMMAND_LOG"
fi
if [ "$invocation" = "${FIGARO_TEST_FAIL_COMMAND:-}" ]; then exit 42; fi
MOCK
    chmod 755 "$mock_bin/$command"
done
printf '%s\n' \
    '#!/usr/bin/env bash' \
    'if [ -n "${FIGARO_TEST_COMMAND_LOG:-}" ]; then printf "npx %s\\n" "$*" >> "$FIGARO_TEST_COMMAND_LOG"; fi' \
    'if [ "${1:-}" = playwright ] && [ "${2:-}" = install ] && [ "${3:-}" = --with-deps ]; then' \
    '    printf "release verification must not install operating-system dependencies\\n" >&2' \
    '    exit 1' \
    'fi' \
    'exit 0' > "$mock_bin/npx"
chmod 755 "$mock_bin/npx"

make_fixture() {
    local root="$1"
    mkdir -p "$root/scripts" "$root/.agents/skills/prepare-figaro-release/scripts"
    cp "$repository_root/scripts/"{prepare-release.sh,verify-release.sh,extract-release-notes.mjs,releaseNotes.cjs} "$root/scripts/"
    for script in prepare-frontend.sh check-go-coverage.sh; do
        cat > "$root/scripts/$script" <<'MOCK'
#!/usr/bin/env bash
if [ -n "${FIGARO_TEST_COMMAND_LOG:-}" ]; then
    basename -- "$0" >> "$FIGARO_TEST_COMMAND_LOG"
fi
MOCK
        chmod 755 "$root/scripts/$script"
    done
    cp "$repository_root/.agents/skills/prepare-figaro-release/scripts/"{sync-release-metadata.mjs,releaseMetadata.cjs} \
        "$root/.agents/skills/prepare-figaro-release/scripts/"
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
    FIGARO_BROWSER_PDF_EXECUTABLE=/bin/true PATH="$mock_bin:$PATH" "$root/scripts/prepare-release.sh" "$@"
}

# Provisional verification must preserve both metadata and dirty Git state.
mkdir -p "$check_root/work" "$check_root/remote"
make_fixture "$check_root/work"
git init --bare --quiet "$check_root/remote"
git -C "$check_root/work" remote add origin "$check_root/remote"
git -C "$check_root/work" switch --quiet -c codex/release-proposal
printf 'staged work\n' > "$check_root/work/pending.txt"
git -C "$check_root/work" add pending.txt
printf 'unstaged work\n' >> "$check_root/work/pending.txt"
printf 'untracked work\n' > "$check_root/work/untracked.txt"
check_head="$(git -C "$check_root/work" rev-parse HEAD)"
check_index="$(git -C "$check_root/work" ls-files --stage)"
check_status="$(git -C "$check_root/work" status --porcelain)"
metadata_snapshot() {
    node - "$check_root/work" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
console.log(JSON.stringify(['package.json', 'package-lock.json', 'wails.json', 'CHANGELOG.md', 'pending.txt', 'untracked.txt']
    .map(name => fs.readFileSync(path.join(process.argv[2], name), 'utf8'))));
NODE
}
check_metadata="$(metadata_snapshot)"
assert_proposal_unchanged() {
    test "$(git -C "$check_root/work" rev-parse HEAD)" = "$check_head"
    test "$(git -C "$check_root/work" ls-files --stage)" = "$check_index"
    test "$(git -C "$check_root/work" status --porcelain)" = "$check_status"
    test "$(metadata_snapshot)" = "$check_metadata"
    test -z "$(git -C "$check_root/work" tag)"
    test -z "$(git --git-dir="$check_root/remote" for-each-ref)"
}
FIGARO_TEST_COMMAND_LOG="$check_root/commands" \
    run_release "$check_root/work" --check v2.3.4 > "$check_root/output"
assert_proposal_unchanged
cat > "$check_root/expected" <<'COMMANDS'
prepare-frontend.sh
npm run lint
npm run test:coverage
go vet . ./internal/... ./cmd/...
check-go-coverage.sh
go test -race . ./internal/... ./cmd/...
npx playwright install chromium
go test -v ./internal/pdfexport -run ^TestRenderChromiumPDFAgainstOptInBrowser$
npm run test:pdf
COMMANDS
cmp "$check_root/expected" "$check_root/commands"
grep -q '### Changed' "$check_root/output"
grep -q 'Release fixture change.' "$check_root/output"
grep -q 'version selection and release approval are still required' "$check_root/output"
# An interrupted verification must fail before finalization, preserving the proposal.
: > "$check_root/commands"
if FIGARO_TEST_COMMAND_LOG="$check_root/commands" \
    FIGARO_TEST_FAIL_COMMAND='npm run test:coverage' \
    run_release "$check_root/work" --check v2.3.4 > "$check_root/output" 2>&1; then
    printf 'expected provisional verification failure to stop the command\n' >&2
    exit 1
fi
assert_proposal_unchanged
test "$(wc -l < "$check_root/commands" | tr -d ' ')" = 3
# Malformed notes fail in the disposable metadata copy, before verification.
sed 's/### Changed/### Unknown/' "$check_root/work/CHANGELOG.md" > "$check_root/bad-changelog"
cp "$check_root/bad-changelog" "$check_root/work/CHANGELOG.md"
check_metadata="$(metadata_snapshot)"
check_status="$(git -C "$check_root/work" status --porcelain)"
: > "$check_root/commands"
if FIGARO_TEST_COMMAND_LOG="$check_root/commands" \
    run_release "$check_root/work" --check v2.3.4 > "$check_root/output" 2>&1; then
    printf 'expected malformed provisional notes to stop the command\n' >&2
    exit 1
fi
assert_proposal_unchanged
test ! -s "$check_root/commands"

# Approved finalization must also stop before refs when shared verification fails.
mkdir -p "$check_root/failing-finalization"
make_fixture "$check_root/failing-finalization"
failure_head="$(git -C "$check_root/failing-finalization" rev-parse HEAD)"
if FIGARO_TEST_FAIL_COMMAND='npm run test:coverage' \
    run_release "$check_root/failing-finalization" --push v2.3.4 > "$check_root/output" 2>&1; then
    printf 'expected finalization verification failure to prevent release refs\n' >&2
    exit 1
fi
test "$(git -C "$check_root/failing-finalization" rev-parse HEAD)" = "$failure_head"
test -z "$(git -C "$check_root/failing-finalization" tag)"

make_fixture "$fixture_root"
git init --bare --quiet "$remote_root"
git -C "$fixture_root" remote add origin "$remote_root"
printf 'Included in the release commit.\n' > "$fixture_root/RELEASE-NOTES.md"
FIGARO_TEST_COMMAND_LOG="$check_root/publish-commands" run_release "$fixture_root" --push v2.3.4
cmp "$check_root/expected" "$check_root/publish-commands"

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
grep -q 'Add a concise user-facing entry under "## \[Unreleased\]"' "$no_entries_output"
test -z "$(git -C "$no_entries_fixture" status --porcelain)"
