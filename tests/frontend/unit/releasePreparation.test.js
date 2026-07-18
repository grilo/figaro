import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import releaseMetadata from '../../../skills/prepare-figaro-release/scripts/releaseMetadata.cjs';

const repositoryRoot = path.resolve('.');
const metadataFiles = ['package.json', 'package-lock.json', 'wails.json', 'CHANGELOG.md'];
const read = filename => fs.readFileSync(path.join(repositoryRoot, filename), 'utf8');

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

    test('publishes only the release refs and keeps a local-only alternative', () => {
        const makefile = read('Makefile');
        const script = read('scripts/prepare-release.sh');
        const skill = read('skills/prepare-figaro-release/SKILL.md');

        expect(makefile).toMatch(/^release: check-go check-node$/m);
        expect(makefile).toContain('./scripts/prepare-release.sh --push "$(VERSION)"');
        expect(makefile).toMatch(/^release-local: check-go check-node$/m);
        expect(makefile).toContain('./scripts/prepare-release.sh "$(VERSION)"');
        for (const command of [
            'npm ci',
            'npm run vendor',
            'npm run lint',
            'npm run test:unit',
            'go vet . ./internal/... ./cmd/...',
            'go test . ./internal/... ./cmd/...',
            'go test -race . ./internal/... ./cmd/...',
            'npx playwright install --with-deps chromium',
            'npm run test:pdf',
        ]) {
            expect(script).toContain(command);
        }
        expect(script).toContain('git commit -m "chore(release): prepare ${tag}"');
        expect(script).toContain('git tag -a "$tag" -m "Figaro ${tag}"');
        expect(script).toContain('git push origin main');
        expect(script).toContain('git push origin "$tag"');
        expect(skill).toContain('make release VERSION=vMAJOR.MINOR.PATCH');
        expect(skill).toContain('make release-local VERSION=vMAJOR.MINOR.PATCH');
        expect(skill).toContain('It publishes only that release commit and tag');
        expect(skill).toContain('Never infer permission\n' +
            'to publish from “prepare”, “tag”, or “commit”.');
    });
});
