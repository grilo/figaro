import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import releaseMetadata from '../../../.agents/skills/prepare-figaro-release/scripts/releaseMetadata.cjs';

const repositoryRoot = path.resolve('.');
const metadataFiles = ['package.json', 'package-lock.json', 'wails.json', 'CHANGELOG.md'];
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
    test.each([
        ['release-check', '--check '],
        ['release-local', ''],
        ['release', '--push '],
    ])('dispatches %s to its distinct release action despite Make directory diagnostics', (target, flag) => {
        const plan = execFileSync('make', ['--dry-run', '--print-directory', target, 'VERSION=v2.3.4'], {
            cwd: repositoryRoot,
            encoding: 'utf8',
        });
        const commands = plan.split('\n').filter(line => line.startsWith('./scripts/prepare-release.sh '));
        expect(commands).toEqual([`./scripts/prepare-release.sh ${flag}"v2.3.4"`]);
    });

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
            expect(changelog).toMatch(/^## \[Unreleased\]\n\n_No changes yet\._\n\n## \[2\.3\.4\] - 2030-04-05/m);
            expect(changelog).toMatch(/## \[2\.3\.4\] - 2030-04-05[\s\S]*### Added/);
            expect(changelog).toContain('[Unreleased]: https://github.com/grilo/figaro/compare/v2.3.4...HEAD');
            expect(changelog).toContain('[2.3.4]: https://github.com/grilo/figaro/compare/v1.0.0...v2.3.4');
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
            })).toThrow('Add a concise user-facing entry under "## [Unreleased]"');
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

});
