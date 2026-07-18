import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import releaseMetadata from '../../../skills/prepare-figaro-release/scripts/releaseMetadata.cjs';

const repositoryRoot = path.resolve('.');
const metadataFiles = ['package.json', 'package-lock.json', 'wails.json', 'CHANGELOG.md'];
const read = filename => fs.readFileSync(path.join(repositoryRoot, filename), 'utf8');
const fixtureChangelog = [
    '# Changelog',
    '',
    '## Unreleased',
    '',
    '### Changed',
    '',
    '- Release fixture change.',
    '',
    '## 1.0.0 - 2030-01-01',
    '',
    '### Added',
    '',
    '- Previous release.',
    '',
].join('\n');

function makeReleaseFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-release-'));
    for (const filename of metadataFiles) {
        fs.copyFileSync(path.join(repositoryRoot, filename), path.join(root, filename));
    }
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), fixtureChangelog);
    return root;
}

describe('prepare Figaro release metadata', () => {
    test('synchronizes every version record and cuts a dated changelog release', () => {
        const root = makeReleaseFixture();
        try {
            const result = releaseMetadata.syncReleaseMetadata({
                requestedVersion: 'v2.3.4',
                releaseDate: '2030-04-05',
                root,
            });

            expect(result.version).toBe('2.3.4');
            expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version).toBe('2.3.4');
            const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
            expect(lock.version).toBe('2.3.4');
            expect(lock.packages[''].version).toBe('2.3.4');
            expect(JSON.parse(fs.readFileSync(path.join(root, 'wails.json'), 'utf8')).info.productVersion).toBe('2.3.4');

            const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
            expect(changelog).toMatch(/^## Unreleased\n\n_No changes yet\._\n\n## 2\.3\.4 - 2030-04-05/m);
            expect(changelog).toMatch(/## 2\.3\.4 - 2030-04-05[\s\S]*### Added/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('rejects an invalid release version without changing metadata', () => {
        const root = makeReleaseFixture();
        try {
            const before = Object.fromEntries(metadataFiles.map(filename => [
                filename,
                fs.readFileSync(path.join(root, filename), 'utf8'),
            ]));
            expect(() => releaseMetadata.syncReleaseMetadata({
                requestedVersion: 'v2.3.4-rc.1',
                releaseDate: '2030-04-05',
                root,
            })).toThrow('not a stable MAJOR.MINOR.PATCH version');

            for (const filename of metadataFiles) {
                expect(fs.readFileSync(path.join(root, filename), 'utf8')).toBe(before[filename]);
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('explains how to proceed when no changelog entries are ready to release', () => {
        const root = makeReleaseFixture();
        try {
            fs.writeFileSync(path.join(root, 'CHANGELOG.md'), [
                '# Changelog',
                '',
                '## Unreleased',
                '',
                '_No changes yet._',
                '',
                '## 2.3.4 - 2030-04-05',
                '',
                '### Added',
                '',
                '- Previous release.',
                '',
            ].join('\n'));

            expect(() => releaseMetadata.syncReleaseMetadata({
                requestedVersion: 'v2.4.0',
                releaseDate: '2030-04-06',
                root,
            })).toThrow('Nothing new is ready to release as v2.4.0');
            expect(() => releaseMetadata.syncReleaseMetadata({
                requestedVersion: 'v2.4.0',
                releaseDate: '2030-04-06',
                root,
            })).toThrow('Add a concise user-facing entry under "## Unreleased"');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('keeps an already synchronized release unchanged when retrying it', () => {
        const root = makeReleaseFixture();
        try {
            releaseMetadata.syncReleaseMetadata({
                requestedVersion: 'v2.3.4',
                releaseDate: '2030-04-05',
                root,
            });
            const before = Object.fromEntries(metadataFiles.map(filename => [
                filename,
                fs.readFileSync(path.join(root, filename), 'utf8'),
            ]));

            const result = releaseMetadata.syncReleaseMetadata({
                requestedVersion: 'v2.3.4',
                releaseDate: '2030-04-06',
                root,
            });

            expect(result.releaseDate).toBe('2030-04-05');
            expect(result.files).toEqual([]);
            for (const filename of metadataFiles) {
                expect(fs.readFileSync(path.join(root, filename), 'utf8')).toBe(before[filename]);
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('commits pending changes once and resumes the matching tag safely', () => {
        const makefile = read('Makefile');
        const script = read('scripts/prepare-release.sh');
        const skill = read('skills/prepare-figaro-release/SKILL.md');

        expect(makefile).toMatch(/^release: check-go check-node$/m);
        expect(makefile).toContain('RELEASE_BUMP_GOALS := $(filter major minor patch,$(MAKECMDGOALS))');
        expect(makefile).toContain('./scripts/prepare-release.sh --push "$(RELEASE_REQUEST)"');
        expect(makefile).toMatch(/^release-local: check-go check-node$/m);
        expect(makefile).toContain('./scripts/prepare-release.sh "$(RELEASE_REQUEST)"');
        for (const command of [
            'npm ci',
            'npm run vendor',
            'npm run lint',
            'npm run test:unit',
            'go vet . ./internal/... ./cmd/...',
            'go test . ./internal/... ./cmd/...',
            'go test -race . ./internal/... ./cmd/...',
            'npx playwright install chromium',
            'npm run test:pdf',
        ]) {
            expect(script).toContain(command);
        }
        expect(script).not.toContain('--with-deps');
        expect(script).toContain('git commit -m "chore(release): prepare ${tag}"');
        expect(script).toContain('git tag -a "$tag" -m "Figaro ${tag}"');
        expect(script).toContain('git tag --merged HEAD --sort=-v:refname');
        expect(script).toContain('Resolved %s release from %s to v%s.');
        expect(script).toContain('git add -A');
        expect(script).toContain('local tag ${tag} does not point to HEAD');
        expect(script).toContain('git push origin main');
        expect(script).toContain('git push origin "$tag"');
        expect(skill).toContain('make release patch');
        expect(skill).toContain('make release-local patch');
        expect(skill).toMatch(/all non-ignored\s+changes/);
        expect(skill).toContain('Never infer permission\n' +
            'to publish from “prepare”, “tag”, or “commit”.');
    });
});
