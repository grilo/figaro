import fs from 'node:fs';
import yaml from 'js-yaml';

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
        const unreleased = changelog.indexOf('## [Unreleased]');
        const release = changelog.search(/^## \[?\d+\.\d+\.\d+\]? - \d{4}-\d{2}-\d{2}$/m);

        expect(unreleased).toBeGreaterThan(-1);
        expect(release).toBeGreaterThan(unreleased);
        expect(changelog.slice(unreleased, release)).toMatch(/### (Added|Changed|Fixed)|_No changes yet\._/);
        expect(changelog).toMatch(new RegExp(`^## \\[?${version.replaceAll('.', '\\.')}\\]? - `, 'm'));
        expect(changelog).toContain('[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)');
        expect(changelog).toContain('[Unreleased]: https://github.com/grilo/figaro/compare/');
        expect(changelog.slice(release)).toContain('GNU General Public License version 3');
    });

    test('validates tag metadata and keeps release instructions in the contributor guide', () => {
        const workflow = read('.github/workflows/release.yml');
        const readme = read('README.md');
        const contributing = read('CONTRIBUTING.md');
        const productReference = read('docs/PROMPT.md');

        expect(workflow).toContain('Validate release metadata');
        expect(workflow).toContain('package-lock root package');
        expect(workflow).toContain('GPL-3.0-or-later');
        expect(workflow.match(/node scripts\/extract-release-notes\.mjs "\$GITHUB_REF_NAME" --output release-notes\.md/g)).toHaveLength(2);
        expect(workflow).toContain('gh release edit "$GITHUB_REF_NAME"');
        expect(workflow).toContain('--notes-file release-notes.md');
        expect(workflow).not.toContain('--generate-notes');
        expect(workflow.match(/cp README\.md CHANGELOG\.md LICENSE/g)).toHaveLength(2);
        expect(workflow).toContain('Copy-Item README.md, CHANGELOG.md, LICENSE');
        expect(readme).toContain('docs/images/figaro-editor.png');
        expect(productReference).toContain('images/figaro-editor.png');
        expect(fs.readFileSync('docs/images/figaro-editor.png').subarray(0, 8).toString('hex'))
            .toBe('89504e470d0a1a0a');
        expect(readme).not.toContain('make release');
        expect(readme).not.toContain('$prepare-figaro-release');
        expect(productReference).not.toContain('make release');
        expect(productReference).toContain('[CONTRIBUTING.md](../CONTRIBUTING.md)');
        expect(contributing).toContain('make release patch');
        expect(contributing).toContain('make release VERSION=vMAJOR.MINOR.PATCH');
        expect(contributing).toContain('make release-local patch');
        expect(contributing).toContain('$prepare-figaro-release');
    });

    test('retains Playwright diagnostics when CI or release browser verification fails', () => {
        const ciWorkflow = read('.github/workflows/test.yml');
        const releaseWorkflow = read('.github/workflows/release.yml');
        const playwrightConfig = read('playwright.config.js');

        for (const workflow of [ciWorkflow, releaseWorkflow]) {
            expect(workflow).toContain('name: Upload Playwright failure diagnostics');
            expect(workflow).toContain('if: failure()');
            expect(workflow).toContain('uses: actions/upload-artifact@v7');
            expect(workflow).toContain('playwright-report');
            expect(workflow).toContain('test-results');
            expect(workflow).toContain('if-no-files-found: warn');
            expect(workflow).toContain('retention-days: 14');
        }
        expect(playwrightConfig).toContain("['html', { outputFolder: 'playwright-report', open: 'never' }]");
        expect(playwrightConfig).toContain("screenshot: process.env.CI ? 'only-on-failure' : 'off'");
        expect(playwrightConfig).toContain("trace: process.env.CI ? 'retain-on-failure' : 'off'");
    });

    test('rebuilds production assets and gates coverage and platform contracts in automation', () => {
        const ciWorkflow = read('.github/workflows/test.yml');
        const releaseWorkflow = read('.github/workflows/release.yml');
        const manifest = JSON.parse(read('package.json'));
        const goCoverage = read('scripts/check-go-coverage.sh');

        expect(ciWorkflow.match(/run: \.\/scripts\/prepare-frontend\.sh/g)).toHaveLength(3);
        expect(releaseWorkflow.match(/run: \.\/scripts\/prepare-frontend\.sh/g)).toHaveLength(2);
        expect(ciWorkflow).toContain('npm run test:coverage');
        expect(releaseWorkflow).toContain('npm run test:coverage');
        expect(ciWorkflow).toContain('./scripts/check-go-coverage.sh');
        expect(releaseWorkflow).toContain('./scripts/check-go-coverage.sh');
        expect(ciWorkflow).toContain('os: [windows-latest, macos-latest]');
        expect(ciWorkflow).toMatch(/backend-platform:[\s\S]*?- run: go test \. \.\/internal\/\.\.\. \.\/cmd\/\.\.\./);
        expect(ciWorkflow).toContain('TestRenderChromiumPDFAgainstOptInBrowser');
        expect(releaseWorkflow).toContain('TestRenderChromiumPDFAgainstOptInBrowser');
        expect(manifest.scripts['test:pdf']).toContain('npm run build:app');
        expect(goCoverage).toContain('minimum="${FIGARO_GO_COVERAGE_MIN:-72}"');
        expect(goCoverage).toContain('go test -covermode=atomic -coverprofile="$profile" . ./internal/... ./cmd/...');
        expect(manifest.jest.coverageThreshold.global).toEqual({
            branches: 67,
            functions: 81,
            lines: 84,
            statements: 80,
        });
    });

    test('scopes the Ubuntu PDF sandbox override to the trusted fixture step only', () => {
        for (const filename of ['.github/workflows/test.yml', '.github/workflows/release.yml']) {
            const workflow = yaml.safeLoad(read(filename));
            expect(workflow.env?.FIGARO_BROWSER_PDF_ARGUMENTS).toBeUndefined();
            const overriddenSteps = [];
            for (const job of Object.values(workflow.jobs)) {
                expect(job.env?.FIGARO_BROWSER_PDF_ARGUMENTS).toBeUndefined();
                for (const step of job.steps) {
                    if (step.env?.FIGARO_BROWSER_PDF_ARGUMENTS) overriddenSteps.push(step);
                }
            }
            expect(overriddenSteps).toHaveLength(1);
            expect(overriddenSteps[0].name).toBe('Exercise the application Chromium PDF process');
            expect(overriddenSteps[0].env.FIGARO_BROWSER_PDF_ARGUMENTS).toBe('--no-sandbox');
            expect(overriddenSteps[0].run).toContain('TestRenderChromiumPDFAgainstOptInBrowser');
        }
    });

    test('requires every affected documentation surface to stay synchronized', () => {
        const instructions = read('AGENTS.md');
        const contributing = read('CONTRIBUTING.md');

        expect(instructions).toContain('## Keep all documentation synchronized');
        for (const path of ['README.md', 'docs/PROMPT.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'docs/TESTING.md', 'docs/LIVEPREVIEW.md', 'docs/PDF_STYLING.md']) {
            expect(instructions).toContain(`\`${path}\``);
        }
        expect(instructions).toContain('`.agents/skills/prepare-figaro-release/SKILL.md`');
        expect(contributing).toContain('Audit every affected document in the same change.');
    });
});
