import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import releaseMetadata from '../../../skills/prepare-figaro-release/scripts/releaseMetadata.cjs';

const repositoryRoot = path.resolve('.');
const metadataFiles = ['package.json', 'package-lock.json', 'wails.json', 'CHANGELOG.md'];

function makeReleaseFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-release-'));
    for (const filename of metadataFiles) {
        fs.copyFileSync(path.join(repositoryRoot, filename), path.join(root, filename));
    }
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
});
