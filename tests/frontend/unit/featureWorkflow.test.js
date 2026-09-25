import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import workflow from '../../../scripts/feature-workflow.cjs';

const features = JSON.parse(fs.readFileSync(path.resolve('docs/feature-map.json'), 'utf8'));

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-feature-workflow-'));
    const write = (file, text) => {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
    };
    for (const file of ['scripts/feature-workflow.mjs', 'scripts/feature-workflow.cjs']) write(file, fs.readFileSync(path.resolve(file)));
    const map = [{
        id: 'sample', title: 'Sample feature', sources: ['source.js'], symbols: { 'source.js': ['value'] }, docs: ['docs/contract.md#sample'],
        tests: ['tests/frontend/sample.test.js'], extraChecks: ['Assess native effects.'],
    }];
    write('docs/feature-map.json', JSON.stringify(map));
    write('source.js', 'export const value = 1;');
    write('docs/contract.md', '# Sample\n');
    write('tests/frontend/sample.test.js', '// Fixture test entry');
    write('docs/FEATURE_INDEX.md', workflow.renderFeatureIndex(map));
    const run = (...args) => spawnSync(process.execPath, ['scripts/feature-workflow.mjs', ...args], {
        cwd: root, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.resolve('node_modules') },
    });
    return { root, write, run, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('feature index and focused verification workflow', () => {
    test('default discovery lists routes without loading the full source and documentation index', () => {
        const output = workflow.renderContextList(features);
        expect(output).toContain('backlinks: Backlinks and unlinked mentions');
        expect(output).toContain('raw-preview: Exact Markdown source preview');
        expect(output).not.toContain('frontend/js/');
        expect(output).not.toContain('docs/testing/');
        const f = fixture();
        try {
            expect(f.run('context').stdout.trim()).toBe('sample: Sample feature');
        } finally { f.cleanup(); }
    });

    test('a selected route prints each source path once, with symbols and scoped documentation', () => {
        const selected = workflow.selectFeatures(features, ['editor-links']);
        const output = workflow.renderContext(selected);
        expect(output).toContain('frontend/js/editor.js :: handleLinkClick, replaceMarkdownLinkTarget');
        expect(output).toContain('docs/PROMPT.md#45-link-click-behavior');
        expect(output).toContain('npm run test:focus -- editor-links');
        expect(output).not.toContain('](');
        expect(output).not.toContain('writingRuntime');
        for (const file of selected[0].sources) expect(output.split(file)).toHaveLength(2);
        const f = fixture();
        try {
            const result = f.run('context', 'sample');
            expect(result.status).toBe(0);
            expect(result.stdout).toContain('source.js :: value');
            expect(result.stdout).toContain('docs/contract.md#sample');
        } finally { f.cleanup(); }
    });

    test.each([
        ['backlinks', 'frontend/js/backlinks.js', 'tests/frontend/unit/backlinks.test.js'],
        ['graph', 'frontend/js/graphView.js', 'tests/frontend/unit/graphView.test.js'],
        ['outline', 'frontend/js/outline.js', 'tests/frontend/unit/outlinePanel.test.js'],
        ['raw-preview', 'frontend/js/rawTextPreview.js', 'tests/frontend/unit/rawTextPreview.test.js'],
        ['charts', 'frontend/js/vegaLiteChartEditor.js', 'tests/frontend/unit/vegaLiteChartEditor.test.js'],
        ['writing-retention', 'frontend/js/core/writingRetentionModel.js', 'tests/frontend/unit/writingRetentionModel.test.js'],
        ['writing-spelling', 'frontend/js/core/writingFootnoteModel.js', 'tests/frontend/unit/writingFootnoteModel.test.js'],
    ])('%s identifies its actual owner and regression test', (id, source, test) => {
        const [route] = workflow.selectFeatures(features, [id]);
        expect(route.sources).toContain(source);
        expect(workflow.focusedTests([route])).toContain(test);
        expect(route.docs.every(ref => ref.includes('#'))).toBe(true);
    });

    test('routes multiple features to explicit deduplicated tests with architecture coverage', () => {
        const selected = workflow.selectFeatures(features, ['editor-links', 'tabs', 'editor-links']);
        expect(selected.map(feature => feature.id)).toEqual(['editor-links', 'tabs']);
        const tests = workflow.focusedTests(selected);
        expect(tests).toContain('tests/frontend/unit/linkedNoteNavigation.test.js');
        expect(tests).toContain('tests/frontend/unit/tabManager.test.js');
        expect(tests).toContain('tests/frontend/unit/architecturePolicy.test.js');
        expect(tests).not.toContain('tests/frontend/unit/pdfPreview.test.js');
        expect(new Set(tests).size).toBe(tests.length);
    });

    test('empty and unknown selectors cannot silently run an unrelated suite', () => {
        expect(() => workflow.selectFeatures(features, [])).toThrow('Choose at least one');
        expect(() => workflow.selectFeatures(features, ['typo'])).toThrow('Unknown feature');
        expect(() => workflow.selectFeatures(features, ['editor'])).toThrow(/Did you mean: editor-links, editor-layout/);
        const result = spawnSync(process.execPath, ['scripts/feature-workflow.mjs', 'test', '--all'], { encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Unknown feature');
    });

    test('routes lead with owning documents and list history records only on request', () => {
        const route = { id: 'sample', title: 'Sample', sources: ['a.js'], docs: ['docs/PROMPT.md#x'],
            history: ['docs/benchmarks/run.md', 'docs/EDITOR_PERFORMANCE.md#y'], tests: ['tests/frontend/a.test.js'], extraChecks: ['None.'] };
        const brief = workflow.renderContext([route]);
        expect(brief).toContain('History: 2 records; add --history to list them.');
        expect(brief).not.toContain('docs/benchmarks/run.md');
        expect(workflow.renderContext([route], { history: true })).toContain('  docs/benchmarks/run.md');
        expect(() => workflow.validateFeatureMap([{ ...route, docs: ['docs/benchmarks/run.md'] }]))
            .toThrow('Move docs/benchmarks/run.md from docs to history: sample');
        expect(() => workflow.validateFeatureMap([{ ...route, docs: ['docs/EDITOR_PERFORMANCE.md'] }]))
            .toThrow('from docs to history');
        expect(() => workflow.validateFeatureMap([{ ...route, history: [] }])).toThrow('Invalid history');
        expect(features.every(feature => !feature.docs.some(workflow.isHistoryRecord))).toBe(true);
    });

    test('rejects duplicate ownership IDs, missing checks, traversal, and test globs', () => {
        expect(() => workflow.validateFeatureMap([features[0], features[0]])).toThrow('duplicate');
        expect(() => workflow.validateFeatureMap([{ ...features[0], sources: [...features[0].sources,
            'frontend/vendored/@replit/codemirror-indentation-markers/dist/index.js'] }])).not.toThrow();
        expect(() => workflow.validateFeatureMap([{ ...features[0], extraChecks: [] }])).toThrow('Missing extraChecks');
        expect(() => workflow.validateFeatureMap([{ ...features[0], sources: ['../outside.js'] }])).toThrow('Invalid repository reference');
        expect(() => workflow.validateFeatureMap([{ ...features[0], tests: ['tests/frontend/**/*.test.js'] }])).toThrow('Invalid repository reference');
    });

    test('tracked routes resolve to real files/headings and generated output is current', () => {
        const result = spawnSync(process.execPath, ['scripts/feature-workflow.mjs', 'check'], { encoding: 'utf8' });
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('Feature index verified');
    });

    test('the index checker rejects moved files, missing anchors, and stale output', () => {
        const f = fixture();
        try {
            expect(f.run('check').status).toBe(0);
            f.write('docs/contract.md', '# Renamed\n');
            expect(f.run('check').stderr).toContain('Missing heading');
            f.write('docs/contract.md', '# Sample\n');
            f.write('docs/FEATURE_INDEX.md', 'outdated');
            expect(f.run('check').stderr).toContain('Feature index is stale');
            expect(f.run('generate').status).toBe(0);
            fs.renameSync(path.join(f.root, 'source.js'), path.join(f.root, 'renamed.js'));
            expect(f.run('check').status).toBe(1);
        } finally { f.cleanup(); }
    });

    test('renamed source symbols invalidate both index checks and selected context', () => {
        const f = fixture();
        try {
            f.write('source.js', 'export const renamed = 1; // value was renamed\nconst example = "export const value = 1";');
            for (const args of [['check'], ['context', 'sample']]) {
                const result = f.run(...args);
                expect(result.status).toBe(1);
                expect(result.stderr).toContain('Missing source symbol: source.js :: value');
            }
        } finally { f.cleanup(); }
    });

    test('symbol discovery follows actual top-level declarations rather than comments, calls, or strings', () => {
        const names = workflow.declaredSymbols(`
            // function commented() {}
            export async function navigate() {}
            export const handler = () => {}, retry = () => {};
            const example = 'function quoted() {}';
            navigate();
            function outer() { function nested() {} }
        `);
        expect([...names].sort()).toEqual(['example', 'handler', 'navigate', 'outer', 'retry']);
        expect(() => workflow.validateFeatureMap([{ ...features[0], symbols: { 'unlisted.js': ['name'] } }])).toThrow('Invalid source symbols');
    });

    test('integrity failure stops execution and retains the full log', () => {
        const f = fixture();
        try {
            f.write('scripts/test-integrity.mjs', 'console.error("integrity failed"); process.exit(2);');
            f.write('node_modules/jest/bin/jest.js', 'console.log("JEST MUST NOT RUN");');
            const result = f.run('test', 'sample');
            expect(result.status).toBe(2);
            expect(result.stderr).toContain('integrity failed');
            const logPath = result.stdout.match(/Full log: (.+)/)[1];
            expect(fs.readFileSync(logPath, 'utf8')).toContain('integrity failed');
            expect(fs.readFileSync(logPath, 'utf8')).not.toContain('JEST MUST NOT RUN');
        } finally { f.cleanup(); }
    });

    test('the runner preserves Jest failure status and shows assertions without unrelated console noise', () => {
        const f = fixture();
        try {
            f.write('scripts/test-integrity.mjs', 'console.log("integrity passed");');
            f.write('node_modules/jest/bin/jest.js', `
                const fs = require('node:fs');
                const reportPath = process.argv[process.argv.indexOf('--outputFile') + 1];
                fs.writeFileSync(reportPath, JSON.stringify({ testResults: [{ status: 'failed', assertionResults: [
                    { status: 'failed', fullName: 'sample preserves text', failureMessages: ['expected original text'] }
                ] }] }));
                console.error('unrelated console noise'); process.exit(1);
            `);
            const result = f.run('test', 'sample');
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('sample preserves text');
            expect(result.stderr).toContain('expected original text');
            expect(result.stderr).not.toContain('unrelated console noise');
            expect(fs.readFileSync(result.stdout.match(/Full log: (.+)/)[1], 'utf8')).toContain('unrelated console noise');
        } finally { f.cleanup(); }
    });

    test('successful focused runs summarize counts and retain full output', () => {
        const f = fixture();
        try {
            f.write('scripts/test-integrity.mjs', 'console.log("integrity passed");');
            f.write('node_modules/jest/bin/jest.js', `
                const fs = require('node:fs');
                fs.writeFileSync(process.argv[process.argv.indexOf('--outputFile') + 1], JSON.stringify({
                    numPassedTestSuites: 2, numPassedTests: 7, numPendingTests: 0
                }));
                console.log('complete test output');
            `);
            const result = f.run('test', 'sample');
            expect(result.status).toBe(0);
            expect(result.stdout).toContain('2 suites, 7 tests passed; 0 skipped.');
            expect(result.stdout).toContain('Assess native effects.');
            expect(fs.readFileSync(result.stdout.match(/Full log: (.+)/)[1], 'utf8')).toContain('complete test output');
        } finally { f.cleanup(); }
    });

    test('the root explicitly routes specialized instructions and requires structural index maintenance', () => {
        const instructions = fs.readFileSync(path.resolve('AGENTS.md'), 'utf8');
        for (const file of ['editor', 'testing', 'ui']) {
            expect(instructions).toContain(`.agents/guidance/${file}.md`);
            expect(fs.readFileSync(path.resolve(`.agents/guidance/${file}.md`), 'utf8')).toContain('requirements');
        }
        expect(instructions).toContain('when ownership changes even if its old path still exists');
        expect(instructions).toContain('npm run context:check');
    });
});
