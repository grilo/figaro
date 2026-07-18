import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

describe('release metadata and documentation', () => {
    test('keeps the release version and GPL license consistent across package metadata', () => {
        const pkg = JSON.parse(read('package.json'));
        const lock = JSON.parse(read('package-lock.json'));
        const wails = JSON.parse(read('wails.json'));
        const license = read('LICENSE');

        expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(lock.version).toBe(pkg.version);
        expect(lock.packages[''].version).toBe(pkg.version);
        expect(wails.info.productVersion).toBe(pkg.version);
        expect(pkg.license).toBe('GPL-3.0-or-later');
        expect(lock.packages[''].license).toBe('GPL-3.0-or-later');
        expect(wails.info.comments).toContain('GPL-3.0-or-later');
        expect(wails.info.copyright).not.toContain('MIT');
        expect(license).toContain('GNU GENERAL PUBLIC LICENSE');
        expect(license).toContain('Version 3, 29 June 2007');
        expect(license).toContain('15. Disclaimer of Warranty.');
    });

    test('retains a valid Unreleased section above the current release', () => {
        const changelog = read('CHANGELOG.md');
        const version = JSON.parse(read('package.json')).version;
        const unreleased = changelog.indexOf('## Unreleased');
        const release = changelog.search(/^## \d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/m);

        expect(unreleased).toBeGreaterThan(-1);
        expect(release).toBeGreaterThan(unreleased);
        expect(changelog.slice(unreleased, release)).toMatch(/### (Added|Changed|Fixed)|_No changes yet\._/);
        expect(changelog).toContain(`## ${version} - `);
        expect(changelog.slice(release)).toContain('GNU General Public License version 3');
    });

    test('validates tag metadata and ships the license and changelog in every binary archive', () => {
        const workflow = read('.github/workflows/release.yml');
        const readme = read('README.md');

        expect(workflow).toContain('Validate release metadata');
        expect(workflow).toContain('package-lock root package');
        expect(workflow).toContain('GPL-3.0-or-later');
        expect(workflow.match(/cp README\.md CHANGELOG\.md LICENSE/g)).toHaveLength(2);
        expect(workflow).toContain('Copy-Item README.md, CHANGELOG.md, LICENSE');
        expect(readme).toContain('git tag -a vMAJOR.MINOR.PATCH -m "Figaro vMAJOR.MINOR.PATCH"');
        expect(readme).toContain('git push origin vMAJOR.MINOR.PATCH');
        expect(readme).toContain('$prepare-figaro-release');
    });

    test('requires every affected documentation surface to stay synchronized', () => {
        const instructions = read('AGENTS.md');
        const contributing = read('CONTRIBUTING.md');

        expect(instructions).toContain('## Keep all documentation synchronized');
        for (const path of ['README.md', 'docs/PROMPT.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'docs/TESTING.md', 'docs/LIVEPREVIEW.md', 'docs/PDF_STYLING.md']) {
            expect(instructions).toContain(`\`${path}\``);
        }
        expect(instructions).toContain('`skills/prepare-figaro-release/SKILL.md`');
        expect(contributing).toContain('Audit every affected document in the same change.');
    });
});
